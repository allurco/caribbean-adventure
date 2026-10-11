"""Task 12 — deck furniture layout. Pure, no bpy."""

import pytest

from frigate.params import FrigateParams
from frigate import profiles


@pytest.fixture
def p():
    return FrigateParams()


def _of(p, kind):
    return [f for f in profiles.furniture_placements(p) if f["kind"] == kind]


def test_the_brief_s_whole_furniture_list_is_present(p):
    kinds = {f["kind"] for f in profiles.furniture_placements(p)}
    assert {"wheel", "capstan", "boat", "barrel", "anchor", "lantern"} <= kinds
    assert sum(1 for f in profiles.furniture_placements(p) if f["kind"].startswith("hatch")) == 3


def test_everything_on_deck_stands_on_the_deck_under_it(p):
    for item in profiles.furniture_placements(p):
        if item["kind"] in ("lantern", "anchor", "boat"):
            continue
        x, y, z = item["origin"]
        t = profiles.t_of_y(p, y)
        assert z == pytest.approx(
            profiles.deck_z_at(p, t, x, profiles.deck_rise_at(p, t))
        )


def test_a_fitting_aft_of_the_quarterdeck_break_stands_on_the_quarterdeck(p):
    """Not on the gun deck 1.2 m below it, which is where a naive placement puts
    the wheel — under the platform the helmsman is supposed to be standing on."""
    wheel = _of(p, "wheel")[0]
    t = profiles.t_of_y(p, wheel["origin"][1])
    assert t > p.quarter_t
    assert profiles.deck_rise_at(p, t) == pytest.approx(p.quarter_rise)


def test_the_wheel_stands_abaft_the_mizzen(p):
    wheel_t = profiles.t_of_y(p, _of(p, "wheel")[0]["origin"][1])
    assert wheel_t > profiles.mast_t(p, "mizzen")


def test_the_capstan_stands_between_the_fore_and_main_masts(p):
    t = profiles.t_of_y(p, _of(p, "capstan")[0]["origin"][1])
    assert profiles.mast_t(p, "fore") < t < profiles.mast_t(p, "main")


def test_no_fitting_fouls_a_mast(p):
    for item in profiles.furniture_placements(p):
        if item["kind"] in ("lantern", "anchor"):
            continue
        y = item["origin"][1]
        for mast in profiles.mast_names(p):
            foot_y = profiles.mast_foot(p, mast)[1]
            assert abs(y - foot_y) > 0.9, f"{item['kind']} sits on the {mast} mast"


def test_nothing_on_deck_is_wider_than_the_deck_it_stands_on(p):
    for item in profiles.furniture_placements(p):
        if item["kind"] in ("lantern", "anchor"):
            continue
        x, y, _z = item["origin"]
        t = profiles.t_of_y(p, y)
        assert abs(x) < profiles.deck_half_beam(p, t)


def test_the_launch_is_stowed_on_skids_above_the_deck(p):
    boat = _of(p, "boat")[0]
    x, y, z = boat["origin"]
    t = profiles.t_of_y(p, y)
    deck = profiles.deck_z_at(p, t, x, profiles.deck_rise_at(p, t))
    assert z - deck == pytest.approx(profiles.BOAT_ON_SKIDS)
    assert z < profiles.sheer(p, t) + p.bulwark_h, "and still below the rail cap"


def test_barrels_are_stowed_down_both_sides_in_pairs(p):
    barrels = _of(p, "barrel")
    assert len(barrels) == 8
    xs = sorted(b["origin"][0] for b in barrels)
    for a, b in zip(xs, reversed(xs)):
        assert a == pytest.approx(-b)


def test_three_lanterns_stand_on_the_taffrail(p):
    lanterns = _of(p, "lantern")
    assert len(lanterns) == profiles.LANTERNS
    rail = profiles.sheer(p, 1.0) + p.bulwark_h
    for item in lanterns:
        assert item["origin"][2] == pytest.approx(rail)
    xs = sorted(item["origin"][0] for item in lanterns)
    assert xs[0] == pytest.approx(-xs[-1])
    assert abs(xs[-1]) < profiles.stern_half_width(p, rail)


def test_the_two_anchors_are_catted_on_the_bow_against_the_hull(p):
    anchors = _of(p, "anchor")
    assert len(anchors) == 2
    for item in anchors:
        x, y, z = item["origin"]
        t = profiles.t_of_y(p, y)
        assert abs(x) == pytest.approx(profiles.anchor_bearing_x(p))
        assert z < profiles.sheer(p, t) + p.bulwark_h
        assert t < p.gun_decks[0].t0, "the anchors hang forward of the foremost gunport"
    assert anchors[0]["origin"][0] == pytest.approx(-anchors[1]["origin"][0])


def test_the_anchor_hangs_from_where_it_bears_not_from_its_ring(p):
    """It used to be set out by the bulwark's half-width AT THE RING, which is
    the one point of a 2.2 m anchor that touches nothing. The bow flares under
    it, so the fluke ended up 0.226 m inside the planking it is ruled to lie
    against. It must now stand outside everything its own footprint covers."""
    ring = profiles.bulwark_half_width(p, profiles.ANCHOR_T, profiles.anchor_ring_z(p))
    assert profiles.anchor_bearing_x(p) > ring, "the ring was never the bearing"


def _anchor_burials(p):
    """How deep every point of the anchor's own skin is in the ship's side.

    Both ends of the measurement named at every point: the anchor's OWN
    SURFACE, from `profiles.anchor_surface`, against the planking or bulwark
    at that same station and height. Positive is buried.
    """
    x = profiles.anchor_bearing_x(p)
    y0 = profiles.station_y(p, profiles.ANCHOR_T)
    z0 = profiles.anchor_ring_z(p)
    out = []
    for dy, dz, inboard in profiles.anchor_surface():
        y, z = y0 + dy, z0 + dz
        t = max(0.0, min(1.0, profiles.t_of_y(p, y)))
        if z >= profiles.sheer(p, t) + p.bulwark_h:
            continue
        side = (profiles.hull_half_width(p, t, z) if z < profiles.sheer(p, t)
                else profiles.bulwark_half_width(p, t, z))
        out.append((side - (x - inboard), y, z))
    return out


def test_nothing_of_the_anchor_is_swallowed_by_the_bow_it_lies_against(p):
    """Measured over the anchor's own SKIN, not over a box round it: no point
    of it may bed into the ship's side by more than `ANCHOR_BED`."""
    for burial, y, z in _anchor_burials(p):
        assert burial <= profiles.ANCHOR_BED + 1e-9, (burial, y, z)


def test_the_anchor_is_bedded_against_the_planking_not_hung_clear_of_it(p):
    """The other half of the same ruling: an anchor standing wholly clear of
    the bow is not STOWED ON it. Something OF THE ANCHOR — not of a box round
    it — must be in contact."""
    assert max(b for b, _y, _z in _anchor_burials(p)) \
        == pytest.approx(profiles.ANCHOR_BED)


def test_a_box_round_the_anchor_would_hold_it_clear_of_the_ship():
    """The mutation this ruling exists to refuse, kept as a measurement.

    Setting the anchor out by the widest the hull gets anywhere under its
    FOOTPRINT, with the shank's half thickness added — which is this same
    arithmetic applied to a solid block filling that footprint — puts it
    further outboard than the shape itself asks for. A real admiralty anchor
    is mostly air, so at the bow's widest point under it there is nothing but
    the tip of an arm, and the block lifts the whole anchor off the ship."""
    p = FrigateParams()
    y0 = profiles.station_y(p, profiles.ANCHOR_T)
    z_ring = profiles.anchor_ring_z(p)
    reach = profiles.ANCHOR_ARM * 1.02
    widest = max(
        (profiles.hull_half_width(p, t, z) if z < profiles.sheer(p, t)
         else profiles.bulwark_half_width(p, t, z))
        for i in range(17)
        for z in [z_ring - (profiles.ANCHOR_SHANK + 0.10) * i / 16.0]
        for j in range(17)
        for y in [y0 + reach * (-1.0 + 2.0 * j / 16.0)]
        for t in [max(0.0, min(1.0, profiles.t_of_y(p, y)))]
    )
    box = widest + profiles.ANCHOR_HALF_THICK - profiles.ANCHOR_BED
    assert box > profiles.anchor_bearing_x(p) + 0.02, (
        box, profiles.anchor_bearing_x(p))


# --- detail pass: the shapes the fittings are actually made of ---------------
#
# Task 12 put every fitting in the right place and then drew it with a handful
# of boxes: 72 triangles for an anchor, 44 for a barrel, a wheel whose spokes
# were cuboids. The layout was never the problem. What follows is the pure math
# the richer shapes need — the launch's sections and thwarts, and the lattice
# inside a hatch grating — so that it can be tested off Blender like everything
# else in `profiles`.


def test_the_launch_is_widest_amidships_and_fine_at_both_ends():
    mid = profiles.boat_station(0.5)[0]
    assert mid == pytest.approx(1.0)
    for f in (0.0, 1.0):
        assert 0.0 < profiles.boat_station(f)[0] < 0.35


def test_the_launch_is_symmetric_end_for_end():
    for f in (0.0, 0.15, 0.37, 0.5):
        for a, b in zip(profiles.boat_station(f), profiles.boat_station(1.0 - f)):
            assert a == pytest.approx(b)


def test_every_thwart_lands_inside_the_launch_it_crosses():
    fracs = profiles.boat_thwart_fracs()
    assert len(fracs) >= 4
    assert all(0.0 < f < 1.0 for f in fracs)
    for f in fracs:
        plan = profiles.boat_station(f)[0]
        assert 0.3 < plan <= 1.0, "a thwart must not fall off the fine ends"


def test_the_thwarts_are_evenly_spaced_and_symmetric_about_midships():
    fracs = profiles.boat_thwart_fracs()
    gaps = [b - a for a, b in zip(fracs, fracs[1:])]
    assert max(gaps) - min(gaps) < 1e-9
    assert all(a == pytest.approx(1.0 - b) for a, b in zip(fracs, reversed(fracs)))


def test_a_grating_fills_its_clear_opening_without_touching_the_coaming():
    clear, batten = 1.23, 0.04
    centres = profiles.grating_lattice(clear, batten, 0.12)
    assert len(centres) >= 5
    assert centres[0] - batten / 2 > -clear / 2
    assert centres[-1] + batten / 2 < clear / 2


def test_grating_battens_are_symmetric_and_never_overlap():
    centres = profiles.grating_lattice(1.23, 0.04, 0.12)
    assert all(a == pytest.approx(-b) for a, b in zip(centres, reversed(centres)))
    for a, b in zip(centres, centres[1:]):
        assert b - a > 0.04, "two battens may not share timber"


def test_a_narrow_opening_still_gets_a_lattice_rather_than_nothing():
    """A grating with no battens is a hole, which is what the coaming is for."""
    assert len(profiles.grating_lattice(0.30, 0.04, 0.12)) >= 2


def test_barrels_stow_in_the_gaps_between_the_gun_stations(p):
    """Two of the eight barrels stood inside a gun carriage — Barrel_02 in
    Cannon_05 and Barrel_03 in Cannon_04, 94 intersecting face pairs — and
    `check_furniture` could not see it, because it measures furniture against
    the deck and the bulwark and never against the battery.

    The rule, rather than a nudge: a barrel is stowed midway between two gun
    stations, where the gun crew is not.
    """
    ts = profiles.gunport_ts(p, 0)
    gaps = [(a + b) / 2.0 for a, b in zip(ts, ts[1:])]
    for kind, t, _x_frac, _yaw in profiles.FURNITURE:
        if kind != "barrel":
            continue
        assert min(abs(t - g) for g in gaps) < 1e-3, (
            f"a barrel at station t={t} is not in a gap between guns")


def test_the_anchor_hangs_clear_of_the_fore_channel(p):
    """Both ends named: the AFTMOST POINT OF THE ANCHOR, which is the after
    end of its stock, and the FORWARD end of the fore channel that spreads the
    foremast shrouds.

    Setting the anchor out from where it bears instead of from its ring moved
    it 0.354 m outboard, far enough to reach the channel's projection, and
    ANCHOR_T 0.125 -> 0.112 is what bought the clearance back. The station has
    not moved since and must not: this clearance is why it is where it is.

    The reach itself shrank from 1.415 m to 0.850 m when the anchor was
    rebuilt, because 1.415 was the outermost of four iron hoops two of which
    were clasping thin air 0.53 m past the end of the stock. That is the
    measurement getting truer, not the clearance getting cheaper."""
    assert profiles.ANCHOR_T == 0.112
    aft = profiles.station_y(p, profiles.ANCHOR_T) - profiles.ANCHOR_AFT_REACH
    fwd_t, _aft_t = profiles.channel_span(p, "fore")
    channel_fwd_end = profiles.station_y(p, fwd_t)
    assert aft - channel_fwd_end >= 0.10, (aft, channel_fwd_end)


# --- the admiralty-pattern anchor -------------------------------------------
#
# 320 triangles of boxes and cylinders read low-res at the range an anchor is
# actually seen from, which on a pirate ship is close. The shape's arithmetic
# lives in `profiles` so it can be judged here, off Blender, like the launch's
# sections and the gratings' lattice; `furniture` only emits it.


def test_the_anchor_has_every_part_an_admiralty_anchor_has():
    assert set(profiles.anchor_parts()) == {
        "ring", "shank", "stock", "hoops", "arms", "flukes", "bills"}


def test_the_arm_sweeps_out_of_the_crown_and_up_to_the_bill():
    """A real arm is an arc, not a staircase of blocks: it leaves the crown
    running outboard and finishes with the bill pointing up and out."""
    arc = profiles.anchor_arm_arc()
    assert len(arc) >= 7
    ys = [y for y, _z, _h in arc]
    zs = [z for _y, z, _h in arc]
    assert ys[0] == pytest.approx(0.0)
    assert zs[0] == pytest.approx(0.0)
    assert all(b > a for a, b in zip(ys, ys[1:])), "the arm runs outboard"
    assert all(b > a for a, b in zip(zs, zs[1:])), "and climbs the whole way"
    # It leaves the crown flatter than it arrives at the bill: that is the arc.
    first = (zs[1] - zs[0]) / (ys[1] - ys[0])
    last = (zs[-1] - zs[-2]) / (ys[-1] - ys[-2])
    assert last > first * 1.8, (first, last)


def test_the_arm_tapers_from_the_crown_to_the_bill():
    halves = [h for _y, _z, h in profiles.anchor_arm_arc()]
    assert all(b <= a for a, b in zip(halves, halves[1:]))
    assert halves[-1] < halves[0] * 0.6


def test_the_bill_is_the_outermost_point_of_the_arm_and_the_fluke_stops_short():
    """The bill is the point that bites; the fluke is the blade behind it."""
    arc = profiles.anchor_arm_arc()
    tip = arc[-1]
    f0, f1 = profiles.anchor_fluke_span()
    assert 0.0 < f0 < f1 < 1.0
    assert f1 < 1.0, "the fluke stops short of the bill"
    assert tip[0] <= profiles.ANCHOR_ARM * 1.02


def test_the_fluke_is_a_blade_broad_at_its_back_and_fine_at_its_tip():
    back, tip = profiles.anchor_fluke_width()
    assert back > tip > 0.0
    assert back > profiles.ANCHOR_ARM * 0.25, "a fluke you could see"


def test_every_iron_hoop_sits_ON_the_stock_it_binds():
    """The hoops used to be at 0.18, 0.58, 0.98 and 1.38 from the shank on a
    stock that ends at 0.85 — two of the four were iron bands clasping thin
    air, and the outermost of them is what the fore-channel clearance was
    being measured against."""
    half = profiles.ANCHOR_STOCK / 2.0
    hoops = profiles.anchor_hoops()
    assert len(hoops) == 4
    for y, w in hoops:
        assert abs(y) + w <= half, (y, w)
    assert sorted(h[0] for h in hoops) == [h[0] for h in sorted(hoops)]
    # Two a side, and symmetric: a stock is bound the same both ways.
    assert sum(1 for y, _w in hoops if y < 0) == 2
    assert sorted(abs(y) for y, _w in hoops) == pytest.approx(
        sorted(abs(y) for y, _w in hoops))


def test_the_stock_tapers_from_the_shank_to_both_its_ends():
    mid = profiles.anchor_stock_section(0.0)
    end = profiles.anchor_stock_section(1.0)
    assert mid[0] > end[0] and mid[1] > end[1]
    for f in (0.0, 0.3, 0.7, 1.0):
        assert profiles.anchor_stock_section(f) \
            == pytest.approx(profiles.anchor_stock_section(-f))


def test_nothing_of_the_anchor_reaches_further_aft_than_the_stated_reach():
    """Both ends of that measurement named: the station the anchor hangs at,
    and the aftmost point of the anchor itself."""
    reach = max(profiles.anchor_extent_y())
    assert profiles.ANCHOR_AFT_REACH == pytest.approx(reach)
    assert reach == pytest.approx(profiles.ANCHOR_STOCK / 2.0)


def test_nothing_of_the_anchor_goes_deeper_inboard_than_the_shank_does():
    """`anchor_bearing_x` stands the SHANK's inboard face on the planking and
    beds it in by ANCHOR_BED. Anything of the anchor further inboard than that
    is buried in the hull, and `check_directions` holds the burial to the
    shank's own half thickness."""
    assert profiles.anchor_inboard_reach() == pytest.approx(
        profiles.ANCHOR_HALF_THICK)
