"""DEVIATION B fixed by measurement: the galleon's lateen clears her poop.

No bpy.

The lateen's FOOT is the straight chord TACK (= the yard's HEEL) to CLEW. As
built before the spar on `GALLEON_RIG` was set, the poop's cap stepped 1.6000 m
at t 0.8100, y -10.5400 (quarterdeck cap 8.2791 to poop cap 9.8791) and the
foot chord stood at 9.2791 there: 0.6000 m INSIDE the poop's cap. The heel
stood 0.4492 m BELOW the rail cap at its own station.

A read-only sweep of 14,014 spars settled the fix (raising the mizzen truck
buys nothing, because every spar figure is a fraction of the span; every pass
SHORTENS the yard). The smallest change from as-built that passes every
constraint is a shorter, flatter yard, declared as data on `GALLEON_RIG`:
`LateenSpar(length_frac=0.82, slings_frac=0.30, mast_frac=0.54, rake_deg=44)`.

These are the invariants that sweep enforced, stated against the ship's own
rail reader so they hold for whatever spar a rig declares.
"""

import math

import pytest

from frigate import profiles, sailplan
from frigate.params import GalleonParams
from frigate.sailplan import LATEEN_CLEW_CLEAR

G = GalleonParams()
MIZZEN = "mizzen"
# the sweep's guard: mizzen TRUCK z over the yard's PEAK z
PEAK_UNDER_TRUCK = 0.95


def _lateen(p):
    return next(s for s in p.rig.mast(MIZZEN).sails
                if s.kind.name == "LATEEN")


def _corners(p=G):
    return sailplan.corners(p, MIZZEN, _lateen(p))


def _poop_break_t(p=G):
    """The poop's forward edge: the t0 of the HIGHEST platform run."""
    t0, _t1, _rise = max(profiles.platform_runs(p), key=lambda r: r[2])
    return t0


def _foot_z(tack, clew, y):
    """Height of the FOOT chord, TACK to CLEW, at station y."""
    s = (tack[1] - y) / (tack[1] - clew[1])
    return tack[2] + (clew[2] - tack[2]) * s


def _foot_minus_rail(p=G):
    """Every (foot chord z - rail_top_z) the foot passes over, with its y.

    Dense samples TACK to CLEW, AND each `platform_runs` boundary stepped
    2 * `profiles._RUN_EPS` either side: `_rail_tier_at` is inclusive and
    epsilon-tolerant, so one epsilon short of the poop break already reads
    the POOP's cap and the quarterdeck's only appears two epsilons short.
    """
    c = _corners(p)
    tack, clew = c.tack, c.clew
    lo, hi = sorted((clew[1], tack[1]))
    ys = [tack[1] + (clew[1] - tack[1]) * i / 4000.0 for i in range(4001)]
    step = 2.0 * profiles._RUN_EPS
    for t0, t1, _rise in profiles.platform_runs(p):
        for tb in (t0, t1):
            for t in (tb - step, tb, tb + step):
                if not 0.0 <= t <= 1.0:
                    continue
                y = profiles.station_y(p, t)
                if lo <= y <= hi:
                    ys.append(y)
    return [(_foot_z(tack, clew, y)
             - profiles.rail_top_z(p, profiles.t_of_y(p, y)), y) for y in ys]


# --- 1. THE FOOT CLEARS THE RAIL EVERYWHERE UNDER IT -------------------------


def test_the_foot_chord_clears_the_rail_cap_everywhere_tack_to_clew():
    """FOOT CHORD z less RAIL CAP z at the same station, minimum over the span.

    Before this fix the minimum was -0.6000, at the POOP BREAK y -10.5400.
    """
    worst, at_y = min(_foot_minus_rail())
    assert worst >= LATEEN_CLEW_CLEAR - 1e-9, (
        f"foot chord is {worst:.4f} m over the rail cap at y {at_y:.4f}")


def test_the_foot_clears_the_POOP_cap_at_the_break_itself():
    """FOOT CHORD at y -10.5400 against the POOP's cap 9.8791 at t 0.8100."""
    c = _corners()
    t_break = _poop_break_t()
    assert t_break == pytest.approx(0.8100, abs=1e-9)
    y_break = profiles.station_y(G, t_break)
    poop_cap = profiles.rail_top_z(G, t_break)
    assert poop_cap == pytest.approx(9.8791, abs=1e-4)
    assert _foot_z(c.tack, c.clew, y_break) - poop_cap >= LATEEN_CLEW_CLEAR


# --- 2. THE HEEL STANDS OVER ITS OWN RAIL ------------------------------------


def test_the_heel_stands_above_the_rail_cap_at_its_own_station():
    """HEEL z against rail_top_z at the HEEL's station. Was -0.4492."""
    heel, _slings, _peak, _r = profiles.lateen_spar(G, MIZZEN)
    cap = profiles.rail_top_z(G, profiles.t_of_y(G, heel[1]))
    assert heel[2] > cap


# --- 3. THE PEAK STAYS UNDER ITS OWN TRUCK -----------------------------------


def test_the_peak_stays_under_its_own_mizzen_truck():
    """MIZZEN TRUCK z over the yard's PEAK z, by the sweep's own guard."""
    _heel, _slings, peak, _r = profiles.lateen_spar(G, MIZZEN)
    assert profiles.mast_truck_z(G, MIZZEN) - peak[2] >= PEAK_UNDER_TRUCK


# --- 4. THE FIGURES, 4 dp, every endpoint named ------------------------------


def test_the_ruled_spar_s_corner_figures():
    """All z above the waterline, y aft negative, x 0."""
    heel, slings, peak, _r = profiles.lateen_spar(G, MIZZEN)
    c = _corners()
    assert c.tack == pytest.approx(heel, abs=1e-12)
    assert heel == pytest.approx((0.0, -7.6692, 10.3394), abs=1e-4)
    assert slings == pytest.approx((0.0, -10.6818, 13.2487), abs=1e-4)
    assert peak == pytest.approx((0.0, -17.7113, 20.0370), abs=1e-4)
    assert c.clew == pytest.approx((0.0, -15.5020, 12.4242), abs=1e-4)
    # clew station, raw: the clew is inboard of the taffrail, no clamp fires
    t_clew = profiles.t_of_y(G, c.clew[1])
    assert t_clew == pytest.approx(0.9559, abs=1e-4)
    assert c.clew[1] > profiles.station_y(G, 1.0)
    # yard HEEL to PEAK, and its rake and slings height
    assert profiles.lateen_length(G, MIZZEN) == pytest.approx(
        13.9602, abs=1e-4)
    # FOOT CHORD less rail_top_z: 1.2000 at the clew (by construction)...
    worst, at_y = min(_foot_minus_rail())
    assert worst == pytest.approx(1.2000, abs=1e-4)
    assert at_y == pytest.approx(c.clew[1], abs=1e-4)
    # ...and 1.2244 against the POOP cap 9.8791 at the break y -10.5400
    t_break = _poop_break_t()
    y_break = profiles.station_y(G, t_break)
    assert y_break == pytest.approx(-10.5400, abs=1e-4)
    assert _foot_z(c.tack, c.clew, y_break) \
        - profiles.rail_top_z(G, t_break) == pytest.approx(1.2244, abs=1e-4)
    # MIZZEN TRUCK 21.0800 over the PEAK
    assert profiles.mast_truck_z(G, MIZZEN) == pytest.approx(21.0800, abs=1e-4)
    assert profiles.mast_truck_z(G, MIZZEN) - peak[2] == pytest.approx(
        1.0430, abs=1e-4)
    # HEEL over rail_top_z at the heel's own station
    assert heel[2] - profiles.rail_top_z(G, profiles.t_of_y(G, heel[1])) \
        == pytest.approx(2.4986, abs=1e-4)
    # a real triangle: FOOT + LEECH - HEAD
    slack = (math.dist(c.tack, c.clew) + math.dist(c.clew, c.peak)
             - math.dist(c.tack, c.peak))
    assert slack == pytest.approx(2.0722, abs=1e-4)
