"""Task 10 — shroud, stay, ratline and backstay layout. Pure, no bpy."""

import pytest

from frigate.params import FrigateParams
from frigate import profiles, ropes, wind


@pytest.fixture
def p():
    return FrigateParams()


def _len(rope):
    a, b = rope
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def test_no_rope_anywhere_is_degenerate(p):
    """Every SEGMENT, not every rope: a polyline whose ends are far apart can
    still carry a zero-length leg in the middle, and that is a dead face."""
    for kind, rope in ropes.all_ropes(p):
        assert len(rope) >= 2, kind
        for a, b in zip(rope, rope[1:]):
            assert _len((a, b)) > 0.04, f"{kind} leg is {_len((a, b)):.4f} m long"
        assert _len((rope[0], rope[-1])) > 0.5, kind


def test_no_rope_dips_below_the_waterline(p):
    for kind, rope in ropes.all_ropes(p):
        assert min(pt[2] for pt in rope) > 0.0, kind


def test_each_mast_carries_one_shroud_per_chainplate_a_side(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            assert len(ropes.lower_shrouds(p, mast, sign)) == profiles.chainplate_count(p, mast)


def test_every_shroud_is_set_up_to_its_own_chainplate_head(p):
    for mast in profiles.mast_names(p):
        heads = [h for h, _f in profiles.chainplate_segments(p, mast)]
        for sign in (-1.0, 1.0):
            for (foot, _head), expected in zip(ropes.lower_shrouds(p, mast, sign), heads):
                assert foot[0] == pytest.approx(sign * expected[0])
                assert foot[1] == pytest.approx(expected[1])
                assert foot[2] == pytest.approx(expected[2])


def test_shrouds_lead_up_and_inboard_to_the_masthead(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for foot, head in ropes.lower_shrouds(p, mast, sign):
                assert head[2] > foot[2]
                assert abs(head[0]) < abs(foot[0])
                assert head[0] * sign > 0.0, "a shroud stays on its own side"


def test_the_shroud_fan_gathers_below_its_own_top(p):
    for mast in profiles.mast_names(p):
        top_z = profiles.top_platform(p, mast)[0]
        for _foot, head in ropes.lower_shrouds(p, mast, 1.0):
            assert head[2] < top_z


def test_ratlines_run_horizontally_across_one_side_of_one_fan(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for a, b in ropes.ratlines(p, mast, sign):
                assert a[2] == pytest.approx(b[2]), "a ratline is level"
                assert a[0] * sign > 0.0 and b[0] * sign > 0.0


def test_ratlines_are_evenly_spaced_and_stop_short_of_the_masthead(p):
    for mast in profiles.mast_names(p):
        zs = sorted({a[2] for a, _b in ropes.ratlines(p, mast, 1.0)})
        assert len(zs) > 8
        gaps = [b - a for a, b in zip(zs, zs[1:])]
        assert max(gaps) - min(gaps) < 1e-9
        assert gaps[0] == pytest.approx(ropes.RATLINE_SPACING, abs=ropes.RATLINE_SPACING)
        assert max(zs) < profiles.top_platform(p, mast)[0]


def test_every_ratline_end_lands_on_a_shroud(p):
    """A ratline is seized to the outermost shrouds, not hung in the air."""
    for mast in profiles.mast_names(p):
        shrouds = ropes.lower_shrouds(p, mast, 1.0)
        for a, b in ropes.ratlines(p, mast, 1.0):
            for end, shroud in ((a, shrouds[0]), (b, shrouds[-1])):
                foot, head = shroud
                f = (end[2] - foot[2]) / (head[2] - foot[2])
                for axis in range(2):
                    assert end[axis] == pytest.approx(
                        foot[axis] + f * (head[axis] - foot[axis])
                    )


def test_a_ratline_narrows_as_it_climbs_the_fan(p):
    for mast in profiles.mast_names(p):
        widths = [abs(b[0] - a[0]) for a, b in ropes.ratlines(p, mast, 1.0)]
        assert widths[0] > widths[-1]


def test_every_stay_runs_forward_and_down_from_its_own_masthead(p):
    """That is what a stay is: it holds the mast against falling aft."""
    stays = ropes.stays(p)
    assert len(stays) == 9
    for a, b in stays:
        assert b[1] > a[1], "a stay leads forward"
        assert b[2] < a[2], "and down"


def test_stays_stay_on_the_centreline(p):
    for a, b in ropes.stays(p):
        assert a[0] == 0.0 and b[0] == 0.0


def test_backstays_run_aft_and_down_to_the_channels(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            pairs = ropes.backstays(p, mast, sign)
            assert len(pairs) == 2
            for a, b in pairs:
                assert b[1] < a[1], "a backstay leads aft"
                assert b[2] < a[2]
                assert b[0] * sign > 0.0


def test_the_headstays_are_set_up_to_the_bowsprit(p):
    """The two forwardmost stays must land ON the spar, between heel and tip."""
    heel, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    landed = 0
    for _a, b in ropes.stays(p):
        if b[1] > profiles.station_y(p, 0.0):
            f = (b[1] - heel[1]) / (tip[1] - heel[1])
            assert 0.0 <= f <= 1.0
            assert b[2] == pytest.approx(heel[2] + f * (tip[2] - heel[2]))
            landed += 1
    assert landed >= 2


def test_the_whole_rig_is_mirror_symmetric(p):
    for mast in profiles.mast_names(p):
        port = ropes.lower_shrouds(p, mast, -1.0)
        stbd = ropes.lower_shrouds(p, mast, 1.0)
        for (pa, pb), (sa, sb) in zip(port, stbd):
            assert pa[0] == pytest.approx(-sa[0])
            assert pb[0] == pytest.approx(-sb[0])


def test_every_yard_arm_is_braced_aft_to_the_rail(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            pairs = ropes.braces(p, mast, sign)
            assert len(pairs) == len(profiles.yard_specs(p, mast))
            for arm, foot in pairs:
                assert foot[1] < arm[1], "a brace leads aft"
                assert foot[2] < arm[2], "and down"
                assert arm[0] * sign > 0.0 and foot[0] * sign > 0.0


def test_a_brace_is_belayed_clear_OUTBOARD_of_the_bulwark_timber(p):
    """The brace foot used to sit exactly ON the bulwark's outer skin, so half
    of every brace ribbon was buried in the timber: 18 braces, 36 intersecting
    face pairs, and the twelve checks that came before `check_intersections`
    were all green over it. A brace is belayed to a block hooked at the ship's
    side, which is OUTBOARD of the planking, not inside it."""
    for mast in profiles.mast_names(p):
        for _arm, foot in ropes.braces(p, mast, 1.0):
            t = profiles.t_of_y(p, foot[1])
            cap = profiles.sheer(p, t) + p.bulwark_h
            assert foot[2] == pytest.approx(cap), "still belayed at the cap"
            skin = profiles.bulwark_half_width(p, t, cap)
            assert foot[0] == pytest.approx(skin + ropes.BRACE_FOOT_CLEAR)
            assert ropes.BRACE_FOOT_CLEAR > 0.055 / 2.0, (
                "the clearance must exceed half a brace ribbon's width or the "
                "ribbon still cuts the timber")


def test_the_topmast_shroud_fan_stands_abaft_its_own_mast_axis(p):
    """A topsail hangs `wind.SAIL_FWD` = 0.45 m FORWARD of its own mast, so a
    futtock/topmast fan that spread forward of the mast axis ran straight
    through the canvas — 14 ropes, found by `check_intersections` and by
    nothing before it. Keeping the whole fan abaft the axis keeps it abaft the
    canvas with 0.45 m to spare."""
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for end in (a for pair in ropes.topmast_shrouds(p, mast, sign) for a in pair):
                axis_y = profiles.mast_point(p, mast, end[2])[1]
                assert end[1] <= axis_y + 1e-9, (mast, end)


def test_the_topmast_shroud_feet_still_land_on_their_own_top(p):
    """Abaft the axis, yes — but not off the back of the platform."""
    for mast in profiles.mast_names(p):
        top_z, half_x, half_y = profiles.top_platform(p, mast)
        axis_y = profiles.mast_point(p, mast, top_z)[1]
        for foot, _head in ropes.topmast_shrouds(p, mast, 1.0):
            assert foot[0] == pytest.approx(half_x)
            assert axis_y - half_y <= foot[1] <= axis_y + half_y


def test_a_brace_starts_at_its_own_yard_arm(p):
    for mast in profiles.mast_names(p):
        specs = profiles.yard_specs(p, mast)
        for (arm, _foot), (z, length, _r) in zip(ropes.braces(p, mast, 1.0), specs):
            assert arm[2] == pytest.approx(z)
            assert arm[0] == pytest.approx(length / 2.0)


# --- Task 16: the rest of the rig ------------------------------------------

def test_every_kind_of_rope_the_rig_needs_is_present_in_the_expected_number(p):
    counts = ropes.kind_counts(p)
    masts = len(profiles.mast_names(p))
    yards = sum(len(profiles.yard_specs(p, m)) for m in profiles.mast_names(p))
    assert counts["futtock"] == 2 * masts * ropes.TOPMAST_SHROUDS
    assert counts["topgallant_shroud"] == 2 * masts * ropes.TOPGALLANT_SHROUDS
    assert counts["topgallant_backstay"] == 2 * masts
    assert counts["lift"] == 2 * yards
    assert counts["footrope"] == 2 * yards
    assert counts["stirrup"] == 2 * yards * (ropes.FOOTROPE_SEGMENTS - 1)
    assert counts["clewline"] == 2 * yards
    assert counts["sheet"] == 2 * yards
    assert counts["buntline"] == yards * ropes.BUNTLINES
    assert counts["bobstay"] == 2
    assert counts["bowsprit_shroud"] == 2
    assert counts["jib_guy"] == 2


def test_only_running_rigging_is_ever_anything_but_dead_straight(p):
    """Shrouds and stays are set up TAUT. A sagging stay is a modelling error.

    This is the assertion that stops sag spreading for the sake of triangles:
    the moment a shroud, stay, backstay or ratline gains a third point, it
    fails here, whatever the budget line says.
    """
    for kind, rope in ropes.all_ropes(p):
        if kind not in ropes.RUNNING:
            assert len(rope) == 2, f"{kind} is segmented and has no business being"


def test_a_footrope_hangs_in_a_bight_below_both_its_seizings(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for rope in ropes.footropes(p, mast, sign):
                zs = [pt[2] for pt in rope]
                mid = len(zs) // 2
                assert zs[mid] < zs[0] and zs[mid] < zs[-1]
                # Down to the bight, then up again: one sag, not a wobble.
                assert zs[:mid + 1] == sorted(zs[:mid + 1], reverse=True)
                assert zs[mid:] == sorted(zs[mid:])
                assert zs[0] == pytest.approx(zs[-1], abs=1e-9)


def test_a_footrope_hangs_abaft_its_own_yard_and_clear_of_its_own_sail(p):
    """Both endpoints named: footrope-y to sail-panel-y of the sail on that yard."""
    for mast in profiles.mast_names(p):
        for tier in range(len(profiles.yard_specs(p, mast))):
            panel_y = wind.sail_panel(p, mast, tier)["y"]
            yard_z = profiles.yard_specs(p, mast)[tier][0]
            yard_y = profiles.mast_point(p, mast, yard_z)[1]
            for sign in (-1.0, 1.0):
                rope = ropes.footropes(p, mast, sign)[tier]
                for pt in rope:
                    assert pt[1] < yard_y          # abaft the yard
                    assert pt[1] < panel_y         # and abaft the canvas
                    assert pt[2] < yard_z          # and below it


def test_a_stirrup_reaches_from_its_yard_down_to_its_own_footrope(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            feet = {tuple(round(c, 9) for c in pt)
                    for rope in ropes.footropes(p, mast, sign) for pt in rope}
            for top, bottom in ropes.stirrups(p, mast, sign):
                assert top[2] > bottom[2]
                # The foot is a point the footrope actually passes THROUGH,
                # not merely close to its curve.
                assert tuple(round(c, 9) for c in bottom) in feet


def test_a_buntline_lies_on_the_canvas_it_is_rove_to_rather_than_through_it(p):
    """Every node stands exactly BUNTLINE_LIFT off the sail, along its normal.

    A chord from a buntline's foot to its head passes through the belly it is
    supposed to lie against -- that is the whole reason this rope is a
    polyline. Measured as: the node, minus the sail point under it, is the
    sail's own normal times the lift.
    """
    for mast in profiles.mast_names(p):
        lines = ropes.buntlines(p, mast)
        per_sail = ropes.BUNTLINES
        for tier in range(len(profiles.yard_specs(p, mast))):
            for k in range(per_sail):
                rope = lines[tier * per_sail + k]
                u = -1.0 + 2.0 * (k + 1) / (per_sail + 1)
                for i in range(ropes.BUNTLINE_SEGMENTS + 1):
                    v = i / ropes.BUNTLINE_SEGMENTS
                    c = wind.sail_point(p, mast, tier, u, v)
                    n = wind.sail_normal(p, mast, tier, v)
                    want = [c[j] + ropes.BUNTLINE_LIFT * n[j] for j in range(3)]
                    assert rope[i] == pytest.approx(want, abs=1e-12)


def test_a_buntline_stands_clear_of_what_is_SEWN_to_the_sail_too(p):
    """Not just clear of the canvas -- clear of the patches on it.

    The canvas is convex, so the chord between two nodes of a buntline lies
    nearer the sail than either node does. At a flat 0.040 m lift that chord
    dipped to 0.010 m off the cloth, well inside the 0.035 m a sail patch
    stands proud, and the buntlines cut 36 face pairs out of the patches they
    crossed. The quantity is the clearance at the MIDDLE of each leg, against
    `wind.PATCH_LIFT`, and it is measured along the sail's own normal.
    """
    for mast in profiles.mast_names(p):
        lines = ropes.buntlines(p, mast)
        for tier in range(len(profiles.yard_specs(p, mast))):
            for k in range(ropes.BUNTLINES):
                rope = lines[tier * ropes.BUNTLINES + k]
                u_sail = -1.0 + 2.0 * (k + 1) / (ropes.BUNTLINES + 1)
                for i in range(ropes.BUNTLINE_SEGMENTS):
                    v = (i + 0.5) / ropes.BUNTLINE_SEGMENTS
                    mid = [(a + b) / 2 for a, b in zip(rope[i], rope[i + 1])]
                    c = wind.sail_point(p, mast, tier, u_sail, v)
                    n = wind.sail_normal(p, mast, tier, v)
                    off = sum((mid[j] - c[j]) * n[j] for j in range(3))
                    assert off > wind.PATCH_LIFT, (
                        f"buntline leg sits {off:.4f} m off the canvas, inside "
                        f"the {wind.PATCH_LIFT} m a patch stands proud")


def test_a_buntline_is_led_to_a_block_above_its_own_sail_head(p):
    for mast in profiles.mast_names(p):
        for tier, (yard_z, _l, _r) in enumerate(profiles.yard_specs(p, mast)):
            head_z = wind.sail_panel(p, mast, tier)["head_z"]
            yard_y = profiles.mast_point(p, mast, yard_z)[1]
            for k in range(ropes.BUNTLINES):
                rope = ropes.buntlines(p, mast)[tier * ropes.BUNTLINES + k]
                assert rope[-1][2] > head_z
                assert rope[-1][1] == pytest.approx(yard_y, abs=1e-12)


def test_a_lift_rises_from_its_yard_arm_to_a_masthead_above_that_yard(p):
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for tier, (arm, head_pt) in enumerate(ropes.lifts(p, mast, sign)):
                yard_z, length, _r = profiles.yard_specs(p, mast)[tier]
                assert arm[2] == pytest.approx(yard_z, abs=1e-12)
                assert abs(arm[0]) == pytest.approx(length / 2.0 - ropes.LIFT_ARM_IN)
                assert head_pt[2] > yard_z
                assert abs(head_pt[0]) < abs(arm[0])


def test_a_clewline_leads_AFT_from_the_clew_it_is_bent_to(p):
    """Which is how it passes clear of its own sail without being routed to."""
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for tier, (clew, yard_pt) in enumerate(ropes.clewlines(p, mast, sign)):
                assert clew == pytest.approx(
                    wind.sail_point(p, mast, tier, sign * 1.0, 0.0), abs=1e-12)
                assert yard_pt[1] < clew[1]        # leads aft
                assert yard_pt[2] > clew[2]        # and up to its yard
                assert abs(yard_pt[0]) < abs(clew[0])


def test_a_futtock_shroud_leads_down_and_INBOARD_from_the_rim_it_hangs_under(p):
    for mast in profiles.mast_names(p):
        _top_z, half_x, _half_y = profiles.top_platform(p, mast)
        for sign in (-1.0, 1.0):
            for foot, rim in ropes.futtock_shrouds(p, mast, sign):
                assert abs(rim[0]) == pytest.approx(half_x)
                assert foot[2] < rim[2]
                assert abs(foot[0]) < abs(rim[0])


def test_the_upper_fans_stand_ABAFT_the_mast_that_carries_their_canvas(p):
    """The topmast fan was moved abaft the axis once already, because its
    forward legs ran through the topsail. The topgallant fan is built the same
    way for the same reason, and this is what holds it there."""
    for mast in profiles.mast_names(p):
        for sign in (-1.0, 1.0):
            for foot, head_pt in ropes.topgallant_shrouds(p, mast, sign):
                for pt in (foot, head_pt):
                    assert pt[1] <= profiles.mast_point(p, mast, pt[2])[1] + 1e-9


def test_a_bobstay_sets_up_to_the_knee_of_the_head_and_passes_under_the_figure(p):
    """Both endpoints named: bobstay-foot to knee-forward-edge, and
    bobstay-at-the-figure's-station to figurehead-underside."""
    from frigate import head
    y_stem = profiles.station_y(p, 0.0)
    lo, hi = profiles.figure_bounds(p)
    for spar_end, knee_end in ropes.bobstays(p):
        assert knee_end[0] == 0.0
        assert knee_end[1] > y_stem              # on the knee's forward edge
        assert spar_end[2] > knee_end[2]
        assert knee_end[2] > 0.0
        # Under the carving ITSELF, wherever the two share a station --
        # measured against the figure's own underside at that y, not against
        # its bounding box plus a number chosen to make the test pass.
        carving = profiles.figure_all_points(p)
        for k in range(33):
            y = lo[1] + (hi[1] - lo[1]) * k / 32.0
            band = [c[2] for c in carving if abs(c[1] - y) < 0.12]
            f = (y - spar_end[1]) / (knee_end[1] - spar_end[1])
            if band and 0.0 <= f <= 1.0:
                z = spar_end[2] + (knee_end[2] - spar_end[2]) * f
                assert z < min(band), (
                    f"bobstay is at z {z:.3f} where the carving's underside "
                    f"is {min(band):.3f}, at y {y:.3f}")


def test_head_rigging_sets_up_on_the_ships_side_at_the_beakhead_bulkhead(p):
    from frigate import head
    t = head.beakhead_t(p)
    cap = profiles.sheer(p, t) + p.bulwark_h
    for sign in (-1.0, 1.0):
        for rope in ropes.bowsprit_shrouds(p, sign) + ropes.jib_guys(p, sign):
            spar_end, foot = rope
            assert foot[2] == pytest.approx(cap, abs=1e-9)
            assert foot[1] == pytest.approx(profiles.station_y(p, t), abs=1e-9)
            assert abs(foot[0]) > profiles.bulwark_half_width(p, t, cap)
            assert spar_end[0] == 0.0 and spar_end[2] > foot[2]


def test_the_face_map_lines_up_with_the_order_the_ropes_are_emitted_in(p):
    """`check_intersections` reads a rope's KIND off a face index. If this
    mapping slips, a shroud through a topsail is reported as whatever kind
    happens to sit at that index, which is worse than not checking at all."""
    plan = ropes.all_ropes(p)
    kinds = ropes.face_kinds(p)
    assert len(kinds) == sum(ropes.segments(rope) for _k, rope in plan)
    i = 0
    for kind, rope in plan:
        for _ in range(ropes.segments(rope)):
            assert kinds[i] == kind
            i += 1
    assert i == len(kinds)
