"""Task 8 — mast, yard, top and bowsprit layout. Pure, no bpy.

Measured off `La-penelope.webp` at 17.63 px/m with the waterline at y=719 px.
Every figure below names the span it covers.
"""

import math

import pytest

from frigate.params import FrigateParams
from frigate import profiles, wind


@pytest.fixture
def p():
    return FrigateParams()


# --- heights ----------------------------------------------------------------

def test_truck_heights_match_the_reference(p):
    """Waterline-to-truck, as a multiple of length overall. Truck pixels read
    y=125 (fore), 84 (main), 225 (mizzen) against a waterline at y=719."""
    for name, metres in (("fore", 33.7), ("main", 36.0), ("mizzen", 28.2)):
        assert profiles.mast_truck_z(p, name) == pytest.approx(metres, abs=0.6)


def test_the_main_is_the_tallest_and_the_mizzen_the_shortest(p):
    zs = {n: profiles.mast_truck_z(p, n) for n in profiles.mast_names(p)}
    assert zs["main"] > zs["fore"] > zs["mizzen"]


def test_every_mast_steps_on_the_gun_deck_not_in_mid_air(p):
    for name in profiles.mast_names(p):
        x, y, z = profiles.mast_foot(p, name)
        t = profiles.mast_t(p, name)
        assert x == 0.0
        assert y == pytest.approx(profiles.station_y(p, t))
        assert z == pytest.approx(profiles.deck_z_at(p, t, 0.0, 0.0))


def test_the_top_sits_at_the_same_fraction_of_every_mast(p):
    """The reference puts all three tops at 0.447 of their own truck height:
    15.0/33.7, 16.1/36.0, 12.7/28.2. That consistency is the parameter."""
    for name in profiles.mast_names(p):
        z_top, _half_x, _half_y = profiles.top_platform(p, name)
        assert z_top / profiles.mast_truck_z(p, name) == pytest.approx(0.45, abs=0.01)


def test_mast_segments_stack_from_foot_to_truck_without_a_gap(p):
    for name in profiles.mast_names(p):
        segs = profiles.mast_segments(p, name)
        assert len(segs) == 3
        assert segs[0][0] == pytest.approx(profiles.mast_foot(p, name)[2])
        assert segs[-1][1] == pytest.approx(profiles.mast_truck_z(p, name))
        for (_z0, z1, _r0, r1), (z2, _z3, r2, _r3) in zip(segs, segs[1:]):
            assert z2 < z1, "segments must overlap at the doubling, not butt"
            assert r2 <= r1 + 1e-9, "each mast above is thinner than the one below"


def test_every_mast_tapers_upward(p):
    for name in profiles.mast_names(p):
        for _z0, _z1, r0, r1 in profiles.mast_segments(p, name):
            assert r0 > r1 > 0.0


def test_the_main_lower_mast_is_thicker_than_the_mizzen(p):
    assert profiles.mast_segments(p, "main")[0][2] > profiles.mast_segments(p, "mizzen")[0][2]


# --- rake -------------------------------------------------------------------

def test_masts_rake_aft_and_progressively_so(p):
    rakes = []
    for name in profiles.mast_names(p):
        _x, y_foot, z_foot = profiles.mast_foot(p, name)
        _x2, y_truck, _z2 = profiles.mast_point(p, name, profiles.mast_truck_z(p, name))
        assert y_truck < y_foot, "the truck must stand aft of the foot"
        rakes.append(math.degrees(math.atan2(y_foot - y_truck,
                                             profiles.mast_truck_z(p, name) - z_foot)))
    assert rakes == sorted(rakes), "rake increases from fore to mizzen"
    assert max(rakes) < 4.0, "the reference's masts are near upright"


def test_the_mast_axis_stays_on_the_centreline(p):
    for name in profiles.mast_names(p):
        for z in (5.0, 15.0, 25.0):
            assert profiles.mast_point(p, name, z)[0] == 0.0


# --- yards ------------------------------------------------------------------

def test_three_yards_a_mast_gives_the_nine_sails_the_spec_asks_for(p):
    assert sum(len(profiles.yard_specs(p, n)) for n in profiles.mast_names(p)) == 9


def test_the_main_course_yard_is_measured_against_the_beam(p):
    """Yard length spans tip to tip, athwartships. A frigate's main yard runs
    about 1.45 times the maximum beam."""
    z, length, _r = profiles.yard_specs(p, "main")[0]
    assert length == pytest.approx(1.45 * p.beam, abs=0.1)
    assert z < profiles.top_platform(p, "main")[0], "the course yard hangs under the top"


def test_yards_shorten_going_up_each_mast_and_aft_along_the_ship(p):
    for name in profiles.mast_names(p):
        lengths = [length for _z, length, _r in profiles.yard_specs(p, name)]
        heights = [z for z, _l, _r in profiles.yard_specs(p, name)]
        assert lengths == sorted(lengths, reverse=True)
        assert heights == sorted(heights)
    per_mast = [profiles.yard_specs(p, n)[0][1] for n in profiles.mast_names(p)]
    assert per_mast[1] > per_mast[0] > per_mast[2]


def test_no_yard_pokes_through_its_own_truck(p):
    for name in profiles.mast_names(p):
        for z, _length, _r in profiles.yard_specs(p, name):
            assert z < profiles.mast_truck_z(p, name)


def test_a_yard_half_span_stays_inside_the_lower_shroud_angle(p):
    """Sanity: a yard wider than about twice the beam would be a different ship."""
    for name in profiles.mast_names(p):
        for _z, length, _r in profiles.yard_specs(p, name):
            assert length / 2 < p.beam


# --- bowsprit ---------------------------------------------------------------

def test_the_bowsprit_projects_the_spec_distance_forward_of_the_stem(p):
    root, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    assert tip[1] - profiles.station_y(p, 0.0) == pytest.approx(12.0, abs=0.01)
    assert tip[1] > root[1], "the tip must stand forward of the root"


def test_the_bowsprit_steeves_up_at_the_reference_angle(p):
    root, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    steeve = math.degrees(math.atan2(tip[2] - root[2], tip[1] - root[1]))
    assert 18.0 < steeve < 30.0


def test_the_bowsprit_is_rooted_inboard_on_the_centreline(p):
    root, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    assert root[0] == 0.0 and tip[0] == 0.0
    assert root[1] < profiles.station_y(p, 0.0), "the heel steps inboard of the stem"
    assert root[2] > 0.0


def test_the_bowsprit_tapers_toward_its_tip(p):
    _root, _tip, r0, r1 = profiles.bowsprit_segment(p)
    assert r0 > r1 > 0.0


# --- detail pass: how a spar is actually shaped -----------------------------
#
# Spec section 5's note "8-sided tapered cylinders" was already satisfied:
# MAST_SIDES has been 8 since Task 8, and the masts came to 252 triangles only
# because each of the nine mast segments was ONE ring-to-ring tube. The sides
# were never the problem; the length divisions, the tops' ironwork and the
# yards' taper were. These are the parts of that which are arithmetic.


def test_a_spar_is_full_at_the_root_and_at_the_tip_it_is_told_to_be():
    assert profiles.spar_radius(0.42, 0.13, 0.0) == pytest.approx(0.42)
    assert profiles.spar_radius(0.42, 0.13, 1.0) == pytest.approx(0.13)


def test_a_spar_carries_its_timber_further_out_than_a_straight_taper_would():
    """A yard is full in the middle and falls away to the arm; it is not a cone.
    At half its length the elliptical taper must stand proud of the chord."""
    root, tip = 0.19, 0.086
    half = profiles.spar_radius(root, tip, 0.5)
    assert half > (root + tip) / 2.0
    assert half < root


def test_a_spar_never_swells_anywhere_along_its_length():
    root, tip = 0.42, 0.126
    radii = [profiles.spar_radius(root, tip, i / 40.0) for i in range(41)]
    assert all(b <= a + 1e-12 for a, b in zip(radii, radii[1:]))


def test_every_mast_cap_rings_the_spar_it_sits_on_without_cutting_into_it(p):
    for name in profiles.mast_names(p):
        for which in (0, 1):
            z, inner, outer, thick = profiles.mast_cap(p, name, which)
            spar = profiles.spar_radius_at(p, name, z)
            assert inner >= spar, f"{name} cap {which} would cut the spar"
            assert outer > inner
            assert thick > 0.0


def test_the_caps_stand_at_the_two_doublings_and_nowhere_else(p):
    for name in profiles.mast_names(p):
        want = [profiles.top_platform(p, name)[0], profiles.crosstrees(p, name)[0]]
        got = [profiles.mast_cap(p, name, w)[0] for w in (0, 1)]
        assert got == pytest.approx(want)


def test_trestletrees_straddle_the_mast_rather_than_running_through_it(p):
    for name in profiles.mast_names(p):
        for which in (0, 1):
            z, gap, aft, fwd, thick = profiles.trestletrees(p, name, which)
            assert gap > profiles.spar_radius_at(p, name, z), "a trestletree in the mast"
            assert thick > 0.0
            _hx, top_aft, top_fwd = profiles.top_extents(p, name, which)
            assert aft <= top_aft + 1e-9, "trestletrees overhang their own top aft"
            assert fwd <= top_fwd + 1e-9, "trestletrees overhang their own top forward"


def _distance_to_outline(point, outline):
    """Least distance from a point to the closed polygon's own boundary."""
    px, py = point
    best = float("inf")
    for i in range(len(outline)):
        ax, ay = outline[i]
        bx, by = outline[(i + 1) % len(outline)]
        dx, dy = bx - ax, by - ay
        span = dx * dx + dy * dy
        f = 0.0 if span == 0.0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
        best = min(best, math.hypot(px - (ax + f * dx), py - (ay + f * dy)))
    return best


def test_the_top_rail_stands_on_the_edge_of_the_top_it_guards(p):
    """CHECK REWRITTEN. It used to assert every post sat on the ELLIPSE
    (x/half_x)**2 + (y/half_y)**2 == 1, which was the plan shape of a
    symmetric top and is no longer the plan shape of anything: the lower top
    is now a half ellipse abaft the mast closed by a straight fore edge. The
    quantity the name claims — a post standing ON the rim — is asserted
    against that rim instead, which is strictly the stronger statement: the
    old form could not have told a post on the fore edge from one in mid air.
    """
    for name in profiles.mast_names(p):
        outline = profiles.top_outline(p, name, 0)
        posts = profiles.top_rail_posts(p, name)
        assert len(posts) == profiles.TOP_RAIL_STANCHIONS
        assert len(set((round(x, 9), round(y, 9)) for x, y in posts)) == len(posts)
        for post in posts:
            assert _distance_to_outline(post, outline) == pytest.approx(0.0, abs=1e-9)


def test_the_top_rail_is_symmetric_across_the_centreline(p):
    posts = profiles.top_rail_posts(p, "main")
    mirrored = sorted((round(-x, 6), round(y, 6)) for x, y in posts)
    assert sorted((round(x, 6), round(y, 6)) for x, y in posts) == mirrored


# --- the lower tops, cut away forward of their masts -------------------------
#
# A real top carries most of its area ABAFT the mast: its forward edge is cut
# back because the topsail hangs ahead of it and would otherwise chafe. Ours
# were symmetric fore and aft, and that symmetry — not the sails — was the
# anomaly behind the `Sails x Tops` deviation. Every figure below names both
# ends of the span it measures.


def _clip_forward(outline, keep_forward: bool):
    """The outline polygon clipped to one side of its own mast axis (y = 0)."""
    out = []
    n = len(outline)
    for i in range(n):
        ax, ay = outline[i]
        bx, by = outline[(i + 1) % n]
        a_in = (ay >= 0.0) if keep_forward else (ay <= 0.0)
        b_in = (by >= 0.0) if keep_forward else (by <= 0.0)
        if a_in:
            out.append((ax, ay))
        if a_in != b_in:
            f = ay / (ay - by)
            out.append((ax + f * (bx - ax), 0.0))
    return out


def _area(poly):
    s = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2.0


def test_the_lower_top_is_cut_away_forward_of_the_mast_it_is_built_round(p):
    """Mast-axis-to-top-fore-edge is shorter than mast-axis-to-top-after-edge,
    and the platform carries more plan area abaft its mast than ahead of it."""
    for name in profiles.mast_names(p):
        outline = profiles.top_outline(p, name, 0)
        fore = max(y for _x, y in outline)
        aft = -min(y for _x, y in outline)
        assert fore < aft, f"the {name} top is not cut away forward"
        forward_area = _area(_clip_forward(outline, True))
        after_area = _area(_clip_forward(outline, False))
        assert after_area > forward_area, (
            f"the {name} top carries more area forward of its mast than abaft it"
        )


def test_the_lower_tops_fore_edge_clears_the_topsail_hanging_ahead_of_it(p):
    """Top-fore-edge to topsail-canvas-aftmost-point, measured over the top's
    own athwartships span and over the z band its plate and rail occupy."""
    for name in profiles.mast_names(p):
        gap = wind.top_fore_edge_clearance(p, name)
        assert gap >= profiles.TOP_CANVAS_CLEAR, (
            f"the {name} topsail's foot crosses its own top: {gap:.3f} m"
        )


def test_the_lower_tops_fore_edge_stands_forward_of_the_spar_it_rings(p):
    """Mast-axis-to-top-fore-edge against the lower masthead's own radius: cut
    the top back to the spar and the mast comes through its forward edge."""
    for name in profiles.mast_names(p):
        z, _half_x, _aft = profiles.top_platform(p, name)
        fore = max(y for _x, y in profiles.top_outline(p, name, 0))
        assert fore > profiles.spar_radius_at(p, name, z)


def test_the_top_keeps_its_athwartships_span_at_the_mast_axis(p):
    """The futtock shrouds are set up at (+/- half span, mast axis y): that
    point must stay ON the rim, and the head spread must not move."""
    for name in profiles.mast_names(p):
        _z, half_x, _aft = profiles.top_platform(p, name)
        outline = profiles.top_outline(p, name, 0)
        assert half_x == pytest.approx(profiles.top_span(p, name) / 2.0)
        for sign in (-1.0, 1.0):
            assert any(x == pytest.approx(sign * half_x) and y == pytest.approx(0.0)
                       for x, y in outline), f"the {name} top lost its widest line"


def test_the_forward_trestletree_arm_stops_at_its_own_tops_fore_edge(p):
    for name in profiles.mast_names(p):
        _z, _gap, aft, fwd, _thick = profiles.trestletrees(p, name, 0)
        assert fwd < aft, "the trestletrees were not cut back with the top"
        assert fwd <= max(y for _x, y in profiles.top_outline(p, name, 0)) + 1e-9
