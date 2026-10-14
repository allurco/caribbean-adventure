"""The two ensigns the generator can still draw, and the CROSS OF BURGUNDY. No bpy.

`colours.py` argued the British Red Ensign of 1707-1800 at length and then
hardcoded it, which made the un-earned colours state a FRIGATE detail living
in a module whose own docstring says it is a ship-system rule. The argument
there is good and it is kept verbatim; what is added is that the argument has
a SHIP it is about.

WHY THE CROSS OF BURGUNDY FOR THE GALLEON, by the Red Ensign's own four
tests. A galleon is a 16th-17th century Spanish form, and the Cruz de Borgoña
— the ragged red saltire on white — was the flag her crew fought under, in
service from 1506 right through the Spanish Habsburgs. Reason 4 of the Red
Ensign's note refuses an anachronism the audience would catch, and that rules
OUT the 1785 red-yellow-red bicolour by the same argument that rules out the
1801 Union: it postdates the hull by two centuries.

Reason 3 wants a field that reads at thumbnail size and tells the two states
apart from a cable's length. A WHITE field against the Jolly Roger's black is
the largest contrast on the ship, which is stronger than the frigate's red,
not weaker.
"""

import math

import pytest

from frigate import colours, shiptype as st
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()

RED = st.EnsignKind.RED_ENSIGN
BURGUNDY = st.EnsignKind.CROSS_OF_BURGUNDY


@pytest.fixture
def aspect():
    return colours.flag_aspect()


def _near(got, want, tol=1.0):
    return all(abs(a - b) <= tol for a, b in zip(got, want))


def _arm_a(s: float, d: float) -> tuple:
    """A point on the saltire's FOOT-LUFF-to-HEAD-FLY arm.

    `s` runs 0 at the luff-foot corner to 1 at the fly-head corner along the
    arm; `d` is the signed offset across it, `v - u`, positive towards the
    head. Both ends named: s = 0 is flag-local (0, 0) and s = 1 is (1, 1).
    """
    return (s - d / 2.0, s + d / 2.0)


def _arm_b(s: float, d: float) -> tuple:
    """The HEAD-LUFF-to-FOOT-FLY arm: s = 0 is (0, 1) and s = 1 is (1, 0)."""
    return (s + d / 2.0, 1.0 - s + d / 2.0)


# --- each ship wears her own -------------------------------------------------


def test_no_ship_wears_either_ensign_any_more():
    """#163: every flag is the owner's colours. Both ensigns stay drawable
    (the rest of this file pins them), but neither ship flies one."""
    assert F.ensign is None
    assert G.ensign is None
    assert len(st.EnsignKind) == 2


# --- the galleon's field and her saltire -------------------------------------


def test_the_field_of_the_burgundy_cross_is_white_bunting(aspect):
    """Clear of both arms, every corner of the flag is the bare white field.

    The same bleached wool as the skull and as the Union's crosses: one bolt
    of bunting, one white on the ship.
    """
    for u, v in ((0.08, 0.50), (0.92, 0.50), (0.50, 0.06), (0.50, 0.94)):
        assert _near(colours.ensign_colour(u, v, aspect, BURGUNDY),
                     colours.ENSIGN_WHITE), (u, v)


def test_the_saltire_runs_corner_to_corner_in_red(aspect):
    """Both arms, measured along each by its own parameter."""
    for s in (0.20, 0.35, 0.50, 0.65, 0.80):
        for point in (_arm_a(s, 0.0), _arm_b(s, 0.0)):
            assert _near(colours.ensign_colour(*point, aspect, BURGUNDY),
                         colours.ENSIGN_RED), (s, point)


def test_there_is_no_canton_and_no_blue_anywhere_on_a_burgundy_cross(aspect):
    """The Union's canton is the frigate's and nothing else on this flag is.

    Swept over the whole flag, not sampled at the canton: a canton drawn and
    then painted over somewhere else would pass a corner test.
    """
    for i in range(41):
        for j in range(41):
            u, v = i / 40.0, j / 40.0
            got = colours.ensign_colour(u, v, aspect, BURGUNDY)
            assert not _near(got, colours.ENSIGN_BLUE, 40.0), (u, v, got)


def test_the_galleon_wears_no_red_yellow_red_bicolour(aspect):
    """Reason 4 of the Red Ensign's own note, applied to the galleon.

    The 1785 bicolour is three horizontal bands across the WHOLE fly, so on
    any horizontal line clear of the saltire it would be one solid colour
    from luff to fly. On this flag that line is white field broken by red.
    """
    v = 0.86
    along = [colours.ensign_colour(i / 60.0, v, aspect, BURGUNDY)
             for i in range(61)]
    whites = sum(1 for c in along if _near(c, colours.ENSIGN_WHITE))
    reds = sum(1 for c in along if _near(c, colours.ENSIGN_RED))
    assert whites > 0 and reds > 0, (whites, reds)


# --- RAGGED, which is the whole point of this saltire ------------------------


def test_the_saltire_is_ragged_and_not_a_plain_saltire(aspect):
    """A ragged staff is a lopped branch: the arm's edge carries the STUBS of
    its cut-off limbs. So the arm's own half-width has to vary along it.

    Measured just outside the plain arm's edge, at `BURGUNDY_ARM / 2 +
    BURGUNDY_KNOT / 2` across it: on a plain saltire every one of these is
    field, and on a ragged one the knots reach out past them.
    """
    out = colours.BURGUNDY_ARM / 2.0 + colours.BURGUNDY_KNOT / 2.0
    seen = set()
    for k in range(60):
        s = (k + 0.5) / 60.0
        if abs(s - 0.5) < 0.12:        # clear of the crossing
            continue
        got = colours.ensign_colour(*_arm_a(s, out), aspect, BURGUNDY)
        if _near(got, colours.ENSIGN_RED, 12.0):
            seen.add("knot")
        if _near(got, colours.ENSIGN_WHITE, 12.0):
            seen.add("field")
    assert seen == {"knot", "field"}, seen


def test_the_stubs_alternate_from_one_edge_of_the_arm_to_the_other(aspect):
    """A branch is lopped on alternate sides, which is how raguly is drawn.

    Named at both ends: at the along-arm station where the HEAD side carries
    a stub, the FOOT side does not, and a half-pitch further along they swap.
    """
    out = colours.BURGUNDY_ARM / 2.0 + colours.BURGUNDY_KNOT / 2.0
    s_head = (1.0 + 0.25) * colours.BURGUNDY_PITCH
    s_foot = (1.0 + 0.75) * colours.BURGUNDY_PITCH
    at = lambda s, d: colours.ensign_colour(*_arm_a(s, d), aspect, BURGUNDY)
    assert _near(at(s_head, +out), colours.ENSIGN_RED, 12.0)
    assert _near(at(s_head, -out), colours.ENSIGN_WHITE, 12.0)
    assert _near(at(s_foot, -out), colours.ENSIGN_RED, 12.0)
    assert _near(at(s_foot, +out), colours.ENSIGN_WHITE, 12.0)


def test_the_knots_close_at_both_corners_rather_than_being_cut_in_half():
    """An integer count of pitches along the arm, or the stub at the fly end
    is a different shape from the stub at the luff end."""
    n = 1.0 / colours.BURGUNDY_PITCH
    assert n == pytest.approx(round(n)), n
    assert round(n) == colours.BURGUNDY_KNOTS


# --- the sewn cloth, which is shared because it is the same bolt -------------


def test_a_burgundy_cross_is_one_sewn_panel_where_the_red_ensign_is_two():
    """The saltire is appliqued onto the field and nothing is appliqued onto
    the saltire. The Red Ensign has a canton sewn on the field and the union
    device sewn on the canton, which is two."""
    assert colours.ensign_layers(BURGUNDY) == 1
    assert colours.ensign_layers(RED) == 2
    assert colours.ensign_relief(BURGUNDY) == pytest.approx(colours.ENSIGN_STEP)
    assert colours.ensign_relief(RED) == pytest.approx(2 * colours.ENSIGN_STEP)


def test_the_sewn_edge_is_the_same_width_in_metres_on_both_ensigns():
    """DERIVED, NOT TYPED. `ENSIGN_SOFT` 0.055 is in CANTON-height units and
    the canton is `ENSIGN_CANTON_HOIST` of the flag's hoist, so the same seam
    measured in flag-hoist units is the product of the two. 0.0275 of a
    1.55 m hoist is 42.6 mm, which is the 1.6 texels the Red Ensign's note
    measured and ruled on.
    """
    assert colours.BURGUNDY_SOFT == pytest.approx(
        colours.ENSIGN_SOFT * colours.ENSIGN_CANTON_HOIST)


def test_the_arm_is_the_fifth_of_the_hoist_a_flag_loft_specifies():
    """The same fifth `ENSIGN_SALTIRE_ARM` gives St Andrew in the canton, and
    specified the same way: by its VERTICAL thickness."""
    assert colours.BURGUNDY_ARM == pytest.approx(colours.ENSIGN_SALTIRE_ARM)


def test_every_knot_is_wide_enough_for_this_atlas_to_see_it():
    """`DEVICE_RELIEF`'s ruling: the flag's island runs 36.9 texels to the
    metre, so a texel is 27 mm. A stub has to be several of them or the
    saltire reads as plain. 0.08 of a 1.55 m hoist is 124 mm, 4.6 texels, and
    2.9 times the sewn edge it has to stand clear of.
    """
    texel = 1.0 / 36.9
    from frigate import wind
    assert colours.BURGUNDY_KNOT * wind.FLAG_HOIST / texel > 3.0
    assert colours.BURGUNDY_KNOT / colours.BURGUNDY_SOFT > 2.0


# --- both ensigns are total over the flag ------------------------------------


@pytest.mark.parametrize("kind", [RED, BURGUNDY])
def test_an_ensign_dyes_every_point_of_the_flag(aspect, kind):
    for i in range(21):
        for j in range(21):
            u, v = i / 20.0, j / 20.0
            rgb = colours.ensign_colour(u, v, aspect, kind)
            assert len(rgb) == 3 and all(-1.0 <= c <= 256.0 for c in rgb)
            assert 0.0 <= colours.ensign_layer(u, v, aspect, kind) \
                <= colours.ensign_layers(kind) + 1e-9
            assert 0.0 <= colours.ensign_seam(u, v, aspect, kind) <= 1.0 + 1e-9
            assert colours.ensign_height(u, v, aspect, kind) \
                <= colours.ensign_relief(kind) + 1e-9


def test_an_unknown_ensign_is_refused_rather_than_drawn(aspect):
    with pytest.raises(ValueError):
        colours.ensign_colour(0.5, 0.5, aspect, "cross_of_st_patrick")


# --- and the seam the normal map reads exists on both ------------------------


@pytest.mark.parametrize("kind", [RED, BURGUNDY])
def test_every_ensign_has_a_sewn_join_the_normal_map_can_read(aspect, kind):
    worst = max(colours.ensign_seam(i / 120.0, j / 120.0, aspect, kind)
                for i in range(121) for j in range(121))
    assert worst > 0.9, (kind, worst)
