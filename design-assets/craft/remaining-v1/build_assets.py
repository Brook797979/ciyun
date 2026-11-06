"""Complete four fixed-view vessels using the existing textures and glaze recipe."""
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location
import argparse
import hashlib
import io
import json
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from vessel_surfaces import original, surface_masks

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[2]
SOURCE = ROOT.parent / 'two-vessel-v2'
spec = spec_from_file_location('original_glaze_builder', ROOT.parent / 'glazes-v1/build_glazes.py')
glaze_builder = module_from_spec(spec)
spec.loader.exec_module(glaze_builder)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def catalogs(node):
    code = "process.stdout.write(JSON.stringify({glazes:require('./data/glazes'),patterns:require('./data/patterns')}))"
    result = subprocess.run([node, '-e', code], cwd=PROJECT, check=True, capture_output=True, encoding='utf-8')
    return json.loads(result.stdout)


def jpeg_reference(base, mask, size, options):
    resized = Image.fromarray(original.u8(base)).resize(size, Image.Resampling.LANCZOS)
    encoded = io.BytesIO()
    resized.save(encoded, format='JPEG', **options)
    pixels = np.asarray(Image.open(io.BytesIO(encoded.getvalue())), dtype=int)
    expanded = Image.fromarray(original.u8(mask)).resize(size, Image.Resampling.LANCZOS).filter(ImageFilter.MaxFilter(65))
    return pixels, np.asarray(expanded) == 0


def review_sheet(review, shape, config, patterns, glazes, thumbnails):
    sheet = Image.new('RGB', (1800, 1620), '#f2eee6')
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 30)
    label_font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
    draw.text((26, 16), f"{config['name']}  六种纹样 × 六种釉色  固定视角预览", font=title_font, fill='#183b50')
    for column, glaze in enumerate(glazes):
        draw.text((column * 300 + 36, 64), glaze['name'], font=label_font, fill='#183b50')
    for row, pattern in enumerate(patterns):
        for column, glaze in enumerate(glazes):
            tile = thumbnails[(pattern['id'], glaze['id'])]
            x, y = column * 300, 100 + row * 250
            sheet.paste(tile, (x + (300 - tile.width) // 2, y + (215 - tile.height) // 2))
            draw.text((x + 22, y + 218), pattern['name'], font=label_font, fill='#183b50')
    sheet.save(review / f'{shape}-36-combinations.jpg', quality=94, subsampling=0)


def build(review, node):
    review.mkdir(parents=True, exist_ok=True)
    config_path = ROOT / 'geometry.json'
    configs = json.loads(config_path.read_text(encoding='utf-8'))
    assert set(configs) == {'vase', 'bowl', 'garlic', 'double-ear'}
    data = catalogs(node)
    patterns, glazes = data['patterns'], data['glazes']
    expected_shapes = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    textures = {}
    source_hashes = {}
    for pattern in patterns:
        suffix = pattern['id'].removeprefix('pattern-')
        source = SOURCE / 'inputs' / f'{suffix}-source.png'
        assert sha256(source) == expected_shapes['sources'][suffix]['sha256']
        texture = SOURCE / 'textures' / f'{suffix}-pigment.png'
        textures[pattern['id']] = original.read_float(texture, 'RGBA')[..., 3]
        source_hashes[texture.relative_to(PROJECT).as_posix()] = sha256(texture)
    manifest = {
        'version': 1, 'size': [1200, 675],
        'method': 'Existing fixed-view curve mapping, diffuse/specular and six-glaze composition',
        'geometrySHA256': sha256(config_path), 'sources': source_hashes,
        'shapes': {}, 'combinations': [],
        'combinationCount': len(configs) * len(patterns) * len(glazes),
        'whitePreviewCount': 0, 'coloredPreviewCount': 0,
        'validation': {'backgroundMaxChange255': 0, 'whiteReconstructionMaxError255': 0,
                       'runtimeBackgroundMaxChangeBeyond32px255': 0},
    }
    for shape, config in configs.items():
        photo = PROJECT / 'assets/shapes' / f'{shape}.jpg'
        with Image.open(photo) as source:
            assert source.size == original.SIZE
            base = np.asarray(source.convert('RGB'), dtype=np.float32) / 255
        mask, paint, left, right = surface_masks(base, config)
        diffuse, specular = original.lighting(base, mask)
        layers = ROOT / shape / 'layers'
        layers.mkdir(parents=True, exist_ok=True)
        Image.fromarray(original.u8(mask)).save(layers / 'body-mask.png')
        Image.fromarray(original.u8(paint)).save(layers / 'pattern-mask.png')
        original.save_rgba(diffuse, mask, layers / 'diffuse-shading.png')
        original.save_rgba(np.ones(3), specular, layers / 'specular-highlights.png')
        # Quantized, exported layers are used for all delivered output.
        saved_mask = original.read_float(layers / 'body-mask.png', 'L')
        diffuse = original.read_float(layers / 'diffuse-shading.png', 'RGBA')[..., :3]
        specular = original.read_float(layers / 'specular-highlights.png', 'RGBA')[..., 3]
        empty = np.zeros((*mask.shape, 4), dtype=np.float32)
        reconstruction = glaze_builder.composite(base, saved_mask, diffuse, specular, empty, np.ones(3))
        reconstruction_error = float(np.max(np.abs(reconstruction - base)) * 255)
        assert reconstruction_error <= 1.1, (shape, reconstruction_error)
        manifest['validation']['whiteReconstructionMaxError255'] = max(
            reconstruction_error, manifest['validation']['whiteReconstructionMaxError255'])
        references = {}
        white_options = dict(quality=88, subsampling=1, optimize=True)
        references['white'] = jpeg_reference(base, saved_mask, original.RUNTIME_SIZE, white_options)
        references['color'] = jpeg_reference(base, saved_mask, glaze_builder.RUNTIME_SIZE, glaze_builder.JPEG_OPTIONS)
        manifest['sources'][photo.relative_to(PROJECT).as_posix()] = sha256(photo)
        manifest['shapes'][shape] = {'name': config['name'], 'crop': config['crop']}
        thumbnails = {}
        for pattern in patterns:
            suffix = pattern['id'].removeprefix('pattern-')
            alpha, _ = original.wrap(textures[pattern['id']], paint, left, right, config)
            original.save_rgba(original.PIGMENT, np.minimum(alpha, mask), layers / f'{suffix}-wrapped.png')
            pigment = original.read_float(layers / f'{suffix}-wrapped.png', 'RGBA')
            assert np.max(pigment[..., 3][saved_mask == 0]) == 0
            for glaze in glazes:
                white = glaze['id'] == 'glaze-white'
                highlight = specular if white else np.clip(specular * glaze_builder.SPECULAR_SCALE, 0, 1)
                pixels = original.u8(glaze_builder.composite(
                    base, saved_mask, diffuse, highlight, pigment, glaze_builder.glaze_rgb(glaze)))
                outside = int(np.max(np.abs(pixels.astype(int)[saved_mask == 0] - original.u8(base).astype(int)[saved_mask == 0])))
                assert outside == 0, (shape, pattern['id'], glaze['id'], outside)
                if white:
                    relative = f'assets/craft/two-vessel-v2/{shape}/{suffix}-preview.jpg'
                    size, options, kind = original.RUNTIME_SIZE, white_options, 'white'
                    manifest['whitePreviewCount'] += 1
                else:
                    color = glaze['id'].removeprefix('glaze-')
                    relative = f'assets/craft/glazes-v1/{shape}/{suffix}-{color}.jpg'
                    size, options, kind = glaze_builder.RUNTIME_SIZE, glaze_builder.JPEG_OPTIONS, 'color'
                    manifest['coloredPreviewCount'] += 1
                output = PROJECT / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                image = Image.fromarray(pixels)
                image.resize(size, Image.Resampling.LANCZOS).save(output, **options)
                with Image.open(output) as encoded:
                    decoded = np.asarray(encoded.convert('RGB'), dtype=int)
                background, far = references[kind]
                jpeg_error = int(np.max(np.abs(decoded[far] - background[far])))
                assert jpeg_error == 0, (shape, suffix, glaze['id'], jpeg_error)
                thumbnail = image.crop(config['crop'])
                thumbnail.thumbnail((278, 208), Image.Resampling.LANCZOS)
                thumbnails[(pattern['id'], glaze['id'])] = thumbnail
                manifest['combinations'].append({
                    'shape': shape, 'patternId': pattern['id'], 'glazeId': glaze['id'],
                    'image': '/' + relative, 'bytes': output.stat().st_size, 'sha256': sha256(output),
                    'backgroundMaxChange255': outside, 'runtimeBackgroundMaxChangeBeyond32px255': jpeg_error,
                })
        review_sheet(review, shape, config, patterns, glazes, thumbnails)
    assert manifest['whitePreviewCount'] == 24 and manifest['coloredPreviewCount'] == 120
    assert len(manifest['combinations']) == manifest['combinationCount'] == 144
    manifest['runtimeBytes'] = sum(item['bytes'] for item in manifest['combinations'])
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (review / 'build-report.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: manifest[key] for key in ('combinationCount', 'whitePreviewCount', 'coloredPreviewCount', 'runtimeBytes', 'validation')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--review-dir', type=Path, required=True)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    build(args.review_dir, args.node)
