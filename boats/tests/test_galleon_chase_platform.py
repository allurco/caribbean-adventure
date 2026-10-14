"""Task 11 (A') -- her stern chasers stand on a chase platform. Pure, no bpy.

The maintainer's third ruling, A': a heavy timber platform locally off the main deck
carries the chasers' carriages (do not strip the guns). R11: the platform is
Deck_Main's LEVEL carried aft to the transom at the chasers' station, and the
chase sill is re-measured above IT.

Before it: Deck_Main ends at t 0.96 (y -15.64), 1.36 m short of her transom
(y -17.00), her sheer climbs 0.664 m over that run, and each chaser's after
carriage stood INSIDE the hull's top surface (Cannon_ x Hull, 44 face pairs,
a capped deviation). Every figure below names both of its endpoints.
"""

import math

import pytest

from frigate import joints, profiles, shiptype
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()


def _chasers(p):
    return [g for g in profiles.gun_placements(p) if g["kind"] == "chase"]


# --- the data ----------------------------------------------------------------


def test_she_carries_a_chase_platform_and_the_frigate_none():
    """Data on the stern form. The frigate's chasers stand abaft her deck
    end in the air by design and her digest holds: no platform on her."""
    assert isinstance(G.stern_form.chase_platform, shiptype.ChasePlatform)
    assert F.stern_form.chase_platform is None
    assert shiptype.FRIGATE_STERN.chase_platform is None
    assert profiles.hull_open_top_bands(F) == []


def test_a_platform_needs_the_deck_at_the_gun_datum():
    """A platform is laid at the deck's level AT THE GUN, so a ship whose
    chase sill is measured on the sheer cannot carry one."""
    import dataclasses
    bad = dataclasses.replace(shiptype.FRIGATE_STERN,
                              chase_platform=shiptype.ChasePlatform())
    with pytest.raises(ValueError, match="deck at the gun"):
        bad.validate()


def test_a_negative_footprint_margin_is_refused():
    with pytest.raises(ValueError, match="footprint_margin"):
        shiptype.ChasePlatform(footprint_margin=-0.01).validate()


# --- its level -------------------------------------------------------------


def test_the_platform_is_deck_mains_level_at_the_chasers_station():
    """R11. PLATFORM TOP is Deck_Main's surface (`deck_z_at`, rise 0) at
    each chaser's BREECH station and its own x, 5.331 m over the waterline:
    the chasers' floor stays the deck's level."""
    top = profiles.chase_platform_z(G)
    for gun in _chasers(G):
        x, y, _z = gun["origin"]
        deck = profiles.deck_z_at(G, profiles.t_of_y(G, y), x, 0.0)
        assert top == pytest.approx(deck, abs=1e-9)
    assert top == pytest.approx(5.490, abs=5e-4)


def test_the_chasers_stand_ON_the_platform():
    """The `check_cannons` ON rule's pure half: every chaser's CARRIAGE
    FLOOR is the PLATFORM TOP, and the chase sill's datum reads it."""
    top = profiles.chase_platform_z(G)
    assert profiles.chase_floor_z(G) == top
    for gun in _chasers(G):
        assert gun["origin"][2] == top


def test_her_chase_sill_and_head_are_re_measured_above_the_platform():
    """PLATFORM TOP to CHASE SILL 0.75 (her rows' band), to CHASE HEAD 1.37;
    over the WATERLINE 6.081 and 6.701 -- unchanged, because the level is
    the deck's."""
    top = profiles.chase_platform_z(G)
    sill, head = profiles.chase_sill_z(G), profiles.chase_head_z(G)
    assert sill - top == pytest.approx(0.75)
    assert head - top == pytest.approx(1.37)
    assert sill == pytest.approx(6.240, abs=5e-4)
    assert head == pytest.approx(6.860, abs=5e-4)


def test_deck_mains_end_against_the_platform_is_measured():
    """The platform is LEVEL and Deck_Main is CAMBERED, so at her end (t
    0.96) DECK_MAIN'S SURFACE to PLATFORM TOP is +0.183 on the centreline
    (the deck above), +0.136 at the chasers' x, -0.057 at her edge (the
    platform 0.057 proud). The platform is the deck's level at the gun, at
    the chasers' BREECH station (y -15.25), forward of her end: at the
    chasers' own x the +0.136 is the SHEER's climb from that station to
    her end (+0.138, the camber -0.003), not camber; across the beam the
    camber makes the rest of the spread (centreline +0.183, edge -0.057)."""
    top = profiles.chase_platform_z(G)
    t1 = G.tier("Deck_Main").t1
    edge = profiles.deck_half_beam(G, t1)
    x_gun = abs(_chasers(G)[0]["origin"][0])
    assert profiles.deck_z_at(G, t1, 0.0) - top == pytest.approx(0.0733,
                                                                 abs=5e-4)
    assert profiles.deck_z_at(G, t1, x_gun) - top == pytest.approx(0.0200,
                                                                   abs=5e-4)
    assert profiles.deck_z_at(G, t1, edge) - top == pytest.approx(-0.2167,
                                                                  abs=5e-4)


# --- its extent ------------------------------------------------------------


def test_it_runs_from_deck_mains_end_to_the_clearance_off_the_end_cap():
    """FORE EDGE at Deck_Main's end (y -15.64). Below the stern sheer
    there is no transom inner skin (the Transom's foot is the stern sheer,
    z 5.80, 0.469 over PLATFORM TOP), so the planking runs aft to the
    HULL'S END CAP (y -17.00): PLATFORM AFT EDGE to END CAP is
    `skin_clearance` at most (final review 3, I-2b)."""
    c = G.stern_form.chase_platform.skin_clearance
    fore, aft = profiles.chase_platform_span(G)
    assert fore == profiles.station_y(G, G.tier("Deck_Main").t1)
    assert fore == pytest.approx(-19.32)   # -15.64 on the 34 m hull
    gap = aft - profiles.station_y(G, 1.0)
    assert 0.0 < gap <= c + 1e-12


def test_below_the_sheer_its_edges_stop_the_clearance_short_of_the_skin():
    """Where PLATFORM TOP stands BELOW the sheer the side has ONE skin, so
    at every station of the outline there PLATFORM EDGE to HULL SKIN (the
    cage at PLATFORM TOP, `hull_half_width`) is `skin_clearance` at most,
    and never nothing (final review 3, I-2a). At 43d02b4 it was 0.216 to
    0.220 m, the side timber of a twin skin that is not there."""
    c = G.stern_form.chase_platform.skin_clearance
    top = profiles.chase_platform_z(G)
    below = [t for t in profiles.chase_platform_ts(G)
             if profiles.sheer(G, t) > top]
    assert len(below) >= 2
    for t in below:
        gap = (profiles.hull_half_width(G, t, top)
               - profiles.chase_platform_half_width(G, t))
        assert 0.0 < gap <= c + 1e-12, (t, gap)


def test_over_the_sheer_its_edges_keep_deck_mains_rule():
    """Where PLATFORM TOP stands OVER the sheer (y -15.64 to its crossing)
    `hull_half_width` returns the SHEER's width, 0.016 m outside the
    bulwark's outer face, so the edge there is Deck_Main's rule: the HULL
    SKIN at the sheer less the side timber, let into the bulwark's inner
    face (final review 3, the above-the-sheer trap)."""
    top = profiles.chase_platform_z(G)
    over = [t for t in profiles.chase_platform_ts(G)
            if profiles.sheer(G, t) <= top]
    assert len(over) >= 2
    for t in over:
        assert profiles.chase_platform_half_width(G, t) == pytest.approx(
            profiles.hull_half_width(G, t, top) - G.bulwark_thick)


def _interp(cols, x):
    """z of a polyline [(x, z), ...] sorted by x at x, or None off it."""
    for (xa, za), (xb, zb) in zip(cols, cols[1:]):
        if xa <= x <= xb:
            return za if xb == xa else za + (zb - za) * (x - xa) / (xb - xa)
    return None


def _deck_mains_end_underside():
    """DECK_MAIN's UNDERSIDE in her end plane as `decks._deck_patch` lays
    it: her surface's grid columns at t1 less `plank_thick`, straight
    between columns."""
    tier = G.tier("Deck_Main")
    hb = profiles.tier_half_beam(G, tier, tier.t1)
    n = profiles.DECK_N_TRAN
    xs = [-hb + 2.0 * hb * j / (n - 1) for j in range(n)]
    return [(x, profiles.tier_deck_z(G, tier, tier.t1, x) - G.plank_thick)
            for x in xs]


def test_the_lens_under_deck_mains_end_is_closed():
    """DECK_MAIN UNDERSIDE over PLATFORM TOP at her end plane, a lens
    0.063 m high on the centreline over |x| < 1.29 at 43d02b4, with the
    opened hull band behind it (final review 3, I-2c). A RISER from
    PLATFORM TOP up to her underside closes it: sampled every centimetre
    across her end, DECK_MAIN UNDERSIDE to the RISER's TOP (PLATFORM TOP
    where there is no riser) is never open -- the lens height is 0."""
    top = profiles.chase_platform_z(G)
    riser = profiles.chase_platform_riser(G)
    fore, _aft = profiles.chase_platform_span(G)
    assert riser["y_fwd"] == pytest.approx(fore)
    assert riser["bottom"] == top
    under = _deck_mains_end_underside()
    lens = 0.0
    for k in range(-260, 261):
        x = k / 100.0
        u = _interp(under, x)
        if u is None:
            continue
        closed = _interp(riser["columns"], x)
        lens = max(lens, u - (top if closed is None else closed))
    assert lens == 0.0
    # ON THE 42 m HULL THERE IS NO LENS TO CLOSE: her sheer climbs more
    # gently over the 1.68 m from Deck_Main's end to her transom, and with
    # her 0.29 m camber DECK_MAIN'S UNDERSIDE stands 0.047 m UNDER the
    # PLATFORM TOP even on the centreline, so no riser is laid (0.0628 m of
    # lens on the 34 m hull, closed by a riser of seven columns).
    open_lens = max(u - top for _x, u in under)
    assert open_lens == pytest.approx(-0.0467, abs=5e-4)
    assert riser["columns"] == []


def test_the_riser_stands_under_deck_mains_end_and_clear_of_the_trucks():
    """The riser stands `skin_clearance` deep, its forward face in
    Deck_Main's end plane, so its after face is under her underside's
    after edge (her Solidify leans it aft) and its top is inside her plank.
    The chasers' FORE TRUCKS cross that plane: each truck's LOWEST POINT
    over the riser's depth to the RISER TOP across the truck's thickness
    is positive, so `Cannon_ x Chase_Platform` stays 0 pairs."""
    c = G.stern_form.chase_platform.skin_clearance
    riser = profiles.chase_platform_riser(G)
    assert riser["y_fwd"] - riser["y_aft"] == pytest.approx(c)
    cols = riser["columns"]
    r = profiles.GUN_TRUCK_R
    sag = r - r * math.cos(math.pi / 6.0)       # a hexagon's flat bottom
    least = None
    for gun in _chasers(G):
        x, y, floor = gun["origin"]
        axle = y - profiles.GUN_TRUCK_X[0]
        for side in (-1.0, 1.0):
            xt = x + side * profiles.GUN_TRUCK_Y
            for y_at in (riser["y_aft"], riser["y_fwd"]):
                off = abs(y_at - axle)
                half = r / 2.0
                lift = sag if off <= half else (
                    sag + (off - half) / half * (r - sag))
                low = floor + lift
                for dx in (-profiles.GUN_TRUCK_T / 2.0,
                           profiles.GUN_TRUCK_T / 2.0):
                    z = _interp(cols, xt + dx)
                    if z is None:
                        continue
                    gap = low - z
                    least = gap if least is None else min(least, gap)
    # No riser at all on the 42 m hull (see the lens above): nothing for a
    # truck to meet.
    assert (least is None and not cols) or (least is not None and least > 0.0)


def test_every_chaser_footprint_lies_on_the_platform_by_its_margin():
    """CARRIAGE FOOTPRINT (cheeks fore and aft, trucks' outer faces
    athwartships) inside the PLATFORM (or Deck_Main forward of its fore
    edge) by `footprint_margin` at least: AFTER CHEEK END (y -16.60) to
    AFT EDGE 0.36 m (0.18 to the transom's inside face before final review
    3 carried the planking to the end cap); OUTER TRUCK FACE to PLATFORM
    EDGE 0.9365 m at the narrowest, at the SHEER CROSSING (y -15.797),
    where the edge steps outboard (0.82 abreast the after cheek ends
    before)."""
    margin = G.stern_form.chase_platform.footprint_margin
    fore, aft = profiles.chase_platform_span(G)
    feet = profiles.chase_carriage_footprints(G)
    assert len(feet) == G.chase_ports == 2
    for x_lo, x_hi, y_aft, y_fwd in feet:
        assert y_aft - aft >= margin
        assert y_aft - aft == pytest.approx(0.36, abs=5e-3)
        # every point of the footprint abaft the fore edge stands on it:
        # its two ends and every station of the outline between them
        ys = [min(y_fwd, fore), y_aft] + [
            profiles.station_y(G, t) for t in profiles.chase_platform_ts(G)
            if y_aft < profiles.station_y(G, t) < min(y_fwd, fore)]
        least = min(
            profiles.chase_platform_half_width(G, profiles.t_of_y(G, y))
            - max(abs(x_lo), abs(x_hi)) for y in ys)
        assert least >= margin
        assert least == pytest.approx(1.3374, abs=5e-4)   # 0.9365 at 34 m
        # and the carriage stands abaft Deck_Main's end (wholly so on the
        # 42 m hull; it straddled it at 34 m): without the
        # platform its after half stood on nothing
        assert y_aft < fore


def test_the_hull_top_is_opened_over_the_platform_and_nowhere_else():
    """The hull loft's sheer-level closure would be crossed by every
    carriage wherever it lies between the CARRIAGE FLOOR (PLATFORM TOP
    5.331) and the CHEEK TOPS (0.91 m over it) -- abaft y -15.80, where the
    sheer climbs past the platform toward 5.80 -- so it is OPENED over the
    bands the platform spans and closed everywhere else: LITERALLY the
    last two of her 56 bands, 54 (station 0.95652, y -15.522, to 0.97826)
    and 55 (0.97826, y -16.261, to the transom), the first of them
    reaching forward of Deck_Main's end (t 0.96)."""
    ts = profiles.station_ts(G)
    opened = profiles.hull_open_top_bands(G)
    assert len(ts) - 1 == 58   # 56 on the 34 m hull
    assert opened == [56, 57]
    assert ts[56] == pytest.approx(0.95652, abs=5e-6)
    assert ts[56] < G.tier("Deck_Main").t1 < ts[57]
    assert ts[opened[-1] + 1] == 1.0
    floor = profiles.chase_platform_z(G)
    # TRUNNION AXIS to CHEEK TOP 0.03, as `cannons` cuts the cheeks
    cheek_top = floor + G.gun_trunnion_h - 0.03
    crossed = 0
    for x_lo, x_hi, y_aft, y_fwd in profiles.chase_carriage_footprints(G):
        for k in range(21):
            y = y_aft + (y_fwd - y_aft) * k / 20
            t = profiles.t_of_y(G, y)
            if not floor < profiles.sheer(G, t) < cheek_top:
                continue
            crossed += 1
            band = max(i for i in range(len(ts) - 1) if ts[i] <= t)
            assert band in opened, (y, t)
    assert crossed > 0


# --- its timbers -----------------------------------------------------------


def test_it_is_planked_like_a_deck_on_beams_and_carlings():
    """Planking `plank_thick` (the deck's rule); BEAMS athwartships sided a
    TRUCK'S DIAMETER (so a truck bears wholly on one) and moulded two
    planks, at the platform's fore edge and under the chasers' AFTER
    TRUCKS (a beam at the TRANSOM'S INSIDE FACE would overlap that one:
    AFTER TRUCK AXLE to TRANSOM'S INSIDE FACE is 0.33 m against a beam's
    0.28); a CARLING fore and aft under each TRUCK LINE, sided the same,
    moulded one plank, fore edge to the TRANSOM'S INSIDE FACE (y -16.78).
    The framing is Task 11's as built: since final review 3 the planking
    runs on 0.18 m past it to the end cap. Every timber hangs under the
    planking, inside the platform's outline, and no two beams overlap."""
    top = profiles.chase_platform_z(G)
    fore, _aft = profiles.chase_platform_span(G)
    aft = profiles.station_y(G, 1.0) + G.bulwark_thick
    assert aft == pytest.approx(-20.78)   # -16.78 at 34 m
    timbers = profiles.chase_platform_timbers(G)
    beams = [b for b in timbers if b["kind"] == "beam"]
    carlings = [b for b in timbers if b["kind"] == "carling"]
    assert len(beams) == 2 and len(carlings) == 2 * G.chase_ports
    sided = 2.0 * profiles.GUN_TRUCK_R
    for b in timbers:
        (x0, y0, z0), (x1, y1, z1) = b["lo"], b["hi"]
        assert z1 == pytest.approx(top - G.plank_thick)
        depth = 2.0 * G.plank_thick if b["kind"] == "beam" else G.plank_thick
        assert z1 - z0 == pytest.approx(depth)
        assert aft - 1e-9 <= y0 < y1 <= fore + 1e-9
        for y in (y0, y1):
            hw = profiles.chase_platform_half_width(G, profiles.t_of_y(G, y))
            assert -hw - 1e-9 <= x0 < x1 <= hw + 1e-9
    for b in beams:
        assert b["hi"][1] - b["lo"][1] == pytest.approx(sided)
    for c in carlings:
        assert c["hi"][0] - c["lo"][0] == pytest.approx(sided)
    after_truck = {g["origin"][1] - profiles.GUN_TRUCK_X[1]
                   for g in _chasers(G)}
    assert len(after_truck) == 1
    y_truck = after_truck.pop()
    aft_beam, fore_beam = sorted(beams, key=lambda b: b["lo"][1])
    assert (aft_beam["lo"][1] + aft_beam["hi"][1]) / 2.0 == pytest.approx(
        y_truck)
    assert fore_beam["hi"][1] == pytest.approx(fore)
    assert aft_beam["hi"][1] < fore_beam["lo"][1]
    for c in carlings:
        assert c["lo"][1] == pytest.approx(aft)
        assert c["hi"][1] == pytest.approx(fore)


def test_it_counts_its_own_triangles():
    """LITERAL, read off what `decks.build_chase_platform` emits: the slab
    over the sheer, one segment (12); the slab below it, two segments
    (20); six timbers at 12 (72); the riser, six segments between seven
    columns, its two end segments running out to nothing (44). 148, where
    Task 11's one slab to the transom's inside face drew 92."""
    assert [len(pc) - 1 for pc in profiles.chase_platform_pieces(G)] \
        == [1, 2]
    assert len(profiles.chase_platform_timbers(G)) == 6
    # no riser on the 42 m hull (seven columns, 44 tris, at 34 m)
    assert len(profiles.chase_platform_riser(G)["columns"]) == 0
    assert profiles.chase_platform_triangles(G) == 104
    assert profiles.chase_platform_triangles(F) == 0


# --- the joints ------------------------------------------------------------


def test_the_platform_meets_the_deck_and_bulwark_and_touches_no_hull():
    """`Chase_Platform x Deck_Main` and `Bulwarks x Chase_Platform` are
    joints with their measured overlaps. `Chase_Platform x Hull` is NOT
    (final review 3, M-2; ruling 3870): the planking stops
    `skin_clearance` short of the skin and the end cap, so it touches
    nothing of the Hull, and a joint passes at ANY count -- the entry would
    have waved a platform driven through the skin. Unruled, any pair there
    FAILS. The chasers stand ON it by `check_cannons`' rule (their trucks'
    ground points on its planking), touching no face of it: a hexagonal
    truck stands its facet sag clear of a level floor, so
    `Cannon_ x Chase_Platform` stays UNRULED and any pair there FAILS."""
    for a, b in (("Chase_Platform", "Deck_Main"),
                 ("Bulwarks", "Chase_Platform")):
        assert joints.pair(a, b) in joints.JOINTS
    for other in ("Hull", "Cannon_43"):
        key = joints.pair(other, "Chase_Platform")
        assert key not in joints.JOINTS and key not in joints.DEVIATIONS
        assert not joints.verdict(other, "Chase_Platform", 1).ok


def test_the_chaser_in_the_hull_deviation_is_RETIRED():
    """CHANGED ON PURPOSE (Task 11, the maintainer's third ruling A'). `Cannon_ x
    Hull` was capped at 44, question A': the chasers' after carriages lay
    inside the hull's top surface abaft Deck_Main's end. They stand on the
    platform now and the top is opened over it: the pair is UNRULED again,
    so any contact at all FAILS."""
    key = joints.pair("Cannon_42", "Hull")
    assert key not in joints.DEVIATIONS
    assert key not in joints.JOINTS
    assert not joints.verdict("Cannon_42", "Hull", 1).ok
