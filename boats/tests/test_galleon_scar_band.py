"""Task 11 (A'') -- a second scar band between her midship lower ports. Pure.

The maintainer's third ruling, A'': shot scars on the timber between the midship
lower ports. R11: a second band amidships between the hull-row columns at
the row's height, clear of every aperture by the existing reach rule.

Before it: `shot_scars` kept every scar clear of both rows' apertures and
the chainplate straps with the reach rule, so 7 of her 9 landed aft of t
0.63 or forward of t 0.15 -- her hull row fills the topside band amidships.
Every figure below names both of its endpoints.
"""

import dataclasses

import pytest

from frigate import damage, profiles
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()

REACH = damage.SCAR_R * damage.SCAR_JITTER[1] + G.damage_form.scar_margin


def _strips(kind):
    return [s for s in damage.scar_strips(G) if s["kind"] == kind]


def test_her_damage_plan_carries_a_band_between_her_hull_ports():
    """Data on her damage form, naming the row whose columns host it; the
    frigate's has none (her scars are SHA-1 pinned and do not move:
    tests/test_galleon_furniture.py)."""
    assert G.damage_form.between_ports == "main"
    assert profiles.gun_deck(G, 0).name == "main"
    assert profiles.gun_deck(G, 0).host == "hull"
    assert F.damage_form.between_ports is None
    assert damage.scar_strips(F) == []


def test_a_band_on_a_bulwark_row_is_refused():
    """The band is hull timber: a row cut in the bulwark has none between
    its ports for a scar cut into the hull."""
    bad = G.with_(damage_form=dataclasses.replace(G.damage_form,
                                                  between_ports="waist"))
    with pytest.raises(ValueError, match="hull"):
        damage.shot_scars(bad)
    worse = G.with_(damage_form=dataclasses.replace(G.damage_form,
                                                    between_ports="orlop"))
    with pytest.raises(ValueError, match="orlop"):
        damage.shot_scars(worse)


def test_the_strips_between_her_hull_ports_fit_a_crater_and_its_reach():
    """BETWEEN PORTS: PORT AFT EDGE to the next PORT FORE EDGE in the hull
    row, 1.118 m at every one of her 11 gaps, against the 1.100 m a crater
    needs -- the REACH (largest radius 0.50 + scar_margin 0.05) from each
    edge -- so each leaves a 0.018 m window for the scar centre, and the
    band draws from all 11."""
    gaps = _strips("between_ports")
    assert len(gaps) == profiles.gun_deck(G, 0).n_ports - 1 == 11
    for s in gaps:
        assert s["width"] == pytest.approx(1.118, abs=5e-4)
        assert s["need"] == pytest.approx(2.0 * REACH) == pytest.approx(1.10)
        assert s["window"] == pytest.approx(s["width"] - s["need"])
        assert s["window"] == pytest.approx(0.018, abs=5e-4)
        assert s["on_hull"] and s["drawn"]
        y0, y1 = s["centre_y"]
        assert y1 - y0 == pytest.approx(s["window"])


def test_the_strip_over_her_hull_row_stands_on_the_bulwark_and_is_not_drawn():
    """HEAD TO SILL: HULL-ROW PORT HEAD to the WAIST-ROW PORT SILL over it,
    at each of the 9 columns the rows share (`align`), 1.31-1.32 m: wider
    than the 1.10 m a crater needs, but the window its centre must stand
    in, HEAD + REACH to SILL - REACH, lies wholly ABOVE THE SHEER (SHEER
    +0.08 to +0.29 m), on the bulwark, and a scar is cut into the HULL
    (`Damage` INTO `Hull`). Named, measured, and not drawn."""
    over = _strips("head_to_sill")
    assert len(over) == profiles.gun_deck(G, 1).n_ports == 9
    for s in over:
        assert 1.30 < s["width"] < 1.33
        assert s["window"] > 0.0
        lo, hi = s["centre_z"]
        sheer = profiles.sheer(G, s["t"])
        assert lo > sheer
        assert 0.07 < lo - sheer < 0.10 and 0.27 < hi - sheer < 0.31
        assert not s["on_hull"] and not s["drawn"]


def _amidships(p):
    return [s for s in damage.shot_scars(p) if 0.25 <= s["t"] <= 0.75]


def test_a_third_of_her_scars_land_amidships_and_the_band_puts_them_there():
    """t 0.25..0.75: at least a third of her nine, AND more than the same
    ship draws with the band taken off. Task 8b's topside-only draw already
    put three there (t 0.281, 0.639, 0.716 -- the brief's "7 of 9 aft of t
    0.63 or forward of 0.15" counts 0.639 and 0.716 as aft), so "a third"
    alone could not tell the band from its absence; the share it ADDS is
    what is pinned."""
    without = G.with_(damage_form=dataclasses.replace(G.damage_form,
                                                      between_ports=None))
    assert len(_amidships(without)) == 3
    assert len(_amidships(G)) >= damage.SHOT_SCARS / 3
    assert len(_amidships(G)) > len(_amidships(without))


def test_her_band_scars_stand_between_her_hull_ports_at_the_rows_height():
    """A scar drawn from the band has its CENTRE in one gap's window and
    between that row's SILL and HEAD at its own station; every one of them
    keeps the reach from every aperture (`scar_port_gap`)."""
    windows = [s for s in _strips("between_ports") if s["drawn"]]
    deck = profiles.gun_deck(G, 0)
    banded = []
    for s in damage.shot_scars(G):
        y = profiles.station_y(G, s["t"])
        hit = [w for w in windows
               if w["centre_y"][0] - 1e-9 <= y <= w["centre_y"][1] + 1e-9]
        if not hit:
            continue
        floor = profiles.row_floor_z(G, s["t"], 0)
        assert floor + deck.sill <= s["z"] <= floor + deck.head
        banded.append(s)
    assert len(banded) >= 3
    for s in damage.shot_scars(G):
        assert damage.scar_port_gap(G, s["t"], s["z"]) > REACH


def test_her_draw_stays_seeded_and_inside_its_guard():
    """The same nine every time, inside half the 500-draw guard."""
    assert damage.shot_scars(G) == damage.shot_scars(G)
    assert damage.scar_draws(G) <= damage.SCAR_DRAW_GUARD // 2


def _leaf_gap(p, t, z):
    """SCAR CENTRE to the nearest point of any open lid's HINGE LEAF: the
    lid's own width (`LID_W`, 0.08 m wider a side than her hull port)
    along its hinge at the port head, `LID_THICK` deep under it. Measured
    here from `lid_placements`, not from `damage`."""
    import math
    y = profiles.station_y(p, t)
    best = math.inf
    for lid in profiles.lid_placements(p):
        if lid["kind"] != "broadside":
            continue
        _x, ly, lz = lid["hinge"]
        dy = max(ly - profiles.LID_W / 2.0 - y, 0.0,
                 y - ly - profiles.LID_W / 2.0)
        dz = max(lz - profiles.LID_THICK - z, 0.0, z - lz)
        best = min(best, math.hypot(dy, dz))
    return best


def test_no_scar_of_hers_reaches_an_open_lids_hinge_leaf():
    """The reach rule judged the APERTURE; an open hull lid is 1.02 m wide
    on a 0.86 m port, so its hinge leaf overhangs the port edge by 0.08 m
    a side along the head. Blender found it: a band scar (t 0.4038, z
    2.592, r 0.488) under PortLid_09's leaf, SCAR CENTRE to LEAF END 0.474
    m, Damage x PortLid_ 3 face pairs. Every scar keeps the reach from
    every leaf too."""
    for s in damage.shot_scars(G):
        assert _leaf_gap(G, s["t"], s["z"]) > REACH, (round(s["t"], 4),
                                                      round(s["z"], 3))
    assert damage.scar_lid_gap(G, 0.5, 2.0) == pytest.approx(
        _leaf_gap(G, 0.5, 2.0))
