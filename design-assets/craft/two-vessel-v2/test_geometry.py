"""Regression: warm porcelain shadows must remain inside the vessel mask."""
import json
import unittest

import numpy as np

from build_assets import ROOT, geometry, read_float


class GeometryTests(unittest.TestCase):
    def test_warm_right_belly_is_not_cut_out(self):
        config = json.loads((ROOT / 'geometry.json').read_text(encoding='utf-8'))['yuhuchun']
        photo = read_float(ROOT / 'inputs/yuhuchun-white.jpg', 'RGB')
        mask, _, _ = geometry(photo, config)
        # This rectangle is entirely inside the original porcelain belly, but its
        # warm reflected light used to interrupt the center-to-edge color scan.
        self.assertTrue(np.all(mask[528:551, 600:700] == 1))

    def test_interior_relighting_does_not_move_the_silhouette(self):
        config = json.loads((ROOT / 'geometry.json').read_text(encoding='utf-8'))['yuhuchun']
        photo = read_float(ROOT / 'inputs/yuhuchun-white.jpg', 'RGB')
        mask, _, _ = geometry(photo, config)
        relit = photo.copy()
        relit[320:530, 570:620] = [.68, .53, .35]
        relit_mask, _, _ = geometry(relit, config)
        np.testing.assert_array_equal(mask, relit_mask)


if __name__ == '__main__':
    unittest.main()
