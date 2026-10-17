"""The town palette: sRGB as authored, linear as stored, weathered at the foot."""

import pytest

from town import palette


def test_srgb_hex_converts_to_linear():
    assert palette.linear(0xFFFFFF) == pytest.approx((1.0, 1.0, 1.0))
    assert palette.linear(0x000000) == pytest.approx((0.0, 0.0, 0.0))
    # sRGB 0.5 is about 0.214 linear
    assert palette.linear(0x808080)[0] == pytest.approx(0.2158, abs=1e-3)


def test_grime_darkens_the_foot_and_leaves_the_rest():
    assert palette.grime(0.0) < palette.grime(0.6) < palette.grime(palette.GRIME_HEIGHT)
    assert palette.grime(palette.GRIME_HEIGHT) == 1.0
    assert palette.grime(5.0) == 1.0


def test_a_corner_colour_is_the_face_colour_grimed_and_occluded():
    c = palette.corner_colour((0.5, 0.4, 0.3), z=10.0, ao=0.5)
    assert c == pytest.approx((0.25, 0.2, 0.15))
    low = palette.corner_colour((0.5, 0.4, 0.3), z=0.0, ao=1.0)
    assert low[0] < 0.5
