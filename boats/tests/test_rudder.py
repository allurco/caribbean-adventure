"""The rudder, under plain pytest. No bpy.

The ship had no rudder at all. This file is the ruling on the one it has now:
where it hangs, how big it is, what it must clear, and where its pivot is.
Every figure names BOTH its endpoints.
"""

import math

import pytest

from frigate import profiles, rudder
from frigate.params import FrigateParams


@pytest.fixture
def p():
    return FrigateParams()


# --- where it hangs ----------------------------------------------------------


def test_the_sternpost_is_the_aft_end_of_the_hull(p):
    """Stem at +Y to sternpost at -Y: the rudder hangs on the aft face."""
    assert rudder.sternpost_y(p) == pytest.approx(profiles.station_y(p, 1.0))
    assert rudder.sternpost_y(p) == pytest.approx(-p.half_loa)


def test_the_heel_sits_on_the_keel_at_the_sternpost(p):
    """Rudder heel to keel bottom at station 1.0: the same height, exactly."""
    assert rudder.heel_z(p) == pytest.approx(profiles.keel_z(p, 1.0))


def test_the_rudder_never_hangs_below_the_declared_draft(p):
    """A rudder below the keel is the first thing to break in a grounding."""
    assert rudder.heel_z(p) >= -p.draft


def test_the_head_stops_clear_under_the_stern_gallery(p):
    """Rudder head to gallery bottom: the clearance is stated, not hoped for.

    The gallery stands `stern_form.gallery_depth` aft of the hull transom, dead
    on the centreline the rudder head rises on. This is the measurement that
    decides there is no tiller.
    """
    lowest = profiles.gallery_lowest(p)
    assert rudder.head_z(p) == pytest.approx(lowest - rudder.GALLERY_CLEAR)
    assert lowest - rudder.head_z(p) == pytest.approx(rudder.GALLERY_CLEAR)
    assert rudder.GALLERY_CLEAR > 0.1
    # And the trap that cost a round trip: the DENTILS hang below the band.
    assert lowest < profiles.gallery_band(p)[0]


def test_the_head_stands_above_the_waterline_and_the_heel_below_it(p):
    assert rudder.heel_z(p) < 0.0 < rudder.head_z(p)


def test_the_rudder_is_as_deep_as_the_sternpost_it_is_hung_on(p):
    """Heel to head against keel-at-the-sternpost to gallery bottom."""
    assert rudder.depth(p) == pytest.approx(rudder.head_z(p) - rudder.heel_z(p))
    assert rudder.depth(p) > 3.0


# --- the bite into the sternpost ---------------------------------------------


def test_the_leading_edge_is_let_into_the_transom_by_the_stated_amount(p):
    """`joints` states 0.060 m; the geometry has to be that number, not near it."""
    assert rudder.nose_y(p) - rudder.sternpost_y(p) == pytest.approx(rudder.STOCK_BITE)
    assert rudder.STOCK_BITE == 0.060


def test_nothing_but_the_bite_stands_forward_of_the_sternpost(p):
    """Every other vertex is ABAFT the transom, which is where a rudder is."""
    ys = [pt[1] for pt in rudder.all_points(p)]
    assert max(ys) == pytest.approx(rudder.nose_y(p) + rudder.PINTLE_FWD)
    assert max(ys) - rudder.sternpost_y(p) <= rudder.STOCK_BITE + rudder.PINTLE_FWD + 1e-9


# --- the blade ---------------------------------------------------------------


def test_the_chord_is_widest_at_the_heel_and_narrowest_at_the_head(p):
    zs = rudder.station_zs(p)
    chords = [rudder.chord(p, z) for z in zs]
    assert chords == sorted(chords, reverse=True)
    assert chords[0] > chords[-1] * 3.0


def test_the_head_is_the_bare_stock(p):
    """And the stock's size has ONE source: the last row of the outline."""
    assert rudder.chord(p, rudder.head_z(p)) == pytest.approx(rudder.stock_chord(p))
    assert 0.35 <= rudder.stock_chord(p) <= 0.60


def test_the_blade_is_still_nearly_full_chord_at_the_waterline(p):
    """It rakes forward ABOVE the load waterline, not below it."""
    assert rudder.chord(p, 0.0) > 0.85 * rudder.chord(p, rudder.heel_z(p))


def test_the_chord_is_a_believable_fraction_of_the_rudder_s_own_depth(p):
    """Heel chord to rudder depth, both named: a rudder is tall, not square."""
    ratio = rudder.chord(p, rudder.heel_z(p)) / rudder.depth(p)
    assert 0.3 <= ratio <= 0.5


def test_the_sections_run_from_the_heel_to_the_head_in_order(p):
    zs = rudder.station_zs(p)
    assert zs[0] == pytest.approx(rudder.heel_z(p))
    assert zs[-1] == pytest.approx(rudder.head_z(p))
    assert zs == sorted(zs)
    assert len(zs) >= 5


def test_every_section_is_a_closed_ring_symmetric_about_the_centreline(p):
    for z in rudder.station_zs(p):
        ring = rudder.section_ring(p, z)
        assert len(ring) == rudder.RING_POINTS
        assert len(ring) % 2 == 0
        assert sum(pt[0] for pt in ring) == pytest.approx(0.0, abs=1e-9)
        assert all(pt[2] == pytest.approx(z) for pt in ring)


def test_the_section_is_thickest_at_the_stock_and_thinnest_at_the_trailing_edge(p):
    ring = rudder.section_ring(p, 0.0)
    half = len(ring) // 2
    thicknesses = [abs(pt[0]) for pt in ring[:half]]
    assert thicknesses[0] < max(thicknesses)            # a blunt nose, not the widest
    assert thicknesses[-1] == min(thicknesses)          # the trailing edge is thinnest
    assert max(thicknesses) == pytest.approx(rudder.HALF_THICK)


def test_the_rudder_is_thinner_than_the_sternpost_timber_it_hangs_on(p):
    assert rudder.HALF_THICK < p.keel_half


# --- the stock, which is the pivot -------------------------------------------


def test_the_stock_axis_is_vertical_on_the_centreline_at_the_leading_edge(p):
    point, axis = rudder.stock_axis(p)
    assert axis == pytest.approx((0.0, 0.0, 1.0))
    assert point[0] == pytest.approx(0.0)
    assert point[1] == pytest.approx(rudder.nose_y(p))


def test_the_stock_axis_passes_through_every_pintle(p):
    point, _axis = rudder.stock_axis(p)
    for lo, hi in rudder.pintle_boxes(p):
        assert lo[0] < point[0] < hi[0]
        assert lo[1] < point[1] < hi[1]


def test_swinging_the_rudder_about_its_stock_leaves_the_leading_edge_put(p):
    """What the pivot IS FOR, checked as arithmetic before any node exists."""
    point, _axis = rudder.stock_axis(p)
    nose = (0.0, rudder.nose_y(p), 0.0)
    for deg in (-35.0, -10.0, 0.0, 10.0, 35.0):
        a = math.radians(deg)
        dx, dy = nose[0] - point[0], nose[1] - point[1]
        moved = (point[0] + dx * math.cos(a) - dy * math.sin(a),
                 point[1] + dx * math.sin(a) + dy * math.cos(a))
        assert moved == pytest.approx(nose[:2], abs=1e-9)


def test_swinging_the_rudder_moves_the_trailing_edge_a_long_way(p):
    """And the other end of the same measurement: the blade is what swings."""
    point, _axis = rudder.stock_axis(p)
    heel = rudder.heel_z(p)
    trail = (0.0, rudder.nose_y(p) - rudder.chord(p, heel))
    a = math.radians(rudder.HARD_OVER_DEG)
    dx, dy = trail[0] - point[0], trail[1] - point[1]
    swept = abs(dx * math.cos(a) - dy * math.sin(a) - (trail[0] - point[0]))
    assert swept > 0.8


def test_hard_over_is_a_helm_angle_a_ship_actually_carries(p):
    assert 25.0 <= rudder.HARD_OVER_DEG <= 40.0


# --- the pintles -------------------------------------------------------------


def test_there_are_three_pintles_and_all_of_them_are_under_water(p):
    boxes = rudder.pintle_boxes(p)
    assert len(boxes) == rudder.PINTLES == 3
    for lo, hi in boxes:
        assert hi[2] <= 0.0
        assert lo[2] >= rudder.heel_z(p)


def test_the_pintles_are_spaced_down_the_leading_edge_not_stacked(p):
    zs = [0.5 * (lo[2] + hi[2]) for lo, hi in rudder.pintle_boxes(p)]
    assert zs == sorted(zs)
    gaps = [b - a for a, b in zip(zs, zs[1:])]
    assert min(gaps) > 0.5


def test_a_pintle_strap_wraps_the_leading_edge_on_both_sides(p):
    for lo, hi in rudder.pintle_boxes(p):
        assert lo[0] < -rudder.HALF_THICK and hi[0] > rudder.HALF_THICK


# --- what it has to clear ----------------------------------------------------


def test_the_whole_rudder_stays_under_the_stern_gallery(p):
    """Highest rudder vertex to gallery bottom, both named."""
    top = max(pt[2] for pt in rudder.all_points(p))
    assert top == pytest.approx(rudder.head_z(p))
    assert profiles.gallery_lowest(p) - top >= rudder.GALLERY_CLEAR - 1e-9


def test_the_rudder_stays_on_the_centreline(p):
    assert max(abs(pt[0]) for pt in rudder.all_points(p)) < p.keel_half * 2.0


def test_the_whole_rudder_stays_inside_the_transom_it_hangs_on(p):
    """Rudder half-width to the hull's own half-width at the same height."""
    for pt in rudder.all_points(p):
        if pt[2] <= profiles.sheer(p, 1.0):
            assert abs(pt[0]) <= profiles.hull_half_width(p, 1.0, pt[2]) + 1e-9 \
                or pt[2] < 0.0


# --- what it costs -----------------------------------------------------------


def test_the_triangle_count_is_derived_and_not_guessed(p):
    bands = len(rudder.station_zs(p)) - 1
    loft = bands * rudder.RING_POINTS * 2
    caps = 2 * (rudder.RING_POINTS - 2)
    straps = rudder.PINTLES * 12
    assert rudder.triangle_count(p) == loft + caps + straps


def test_the_rudder_fits_the_spec_section_5_line_it_was_assigned(p):
    """The hull line, and the room it had. Both ends of that named too."""
    from frigate import budget

    line = budget.line_of(p, rudder.BUDGET_LINE)
    assert "Rudder" in line.names
    # The hull line stood at 6,870 of 8,000 before the rudder existed.
    assert 6870 + rudder.triangle_count(p) <= line.budget


def test_the_outline_knuckle_is_the_waterline_and_moves_with_nothing_else(p):
    """The trap that cost a round trip, pinned so it cannot come back.

    The head dropped 0.26 m to clear the gallery dentils. With the knuckle
    written as a fraction of the rudder's own DEPTH it slid below the
    waterline and the blade started raking under water. Written as the
    waterline it does not move at all.
    """
    tall = FrigateParams()
    tall.deck_z = 3.1          # moves the sheer, the gallery and so the head
    for q in (p, tall):
        assert rudder.chord(q, 0.0) == pytest.approx(
            rudder.heel_chord(q) * rudder.CHORD_AT_WATERLINE)
        assert 0.0 in [pytest.approx(z) for z in rudder.station_zs(q)]


# --- HER rudder: the galleon's figures, pinned (Task 8a) ---------------------


def test_her_rudder_hangs_where_her_own_stern_puts_it():
    """Every figure on GalleonParams(), both endpoints named.

    STERNPOST: y = station_y(G, 1.0), her hull's aft face, -17.00.
    HEEL: z = KEEL UNDERSIDE at station 1.0, -2.40.
    RUDDER HEAD to STERN GALLERY'S LOWEST MEMBER (the dentil course,
    `gallery_lowest`, 3.55 = gallery band foot 3.85 less the 0.30 drop):
    exactly GALLERY_CLEAR, so the head stands at 3.37."""
    from frigate.params import GalleonParams

    g = GalleonParams()
    assert rudder.sternpost_y(g) == profiles.station_y(g, 1.0)
    assert rudder.sternpost_y(g) == pytest.approx(-21.00)
    assert rudder.heel_z(g) == profiles.keel_z(g, 1.0)
    assert rudder.heel_z(g) == pytest.approx(-2.96)
    assert profiles.gallery_lowest(g) == pytest.approx(3.55)
    assert profiles.gallery_lowest(g) - rudder.head_z(g) \
        == pytest.approx(rudder.GALLERY_CLEAR)
    assert rudder.head_z(g) == pytest.approx(3.37)


def test_her_rudder_stays_under_her_gallery_and_inside_her_transom():
    """Every vertex the rudder emits: no higher than RUDDER HEAD (under the
    gallery's dentils), no wider than her TRANSOM HALF-WIDTH at the head's
    height, and no further forward than LEADING EDGE plus the pintle straps'
    PINTLE_FWD into the sternpost."""
    from frigate.params import GalleonParams

    g = GalleonParams()
    lo, hi = rudder.bounds(g)
    assert hi[2] <= profiles.gallery_lowest(g) - rudder.GALLERY_CLEAR + 1e-9
    assert max(abs(lo[0]), abs(hi[0])) \
        < profiles.stern_half_width(g, rudder.head_z(g))
    assert hi[1] == pytest.approx(rudder.nose_y(g) + rudder.PINTLE_FWD)
    assert hi[1] - rudder.sternpost_y(g) \
        == pytest.approx(rudder.STOCK_BITE + rudder.PINTLE_FWD)
