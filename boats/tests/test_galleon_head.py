"""The galleon's head and its carving, judged as pure geometry. No bpy here.

BOTH ENDPOINTS OF EVERY MEASUREMENT ARE NAMED. A hull was once certified 1.35x
too tall because somebody wrote "freeboard is 4.2 m" instead of
"waterline-to-rail-cap is 4.3307 m", and an anchor's clearance was measured
against iron hoops that clasped thin air.

The two landmarks every figure in this file is stated against are

    THE STEM AT THE RAIL        y = +17.00 m on the galleon, +19.00 on the frigate
    THE RAIL CAP AT THE STEM    z = + 7.00 m on the galleon, + 5.50 on the frigate

and they are read off `profiles.station_y(p, 0.0)` and
`profiles.sheer(p, 0.0) + p.bulwark_h` rather than written down.

WHAT THIS FILE IS FOR. `frigate/head.py` was written with a docstring
promising the galleon would INHERIT it rather than fork it. That promise was
untested — the only evidence was one test that built the frigate's head on a
52 m frigate. This file is the real customer arriving.
"""

import math

import pytest

from frigate import carving, head, lion, profiles
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


def _stem_y(p):
    return profiles.station_y(p, 0.0)


def _cap_at_stem(p):
    return profiles.sheer(p, 0.0) + p.bulwark_h


# --- the promise: the code inherits, only the data differs ------------------

def test_the_galleons_head_is_built_by_the_frigates_own_module():
    """Every head function answers for the galleon, with no galleon branch.

    `frigate/head.py` contains the string "galleon" only in prose. If a
    special case for this ship ever has to be written INTO the module, this
    is where that shows up.
    """
    import inspect

    source = inspect.getsource(head)
    code = "\n".join(line for line in source.splitlines()
                     if not line.strip().startswith("#"))
    # The docstring is prose and may name any ship; the code may not branch.
    body = code.split('"""')[-1]
    assert "Galleon" not in body and "galleon" not in body
    assert "Frigate" not in body or "FrigateParams" in body


def test_every_head_function_answers_for_the_galleon_and_is_finite():
    fns = [
        lambda: head.head_curve(G, 0.5),
        lambda: head.springing_u(G),
        lambda: head.lower_rail_rings(G, 1.0),
        lambda: head.upper_rail_rings(G, -1.0),
        lambda: head.head_line(G, 1.0),
        lambda: head.head_timber_boxes(G, 1.0),
        lambda: head.knee_rings(G),
        lambda: head.beakhead_wall(G),
        lambda: head.beakhead_cap(G),
        lambda: head.rail_gaps(G, 1.0),
        lambda: head.head_triangles(G),
    ]

    def _finite(v):
        if isinstance(v, (int, float)):
            assert math.isfinite(v)
        elif isinstance(v, (list, tuple)):
            for item in v:
                _finite(item)

    for fn in fns:
        _finite(fn())


# --- the head's prominence, which is the point of the type ------------------

def test_stem_at_the_rail_to_the_carvings_nose_is_a_tenth_of_the_whole_ship():
    """The headline figure, both endpoints named.

    STEM-AT-THE-RAIL to CARVING-NOSE is 3.61 m on a 34.00 m galleon, 10.6% of
    stem-at-the-rail-to-taffrail. The frigate's STEM-AT-THE-RAIL to
    SPEAR-POINT is 1.47 m on 38.00 m, 3.9%. The galleon's head reaches nearly
    three times as far forward over its own length, which is what the type's
    long beak is.
    """
    g_reach = carving.bounds(G)[1][1] - _stem_y(G)
    f_reach = carving.bounds(F)[1][1] - _stem_y(F)
    assert g_reach == pytest.approx(3.607, abs=0.02)
    assert f_reach == pytest.approx(1.473, abs=0.02)
    assert g_reach / G.loa == pytest.approx(0.106, abs=0.003)
    assert f_reach / F.loa == pytest.approx(0.039, abs=0.003)
    assert (g_reach / G.loa) / (f_reach / F.loa) > 2.5


def test_the_whole_head_line_is_a_longer_run_than_the_frigates_over_its_own_ship():
    """HEAD-RAIL-SPRINGING to TRAILBOARD-FORWARD-END, fore and aft.

    The galleon's runs 15.80 m to 18.45 m = 2.65 m on a 34 m hull (7.8%).
    The frigate's runs 17.55 m to 19.35 m = 1.81 m on a 38 m hull (4.7%).
    The board stops at the LION'S RUMP; the carving carries the head on from
    there to its nose at 20.61 m, which is what the 10.6% above measures.
    """
    for p, span, frac in ((G, 2.648, 0.01), (F, 1.805, 0.01)):
        line = head.head_line(p, 1.0)
        run = line[-1][1] - line[0][1]
        assert run == pytest.approx(span, abs=0.02)
        assert run / p.loa == pytest.approx(span / p.loa, abs=frac)
    assert (head.head_line(G, 1.0)[-1][1] - head.head_line(G, 1.0)[0][1]) / G.loa \
        > (head.head_line(F, 1.0)[-1][1] - head.head_line(F, 1.0)[0][1]) / F.loa


def test_the_knee_reaches_further_ahead_of_the_stem_than_the_frigates():
    """STEM-AT-THE-RAIL to KNEE-FORWARD-EDGE, at the beak.

    The OUTLINE's reach is 2.67 m on the galleon against 0.84 m on the
    frigate, from a knee reach of 0.55 against 0.20 of keel-underside-at-
    the-stem to deck-edge-at-the-stem, and the frigate's knee reaches all
    of it. The galleon's knee top falls with her upper head rail (the maintainer's
    third ruling, E) and is level at z 3.2269 forward of the rail's end, so
    her beak -- the outline's widest projection, at z 3.871 over the lion's
    chest -- is cut away above that, and her knee reaches 2.29 m: STEM-AT-
    THE-RAIL to the KNEE'S TIP, where its top meets the cutwater's forward
    edge. Still nearly three times the frigate's.
    """
    for p, reach, built in ((G, 2.667, 2.294), (F, 0.840, 0.840)):
        span = profiles.sheer(p, 0.0) - profiles.keel_z(p, 0.0)
        assert p.head_form.knee_reach_frac * span == pytest.approx(reach, abs=0.01)
        forward = max(pt[1] for ring in head.knee_rings(p) for pt in ring)
        assert forward - _stem_y(p) == pytest.approx(built, abs=0.01)


# --- the one fair curve, on the galleon too ---------------------------------

def test_the_rail_and_the_trailboard_are_still_one_curve_on_the_galleon():
    for sign in (1.0, -1.0):
        assert head.lower_rail_rings(G, sign)[-1] == \
            profiles.trailboard_rings(G, sign)[0]


def test_the_whole_galleon_head_line_is_fair_from_the_bulwark_to_the_carving():
    """Convex everywhere: every segment less steep than the one abaft it."""
    for sign in (1.0, -1.0):
        line = head.head_line(G, sign)
        slopes = [(b[2] - a[2]) / (b[1] - a[1]) for a, b in zip(line, line[1:])]
        for s0, s1 in zip(slopes, slopes[1:]):
            assert s1 > s0
        assert slopes[0] < -0.25     # steep where it leaves the bow
        assert abs(slopes[-1]) < 0.12  # and running out level at the carving


def test_the_lower_rail_springs_exactly_off_the_galleons_own_bulwark_cap():
    """HEAD-RAIL-AFT-END to WAIST-BULWARK-CAP-AT-THAT-STATION: zero."""
    for sign in (1.0, -1.0):
        _x, y, z = head.lower_rail_points(G, sign)[0]
        cap = profiles.sheer(G, profiles.t_of_y(G, y)) + G.bulwark_h
        assert z == pytest.approx(cap, abs=1e-9)


def test_the_two_galleon_rails_converge_all_the_way_forward():
    """The gap starts 2.3x the frigate's and closes all the way forward.

    UPPER-RAIL-UNDERSIDE to LOWER-RAIL-TOP is 2.13 m at the heel and 0.40 m
    at the carving; the frigate's is 0.91 m and 0.26 m. The galleon's head is
    a tall open lattice because its upper rail springs from a FORECASTLE
    CASTLE RAIL CAP and its lower rail from the waist cap well below it.

    It was 1.58 m and 0.10 m (ratio 1.74): the lower battery left the
    bulwark (the maintainer's ruling 2026-10-05, R4), the waist cap the lower rail
    springs from dropped 0.55 m, and the forecastle castle did not move.
    """
    gaps = head.rail_gaps(G, 1.0)
    assert gaps[0] == pytest.approx(2.134, abs=0.02)
    assert gaps[-1] == pytest.approx(0.402, abs=0.02)
    for a, b in zip(gaps, gaps[1:]):
        assert b < a
    assert gaps[0] / head.rail_gaps(F, 1.0)[0] == pytest.approx(2.34, abs=0.05)


def test_the_upper_head_rail_springs_off_the_forecastle_CASTLES_own_rail_cap():
    """UPPER-HEAD-RAIL-HEEL to FORECASTLE-CASTLE-WALL-HEAD: zero.

    `rail_top_z` used to guard every platform with the open rail's 1.00 m
    above its deck edge. A castle deck already HAS a bulwark — 0.85 m on this
    galleon's forecastle — and `castle_wall_zs` builds the wall's head at
    exactly that height, so guarding it twice left the head rail springing
    0.53 m ABOVE the wall it springs off, floating in air. The frigate has no
    tier standing above its own main rail, so the clause never fires on her.
    """
    tier = G.tier("Deck_Forecastle")
    t0 = profiles.forecastle_rail_t(G)
    wall_head = profiles.castle_wall_zs(G, tier, t0)[-1]
    assert head.upper_rail_ends(G)[0][1] == pytest.approx(wall_head, abs=1e-12)
    # And the frigate's rail is still its open rail, 1.00 m over the deck edge.
    tf = profiles.forecastle_rail_t(F)
    assert profiles.rail_top_z(F, tf) == pytest.approx(
        profiles.sheer(F, tf) + F.fcastle_rise + F.rail_form.guard_h, abs=1e-12)


def test_the_galleons_head_timbers_frame_that_taller_lattice():
    """Six, not four: the gap they fill is 2.3x as deep at the heel."""
    assert G.head_form.head_timbers == 6
    for sign in (1.0, -1.0):
        boxes = head.head_timber_boxes(G, sign)
        assert len(boxes) == 6
        heights = [hi[2] - lo[2] for lo, hi in boxes]
        for h0, h1 in zip(heights, heights[1:]):
            assert h1 < h0
        for lo, hi in boxes:
            y = 0.5 * (lo[1] + hi[1])
            assert lo[2] < head.lower_z_at(G, y)   # let INTO the lower rail
            assert hi[2] > head.upper_z_at(G, y)   # and into the upper


# --- the beakhead bulkhead, which the castle broke --------------------------

def test_the_beakhead_bulkhead_stands_at_the_galleons_own_bowsprit_heel():
    heel, _tip, _r0, _r1 = profiles.bowsprit_segment(G)
    lo, hi = head.beakhead_wall(G)
    assert 0.5 * (lo[1] + hi[1]) == pytest.approx(heel[1], abs=1e-9)
    # 4.6 m abaft THE STEM AT THE RAIL, which is 13.5% of length, against the
    # frigate's 3.0 m on 38 m = 7.9%.
    assert _stem_y(G) - heel[1] == pytest.approx(4.6, abs=1e-9)


def test_the_bulkhead_is_a_box_and_not_an_inside_out_one():
    """The galleon's FORECASTLE DECK stands ABOVE its waist rail cap.

    This is the bug a castle ship exposes and a flush-decked one cannot. The
    frigate's forecastle tucks under the main rail, so FORECASTLE-DECK to
    WAIST-RAIL-CAP is +0.60 m and a wall between them is a wall. On the
    galleon the forecastle stands 2.90 m above the main deck edge where the
    waist bulwark is 1.90 m, so the deck EDGE is already 1.00 m above the cap
    and the deck at the CENTRELINE, which is what `deck_z_at` returns, is
    1.24 m above it once the 0.24 m camber is added. (It was 0.45 / 0.69
    with a 2.45 m bulwark: the lower battery left the bulwark, the maintainer's
    ruling 2026-10-05, R4.) Either way the wall came
    out upside down. The head of the wall is the cap of whatever rail guards
    the forecastle, which on a castle is the castle's own bulwark.
    """
    tier = G.tier("Deck_Forecastle")
    assert tier.stands_above_the_main_rail()
    t = head.beakhead_t(G)
    deck = profiles.deck_z_at(G, t, 0.0, G.fcastle_rise)
    waist_cap = profiles.sheer(G, t) + G.bulwark_h
    assert deck - waist_cap == pytest.approx(1.24, abs=0.02)   # the trap
    # FORECASTLE-DECK-AT-THE-CENTRELINE to WAIST-RAIL-CAP on the frigate, for
    # contrast: the platform is 0.38 m BELOW the cap, so the wall is a wall.
    tf = head.beakhead_t(F)
    assert profiles.deck_z_at(F, tf, 0.0, F.fcastle_rise) \
        - (profiles.sheer(F, tf) + F.bulwark_h) == pytest.approx(-0.38, abs=0.02)

    lo, hi = head.beakhead_wall(G)
    assert lo[2] < hi[2]
    # BULKHEAD-HEAD to CASTLE-WALL-HEAD is zero: it closes the castle at the
    # castle's own rail cap, which `castle_wall_zs` builds at the DECK EDGE
    # where the camber is nil.
    assert hi[2] == pytest.approx(
        profiles.castle_wall_zs(G, tier, t)[-1], abs=1e-12)
    assert hi[2] == pytest.approx(profiles.sheer(G, t) + tier.rise
                                  + tier.bulwark_h, abs=1e-12)
    # BULKHEAD-FOOT to FORECASTLE-DECK-AT-THE-CENTRELINE is the step it is
    # let down into that platform by.
    assert deck - lo[2] == pytest.approx(G.head_form.beakhead_sink, abs=1e-12)

    # And it is let into the castle wall's timber over the WHOLE of its own
    # height, not just at the head. The wall tumbles 0.17 m in over its own
    # 0.85 m, so a box sized at the head stood clear of the wall at the foot.
    for z in (lo[2], 0.5 * (lo[2] + hi[2]), hi[2] - 1e-6):
        outer = profiles.bulwark_half_width(G, t, z)
        inner = outer - G.bulwark_thick
        assert inner <= hi[0] <= outer + 1e-9
    # And the frigate's wall still runs to the WAIST cap, unchanged.
    tf = head.beakhead_t(F)
    assert head.beakhead_wall(F)[1][2] == pytest.approx(
        profiles.sheer(F, tf) + F.bulwark_h, abs=1e-12)


def test_the_whole_head_stands_forward_of_the_bulkhead_on_both_ships():
    for p in (G, F):
        wall_hi = head.beakhead_wall(p)[1]
        aft_most = min(pt[1] for sign in (1.0, -1.0)
                       for ring in (head.lower_rail_rings(p, sign)
                                    + head.upper_rail_rings(p, sign))
                       for pt in ring)
        assert aft_most > wall_hi[1]


def test_nothing_but_the_gripe_of_the_galleons_knee_goes_under_water():
    wet = [pt for ring in head.knee_rings(G) for pt in ring if pt[2] < 0.0]
    assert wet                                     # there IS a gripe
    for pt in wet:
        assert pt[1] - _stem_y(G) < 0.2            # and it is at the stem


# --- the carving: a crowned lion rampant ------------------------------------

def test_the_galleon_wears_a_lion_and_the_frigate_a_goddess():
    assert G.figurehead == "lion"
    assert F.figurehead == "minerva"
    assert set(carving.names()) == {"lion", "minerva"}


def test_a_ship_that_names_a_carving_nobody_cut_is_refused_loudly():
    rogue = GalleonParams(figurehead="dolphin")
    with pytest.raises(KeyError, match="dolphin"):
        carving.bounds(rogue)


def test_the_frigates_carving_is_untouched_by_the_dispatcher():
    """`carving.all_points` for the frigate IS `profiles.figure_all_points`.

    Not "agrees with": the same list, in the same order, at full precision.
    Rebuilding it "equivalently" through the dispatcher is exactly the move
    `tests/test_frigate_frozen.py` exists to catch.
    """
    assert carving.all_points(F) == profiles.figure_all_points(F)
    assert carving.triangles(F) == profiles.figure_triangles(F)
    assert carving.height(F) == profiles.figure_height(F)


def test_rump_to_nose_along_the_lions_own_axis_is_2_40_metres():
    """Both endpoints named: HEEL-RING-CENTRE at the rump to NOSE-TIP.

    0.480 of WATERLINE to WAIST-RAIL-CAP amidships (5.00 m). Minerva is
    1.68 m, 0.388 of waterline-to-rail-cap-at-maximum-beam (4.3307 m).
    The lion did not change; the ratio did: it was 0.432 of 5.55 m before
    the lower battery left the bulwark (the maintainer's ruling 2026-10-05, R4) and
    the waist cap dropped 0.55 m.
    """
    assert lion.height(G) == pytest.approx(2.40, abs=0.01)
    waist = G.deck_z + G.bulwark_h
    assert waist == pytest.approx(5.00, abs=1e-9)
    assert lion.height(G) / waist == pytest.approx(0.480, abs=0.005)
    assert profiles.figure_height(F) / (F.deck_z + F.bulwark_h) == \
        pytest.approx(0.388, abs=0.005)


def test_the_lion_springs_FORWARD_where_minerva_stands_UP():
    """The axis rake is the difference between a statue and a beast.

    Minerva's axis leans 34 degrees forward of vertical — 56 degrees above
    the horizontal. The lion's leans 62 — 28 degrees above the horizontal.
    """
    assert lion.LION_RAKE_DEG == 62.0
    assert profiles.FIG_RAKE_DEG == 34.0
    _heel, up, _fwd = lion.axis(G)
    above_horizontal = math.degrees(math.atan2(up[2], up[1]))
    assert above_horizontal == pytest.approx(28.0, abs=0.01)
    _fheel, fup, _ffwd = profiles.figure_axis(F)
    assert math.degrees(math.atan2(fup[2], fup[1])) == pytest.approx(56.0, abs=0.01)


def test_the_ripple_is_spent_on_the_MANE_and_nowhere_else():
    """A lion's pelt is not cloth. Minerva is fluted hem to collar; the lion
    is smooth everywhere but the ruff, where the amplitude is 8.7x the body's.
    """
    amps = {name: amp for name, _s, _rx, _ry, amp in lion.LION_BODY}
    assert amps["ruff"] == pytest.approx(0.260)
    smooth = [amp for name, _s, _rx, _ry, amp in lion.LION_BODY
              if name in ("loin", "belly", "chest", "muzzle")]
    assert max(smooth) <= 0.03
    assert amps["ruff"] / max(smooth) > 8.0
    # The crest/trough-on-a-vertex rule Minerva turns on holds here too.
    assert lion.LION_SIDES == 2 * lion.LION_FOLDS
    assert profiles.FIG_SIDES == 2 * profiles.FIG_FOLDS


def test_the_mane_actually_stands_proud_of_the_body_in_the_rings_themselves():
    """Measured off the emitted rings, not off the table.

    Crest-to-adjacent-trough over mean radius, differenced between
    NEIGHBOURING vertices — a max-minus-min would measure the ellipse the
    body is before it is carved, not the carving.
    """
    heel, up, _fwd = lion.axis(G)

    def relief(index):
        ring = lion.body_rings(G)[index]
        rs = []
        for pt in ring:
            d = [pt[k] - heel[k] for k in range(3)]
            along = sum(a * b for a, b in zip(d, up))
            rs.append(math.sqrt(sum((a - along * b) ** 2
                                    for a, b in zip(d, up))))
        steps = [abs(rs[i] - rs[(i + 1) % len(rs)]) for i in range(len(rs))]
        return (sum(steps) / len(steps)) / (sum(rs) / len(rs))

    ruff = relief(lion.LION_RUFF_RING)
    shoulder = relief(lion.LION_SHOULDER_RING)
    assert ruff > 0.30
    assert ruff > shoulder * 4.0


def test_the_lion_is_a_quadruped_with_four_legs_a_tail_and_a_crown():
    groups = lion.ring_groups(G)
    assert len(groups) == 7          # body, 4 legs, tail, crown
    fore = lion.foreleg_rings(G, 1.0)
    hind = lion.hindleg_rings(G, 1.0)
    # The forelegs reach FORWARD of the hind legs, which is what a beast
    # springing along a beakhead does.
    assert min(pt[1] for ring in fore for pt in ring) > \
        max(pt[1] for ring in hind for pt in ring)
    # Port and starboard legs straddle the centreline.
    for table in (lion.foreleg_rings, lion.hindleg_rings):
        assert max(pt[0] for ring in table(G, 1.0) for pt in ring) > 0.0
        assert min(pt[0] for ring in table(G, -1.0) for pt in ring) < 0.0


def test_the_crown_sits_on_TOP_of_the_lions_head_and_tops_the_carving():
    """It is the KING's lion, so the crown has to read as one.

    CROWN-HIGHEST-POINT to SKULL-HIGHEST-POINT, and the crown must also flare
    upward like a circlet rather than taper like a hat.
    """
    crown = lion.crown_rings(G)
    skull = lion.body_rings(G)[-2]      # the muzzle ring, under the crown
    assert max(pt[2] for ring in crown for pt in ring) > \
        max(pt[2] for pt in skull)
    radii = [abs(ring[0][0] - ring[len(ring) // 2][0]) / 2.0 for ring in crown]
    for r0, r1 in zip(radii, radii[1:]):
        assert r1 > r0


def test_the_tail_curls_BACK_over_the_rump():
    tail = lion.tail_rings(G)
    rump = lion.body_rings(G)[lion.LION_RUMP_RING]
    tip = tail[-1]
    assert max(pt[2] for pt in tip) > max(pt[2] for pt in rump)
    assert min(pt[1] for pt in tip) < min(pt[1] for pt in rump)


def test_the_lion_clears_the_water_and_stays_under_the_bowsprit():
    lo, hi = carving.bounds(G)
    assert lo[2] > 0.0
    heel, tip, _r0, _r1 = profiles.bowsprit_segment(G)
    f = (hi[1] - heel[1]) / (tip[1] - heel[1])
    spar_z = heel[2] + f * (tip[2] - heel[2])
    assert hi[2] < spar_z


def test_the_lion_straddles_the_centreline_without_standing_outside_the_hull():
    """CARVING-OUTERMOST-POINT to the CENTRELINE, over MAXIMUM BEAM.

    The frigate's carving reaches 0.490 m off the centreline on a 10.2 m
    beam, which is 0.0481 of it. The figure for the galleon is DERIVED from
    that one and not copied: the same fraction of an 11.0 m beam is 0.529 m,
    and the lion with its trailboards reaches 0.976 m, which is 0.0887 —
    further, because the trailboards are 0.075 m prouder and the bow they
    stand on is BLUFF where the frigate's is fine. (It was 0.923 m, 0.0839:
    the trailboards hang a fixed drop below the waist cap
    (`trailboard_aft`/`_fwd`), and the cap came down 0.55 m onto a wider
    part of the bow when the lower battery left the bulwark, the maintainer's ruling
    2026-10-05, R4.) What must hold on both
    ships is that nothing of the head stands outside the ship's own maximum
    half-beam, and that is asserted instead of a hard-coded 0.6.
    """
    for p, frac in ((F, 0.0481), (G, 0.0887)):
        lo, hi = carving.bounds(p)
        assert lo[0] < 0.0 < hi[0]
        assert hi[0] == pytest.approx(-lo[0], abs=1e-12)
        assert hi[0] / p.beam == pytest.approx(frac, abs=0.001)
        assert hi[0] < p.half_beam


# `test_the_carving_is_let_into_the_knee_it_stands_on` read the knee's
# OUTLINE at the heel's height and found its forward edge at y 19.33. Since
# The maintainer's third ruling (E) the built knee falls with the rail and stands
# UNDER the heel (KNEE TOP 3.2802 at the heel's y, under the heel centre
# z 3.30), so that test could not go red for anything the knee is built
# as (final review 3, M-3). The claim it carried is held on the built
# knee by `tests/test_galleon_knee.py::
# test_it_meets_the_lions_rump_at_the_rumps_own_height`.


# --- what it all costs ------------------------------------------------------

def test_the_galleons_head_and_carving_declare_their_own_triangle_counts():
    # 556 of rails, timbers, knee and bulkhead (the knee falling with the
    # rail is 13 athwartships rings, 100 tris, where the level-topped fin
    # was 7 rings and 52), plus the unsplit beakhead flight's 144 of frame
    # timbers and 6 of grating cards (split to the rump it drew 432 and 18;
    # a 364 stub before that)
    assert head.head_triangles(G) == 706          # frigate 412
    assert head.head_triangles(F) == 412
    assert carving.triangles(G) == 960            # Minerva 1,224
    assert carving.triangles(F) == profiles.figure_triangles(F)


# --- the HeadForm refuses nonsense ------------------------------------------

@pytest.mark.parametrize("kwargs, match", [
    (dict(board_aft_abaft_stem=-0.1), "abaft the stem"),
    (dict(board_fwd_fwd_of_stem=0.0), "forward of the stem"),
    (dict(board_fwd_below_cap=0.5), "must FALL going forward"),
    (dict(board_exp=0.8), "CORNER"),
    (dict(head_timbers=1), "head_timbers"),
    (dict(knee_reach_frac=1.4), "knee_reach_frac"),
    (dict(timber_first=0.9), "run forward along the rails"),
    (dict(knee_outline=((0.0, 0.0), (0.5, 1.0), (0.4, 0.8))), "climb"),
    (dict(knee_outline=((0.0, 0.0), (0.5, 0.4), (1.0, 0.3))), "widest projection"),
])
def test_a_head_form_that_could_not_be_built_is_refused(kwargs, match):
    with pytest.raises(ValueError, match=match):
        st.HeadForm(**kwargs).validate()


def test_the_bowsprit_plan_refuses_nonsense_too():
    for kwargs, match in (
        (dict(projection=-1.0), "project forward"),
        (dict(steeve_deg=95.0), "steeve_deg"),
        (dict(heel_in=0.0), "ABAFT"),
        (dict(radius=(0.1, 0.4)), "tapers"),
    ):
        with pytest.raises(ValueError, match=match):
            st.Bowsprit(**kwargs).validate()


def test_the_frigates_bowsprit_numbers_did_not_move_when_they_became_data():
    b = F.rig.bowsprit
    assert (b.projection, b.steeve_deg, b.heel_in, b.radius) == \
        (12.0, 24.0, 3.0, (0.38, 0.11))
    g = G.rig.bowsprit
    assert (g.projection, g.steeve_deg, g.heel_in) == (11.6, 32.0, 4.6)
    # The Galeon Andalucia is 38 m of hull and 51 m overall: 0.342 of her own
    # length projects forward of her stem. This galleon's 11.6 m on 34.0 m is
    # the same fraction.
    assert g.projection / G.loa == pytest.approx(13.0 / 38.0, abs=0.005)
