"""The ship's colours, and the fact that there are two of them. No bpy.

The maintainer's game EARNS the pirate flag, so the colours are a two-state node: a
skull and crossbones, and the plain cloth of a ship that has not earned it.
This is a ship-system rule, not a frigate detail — the galleon, schooner and
man-o-war inherit every figure in here.
"""

import math

import pytest

from frigate import colours, shiptype as st
from frigate.params import FrigateParams

# THE FRIGATE'S OWN ENSIGN, named at every call below rather than defaulted.
# `colours.ensign_*` used to take no ensign at all because there was only one,
# which is how the British Red Ensign became a fact about ships; the kind is
# now a required argument and this is the frigate asking for hers.
RED = FrigateParams().ensign
assert RED is st.EnsignKind.RED_ENSIGN


@pytest.fixture
def aspect():
    return colours.flag_aspect()


# --- the two states ----------------------------------------------------------


def test_there_are_two_states_and_they_are_told_apart_by_uv_set():
    assert len(colours.STATES) == 2
    assert len({s.key for s in colours.STATES}) == 2
    assert len({s.uv_layer for s in colours.STATES}) == 2
    assert len({s.texcoord for s in colours.STATES}) == 2


def test_the_bake_layer_is_texcoord_zero_and_nothing_else_is():
    """The exporter writes a texture's texCoord from the UV layer INDEX, so a
    bake layer that is not index 0 makes one material export as two."""
    primary = [s for s in colours.STATES if s.texcoord == 0]
    assert len(primary) == 1
    assert primary[0].uv_layer == "UVMap"


def test_the_device_is_the_default_state():
    """A pirate frigate whose flag is blank unless something switches it is
    the odd default, not the other way round."""
    assert colours.device_state().texcoord == 0
    assert colours.ensign_state().texcoord != 0
    assert colours.device_state() is not colours.ensign_state()


def test_every_state_says_why_it_exists():
    for s in colours.STATES:
        assert len(s.why) > 40, s.key


def test_the_plain_state_s_uv_set_is_declared_switchable_by_mesh_name():
    sets = colours.switchable_uv_sets("Jolly_Roger")
    assert sets == {"TEXCOORD_1": ["Jolly_Roger"]}
    assert "TEXCOORD_0" not in sets


def test_a_state_can_be_looked_up_and_an_unknown_one_is_refused():
    assert colours.state(colours.ENSIGN).texcoord == 1
    with pytest.raises(ValueError):
        colours.state("skull_and_bones")


# --- flag-local coordinates --------------------------------------------------


def test_the_first_vertex_of_the_flag_is_the_head_of_the_luff():
    """`wind.flag_grid` builds rows from the HEAD of the staff downward."""
    assert colours.flag_local(11, 5, 0) == pytest.approx((0.0, 1.0))


def test_the_corners_of_the_flag_are_where_a_sailor_would_say_they_are():
    nu, nv = 11, 5
    assert colours.flag_local(nu, nv, nu - 1) == pytest.approx((1.0, 1.0))
    assert colours.flag_local(nu, nv, nu * (nv - 1)) == pytest.approx((0.0, 0.0))
    assert colours.flag_local(nu, nv, nu * nv - 1) == pytest.approx((1.0, 0.0))


def test_a_vertex_off_the_flag_is_refused_rather_than_wrapped():
    with pytest.raises(IndexError):
        colours.flag_local(11, 5, 55)
    with pytest.raises(IndexError):
        colours.flag_local(11, 5, -1)


# --- the device --------------------------------------------------------------


def test_the_middle_of_the_cranium_is_solid_bone(aspect):
    u, v = _to_flag(colours.CRANIUM[0], colours.CRANIUM[1] + 0.055, aspect)
    assert colours.device_coverage(u, v, aspect) == pytest.approx(1.0, abs=1e-6)


def test_an_eye_socket_is_a_hole_in_the_middle_of_that_bone(aspect):
    eye = colours.EYES[0]
    u, v = _to_flag(eye[0], eye[1], aspect)
    assert colours.device_coverage(u, v, aspect) == pytest.approx(0.0, abs=1e-6)
    # And the bone right beside it is still bone, or it is not a socket.
    beside = _to_flag(eye[0], eye[1] + eye[3] + 0.03, aspect)
    assert colours.device_coverage(*beside, aspect) > 0.9


def test_the_nose_is_a_hole_too_and_it_sits_between_the_eyes(aspect):
    u, v = _to_flag(colours.NOSE[0], colours.NOSE[1], aspect)
    assert colours.device_coverage(u, v, aspect) == pytest.approx(0.0, abs=1e-6)
    assert colours.EYES[0][0] < colours.NOSE[0] < colours.EYES[1][0]
    assert colours.NOSE[1] < colours.EYES[0][1]


def test_the_bones_cross_below_the_skull_and_not_through_it(aspect):
    (ax, ay), (bx, by) = colours.BONE_A
    (cx, cy), (dx, dy) = colours.BONE_B
    # The two segments cross at the middle of both, by construction.
    cross = (0.5 * (ax + bx), 0.5 * (ay + by))
    assert cross == pytest.approx((0.5 * (cx + dx), 0.5 * (cy + dy)))
    jaw_bottom = colours.JAW[1] - colours.JAW[3]
    assert cross[1] < jaw_bottom


def test_the_corners_of_the_flag_carry_no_device_at_all(aspect):
    for u in (0.0, 1.0):
        for v in (0.0, 1.0):
            assert colours.device_coverage(u, v, aspect) == 0.0


def test_the_device_never_leaves_the_zero_to_one_range(aspect):
    for i in range(0, 41):
        for j in range(0, 41):
            c = colours.device_coverage(i / 40.0, j / 40.0, aspect)
            assert 0.0 <= c <= 1.0


def test_the_device_leaves_a_margin_at_every_edge_of_the_flag(aspect):
    (u0, v0), (u1, v1) = colours.device_extent(aspect)
    assert u0 > 0.1 and u1 < 0.9
    assert v0 > 0.1 and v1 < 0.9


def test_the_skull_comes_out_round_in_METRES_and_not_in_uv(aspect):
    """The trap this constant exists for, with both ends named.

    The colours measure 2.60 m on the fly by 1.55 m on the hoist, an aspect of
    1.677. A device laid out straight on the unit square comes out 1.68 times
    wider than it is tall — a squashed skull. `DEVICE_SIZE` puts it in its own
    square and `device_square` maps into it.
    """
    from frigate import wind

    (u0, v0), (u1, v1) = colours.device_extent(aspect)
    wide = (u1 - u0) * wind.FLAG_FLY
    tall = (v1 - v0) * wind.FLAG_HOIST
    assert 0.8 < wide / tall < 1.3, f"{wide:.2f} m wide against {tall:.2f} m tall"


def test_the_device_covers_a_believable_share_of_the_flag(aspect):
    assert 0.05 < colours.device_area(aspect) < 0.25


def test_the_device_is_the_same_every_time_it_is_asked(aspect):
    """An atlas that is not reproducible breaks the byte-identical-image
    guard in `frigate.export` for a reason that is nothing to do with it."""
    points = [(0.31, 0.44), (0.5, 0.5), (0.62, 0.71)]
    first = [colours.device_coverage(u, v, aspect) for u, v in points]
    second = [colours.device_coverage(u, v, aspect) for u, v in points]
    assert first == second


def test_a_squarer_flag_gets_the_same_skull_not_a_stretched_one():
    """The ship-system claim: another hull's colours inherit this device."""
    round_at = []
    for a in (1.2, 1.677, 2.2):
        (u0, _v0), (u1, _v1) = colours.device_extent(a)
        round_at.append((u1 - u0) * a)
    assert max(round_at) - min(round_at) < 0.05


# --- the relief --------------------------------------------------------------


def test_the_relief_is_cloth_sewn_on_and_not_a_plank(aspect):
    """Appliqué: white cloth, a rolled hem and a stitch line. Not carpentry."""
    assert 0.004 <= colours.DEVICE_RELIEF <= 0.015


def test_bare_cloth_has_no_relief_and_solid_bone_has_all_of_it(aspect):
    assert colours.device_height(0.02, 0.02, aspect) == pytest.approx(0.0)
    u, v = _to_flag(colours.CRANIUM[0], colours.CRANIUM[1] + 0.055, aspect)
    assert colours.device_height(u, v, aspect) == pytest.approx(
        colours.DEVICE_RELIEF, rel=1e-6)


# --- parking the second island ----------------------------------------------


def _free(size, occupied=()):
    free = [True] * (size * size)
    for x, y in occupied:
        free[y * size + x] = False
    return free


def test_the_second_island_is_parked_in_the_lowest_leftmost_block_that_fits():
    got = colours.free_rectangle(_free(8), 8, 3, 2)
    assert got == (0, 0)


def test_a_block_that_would_overlap_something_is_not_offered():
    occupied = [(x, y) for x in range(6) for y in range(8)]
    got = colours.free_rectangle(_free(8, occupied), 8, 2, 2)
    assert got == (6, 0)


def test_nothing_is_offered_when_nothing_fits():
    occupied = [(x, y) for x in range(8) for y in range(8) if x != 0]
    assert colours.free_rectangle(_free(8, occupied), 8, 2, 2) is None
    assert colours.free_rectangle(_free(8), 8, 9, 2) is None
    assert colours.free_rectangle(_free(8), 8, 0, 2) is None


def test_a_block_that_fits_exactly_is_offered():
    assert colours.free_rectangle(_free(4), 4, 4, 4) == (0, 0)


def test_the_block_offered_really_is_free_end_to_end():
    size = 16
    occupied = [(x, y) for x in range(size) for y in range(size)
                if (x + y) % 7 == 0]
    free = _free(size, occupied)
    got = colours.free_rectangle(free, size, 3, 3)
    assert got is not None
    x0, y0 = got
    for y in range(y0, y0 + 3):
        for x in range(x0, x0 + 3):
            assert free[y * size + x], (x, y)


def test_the_same_atlas_always_parks_the_island_in_the_same_place():
    """A best-fit packer would move the island whenever an unrelated island
    changed, and the two states would stop being a copy of each other."""
    size = 24
    occupied = [(x, y) for x in range(size) for y in range(size)
                if (x * 3 + y * 5) % 11 == 0]
    free = _free(size, occupied)
    assert colours.free_rectangle(free, size, 4, 3) \
        == colours.free_rectangle(list(free), size, 4, 3)


# --- helper ------------------------------------------------------------------


def _to_flag(s: float, t: float, aspect: float) -> tuple:
    """The inverse of `device_square` plus the lift: device square to flag."""
    t += colours.DEVICE_LIFT
    return (0.5 + (s - 0.5) * colours.DEVICE_SIZE / aspect,
            0.5 + (t - 0.5) * colours.DEVICE_SIZE)


# --- the un-earned state: a national ensign ----------------------------------
#
# The second state used to be bare black cloth — a verbatim copy of what the
# flag baked to. A ship that has not earned the colours should read as
# SOMETHING rather than as nothing, so the second island now carries a
# national ensign. The choice is the British RED ENSIGN of 1707-1800: the
# flag a ship of this class and period actually wore, and the false colours a
# pirate flew right up to the moment he ran up the black.


def _canton(cu: float, cv: float) -> tuple:
    """Canton-normalised (0..1, 0..1) to flag-local (u, v)."""
    return (cu * colours.ENSIGN_CANTON_FLY,
            1.0 - colours.ENSIGN_CANTON_HOIST + cv * colours.ENSIGN_CANTON_HOIST)


def _near(got, want, tol=1.0):
    return all(abs(a - b) <= tol for a, b in zip(got, want))


def test_the_unearned_state_is_an_ensign_and_still_the_second_uv_set():
    s = colours.state(colours.ENSIGN)
    assert s.texcoord == 1
    assert s.uv_layer == colours.ALT_UV
    assert s.device is False
    assert colours.ensign_state() is s


def test_the_field_of_the_ensign_is_red_wherever_the_canton_is_not(aspect):
    for u, v in ((0.80, 0.20), (0.95, 0.90), (0.10, 0.10), (0.60, 0.75)):
        assert _near(colours.ensign_colour(u, v, aspect, RED), colours.ENSIGN_RED), (u, v)


def test_the_canton_is_the_upper_hoist_quarter_and_carries_the_union(aspect):
    """Upper quarter against the staff — where every ensign puts its canton."""
    assert colours.ENSIGN_CANTON_FLY == pytest.approx(0.5)
    assert colours.ENSIGN_CANTON_HOIST == pytest.approx(0.5)
    u, v = _canton(0.30, 0.90)
    assert _near(colours.ensign_colour(u, v, aspect, RED), colours.ENSIGN_BLUE)


def test_the_cross_of_st_george_crosses_the_middle_of_the_canton(aspect):
    u, v = _canton(0.5, 0.5)
    assert _near(colours.ensign_colour(u, v, aspect, RED), colours.ENSIGN_RED)


def test_the_cross_is_fimbriated_white_against_the_blue(aspect):
    """A red cross laid straight on blue breaks the rule of tincture, and the
    white fimbriation is what a real Union flag puts between them.

    Measured ACROSS the upright, clear of the horizontal arm: the red stops
    at CROSS_ARM/2 from the centreline and the white runs on to
    CROSS_ARM/2 + CROSS_FIMB, both divided by the canton's aspect.
    """
    ca = colours.canton_aspect(aspect)
    arm = colours.ENSIGN_CROSS_ARM / 2.0
    edge = (arm + colours.ENSIGN_CROSS_FIMB / 2.0) / ca
    assert _near(colours.ensign_colour(*_canton(0.5 + edge, 0.90), aspect, RED),
                 colours.ENSIGN_WHITE)
    assert _near(colours.ensign_colour(*_canton(0.5 - edge, 0.90), aspect, RED),
                 colours.ENSIGN_WHITE)


def test_the_saltire_of_st_andrew_runs_corner_to_corner_in_white(aspect):
    for cu, cv in ((0.20, 0.20), (0.80, 0.80), (0.20, 0.80), (0.80, 0.20)):
        u, v = _canton(cu, cv)
        assert _near(colours.ensign_colour(u, v, aspect, RED),
                     colours.ENSIGN_WHITE), (cu, cv)


def test_there_is_no_st_patrick_saltire_because_this_is_before_1801(aspect):
    """The 1801 Union counterchanges each saltire arm half red. This one is
    the 1707 Union, so both halves of every arm are white."""
    for cv in (0.20, 0.30):
        u, v = _canton(0.25, cv)
        assert _near(colours.ensign_colour(u, v, aspect, RED), colours.ENSIGN_WHITE), cv


def test_the_white_of_the_ensign_is_the_same_pot_as_the_skull_s():
    """Same bleached wool bunting, so the two states share one swatch."""
    assert colours.ENSIGN_WHITE == colours.DEVICE_COLOUR


def test_all_three_tinctures_appear_and_the_red_field_dominates(aspect):
    swatches = (colours.ENSIGN_RED, colours.ENSIGN_BLUE, colours.ENSIGN_WHITE)
    counts = [0, 0, 0]
    n = 48
    for i in range(n):
        for j in range(n):
            got = colours.ensign_colour(i / (n - 1), j / (n - 1), aspect, RED)
            best = min(range(3), key=lambda k: sum(
                (a - b) ** 2 for a, b in zip(got, swatches[k])))
            counts[best] += 1
    red, blue, white = (c / (n * n) for c in counts)
    assert red > 0.70, red
    assert blue > 0.04, blue
    assert white > 0.06, white


def test_the_ensign_dyes_every_corner_of_the_flag(aspect):
    """It is a flag, not a decal: nowhere on it is left as bare cloth."""
    for u, v in ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (0.5, 0.5)):
        got = colours.ensign_colour(u, v, aspect, RED)
        assert len(got) == 3
        assert all(20.0 <= c <= 255.0 for c in got), (u, v, got)


def test_the_design_is_two_panels_deep_and_never_three(aspect):
    """The canton is sewn onto the field and the union device onto the
    canton. St George's red against the white it is cut on is a change of
    colour, not of thickness."""
    assert colours.ensign_layers(RED) == 2
    assert colours.ensign_layer(0.90, 0.10, aspect, RED) == pytest.approx(0.0)
    assert colours.ensign_layer(*_canton(0.30, 0.90), aspect, RED) == pytest.approx(1.0)
    assert colours.ensign_layer(*_canton(0.20, 0.20), aspect, RED) == pytest.approx(2.0)
    assert colours.ensign_layer(*_canton(0.50, 0.50), aspect, RED) == pytest.approx(2.0)
    n = 41
    for i in range(n):
        for j in range(n):
            assert colours.ensign_layer(i / (n - 1), j / (n - 1), aspect, RED) \
                <= colours.ensign_layers(RED) + 1e-9


def test_each_sewn_panel_is_one_applique_step_and_not_a_plank(aspect):
    assert 0.004 <= colours.ENSIGN_STEP <= 0.015
    assert colours.ensign_relief(RED) == pytest.approx(
        colours.ENSIGN_STEP * colours.ensign_layers(RED))
    assert colours.ensign_height(0.90, 0.10, aspect, RED) == pytest.approx(0.0)
    assert colours.ensign_height(*_canton(0.30, 0.90), aspect, RED) \
        == pytest.approx(colours.ENSIGN_STEP, rel=1e-6)
    assert colours.ensign_height(*_canton(0.50, 0.50), aspect, RED) \
        == pytest.approx(colours.ensign_relief(RED), rel=1e-6)


def test_the_step_is_the_same_one_the_skull_is_ruled_at():
    """Same atlas, same 27 mm texel, same arithmetic: one sewn-on panel of
    bunting is one `DEVICE_RELIEF`."""
    assert colours.ENSIGN_STEP == colours.DEVICE_RELIEF


def test_a_join_is_marked_where_two_panels_meet_and_nowhere_between(aspect):
    """The bake reads the normal map's signal at the joins, so the joins have
    to be a thing the design states rather than something guessed at."""
    assert colours.ensign_seam(0.90, 0.10, aspect, RED) == pytest.approx(0.0, abs=1e-6)
    assert colours.ensign_seam(*_canton(0.30, 0.90), aspect, RED) \
        == pytest.approx(0.0, abs=1e-6)
    assert colours.ensign_seam(*_canton(0.65, 0.0), aspect, RED) > 0.9


def test_the_relief_never_leaves_its_own_range_either(aspect):
    n = 37
    for i in range(n):
        for j in range(n):
            h = colours.ensign_height(i / (n - 1), j / (n - 1), aspect, RED)
            assert -1e-9 <= h <= colours.ensign_relief(RED) + 1e-9, (i, j, h)


def test_the_joins_inside_the_canton_do_not_run_out_onto_the_field(aspect):
    """The saltire's seam is a seam in the canton and nothing at all beyond
    it: continued out onto the red it would be a crease in open bunting."""
    ca = colours.canton_aspect(aspect)
    edge = (colours.ENSIGN_CROSS_ARM / 2.0) / ca
    on = _canton(0.5 + edge, 0.90)
    assert colours.ensign_seam(*on, aspect, RED) > 0.9
    # The same distance from the cross's centreline, but outside the canton.
    off = (colours.ENSIGN_CANTON_FLY * (0.5 + edge) + 0.5, 0.25)
    assert colours.ensign_seam(*off, aspect, RED) == pytest.approx(0.0, abs=1e-6)


def test_the_relief_never_leaves_its_own_range(aspect):
    n = 37
    for i in range(n):
        for j in range(n):
            h = colours.ensign_height(i / (n - 1), j / (n - 1), aspect, RED)
            assert -1e-9 <= h <= colours.ensign_relief(RED) + 1e-9, (i, j, h)


def test_a_squarer_flag_gets_the_same_ensign_not_a_stretched_one():
    """The canton is the upper hoist quarter whatever the flag measures, and
    the cross inside it stays square in METRES."""
    for a in (1.0, 1.677, 2.0):
        assert _near(colours.ensign_colour(*_canton(0.5, 0.5), a, RED),
                     colours.ENSIGN_RED), a
        assert _near(colours.ensign_colour(0.90, 0.10, a, RED), colours.ENSIGN_RED), a
        assert _near(colours.ensign_colour(*_canton(0.30, 0.90), a, RED),
                     colours.ENSIGN_BLUE), a


def test_the_arms_of_the_cross_are_square_in_metres_on_a_long_flag():
    """The vertical arm is narrower in u than the horizontal arm is deep in v
    by exactly the canton's aspect, which is what makes a square cross."""
    a = 2.4
    ca = colours.canton_aspect(a)
    assert ca == pytest.approx(a * colours.ENSIGN_CANTON_FLY
                               / colours.ENSIGN_CANTON_HOIST)
    half = colours.ENSIGN_CROSS_ARM / 2.0
    inside = _canton(0.5 + (half * 0.5) / ca, 0.90)
    outside = _canton(0.5 + (half * 2.0) / ca, 0.90)
    assert _near(colours.ensign_colour(*inside, a, RED), colours.ENSIGN_RED)
    assert not _near(colours.ensign_colour(*outside, a, RED), colours.ENSIGN_RED)


def test_the_ensign_is_the_same_every_time_it_is_asked(aspect):
    for u, v in ((0.13, 0.77), (0.51, 0.22), (0.88, 0.95)):
        assert colours.ensign_colour(u, v, aspect, RED) \
            == colours.ensign_colour(u, v, aspect, RED)
