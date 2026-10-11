"""The galleon's proportions, with both endpoints of every measurement named.

A hull was once certified 1.35x too tall because somebody wrote "freeboard is
4.2 m" instead of "waterline-to-rail-cap is 4.3307 m". Every assertion here
says what the distance SPANS.

WHERE THE NUMBERS COME FROM. The two images in ~/Downloads are a frigate
reference — `La-penelope.webp` is a late, near-flush-decked French frigate —
and they will NOT serve for a galleon: they show a long low hull with no
castle at all, which is the one feature that most defines the ship being
built here. Stretching them would be inventing evidence. The galleon is
measured against, in order of weight:

  1. Galeon Andalucia (2010), a sailing replica built to Spanish galleon lines
     by the Fundacion Nao Victoria: HULL LENGTH 38 m, overall 51 m with the
     bowsprit, BEAM 10.12 m, DRAFT 3.40 m. Hull-length-to-beam 3.76 : 1.
  2. Vasa (1628), the surviving high-charged galleon: length between
     perpendiculars 47.5 m, beam 11.7 m, draft 4.8 m, TWO gun decks, three
     masts with the mizzen lateen. Perpendicular-to-perpendicular over beam
     4.06 : 1; draft over beam 0.410.
  3. The textbook proportion for the type, 3 : 1 and sometimes 4 : 1, with the
     Manila galleons' "unusual breadth of beam" explicitly described as what
     offsets the topheaviness of ends that stand so high out of the water.

THE FINDING THAT CAME OUT OF MEASURING RATHER THAN ASSUMING. The one real
galleon hull whose length and beam are both published — the Andalucia — is
3.76 : 1, and this project's frigate is 3.73 : 1. They are the same plan
proportion. So "short and beamy" is NOT carried by length over beam alone,
and a galleon built only by shortening and widening would not read as one.
What carries it is the SECTION and the HEIGHT: a bluff entry instead of a
fine one, far heavier tumblehome, and castles that stand two and three times
as high above the water. This hull does both — it is taken to 3.09 : 1,
on the textbook figure — but the section and the height are where the work is.
"""

import pytest

from frigate import profiles, ropes, shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


# --- plan: length and beam --------------------------------------------------


def test_stem_at_rail_to_taffrail_is_34_metres():
    assert G.loa == 34.0


def test_maximum_beam_at_the_wales_amidships_is_11_metres():
    assert G.beam == 11.0


def test_stem_to_taffrail_over_maximum_beam_sits_on_the_textbook_3_to_1():
    ratio = G.loa / G.beam
    assert ratio == pytest.approx(3.09, abs=0.01)
    assert 3.0 <= ratio <= 3.3


def test_the_galleon_is_shorter_and_beamier_than_the_frigate_it_inherits_from():
    assert G.loa < F.loa
    assert G.beam > F.beam
    assert G.loa / G.beam < F.loa / F.beam


def test_more_of_the_galleons_length_is_overhang_than_the_frigates():
    """A long beakhead forward and the castle's counter aft: forward-waterline-
    ending to after-waterline-ending is a smaller share of stem-to-taffrail."""
    assert G.lwl / G.loa < F.lwl / F.loa
    assert G.lwl / G.loa == pytest.approx(0.776, abs=0.005)


def test_keel_underside_to_waterline_against_vasas_draft_over_beam():
    assert G.draft == 4.3
    assert G.draft / G.beam == pytest.approx(0.391, abs=0.005)   # Vasa 0.410


def test_maximum_beam_stands_further_forward_than_the_frigates():
    """A bluff bow carries its width early; a fine entry carries it late."""
    assert G.max_beam_t < F.max_beam_t


# --- height: the thing that actually makes it a galleon ---------------------


def test_waterline_to_waist_rail_cap_amidships_is_5_00_metres():
    """WATERLINE to WAIST RAIL CAP at t 0.5: 3.10 + 1.90 = 5.00. It was 5.55
    with both rows in the bulwark; it dropped 0.55 m because the lower battery
    left the bulwark (the maintainer's ruling 2026-10-05, R4), and the cap is derived
    from the one row it still holds."""
    amidships = profiles.sheer(G, 0.5) + G.bulwark_h
    assert amidships == pytest.approx(5.00, abs=0.001)


def test_the_waist_rail_stands_higher_over_its_own_length_than_the_frigates():
    """WATERLINE-to-WAIST-RAIL-CAP at t 0.5 over STEM-to-TAFFRAIL: 5.00 / 34.0
    = 0.147. It was 0.163; the cap dropped 0.55 m because the lower battery
    left the bulwark (the maintainer's ruling 2026-10-05, R4). Still 1.3 times the
    frigate's 0.113."""
    galleon = (profiles.sheer(G, 0.5) + G.bulwark_h) / G.loa
    frigate = (profiles.sheer(F, 0.5) + F.bulwark_h) / F.loa
    assert galleon == pytest.approx(0.147, abs=0.002)
    assert frigate == pytest.approx(0.113, abs=0.002)
    assert galleon > 1.25 * frigate


def test_waterline_to_rail_cap_at_the_stem_is_6_45_metres():
    """WATERLINE to WAIST RAIL CAP at the stem: 4.55 + 1.90 = 6.45. It was
    7.00; the cap dropped 0.55 m because the lower battery left the bulwark
    (the maintainer's ruling 2026-10-05, R4)."""
    assert profiles.sheer(G, 0.0) + G.bulwark_h \
        == pytest.approx(6.45, abs=0.001)


def test_waterline_to_rail_cap_at_the_taffrail_is_7_70_metres():
    """WATERLINE to WAIST RAIL CAP at the taffrail: 5.80 + 1.90 = 7.70. It was
    8.25; the cap dropped 0.55 m because the lower battery left the bulwark
    (the maintainer's ruling 2026-10-05, R4)."""
    assert profiles.sheer(G, 1.0) + G.bulwark_h \
        == pytest.approx(7.70, abs=0.001)


def test_the_sheer_sweeps_up_three_times_as_hard_aft_as_the_frigates():
    assert G.stern_rise == 2.70
    assert G.stern_rise / F.stern_rise == pytest.approx(3.0)


def test_the_stern_is_a_flight_of_three_steps_at_the_taffrail():
    """Waterline to each rail cap on the centreline at station 1.0. A galleon's
    profile is steps, not one wall: waist, quarterdeck, poop. The waist step is
    7.70 (was 8.25: the lower battery left the bulwark (the maintainer's ruling
    2026-10-05, R4)); the quarterdeck and poop did not move."""
    sz = profiles.sheer(G, 1.0)
    assert sz + G.bulwark_h == pytest.approx(7.70, abs=0.001)
    q = G.tier("Deck_Quarter")
    assert sz + q.rise == pytest.approx(9.20, abs=0.001)
    assert sz + q.rise + q.bulwark_h == pytest.approx(10.20, abs=0.001)
    poop = G.tier("Deck_Poop")
    assert sz + poop.rise == pytest.approx(10.80, abs=0.001)
    assert sz + poop.rise + poop.bulwark_h == pytest.approx(11.80, abs=0.001)


def test_each_step_aft_stands_clear_above_the_one_below_it():
    """WAIST RAIL CAP to QUARTERDECK EDGE at the taffrail: 9.20 - 7.70 = 1.50
    (was 0.95; the waist cap dropped 0.55 m because the lower battery left the
    bulwark (the maintainer's ruling 2026-10-05, R4) and the quarterdeck was NOT
    raised). QUARTERDECK RAIL CAP to POOP EDGE: 10.80 - 10.20 = 0.60, unmoved.
    """
    sz = profiles.sheer(G, 1.0)
    waist = sz + G.bulwark_h
    q = G.tier("Deck_Quarter")
    poop = G.tier("Deck_Poop")
    assert sz + q.rise - waist == pytest.approx(1.50, abs=0.001)
    assert sz + poop.rise - (sz + q.rise + q.bulwark_h) == pytest.approx(0.60, abs=0.001)


def test_waterline_to_poop_rail_cap_is_the_towering_stern_castle():
    poop = G.tier("Deck_Poop")
    cap = profiles.sheer(G, 1.0) + poop.rise + poop.bulwark_h
    assert cap == pytest.approx(11.80, abs=0.001)
    # A third of stem-to-taffrail stands above the water at the stern.
    assert cap / G.loa == pytest.approx(0.347, abs=0.005)


def _highest_rail_cap_at_the_taffrail(p) -> float:
    """Waterline to the topmost rail cap on the centreline at station 1.0.

    On the frigate that IS the main bulwark cap, because its quarterdeck sits
    inside the one bulwark — writing `sheer + quarter_rise + bulwark_h` would
    count the rise twice and is the same class of slip as "freeboard is 4.2 m".
    """
    best = profiles.sheer(p, 1.0) + p.bulwark_h
    for tier in p.deck_tiers:
        if tier.stands_above_the_main_rail() and tier.t1 >= 1.0:
            best = max(best, profiles.sheer(p, 1.0) + tier.rise + tier.bulwark_h)
    return best


def test_the_frigates_own_topmost_rail_at_the_taffrail_is_its_main_bulwark_cap():
    assert _highest_rail_cap_at_the_taffrail(F) == pytest.approx(5.20, abs=0.001)


def test_the_poop_rail_stands_more_than_twice_as_high_over_its_own_length():
    g = _highest_rail_cap_at_the_taffrail(G) / G.loa
    f = _highest_rail_cap_at_the_taffrail(F) / F.loa
    assert g == pytest.approx(0.347, abs=0.002)
    assert f == pytest.approx(0.137, abs=0.002)
    assert g > 2.0 * f


# --- section: bluff bow, heavy tumblehome -----------------------------------


def test_the_entry_is_BLUFF_where_the_frigates_is_FINE():
    assert G.hull_form.entry_exp < 1.0 < F.hull_form.entry_exp


def test_the_galleon_carries_real_width_right_up_to_its_stem():
    assert G.hull_form.stem_fraction > F.hull_form.stem_fraction
    # Half-beam-at-the-stem over half-beam-at-maximum-beam.
    assert profiles.half_beam(G, 0.0) / profiles.half_beam(G, G.max_beam_t) \
        == pytest.approx(G.hull_form.stem_fraction)


def test_the_bow_is_fuller_than_the_frigates_at_every_station_forward():
    """Measured as half-beam-at-t over half-beam-at-maximum-beam, so the
    comparison is of SHAPE and not of the two ships' different beams."""
    for i in range(1, 10):
        t = 0.1 * i * 0.4
        g = profiles.half_beam(G, t) / profiles.half_beam(G, G.max_beam_t)
        f = profiles.half_beam(F, t) / profiles.half_beam(F, F.max_beam_t)
        assert g > f, f"at t={t:.3f} the galleon's bow is not the fuller one"


def test_the_topsides_draw_in_twice_as_hard_as_the_frigates():
    assert G.hull_form.tumble_at_deck == pytest.approx(2.0 * F.hull_form.tumble_at_deck)


def test_measured_at_the_deck_edge_the_galleon_tumbles_further_in():
    for t in (0.3, 0.5, 0.7):
        sz_g, sz_f = profiles.sheer(G, t), profiles.sheer(F, t)
        assert profiles.tumblehome(G, sz_g, sz_g) < profiles.tumblehome(F, sz_f, sz_f)


def test_the_tuck_rises_higher_than_the_frigates_under_a_square_transom():
    assert G.hull_form.tuck_rise > F.hull_form.tuck_rise
    # keel-underside-at-the-transom to keel-underside-amidships
    assert profiles.keel_z(G, 1.0) - profiles.keel_z(G, 0.5) \
        > profiles.keel_z(F, 1.0) - profiles.keel_z(F, 0.5)


# --- the battery: two rows, which is why the bulwark is as tall as it is ----


def test_the_galleon_carries_TWO_rows_of_ports_a_side():
    assert len(G.gun_decks) == 2
    assert [d.name for d in G.gun_decks] == ["main", "waist"]


def test_the_battery_is_42_broadside_ports_and_two_chasers():
    assert profiles.total_broadside_ports(G) == 42
    assert profiles.total_broadside_ports(G) + G.chase_ports == 44


def test_one_row_is_cut_in_the_hull_and_one_in_the_bulwark_grid():
    """Was "two rows of the bulwark grid": the lower battery left the bulwark
    (the maintainer's ruling 2026-10-05, R4). The main row is cut in the HULL skin and
    served by Deck_Lower; only the waist row is in the grid."""
    assert [d.host for d in G.gun_decks] == ["hull", "bulwark"]
    assert [d.served_by for d in G.gun_decks] == ["Deck_Lower", "Deck_Main"]
    rows = profiles.gunport_rows(G)
    assert len(rows) == 1
    assert profiles.bulwark_row_offsets(G)[rows[0]] == pytest.approx(0.85)


def test_the_waist_bulwark_height_is_DERIVED_from_the_one_row_it_holds():
    """MAIN-DECK EDGE to WAIST RAIL CAP is not a chosen number: it is the waist
    row's sill (0.85, the largest whose reading 1.0 m inboard is <= 0.75), its
    aperture (0.62) and the timber over it (0.43), added up: 1.90. It was 2.45
    = 0.42 + 0.70 + 0.28 + 0.62 + 0.43 with both rows in the bulwark; the lower
    battery left the bulwark (the maintainer's ruling 2026-10-05, R4)."""
    (row,) = profiles.bulwark_gun_decks(G)
    over = G.bulwark_h - row.head
    assert row.sill == 0.85
    assert over == pytest.approx(0.43, abs=1e-9)
    assert row.sill + row.height + over == pytest.approx(G.bulwark_h)
    assert G.bulwark_h == pytest.approx(1.90)


def test_both_rows_clear_each_other_and_the_rail():
    """Measured from the MAIN-DECK EDGE, each row lifted by its own deck's
    rise: LOWER HEAD -2.00 + 0.83 + 0.70 = -0.47, under the gun deck's
    0.12 m planking; WAIST SILL +0.85; WAIST HEAD 1.47 under the cap 1.90."""
    G.validate()
    low, high = G.gun_decks
    rise = G.tier(low.served_by).rise
    assert rise + low.head == pytest.approx(-0.47)
    assert rise + low.head < -G.plank_thick
    assert rise + low.head < high.sill
    assert high.head < G.bulwark_h


# --- decks: four tiers, and one of them stands above the main rail ----------


def test_the_galleon_has_five_deck_tiers_where_the_frigate_has_three():
    """Was four: Deck_Lower, the lower gun deck inside the hull, is the
    fifth (the maintainer's ruling 2026-10-05, a TRUE lower gun deck)."""
    assert len(G.deck_tiers) == 5
    assert len(F.deck_tiers) == 3
    assert [t.name for t in G.deck_tiers] == [
        "Deck_Main", "Deck_Forecastle", "Deck_Quarter", "Deck_Poop",
        "Deck_Lower"]


def test_the_gun_deck_is_the_only_tier_that_does_not_stand_above_the_waist_rail():
    for tier in G.deck_tiers:
        if tier.rise <= 0.0:
            assert not tier.stands_above_the_main_rail()
        else:
            assert tier.stands_above_the_main_rail(), tier.name
            assert tier.rise > G.bulwark_h, tier.name


def test_every_castle_carries_a_rail_of_its_own():
    for tier in profiles.castle_tiers(G):
        assert tier.bulwark_h is not None and tier.bulwark_h > 0.8


def test_a_castle_wall_is_stepped_on_whatever_stands_under_it_not_on_the_waist():
    """The poop is over the quarterdeck for its whole length, so its wall's
    foot is the QUARTERDECK's rail cap. A wall run down to the waist rail two
    decks below would pass straight through the deck it stands on."""
    sz = profiles.sheer(G, 1.0)
    q = G.tier("Deck_Quarter")
    poop = G.tier("Deck_Poop")
    assert profiles.castle_foot_z(G, poop, 1.0) \
        == pytest.approx(sz + q.rise + q.bulwark_h, abs=1e-9)
    # The quarterdeck itself has nothing under it but the waist rail.
    assert profiles.castle_foot_z(G, q, 1.0) == pytest.approx(sz + G.bulwark_h, abs=1e-9)
    # And forward of the poop, the quarterdeck wall still stands on the waist.
    assert profiles.castle_foot_z(G, q, 0.60) \
        == pytest.approx(profiles.sheer(G, 0.60) + G.bulwark_h, abs=1e-9)


def test_the_forecastle_steps_up_clear_of_the_waist_rail_at_the_stem():
    f = G.tier("Deck_Forecastle")
    sz = profiles.sheer(G, 0.0)
    assert sz + f.rise == pytest.approx(7.45, abs=0.001)
    assert sz + f.rise + f.bulwark_h == pytest.approx(8.30, abs=0.001)
    # WAIST RAIL CAP to FORECASTLE DECK EDGE at the stem: 7.45 - 6.45 =
    # 1.00. It was 0.45; the waist cap dropped 0.55 m because the lower
    # battery left the bulwark, and the forecastle did not move.
    assert sz + f.rise - (sz + G.bulwark_h) == pytest.approx(1.00, abs=0.001)


def test_a_tier_above_the_main_rail_that_forgot_its_own_bulwark_is_rejected():
    bad = GalleonParams()
    poop = bad.tier("Deck_Poop")
    bad.deck_tiers = tuple(
        st.DeckTier(t.name, t.t0, t.t1, t.n_long, t.rise, None) if t is poop else t
        for t in bad.deck_tiers)
    with pytest.raises(ValueError, match="pokes through the rail"):
        bad.validate()


# --- the rig is modelled, and deliberately not built yet --------------------


def test_the_galleon_is_square_rigged_forward_with_a_LATEEN_mizzen():
    assert G.rig.mast("mizzen").sails[0].kind is st.SailKind.LATEEN
    assert G.rig.has_square_sails()


def test_the_galleon_is_built_as_far_as_its_MATERIALS_AND_UVS_and_says_so():
    """It SETS CANVAS, it is RIGGED, and it is now materialed and unwrapped.

    `passes` is not a list of names: it drives what gets built AND what gets
    checked, so a pass the ship does not name is a check that does not run,
    and both facts have to stay true together. `sails` and `rigging` were out
    of it because the lateen mizzen needed four running-rigging families
    nobody had written — a ship that claimed to be rigged without them would
    have been a ship with half a rig, and `ropes.unbuildable_families` said
    so by name. All four are written, so that gate came off.

    `materials` and `bake` were out for three reasons and all three are
    answered: `palette.family_of` did not know her five own objects, her
    materials would have carried the frigate's four names and therefore BEEN
    the frigate's four materials, and her atlases would have overwritten the
    frigate's shipped files. `bake` here is `bake.unwrap_all`, the UVs;
    `bake.bake_all` is not a build pass on any ship.
    """
    assert G.passes == ("hull", "bulwarks", "decks", "gunports",
                        "stern", "rudder", "rails", "headworks", "masts",
                        "sails", "rigging", "cannons", "furniture",
                        "dressing", "damage", "materials", "bake")
    # The maintainer's ruling (Task 8a): she is steered and armed, guns on both tiers.
    assert G.builds("rudder") and G.builds("cannons")
    assert G.builds("headworks") and G.builds("dressing")
    assert G.builds("masts")
    assert G.builds("sails") and G.builds("rigging")
    assert G.builds("materials") and G.builds("bake")
    # And the gate came off only because nothing is unbuildable any more.
    assert ropes.unbuildable_families(G) == []
    assert F.builds("masts") and F.passes is None


def test_the_galleon_runs_every_build_pass_there_is():
    """The maintainer's ruling (Task 8b): her deck furniture and her battle damage
    are in, so every pass `build._passes` knows runs on her. `budget` was
    never a pass: she has her own `GALLEON_BUDGET` (ledger open item 7),
    and `check_all` runs the budget check on her whatever `passes` says
    (tests/test_galleon_budget.py)."""
    assert G.builds("furniture") and G.builds("damage")
    assert "budget" not in G.passes


def test_the_galleon_builds_into_its_own_collection_so_it_cannot_clear_the_frigate():
    assert G.collection == "Galleon"
    assert F.collection == "Frigate"


def test_the_galleon_validates():
    G.validate()
