"""Which parts move and where each one turns. Plain pytest, no bpy.

A glTF node animates about ITS OWN ORIGIN, so a pivot in the wrong place is a
part that swings about the ship's keel instead of its own hinge — and looks
plausible in Blender, where nothing is animated at all. Every test here is
written as the mutant it is meant to catch.
"""

import math

import pytest

from frigate import profiles, rig, rudder
from frigate.params import FrigateParams

HUB = 0.93   # the wheel hub above the quarterdeck; `furniture` owns the real one


@pytest.fixture
def p():
    return FrigateParams()


# --- the table ---------------------------------------------------------------


def test_every_part_that_moves_is_in_the_table_and_nothing_else_is(p):
    parts = rig.animatable_parts(p)
    assert len(parts) == 24 + 9 + 1 + 1
    assert len(set(parts)) == len(parts)
    assert sum(1 for n in parts if n.startswith("PortLid_")) == 24
    assert sum(1 for n in parts if n.startswith("Yard_")) == 9
    assert "Wheel" in parts and "Rudder" in parts
    # Split only what moves: these stay merged and say so.
    for name in ("Rigging", "Sails", "Hull", "Masts", "Deck_Furniture"):
        assert name not in parts
        assert len(rig.MERGED_ON_PURPOSE[name]) > 30


def test_every_pivot_says_what_it_turns_about_and_how_far(p):
    for piv in rig.pivots(p, HUB):
        assert len(piv.why) > 40, piv.part
        assert piv.range_deg[0] <= piv.range_deg[1]
        assert piv.range_deg != (0.0, 0.0)
        assert math.isclose(sum(c * c for c in piv.axis), 1.0, abs_tol=1e-9)
        assert math.isclose(sum(c * c for c in piv.local_axis), 1.0, abs_tol=1e-9)


def test_a_pivot_measures_how_far_a_point_lies_off_its_own_axis(p):
    piv = rig.rudder_pivot(p)
    assert piv.distance_from(piv.point) == pytest.approx(0.0)
    # Straight up the axis is still ON the axis.
    up = tuple(a + 5.0 * b for a, b in zip(piv.point, piv.axis))
    assert piv.distance_from(up) == pytest.approx(0.0, abs=1e-9)
    # A metre sideways is a metre off it.
    off = (piv.point[0] + 1.0, piv.point[1], piv.point[2])
    assert piv.distance_from(off) == pytest.approx(1.0)


def test_two_axes_pointing_opposite_ways_are_the_same_axis():
    """A hinge line has no preferred end, and eleven lids are on the other side."""
    assert rig.axis_error_deg((0, 1, 0), (0, -1, 0)) == pytest.approx(0.0)
    assert rig.axis_error_deg((0, 1, 0), (0, 0, 1)) == pytest.approx(90.0)
    assert rig.axis_error_deg((0, 1, 0), (0, 1, 0.1)) == pytest.approx(
        math.degrees(math.atan(0.1)), abs=1e-6)


# --- the port lids -----------------------------------------------------------


def test_every_lid_pivots_on_the_head_of_its_own_aperture(p):
    """Hinge z to its own sill z, both named: exactly one aperture height."""
    for index, lid in enumerate(profiles.lid_placements(p)):
        piv = rig.lid_pivots(p)[index]
        assert piv.point == pytest.approx(tuple(lid["hinge"]))
        if lid["kind"] == "broadside":
            t = profiles.t_of_y(p, lid["hinge"][1])
            head = profiles.sheer(p, t) + p.gun_decks[0].sill + p.gun_decks[0].height
            sill = profiles.sheer(p, t) + p.gun_decks[0].sill
            assert piv.point[2] == pytest.approx(head, abs=1e-6)
            assert piv.point[2] - sill == pytest.approx(p.gun_decks[0].height, abs=1e-6)


def test_a_lid_hinge_is_horizontal_because_an_aperture_head_is(p):
    for piv in rig.lid_pivots(p):
        assert piv.axis[2] == pytest.approx(0.0)


def test_the_broadside_hinges_run_fore_and_aft_and_the_chase_ones_athwartships(p):
    lids = profiles.lid_placements(p)
    for piv, lid in zip(rig.lid_pivots(p), lids):
        if lid["kind"] == "broadside":
            assert rig.axis_error_deg(piv.axis, (0, 1, 0)) == pytest.approx(0.0)
        else:
            assert rig.axis_error_deg(piv.axis, (1, 0, 0)) == pytest.approx(0.0)


def test_shut_is_one_rotation_about_one_axis(p):
    assert rig.lid_shut_deg(p) == profiles.LID_OPEN_DEG == 68.0
    for piv in rig.lid_pivots(p):
        assert piv.local_axis == (0.0, 1.0, 0.0)
        assert piv.range_deg == (0.0, 68.0)


def test_there_are_twenty_four_lids_and_they_are_all_different_places(p):
    points = [piv.point for piv in rig.lid_pivots(p)]
    assert len(points) == 24
    assert len({tuple(round(c, 4) for c in q) for q in points}) == 24


# --- the yards ---------------------------------------------------------------


def test_there_are_nine_yards_three_to_a_mast(p):
    order = rig.yard_order(p)
    assert len(order) == 9
    for name in profiles.mast_names(p):
        assert sum(1 for m, _t in order if m == name) == 3


def test_a_yard_is_named_by_its_place_in_that_order(p):
    assert rig.yard_name(0) == "Yard_00"
    assert rig.yard_name(8) == "Yard_08"
    assert rig.yard_index(p, profiles.mast_names(p)[0], 0) == 0
    assert rig.yard_index(p, profiles.mast_names(p)[-1], 2) == 8


def test_every_yard_pivots_on_its_own_mast_axis_and_not_on_another(p):
    for index, (mast, tier) in enumerate(rig.yard_order(p)):
        piv = rig.yard_pivots(p)[index]
        z, _length, _r = profiles.yard_specs(p, mast)[tier]
        assert piv.point == pytest.approx(profiles.mast_point(p, mast, z))
        # ON the mast axis: the foot and the truck of its own mast are both
        # on the line the pivot turns about.
        assert piv.distance_from(profiles.mast_foot(p, mast)) == pytest.approx(
            0.0, abs=1e-9)
        assert piv.distance_from(
            profiles.mast_point(p, mast, profiles.mast_truck_z(p, mast))
        ) == pytest.approx(0.0, abs=1e-9)


def test_a_yard_pivot_is_NOT_on_any_other_mast(p):
    """The mutation this is for: nine yards all hung on the mainmast."""
    pivots = rig.yard_pivots(p)
    for index, (mast, _tier) in enumerate(rig.yard_order(p)):
        for other in profiles.mast_names(p):
            if other == mast:
                continue
            assert pivots[index].distance_from(
                profiles.mast_foot(p, other)) > 5.0


def test_the_yard_axis_rakes_aft_with_its_own_mast(p):
    for name in profiles.mast_names(p):
        axis = rig.mast_axis(p, name)
        assert axis[0] == pytest.approx(0.0)
        assert axis[1] < 0.0, "a mast rakes AFT, which is -Y on this ship"
        assert axis[2] > 0.0
        rake = math.degrees(math.atan2(-axis[1], axis[2]))
        assert rake == pytest.approx(profiles.mast_rake_deg(p, name), abs=1e-6)


def test_the_mast_axis_is_not_the_world_vertical_and_that_is_the_point(p):
    """Bracing about the vertical would make the arms climb and dip."""
    worst = max(rig.axis_error_deg(rig.mast_axis(p, n), (0, 0, 1))
                for n in profiles.mast_names(p))
    assert worst == pytest.approx(max(profiles.mast_rake_deg(p, m) for m in profiles.mast_names(p)), abs=1e-6)
    assert worst > 1.0


def test_a_braced_yard_slides_its_arm_out_from_under_its_own_rope(p):
    """The maintainer's ruling, as a number. The cost is recorded, not hidden."""
    slip = rig.brace_slip(p, rig.BRACE_LIMIT_DEG)
    longest = max(length for n in profiles.mast_names(p)
                  for _z, length, _r in profiles.yard_specs(p, n))
    assert slip == pytest.approx(
        longest * math.sin(math.radians(rig.BRACE_LIMIT_DEG) / 2.0))
    assert rig.brace_slip(p, 0.0) == pytest.approx(0.0)
    assert rig.brace_slip(p, 40.0) > slip


def test_the_brace_limit_is_a_working_brace_and_not_hard_round(p):
    assert 10.0 <= rig.BRACE_LIMIT_DEG <= 30.0
    for piv in rig.yard_pivots(p):
        assert piv.range_deg == (-rig.BRACE_LIMIT_DEG, rig.BRACE_LIMIT_DEG)


# --- the wheel ---------------------------------------------------------------


def test_the_wheel_turns_on_a_fore_and_aft_spindle(p):
    piv = rig.wheel_pivot(p, HUB)
    assert rig.axis_error_deg(piv.axis, (0, 1, 0)) == pytest.approx(0.0)
    assert piv.local_axis == (0.0, 1.0, 0.0)


def test_the_wheel_pivot_is_its_hub_and_not_its_foot(p):
    piv = rig.wheel_pivot(p, HUB)
    foot = rig.wheel_origin(p)
    assert piv.point[0] == pytest.approx(foot[0])
    assert piv.point[1] == pytest.approx(foot[1])
    assert piv.point[2] - foot[2] == pytest.approx(HUB)
    assert piv.point[2] > foot[2]


def test_the_wheel_stands_where_the_furniture_layout_puts_it(p):
    placed = [i for i in profiles.furniture_placements(p) if i["kind"] == "wheel"]
    assert len(placed) == 1
    assert rig.wheel_origin(p) == pytest.approx(tuple(placed[0]["origin"]))


# --- the rudder --------------------------------------------------------------


def test_the_rudder_turns_on_its_stock_and_the_stock_is_vertical(p):
    piv = rig.rudder_pivot(p)
    assert piv.axis == pytest.approx((0.0, 0.0, 1.0))
    assert piv.point[0] == pytest.approx(0.0)
    assert piv.point[1] == pytest.approx(rudder.nose_y(p))


def test_the_stock_passes_through_every_pintle(p):
    piv = rig.rudder_pivot(p)
    for lo, hi in rudder.pintle_boxes(p):
        centre = tuple(0.5 * (a + b) for a, b in zip(lo, hi))
        # The strap is a box round the leading edge, so its CENTRE is aft of
        # the stock; what must hold is that the stock passes through the box.
        assert lo[0] < piv.point[0] < hi[0]
        assert lo[1] < piv.point[1] < hi[1]
        assert piv.distance_from((piv.point[0], piv.point[1], centre[2])) \
            == pytest.approx(0.0, abs=1e-9)


def test_hard_over_is_the_rudder_s_own_stated_limit(p):
    piv = rig.rudder_pivot(p)
    assert piv.range_deg == (-rudder.HARD_OVER_DEG, rudder.HARD_OVER_DEG)


# --- the split plan ----------------------------------------------------------


def test_the_split_plan_names_what_each_merged_object_becomes(p):
    plan = rig.split_plan(p)
    assert plan["Yards"] == [rig.yard_name(i) for i in range(9)]
    assert plan["Deck_Furniture"] == ["Wheel"]
    # The lids and the rudder were already their own nodes.
    assert "PortLid_00" not in plan
    assert "Rudder" not in plan


def test_everything_the_split_produces_is_in_the_pivot_table(p):
    made = {name for names in rig.split_plan(p).values() for name in names}
    assert made <= set(rig.animatable_parts(p))
