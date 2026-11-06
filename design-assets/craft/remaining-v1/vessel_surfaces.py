"""Surface boundaries for the four additional fixed-view vessels."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
spec = spec_from_file_location('original_craft_builder', ROOT.parent / 'two-vessel-v2/build_assets.py')
original = module_from_spec(spec)
spec.loader.exec_module(original)


def polygon_mask(size, points):
    scale = 4
    drawing = Image.new('L', (size[0] * scale, size[1] * scale), 0)
    ImageDraw.Draw(drawing).polygon([(round(x * scale), round(y * scale)) for x, y in points], fill=255)
    return np.asarray(drawing.resize(size, Image.Resampling.LANCZOS), dtype=np.float32) / 255


def surface_masks(photo, config):
    # A manually traced narrow contour must not drift toward warm reflections.
    edge_photo = photo if config.get('refineEdges', True) else np.zeros_like(photo)
    body, left, right = original.geometry(edge_photo, config)
    size = (photo.shape[1], photo.shape[0])
    glaze = body.copy()
    for region in config.get('extraRegions', []):
        glaze = np.maximum(glaze, polygon_mask(size, region))
    for hole in config.get('holes', []):
        glaze *= 1 - polygon_mask(size, hole)
    paint = np.minimum(body, glaze)
    if config.get('patternClip'):
        paint *= polygon_mask(size, config['patternClip'])
    return glaze.astype(np.float32), paint.astype(np.float32), left, right
