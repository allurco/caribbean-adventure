"""The ship's head, judged as pure geometry. No bpy anywhere in this file.

The one property every other assertion here hangs off: the head rail and the
trailboard it meets are not two curves that nearly agree, they are ONE curve
sampled over two ranges of the same parameter. That is what `test_the_rail_and
_the_trailboard_are_one_curve` pins down, and it is why no tolerance has to be
chosen for the join.
"""

import math

import pytest

from frigate import head, profiles
from frigate.params import FrigateParams


@pytest.fixture
def p():
    return FrigateParams()


def _slopes(points):
    """Secant dz/dy between consecutive (x, y, z) points, aft to forward."""
    return [(b[2] - a[2]) / (b[1] - a[1]) for a, b in zip(points, points[1:])]


# --- the curve itself ------------------------------------------------------

def test_the_head_curve_passes_through_both_trailboard_landmarks(p):
    y0, z0 = head.head_curve(p, 0.0)
    y1, z1 = head.head_curve(p, 1.0)
    assert (y0, z0) == pytest.approx(profiles.trailboard_aft(p), abs=1e-12)
    assert (y1, z1) == pytest.approx(profiles.trailboard_fwd(p), abs=1e-12)
    # And those two landmarks are still where the frozen frigate had them,
    # now that they are derived off the stem and the rail cap rather than
    # written down as absolute coordinates.
    assert (y0, z0) == pytest.approx((18.10, 4.30), abs=1e-12)
    assert (y1, z1) == pytest.approx((19.35, 3.66), abs=1e-12)


def test_the_analytic_slope_agrees_with_the_trailboards_own_stations(p):
    """`head_curve_slope` is the tangent of the very curve `profiles` samples."""
    edge = profiles.trailboard_top_edge(p, 1.0)
    for i, (a, b) in enumerate(zip(edge, edge[1:])):
        n = p.head_form.board_stations - 1
        u_a, u_b = i / n, (i + 1) / n
        secant = (b[2] - a[2]) / (b[1] - a[1])
        # A secant of a convex curve is bracketed by the tangents at its ends.
        assert head.head_curve_slope(p, u_a) <= secant <= head.head_curve_slope(p, u_b)


def test_the_rail_and_the_trailboard_are_one_curve(p):
    """The lower rail's forward RING is the trailboard's aft ring, exactly.

    Not "within a millimetre": the rail is cut from the same analytic curve
    with the same section, so the two four-cornered sections are the same four
    points. A seam at the join would show on the one part of the ship a viewer
    looks at first.
    """
    for sign in (1.0, -1.0):
        rail = head.lower_rail_rings(p, sign)
        board = profiles.trailboard_rings(p, sign)
        assert len(rail[-1]) == len(board[0]) == 4
        for got, want in zip(rail[-1], board[0]):
            assert got == pytest.approx(want, abs=1e-12)


def test_the_whole_head_line_is_fair_from_the_bulwark_to_the_figure(p):
    """Bulwark cap, head rail, trailboard, figure: no kink and no inflection.

    `check_dressing` already holds the trailboard portion to this. The rail is
    the part that could break it, by leaving the join at a slope that does not
    continue the trailboard's own.
    """
    for sign in (1.0, -1.0):
        line = head.head_line(p, sign)
        slopes = _slopes(line)
        assert len(slopes) >= 10
        for s0, s1 in zip(slopes, slopes[1:]):
            assert s1 > s0, f"kink at slope {s0} -> {s1}"
        # Steep where it leaves the ship, running out level at the figure.
        assert slopes[0] < -1.5
        assert abs(slopes[-1]) < 0.12


def test_the_lower_rail_springs_exactly_off_the_bulwark_cap(p):
    """Both endpoints named: head-rail-aft-end to bulwark-cap-at-that-station."""
    for sign in (1.0, -1.0):
        x, y, z = head.lower_rail_points(p, sign)[0]
        cap = profiles.sheer(p, profiles.t_of_y(p, y)) + p.bulwark_h
        assert z == pytest.approx(cap, abs=1e-9)
        assert y < profiles.trailboard_aft(p)[0]


def test_the_lower_rail_stands_proud_of_the_bow_it_is_bolted_to(p):
    for sign in (1.0, -1.0):
        for x, y, z in head.lower_rail_points(p, sign):
            skin = profiles.bulwark_half_width(p, profiles.t_of_y(p, y), z)
            assert abs(x) > skin
            assert math.copysign(1.0, x) == sign


def test_the_head_board_width_rule_is_the_trailboards_own(p):
    """The rail's outer face and the trailboard's are computed the same way.

    `profiles.trailboard_top_edge` grew this rule first. The rail re-derives it
    rather than importing it, so this test is what keeps the two in step.
    """
    for pt in profiles.trailboard_top_edge(p, 1.0):
        assert head.board_half_width(p, pt[1], pt[2]) == pytest.approx(pt[0], abs=1e-12)


# --- the upper rail --------------------------------------------------------

def test_the_upper_rail_springs_off_the_forward_end_of_the_ships_own_rail(p):
    """Both endpoints named: upper-head-rail-aft-end to forecastle-rail-fore-end."""
    t0 = profiles.rail_runs(p)[0][0]
    for sign in (1.0, -1.0):
        x, y, z = head.upper_rail_points(p, sign)[0]
        assert y == pytest.approx(profiles.station_y(p, t0), abs=1e-12)
        assert z == pytest.approx(profiles.rail_top_z(p, t0), abs=1e-12)


def test_the_upper_rail_dies_into_the_figurehead(p):
    lo, hi = profiles.figure_bounds(p)
    for sign in (1.0, -1.0):
        x, y, z = head.upper_rail_points(p, sign)[-1]
        assert lo[1] < y < hi[1]
        assert lo[2] < z < hi[2]
        assert abs(x) < hi[0]


def test_the_two_rails_converge_forward(p):
    """The gap between them narrows at every station, never widens."""
    for sign in (1.0, -1.0):
        gaps = head.rail_gaps(p, sign)
        assert gaps[0] > 2.0 * gaps[-1]
        for g0, g1 in zip(gaps, gaps[1:]):
            assert g1 < g0
        assert gaps[-1] > 0.0


def test_the_upper_rail_is_fair_too(p):
    for sign in (1.0, -1.0):
        slopes = _slopes(head.upper_rail_points(p, sign))
        for s0, s1 in zip(slopes, slopes[1:]):
            assert s1 > s0


def _clear_of_bowsprit(p, pt):
    """(distance from `pt` to the bowsprit AXIS) minus (the spar's radius there).

    Distance to the axis in three dimensions, not horizontal separation. The
    first version of this test compared |x| against the radius alone, which
    treats the spar as an infinite vertical cylinder: it condemned a rail
    station standing 1.55 m BELOW the bowsprit, and it would equally have
    passed a rail buried in the spar at the same height but further outboard.
    """
    heel, tip, r_heel, r_tip = profiles.bowsprit_segment(p)
    axis = [t - h for t, h in zip(tip, heel)]
    d = [c - h for c, h in zip(pt, heel)]
    span = sum(a * a for a in axis)
    f = max(0.0, min(1.0, sum(a * b for a, b in zip(d, axis)) / span))
    off = math.dist(pt, [h + f * a for h, a in zip(heel, axis)])
    return off - (r_heel + f * (r_tip - r_heel))


def test_the_head_rails_pass_clear_of_the_bowsprit(p):
    """In a sheer draught the head rails cross the bowsprit; in three
    dimensions they must pass clear of it, or the rail is inside the spar.

    Every CORNER of every rail section is tested, not just the outer edge the
    curve is built on: the inner corners are the ones nearest the spar.
    """
    for sign in (1.0, -1.0):
        rings = head.upper_rail_rings(p, sign) + head.lower_rail_rings(p, sign)
        worst = min(_clear_of_bowsprit(p, pt) for ring in rings for pt in ring)
        assert worst > head.BOWSPRIT_HOOP_PROUD, (
            f"head rail is {head.BOWSPRIT_HOOP_PROUD - worst:.3f} m inside a "
            "bowsprit hoop")


def test_the_upper_rails_heel_is_scarphed_into_the_ships_own_rail(p):
    """The heel reaches inboard over the forecastle rail; the rest does not.

    Both endpoints named: upper-head-rail-heel-inner-face to
    forecastle-rail-outer-face. A rail that merely butts the one it springs
    from leaves a seam the moment either moves.
    """
    assert head.upper_rail_thick(p, 0) > head.upper_rail_thick(p, 1)
    for sign in (1.0, -1.0):
        rings = head.upper_rail_rings(p, sign)
        inner = [min(abs(pt[0]) for pt in ring) for ring in rings]
        # The heel reaches further inboard than the station ahead of it does,
        # although it stands FURTHER OUTBOARD on the bow.
        assert abs(rings[0][0][0]) > abs(rings[1][0][0])
        assert inner[0] < inner[1]


# --- head timbers ----------------------------------------------------------

def test_head_timbers_stand_between_the_two_rails_and_shorten_forward(p):
    for sign in (1.0, -1.0):
        boxes = head.head_timber_boxes(p, sign)
        assert len(boxes) == p.head_form.head_timbers
        heights = []
        for lo, hi in boxes:
            assert lo[2] < hi[2]
            assert math.copysign(1.0, lo[0]) == math.copysign(1.0, hi[0]) == sign
            heights.append(hi[2] - lo[2])
        for h0, h1 in zip(heights, heights[1:]):
            assert h1 < h0
        ys = [0.5 * (lo[1] + hi[1]) for lo, hi in boxes]
        assert ys == sorted(ys)


def test_head_timbers_are_let_into_both_rails_rather_than_resting_on_them(p):
    for sign in (1.0, -1.0):
        for lo, hi in head.head_timber_boxes(p, sign):
            y = 0.5 * (lo[1] + hi[1])
            assert lo[2] < head.lower_z_at(p, y)
            assert hi[2] > head.upper_z_at(p, y)


# --- the knee of the head --------------------------------------------------

def test_the_knee_is_let_into_the_stem_and_reaches_from_forefoot_to_stem_head(p):
    rings = head.knee_rings(p)
    ys = [pt[1] for ring in rings for pt in ring]
    zs = [pt[2] for ring in rings for pt in ring]
    y_stem = profiles.station_y(p, 0.0)
    assert min(ys) < y_stem           # let into the stem it is bolted to
    assert max(ys) > y_stem           # and projecting forward of it
    assert min(zs) == pytest.approx(profiles.keel_z(p, 0.0), abs=1e-9)
    assert max(zs) == pytest.approx(profiles.sheer(p, 0.0), abs=1e-9)


def test_the_knee_swells_once_and_returns_to_the_stem_at_both_ends(p):
    """A cutwater's projection rises to one maximum and falls away again. Two
    maxima would be a wobble, and a flat run would be a plank, not a knee."""
    y_stem = profiles.station_y(p, 0.0)
    reach = [max(pt[1] for pt in ring) - y_stem for ring in head.knee_rings(p)]
    peak = reach.index(max(reach))
    assert 0 < peak < len(reach) - 1
    assert reach == sorted(reach[:peak + 1]) + sorted(reach[peak + 1:], reverse=True)
    assert reach[0] == pytest.approx(0.0, abs=1e-9)   # the gripe meets the forefoot


def test_the_knee_stays_clear_of_the_water_only_where_a_cutwater_should(p):
    """The gripe is the ONLY part below the waterline, and it is at the stem."""
    for ring in head.knee_rings(p):
        if min(pt[2] for pt in ring) < 0.0:
            assert max(pt[1] for pt in ring) - profiles.station_y(p, 0.0) < 0.2


# --- the beakhead bulkhead -------------------------------------------------

def test_the_beakhead_bulkhead_stands_at_the_bowsprit_heel(p):
    heel, _tip, _r0, _r1 = profiles.bowsprit_segment(p)
    lo, hi = head.beakhead_wall(p)
    assert lo[1] < heel[1] < hi[1]


def test_the_beakhead_bulkhead_is_let_into_both_bulwarks_and_the_deck(p):
    lo, hi = head.beakhead_wall(p)
    t = profiles.t_of_y(p, 0.5 * (lo[1] + hi[1]))
    cap = profiles.sheer(p, t) + p.bulwark_h
    outer = profiles.bulwark_half_width(p, t, cap)
    inner = outer - p.bulwark_thick
    assert lo[0] == pytest.approx(-hi[0], abs=1e-12)
    assert inner < hi[0] < outer          # into the bulwark, not through it
    assert hi[2] == pytest.approx(cap, abs=1e-9)
    assert lo[2] < profiles.deck_z_at(p, t, 0.0, p.fcastle_rise)


def test_the_beakhead_cap_sits_on_the_wall(p):
    wall_lo, wall_hi = head.beakhead_wall(p)
    cap_lo, cap_hi = head.beakhead_cap(p)
    assert cap_lo[2] <= wall_hi[2] < cap_hi[2]
    assert cap_hi[0] > wall_hi[0]         # the cap overhangs the wall it crowns


def test_the_bulkhead_stands_abaft_the_whole_head(p):
    """'The beakhead bulkhead behind': nothing of the head may be abaft it."""
    _lo, hi = head.beakhead_wall(p)
    for sign in (1.0, -1.0):
        for pt in head.head_line(p, sign):
            assert pt[1] > hi[1]
    assert min(pt[1] for ring in head.knee_rings(p) for pt in ring) > hi[1]


# --- what it costs ---------------------------------------------------------

def test_the_triangle_count_is_declared_and_inside_the_brief(p):
    assert head.headrail_triangles(p) + head.beakhead_triangles(p) == head.head_triangles(p)
    assert 400 <= head.head_triangles(p) <= 700


# --- the galleon inherits this rather than forking it ----------------------

def test_the_head_is_parameterised_off_the_hull_it_is_built_on(p):
    """A bigger, deeper ship gets a bigger, deeper head with no edit here.

    This module exists so the galleon reuses it. Nothing in it may be a
    constant measured off THIS frigate's bow.
    """
    big = FrigateParams(loa=52.0, beam=14.0, draft=6.2, deck_z=3.6, bulwark_h=2.1)
    big.validate()
    small = head.head_line(p, 1.0)
    large = head.head_line(big, 1.0)
    assert all(math.isfinite(c) for pt in large for c in pt)
    # The springing follows the bigger ship's own cap, not the frigate's.
    y_s = large[0][1]
    assert large[0][2] == pytest.approx(
        profiles.sheer(big, profiles.t_of_y(big, y_s)) + big.bulwark_h, abs=1e-9)
    assert large[0][2] > small[0][2]
    assert head.beakhead_wall(big)[1][1] > head.beakhead_wall(p)[1][1]


def test_every_head_point_is_finite_and_off_the_centreline_where_it_should_be(p):
    for sign in (1.0, -1.0):
        groups = (head.lower_rail_points(p, sign), head.upper_rail_points(p, sign))
        for pts in groups:
            for c in (c for pt in pts for c in pt):
                assert math.isfinite(c)
    for ring in head.knee_rings(p):
        for pt in ring:
            assert all(math.isfinite(c) for c in pt)
            assert abs(pt[0]) == pytest.approx(p.head_form.knee_half, abs=1e-12)
