"""The galleon's BEAKHEAD DECK, judged as pure geometry. No bpy here.

The maintainer ruled it mandatory: a platform FORWARD OF THE STEM, between the
two upper head rails, and then (2026-10-05) that it run the length of the
head as a flight stepping down past the knee, floored with grating cards;
since his third ruling (2026-10-06) the knee falls with the rail and the
flight is UNSPLIT, ending one rail station short of the lion's carving.
The first platform is the one tested by its outline here, the flight
below it. It is data on the galleon's head form, and the frigate's
head form leaves it off, so her `build_head` emits exactly what it emitted
before (that is `test_frigate_frozen`'s business; this file checks only that
she plans no deck at all).

BOTH ENDPOINTS OF EVERY FIGURE ARE NAMED:

  * plan width  -- centreline to the deck's outboard edge, against centreline
                   to the upper head rail's INBOARD face, at the same y;
  * height      -- deck top to the upper head rail's inboard TOP edge, at the
                   same y; deck underside to the KNEE OF THE HEAD's top face
                   (the stem head, `profiles.sheer(p, 0.0)`);
  * aft edge    -- deck's aft edge to the stem at the rail,
                   `profiles.station_y(p, 0.0)`.
"""

import math

import pytest

from frigate import budget, carving, head, lion, palette, profiles
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


_RAIL = {}


def _built(p, y):
    """(centreline to inboard face, inboard top z) of the starboard upper head
    rail AS HEADRAILS BUILDS IT: straight between the inboard-top corners of
    the rings `headworks` bridges. Read off the rings here rather than through
    `head`'s own helper, so the test measures the mesh's geometry itself."""
    if id(p) not in _RAIL:
        _RAIL[id(p)] = [(r[3][1], r[3][0], r[3][2])
                        for r in head.upper_rail_rings(p, 1.0)]
    rail = _RAIL[id(p)]
    for (ya, xa, za), (yb, xb, zb) in zip(rail, rail[1:]):
        if ya <= y <= yb:
            f = (y - ya) / (yb - ya)
            return xa + (xb - xa) * f, za + (zb - za) * f
    raise AssertionError(f"{y} is off the rail")


def _inboard_x(p, y):
    return _built(p, y)[0]


# --- the switch: hers on, the frigate's off ----------------------------------

def test_the_galleons_head_form_carries_the_deck_and_the_frigates_does_not():
    assert G.head_form.beakhead_deck is True
    assert F.head_form.beakhead_deck is False
    assert st.HeadForm().beakhead_deck is False


def test_the_frigate_plans_no_beakhead_deck():
    assert head.beakhead_deck_outline(F) == []
    assert head.beakhead_deck_timbers(F) == []
    assert head.beakhead_deck_triangles(F) == 0
    assert head.head_triangles(F) == 412


# --- the outline -------------------------------------------------------------

def test_the_outline_has_its_stated_stations_running_forward():
    out = head.beakhead_deck_outline(G)
    assert len(out) == G.head_form.deck_stations
    ys = [y for y, _w, _zt, _zb in out]
    assert ys == sorted(ys) and len(set(ys)) == len(ys)


def test_its_aft_edge_sits_a_named_clearance_forward_of_the_stem():
    y_aft = head.beakhead_deck_outline(G)[0][0]
    gap = y_aft - profiles.station_y(G, 0.0)
    assert math.isclose(gap, G.head_form.deck_stem_clear, abs_tol=1e-12)
    assert 0.0 < gap <= 0.05


def test_its_plan_width_shrinks_from_the_stem_towards_the_figure():
    widths = [w for _y, w, _zt, _zb in head.beakhead_deck_outline(G)]
    assert all(a > b for a, b in zip(widths, widths[1:]))
    # And it is a real platform, not a plank: over 0.8 m across at the stem.
    assert 2.0 * widths[0] > 0.8


def test_its_edge_stands_inboard_of_the_built_rails_inboard_face():
    """Centreline to deck edge, against centreline to the BUILT rail's inboard
    face at the same y: exactly `deck_clear` at the forward end, never less
    anywhere (sampled at 400 points AND at every rail station in between),
    and exactly `deck_clear` again at the rail station that binds it."""
    out = head.beakhead_deck_outline(G)
    clear = G.head_form.deck_clear
    y0, y1 = out[0][0], out[-1][0]
    assert math.isclose(_inboard_x(G, y1) - out[-1][1], clear, abs_tol=1e-12)
    # The deck edge is straight: read it off the outline's two ends, so the
    # 400 samples cost no re-derivation of the deck itself.
    w0, w1 = out[0][1], out[-1][1]

    def edge(y):
        return w0 + (w1 - w0) * (y - y0) / (y1 - y0)

    for (y, w, _zt, _zb) in out:
        assert math.isclose(edge(y), w, abs_tol=1e-12)
    rings = head.upper_rail_rings(G, 1.0)
    stations = [r[3][1] for r in rings if y0 < r[3][1] < y1]
    ys = [y0 + (y1 - y0) * k / 400 for k in range(401)] + stations
    assert min(_inboard_x(G, y) - edge(y) for y in ys) >= clear - 1e-12
    assert min(_inboard_x(G, y) - edge(y) for y in stations + [y0]) \
        == pytest.approx(clear, abs=1e-12)


def test_its_top_lies_below_the_upper_rails_inboard_top_edge_everywhere():
    """Deck top to the BUILT upper rail's inboard top edge, at each station.
    The smallest gap is at the forward end and is the stated rise exactly."""
    out = head.beakhead_deck_outline(G)
    gaps = [_built(G, y)[1] - zt for y, _w, zt, _zb in out]
    assert all(g > 0.0 for g in gaps)
    assert all(a > b for a, b in zip(gaps, gaps[1:]))
    assert math.isclose(gaps[-1], G.head_form.deck_rail_rise, abs_tol=1e-9)


def test_it_rides_clear_above_the_knee_of_the_head():
    """Deck underside to the knee's top face (the stem head), every station."""
    knee_top = max(pt[2] for ring in head.knee_rings(G) for pt in ring)
    assert knee_top == profiles.sheer(G, 0.0)
    for _y, _w, zt, zb in head.beakhead_deck_outline(G):
        assert math.isclose(zb - knee_top, G.head_form.deck_clear,
                            abs_tol=1e-12)
        assert math.isclose(zt - zb, G.head_form.deck_thick, abs_tol=1e-12)


def test_it_stands_clear_of_every_head_timber_it_passes():
    """A timber's inboard face against the deck edge at the same y, wherever
    the timber reaches the deck's height."""
    out = head.beakhead_deck_outline(G)
    y0, y1 = out[0][0], out[-1][0]
    for sign in (1.0, -1.0):
        for lo, hi in head.head_timber_boxes(G, sign):
            if hi[1] < y0 or lo[1] > y1:
                continue
            zb, zt = out[0][3], out[0][2]
            if hi[2] < zb or lo[2] > zt:
                continue
            inner = min(abs(lo[0]), abs(hi[0]))
            for y in (max(lo[1], y0), min(hi[1], y1)):
                w = head.beakhead_deck_half_width(G, y)
                assert inner - w > 0.01, (sign, lo, hi, w)


def test_it_passes_well_under_the_bowsprit_and_its_hoops():
    """Vertical clearance between the deck top and the bowsprit's underside
    (its axis less its radius and `head.BOWSPRIT_HOOP_PROUD`) at the same y,
    station by station. Measured, not floored: 2.8570 m between the deck top
    z 4.6400 and the spar's underside z 7.4970 at the deck's forward end
    (y 17.4833), and the least of them 2.5652 m at its aft end (y 17.0300),
    because the spar rises forward. Vertical is a lower bound on the true
    clearance, since the spar is not level.

    It was 3.2203 / 2.8402 with the forward end at y 17.6204: the lower
    battery left the bulwark (the maintainer's ruling 2026-10-05, R4), the waist cap
    dropped 0.55 m, and the bowsprit's heel and the head rails the deck is
    cut between came down with it while the deck top did not move."""
    heel, tip, r0, r1 = profiles.bowsprit_segment(G)
    clear = []
    for y, _w, zt, _zb in head.beakhead_deck_outline(G):
        f = (y - heel[1]) / (tip[1] - heel[1])
        axis_z = heel[2] + f * (tip[2] - heel[2])
        r = r0 + (r1 - r0) * f + head.BOWSPRIT_HOOP_PROUD
        clear.append(axis_z - r - zt)
    assert clear[-1] == pytest.approx(2.8282, abs=5e-5)
    assert min(clear) == clear[0] == pytest.approx(2.6761, abs=5e-5)


# --- the flight: level platforms stepping down over the knee --------------
#
# The maintainer's rulings: 2026-10-05, a flight stepping down the length of the
# head; 2026-10-06 (third ruling, E and F), unsplit over a knee that falls
# with the rail, ending one station short of the lion's carving. BOTH
# ENDPOINTS of every figure below:
#   * top        -- platform top to the BUILT upper rail's inboard top edge,
#                   at the platform's own forward end;
#   * drop       -- one platform's top to the next one's top;
#   * carving    -- a platform's slab to the carving's SURFACE, at any x;
#   * outboard   -- the platform's outboard edge to the built rail's inboard
#                   face, and to a head timber's inboard face, athwartships;
#   * below      -- the platform's underside to the highest point of the
#                   head's own geometry inside its plan footprint (the
#                   knee's top, since it falls with the rail).

PLATS = head.beakhead_platforms(G)
RAIL = [(r[3][1], r[3][0], r[3][2]) for r in head.upper_rail_rings(G, 1.0)]


def test_the_frigate_plans_no_flight():
    assert head.beakhead_platforms(F) == []
    assert head.beakhead_deck_timbers(F) == []
    assert head.beakhead_grating_cards(F) == []
    assert head.beakhead_grating_triangles(F) == 0


def test_the_first_platform_is_the_one_over_the_knee_as_built():
    first = PLATS[0]
    out = head.beakhead_deck_outline(G)
    assert first["x_in"] is None
    assert first["y_aft"] == out[0][0] and first["y_fwd"] == out[-1][0]
    assert first["top"] == out[0][2] and first["bottom"] == out[0][3]
    assert first["w_aft"] == pytest.approx(out[0][1], abs=1e-12)
    assert first["w_fwd"] == pytest.approx(out[-1][1], abs=1e-12)


def test_every_platform_spans_the_knee_unsplit():
    """The maintainer's third ruling (E): her knee's top falls with the rail
    (`tests/test_galleon_knee.py`), so no platform is split beside it."""
    assert len(PLATS) == 3
    for pl in PLATS:
        assert pl["x_in"] is None


def test_the_steps_stand_at_the_built_rails_own_stations():
    """Each platform after the first ends at a rail station Headrails
    bridges, the last one too (the maintainer's third ruling, F)."""
    stations = {round(y, 12) for y, _x, _z in RAIL}
    for pl in PLATS[1:]:
        assert round(pl["y_fwd"], 12) in stations
    for a, b in zip(PLATS, PLATS[1:]):
        assert a["y_fwd"] == b["y_aft"]


def _slab_holds_carving(y0, y1, bottom, top):
    """Carving SURFACE sample points (`SURFACE`) within `deck_clear` of a
    platform slab from y0 to y1, underside to top, at any x."""
    c = G.head_form.deck_clear
    return [pt for pt in SURFACE
            if y0 - c <= pt[1] <= y1 + c and bottom - c <= pt[2] <= top + c]


def test_the_flight_ends_at_the_last_station_clear_of_the_carving():
    """Forward end, DERIVED (the maintainer's third ruling, F, read by the
    controller as the rail station before the lion's CARVING measured on
    its surface): the last platform's slab holds no point of the carving's
    SURFACE, and one more platform, to the next rail station, would hold
    the lion's TAIL. Measured: the flight ends at the rail station
    y 17.8553; it runs 0.8253 m from its aft edge (y 17.0300), against
    1.3057 m split to the rump (Task 7) and 1.0932 m to y 18.1232."""
    last = PLATS[-1]
    assert not _slab_holds_carving(last["y_aft"], last["y_fwd"],
                                   last["bottom"], last["top"])
    nxt = min(y for y, _x, _z in RAIL if y > last["y_fwd"] + 1e-9)
    top = _built(G, nxt)[1] - G.head_form.deck_rail_rise
    hits = _slab_holds_carving(last["y_fwd"], nxt,
                               top - G.head_form.deck_thick, top)
    tail = lion.tail_rings(G)
    tail_ys = [pt[1] for r in tail for pt in r]
    assert hits and all(min(tail_ys) - 0.03 <= y <= max(tail_ys) + 0.03
                        for _x, y, _z in hits)
    assert last["y_fwd"] == pytest.approx(21.7833, abs=5e-5)
    assert nxt == pytest.approx(22.0752, abs=5e-5)
    assert last["y_fwd"] - PLATS[0]["y_aft"] \
        == pytest.approx(0.7533, abs=5e-5)


@pytest.mark.parametrize("k", range(len(PLATS)))
def test_each_top_stands_the_rail_rise_under_the_rail_at_its_fwd_end(k):
    """Top to the BUILT rail's inboard top edge at the platform's own
    forward end: exactly `deck_rail_rise`; and further everywhere aft of
    it over the platform's length (the rail climbs aft)."""
    pl = PLATS[k]
    gap = _built(G, pl["y_fwd"])[1] - pl["top"]
    assert gap == pytest.approx(G.head_form.deck_rail_rise, abs=1e-9)
    for i in range(41):
        y = pl["y_aft"] + (pl["y_fwd"] - pl["y_aft"]) * i / 40
        assert _built(G, y)[1] - pl["top"] >= gap - 1e-9


def test_the_flight_steps_down_by_the_rails_own_fall():
    """Measured: tops 4.6400, 4.4807, 4.1457; drops 0.1593, 0.3350.
    (Split to the rump they ran on to 3.8899 and 3.7553.)"""
    tops = [pl["top"] for pl in PLATS]
    assert all(a > b for a, b in zip(tops, tops[1:]))
    assert tops == pytest.approx([4.6400, 4.3419, 4.0400], abs=5e-5)
    for a, b in zip(PLATS[1:], PLATS[2:]):
        fall = _built(G, a["y_fwd"])[1] - _built(G, b["y_fwd"])[1]
        assert a["top"] - b["top"] == pytest.approx(fall, abs=1e-9)


def _carving_points():
    return [pt for g in carving.ring_groups(G) for r in g for pt in r]


def _carving_surface(along=10, around=4):
    """Points on the carving's SURFACE as Figurehead bridges it: every quad
    between two neighbouring rings of a ring group, sampled `along` x
    `around`. Independent of `head._inboard_edge`, which reads the rings'
    corners: a loft bulges between its rings, and the vertices alone said
    the lion's tail stood 0.020 off a half it stands 0.013 off."""
    out = []
    for group in carving.ring_groups(G):
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


SURFACE = _carving_surface()


def test_no_platform_slab_comes_near_the_carving():
    """Every platform's slab to the carving's SURFACE: no sample point
    within `deck_clear` of it, at any x. Unsplit, a platform has no
    inboard edge to stand off the carving; it must miss it altogether."""
    for pl in PLATS:
        assert not _slab_holds_carving(pl["y_aft"], pl["y_fwd"],
                                       pl["bottom"], pl["top"]), pl


def test_its_outboard_edge_clears_the_built_rail_and_the_head_timbers():
    c = G.head_form.deck_clear
    for pl in PLATS:
        def w(y, pl=pl):
            f = (y - pl["y_aft"]) / (pl["y_fwd"] - pl["y_aft"])
            return pl["w_aft"] + (pl["w_fwd"] - pl["w_aft"]) * f
        ys = [pl["y_aft"] + (pl["y_fwd"] - pl["y_aft"]) * k / 200
              for k in range(201)]
        assert min(_inboard_x(G, y) - w(y) for y in ys) >= c - 1e-12
        for lo, hi in head.head_timber_boxes(G, 1.0):
            if hi[1] < pl["y_aft"] or lo[1] > pl["y_fwd"]:
                continue
            if hi[2] < pl["bottom"] or lo[2] > pl["top"]:
                continue
            for y in (max(lo[1], pl["y_aft"]), min(hi[1], pl["y_fwd"])):
                assert lo[0] - w(y) >= c - 1e-12, (pl, lo, hi)
        # and exactly that at its forward end, off whichever binds
        assert any(
            abs(lim - w(pl["y_fwd"]) - c) < 1e-9
            for lim in [_inboard_x(G, pl["y_fwd"])]
            + [lo[0] for lo, hi in head.head_timber_boxes(G, 1.0)
               if lo[1] <= pl["y_fwd"] <= hi[1]])


def _head_below():
    """Points of the head's own geometry a platform could stand over: the
    carving's SURFACE (`SURFACE`), both lower rails' stations, every head
    timber's top corners, and the knee's TOP FACE sampled across its full
    run, falling with the rail since the maintainer's third ruling (E)."""
    pts = list(SURFACE)
    for sign in (1.0, -1.0):
        pts += head.lower_rail_points(G, sign)
        for lo, hi in head.head_timber_boxes(G, sign):
            pts += [(x, y, hi[2]) for x in (lo[0], hi[0])
                    for y in (lo[1], hi[1])]
    # the knee's top edge as the mesh carries it: each ring's highest
    # corners, aft to forward (since the maintainer's third ruling, E, it falls
    # with the rail), sampled along every segment between them
    top = []
    for ring in head.knee_rings(G):
        z = max(pt[2] for pt in ring)
        top += sorted({(pt[1], z) for pt in ring if pt[2] == z})
    k = G.head_form.knee_half
    for (ya, za), (yb, zb) in zip(top, top[1:]):
        for i in range(41):
            f = i / 40
            pts += [(x, ya + (yb - ya) * f, za + (zb - za) * f)
                    for x in (-k, k)]
    return pts


def _below(pl, pts):
    """(underside to the highest head point under its plan footprint, that
    point), or None when nothing of the head lies under it."""
    x_in = 0.0 if pl["x_in"] is None else pl["x_in"]
    under = [(z, (x, y, z)) for x, y, z in pts
             if pl["y_aft"] <= y <= pl["y_fwd"]
             and x_in <= abs(x) <= max(pl["w_aft"], pl["w_fwd"])
             and z <= pl["top"]]
    if not under:
        return None
    z, pt = max(under)
    return pl["bottom"] - z, pt


def test_nothing_of_the_head_stands_within_deck_clear_under_a_platform():
    """Underside to the highest point of the head's own geometry inside
    its plan footprint: never less than `deck_clear`; exactly that over
    the knee's top under the first platform."""
    c = G.head_form.deck_clear
    pts = _head_below()
    for pl in PLATS:
        got = _below(pl, pts)
        if got is not None:
            assert got[0] >= c - 1e-12, (pl, got)
    assert _below(PLATS[0], pts)[0] == pytest.approx(c, abs=1e-12)


def test_every_platform_is_its_frames_depth_and_no_deeper():
    """Platform top to its underside: `deck_thick`, every platform. A
    frame let down deeper would reach for whatever is under it while the
    clearance rule, re-derived around it, still read clear."""
    for pl in PLATS:
        assert pl["top"] - pl["bottom"] == pytest.approx(
            G.head_form.deck_thick, abs=1e-12)


def test_the_clearance_under_each_platform_is_as_measured():
    """Underside to the highest head point under it, measured: P0 0.0200
    to the knee's level top; P1 0.1986 to the knee's top at its aft end;
    P2 0.0200 to the knee's top at its aft end, the steepest step, which
    the knee's offset is cut for (`head.knee_rail_offset`)."""
    pts = _head_below()
    got = [_below(pl, pts) for pl in PLATS]
    want = [0.0200, 0.0267, 0.0200]   # P1 0.1986 on the 34 m hull
    for g, w in zip(got, want):
        if w is None:
            assert g is None, g
        else:
            assert g is not None and g[0] == pytest.approx(w, abs=5e-5), g


# --- the frame and the cards -------------------------------------------------


def test_every_piece_has_a_four_timber_frame_and_one_card():
    pieces = sum(1 if pl["x_in"] is None else 2 for pl in PLATS)
    assert pieces == len(PLATS) == 3
    assert len(head.beakhead_deck_timbers(G)) == 4 * pieces
    assert len(head.beakhead_grating_cards(G)) == pieces
    for rings in head.beakhead_deck_timbers(G):
        assert len(rings) == 2 and all(len(r) == 4 for r in rings)


def test_each_step_has_a_riser_up_to_the_platform_abaft_it():
    """Riser: the lower platform's aft head ledge, from its underside to
    the top of the platform abaft it."""
    timbers = head.beakhead_deck_timbers(G)
    for a, b in zip(PLATS, PLATS[1:]):
        risers = [t for t in timbers
                  if abs(t[0][0][1] - b["y_aft"]) < 1e-12
                  and abs(max(pt[2] for pt in t[0]) - a["top"]) < 1e-12
                  and abs(min(pt[2] for pt in t[0]) - b["bottom"]) < 1e-12]
        assert len(risers) == (1 if b["x_in"] is None else 2), (a, b)


def test_a_card_lies_at_its_platforms_top_inside_its_frame():
    h = G.head_form
    led, gap = h.deck_ledge, h.deck_grating_gap
    cards = head.beakhead_grating_cards(G)
    for quad in cards:
        assert len(quad) == 4
        zs = {pt[2] for pt in quad}
        assert len(zs) == 1
        z = zs.pop()
        pl = next(p for p in PLATS if abs(p["top"] - z) < 1e-12)
        ys = [pt[1] for pt in quad]
        assert min(ys) == pytest.approx(pl["y_aft"] + led + gap, abs=1e-12)
        assert max(ys) == pytest.approx(pl["y_fwd"] - led - gap, abs=1e-12)
        if pl["x_in"] is not None:
            assert min(abs(pt[0]) for pt in quad) == pytest.approx(
                pl["x_in"] + led + gap, abs=1e-12)
        # its winding faces UP on both sides: the z of the quad's normal,
        # by the shoelace sum over its four corners seen from above
        area = sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(quad, quad[1:] + quad[:1]))
        assert area > 0.0, ("card wound face-down", quad[0][0])


def test_the_last_platforms_opening_is_wider_than_a_bar_pitch():
    """The last platform's grating card, ledge face to ledge face across
    at its FORWARD end (its narrowest): more than one bar pitch
    (`palette.GRATING_PITCH`, 0.10), so it shows holes, not a moire. The
    0.044 opening of the split flight's last half was what the maintainer ruled
    out. Measured: 0.7764."""
    last = head.beakhead_grating_cards(G)[-1]
    y_fwd = max(pt[1] for pt in last)
    xs = [pt[0] for pt in last if pt[1] == y_fwd]
    opening = max(xs) - min(xs)
    assert opening > palette.GRATING_PITCH
    assert opening == pytest.approx(1.0423, abs=5e-5)


def test_every_card_has_an_opening_at_least_one_bar_wide():
    """Its narrowest inboard-to-outboard span, against one grating bar."""
    for quad in head.beakhead_grating_cards(G):
        a, b, c, d = quad
        assert min(math.dist(a, b), math.dist(c, d)) > palette.GRATING_BAR


def test_it_declares_its_own_triangles_and_the_head_counts_them():
    """Measured: 12 timbers 144, 3 cards 6 -- 150. The split flight to
    the rump drew 36 timbers 432 and 9 cards 18; the planked stub 364."""
    assert head.beakhead_deck_triangles(G) == 144
    assert head.beakhead_grating_triangles(G) == 6
    assert head.head_triangles(G) == (
        head.headrail_triangles(G) + head.beakhead_triangles(G)
        + head.beakhead_deck_triangles(G)
        + head.beakhead_grating_triangles(G))


# --- registered everywhere a new object must be ------------------------------


def test_its_timbers_are_deck_planking_and_its_cards_are_gratings():
    assert palette.family_of("Beakhead_Deck") == palette.DECK_PLANKING
    assert palette.look_of("Beakhead_Deck") == "deck"
    assert palette.family_of("Beakhead_Grating") == palette.GRATING
    assert budget.component_of(G, "Beakhead_Deck") == "rails"
    assert budget.component_of(G, "Beakhead_Grating") == "rails"


@pytest.mark.parametrize("kwargs, match", [
    (dict(deck_stations=2), "deck_stations"),
    (dict(deck_ledge=0.0), "deck_ledge"),
    (dict(deck_grating_gap=0.0), "deck_grating_gap"),
    (dict(deck_stem_clear=0.08), "deck_stem_clear"),
])
def test_a_deck_that_could_not_be_built_is_refused(kwargs, match):
    with pytest.raises(ValueError, match=match):
        st.HeadForm(beakhead_deck=True, **kwargs).validate()
