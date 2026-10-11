"""The sloop's gaff and boom: the first fore-and-aft spars built.

Each is its own object, as a square yard and a lateen yard are, because each
swings about its mast: its node's origin is on the mast's own raked axis at
its jaws, and it turns about that axis. Each stands `SPAR_STANDOFF` off the
canvas edge it carries -- the gaff OVER the mainsail's head, the boom UNDER
its loose foot -- so spar and cloth do not share a surface, and the gaff
topsail's foot stands clear OVER the gaff.
"""

import pytest

from frigate import profiles, rig, sailplan
from frigate.params import FrigateParams, GalleonParams, SloopParams

S = SloopParams()
MAIN = S.rig.mast("main").sails[0]
TOP = S.rig.mast("main").sails[1]


def test_a_gaff_mast_has_a_gaff_and_a_boom():
    spars = sailplan.gaff_spars(S, "main")
    assert set(spars) == {"gaff", "boom"}


def test_the_gaff_stands_over_the_head_and_the_boom_under_the_foot():
    """Measured square to the spar: AXIS to the canvas edge under it, less
    the spar's radius, is the standoff, whatever the spar's slope."""
    import math
    c = sailplan.corners(S, "main", MAIN)
    for key, a, b in (("gaff", c.throat, c.peak), ("boom", c.tack, c.clew)):
        _root, tip, r0, _r1 = sailplan.gaff_spars(S, "main")[key]
        d = (b[1] - a[1], b[2] - a[2])
        n = math.hypot(*d)
        # the spar's axis is the edge's line lifted clear of it, so its
        # distance from that line is the same along it; read at the tip,
        # which lies on the line's run (the root is moved to the mast)
        gap = abs((tip[1] - a[1]) * d[1] - (tip[2] - a[2]) * d[0]) / n
        assert gap - r0 == pytest.approx(sailplan.SPAR_STANDOFF), key
    root, tip, r0, r1 = sailplan.gaff_spars(S, "main")["boom"]
    # the boom runs out past the clew
    assert tip[1] < c.clew[1]


def test_the_topsails_foot_clears_the_top_of_the_gaff():
    root, _tip, r0, _r1 = sailplan.gaff_spars(S, "main")["gaff"]
    top = sailplan.corners(S, "main", TOP)
    assert top.peak[2] > root[2] + r0


def test_each_spar_starts_just_abaft_its_mast():
    for root, _tip, _r0, _r1 in sailplan.gaff_spars(S, "main").values():
        # a radius clear of the skin as well, so the root's ring, square to
        # a spar peaked up, does not reach into the mast
        axis_y = profiles.mast_point(S, "main", root[2])[1]
        skin = profiles.spar_radius_at(S, "main", root[2])
        assert axis_y - skin - root[1] == pytest.approx(
            sailplan.SPAR_STANDOFF + _r0)


def test_each_swings_about_its_own_mast_from_the_jaws():
    pivots = {piv.part: piv for piv in rig.gaff_pivots(S)}
    assert set(pivots) == {"Gaff_Main", "Boom_Main"}
    for name, key in (("Gaff_Main", "gaff"), ("Boom_Main", "boom")):
        root = sailplan.gaff_spars(S, "main")[key][0]
        piv = pivots[name]
        assert piv.axis == rig.mast_axis(S, "main")
        assert piv.point[2] == pytest.approx(root[2])
        assert piv.distance_from(profiles.mast_point(S, "main",
                                                     root[2])) < 1e-9


def test_the_square_and_lateen_ships_have_none():
    assert rig.gaff_pivots(FrigateParams()) == []
    assert rig.gaff_pivots(GalleonParams()) == []
