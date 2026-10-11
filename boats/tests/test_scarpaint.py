"""What a painted shot scar IS, under plain pytest. No bpy, no numpy.

The geometry pass cut the nine craters 2 mm into the skin, which is correct and
invisible: a depression in a closed surface cannot be seen from outside it. The
scars are therefore painted into the `hull_timber` albedo and normal atlases,
and this file is the ruling on what "painted" means — the falloff, the ragged
outline, the dent profile in metres, and the two blends.

Every test is written as the mutant it is meant to catch.
"""

import math

import pytest

from frigate import scarpaint

# One scar, named at both ends: `damage.SCAR_R` is 0.40 m and the per-scar
# jitter runs 0.7..1.25 of it, so a crater radius is 0.28..0.50 m.
CRATER_R = 0.40


def _lum(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


# --- how far the paint reaches ----------------------------------------------


def test_the_paint_reaches_further_than_the_crater_it_marks():
    """Splinters radiate past the hole. Crater rim to paint rim, both named."""
    assert scarpaint.paint_radius(CRATER_R) > CRATER_R
    assert scarpaint.paint_radius(CRATER_R) == pytest.approx(
        CRATER_R * scarpaint.PAINT_RADIUS_FACTOR)


def test_the_scar_is_wide_enough_to_be_more_than_one_texel():
    """The atlas is the limit, so the limit is stated rather than assumed.

    Measured on the shipped unwrap: the Hull's own texels run at 14.03 texels
    per metre (hull world area 1010.25 m2 against UV area 0.18965 of the 1024
    square). A 0.40 m crater therefore paints 20 texels across. That is the
    resolution the whole ship is drawn at and it is why the dent goes in the
    NORMAL map: 20 texels of colour alone would be a smudge.
    """
    across = scarpaint.paint_diameter_texels(CRATER_R, 14.03)
    assert across == pytest.approx(2 * 0.40 * 1.8 * 14.03, abs=0.01)
    assert across >= 16.0


def test_the_outline_is_ragged_and_never_leaves_the_paint_radius():
    radii = [scarpaint.edge(2 * math.pi * i / 360.0) for i in range(360)]
    assert max(radii) <= 1.0 + 1e-9
    assert min(radii) >= 1.0 - scarpaint.LOBE_DEPTH - 1e-9
    # A circle would be a drill hole, not a shot scar.
    assert max(radii) - min(radii) > 0.1


def test_the_outline_closes_on_itself():
    assert scarpaint.edge(0.0) == pytest.approx(scarpaint.edge(2 * math.pi))


# --- the albedo falloff ------------------------------------------------------


def test_the_core_is_fully_painted_and_outside_the_outline_nothing_is():
    assert scarpaint.coverage(0.0, 0.0) == pytest.approx(1.0)
    assert scarpaint.coverage(scarpaint.CORE_EDGE * 0.5, 0.0) == pytest.approx(1.0)
    assert scarpaint.coverage(1.0001, 0.0) == 0.0
    assert scarpaint.coverage(5.0, 1.3) == 0.0


def test_coverage_never_rises_as_you_walk_out_from_the_centre():
    for angle in (0.0, 0.7, 2.9, 5.5):
        last = 2.0
        for i in range(201):
            c = scarpaint.coverage(i / 100.0, angle)
            assert c <= last + 1e-12, f"coverage rose at d={i / 100.0} angle={angle}"
            last = c


def test_coverage_stops_at_the_ragged_outline_not_at_a_circle():
    """The angle the outline pulls furthest in must be bare where another is not."""
    tight = min(range(360), key=lambda i: scarpaint.edge(2 * math.pi * i / 360.0))
    wide = max(range(360), key=lambda i: scarpaint.edge(2 * math.pi * i / 360.0))
    d = 0.5 * (scarpaint.edge(2 * math.pi * tight / 360.0)
               + scarpaint.edge(2 * math.pi * wide / 360.0))
    assert scarpaint.coverage(d, 2 * math.pi * tight / 360.0) == 0.0
    assert scarpaint.coverage(d, 2 * math.pi * wide / 360.0) > 0.0


# --- the colour --------------------------------------------------------------


def test_the_splintered_ring_is_paler_than_the_planking_it_is_torn_out_of():
    """This is the whole point of the albedo half: pale wood against weathered.

    Both ends named: `palette.OCHRE_STRAKE` weathered down is the planking, and
    `scarpaint.SPLINTER_PALE` is the unweathered timber under it.
    """
    base = scarpaint.srgb_to_linear((150, 126, 72))
    out = scarpaint.blend_albedo(base, 0.45, 0.0)
    assert _lum(out) > _lum(base) * 1.4


def test_the_impact_point_itself_is_darker_than_the_splinters_around_it():
    base = scarpaint.srgb_to_linear((150, 126, 72))
    core = scarpaint.blend_albedo(base, 0.0, 0.0)
    ring = scarpaint.blend_albedo(base, 0.45, 0.0)
    assert _lum(core) < _lum(ring)


def test_outside_the_outline_the_planking_is_left_exactly_as_it_was():
    base = scarpaint.srgb_to_linear((150, 126, 72))
    assert scarpaint.blend_albedo(base, 1.5, 0.0) == pytest.approx(base)


def test_the_paint_never_leaves_the_zero_to_one_range():
    for base in ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0), (0.3, 0.2, 0.1)):
        for i in range(0, 130, 7):
            out = scarpaint.blend_albedo(base, i / 100.0, i / 13.0)
            assert all(0.0 <= c <= 1.0 for c in out), out


# --- the dent ----------------------------------------------------------------


def test_the_middle_of_the_scar_is_driven_into_the_skin_not_out_of_it():
    """A scar is a hole. Negative height is into the planking."""
    assert scarpaint.height(0.0, 0.0) == pytest.approx(-scarpaint.DENT_DEPTH, rel=0.02)
    assert scarpaint.height(0.0, 0.0) < scarpaint.height(0.4, 0.0) < 0.0


def test_the_crater_wall_carries_a_splintered_lip_standing_proud():
    """The one place a shot scar IS proud of the skin, and it is 12 mm of it."""
    rim = [scarpaint.height(scarpaint.BOWL_EDGE + i / 400.0, 0.0) for i in range(60)]
    assert max(rim) > 0.0
    assert max(rim) <= scarpaint.LIP_HEIGHT + scarpaint.GROOVE + 1e-9


def test_the_skin_is_flat_again_outside_the_paint_radius():
    assert scarpaint.height(1.2, 0.0) == pytest.approx(0.0, abs=1e-6)
    assert scarpaint.height(3.0, 2.0) == pytest.approx(0.0, abs=1e-6)


def test_the_dent_is_deep_enough_to_shade_and_shallow_enough_to_be_a_scar():
    """`damage.SCAR_DEPTH` is 0.20 m of geometry; the painted dent is less."""
    assert 0.05 < scarpaint.DENT_DEPTH < 0.20


# --- tangent-space normals ---------------------------------------------------


def test_a_normal_survives_the_encode_decode_round_trip():
    for n in ((0.0, 0.0, 1.0), (0.3, -0.4, 0.866), (-0.6, 0.1, 0.79)):
        back = scarpaint.decode_normal(scarpaint.encode_normal(n))
        assert back == pytest.approx(n, abs=1e-6)


def test_a_flat_normal_encodes_to_the_half_half_one_of_every_normal_map():
    assert scarpaint.encode_normal((0.0, 0.0, 1.0)) == pytest.approx((0.5, 0.5, 1.0))


def test_a_downhill_slope_tilts_the_normal_the_other_way():
    """Standard height-field convention: n = normalize(-dh/du, -dh/dv, 1)."""
    n = scarpaint.detail_normal(0.5, 0.0)
    assert n[0] < 0.0 and n[1] == pytest.approx(0.0) and n[2] > 0.0
    assert scarpaint.detail_normal(0.0, 0.5)[1] < 0.0
    assert scarpaint.detail_normal(0.0, 0.0) == pytest.approx((0.0, 0.0, 1.0))


def test_combining_with_a_flat_detail_leaves_the_baked_normal_alone():
    base = (0.3, -0.2, math.sqrt(1 - 0.09 - 0.04))
    assert scarpaint.combine_normals(base, (0.0, 0.0, 1.0)) == pytest.approx(base)


def test_combining_onto_a_flat_base_gives_back_the_detail():
    detail = (-0.4, 0.2, math.sqrt(1 - 0.16 - 0.04))
    assert scarpaint.combine_normals((0.0, 0.0, 1.0), detail) == pytest.approx(detail)


def test_the_combined_normal_keeps_both_tilts_and_stays_a_unit_vector():
    base = (0.3, 0.0, math.sqrt(1 - 0.09))
    detail = (0.4, -0.3, math.sqrt(1 - 0.16 - 0.09))
    out = scarpaint.combine_normals(base, detail)
    assert out[0] > base[0]          # the two agree in u, so u gets steeper
    assert out[1] < 0.0              # the detail alone tilts in v
    assert sum(c * c for c in out) == pytest.approx(1.0)


def test_the_dent_really_does_tilt_the_normal_at_the_crater_wall():
    """The slope the painter will feed in, from the profile this module rules."""
    step = 1.0 / 14.03 / scarpaint.paint_radius(CRATER_R)   # one texel, in d
    d = scarpaint.BOWL_EDGE * 0.6
    slope = (scarpaint.height(d + step, 0.0) - scarpaint.height(d - step, 0.0)) \
        / (2.0 / 14.03)
    n = scarpaint.detail_normal(slope, 0.0)
    assert abs(n[0]) > 0.15, f"the crater wall only tilts the normal to {n}"


# --- UV rasterisation --------------------------------------------------------


def test_a_triangle_covering_the_whole_square_covers_every_texel():
    tri = ((-0.5, -0.5), (3.0, -0.5), (-0.5, 3.0))
    got = scarpaint.rasterize_triangle(tri, 8, 8)
    assert len({(x, y) for x, y, _ in got}) == 64


def test_every_barycentric_sums_to_one_and_none_is_negative():
    tri = ((0.1, 0.1), (0.9, 0.2), (0.4, 0.85))
    got = scarpaint.rasterize_triangle(tri, 32, 32)
    assert got
    for _x, _y, bary in got:
        assert sum(bary) == pytest.approx(1.0)
        assert min(bary) >= -1e-9


def test_a_triangle_off_the_square_paints_nothing():
    assert scarpaint.rasterize_triangle(((2.0, 2.0), (3.0, 2.0), (2.0, 3.0)), 16, 16) == []


def test_a_degenerate_triangle_paints_nothing_rather_than_dividing_by_zero():
    assert scarpaint.rasterize_triangle(((0.2, 0.2), (0.6, 0.6), (0.4, 0.4)), 16, 16) == []
    assert scarpaint.rasterize_triangle(((0.2, 0.2), (0.2, 0.2), (0.2, 0.2)), 16, 16) == []


def test_the_barycentric_at_a_corner_names_that_corner():
    """Texel centres sit at (x + 0.5) / size, so a corner is placed on one."""
    tri = ((2.5 / 16, 2.5 / 16), (13.5 / 16, 2.5 / 16), (2.5 / 16, 13.5 / 16))
    got = {(x, y): b for x, y, b in scarpaint.rasterize_triangle(tri, 16, 16)}
    assert got[(2, 2)] == pytest.approx((1.0, 0.0, 0.0), abs=1e-6)
    assert got[(13, 2)] == pytest.approx((0.0, 1.0, 0.0), abs=1e-6)
    assert got[(2, 13)] == pytest.approx((0.0, 0.0, 1.0), abs=1e-6)


def test_winding_does_not_change_which_texels_are_covered():
    a = ((0.15, 0.2), (0.8, 0.25), (0.45, 0.9))
    flipped = (a[0], a[2], a[1])
    assert {(x, y) for x, y, _ in scarpaint.rasterize_triangle(a, 24, 24)} \
        == {(x, y) for x, y, _ in scarpaint.rasterize_triangle(flipped, 24, 24)}


# --- the tangent frame the painter measures its angles in --------------------


def test_the_tangent_basis_is_orthonormal_and_square_to_the_surface():
    for n in ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, -1.0, 0.0),
              (0.577, 0.577, 0.577)):
        length = math.sqrt(sum(c * c for c in n))
        n = tuple(c / length for c in n)
        t1, t2 = scarpaint.tangent_basis(n)
        assert sum(a * a for a in t1) == pytest.approx(1.0)
        assert sum(a * a for a in t2) == pytest.approx(1.0)
        assert sum(a * b for a, b in zip(t1, t2)) == pytest.approx(0.0, abs=1e-9)
        assert sum(a * b for a, b in zip(t1, n)) == pytest.approx(0.0, abs=1e-9)
        assert sum(a * b for a, b in zip(t2, n)) == pytest.approx(0.0, abs=1e-9)


def test_the_tangent_basis_is_the_same_every_time_it_is_asked():
    """A seeded-random basis would move the splinter lobes on every bake."""
    n = (0.2, -0.3, 0.93)
    length = math.sqrt(sum(c * c for c in n))
    n = tuple(c / length for c in n)
    assert scarpaint.tangent_basis(n) == scarpaint.tangent_basis(n)


# --- sRGB ---------------------------------------------------------------------


def test_the_paint_colours_are_converted_out_of_srgb_before_they_are_mixed():
    """Blender hands `image.pixels` linear floats, so a sRGB triple mixed in
    raw would be a different colour. Checked against the palette's own
    conversion rather than against a number typed here."""
    from frigate import palette

    assert scarpaint.srgb_to_linear((218, 196, 152)) == pytest.approx(
        palette.srgb_to_linear((218, 196, 152)))


def test_the_band_the_atlas_is_judged_on_is_all_splintered_wood():
    """Outside the powder burn, inside the tightest lobe the outline reaches."""
    lo, hi = scarpaint.SPLINTER_BAND
    assert lo >= scarpaint.CORE_BURN
    assert hi <= min(scarpaint.edge(2 * math.pi * i / 720.0) for i in range(720))
    for i in range(21):
        d = lo + (hi - lo) * i / 20.0
        for a in (0.0, 1.1, 2.7, 4.4, 6.0):
            assert scarpaint.coverage(d, a) > 0.0, (d, a)


# --- the planking's grain, which a scar's relief is judged against --------
#
# Final review 3's bake: four of the galleon's nine albedo scars read relief
# 1.37..1.91 under the 2.0 floor with the same 0.19 shift that passed at
# 2.40 before, because her wales now run BETWEEN her rows (the maintainer's third
# ruling, C) and the comparison ring crosses black wale and ochre strake
# many times: 11..17% of the ring's neighbour steps were black-to-ochre
# jumps over 0.3 of linear RGB, which is the PAINT SCHEME, not the grain.
# `scar_change`'s own docstring says the grain is the planking's and not
# the livery's; a step from one livery band to another is not grain.


def test_the_grain_counts_only_steps_inside_one_livery_band():
    steps = [(0.02, "ochre_strake", "ochre_strake"),
             (0.04, "ochre_strake", "ochre_strake"),
             (0.50, "ochre_strake", "main_wale"),     # an edge of the scheme
             (0.03, "main_wale", "main_wale")]
    assert scarpaint.planking_grain(steps) == pytest.approx(0.03)


def test_a_ring_with_no_step_inside_one_band_has_no_grain():
    assert scarpaint.planking_grain([(0.5, "a", "b")]) == 0.0
    assert scarpaint.planking_grain([]) == 0.0
