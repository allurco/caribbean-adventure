"""The galleon's rails, channels and chainplates. No bpy anywhere here.

THE QUESTION THIS PASS ASKS, and it is the same question on both ships: a
CHANNEL has to be bolted on above the head of the UPPERMOST row of ports, and
a CHAINPLATE's foot has to land below the sill of the LOWEST row. One row and
two rows ask it identically; only the answers differ, and on a galleon the
answer to the second is 1.15 m further down.

BOTH ENDPOINTS OF EVERY MEASUREMENT ARE NAMED, and the two landmarks this
file is written against are a station's own SHEER and its own RAIL CAP.
"""

import pytest

from frigate import profiles
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


# --- the open rail goes where a platform has nothing round its edge ---------

def test_the_frigate_rails_two_platforms_and_the_galleon_rails_none():
    """A CASTLE deck already carries a bulwark of its own.

    The frigate's forecastle and quarterdeck tuck UNDER her main rail, so the
    cap beside them stands 0.60 m and 0.18 m proud of their own deck edges —
    a trip hazard — and the open rail is what guards them. All three of the
    galleon's raised decks stand clear ABOVE its waist rail with bulwarks of
    their own, 0.85 m on the forecastle and 1.00 m on each of the others, so
    railing them again would stand a second rail on the first.
    """
    assert [t.name for t in profiles.railed_tiers(F)] == \
        ["Deck_Forecastle", "Deck_Quarter"]
    assert profiles.railed_tiers(G) == ()
    assert len(profiles.rail_runs(F)) == 2
    assert profiles.rail_runs(G) == []
    # And every one of the galleon's raised decks IS a castle, which is why.
    assert len(G.raised_tiers()) == 3
    assert all(t.stands_above_the_main_rail() for t in G.raised_tiers())


def test_the_frigates_rail_runs_did_not_move_when_they_became_derived():
    """They are built from `raised_tiers` now, not from two named fields."""
    pad = (F.rail_form.stanchion_w / 2.0) / F.loa
    assert profiles.rail_runs(F) == [
        (F.rail_form.end_in, F.fcastle_t - pad),
        (F.quarter_t + pad, 1.0 - F.rail_form.end_in),
    ]


def test_platform_runs_carries_EVERY_raised_tier_including_a_poop():
    """It returned the forecastle and the quarterdeck and nothing else.

    A poop missing from that list is a deck whose rail height is read off the
    deck below it, and `rail_top_z` is what reads it.
    """
    assert len(profiles.platform_runs(F)) == 2
    assert len(profiles.platform_runs(G)) == 3
    assert [t0 for t0, _t1, _r in profiles.platform_runs(G)] == [0.0, 0.54, 0.81]


def test_the_head_rail_springs_off_a_landmark_that_survives_an_empty_list():
    """`rail_runs(p)[0][0]` raised IndexError on a ship with no open rail.

    The value is the same on both ships; what changed is that it is no longer
    read out of a list that is allowed to have nothing in it.
    """
    assert profiles.forecastle_rail_t(G) == G.rail_form.end_in
    assert profiles.forecastle_rail_t(F) == F.rail_form.end_in
    assert profiles.forecastle_rail_t(F) == profiles.rail_runs(F)[0][0]


# --- the channel and the chainplate against a battery of two rows -----------

def test_the_channel_clears_the_uppermost_rows_head_on_both_ships():
    """CHANNEL-UNDERSIDE to UPPERMOST-PORT-HEAD, both above the sheer.

    The frigate: bulwark 1.60, channel top 0.10 below the cap, 0.16 m plate,
    so the underside is at 1.34 against a head at 1.30 — 0.04 m, found the
    hard way (at a 0.15 m drop the TOP cleared and the BOTTOM did not).
    The galleon: cap 1.90, drop 0.12, 0.20 m plate, underside 1.58 against a
    head at 1.47 — 0.11 m, on a battery twice the size.
    """
    f_head, _f_sill = F.rail_form.clears_battery(F)
    g_head, _g_sill = G.rail_form.clears_battery(G)
    assert f_head == pytest.approx(0.04, abs=0.005)
    assert g_head == pytest.approx(0.11, abs=0.005)
    assert f_head > 0.0 and g_head > 0.0


def test_the_chainplate_foot_lands_under_the_bulwark_row_above_hull_ports():
    """CHAINPLATE-FOOT to LOWEST-BULWARK-PORT-SILL, and where the foot lands
    against the HULL row. A strap that stops above a gunport is a strap
    bolted to a hole.

    The frigate's lowest sill is 0.55 above her sheer and her 1.25 m drop
    from a channel edge at 1.50 puts the foot at 0.25 — 0.30 m of clearance.

    The galleon's only bulwark row is the waist row, sill 0.85 above the
    sheer; her channel edge is at 1.90 - 0.12 = 1.78 and her 2.20 m drop
    puts the foot at -0.42, 1.27 m under that sill.

    CHANGED ON PURPOSE (Task 9, the maintainer's third ruling A): the foot now
    lands ABOVE the hull row's head. HULL-ROW HEAD (Deck_Lower edge + 0.83
    + 0.70, i.e. 0.47 under the sheer) to CHAINPLATE FOOT, at the foot's
    centre, is 0.0458-0.0656 m UPWARD over the bulwark channels' feet
    beside that row (0.0442 at the lowest CORNER, which is what
    `profiles.strap_foot_over_head` reads), never under `strap_clear`
    0.04. It was 0.13-0.20 m DOWNWARD at the 2.40 drop, the
    foot ending at port height between two columns, where the hull lids
    of ports 6 and 11 crossed their straps. Every strap edge still stands
    at least `strap_clear` fore and aft of every hull port.
    """
    _f_head, f_sill = F.rail_form.clears_battery(F)
    _g_head, g_sill = G.rail_form.clears_battery(G)
    assert f_sill == pytest.approx(0.30, abs=0.005)
    assert g_sill == pytest.approx(1.27, abs=0.005)
    # Where the foot actually lands, relative to each ship's own sheer.
    f_foot = F.bulwark_h - F.rail_form.channel_drop - F.rail_form.chainplate_drop
    g_foot = G.bulwark_h - G.rail_form.channel_drop - G.rail_form.chainplate_drop
    assert f_foot == pytest.approx(0.25, abs=1e-9)   # on the bulwark
    assert g_foot == pytest.approx(-0.42, abs=1e-9)  # on the hull
    hull_row = G.gun_decks[0]
    head = G.tier(hull_row.served_by).rise + hull_row.head
    assert head == pytest.approx(-0.47, abs=1e-9)
    above = []
    spans = [(profiles.station_y(G, t) - hull_row.width / 2,
              profiles.station_y(G, t) + hull_row.width / 2)
             for t in profiles.gunport_ts(G, 0)]
    run = (min(lo for lo, _hi in spans), max(hi for _lo, hi in spans))
    w = G.rail_form.strap_half_w + G.rail_form.strap_clear - 1e-9
    # The bulwark channels only: the mizzen's is on the quarterdeck castle
    # (the maintainer's third ruling, B) and its straps fall a drop of their own.
    bulwark = [m for m in profiles.mast_names(G)
               if profiles.channel_host(G, m) is None]
    for name in bulwark:
        for top, foot in profiles.chainplate_segments(G, name):
            for y in (top[1], foot[1]):
                assert not any(lo - w < y < hi + w for lo, hi in spans)
            if not run[0] <= foot[1] <= run[1]:
                continue
            t = profiles.t_of_y(G, foot[1])
            above.append(foot[2] - (profiles.row_floor_z(G, t, 0)
                                    + hull_row.head))
    assert min(above) == pytest.approx(0.0458, abs=5e-4)
    assert max(above) == pytest.approx(0.0656, abs=5e-4)

def test_every_emitted_chainplate_foot_is_below_every_sill_there_is():
    for p in (F, G):
        lowest = min(d.sill for d in profiles.bulwark_gun_decks(p))
        for name in profiles.mast_names(p):
            for _head, foot in profiles.chainplate_segments(p, name):
                t = profiles.t_of_y(p, foot[1])
                assert foot[2] < profiles.sheer(p, t) + lowest


def test_no_chainplate_strap_crosses_a_gunport_on_either_ship():
    for p in (F, G):
        blocked = profiles._strap_blocked_spans(p)
        for name in profiles.mast_names(p):
            for head, _foot in profiles.chainplate_segments(p, name):
                assert not any(lo < head[1] < hi for lo, hi in blocked)


def test_the_whole_shroud_count_gets_a_strap_on_both_ships():
    for p in (F, G):
        for name in profiles.mast_names(p):
            assert len(profiles.chainplate_segments(p, name)) == \
                profiles.chainplate_count(p, name)


# --- two rows in the SAME columns, which is what made room for them ---------

def test_the_galleons_upper_row_stands_directly_over_its_lower_row():
    """Two rows at independent pitches drift out of step and block the side.

    12 ports over t 0.20..0.84 and 9 over 0.26..0.78 end up half a pitch
    apart amidships. Over the main channel's 8.60 m of side that left 0.23 m
    and 0.35 m of clear planking, and six chainplates would not fit on it.
    Ships stand their rows in the same columns, and this is the reason.
    """
    main = profiles.gunport_ts(G, 0)
    waist = profiles.gunport_ts(G, 1)
    assert len(main) == 12 and len(waist) == 9
    for t in waist:
        assert any(abs(t - m) < 1e-12 for m in main)
    # A centred group, so the upper row is shorter at BOTH ends.
    assert min(waist) > min(main) and max(waist) < max(main)


def test_an_unaligned_row_still_spaces_itself_and_the_frigate_is_one():
    assert F.gun_decks[0].align is None
    ts = profiles.gunport_ts(F, 0)
    assert len(ts) == 11
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    for g in gaps[1:]:
        assert g == pytest.approx(gaps[0], abs=1e-12)


@pytest.mark.parametrize("decks, match", [
    ((st.GunDeck("a", 4, 0.2, 0.8, 0.9, 0.7, 0.5, align="ghost"),), "does not have"),
    ((st.GunDeck("a", 4, 0.2, 0.8, 0.9, 0.7, 0.5, align="a"),), "aligned to itself"),
    ((st.GunDeck("a", 4, 0.2, 0.8, 0.9, 0.7, 0.5),
      st.GunDeck("b", 4, 0.2, 0.8, 0.9, 0.7, 1.4, align="a"),
      st.GunDeck("c", 4, 0.2, 0.8, 0.9, 0.7, 2.3, align="b")), "one deep"),
])
def test_an_alignment_that_could_not_be_resolved_is_refused(decks, match):
    with pytest.raises(ValueError, match=match):
        st.validate_gun_decks(decks)


def test_a_row_cannot_take_more_columns_than_the_row_it_aligns_to_has():
    base = st.GunDeck("main", 6, 0.2, 0.8, 0.9, 0.7, 0.5)
    greedy = st.GunDeck("waist", 9, 0.3, 0.7, 0.8, 0.6, 1.4, align="main")
    with pytest.raises(ValueError, match="has only"):
        greedy.ts(base.ts())


# --- the bite a flat plate takes out of a curved side ------------------------

def test_the_channel_bite_is_COMPUTED_and_not_chosen():
    """`rails.build_channels` takes the plate's inner edge at the plate's TOP
    at each station, and the bulwark goes on widening below that.

    0.0429 m on the frigate, which measures 0.0405 in Blender and so is
    TIGHTER than the flat 0.050 it replaces; 0.0853 m on the galleon, whose
    side tumbles 0.10 per metre against the frigate's 0.06 under a plate a
    quarter thicker.
    """
    assert profiles.channel_bite(F) == pytest.approx(0.0429, abs=0.0005)
    assert profiles.channel_bite(G) == pytest.approx(0.0853, abs=0.0005)
    assert profiles.channel_bite(F) < 0.050   # a tightening, not a widening


def test_a_thinner_plate_on_a_gentler_side_bites_less():
    """The mutation test on the figure: it has to MOVE with what it measures."""
    import dataclasses
    thin = GalleonParams(rail_form=dataclasses.replace(
        G.rail_form, channel_thick=0.10))
    assert profiles.channel_bite(thin) < profiles.channel_bite(G)


# --- what the rail form refuses ---------------------------------------------

@pytest.mark.parametrize("kwargs, match", [
    (dict(channel_thick=0.0), "channel_thick"),
    (dict(chainplate_drop=-1.0), "chainplate_drop"),
    (dict(mid_frac=1.2), "mid_frac"),
    (dict(channel_fwd=0.0), "channel_fwd"),
    (dict(chainplate_rake=-0.1), "rakes AFT"),
    (dict(strap_half_w=0.2, strap_min_gap=0.22), "overlap"),
])
def test_a_rail_form_that_could_not_be_built_is_refused(kwargs, match):
    with pytest.raises(ValueError, match=match):
        st.RailForm(**kwargs).validate()


def test_the_frigates_rail_form_is_the_constants_it_replaced():
    r = F.rail_form
    assert (r.stanchion_w, r.guard_h, r.min_proud, r.spacing, r.end_in) == \
        (0.09, 1.00, 0.30, 1.30, 0.03)
    assert (r.rail_w, r.rail_t, r.midrail_w, r.midrail_t, r.mid_frac) == \
        (0.11, 0.09, 0.085, 0.065, 0.46)
    assert (r.channel_projection, r.channel_thick, r.channel_drop,
            r.channel_fwd) == (0.85, 0.16, 0.10, 0.35)
    assert (r.chainplate_drop, r.chainplate_rake, r.chainplate_margin) == \
        (1.25, 0.12, 0.18)
    assert (r.strap_half_w, r.strap_clear, r.strap_min_gap, r.strap_w,
            r.strap_thick) == (0.065, 0.04, 0.22, 0.13, 0.045)


# --- DEFECT 2: overlapping platform runs, and the FIRST match wins ----------
#
# `platform_runs(G)` is [(0.0, 0.21, 2.9), (0.54, 1.0, 3.4), (0.81, 1.0, 5.0)].
# Deck_Quarter spans 0.54..1.0 and Deck_Poop spans 0.81..1.0, so BOTH contain
# every station abaft 0.81 and the readers returned whichever came first.
# Measured before this test existed: `rail_top_z(G, 1.00)` = 10.200 m above
# the waterline, which is sheer(1.0) 5.800 + Deck_Quarter's rise 3.400 + its
# own bulwark 1.000. The poop's own cap at the same station is 5.800 + 5.000 +
# 1.000 = 11.800, and 11.800 is the figure the stern pass measured and the
# ledger records. The reader was 1.600 m low over the whole poop.

def test_rail_top_z_abaft_the_poop_break_reads_the_POOP_not_the_quarterdeck():
    """TAFFRAIL (t=1.0): waterline to the POOP's own rail cap.

    Two derivations of one landmark, in the same breath. Deck_Poop declares
    rise 5.00 and bulwark_h 1.00 and `sheer(G, 1.0)` is 5.80, so the cap the
    stern pass built and measured stands at 11.80 m above the waterline.
    Deck_Quarter, which also contains t=1.0, would put it at 10.20.
    """
    sheer_at_taffrail = profiles.sheer(G, 1.0)
    assert sheer_at_taffrail == pytest.approx(5.80, abs=1e-9)
    poop = G.tier("Deck_Poop")
    quarter = G.tier("Deck_Quarter")
    # Both tiers contain the taffrail. That is the whole defect.
    assert quarter.t0 < poop.t0 and quarter.t1 == poop.t1 == 1.0
    assert profiles.rail_top_z(G, 1.0) == pytest.approx(
        sheer_at_taffrail + poop.rise + poop.bulwark_h, abs=1e-9)
    assert profiles.rail_top_z(G, 1.0) == pytest.approx(11.80, abs=1e-9)
    # And NOT the quarterdeck's cap, 1.60 m lower.
    assert profiles.rail_top_z(G, 1.0) != pytest.approx(
        sheer_at_taffrail + quarter.rise + quarter.bulwark_h, abs=1e-3)


def test_the_tier_under_the_rail_abaft_the_poop_break_IS_the_poop():
    """`_rail_tier_at` picked the first run that contained t, not the highest.

    Every station from the poop break at 0.81 aft stands under the poop, and
    the poop is the tier whose bulwark is the rail there.
    """
    for t in (0.81, 0.85, 0.90, 0.95, 1.0):
        tier = profiles._rail_tier_at(G, t)
        assert tier is not None
        assert tier.name == "Deck_Poop", f"at t={t} got {tier.name}"
        assert profiles._rail_rise_at(G, t) == pytest.approx(5.00, abs=1e-9)
    # Forward of the break the quarterdeck is still the uppermost tier.
    assert profiles._rail_tier_at(G, 0.70).name == "Deck_Quarter"
    assert profiles._rail_rise_at(G, 0.70) == pytest.approx(3.40, abs=1e-9)


def test_the_uppermost_walking_surface_abaft_the_poop_break_is_the_poop():
    """`deck_rise_at` asks which surface is UPPERMOST and read the same list.

    It returned 3.40, the quarterdeck, at a station where a man stands on the
    poop 1.60 m higher. `deck_spot` and the furniture layout both read it.
    """
    assert profiles.deck_rise_at(G, 1.0) == pytest.approx(5.00, abs=1e-9)
    assert profiles.deck_rise_at(G, 0.90) == pytest.approx(5.00, abs=1e-9)
    assert profiles.deck_rise_at(G, 0.70) == pytest.approx(3.40, abs=1e-9)
    assert profiles.deck_rise_at(G, 0.40) == pytest.approx(0.00, abs=1e-9)


def test_the_frigates_runs_do_not_overlap_so_nothing_about_her_can_move():
    """Her runs are 0.0..0.2 and 0.6..1.0. No station is in two of them.

    That is why the fix cannot move her, and `tests/test_frigate_frozen.py`
    is what proves it did not.
    """
    runs = profiles.platform_runs(F)
    for i, (a0, a1, _ar) in enumerate(runs):
        for b0, b1, _br in runs[i + 1:]:
            assert a1 <= b0 or b1 <= a0, f"{(a0, a1)} overlaps {(b0, b1)}"
