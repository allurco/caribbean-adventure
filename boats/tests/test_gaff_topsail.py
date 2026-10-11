"""The gaff topsail: a three-sided sail set OVER a gaff mainsail.

Its luff is laced up the topmast and its foot along the gaff; only its
leech, from the masthead down to the gaff's peak, is free. The sail model
draws every canvas from four named corners with belly zero along its head
(v = 1) and its two sides (u = -1, u = +1), so the corners are assigned to
put the two HELD edges there and the FREE edge where the belly is:

    peak   = the gaff's THROAT  (where luff and foot meet, at the jaws)
    throat = tack = the topsail's HEAD, up the topmast (degenerate "tack",
             as a lateen's)
    clew   = the gaff's PEAK

so throat -> peak is the luff, clew -> peak the foot along the gaff, and
tack -> clew the free leech. The names are the model's, the edges the sail's.
"""

import pytest

from frigate import profiles, sailplan, shiptype as st
from frigate.params import SloopParams

S = SloopParams()
TOPSAIL = S.rig.mast("main").sails[1]
MAIN = S.rig.mast("main").sails[0]


def _dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def test_the_kind_is_fore_and_aft_with_no_spar_of_its_own():
    k = st.SailKind.GAFF_TOPSAIL
    assert st.is_fore_and_aft(k)
    assert st.spars_for(k) == ()
    assert st.degenerate_corner(k) == "tack"
    assert set(st.rope_families(k)) == {"topsail_halyard", "topsail_sheet"}


def test_its_foot_lies_along_the_gaff_it_is_set_over():
    top = sailplan.corners(S, "main", TOPSAIL)
    main = sailplan.corners(S, "main", MAIN)
    assert _dist(top.peak, main.throat) == pytest.approx(
        sailplan.TOPSAIL_FOOT_LIFT, abs=1e-9)
    assert _dist(top.clew, main.peak) == pytest.approx(
        sailplan.TOPSAIL_FOOT_LIFT, abs=1e-9)


def test_its_head_stands_up_the_topmast_under_the_truck():
    top = sailplan.corners(S, "main", TOPSAIL)
    truck = profiles.mast_truck_z(S, "main")
    assert top.throat == top.tack
    assert top.throat[2] == pytest.approx(
        sailplan.TOPSAIL_HEAD_FRAC * truck)
    axis_y = profiles.mast_point(S, "main", top.throat[2])[1]
    assert top.throat[1] == pytest.approx(
        axis_y - sailplan.SAIL_ABAFT_MAST)


def test_its_canvas_lies_on_its_two_held_edges_and_bellies_off_the_free():
    grid = sailplan.sail_grid(S, "main", TOPSAIL, 7, 5)
    top = sailplan.corners(S, "main", TOPSAIL)
    # the luff (v = 1 row) runs head to gaff throat, flat
    for pt in grid[-1]:
        assert abs(pt[0]) < 1e-9
    # the foot along the gaff (u = +1 column), flat
    for row in grid:
        assert abs(row[-1][0]) < 1e-9
    # the free leech (v = 0 row) stands off to leeward amidships
    assert abs(grid[0][3][0]) > 0.1
    sailplan.check_degeneracy(st.SailKind.GAFF_TOPSAIL, top)


def test_the_mainsails_throat_hangs_under_the_lower_masthead():
    main = sailplan.corners(S, "main", MAIN)
    _foot, lower_cap, _tm, _truck = profiles._mast_cap_zs(S, "main")
    assert main.throat[2] < lower_cap
    assert lower_cap - main.throat[2] < 1.0
