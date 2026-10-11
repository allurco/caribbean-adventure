"""The sail abstraction, tested against the ship it was NOT designed around.

The schooner is built last. If the sail model only ever had to satisfy the
frigate, the galleon and the man-o-war — three square-rigged ships — then the
yard, the athwartships plane and the symmetry about the mast would all still
be in it when the fourth ship arrived. These tests are the bill arriving early
and being paid.

Two things have to be true at once:

  1. The frigate's square canvas is EXACTLY what it was. Not close: the same
     floats. Those sails are verified geometry.
  2. A gaff mainsail with a boom, a triangular jib and a lateen mizzen all
     come out of the same four-corner model, correctly shaped, in the right
     plane, bellying in the one shared wind.
"""

import math

import pytest

from frigate import profiles, sailplan, shiptype as st, wind
from frigate.params import FrigateParams

P = FrigateParams()
SCHOONER = FrigateParams(rig=st.SCHOONER_RIG)
GALLEON = FrigateParams(rig=st.GALLEON_RIG)


def _dist(a, b):
    return math.dist(a, b)


# --- 1. the frigate's canvas is untouched -----------------------------------


def test_the_frigate_sets_nine_square_sails_in_the_order_it_always_did():
    plan = sailplan.all_sails(P)
    assert len(plan) == 9
    assert [m for m, _s in plan] == (["fore"] * 3 + ["main"] * 3 + ["mizzen"] * 3)
    assert [s.tier for _m, s in plan] == [0, 1, 2] * 3
    assert all(s.kind is st.SailKind.SQUARE for _m, s in plan)


def test_every_point_of_every_frigate_sail_is_the_identical_float_it_was():
    for mast, sail in sailplan.all_sails(P):
        for i in range(5):
            for j in range(5):
                u, v = -1.0 + 2.0 * i / 4, j / 4
                assert sailplan.sail_point(P, mast, sail, u, v) \
                    == wind.sail_point(P, mast, sail.tier, u, v)


def test_the_general_bilinear_lands_the_square_sails_FLAT_panel_exactly():
    """Everything but the belly is one formula for every kind of sail."""
    worst = 0.0
    for mast, sail in sailplan.all_sails(P):
        c = sailplan.corners(P, mast, sail)
        panel = wind.sail_panel(P, mast, sail.tier)
        for i in range(7):
            for j in range(7):
                u, v = -1.0 + 2.0 * i / 6, j / 6
                x, y, z = sailplan.flat_point(c, u, v)
                half = panel["foot_half"] + (panel["head_half"] - panel["foot_half"]) * v
                want = (u * half, panel["y"],
                        panel["foot_z"] + (panel["head_z"] - panel["foot_z"]) * v)
                worst = max(worst, _dist((x, y, z), want))
    assert worst < 1e-12, f"the general flat panel is {worst} m off the square one"


def test_the_general_belly_is_the_square_sails_belly_turned_by_the_wind_azimuth():
    """The two rules differ in DIRECTION and in nothing else, and the angle
    between them is the wind's own azimuth. That is the whole of the gap, and
    it is measured rather than asserted away: the general rule pushes the
    canvas along the sail's own normal, the square rule along the horizontal
    wind, and a sail standing square to the wind sees almost the same cloth.

    This is also why `sail_point` routes a square sail to `wind.sail_point`
    and not through here — the frigate's canvas is verified geometry and
    'almost' is not a licence to move it."""
    worst_depth, worst_angle = 0.0, 0.0
    for mast, sail in sailplan.all_sails(P):
        c = sailplan.corners(P, mast, sail)
        for i in range(1, 6):
            for j in range(0, 5):
                u, v = -1.0 + 2.0 * i / 6, j / 6
                flat = sailplan.flat_point(c, u, v)
                gen = sailplan.surface_point(P, c, sail.kind, u, v)
                sq = wind.sail_point(P, mast, sail.tier, u, v)
                dg = [a - b for a, b in zip(gen, flat)]
                ds = [a - b for a, b in zip(sq, flat)]
                ng, ns = math.dist(dg, (0, 0, 0)), math.dist(ds, (0, 0, 0))
                if ns < 1e-9:
                    continue
                worst_depth = max(worst_depth, abs(ng - ns))
                cosang = sum(a * b for a, b in zip(dg, ds)) / (ng * ns)
                worst_angle = max(worst_angle,
                                  math.degrees(math.acos(min(1.0, cosang))))
    assert worst_depth < 1e-12, f"the two rules differ in DEPTH by {worst_depth} m"
    # The whole difference is the wind's azimuth plus its twist at that height.
    assert worst_angle <= wind.WIND_AZIMUTH_DEG + wind.MAX_TWIST_DEG + 1e-9
    assert worst_angle > 1.0, "if this ever hits zero the test has stopped testing"


def test_a_frigate_sails_corners_are_its_own_panels_corners():
    for mast, sail in sailplan.all_sails(P):
        c = sailplan.corners(P, mast, sail)
        panel = wind.sail_panel(P, mast, sail.tier)
        assert c.tack == (-panel["foot_half"], panel["y"], panel["foot_z"])
        assert c.peak == (panel["head_half"], panel["y"], panel["head_z"])


def test_a_square_sail_hangs_in_an_athwartships_plane():
    for mast, sail in sailplan.all_sails(P):
        c = sailplan.corners(P, mast, sail)
        ys = {round(pt[1], 9) for pt in c.as_tuple()}
        assert len(ys) == 1, "a square sail's four corners share one y plane"


def test_a_square_sail_has_four_distinct_corners():
    for mast, sail in sailplan.all_sails(P):
        sailplan.check_degeneracy(sail.kind, sailplan.corners(P, mast, sail))


def test_the_frigates_yards_come_back_out_of_the_spar_model_at_their_own_length():
    for mast, sail in sailplan.all_sails(P):
        spars = sailplan.spar_segments(P, mast, sail)
        assert len(spars) == 1
        kind, a, b = spars[0]
        assert kind is st.SparKind.YARD
        _z, length, _r = profiles.yard_specs(P, mast)[sail.tier]
        assert _dist(a, b) == pytest.approx(length)


# --- 2. THE SCHOONER --------------------------------------------------------


def test_the_schooner_sets_four_sails_two_gaff_and_two_triangular():
    plan = sailplan.all_sails(SCHOONER)
    assert len(plan) == 4
    kinds = [s.kind for _m, s in plan]
    assert kinds.count(st.SailKind.GAFF) == 2
    assert kinds.count(st.SailKind.STAYSAIL) == 2


def test_a_schooner_headsail_belongs_to_no_mast_and_the_model_says_so():
    plan = sailplan.all_sails(SCHOONER)
    headsails = [(m, s) for m, s in plan if s.kind is st.SailKind.STAYSAIL]
    assert headsails and all(m is None for m, _s in headsails)


def test_a_gaff_mainsail_is_four_sided_with_every_corner_distinct():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        sailplan.check_degeneracy(sail.kind, sailplan.corners(SCHOONER, mast, sail))


def test_a_gaff_mainsail_hangs_in_a_FORE_AND_AFT_plane_not_an_athwartships_one():
    """The one thing a square-rig abstraction cannot express. The four corners
    must share an x, and span y and z — the exact transpose of a square sail."""
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        xs = {round(pt[0], 9) for pt in c.as_tuple()}
        ys = {round(pt[1], 9) for pt in c.as_tuple()}
        zs = {round(pt[2], 9) for pt in c.as_tuple()}
        assert len(xs) == 1
        assert len(ys) > 1 and len(zs) > 1


def test_a_gaff_sails_luff_stands_abaft_its_own_mast_and_its_leech_further_aft():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        y_mast = profiles.station_y(SCHOONER, profiles.mast_t(SCHOONER, mast))
        assert c.tack[1] < y_mast, "the luff hangs abaft the mast"
        assert c.clew[1] < c.tack[1], "the clew is further aft still"
        assert c.peak[1] < c.throat[1], "and the peak is peaked aft"


def test_a_gaff_sails_peak_stands_above_its_throat_which_stands_above_its_boom():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        assert c.peak[2] > c.throat[2] > c.tack[2]
        assert c.tack[2] == pytest.approx(c.clew[2]), "the boom is level"


def test_a_gaff_sail_clears_the_rail_it_swings_over():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        for end in (c.tack, c.clew):
            t = profiles.t_of_y(SCHOONER, end[1])
            rail = profiles.sheer(SCHOONER, t) + SCHOONER.bulwark_h
            assert end[2] - rail >= sailplan.BOOM_RAIL_CLEAR - 1e-9


def test_a_gaff_sail_yields_a_GAFF_and_a_BOOM_and_no_yard():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        spars = sailplan.spar_segments(SCHOONER, mast, sail)
        assert [k for k, _a, _b in spars] == [st.SparKind.GAFF, st.SparKind.BOOM]
        gaff, boom = spars
        assert _dist(gaff[1], gaff[2]) == pytest.approx(
            sailplan.GAFF_LEN_FRAC * _dist(boom[1], boom[2]), rel=1e-9)


def test_a_boom_never_swings_into_the_mast_abaft_it():
    fore = sailplan.boom_span(SCHOONER, "fore")
    y_main = profiles.station_y(SCHOONER, profiles.mast_t(SCHOONER, "main"))
    assert fore[1] - y_main == pytest.approx(sailplan.BOOM_GAP_CLEAR)


def test_the_aftmost_boom_overhangs_the_taffrail_as_a_schooners_does():
    _y_mast, y_end = sailplan.boom_span(SCHOONER, "main")
    assert y_end < profiles.station_y(SCHOONER, 1.0)


def test_a_jib_is_triangular_with_its_two_head_corners_at_one_point():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.STAYSAIL:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        sailplan.check_degeneracy(sail.kind, c)
        assert c.head_length() == pytest.approx(0.0, abs=1e-12)
        assert c.foot_length() > 1.0


def test_a_jibs_tack_is_out_on_the_bowsprit_forward_of_the_stem():
    stem_y = profiles.station_y(SCHOONER, 0.0)
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.STAYSAIL:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        assert c.tack[1] > stem_y, "a jib tacks out on the spar, not on the deck"
        assert c.peak[2] > c.tack[2], "and its head is hoisted above its tack"


def test_the_outer_jib_tacks_further_out_than_the_inner_one():
    tacks = [sailplan.corners(SCHOONER, None, s).tack[1]
             for s in sorted(SCHOONER.rig.headsails, key=lambda s: s.tier)]
    assert tacks == sorted(tacks), "each headsail tacks further forward"


def test_a_jib_carries_no_spar_at_all_because_it_hangs_on_a_stay():
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is st.SailKind.STAYSAIL:
            assert sailplan.spar_segments(SCHOONER, mast, sail) == []


def test_every_schooner_sail_draws_a_grid_of_real_non_degenerate_canvas():
    for mast, sail in sailplan.all_sails(SCHOONER):
        grid = sailplan.sail_grid(SCHOONER, mast, sail, 7, 5)
        assert len(grid) == 5 and all(len(row) == 7 for row in grid)
        pts = [pt for row in grid for pt in row]
        assert all(all(math.isfinite(c) for c in pt) for pt in pts)
        # Real area: the foot row must be spread out, not collapsed.
        assert _dist(grid[0][0], grid[0][-1]) > 1.0


def test_a_fore_and_aft_sail_bellies_ACROSS_the_ship_on_the_SAME_wind():
    """The one-wind rule survives the generalisation. A square sail bellies
    along the wind because its plane is athwartships; a gaff sail bellies to
    leeward because its plane is fore-and-aft. Same field, different plane."""
    for mast, sail in sailplan.all_sails(SCHOONER):
        if sail.kind is not st.SailKind.GAFF:
            continue
        c = sailplan.corners(SCHOONER, mast, sail)
        mid = sailplan.surface_point(SCHOONER, c, sail.kind, 0.0, 0.25)
        flat = sailplan.flat_point(c, 0.0, 0.25)
        assert abs(mid[0] - flat[0]) > 0.05, "it must belly athwartships"
        wx, _wy, _wz = wind.wind_direction(SCHOONER, flat[2])
        assert (mid[0] - flat[0]) * wx > 0, "and to LEEWARD, on the shared wind"


def test_no_fore_and_aft_sail_bellies_into_its_own_weather():
    for p in (SCHOONER, GALLEON):
        for mast, sail in sailplan.all_sails(p):
            if not st.is_fore_and_aft(sail.kind):
                continue
            c = sailplan.corners(p, mast, sail)
            d = sailplan.belly_direction(p, c, c.tack[2])
            w = wind.wind_direction(p, c.tack[2])
            assert sum(a * b for a, b in zip(d, w)) >= 0.0


def test_the_schooners_whole_sail_plan_passes_its_own_degeneracy_rules():
    for mast, sail in sailplan.all_sails(SCHOONER):
        sailplan.check_degeneracy(sail.kind, sailplan.corners(SCHOONER, mast, sail))


# --- 3. the galleon's lateen mizzen, on the same model ----------------------


def test_the_galleons_mizzen_is_a_lateen_degenerate_at_the_TACK():
    c = sailplan.corners(GALLEON, "mizzen", GALLEON.rig.mast("mizzen").sails[0])
    sailplan.check_degeneracy(st.SailKind.LATEEN, c)
    assert c.luff_length() == pytest.approx(0.0, abs=1e-12)
    assert c.leech_length() > 1.0


def test_a_lateen_yard_rakes_up_and_aft_from_its_tack_to_its_peak():
    sail = GALLEON.rig.mast("mizzen").sails[0]
    c = sailplan.corners(GALLEON, "mizzen", sail)
    assert c.peak[2] > c.tack[2], "the peak is the high end"
    assert c.peak[1] < c.tack[1], "and it is the aft end"
    (kind, a, b), = sailplan.spar_segments(GALLEON, "mizzen", sail)
    assert kind is st.SparKind.LATEEN_YARD
    assert {a, b} == {c.tack, c.peak}


def test_the_galleon_carries_square_canvas_forward_and_lateen_aft_at_once():
    kinds = {m: [s.kind for s in GALLEON.rig.mast(m).sails]
             for m in profiles.mast_names(GALLEON)}
    assert kinds["fore"] == [st.SailKind.SQUARE] * 2
    assert kinds["main"] == [st.SailKind.SQUARE] * 3
    assert kinds["mizzen"] == [st.SailKind.LATEEN]


def test_the_galleon_draws_a_real_grid_for_both_kinds_at_once():
    for mast, sail in sailplan.all_sails(GALLEON):
        grid = sailplan.sail_grid(GALLEON, mast, sail, 5, 5)
        pts = [pt for row in grid for pt in row]
        assert all(all(math.isfinite(co) for co in pt) for pt in pts)


# --- 4. the model refuses to lie --------------------------------------------


def test_a_lateen_whose_tack_has_drifted_off_its_throat_is_caught():
    c = sailplan.corners(GALLEON, "mizzen", GALLEON.rig.mast("mizzen").sails[0])
    bent = sailplan.SailCorners(tack=c.tack, clew=c.clew, peak=c.peak,
                                throat=(c.throat[0], c.throat[1] - 0.5, c.throat[2]))
    with pytest.raises(ValueError, match="degenerate at the tack"):
        sailplan.check_degeneracy(st.SailKind.LATEEN, bent)


def test_a_gaff_sail_collapsed_onto_its_own_boom_is_caught():
    mast = "main"
    sail = SCHOONER.rig.mast(mast).sails[0]
    c = sailplan.corners(SCHOONER, mast, sail)
    flat = sailplan.SailCorners(tack=c.tack, clew=c.clew, peak=c.clew, throat=c.tack)
    with pytest.raises(ValueError, match="four distinct corners"):
        sailplan.check_degeneracy(st.SailKind.GAFF, flat)
