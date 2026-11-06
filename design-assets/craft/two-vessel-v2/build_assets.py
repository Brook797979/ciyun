"""Build fixed-view cobalt ceramics from supplied artwork. Pillow + NumPy only."""
from pathlib import Path
import argparse
import hashlib
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SIZE = (1200, 675)
RUNTIME_SIZE = (960, 540)
PIGMENT = np.array([21, 57, 106], dtype=np.float32) / 255
PATTERNS = {
    'lotus': ('青花莲纹', '69f799a9-bfe3-4b51-903b-582ab46d4e7b.png'),
    'cloud': ('祥云纹', 'f4e0425e-a92a-49dd-a09f-fa41a7e4da96.png'),
    'flower-bird': ('花鸟纹', '3e836b71-8d58-4c51-b6f1-28f02b259f4b.png'),
    'landscape': ('山水纹', '42bdf596-490f-40c9-9c3c-a2b02303ed68.png'),
    'scroll-lotus': ('缠枝莲纹', 'cdfbe6b8-e8c2-45d4-98e1-3f7332de0124.png'),
    'beast': ('瑞兽纹', '8ee4a5fc-8a29-44d3-a73c-55a351420af2.png')
}


def u8(array):
    return np.uint8(np.clip(array, 0, 1) * 255 + .5)


def save_rgba(rgb, alpha, path):
    rgb = np.broadcast_to(rgb, (*alpha.shape, 3))
    Image.fromarray(u8(np.dstack((rgb, alpha)))).save(path)


def read_float(path, mode):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float32) / 255


def geometry(base, config):
    """Refine traced sides against the porcelain edge within a bounded corridor."""
    h, w = base.shape[:2]
    points = np.array(config['outline'])
    yy = np.arange(h)
    left = np.interp(yy, points[:, 0], points[:, 1])
    right = np.interp(yy, points[:, 0], points[:, 2])
    top, bottom = points[0, 0], points[-1, 0]
    for y in range(top + 4, bottom - 7):
        # Only examine a narrow corridor around each traced edge. Interior warm
        # reflections are material shading, never evidence of a silhouette edge.
        blue = np.convolve(base[y, :, 2], np.ones(3) / 3, mode='same')
        gradient = np.diff(blue)
        for boundary, direction in ((left, 1), (right, -1)):
            lo, hi = max(0, int(boundary[y]) - 8), min(w - 1, int(boundary[y]) + 9)
            scores = gradient[lo:hi] * direction
            strongest = int(np.argmax(scores))
            if scores[strongest] > .025:
                boundary[y] = lo + strongest + .5 + direction * .35
    xx = np.arange(w)[None, :]
    mask = np.clip(np.minimum(xx - left[:, None], right[:, None] - xx) + .5, 0, 1)
    mask[:top] = 0
    mask[bottom + 1:] = 0
    for y in (top, bottom):
        center, radius = (left[y] + right[y]) / 2, (right[y] - left[y]) / 2
        mask[y] *= np.clip((1 - ((xx[0] - center) / radius) ** 2) * 2, 0, 1)
    return mask.astype(np.float32), left, right


def extract_coverage(name, layers):
    source = ROOT / 'inputs' / f'{name}-source.png'
    rgba = read_float(source, 'RGBA')
    # Cobalt density follows tonal detail, while white artwork becomes bare glaze.
    luminance = rgba[..., :3] @ np.array([.2126, .7152, .0722])
    coverage = np.clip((1 - luminance - .035) / .84, 0, 1) ** .9
    coverage *= rgba[..., 3]
    save_rgba(PIGMENT, coverage, layers / f'{name}-pigment.png')
    return coverage


def sample_bilinear(texture, u, v):
    h, w = texture.shape
    inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    px, py = np.clip(u * (w - 1), 0, w - 1.001), np.clip(v * (h - 1), 0, h - 1.001)
    x, y = px.astype(int), py.astype(int)
    fx, fy = px - x, py - y
    sampled = (texture[y, x] * (1 - fx) * (1 - fy) + texture[y, x + 1] * fx * (1 - fy)
               + texture[y + 1, x] * (1 - fx) * fy + texture[y + 1, x + 1] * fx * fy)
    return sampled * inside


def wrap(texture, mask, left, right, config):
    yy, xx = np.indices(mask.shape)
    center, radius = (left + right) / 2, np.maximum((right - left) / 2, 1)
    xn = np.clip((xx - center[:, None]) / radius[:, None], -1, 1)
    # Each row follows the actual vessel profile; the sides compress, never fade.
    u = np.arcsin(xn) / math.pi + .5
    top, bottom = config['bodyTop'], config['bodyBottom']
    v = (yy - top + config['bend'] * xn ** 2) / (bottom - top)
    coverage = sample_bilinear(texture, u, v) * .9
    bands = np.zeros_like(coverage)
    for line_y, thickness, strength in config['bands']:
        curve = line_y + 2.3 * xn ** 2
        bands = np.maximum(bands, np.clip(thickness + .6 - np.abs(yy - curve), 0, 1) * strength)
    return (np.maximum(coverage, bands) * mask).astype(np.float32), xn


def lighting(base, mask):
    lum = base.mean(axis=2)
    blur = np.asarray(Image.fromarray(u8(lum)).filter(ImageFilter.GaussianBlur(15)), dtype=np.float32) / 255
    specular = np.minimum(np.clip((lum - blur - .004) * 2.4, 0, .55), base.min(axis=2) * .7) * mask
    diffuse = np.clip((base - specular[..., None]) / np.maximum(1 - specular[..., None], .01), 0, 1)
    return diffuse, specular


def composite(base, mask, diffuse, specular, pigment_alpha, glaze):
    coverage = np.divide(pigment_alpha, mask, out=np.zeros_like(mask), where=mask > 0)
    coverage = np.clip(coverage, 0, 1)
    albedo = np.array(glaze) * (1 - coverage[..., None]) + PIGMENT * coverage[..., None]
    porcelain = albedo * diffuse * (1 - specular[..., None]) + specular[..., None]
    return base * (1 - mask[..., None]) + porcelain * mask[..., None]


def label_font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', size)


def make_boards(review, previews, configs):
    for shape, config in configs.items():
        board = Image.new('RGB', (1800, 725), '#f2eee6')
        draw = ImageDraw.Draw(board)
        draw.text((36, 24), f"{config['name']} · 六种纹样贴合", font=label_font(34, True), fill='#173d59')
        draw.text((38, 77), '新纹理 / 独立曲面映射 / 原瓶身光照    ·    离线合成预览，非微信截图', font=label_font(19), fill='#716b60')
        for i, (name, (title, _)) in enumerate(PATTERNS.items()):
            tile = previews[(shape, name)].crop(config['crop'])
            tile.thumbnail((276, 465), Image.Resampling.LANCZOS)
            x = 28 + i * 295
            board.paste(tile, (x + (276 - tile.width) // 2, 130))
            draw.text((x + 5, 578), title, font=label_font(25, True), fill='#173d59')
            draw.text((x + 5, 621), '默认可选' if i < 2 else '保留挑战解锁', font=label_font(18), fill='#817363')
        board.save(review / f'{config["name"]}-六种纹样.jpg', quality=94, subsampling=0)
    board = Image.new('RGB', (1480, 910), '#f2eee6')
    draw = ImageDraw.Draw(board)
    draw.text((35, 24), '两种器型 · 底釉复用验证', font=label_font(33, True), fill='#173d59')
    draw.text((37, 78), '同一纹样、明暗和高光层，仅改变底釉参数；第三步页面本轮尚未开放', font=label_font(20), fill='#716b60')
    for i, (shape, config) in enumerate(configs.items()):
        for j, key in enumerate(('lotus', 'celadon')):
            tile = previews[(shape, key)].crop(config['crop'])
            tile.thumbnail((340, 645), Image.Resampling.LANCZOS)
            x = 40 + (i * 2 + j) * 360
            board.paste(tile, (x + (330 - tile.width) // 2, 134))
            draw.text((x, 795), f"{config['name']} · {'白釉' if j == 0 else '浅青釉'}", font=label_font(23, True), fill='#173d59')
    board.save(review / '两种器型-换釉色验证.jpg', quality=94, subsampling=0)


def build(review, runtime):
    configs = json.loads((ROOT / 'geometry.json').read_text(encoding='utf-8'))
    textures_dir, cards = ROOT / 'textures', runtime / 'cards'
    for folder in (review, runtime, textures_dir, cards):
        folder.mkdir(parents=True, exist_ok=True)
    textures, previews = {}, {}
    manifest = {'size': list(SIZE), 'runtimeSize': list(RUNTIME_SIZE),
                'runtimeEncoding': 'JPEG quality 88, 4:2:2; cards PNG 128-color palette',
                'pigmentRGB': list(u8(PIGMENT).astype(int).tolist()),
                'sourceDirectory': '用户桌面/资源/纹理图', 'sources': {}, 'shapes': {},
                'lightingMethod': 'Single-photo diffuse/specular approximation, not measured PBR',
                'edgeFade': False, 'glazeProofRGB': [.75, .87, .82]}
    for name, (title, source_name) in PATTERNS.items():
        source = ROOT / 'inputs' / f'{name}-source.png'
        textures[name] = extract_coverage(name, textures_dir)
        manifest['sources'][name] = {'name': title, 'originalFilename': source_name,
                                    'size': list(Image.open(source).size),
                                    'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        # The cards share the cleaned pigment layer used on both vessels.
        texture = Image.open(textures_dir / f'{name}-pigment.png')
        texture.thumbnail((348, 348), Image.Resampling.LANCZOS)
        card = Image.new('RGBA', (384, 360), '#f6f0e5')
        card.alpha_composite(texture, ((384 - texture.width) // 2, (360 - texture.height) // 2))
        card.convert('RGB').quantize(colors=128, dither=Image.Dither.NONE).save(cards / f'{name}.png', optimize=True)
    for shape, config in configs.items():
        output = runtime / shape
        layers, masters = ROOT / shape / 'layers', ROOT / shape / 'masters'
        for folder in (output, layers, masters):
            folder.mkdir(parents=True, exist_ok=True)
        source = ROOT / 'inputs' / f'{shape}-white.jpg'
        original = Image.open(source).convert('RGB')
        assert original.size == SIZE
        base = np.asarray(original, dtype=np.float32) / 255
        mask, left, right = geometry(base, config)
        diffuse, specular = lighting(base, mask)
        Image.fromarray(u8(mask)).save(layers / 'body-mask.png')
        save_rgba(np.ones(3), mask, layers / 'glaze-base.png')
        save_rgba(diffuse, mask, layers / 'diffuse-shading.png')
        save_rgba(np.ones(3), specular, layers / 'specular-highlights.png')
        # Validate files actually saved, including their quantization.
        saved_mask = read_float(layers / 'body-mask.png', 'L')
        saved_diffuse = read_float(layers / 'diffuse-shading.png', 'RGBA')[..., :3]
        saved_specular = read_float(layers / 'specular-highlights.png', 'RGBA')[..., 3]
        white = composite(base, saved_mask, saved_diffuse, saved_specular, np.zeros_like(mask), [1, 1, 1])
        reconstruction_error = float(np.max(np.abs(white - base)) * 255)
        assert reconstruction_error <= 1.1, reconstruction_error
        metrics = {'photoSHA256': hashlib.sha256(source.read_bytes()).hexdigest(), 'geometry': config,
                   'savedWhiteReconstructionMaxError255': round(reconstruction_error, 5), 'patterns': {}}
        for name, texture in textures.items():
            alpha, xn = wrap(texture, mask, left, right, config)
            layer_path = layers / f'{name}-wrapped.png'
            save_rgba(PIGMENT, alpha, layer_path)
            saved_alpha = read_float(layer_path, 'RGBA')[..., 3]
            rendered = composite(base, saved_mask, saved_diffuse, saved_specular, saved_alpha, [1, 1, 1])
            image = Image.fromarray(u8(rendered))
            image.save(masters / f'{name}-white.png')
            image.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).save(
                output / f'{name}-preview.jpg', quality=88, subsampling=1, optimize=True)
            previews[(shape, name)] = image
            outside_change = int(np.max(np.abs(np.asarray(image, dtype=int)[saved_mask == 0] - np.asarray(original, dtype=int)[saved_mask == 0])))
            assert outside_change == 0
            assert np.max(saved_alpha[saved_mask == 0]) == 0
            yy = np.indices(mask.shape)[0]
            side = (np.abs(xn) > .72) & (mask > .98) & (yy > config['bodyTop'] + 15) & (yy < config['bodyBottom'] - 10)
            metrics['patterns'][name] = {'backgroundMaxChange255': outside_change,
                                         'sidePigmentCoverageAbove015': round(float(np.mean(alpha[side] > .15)), 4),
                                         'preview': f'/assets/craft/two-vessel-v2/{shape}/{name}-preview.jpg',
                                         'wrappedLayer': f'{shape}/layers/{name}-wrapped.png'}
            if name == 'lotus':
                celadon = composite(base, saved_mask, saved_diffuse, saved_specular, saved_alpha, [.75, .87, .82])
                celadon_image = Image.fromarray(u8(celadon))
                celadon_image.save(masters / 'lotus-celadon.png')
                previews[(shape, 'celadon')] = celadon_image
        manifest['shapes'][shape] = metrics
    make_boards(review, previews, configs)
    manifest['runtimeBytes'] = sum(p.stat().st_size for p in runtime.rglob('*') if p.is_file())
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (review / '资源校验.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'combinations': len(configs) * len(PATTERNS),
                      'runtimeBytes': manifest['runtimeBytes'],
                      'whiteReconstructionMaxError255': {k: v['savedWhiteReconstructionMaxError255'] for k, v in manifest['shapes'].items()},
                      'backgroundChange': 0, 'reviewDirectory': str(review)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--review-dir', type=Path, required=True)
    parser.add_argument('--runtime-dir', type=Path, default=ROOT.parents[2] / 'assets/craft/two-vessel-v2')
    args = parser.parse_args()
    build(args.review_dir, args.runtime_dir)
