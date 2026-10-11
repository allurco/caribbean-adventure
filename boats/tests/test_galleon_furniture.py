"""Task 8b -- the galleon's own deck plan and her battle damage. Pure, no bpy.

The maintainer's ruling: furniture and damage are enabled on her, and she gets HER
OWN furniture plan as data on her params, with the frigate's table verbatim
as the default. Every station below is measured on HER decks, and every
measurement names both of its ends.
"""

import hashlib
import math

import pytest

from frigate import damage, head, profiles
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams


@pytest.fixture
def f():
    return FrigateParams()


@pytest.fixture
def g():
    return GalleonParams()


def _of(p, kind):
    return [i for i in profiles.furniture_placements(p)
            if i["kind"] == kind]


def _t(item, p):
    return profiles.t_of_y(p, item["origin"][1])


# --- the frigate does not move ----------------------------------------------

def test_the_frigates_plan_is_the_default_verbatim(f):
    plan = st.FurniturePlan()
    assert f.furniture_plan == plan
    assert plan.stations == profiles.FURNITURE
    assert plan.anchor_t == profiles.ANCHOR_T == 0.112
    assert plan.lanterns == profiles.LANTERNS == 3
    assert plan.lantern_spread == profiles.LANTERN_SPREAD == 0.62
    assert plan.boat_on_skids == profiles.BOAT_ON_SKIDS == 1.35


# SHA-1 of the frigate's nine scars (t, z, side, radius at full precision),
# taken at ed3de40 BEFORE the scar rule became a field on `DamageForm`.
FRIGATE_SCARS_SHA1 = "9189870d305d9ebde6418ff06322fdaf4bc2e246"


def test_the_frigates_scars_do_not_move(f):
    s = repr([(d["t"].hex(), d["z"].hex(), d["sign"], d["radius"].hex())
              for d in damage.shot_scars(f)])
    assert hashlib.sha1(s.encode()).hexdigest() == FRIGATE_SCARS_SHA1
    assert f.damage_form == st.DamageForm()


# SHA-1 of the frigate's seven canvas tears, (mast, tier, i, j, centre),
# the centre as `tear_centre` returns it (rounded to 0.1 mm, as a face
# centre is matched). Taken off the OLD route -- the four corners through
# `wind.sail_point`, which the build used before `tear_centre` went through
# `sailplan.sail_point` -- and the new route gives the same seven tuples.
FRIGATE_TEARS_SHA1 = "cf2ed4361978256c75ab16707c519d54dcccae51"


def test_the_frigates_canvas_tears_do_not_move(f):
    nu, nv = profiles.SAIL_NU, profiles.SAIL_NV
    tears = [(m, tier, i, j,
              damage.tear_centre(f, m, tier, i, j, nu, nv))
             for m, tier, i, j in damage.canvas_tears(f, nu, nv)]
    assert len(tears) == 7
    s = repr(tears)
    assert hashlib.sha1(s.encode()).hexdigest() == FRIGATE_TEARS_SHA1


# --- her plan is her own ----------------------------------------------------

def test_her_plan_is_not_the_frigates(g):
    assert g.furniture_plan != st.FurniturePlan()
    assert {k for k, *_ in g.furniture_plan.stations} == \
        {k for k, *_ in profiles.FURNITURE}


def test_every_fitting_stands_on_the_uppermost_deck_at_its_station(g):
    for item in profiles.furniture_placements(g):
        if item["kind"] in ("lantern", "anchor", "boat"):
            continue
        x, y, z = item["origin"]
        t = profiles.t_of_y(g, y)
        assert z == pytest.approx(
            profiles.deck_z_at(g, t, x, profiles.deck_rise_at(g, t)))


def test_the_wheel_is_on_the_quarterdeck_forward_of_the_poop_break(g):
    """QUARTERDECK BREAK (t 0.54) < wheel < POOP BREAK (t 0.81), standing on
    Deck_Quarter and not on the poop 1.60 m over it."""
    wheel = _of(g, "wheel")[0]
    t = _t(wheel, g)
    assert g.quarter_t < t < g.tier("Deck_Poop").t0
    assert profiles.deck_rise_at(g, t) == g.quarter_rise


def test_the_wheel_clears_the_mizzen_and_the_poop_break(g):
    """WHEEL DRUM'S AFT END (0.52 m abaft the wheel's station) to the
    MIZZEN'S FORE FACE at the deck (its foot, less its radius), 0.54 m;
    the same DRUM'S AFT END to the POOP WALL (the poop break's station),
    1.18 m, further, because the wall stands ABAFT the mizzen; and the
    WHEEL'S STATION to the MIZZEN FOOT'S CENTRE over 0.9 m."""
    y = _of(g, "wheel")[0]["origin"][1]
    mizzen = profiles.mast_foot(g, "mizzen")[1] \
        + profiles.mast_radius(g, "mizzen")
    poop_wall = profiles.station_y(g, g.tier("Deck_Poop").t0)
    drum_aft = y - profiles.WHEEL_DRUM_AFT
    assert drum_aft - mizzen >= 0.30
    assert drum_aft - poop_wall > drum_aft - mizzen
    assert abs(y - profiles.mast_foot(g, "mizzen")[1]) > 0.9


def _waist(g):
    return g.fcastle_t, g.quarter_t


def test_the_capstan_and_the_hatches_stand_in_the_waist(g):
    t0, t1 = _waist(g)
    for item in profiles.furniture_placements(g):
        if item["kind"] == "capstan" or item["kind"].startswith("hatch"):
            t = _t(item, g)
            assert t0 < t < t1, item
            assert profiles.deck_rise_at(g, t) == 0.0


def test_the_capstan_stands_between_the_fore_and_main_masts(g):
    t = _t(_of(g, "capstan")[0], g)
    assert profiles.mast_t(g, "fore") < t < profiles.mast_t(g, "main")


def test_the_capstan_bars_sweep_clear_of_the_main_mast(g):
    """CAPSTAN CENTRE less a BAR'S HALF LENGTH (the bar shipped fore and aft)
    to the MAIN MAST'S FORE FACE at the deck."""
    y = _of(g, "capstan")[0]["origin"][1]
    main = profiles.mast_foot(g, "main")[1] + profiles.mast_radius(g, "main")
    assert (y - profiles.CAPSTAN_BAR_LEN) - main >= 0.20


def _boat_ys(g):
    y = _of(g, "boat")[0]["origin"][1]
    return y - profiles.BOAT[0] / 2.0, y + profiles.BOAT[0] / 2.0


def test_the_launch_lies_over_the_waist_between_the_castles(g):
    """BOAT'S STEM (forward end) to the FORECASTLE BREAK, and BOAT'S TRANSOM
    (aft end) to the MAIN MAST'S FORE FACE at the deck: both clear."""
    aft, fwd = _boat_ys(g)
    assert profiles.station_y(g, g.fcastle_t) - fwd >= 0.30
    main = profiles.mast_foot(g, "main")[1] + profiles.mast_radius(g, "main")
    assert aft - main >= 0.30


def test_the_launch_lies_clear_of_the_capstan_bars_sweep(g):
    """The bars ride about a metre over the deck, where the launch's hull
    is: the nearer END of the launch to the CAPSTAN BARS' sweep (centre
    plus a bar's half length, fore and aft) is clear."""
    aft, fwd = _boat_ys(g)
    cap_y = _of(g, "capstan")[0]["origin"][1]
    bar = profiles.CAPSTAN_BAR_LEN
    assert aft - (cap_y + bar) >= 0.10 or (cap_y - bar) - fwd >= 0.10


def test_the_capstan_bars_sweep_clear_of_the_forecastle_break(g):
    """CAPSTAN CENTRE plus a BAR'S HALF LENGTH to the FORECASTLE BREAK."""
    y = _of(g, "capstan")[0]["origin"][1]
    brk = profiles.station_y(g, g.fcastle_t)
    assert brk - (y + profiles.CAPSTAN_BAR_LEN) >= 0.20


# THE LAUNCH'S CLEARANCE RULE, set in Task 8b: its skids ride at least this
# far over any hatch coaming under them.
SKID_OVER_COAMING = 0.20


def _deck_z(g, t):
    return profiles.deck_z_at(g, t, 0.0, profiles.deck_rise_at(g, t))


def _skid_clearances(g):
    """{hatch: SKID UNDERSIDE to HATCH COAMING TOP} for every hatch whose
    coaming lies under the skids' fore-and-aft run.

    The launch is LEVEL: its skid underside is one height, the launch's
    GUNWALE (deck at the BOAT STATION, centreline, plus `boat_on_skids`)
    less its DEPTH less `BOAT_SKID_DROP`. Each coaming is level too, but
    at ITS OWN station's deck: the sheer climbs forward, so the forward
    hatch stands higher than the launch's own deck.
    """
    boat = _of(g, "boat")[0]
    length, _half, depth = profiles.BOAT
    skid_underside = boat["origin"][2] - depth - profiles.BOAT_SKID_DROP
    f0, f1 = profiles.BOAT_SKID_SPAN
    y_aft = boat["origin"][1] - length / 2.0 + length * f0
    y_fwd = boat["origin"][1] - length / 2.0 + length * f1
    half_l = profiles.HATCH[0] / 2.0
    out = {}
    for item in profiles.furniture_placements(g):
        if not item["kind"].startswith("hatch"):
            continue
        y = item["origin"][1]
        if y + half_l < y_aft or y - half_l > y_fwd:
            continue
        t = profiles.t_of_y(g, y)
        coaming_top = _deck_z(g, t) + profiles.HATCH[2]
        out[item["kind"]] = skid_underside - coaming_top
    return out


def test_the_launch_rides_clear_over_every_hatch_coaming_under_it(g):
    """SKID UNDERSIDE to each HATCH COAMING TOP at that hatch's own deck."""
    clear = _skid_clearances(g)
    assert len(clear) == 3, clear
    for kind, gap in clear.items():
        assert gap >= SKID_OVER_COAMING, (kind, round(gap, 4))


def _gunwale_under_cap(g):
    """{"fore": m, "aft": m}: WAIST RAIL CAP (sheer + bulwark_h) at the
    launch's FORE end and at its AFT end, less the launch's GUNWALE there.

    The launch is LEVEL -- its gunwale is one height, the deck at the BOAT
    STATION plus `boat_on_skids` -- while the cap follows the sheer, which
    falls aft through her waist. Judged at the boat station alone, the
    gunwale read 0.02 m under the cap while its aft end stood 0.068 m over.
    """
    boat = _of(g, "boat")[0]
    gunwale = boat["origin"][2]
    aft, fwd = _boat_ys(g)
    return {end: profiles.sheer(g, profiles.t_of_y(g, y)) + g.bulwark_h
            - gunwale for end, y in (("fore", fwd), ("aft", aft))}


def test_the_launch_stays_under_her_waist_rail_cap(g):
    """GUNWALE to WAIST RAIL CAP at the launch's FORE end and AFT end."""
    boat = _of(g, "boat")[0]
    x, y, z = boat["origin"]
    t = profiles.t_of_y(g, y)
    deck = profiles.deck_z_at(g, t, x, profiles.deck_rise_at(g, t))
    assert z - deck == pytest.approx(g.furniture_plan.boat_on_skids)
    under = _gunwale_under_cap(g)
    assert all(m > 0.0 for m in under.values()), \
        {k: round(v, 4) for k, v in under.items()}


def _columns(g):
    return sorted({round(t, 9) for _d, t in profiles.all_gunport_ts(g)})


def test_her_barrels_stand_in_her_port_column_gaps_in_the_waist(g):
    """Both rows share columns, so a gap between two columns is clear of the
    waist row's carriages on Deck_Main and of nothing else."""
    cols = _columns(g)
    gaps = [(a + b) / 2.0 for a, b in zip(cols, cols[1:])]
    barrels = _of(g, "barrel")
    assert len(barrels) == 8
    t0, t1 = _waist(g)
    for b in barrels:
        t = _t(b, g)
        assert min(abs(t - x) for x in gaps) < 1e-3, t
        assert t0 < t < t1
    xs = sorted(b["origin"][0] for b in barrels)
    for a, b in zip(xs, reversed(xs)):
        assert a == pytest.approx(-b)


def test_her_lanterns_stand_on_her_taffrail_inside_her_transom(g):
    lanterns = _of(g, "lantern")
    assert len(lanterns) == g.furniture_plan.lanterns
    rail = profiles.taffrail_z(g)
    half = profiles.stern_half_width(g, rail)
    for item in lanterns:
        assert item["origin"][2] == pytest.approx(rail)
        assert abs(item["origin"][0]) + 0.20 < half


def _head_rail_aft_y(g):
    pts = [q for s in (1.0, -1.0)
           for q in (head.upper_rail_points(g, s)
                     + head.lower_rail_points(g, s))]
    return min(q[1] for q in pts)


def test_her_anchors_hang_midway_between_her_fore_channel_and_head_rails(g):
    """ANCHOR'S AFT END to her FORE CHANNEL'S FORWARD END, and the HEAD
    RAILS' AFTMOST POINT to the ANCHOR'S FORWARD END: the two clearances
    within 0.02 m of each other and both over a metre."""
    y0 = profiles.station_y(g, g.furniture_plan.anchor_t)
    # ANCHOR_AFT_REACH is used for the FORWARD reach too: it is half the
    # stock (`profiles`), and the stock is centred on the anchor's station,
    # so its forward END stands as far forward as its after end stands aft.
    reach = profiles.ANCHOR_AFT_REACH
    channel = profiles.station_y(g, profiles.channel_span(g, "fore")[0])
    aft_clear = (y0 - reach) - channel
    fwd_clear = _head_rail_aft_y(g) - (y0 + reach)
    assert aft_clear >= 1.0 and fwd_clear >= 1.0, (aft_clear, fwd_clear)
    assert abs(aft_clear - fwd_clear) <= 0.02
    for item in _of(g, "anchor"):
        assert profiles.t_of_y(g, item["origin"][1]) \
            == pytest.approx(g.furniture_plan.anchor_t)


# --- her damage -------------------------------------------------------------

def test_her_castles_leave_no_open_rail_to_shoot_away(g):
    assert profiles.rail_runs(g) == []
    assert damage.rail_gaps(g) == []
    assert damage.splinter_spikes(g) == []


def _cut_boxes(p):
    """Every broadside aperture as the CUTTER selects it, (y_aft, y_fwd,
    z_lo, z_hi) with z as offsets from the local SHEER: the hull row off
    the hull loft's seams (`hull_gunport_boxes`), the bulwark row off the
    bulwark grid's (`gunport_boxes`). A different route from
    `damage.aperture_boxes`, which reads each row's sill and head over its
    serving deck at the port centre."""
    out = []
    for d, deck in enumerate(p.gun_decks):
        boxes = (profiles.hull_gunport_boxes(p, d) if deck.host == "hull"
                 else profiles.gunport_boxes(p, d))
        out += boxes
    return out


def _nearest(p, y, z, box):
    """SCAR CENTRE (y, z) to the nearest point of one cut aperture, its
    sheer offsets made world heights at the aperture's nearest station."""
    y0, y1, lo, hi = box
    yn = min(max(y, y0), y1)
    sheer = profiles.sheer(p, profiles.t_of_y(p, yn))
    zn = min(max(z, sheer + lo), sheer + hi)
    return ((y - yn) ** 2 + (z - zn) ** 2) ** 0.5


def test_no_scar_of_hers_reaches_any_aperture_of_either_row(g):
    """SCAR CENTRE to the NEAREST POINT OF EVERY CUT APERTURE, hull row and
    bulwark row, against the scar's own radius: the crater stays on plank."""
    boxes = _cut_boxes(g)
    assert len(boxes) == profiles.total_broadside_ports(g) // 2 == 21
    scars = damage.shot_scars(g)
    assert len(scars) == damage.SHOT_SCARS
    for s in scars:
        y = profiles.station_y(g, s["t"])
        worst = min(_nearest(g, y, s["z"], b) for b in boxes)
        assert worst > s["radius"], (s, worst)


def _same_side_pairs(p):
    scars = damage.shot_scars(p)
    out = []
    for i, a in enumerate(scars):
        for b in scars[i + 1:]:
            if a["sign"] != b["sign"]:
                continue
            gap = math.hypot(
                profiles.station_y(p, a["t"]) - profiles.station_y(p, b["t"]),
                a["z"] - b["z"])
            out.append((a, b, gap, a["radius"] + b["radius"]))
    return out


@pytest.mark.parametrize("ship", [FrigateParams, GalleonParams])
def test_no_two_scars_on_one_side_overlap(ship):
    """SAME-SIDE SCAR CENTRE to SCAR CENTRE at least the RADIUS SUM plus the
    ship's `scar_spacing`: no crater is cut across another."""
    p = ship()
    margin = p.damage_form.scar_spacing
    assert margin > 0.0
    bad = [(round(a["t"], 3), round(b["t"], 3), round(gap, 3),
            round(rsum, 3))
           for a, b, gap, rsum in _same_side_pairs(p)
           if gap < rsum + margin]
    assert not bad, bad


def test_her_scars_are_placed_well_inside_the_draw_guard(g):
    """The port and spacing rules reject draws; the seeded loop gives up at
    `SCAR_DRAW_GUARD`. She must finish with at least half of it unused."""
    assert damage.scar_draws(g) <= damage.SCAR_DRAW_GUARD // 2


def _chase_corners(p):
    """Every corner of both stern chase apertures, in the world: on the
    transom at the TAFFRAIL STATION y, between its sill and head, at the
    u-edges times the transom half-width at each height."""
    y = profiles.station_y(p, 1.0)
    out = []
    for z in (profiles.chase_sill_z(p), profiles.chase_head_z(p)):
        hw = profiles.stern_half_width(p, z)
        for u0, u1 in profiles.chase_u_edges(p):
            out += [(u0 * hw, y, z), (u1 * hw, y, z)]
    return out


def test_no_scar_of_hers_comes_near_a_stern_chase_port(g):
    """SCAR CENTRE (on the hull side at its own station and height) to the
    NEAREST CORNER of either CHASE PORT: over 3 m, every scar."""
    corners = _chase_corners(g)
    for s in damage.shot_scars(g):
        y = profiles.station_y(g, s["t"])
        x = s["sign"] * profiles.hull_half_width(g, s["t"], s["z"])
        d = min(math.dist((x, y, s["z"]), c) for c in corners)
        assert d - s["radius"] > 3.0, (round(s["t"], 3), round(d, 3))


def test_her_scars_land_between_the_water_and_her_sheer_on_both_sides(g):
    scars = damage.shot_scars(g)
    for s in scars:
        assert 0.0 < s["z"] < profiles.sheer(g, s["t"])
    assert {s["sign"] for s in scars} == {-1.0, 1.0}


def test_her_tears_are_in_her_six_sails(g):
    from frigate import sailplan
    sails = {(m, sl.tier) for m, sl in sailplan.all_sails(g) if m is not None}
    tears = damage.canvas_tears(g, profiles.SAIL_NU, profiles.SAIL_NV)
    assert {(m, k) for m, k, _i, _j in tears} <= sails
    assert len(tears) == damage.CANVAS_TEARS


# --- which of the frigate's directional rulings are joints she has ----------

def _rule(member, host):
    from frigate import joints
    return next(r for r in joints.DIRECTIONS
                if r.member == joints.family(member)
                and r.host == joints.family(host))


def test_splinters_on_the_bulwark_cap_are_a_joint_only_where_a_rail_is_shot(
        f, g):
    """Her castles leave her no open rail, so no bay is shot away and no
    splinter stands on her bulwark cap: Damage never touches Bulwarks."""
    from frigate import joints
    rule = _rule("Damage", "Bulwarks")
    assert joints.applies_to(rule, f)
    assert not joints.applies_to(rule, g)


def test_a_barrel_on_the_quarterdeck_is_a_joint_only_where_one_is_stowed(
        f, g):
    """Her eight barrels are all in the waist, on Deck_Main."""
    from frigate import joints
    rule = _rule("Barrel_", "Deck_Quarter")
    assert joints.applies_to(rule, f)
    assert not joints.applies_to(rule, g)
    assert joints.applies_to(_rule("Barrel_", "Deck_Main"), g)


def test_every_tear_of_hers_is_a_face_of_her_canvas_lateen_included(g):
    """On the grid she DRAWS (`SAIL_NU` x `SAIL_NV`): each tear's centre is
    the centre of one quad of that sail's own `sailplan.sail_grid`, rows
    foot to head, the order `sails.build_sails` emits its faces in."""
    from frigate import sailplan
    nu, nv = profiles.SAIL_NU, profiles.SAIL_NV
    tears = damage.canvas_tears(g, nu, nv)
    assert any(m == "mizzen" for m, *_ in tears), "the lateen is torn"
    for m, k, i, j in tears:
        sail = next(sl for mm, sl in sailplan.all_sails(g)
                    if mm == m and sl.tier == k)
        grid = sailplan.sail_grid(g, m, sail, nu, nv)
        quad = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1],
                grid[j + 1][i])
        face = tuple(round(sum(c[a] for c in quad) / 4.0, 4)
                     for a in range(3))
        assert damage.tear_centre(g, m, k, i, j, nu, nv) == face


def test_no_scar_of_hers_is_cut_under_a_chainplate_strap(g):
    """Her chainplate feet come down onto the hull (Task 6), into the band
    the scars are drawn from. SCAR CENTRE to the nearest point of every
    STRAP'S CENTRELINE (channel edge to foot), seen square to the side,
    less the strap's half width, must exceed the scar's radius."""
    half_w = g.rail_form.strap_w / 2.0
    straps = [(h[1], h[2], f[1], f[2]) for m in profiles.mast_names(g)
              for h, f in profiles.chainplate_segments(g, m)]
    for s in damage.shot_scars(g):
        y = profiles.station_y(g, s["t"])
        best = math.inf
        for ay, az, by, bz in straps:
            dy, dz = by - ay, bz - az
            u = ((y - ay) * dy + (s["z"] - az) * dz) / (dy * dy + dz * dz)
            u = min(max(u, 0.0), 1.0)
            best = min(best, math.hypot(y - ay - u * dy, s["z"] - az - u * dz))
        assert best - half_w > s["radius"], (round(s["t"], 3), round(best, 3))


def test_tearing_a_sail_she_does_not_carry_is_a_named_value_error(f):
    nu, nv = profiles.SAIL_NU, profiles.SAIL_NV
    with pytest.raises(ValueError, match="'fore'.*tier 9"):
        damage.tear_centre(f, "fore", 9, 0, 0, nu, nv)
