"""Surface boundaries protect background and keep paint off openings/interiors."""
import unittest
import json
from pathlib import Path

import numpy as np

from vessel_surfaces import surface_masks


class SurfaceTests(unittest.TestCase):
    def setUp(self):
        self.photo = np.full((100, 120, 3), .8, dtype=np.float32)
        self.config = {
            'outline': [[10, 40, 80], [80, 40, 80]],
            'refineEdges': False,
            'extraRegions': [[[20, 20], [45, 20], [45, 60], [20, 60]]],
            'holes': [[[27, 28], [36, 28], [36, 52], [27, 52]]],
            'patternClip': [[40, 40], [80, 40], [80, 75], [40, 75]],
        }

    def test_handles_receive_glaze_but_holes_and_background_do_not(self):
        glaze, paint, _, _ = surface_masks(self.photo, self.config)
        self.assertEqual(glaze[24, 24], 1)
        self.assertEqual(glaze[40, 31], 0)
        self.assertEqual(glaze[5, 5], 0)
        self.assertEqual(glaze[50, 60], 1)

    def test_paint_stays_on_outer_body_without_covering_handle_or_inner_wall(self):
        glaze, paint, _, _ = surface_masks(self.photo, self.config)
        self.assertEqual(paint[50, 60], 1)
        self.assertEqual(paint[25, 60], 0)
        self.assertEqual(paint[24, 24], 0)
        self.assertTrue(np.all(paint <= glaze))

    def test_manual_trace_is_independent_of_interior_reflections(self):
        before = surface_masks(self.photo, self.config)
        relit = self.photo.copy()
        relit[20:70, 42:78] = [.6, .3, .2]
        after = surface_masks(relit, self.config)
        for original, changed in zip(before, after):
            np.testing.assert_array_equal(original, changed)

    def test_all_four_source_photos_respect_reviewed_surface_checkpoints(self):
        root = Path(__file__).resolve().parent
        configs = json.loads((root / 'geometry.json').read_text(encoding='utf-8'))
        project = root.parents[2]
        from PIL import Image
        for filename, checks in (
            ('bottle-checkpoints.json', {'maskInside': (0, True), 'maskOutside': (0, False)}),
            ('surface-checkpoints.json', {
                'glazeIncludes': (0, True), 'glazeExcludes': (0, False),
                'patternSurfaceIncludes': (1, True), 'patternSurfaceExcludes': (1, False),
            }),
        ):
            points = json.loads((root / filename).read_text(encoding='utf-8'))['shapes']
            for shape, groups in points.items():
                with Image.open(project / 'assets/shapes' / f'{shape}.jpg') as source:
                    photo = np.asarray(source.convert('RGB'), dtype=np.float32) / 255
                surfaces = surface_masks(photo, configs[shape])
                for group, (surface, included) in checks.items():
                    for x, y in groups.get(group, []):
                        with self.subTest(shape=shape, group=group, x=x, y=y):
                            if included:
                                self.assertGreater(surfaces[surface][y, x], .98)
                            else:
                                self.assertLess(surfaces[surface][y, x], .02)


if __name__ == '__main__':
    unittest.main()
