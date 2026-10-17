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


# --- the per-style palette (#392's "flat, cool grey" complaint) --------------

def _luma(hex_colour):
    r, g, b = palette.linear(hex_colour)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _saturation(hex_colour):
    rgb = [((hex_colour >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    return (max(rgb) - min(rgb)) / max(rgb) if max(rgb) else 0.0


def test_every_style_has_a_palette():
    from town.params import STYLES
    assert set(palette.PALETTES) == set(STYLES)


def test_the_roof_is_a_light_warm_neutral_the_nation_palette_can_tint():
    # Tint channel 2 takes the nation's roof colour later (#180): a light,
    # warm base, never a dark blue-grey slate.
    for style, colours in palette.PALETTES.items():
        r, g, b = palette.linear(colours.roof)
        assert r > b and g >= b, style
        assert _luma(colours.roof) > 0.25, style
        assert _saturation(colours.roof) < 0.3, style


def test_the_limewash_and_stone_are_warm_and_unsaturated():
    # Weathered, no plastic colour (ADR 0002 (d)).
    for style, colours in palette.PALETTES.items():
        for name in ("plaster", "stone", "mortar", "oak"):
            hex_colour = getattr(colours, name)
            r, _g, b = palette.linear(hex_colour)
            assert r > b, (style, name)
            assert _saturation(hex_colour) < 0.45, (style, name)
