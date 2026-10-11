"""The galleon's KNEE OF THE HEAD, its top falling with the upper head rail.

The maintainer's third ruling (2026-10-06, E): reshape the knee to flow upward with
the sheer of the headrails instead of splitting the beakhead flight round
it. Until then its top ran LEVEL at the stem head, z 4.55, from y 16.88 to
the beak at y 19.53 -- past the upper rail's own end (z 3.77 at y 18.66)
and over the lion's back -- so every platform after the first had to be
split port and starboard beside it.

Pure geometry, no bpy. BOTH ENDPOINTS OF EVERY FIGURE ARE NAMED:

  * offset   -- the BUILT upper rail's inboard top edge (ring 3 of
                `upper_rail_rings`, straight between its stations) to the
                KNEE TOP at the same y;
  * fit      -- a platform's UNDERSIDE to the KNEE TOP under it, at every y
                of its span;
  * the lion -- the KNEE TOP to the carving's SURFACE (its quads sampled
                between rings, as Task 7's fix measured the lion) over the
                knee's own thickness, at the same y.
"""

import pytest

from frigate import carving, head, lion, profiles
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()
H = G.head_form
C = H.deck_clear

RAIL = [(r[3][1], r[3][2]) for r in head.upper_rail_rings(G, 1.0)]


def _interp(line, y):
    for (ya, za), (yb, zb) in zip(line, line[1:]):
        if ya <= y <= yb:
            return za + (zb - za) * (y - ya) / (yb - ya)
    raise AssertionError(f"{y} is off the line")


def _rail_top(y):
    """The BUILT upper rail's inboard top edge at y, read off the rings
    Headrails bridges, not through `head`'s own helper."""
    return _interp(RAIL, y)


def _knee_top_line(p):
    """(y, z) of the knee's top edge as the mesh carries it: the highest
    corners of each ring `headworks` bridges, aft to forward."""
    out = []
    for ring in head.knee_rings(p):
        z = max(pt[2] for pt in ring)
        ys = {pt[1] for pt in ring if pt[2] == z}
        out += [(y, z) for y in sorted(ys)]
    return out


KNEE = _knee_top_line(G)
PLATS = head.beakhead_platforms(G)


def _knee_top(y):
    return _interp(KNEE, y)


def _surface(along=10, around=4, groups=None):
    """Points on the carving's SURFACE, every quad between neighbouring
    rings of a ring group (all, or those indexed by `groups`) sampled
    `along` x `around`."""
    out = []
    every = carving.ring_groups(G)
    for group in (every if groups is None else [every[i] for i in groups]):
        for a, b in zip(group, group[1:]):
            n = len(a)
            for i in range(n):
                j = (i + 1) % n
                for s in range(along + 1):
                    f = s / along
                    p0 = [a[i][k] + (b[i][k] - a[i][k]) * f for k in range(3)]
                    p1 = [a[j][k] + (b[j][k] - a[j][k]) * f for k in range(3)]
                    for t in range(around + 1):
                        g = t / around
                        out.append(tuple(p0[k] + (p1[k] - p0[k]) * g
                                         for k in range(3)))
    return out


# --- the switch --------------------------------------------------------------

def test_hers_falls_with_the_rail_and_the_frigates_does_not():
    assert H.knee_under_rail is True
    assert F.head_form.knee_under_rail is False


def test_a_knee_under_the_rail_needs_a_flight_to_take_its_offset_from():
    from frigate import shiptype as st
    with pytest.raises(ValueError, match="knee_under_rail"):
        st.HeadForm(knee_under_rail=True).validate()


def test_the_frigates_knee_is_the_level_topped_fin_it_always_was():
    tops = {max(pt[2] for pt in ring) for ring in head.knee_rings(F)}
    assert max(tops) == profiles.sheer(F, 0.0)
    assert len(head.knee_rings(F)) == len(F.head_form.knee_outline)


# --- the offset --------------------------------------------------------------

def test_the_offset_is_the_flights_rise_depth_clearance_and_steepest_step():
    """RAIL INBOARD TOP to KNEE TOP: the flight's rail rise (0.120) + a
    platform's depth (0.070) + the named margin, `deck_clear` (0.020) plus
    the flight's steepest STEP (one platform's top to the next one's top).
    A level platform's top stands the rise under the rail at its FORWARD
    end, so at its AFT end the rail -- and a knee following it -- stand one
    full step higher; the step is what the margin has to swallow.
    Measured: the steepest step is 0.3350, P1 top z 4.4807 to P2 top
    z 4.1457, so the offset is 0.5450."""
    steps = [a["top"] - b["top"] for a, b in zip(PLATS, PLATS[1:])]
    want = H.deck_rail_rise + H.deck_thick + C + max(steps)
    assert head.knee_rail_offset(G) == pytest.approx(want, abs=1e-12)
    assert max(steps) == pytest.approx(0.3350, abs=5e-5)
    assert head.knee_rail_offset(G) == pytest.approx(0.5450, abs=5e-5)


def test_its_top_is_the_stem_head_until_the_rail_comes_down_to_it():
    """KNEE TOP aft: the stem head (sheer at the stem, z 4.55) where the
    knee is let into the stem, and level until the rail's inboard top edge
    stands the offset above it; from there it falls."""
    z_head = profiles.sheer(G, 0.0)
    off = head.knee_rail_offset(G)
    y_aft = profiles.station_y(G, 0.0) - H.knee_into_stem
    assert KNEE[0] == (pytest.approx(y_aft, abs=1e-12), z_head)
    level = [y for y, z in KNEE if z == z_head]
    y_fall = max(level)
    assert _rail_top(y_fall) - z_head == pytest.approx(off, abs=1e-9)
    assert all(z < z_head for y, z in KNEE if y > y_fall)


def test_it_falls_with_the_built_rail_at_the_offset_to_the_rails_end():
    """RAIL INBOARD TOP to KNEE TOP, at every rail station from where the
    knee leaves the stem head to the rail's forward end (where the rail
    dies into the lion): exactly the offset, and between stations too,
    since the knee's top is the rail's own chords let down."""
    off = head.knee_rail_offset(G)
    z_head = profiles.sheer(G, 0.0)
    y_fall = max(y for y, z in KNEE if z == z_head)
    y_end = RAIL[-1][0]
    stations = [y for y, _z in RAIL if y_fall < y <= y_end]
    assert len(stations) >= 5
    for y in stations:
        assert _rail_top(y) - _knee_top(y) == pytest.approx(off, abs=1e-9)
    for k in range(201):
        y = y_fall + (y_end - y_fall) * k / 200
        assert _rail_top(y) - _knee_top(y) == pytest.approx(off, abs=1e-9)


def test_forward_of_the_rails_end_it_runs_level_out_to_the_cutwater():
    """KNEE TOP forward of the rail's end: the rail's end height, level,
    to the cutwater's forward edge (`knee_outline`) at that height."""
    y_end, z_rail = RAIL[-1]
    z_end = z_rail - head.knee_rail_offset(G)
    fwd = [(y, z) for y, z in KNEE if y >= y_end]
    assert all(z == pytest.approx(z_end, abs=1e-12) for _y, z in fwd)
    tip = KNEE[-1]
    # the cutwater's forward edge at the tip's height, off the outline
    z_foot, z_head = profiles.keel_z(G, 0.0), profiles.sheer(G, 0.0)
    reach = H.knee_reach_frac * (z_head - z_foot)
    edge = [(profiles.station_y(G, 0.0) + q * reach,
             z_foot + f * (z_head - z_foot)) for f, q in H.knee_outline]
    for (ya, za), (yb, zb) in zip(edge, edge[1:]):
        if za <= tip[1] <= zb:
            y_edge = ya + (yb - ya) * (tip[1] - za) / (zb - za)
            break
    assert tip[0] == pytest.approx(y_edge, abs=1e-12)


# --- the flight fits over it -------------------------------------------------

def test_an_unsplit_platform_fits_between_the_knee_and_the_rail_everywhere():
    """PLATFORM UNDERSIDE to KNEE TOP, at every y of every platform's span
    (201 samples and every knee vertex in it): never under `deck_clear`,
    and exactly that at the steepest step's aft end, where the knee is
    highest under the platform it is cut for. This is what lets the flight
    pass over the knee unsplit."""
    gaps = []
    for pl in PLATS:
        ys = [pl["y_aft"] + (pl["y_fwd"] - pl["y_aft"]) * k / 200
              for k in range(201)]
        ys += [y for y, _z in KNEE if pl["y_aft"] <= y <= pl["y_fwd"]]
        for y in ys:
            gap = pl["bottom"] - _knee_top(y)
            assert gap >= C - 1e-12, (pl, y, gap)
            gaps.append(gap)
    assert min(gaps) == pytest.approx(C, abs=1e-12)


# --- the lion ----------------------------------------------------------------

SURFACE = _surface()
BODY = [pt for pt in _surface(groups=[0])]


def _over_the_knee(pts, y, band=0.01):
    """z of the carving's surface points over the knee's own thickness
    (|x| <= knee_half) within `band` of y."""
    return [z for x, yy, z in pts
            if abs(x) <= H.knee_half and abs(yy - y) <= band]


def test_it_meets_the_lions_rump_at_the_rumps_own_height():
    """At the lion's HEEL (the rump ring's centre, `lion.axis`, y 18.45
    z 3.30) the KNEE TOP stands inside the RUMP RING (the body's aft ring)
    over the knee's thickness: above its lowest point and under its
    highest by `deck_clear` at least -- it enters the lion through its
    rump, neither over its back nor under its belly. Measured: knee top
    z 3.2802; rump ring z 3.1234 .. 3.4767 over the knee, so 0.1576 above
    the one and 0.1971 under the other."""
    heel, _up, _fwd = lion.axis(G)
    rump = carving.ring_groups(G)[0][0]
    zs = [pt[2] for pt in rump if abs(pt[0]) <= H.knee_half]
    z = _knee_top(heel[1])
    assert z - min(zs) >= C and max(zs) - z >= C
    assert z == pytest.approx(3.2802, abs=5e-5)
    assert z - min(zs) == pytest.approx(0.1576, abs=5e-5)
    assert max(zs) - z == pytest.approx(0.1971, abs=5e-5)


def test_nowhere_does_it_stand_over_the_lions_back():
    """KNEE TOP to the HIGHEST point of the lion's BODY surface over the
    knee's thickness, at every y the body stands over the knee: never
    less than `deck_clear`. The old level top stood 0.009 m OVER the
    lion's back, a fin showing through it. Measured: least 0.1582, at
    y 18.37 just forward of the rump (the tail is not the back: it lies
    along the knee's top, and the knee crosses its aft bend: the
    Headrails x Figurehead joint)."""
    y0 = min(pt[1] for pt in BODY)
    y1 = KNEE[-1][0]
    clears = []
    for k in range(241):
        y = y0 + (y1 - y0) * k / 240
        zs = _over_the_knee(BODY, y)
        if zs:
            clears.append(max(zs) - _knee_top(y))
    assert len(clears) > 200
    assert min(clears) >= C
    assert min(clears) == pytest.approx(0.1582, abs=5e-5)


# --- what it costs -----------------------------------------------------------

def test_headrails_declares_the_knee_it_builds():
    """`headrail_triangles` counts the knee's own rings, so the declared
    figure follows the loft the knee is. The frigate's is unchanged."""
    rings = len(head.knee_rings(G))
    h = G.head_form
    assert head.headrail_triangles(G) == (
        2 * (2 * (h.headrail_stations - 1) * 4 + 4)
        + 2 * (2 * (h.upper_stations - 1) * 4 + 4)
        + 2 * h.head_timbers * 12
        + 2 * (rings - 1) * 4 + 4)
    assert head.headrail_triangles(F) == 412 - 2 * 12


def test_a_flight_of_one_platform_has_no_offset(monkeypatch):
    """`knee_rail_offset` is cut for the flight's steepest STEP; a flight
    of one platform has none, and is refused by name rather than with
    `max()`'s bare error (deferred minor, ledger 3847)."""
    one = head._flight_levels(G)[:1]
    monkeypatch.setattr(head, "_flight_levels", lambda p: one)
    with pytest.raises(ValueError, match="two platforms"):
        head.knee_rail_offset(G)
