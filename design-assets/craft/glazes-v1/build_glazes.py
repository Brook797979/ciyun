"""Rebuild six fixed-view glazes from saved v2 layers; no image generation service."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[2]
SOURCE = ROOT.parent / 'two-vessel-v2'
SIZE = (1200, 675)
RUNTIME_SIZE = (800, 450)
CARD_SIZE = (384, 360)
CARD_CROP = (480, 175, 702, 383)
SPECULAR_SCALE = 1.25
JPEG_OPTIONS = dict(quality=84, subsampling=2, optimize=True, progressive=True)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_float(path, mode):
    with Image.open(path) as source:
        return np.asarray(source.convert(mode), dtype=np.float32) / 255


def u8(array):
    return np.uint8(np.clip(array, 0, 1) * 255 + .5)


def read_catalogs():
    # Node only reads the actual runtime catalogs. No duplicate color palette.
    script = "process.stdout.write(JSON.stringify({glazes:require('./data/glazes'),patterns:require('./data/patterns')}))"
    result = subprocess.run(['node', '-e', script], cwd=PROJECT, check=True,
                            stdout=subprocess.PIPE, encoding='utf-8')
    return json.loads(result.stdout)


def composite(base, mask, diffuse, highlight, pigment, glaze_rgb):
    coverage = np.divide(pigment[..., 3], mask, out=np.zeros_like(mask), where=mask > 0)
    coverage = np.clip(coverage, 0, 1)
    albedo = glaze_rgb * (1 - coverage[..., None]) + pigment[..., :3] * coverage[..., None]
    porcelain = albedo * diffuse * (1 - highlight[..., None]) + highlight[..., None]
    return base * (1 - mask[..., None]) + porcelain * mask[..., None]


def glaze_rgb(glaze):
    return np.array([int(glaze['color'][offset:offset + 2], 16) for offset in (1, 3, 5)]) / 255


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', size)


def write_review(review, glazes, configs, rendered, cards):
    board = Image.new('RGB', (1960, 1350), '#f2eee6')
    draw = ImageDraw.Draw(board)
    draw.text((40, 24), '第三步 · 六种釉色', fill='#183b50', font=font(40, True))
    draw.text((42, 86), '同一莲纹与固定光照，分别观察梅瓶、玉壶春瓶和纯釉材质局部', fill='#766c5c', font=font(22))
    for column, glaze in enumerate(glazes):
        x = 36 + column * 320
        draw.text((x + 8, 140), glaze['name'], fill='#183b50', font=font(28, True))
        draw.text((x + 8, 183), glaze['description'], fill='#766c5c', font=font(17))
        for row, (shape, config) in enumerate(configs.items()):
            tile = rendered[(shape, 'lotus', glaze['id'])].crop(config['crop'])
            tile.thumbnail((304, 420), Image.Resampling.LANCZOS)
            top = 226 + row * 446
            board.paste(tile, (x + (304 - tile.width) // 2, top))
        swatch = cards[glaze['id']].copy()
        swatch.thumbnail((280, 172), Image.Resampling.LANCZOS)
        board.paste(swatch, (x + (304 - swatch.width) // 2, 1125))
    draw.text((43, 1310), '离线素材校验图 · 原场景构图保留于小程序全景资源 · 非微信截图 / 非真实烧制模拟', fill='#766c5c', font=font(17))
    board.save(review / '第三步-六种釉色效果.jpg', quality=93, subsampling=0, optimize=True)

    # A dense second board makes all 72 combinations available to visual QA.
    atlas = Image.new('RGB', (1800, 3120), '#f2eee6')
    drawing = ImageDraw.Draw(atlas)
    drawing.text((28, 20), '72种器型 × 纹样 × 釉色组合检查', fill='#183b50', font=font(32, True))
    rows = [(shape, pattern) for shape in configs for pattern in ('lotus', 'cloud', 'flower-bird', 'landscape', 'scroll-lotus', 'beast')]
    for row, (shape, pattern) in enumerate(rows):
        for column, glaze in enumerate(glazes):
            tile = rendered[(shape, pattern, glaze['id'])].crop(configs[shape]['crop'])
            tile.thumbnail((230, 220), Image.Resampling.LANCZOS)
            x, y = column * 300, 82 + row * 250
            atlas.paste(tile, (x + (300 - tile.width) // 2, y))
            drawing.text((x + 12, y + 222), f'{shape} / {pattern} / {glaze["shortName"]}', fill='#183b50', font=font(12))
    atlas.save(ROOT / 'combinations-review.jpg', quality=90, subsampling=0, optimize=True)


def build(review, runtime):
    catalogs = read_catalogs()
    glazes, patterns = catalogs['glazes'], catalogs['patterns']
    configs = json.loads((SOURCE / 'geometry.json').read_text(encoding='utf-8'))
    previous_manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    for folder in (review, runtime / 'cards'):
        folder.mkdir(parents=True, exist_ok=True)
    manifest = {
        'version': 1,
        'size': list(SIZE), 'runtimeSize': list(RUNTIME_SIZE), 'cardSize': list(CARD_SIZE),
        'runtimeEncoding': 'JPEG quality 84, 4:2:0, optimized progressive',
        'colorSource': 'data/glazes.js', 'glazes': glazes,
        'sourceDirectory': 'design-assets/craft/two-vessel-v2',
        'specularScale': SPECULAR_SCALE,
        'lightingMethod': 'Same saved diffuse and specular layers; scaled specular intensity without moving support',
        'combinationCount': len(configs) * len(patterns) * len(glazes),
        'generatedPreviewCount': 0, 'materialCardCount': 0,
        'sources': {}, 'combinations': [], 'materialCards': [],
        'validation': {
            'backgroundMaxChange255': 0,
            'pigmentCoverageMaxChange255': 0,
            'highlightSupportChangedPixels': 0,
            'whiteMasterReconstructionMaxError255': 0,
            'glazeBaseAlphaMaxDifference255': 0,
            'runtimeBackgroundMaxChangeBeyond32px255': 0,
            'checkedColoredCombinations': 0,
            'cardBackgroundPixels': 0
        }
    }
    for pattern in patterns:
        suffix = pattern['id'].removeprefix('pattern-')
        source = SOURCE / 'inputs' / f'{suffix}-source.png'
        assert sha256(source) == previous_manifest['sources'][suffix]['sha256']
        manifest['sources'][str(source.relative_to(PROJECT)).replace('\\', '/')] = sha256(source)
    rendered, cards = {}, {}
    for shape, config in configs.items():
        layers = SOURCE / shape / 'layers'
        photo = SOURCE / 'inputs' / f'{shape}-white.jpg'
        assert sha256(photo) == previous_manifest['shapes'][shape]['photoSHA256']
        base = read_float(photo, 'RGB')
        assert base.shape == (SIZE[1], SIZE[0], 3)
        mask = read_float(layers / 'body-mask.png', 'L')
        glaze_layer = read_float(layers / 'glaze-base.png', 'RGBA')
        # v2 saved L-mask as float32 and RGBA through a float64 stack: a few
        # half-step edge values differ by one 8-bit code. Keep body-mask authoritative.
        alpha_difference = int(np.max(np.abs(u8(mask).astype(int) - u8(glaze_layer[..., 3]).astype(int))))
        assert alpha_difference <= 1
        manifest['validation']['glazeBaseAlphaMaxDifference255'] = max(alpha_difference, manifest['validation']['glazeBaseAlphaMaxDifference255'])
        diffuse = read_float(layers / 'diffuse-shading.png', 'RGBA')[..., :3]
        specular = read_float(layers / 'specular-highlights.png', 'RGBA')[..., 3]
        highlight = np.clip(specular * SPECULAR_SCALE, 0, 1)
        assert np.count_nonzero((highlight > 0) != (specular > 0)) == 0
        assert np.max(highlight[mask == 0]) == 0
        for source in [photo, layers / 'body-mask.png', layers / 'glaze-base.png',
                       layers / 'diffuse-shading.png', layers / 'specular-highlights.png']:
            manifest['sources'][str(source.relative_to(PROJECT)).replace('\\', '/')] = sha256(source)
        # Compare JPEG backgrounds beyond resize/chroma/block influence.
        base_runtime = Image.fromarray(u8(base)).resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
        base_encoded = io.BytesIO()
        base_runtime.save(base_encoded, format='JPEG', **JPEG_OPTIONS)
        base_decoded = np.asarray(Image.open(io.BytesIO(base_encoded.getvalue())), dtype=int)
        expanded = Image.fromarray(u8(mask)).resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).filter(ImageFilter.MaxFilter(65))
        far_background = np.asarray(expanded) == 0
        (runtime / shape).mkdir(parents=True, exist_ok=True)
        (ROOT / shape / 'masters').mkdir(parents=True, exist_ok=True)
        for pattern in patterns:
            pattern_suffix = pattern['id'].removeprefix('pattern-')
            pigment_file = layers / f'{pattern_suffix}-wrapped.png'
            pigment = read_float(pigment_file, 'RGBA')
            original_coverage = pigment[..., 3].copy()
            assert np.max(original_coverage[mask == 0]) == 0
            original_white_file = SOURCE / shape / 'masters' / f'{pattern_suffix}-white.png'
            original_white = Image.open(original_white_file).convert('RGB')
            reconstructed = Image.fromarray(u8(composite(base, mask, diffuse, specular, pigment, np.ones(3))))
            white_error = int(np.max(np.abs(np.asarray(reconstructed, dtype=int) - np.asarray(original_white, dtype=int))))
            assert white_error <= 1, (shape, pattern_suffix, white_error)
            manifest['validation']['whiteMasterReconstructionMaxError255'] = max(white_error, manifest['validation']['whiteMasterReconstructionMaxError255'])
            for source in (pigment_file, original_white_file):
                manifest['sources'][str(source.relative_to(PROJECT)).replace('\\', '/')] = sha256(source)
            for glaze in glazes:
                suffix = glaze['id'].removeprefix('glaze-')
                if suffix == 'white':
                    rendered[(shape, pattern_suffix, glaze['id'])] = original_white
                    preview = pattern['previewImages'][shape]
                    assert (PROJECT / preview.lstrip('/')).exists()
                    manifest['combinations'].append({'shape': shape, 'patternId': pattern['id'], 'glazeId': glaze['id'], 'image': preview, 'reused': True})
                    continue
                result = Image.fromarray(u8(composite(base, mask, diffuse, highlight, pigment, glaze_rgb(glaze))))
                master = ROOT / shape / 'masters' / f'{pattern_suffix}-{suffix}.png'
                result.save(master, optimize=True)
                # Validate exported masters, not just floating-point arrays.
                result = Image.open(master).convert('RGB')
                outside_change = int(np.max(np.abs(np.asarray(result, dtype=int)[mask == 0] - u8(base).astype(int)[mask == 0])))
                coverage_change = int(np.max(np.abs(pigment[..., 3] - original_coverage)) * 255)
                assert outside_change == 0 and coverage_change == 0
                output = runtime / shape / f'{pattern_suffix}-{suffix}.jpg'
                result.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).save(output, **JPEG_OPTIONS)
                decoded = np.asarray(Image.open(output).convert('RGB'), dtype=int)
                runtime_background_error = int(np.max(np.abs(decoded[far_background] - base_decoded[far_background])))
                assert runtime_background_error == 0, (shape, pattern_suffix, suffix, runtime_background_error)
                manifest['combinations'].append({
                    'shape': shape, 'patternId': pattern['id'], 'glazeId': glaze['id'],
                    'image': f'/assets/craft/glazes-v1/{shape}/{output.name}',
                    'master': str(master.relative_to(ROOT)).replace('\\', '/'),
                    'backgroundMaxChange255': outside_change, 'runtimeBackgroundMaxChangeBeyond32px255': runtime_background_error,
                    'bytes': output.stat().st_size, 'sha256': sha256(output)
                })
                manifest['generatedPreviewCount'] += 1
                manifest['validation']['checkedColoredCombinations'] += 1
                rendered[(shape, pattern_suffix, glaze['id'])] = result
        if shape == 'meiping':
            x0, y0, x1, y1 = CARD_CROP
            assert np.min(mask[y0:y1, x0:x1]) == 1
            no_pattern = np.zeros((*mask.shape, 4), dtype=np.float32)
            for glaze in glazes:
                h = specular if glaze['id'] == 'glaze-white' else highlight
                bare = Image.fromarray(u8(composite(base, mask, diffuse, h, no_pattern, glaze_rgb(glaze))))
                card = bare.crop(CARD_CROP).resize(CARD_SIZE, Image.Resampling.LANCZOS)
                output = runtime / 'cards' / f'{glaze["id"].removeprefix("glaze-")}.jpg'
                card.save(output, **JPEG_OPTIONS)
                cards[glaze['id']] = Image.open(output).convert('RGB')
                manifest['materialCardCount'] += 1
                manifest['materialCards'].append({'glazeId': glaze['id'], 'image': glaze['image'], 'bytes': output.stat().st_size, 'sha256': sha256(output)})
    write_review(review, glazes, configs, rendered, cards)
    manifest['runtimeBytes'] = sum(p.stat().st_size for p in runtime.rglob('*.jpg'))
    assert manifest['generatedPreviewCount'] == 60 and manifest['materialCardCount'] == 6
    assert manifest['runtimeBytes'] < 5 * 1024 * 1024
    encoded = json.dumps(manifest, ensure_ascii=False, indent=2)
    (ROOT / 'manifest.json').write_text(encoded, encoding='utf-8')
    (review / '第三步-六种釉色效果.json').write_text(encoded, encoding='utf-8')
    print(json.dumps({key: manifest[key] for key in ('combinationCount', 'generatedPreviewCount', 'materialCardCount', 'runtimeBytes', 'validation')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--review-dir', type=Path, required=True)
    parser.add_argument('--runtime-dir', type=Path, default=PROJECT / 'assets/craft/glazes-v1')
    args = parser.parse_args()
    build(args.review_dir, args.runtime_dir)
