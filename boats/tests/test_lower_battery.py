"""The galleon's two-tier battery: a TRUE lower gun deck inside the hull.

The maintainer's ruling (2026-10-05): build a true lower gun deck with a new
`GunDeck.host`; band the sills PER ROW; 0.75 m is measured 1.0 m INBOARD of
the deck edge, where the carriage trucks stand on the camber.

Controller rulings R1-R4: the "main" row leaves the bulwark and is cut in
the HULL, served by `Deck_Lower` 2.00 m below `Deck_Main`; the "waist" row
stays in the bulwark, served by `Deck_Main`; each row's `sill` stays one
EDGE-relative figure and is the largest, to the centimetre, whose reading
1.0 m inboard is <= 0.75 at every port; the waist cap re-derives.

Every figure names both endpoints. "SILL" is a row's sill; "DECK EDGE" the
edge of the deck serving that row; "1.0 M INBOARD" that deck's surface
1.0 m inboard of its edge at the same station.
"""

import math
from dataclasses import replace

import pytest

from frigate import profiles, shiptype as st
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()
BAND = (0.60, 0.75)


def _row(p, name):
    return next(d for d in p.gun_decks if d.name == name)


def _with_row(p, name, **kw):
    rows = tuple(replace(d, **kw) if d.name == name else d
                 for d in p.gun_decks)
    return p.with_(gun_decks=rows)


def _lifts(p, deck):
    tier = profiles.serving_tier(p, deck)
    return [profiles.tier_camber_z(
        p, tier, t, profiles.tier_half_beam(p, tier, t) - 1.0)
        for t in profiles.gunport_ts(p, deck)]


# --- the data: hosts, serving decks, bands -----------------------------------

def test_the_frigates_row_keeps_every_new_field_at_its_verbatim_default():
    (row,) = F.gun_decks
    assert (row.host, row.served_by, row.sill_band, row.sill_inboard) == \
        ("bulwark", "Deck_Main", None, 0.0)
    assert row.sill == 0.55
    assert all(not t.inside_hull for t in F.deck_tiers)
    F.validate()


def test_the_main_row_is_cut_in_the_hull_and_served_by_the_lower_deck():
    main, waist = G.gun_decks
    assert (main.host, main.served_by) == ("hull", "Deck_Lower")
    assert (waist.host, waist.served_by) == ("bulwark", "Deck_Main")
    for row in G.gun_decks:
        assert row.sill_band == BAND and row.sill_inboard == 1.0


def test_the_lower_deck_lies_two_metres_below_the_gun_deck_inside_the_hull():
    """DECK_MAIN EDGE to DECK_LOWER EDGE at the same station: 2.00 m."""
    low = G.tier("Deck_Lower")
    assert low.inside_hull and low.rise == -2.00
    assert low.bulwark_h is None
    assert low not in G.raised_tiers()


def test_the_lower_deck_runs_the_row_plus_half_a_port_pitch_each_end():
    """FOREMOST PORT CENTRE t 0.20 to DECK_LOWER FORWARD END, and AFTMOST
    PORT CENTRE t 0.84 to its AFTER END: at least half the row's port pitch,
    (0.84 - 0.20) / 11 / 2 = 0.0291, so each end gun has the working room
    every gun between them has. 0.17 and 0.87 give 0.0300 each."""
    low, main = G.tier("Deck_Lower"), _row(G, "main")
    half_pitch = (main.t1 - main.t0) / (main.n_ports - 1) / 2.0
    assert half_pitch == pytest.approx(0.0291, abs=1e-4)
    assert main.t0 - low.t0 >= half_pitch
    assert low.t1 - main.t1 >= half_pitch
    # In metres along the ship, END CARRIAGE WHEEL (0.445 m off the gun's
    # centreline, cannons.WHEEL_Y + WHEEL_T / 2) to DECK END: 0.575 m.
    from_wheel = (main.t0 - low.t0) * G.loa - 0.445
    assert from_wheel == pytest.approx(0.575, abs=1e-3)


# --- R3: the sill is the largest centimetre that reads <= 0.75 inboard ------

@pytest.mark.parametrize("name, sill, lo, hi", [
    ("main", 0.83, 0.0882, 0.1309),
    ("waist", 0.85, 0.1036, 0.1194),
])
def test_each_sill_is_the_largest_centimetre_that_reads_075_inboard(
        name, sill, lo, hi):
    """Camber lift = DECK EDGE to 1.0 M INBOARD, over every port of the row.
    The sill is floor((0.75 + least lift) * 100) / 100, so at the port where
    the deck lifts least the reading is just under 0.75 and nowhere over."""
    deck = G.gun_decks.index(_row(G, name))
    lifts = _lifts(G, deck)
    assert min(lifts) == pytest.approx(lo, abs=1e-4)
    assert max(lifts) == pytest.approx(hi, abs=1e-4)
    largest = math.floor((0.75 + min(lifts)) * 100 + 1e-9) / 100
    assert _row(G, name).sill == largest == sill


@pytest.mark.parametrize("name, lo, hi", [
    ("main", 0.6991, 0.7418),
    ("waist", 0.7306, 0.7464),
])
def test_every_port_reads_inside_the_band_1_metre_inboard(name, lo, hi):
    """1.0 M INBOARD to SILL at every port of the row."""
    deck = G.gun_decks.index(_row(G, name))
    readings = [profiles.sill_reading(G, deck, t)
                for t in profiles.gunport_ts(G, deck)]
    assert min(readings) == pytest.approx(lo, abs=1e-4)
    assert max(readings) == pytest.approx(hi, abs=1e-4)
    assert all(BAND[0] <= r <= BAND[1] for r in readings)


def test_the_sill_reading_at_the_edge_is_the_sill_itself():
    """With `sill_inboard` 0 the reading is taken AT the deck edge, where
    the camber is nil: the frigate's 0.55 reads 0.55."""
    for t in profiles.gunport_ts(F, 0):
        assert profiles.sill_reading(F, 0, t) == pytest.approx(0.55, abs=1e-12)


def test_a_sill_of_070_reads_under_the_band_inboard_and_is_refused():
    """0.70 at the waist row's edge reads 0.5806..0.5964 1.0 m inboard."""
    with pytest.raises(ValueError, match="band"):
        _with_row(G, "waist", sill=0.70).validate()


def test_a_sill_a_centimetre_higher_reads_over_075_and_is_refused():
    for name, sill in (("main", 0.84), ("waist", 0.86)):
        with pytest.raises(ValueError, match="band"):
            _with_row(G, name, sill=sill).validate()


def test_measured_at_the_edge_instead_the_galleons_sill_is_refused():
    """`sill_inboard` 0: the 0.85 edge sill reads 0.85, over 0.75 — which is
    why the maintainer named the measurement point."""
    with pytest.raises(ValueError, match="band"):
        _with_row(G, "waist", sill_inboard=0.0).validate()


def test_the_same_band_on_the_frigates_row_would_reject_her_055():
    rows = tuple(replace(d, sill_band=BAND, sill_inboard=1.0)
                 for d in F.gun_decks)
    with pytest.raises(ValueError, match="band"):
        F.with_(gun_decks=rows).validate()


# --- R2: a deck inside the hull ---------------------------------------------

def test_a_tier_that_sinks_without_saying_it_is_inside_the_hull_is_refused():
    with pytest.raises(ValueError, match="INSIDE the hull"):
        st.DeckTier("Deck_Lower", 0.2, 0.8, 8, -2.0).validate()


def test_a_deck_inside_the_hull_must_sink_and_carry_no_bulwark():
    with pytest.raises(ValueError, match="INSIDE the hull"):
        st.DeckTier("Deck_Orlop", 0.2, 0.8, 8, 0.5,
                    inside_hull=True).validate()
    with pytest.raises(ValueError, match="bulwark"):
        st.DeckTier("Deck_Orlop", 0.2, 0.8, 8, -2.0, bulwark_h=1.0,
                    inside_hull=True).validate()


def test_the_lower_deck_edge_meets_the_hull_skins_inside_at_its_own_height():
    """HULL SKIN to DECK_LOWER EDGE, at the deck's own height: the side
    timber, `bulwark_thick` 0.22 m. Not the sheer-height `deck_half_beam`:
    below the sheer the topsides still tumble out, so the lower deck is
    WIDER than the gun deck at every station of the row."""
    low = G.tier("Deck_Lower")
    for t in profiles.gunport_ts(G, 0):
        z = profiles.sheer(G, t) + low.rise
        hb = profiles.tier_half_beam(G, low, t)
        assert profiles.hull_half_width(G, t, z) - hb == \
            pytest.approx(G.bulwark_thick, abs=1e-12)
        assert hb > profiles.deck_half_beam(G, t)


def test_its_camber_is_the_same_parabola_over_its_own_half_width():
    low = G.tier("Deck_Lower")
    for t in (0.2, 0.5, 0.84):
        hb = profiles.tier_half_beam(G, low, t)
        assert profiles.tier_camber_z(G, low, t, hb) == pytest.approx(0.0)
        assert profiles.tier_camber_z(G, low, t, 0.0) == G.deck_camber
        assert profiles.tier_deck_z(G, low, t, 0.0) == pytest.approx(
            profiles.sheer(G, t) - 2.0 + G.deck_camber)


def test_the_decks_at_and_above_the_sheer_keep_their_camber_verbatim():
    for p in (F, G):
        for tier in p.deck_tiers:
            if tier.inside_hull:
                continue
            for t in (tier.t0, 0.5 * (tier.t0 + tier.t1), tier.t1):
                for x in (0.0, 1.3, 2.9):
                    assert profiles.tier_deck_z(p, tier, t, x) == \
                        profiles.deck_z_at(p, t, x, tier.rise)


# --- validation of the rows against their decks ------------------------------

def test_a_row_served_by_a_deck_the_ship_does_not_have_is_refused():
    with pytest.raises(ValueError, match="Deck_Orlop"):
        _with_row(G, "main", served_by="Deck_Orlop").validate()


def test_a_hull_row_served_by_a_deck_at_the_sheer_is_refused():
    with pytest.raises(ValueError, match="inside the hull"):
        _with_row(G, "main", served_by="Deck_Main",
                  sill_band=None).validate()


def test_a_bulwark_row_served_by_the_lower_deck_is_refused():
    with pytest.raises(ValueError, match="at the sheer"):
        _with_row(G, "waist", served_by="Deck_Lower",
                  sill_band=None).validate()


def test_a_hull_row_whose_head_reaches_the_gun_deck_planking_is_refused():
    """LOWER HEAD to MAIN-DECK EDGE: -2.00 + 1.30 + 0.70 = 0.00, which is
    through the gun deck's 0.12 m planking."""
    with pytest.raises(ValueError, match="planking"):
        _with_row(G, "main", sill=1.30, sill_band=None).validate()


def test_an_unknown_host_is_refused():
    with pytest.raises(ValueError, match="'hull'"):
        replace(F.gun_decks[0], host="transom").validate()


# --- where the hull row stands ---------------------------------------------

def test_a_hull_ports_centre_stands_above_its_own_decks_edge():
    """DECK_LOWER EDGE to PORT CENTRE: 0.83 + 0.35 = 1.18 m; so WATERLINE to
    PORT CENTRE amidships (t 0.4909) is sheer - 2.00 + 1.18."""
    for t in profiles.gunport_ts(G, 0):
        assert profiles.port_center_z(G, t, 0) == pytest.approx(
            profiles.sheer(G, t) - 2.00 + 0.83 + 0.35, abs=1e-12)


def test_the_hull_loft_carries_a_station_at_every_hull_port_edge():
    ts = profiles.station_ts(G)
    for fwd, aft in profiles.port_edge_ts(G, 0):
        assert min(abs(fwd - t) for t in ts) < 1e-4
        assert min(abs(aft - t) for t in ts) < 1e-4


def test_the_hull_loft_carries_the_sill_and_head_at_one_ring_index():
    """At EVERY station, ring point `hull_seam_indices` IS the row's sill
    (and head) above Deck_Lower's edge — the same index the whole length,
    so the seams run fore and aft without zigzagging."""
    seams = profiles.hull_seam_offsets(G)
    assert seams == pytest.approx([-2.00 + 0.83, -2.00 + 1.53])
    idx = profiles.hull_seam_indices(G)
    n = G.pts_per_half
    for t in profiles.station_ts(G):
        ring = profiles.station_ring(G, t)
        starboard = ring[len(ring) // 2:]
        assert len(starboard) == n + len(seams)
        for i, off in zip(idx, seams):
            assert starboard[i][2] == pytest.approx(
                profiles.sheer(G, t) + off, abs=1e-12)
        zs = [pt[2] for pt in starboard]
        assert all(b > a for a, b in zip(zs, zs[1:]))
    # The aperture itself is one interval tall.
    assert idx[1] - idx[0] == 1


def test_the_frigates_loft_is_her_uniform_one_verbatim():
    assert profiles.hull_seam_offsets(F) == []
    ring = profiles.station_ring(F, 0.5)
    kz, sz = profiles.keel_z(F, 0.5), profiles.sheer(F, 0.5)
    for i, pt in enumerate(ring[len(ring) // 2:]):
        assert pt[2] == kz + (sz - kz) * (i / (F.pts_per_half - 1))


# --- the cut: hull apertures, rims, ceiling ----------------------------------

def test_the_bulwark_grid_holds_only_the_bulwark_row():
    assert [d for d, _box in profiles.all_gunport_boxes(G)] == [1] * 9
    assert [d for d, _box in profiles.all_hull_gunport_boxes(G)] == [0] * 12
    assert profiles.all_hull_gunport_boxes(F) == []


def test_each_hull_aperture_spans_its_own_port_in_one_ring_interval():
    """PORT FORWARD EDGE to PORT AFTER EDGE is the 0.86 m aperture, landed
    on loft stations; SILL to HEAD is 0.70 m, one ring interval."""
    for y_aft, y_fwd, z_lo, z_hi in profiles.hull_gunport_boxes(G, 0):
        assert y_fwd - y_aft == pytest.approx(0.86, abs=2e-3)
        assert (z_lo, z_hi) == pytest.approx((-2.00 + 0.83, -2.00 + 1.53))


def test_every_hull_port_rim_is_a_closed_loop_of_hard_edges():
    """Twelve ports, two sides: 24 loops, each 2 x (bands + 1) + 2 edges;
    the gunwale and cap edges of the loft are not among them."""
    rims = profiles.hull_port_rims(G)
    assert len(rims) == 24
    bands = [len(b) for b in profiles.hull_gunport_bands(G, 0)]
    assert sorted(len(loop) for loop in rims) == \
        sorted(2 * (b + 1) for b in bands for _side in (0, 1))
    edges = profiles.hull_port_rim_edges(G)
    assert len(edges) == sum(len(loop) for loop in rims) == 120
    ring_len = profiles.hull_ring_len(G)
    n_rings = len(profiles.station_ts(G))
    assert not edges & profiles.hull_hard_edges(ring_len, n_rings)
    assert profiles.hull_port_rim_edges(F) == frozenset()


def test_the_ceiling_meets_the_bulwark_inner_skin_and_the_lower_deck():
    """CEILING TOP at the sheer to the BULWARK's inner skin foot: the same
    half-width; CEILING FOOT is the lower deck's planking, 0.12 m under its
    edge; and at the lower deck's own height the ceiling IS its edge."""
    low = G.tier("Deck_Lower")
    assert profiles.ceiling_offsets(G, low) == pytest.approx(
        [-2.12, -1.17, -0.47, 0.0])
    ts = profiles.ceiling_ts(G, low)
    assert ts[0] == low.t0 and ts[-1] == low.t1
    for t in ts:
        sz = profiles.sheer(G, t)
        assert profiles.ceiling_half_width(G, t, sz) == pytest.approx(
            profiles.bulwark_half_width(G, t, sz) - G.bulwark_thick,
            abs=1e-12)
        assert profiles.ceiling_half_width(G, t, sz - 2.0) == pytest.approx(
            profiles.tier_half_beam(G, low, t), abs=1e-12)
    assert profiles.hull_tiers(F) == ()


# --- the guns and lids of the hull row ---------------------------------------

def test_the_hull_rows_guns_stand_on_the_lower_deck_muzzles_out_of_the_skin():
    guns = profiles.gun_placements(G)
    low = G.tier("Deck_Lower")
    hull_ts = profiles.gunport_ts(G, 0)
    assert len(guns) == 44
    for gun, t in zip(guns[:24], [t for t in hull_ts for _s in (1, -1)]):
        x = abs(gun["origin"][0]) + profiles.GUN_LENGTH
        z = profiles.port_center_z(G, t, 0)
        # MUZZLE to HULL SKIN at the port's own centre: GUN_MUZZLE_OUT.
        assert x - profiles.hull_half_width(G, t, z) == pytest.approx(
            profiles.GUN_MUZZLE_OUT, abs=1e-9)
        assert gun["origin"][2] == pytest.approx(profiles.tier_deck_z(
            G, low, t, gun["carriage_x"]), abs=1e-12)


def test_a_hull_rows_lid_hangs_on_the_hull_at_its_own_head_along_the_skin():
    """HINGE to PORT HEAD on the hull's outer face: zero. Shut, the lid lies
    on the local skin, which under the galleon's sheer leans 13.7-22.5 deg
    OUTBOARD of the vertical between head and sill. Bulwark lids carry no
    lean and hang plumb, as the frigate's always have."""
    lids = profiles.lid_placements(G)
    hull = [lid for lid in lids if lid["deck"] == 0]
    assert len(hull) == 24 and len(lids) == 44
    for lid in hull:
        x, y, z = lid["hinge"]
        t = profiles.t_of_y(G, y)
        assert z == pytest.approx(profiles.sheer(G, t) - 2.00 + 1.53,
                                  abs=1e-9)
        assert abs(x) == pytest.approx(profiles.hull_half_width(G, t, z),
                                       abs=1e-9)
    leans = [lid["lean_deg"] for lid in hull]
    assert min(leans) == pytest.approx(13.68, abs=0.01)
    assert max(leans) == pytest.approx(22.53, abs=0.01)
    assert all("lean_deg" not in lid for lid in lids if lid["deck"] != 0)
    assert all("lean_deg" not in lid for lid in profiles.lid_placements(F))


# --- the chainplate foot that the dropped cap moved onto the hull ------------

def test_a_strap_foot_on_the_hull_is_let_in_and_the_frigates_is_not():
    """STRAP INNER FACE to HULL CAGE at the foot: 5 mm into the planking on
    the galleon, whose feet now land 0.60-0.67 m under the sheer where the
    rendered skin stands up to 1.9 mm inside its cage; 0 on the frigate,
    whose feet land on the bulwark."""
    assert F.rail_form.strap_bed == 0.0
    assert G.rail_form.strap_bed == 0.005
    with pytest.raises(ValueError, match="strap_bed"):
        replace(G.rail_form, strap_bed=G.rail_form.strap_thick).validate()


# --- review fix round 1 ----------------------------------------------------

def test_the_frigates_aperture_key_reads_exactly_as_it_shipped():
    """The frigate's check_all text keys are frozen: her check_gunports key
    is "all 22 apertures are open", as at 75c2b1f. Only a ship with a hull
    row says how her apertures split between the hosts."""
    from frigate import checklist
    assert checklist.aperture_key(F, 22, 0) == "all 22 apertures are open"
    assert checklist.aperture_key(G, 18, 24) == (
        "all 42 apertures are open, 18 in the bulwark and 24 in the hull")


def test_the_shrouds_through_the_quarterdeck_deviation_is_RETIRED():
    """CHANGED ON PURPOSE (Task 9, the maintainer's third ruling B). The aftmost
    mizzen shroud each side used to pass through Deck_Quarter's planking
    under the poop (18 face pairs, capped, question B). The mizzen channel
    now hangs on the quarterdeck castle's side, 0.88 above that deck's
    edge, and Blender measures 0 pairs; the pair is UNRULED again, so any
    contact at all FAILS."""
    from frigate import joints
    key = joints.pair("Deck_Quarter", "Rigging")
    assert key not in joints.JOINTS
    assert key not in joints.DEVIATIONS
    assert not joints.verdict("Deck_Quarter", "Rigging", 1).ok

