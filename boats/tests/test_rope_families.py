"""The rope catalogue is driven by the rig, not by a square-rig assumption.

`ropes.PER_SIDE` listed fourteen families and `all_ropes` ran every one of
them against every mast. Eight of the fourteen hold a mast up and four of the
remaining six lead to a YARD — so on a schooner, which has no yard anywhere,
that loop would have drawn braces to nothing and left out every rope the ship
actually needs.
"""

import pytest

from frigate import profiles, ropes, shiptype as st
from frigate.params import FrigateParams, GalleonParams

P = FrigateParams()
SCHOONER = FrigateParams(rig=st.SCHOONER_RIG)
GALLEON = FrigateParams(rig=st.GALLEON_RIG)


# --- the frigate, unchanged -------------------------------------------------


def test_the_frigate_still_draws_every_rope_it_drew_before():
    counts = ropes.kind_counts(P)
    assert sum(counts.values()) == 552
    assert counts["brace"] == 18
    assert counts["stay"] == 9


def test_the_frigate_needs_nothing_this_module_cannot_draw():
    assert ropes.unbuildable_families(P) == []


# --- standing rigging follows the MASTS -------------------------------------


def test_the_standing_families_that_need_a_fighting_top_are_marked_as_such():
    needs_top = {k for k, _fn, t in ropes.STANDING_PER_SIDE if t}
    assert needs_top == {"topmast_shroud", "futtock", "topgallant_shroud",
                         "topmast_ratline", "topgallant_backstay"}


def test_a_mast_with_no_fighting_top_gets_no_futtock_fan():
    """A futtock shroud hangs under the RIM of a top. On a mast with no top
    there is no rim, and the old loop would have hung it off nothing."""
    assert not GALLEON.rig.mast("mizzen").has_top()
    mizzen = ropes.families_for_mast(GALLEON, "mizzen")["standing"]
    assert "futtock" not in mizzen and "topmast_shroud" not in mizzen
    assert "shroud" in mizzen and "backstay" in mizzen, "it still has to be held up"
    main = ropes.families_for_mast(GALLEON, "main")["standing"]
    assert "futtock" in main, "a mast that HAS a top still gets its fan"


def test_every_frigate_mast_gets_all_fourteen_families_as_it_always_did():
    for name in profiles.mast_names(P):
        fams = ropes.families_for_mast(P, name)
        assert len(fams["standing"]) == 8
        assert len(fams["running"]) == 7


def test_the_galleons_lateen_mizzen_gets_shrouds_but_no_brace():
    """It has no yard and no top, and it still has to be held up.

    THE `running == []` THIS TEST USED TO ASSERT WAS THE TRAP. Both
    `families_for_mast` and `all_ropes` gated running rigging on
    `square = bool(profiles.square_sails_on(p, mast))` — "is this a square
    mast", used as "does this mast have canvas to work" — so a mast setting a
    lateen and nothing else got NO running rigging at all, including the four
    families a lateen is the whole reason for. A green suite said so happily.
    """
    assert len(ropes.lower_shrouds(GALLEON, "mizzen", 1.0)) \
        == GALLEON.rig.mast("mizzen").chainplates
    assert ropes.braces(GALLEON, "mizzen", 1.0) == []
    # It gets no SQUARE family, because it sets no square sail...
    running = ropes.families_for_mast(GALLEON, "mizzen")["running"]
    for square_only in ("brace", "lift", "footrope", "stirrup", "clewline",
                        "buntline", "sheet"):
        assert square_only not in running
    # ...and it gets every LATEEN family, because it sets a lateen.
    assert sorted(running) == ["lateen_halyard", "lateen_sheet",
                               "lateen_tack", "vang"]


def test_the_galleon_would_draw_fewer_braces_than_the_frigate_having_fewer_yards():
    """Frigate: 9 yards, 2 braces each. Galleon: 2 + 3 + 0 = 5 yards."""
    assert ropes.kind_counts(P)["brace"] == 2 * 9
    galleon_braces = sum(len(ropes.braces(GALLEON, m, sign))
                         for m in profiles.mast_names(GALLEON)
                         for sign in (-1.0, 1.0))
    assert galleon_braces == 2 * 5


# --- running rigging follows the SAILS --------------------------------------


def test_the_rig_names_the_running_families_it_needs_and_the_frigates_are_square():
    assert P.rig.rope_kinds() == frozenset(
        ("brace", "lift", "footrope", "stirrup", "clewline", "buntline", "sheet"))


def test_the_schooners_gaff_and_headsail_families_are_all_drawn_now():
    """The sloop is the first built ship to set a gaff sail and headsails,
    and her families were written for her: throat and peak halyards, the
    topping lift, the boom sheet and the gaff's own vang; the headsails'
    halyard, downhaul and sheet. A schooner sets the same kinds, so nothing
    she needs is left undrawn."""
    assert ropes.unbuildable_families(SCHOONER) == []


def test_a_schooners_rigging_draws_every_family_her_rig_names():
    drawn = set(ropes.kind_counts(SCHOONER))
    assert SCHOONER.rig.rope_kinds() <= drawn


def test_the_galleons_four_lateen_families_are_all_drawn_now():
    """A lateen's families are halyard, tack, sheet and vang. They were the
    first new running rigging anyone had to write; all four now exist."""
    assert ropes.unbuildable_families(GALLEON) == []
    assert GALLEON.rig.rope_kinds() >= frozenset(
        ("lateen_halyard", "lateen_tack", "lateen_sheet", "vang"))


def test_a_GAFF_vang_and_a_LATEEN_vang_are_drawn_by_their_own_builders():
    """BUILDABILITY IS PER SAIL KIND, because a family name does not fix its
    geometry. A lateen's vang leads from the PEAK of one long raking yard; a
    gaff's from the peak of a gaff over a boom. The gaff's was written for
    the sloop, as its own builder, not credited from the galleon's."""
    lateen = dict(ropes.RUNNING_PER_SIDE[st.SailKind.LATEEN])["vang"]
    gaff = dict(ropes.RUNNING_PER_SIDE[st.SailKind.GAFF])["vang"]
    assert lateen is ropes.lateen_vangs
    assert gaff is ropes.gaff_vangs
    assert "vang" in ropes.buildable_for(st.SailKind.GAFF)
    assert "vang" in ropes.buildable_for(st.SailKind.LATEEN)


def test_a_rope_family_with_a_builder_is_never_reported_as_unbuildable():
    for family in ropes.BUILDABLE:
        assert family not in ropes.unbuildable_families(P)
        assert family not in ropes.unbuildable_families(GALLEON)


def test_every_rig_in_the_registry_can_be_drawn():
    """Stated rather than discovered. The galleon's lateen rigging was the
    first new running rigging; the sloop's gaff, gaff topsail and headsail
    families were the last, and with them the schooner's rig can be drawn
    too."""
    drawable = {name: not ropes.unbuildable_families(FrigateParams(rig=rig))
                for name, rig in st.SHIP_RIGS.items()}
    assert drawable == {"frigate": True, "man_o_war": True,
                        "galleon": True, "flute": True,
                        "sloop": True, "schooner": True}


# --- the four lateen families, with both endpoints of every rope named -------
#
# The galleon's mizzen, measured. The spar is `profiles.lateen_spar`:
#   HEEL/TACK (0, -7.669, 10.339) at station t 0.7256, over the quarterdeck
#   SLINGS    (0, -10.682, 13.249) at t 0.8142, where it crosses its own mast
#   PEAK      (0, -17.711, 20.037) abaft the taffrail at -17.000
# and the canvas's one derived corner is
#   CLEW      (0, -15.502, 12.424) at t 0.9559, over the poop

GAL = GalleonParams()


def test_the_halyard_is_bent_to_the_SLINGS_and_leads_to_its_own_masthead():
    """SLINGS to HALYARD BLOCK, both abaft the spar they lead past.

    A lateen halyard hoists the yard by its slings, so it is bent there and
    not at the heel. It is CENTRELINE — one rope, not a pair.
    """
    (rope,) = ropes.lateen_halyards(GAL, "mizzen")
    _heel, slings, _peak, r_yard = profiles.lateen_spar(GAL, "mizzen")
    low, high = rope
    assert low[0] == 0.0 and high[0] == 0.0, "the halyard is centreline"
    assert low[2] == pytest.approx(slings[2], abs=1e-9)
    # Abaft the yard's own skin at the slings, not buried in it.
    assert low[1] == pytest.approx(
        slings[1] - r_yard - ropes.LATEEN_ROPE_CLEAR, abs=1e-9)
    # The block is up at its own masthead, above the slings it hoists.
    assert high[2] == pytest.approx(
        ropes.LATEEN_HALYARD_HEAD * profiles.mast_truck_z(GAL, "mizzen"), abs=1e-9)
    assert high[2] > low[2]
    assert high[2] < profiles.mast_truck_z(GAL, "mizzen")


def test_the_tack_hauls_the_HEEL_down_and_FORWARD_to_the_deck():
    """HEEL to DECK, the deck being the one uppermost at the tack's station.

    Down AND forward: a tack that led straight down would not hold the heel
    forward, which is the whole job. Centreline, like the halyard.
    """
    (rope,) = ropes.lateen_tacks(GAL, "mizzen")
    heel, _slings, _peak, _r = profiles.lateen_spar(GAL, "mizzen")
    head, foot = rope
    assert head == pytest.approx(heel, abs=1e-9)
    assert foot[0] == 0.0, "the tack is centreline"
    assert foot[1] > heel[1], "FORWARD of the heel (aft is -y)"
    assert foot[2] < heel[2], "and DOWN"
    # It lands on a deck and not in mid-air or inside one.
    t_foot = profiles.t_of_y(GAL, foot[1])
    assert foot[2] == pytest.approx(
        profiles.deck_spot(GAL, t_foot, 0.0)[2], abs=1e-9)


def test_the_sheet_leads_the_CLEW_down_to_the_POOP_RAIL_a_side():
    """CLEW to RAIL BLOCK, and the rail is read with `rail_top_z`.

    THE LATEEN SHEET IS `rail_top_z`'s FIRST GALLEON CONSUMER, which is why
    DEFECT 2 — the poop invisible to that reader — had to be fixed before
    this rope could be led anywhere. A PAIR, port and starboard, so the sail
    can be sheeted on either tack.
    """
    port = ropes.lateen_sheets(GAL, "mizzen", -1.0)
    stbd = ropes.lateen_sheets(GAL, "mizzen", 1.0)
    assert len(port) == 1 and len(stbd) == 1
    (clew_p, foot_p), = port
    (clew_s, foot_s), = stbd
    assert clew_p == pytest.approx(clew_s, abs=1e-12), "one clew, two sheets"
    assert foot_p[0] < 0.0 < foot_s[0]
    assert foot_p[0] == pytest.approx(-foot_s[0], abs=1e-12)
    # The foot is ON the rail cap at its own station, over the POOP.
    t_foot = profiles.t_of_y(GAL, foot_s[1])
    assert foot_s[2] == pytest.approx(profiles.rail_top_z(GAL, t_foot), abs=1e-9)
    assert profiles._rail_tier_at(GAL, t_foot).name == "Deck_Poop"
    assert foot_s[1] < clew_s[1], "led AFT of the clew"
    assert foot_s[2] < clew_s[2], "and DOWN"


def test_the_vang_steadies_the_PEAK_to_the_rail_a_side():
    """PEAK to RAIL BLOCK. A PAIR, which is what a vang is.

    The peak stands abaft the taffrail, so both vangs lead FORWARD and down
    to the quarters — a vang led aft of a peak that already overhangs would
    have nothing to set up to.
    """
    port = ropes.lateen_vangs(GAL, "mizzen", -1.0)
    stbd = ropes.lateen_vangs(GAL, "mizzen", 1.0)
    (peak_p, foot_p), = port
    (peak_s, foot_s), = stbd
    _h, _s2, peak, _r = profiles.lateen_spar(GAL, "mizzen")
    assert peak_p == pytest.approx(peak, abs=1e-9)
    assert peak_s == pytest.approx(peak, abs=1e-9)
    assert foot_p[0] == pytest.approx(-foot_s[0], abs=1e-12)
    assert foot_s[0] > 0.0
    assert foot_s[1] > peak[1], "FORWARD of the peak, which overhangs"
    assert foot_s[2] < peak[2], "and far below it"
    t_foot = profiles.t_of_y(GAL, foot_s[1])
    assert foot_s[2] == pytest.approx(profiles.rail_top_z(GAL, t_foot), abs=1e-9)


def test_a_ship_that_sets_no_lateen_draws_none_of_the_four():
    for mast in profiles.mast_names(P):
        assert ropes.lateen_halyards(P, mast) == []
        assert ropes.lateen_tacks(P, mast) == []
        for sign in (-1.0, 1.0):
            assert ropes.lateen_sheets(P, mast, sign) == []
            assert ropes.lateen_vangs(P, mast, sign) == []


def test_the_galleons_whole_rope_catalogue_now_draws_and_counts_its_lateen():
    """Four families, six ropes: a halyard, a tack, two sheets and two vangs."""
    counts = ropes.kind_counts(GAL)
    assert counts["lateen_halyard"] == 1
    assert counts["lateen_tack"] == 1
    assert counts["lateen_sheet"] == 2
    assert counts["vang"] == 2
    # And the square masts are untouched: 5 yards, 2 braces each.
    assert counts["brace"] == 10


def test_every_rope_the_galleon_draws_has_a_ribbon_STYLE():
    """A family with no style entry is a `KeyError` in `build_rigging`, which
    is a crash in Blender for something a pure test can see."""
    for kind, _rope in ropes.all_ropes(GAL):
        assert kind in ropes.ROPE_STYLE, f"{kind} has no ribbon style"
    for kind, _rope in ropes.all_ropes(P):
        assert kind in ropes.ROPE_STYLE


def test_the_lateens_ropes_are_RUNNING_rigging_and_the_straightness_rule_knows():
    for family in ("lateen_halyard", "lateen_tack", "lateen_sheet", "vang"):
        assert family in ropes.RUNNING
