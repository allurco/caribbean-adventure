"""The sloop's square topsail. No bpy.

The maintainer's ruling: the sloop carries a SQUARE TOPSAIL alongside her
gaff rig, for a stronger silhouette at ship zoom. The Jamaica sloop set one
flying from a yard on her topmast, forward of the mast and abaft her stays,
its foot sheeted home at the lower masthead. It is her one yard, set by a
`shiptype.YardPlan` her mast states, because she has no course under it to
take a tier from.

Every clearance below is named at both ends.
"""

import math

import pytest

from frigate import owner, profiles, ropes, sailplan, shiptype as st, wind
from frigate.params import FrigateParams, SloopParams

S = SloopParams()
TRUCK = profiles.mast_truck_z(S, "main")


def _topsail():
    return next(s for m, s in sailplan.all_sails(S)
                if m == "main" and s.kind is st.SailKind.SQUARE)


def _grid(sail, mast="main", nu=25, nv=17):
    return [pt for row in sailplan.sail_grid(S, mast, sail, nu, nv)
            for pt in row]


def test_it_is_her_tier_2_sail_on_her_one_yard():
    sail = _topsail()
    assert sail.tier == 2 and sail.name == "topsail"
    assert profiles.yard_index(S, "main", 2) == 0
    assert len(profiles.yard_specs(S, "main")) == 1


def test_the_frigates_yards_are_her_tiers():
    f = FrigateParams()
    for mast in profiles.mast_names(f):
        for sail in profiles.square_sails_on(f, mast):
            assert profiles.yard_index(f, mast, sail.tier) == sail.tier
            assert profiles.yard_plan_of(f, mast, sail.tier) is None


def test_its_yard_is_slung_on_the_topmast():
    """LOWER CAP to YARD to TOPMAST CAP, climbing."""
    lower, topmast = (c * TRUCK for c in S.rig.mast("main").caps)
    z, length, _r = profiles.yard_specs(S, "main")[0]
    assert lower < z < topmast
    # a yard about the width of her own beam: wide enough to read
    assert 0.85 * S.beam <= length <= 1.2 * S.beam


def test_its_foot_is_sheeted_home_at_the_lower_masthead_and_spreads():
    panel = wind.sail_panel(S, "main", 2)
    lower = S.rig.mast("main").caps[0] * TRUCK
    assert lower <= panel["foot_z"] < panel["head_z"]
    assert panel["foot_half"] > panel["head_half"]
    # deep enough to read as a sail and not a strip
    assert panel["head_z"] - panel["foot_z"] >= 1.2


def test_it_hangs_forward_of_its_mast():
    for x, y, z in _grid(_topsail()):
        assert y > profiles.mast_point(S, "main", z)[1] \
            + profiles.spar_radius_at(S, "main", z)


def _tri_gap(pt, a, b, c):
    """POINT (y, z) to TRIANGLE abc in the (y, z) plane: negative inside."""
    def side(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    inside = (side(a, b, pt) >= 0) == (side(b, c, pt) >= 0) == \
        (side(c, a, pt) >= 0)

    def seg(p, q):
        dy, dz = q[0] - p[0], q[1] - p[1]
        u = max(0.0, min(1.0, ((pt[0] - p[0]) * dy + (pt[1] - p[1]) * dz)
                         / (dy * dy + dz * dz)))
        return math.hypot(pt[0] - p[0] - u * dy, pt[1] - p[1] - u * dz)
    d = min(seg(a, b), seg(b, c), seg(c, a))
    return -d if inside else d


TOPSAIL_HEADSAIL_CLEAR = 0.10


def test_it_stands_clear_of_both_headsails_seen_from_abeam():
    """Every point of the topsail's canvas, seen from abeam, stands outside
    each headsail's own triangle by `TOPSAIL_HEADSAIL_CLEAR`: whatever
    either bellies to leeward, the two cannot meet."""
    pts = _grid(_topsail())
    for sail in S.rig.headsails:
        c = sailplan.corners(S, None, sail)
        tri = [(c.tack[1], c.tack[2]), (c.clew[1], c.clew[2]),
               (c.peak[1], c.peak[2])]
        worst = min(_tri_gap((y, z), *tri) for _x, y, z in pts)
        assert worst >= TOPSAIL_HEADSAIL_CLEAR, (sail.name, worst)


def test_it_stands_wholly_under_her_flag():
    flag = wind.flag_grid(S, profiles.FLAG_NU, profiles.FLAG_NV)
    low = min(pt[2] for row in flag for pt in row)
    z, _l, _r = profiles.yard_specs(S, "main")[0]
    assert z + 0.30 < low


def test_its_lifts_lead_up_to_the_topmast_cap_and_its_sheets_in_to_the_mast():
    topmast = S.rig.mast("main").caps[1] * TRUCK
    for sign in (-1.0, 1.0):
        (arm, head), = ropes.lifts(S, "main", sign)
        assert head[2] == pytest.approx(topmast)
        assert arm[2] < head[2]
        (clew, foot), = ropes.sheets(S, "main", sign)
        assert foot[2] == pytest.approx(clew[2])
        assert abs(foot[0]) == pytest.approx(
            profiles.spar_radius_at(S, "main", foot[2]))


def test_every_rope_family_it_needs_can_be_drawn():
    assert ropes.unbuildable_families(S) == []


def test_the_pennant_still_flies_over_it_all():
    low = min(pt[2] for row in owner.pennant_grid(S) for pt in row)
    assert low > max(pt[2] for pt in _grid(_topsail()))
