"""Task 14 — the battle damage plan. Pure, no bpy."""

import pytest

from frigate.params import FrigateParams, GalleonParams
from frigate import damage, profiles, sailplan


@pytest.fixture
def p():
    return FrigateParams()


def test_the_damage_is_the_same_on_every_rebuild(p):
    """Irregular, but not loose. An unseeded pass would move every scar each
    time anyone re-ran the build and no two screenshots would ever match."""
    assert damage.rail_gaps(p) == damage.rail_gaps(p)
    assert damage.shot_scars(p) == damage.shot_scars(p)
    assert damage.canvas_tears(p, 13, 9) == damage.canvas_tears(p, 13, 9)
    assert damage.splinter_spikes(p) == damage.splinter_spikes(p)


def test_three_rail_bays_are_shot_away_and_they_are_distinct(p):
    gaps = damage.rail_gaps(p)
    assert len(gaps) == damage.RAIL_GAPS == len(set(gaps))


def test_every_gap_names_a_bay_that_actually_exists(p):
    for run_i, sign, bay in damage.rail_gaps(p):
        t0, t1 = profiles.rail_runs(p)[run_i]
        assert 0 <= bay < len(profiles.stanchion_ts(p, t0, t1)) - 1
        assert sign in (-1.0, 1.0)


def test_a_gap_spans_its_own_bay_and_leaves_the_forward_stanchion_standing(p):
    for run_i, _sign, bay in damage.rail_gaps(p):
        t0, t1 = profiles.rail_runs(p)[run_i]
        ts = profiles.stanchion_ts(p, t0, t1)
        y_aft, y_fwd = damage.gap_y_span(p, run_i, bay)
        assert y_aft < y_fwd
        assert y_aft < profiles.station_y(p, ts[bay + 1])
        assert y_fwd < profiles.station_y(p, ts[bay]), "forward stanchion survives"


def test_the_damage_does_not_eat_the_whole_rail(p):
    total = sum(len(profiles.stanchion_ts(p, a, b)) - 1
                for a, b in profiles.rail_runs(p)) * 2
    assert len(damage.rail_gaps(p)) < total / 4


def test_every_tear_starts_at_a_leech_or_the_foot(p):
    nu, nv = 13, 9
    for _mast, _tier, i, j in damage.canvas_tears(p, nu, nv):
        assert i == 0 or i == nu - 2 or j == 0, "a hole in mid-canvas reads as a bug"
        assert 0 <= i <= nu - 2 and 0 <= j <= nv - 2


def test_tears_are_spread_over_more_than_one_sail(p):
    tears = damage.canvas_tears(p, 13, 9)
    assert len(tears) == damage.CANVAS_TEARS == len(set(tears))
    assert len({(m, k) for m, k, _i, _j in tears}) >= 3


def test_every_scar_lands_on_the_topside_between_the_water_and_the_sheer(p):
    for scar in damage.shot_scars(p):
        assert 0.0 < scar["z"] < profiles.sheer(p, scar["t"])
        assert 0.0 < scar["t"] < 1.0
        assert scar["radius"] > 0.0


def test_no_scar_straddles_a_gunport(p):
    """A scar across an aperture reads as a badly cut port, not as damage."""
    for scar in damage.shot_scars(p):
        y = profiles.station_y(p, scar["t"])
        sheer_z = profiles.sheer(p, scar["t"])
        near_port = any(
            abs(y - profiles.station_y(p, t)) < p.gun_decks[0].width
            for t in profiles.gunport_ts(p, 0)
        )
        if near_port:
            assert scar["z"] <= sheer_z - 1.4


def test_scars_fall_on_both_sides(p):
    signs = {scar["sign"] for scar in damage.shot_scars(p)}
    assert signs == {-1.0, 1.0}


def test_every_splinter_stands_up_from_the_bulwark_cap_inside_its_own_gap(p):
    spans = [damage.gap_y_span(p, run_i, bay) for run_i, _s, bay in damage.rail_gaps(p)]
    assert len(damage.splinter_spikes(p)) == damage.RAIL_GAPS * damage.SPLINTERS_PER_GAP
    for base, tip, half in damage.splinter_spikes(p):
        assert tip[2] > base[2]
        assert half > 0.0
        t = profiles.t_of_y(p, base[1])
        assert base[2] == pytest.approx(profiles.sheer(p, t) + p.bulwark_h)
        assert any(lo <= base[1] <= hi for lo, hi in spans)


# --- DEFECT 5: a tear in a sail the ship does not set ------------------------
#
# `canvas_tears` built its sail list as
# `[(m, k) for m in profiles.mast_names(p) for k in range(3)]` — the frigate's
# three tiers on every mast, written as a loop. The galleon sets two square
# sails on its fore, three on its main and a lateen on its mizzen, and the old
# list therefore tore `('fore', 2)`, canvas that does not exist. It is the same
# class of defect the ledger records for `rig.yard_order`'s
# `range(YARD_TIERS)`: a frigate's count mistaken for a fact about ships.


def test_canvas_tears_only_tear_canvas_the_SHIP_ACTUALLY_SETS():
    for ship in (FrigateParams(), GalleonParams()):
        sets = {(m, s.tier) for m, s in sailplan.all_sails(ship)
                if m is not None}
        for mast, tier, _i, _j in damage.canvas_tears(ship, 9, 7):
            assert (mast, tier) in sets, \
                f"{ship.collection} tore ({mast}, {tier}) and sets no such sail"


def test_the_galleon_sets_six_sails_on_its_masts_and_not_the_frigates_nine():
    """The premise, stated so it cannot drift: 2 fore + 3 main + 1 lateen."""
    G = GalleonParams()
    assert [(m, s.tier) for m, s in sailplan.all_sails(G) if m is not None] == [
        ("fore", 0), ("fore", 1),
        ("main", 0), ("main", 1), ("main", 2),
        ("mizzen", 0),
    ]


def test_the_frigates_tears_cannot_move_because_her_list_is_the_same_list(p):
    """The seeded draw picks out of this list, so if the list is identical the
    tears are identical. The frigate's derived list IS the hardcoded one it
    replaces, element for element and in the same order."""
    hardcoded = [(m, k) for m in profiles.mast_names(p) for k in range(3)]
    derived = [(m, s.tier) for m, s in sailplan.all_sails(p) if m is not None]
    assert derived == hardcoded
    assert len(derived) == 9
