"""The sloop: a small, fast single-master, pirate-converted.

What makes a sloop a sloop, against the frigate, the galleon and the flute,
with both endpoints of every figure named:

  * SMALL: stem-at-the-rail to taffrail 18 m, inside the issue's 15-20 m,
    against the flute's 30, the galleon's 34 and the frigate's 38;
  * ONE MAST, raking aft, setting a GAFF MAINSAIL with a GAFF TOPSAIL over
    it, and two headsails on a LONG bowsprit: the Jamaica sloop of the
    1710s-20s, which is what the Caribbean's pirates sailed most;
  * a LOW, FLUSH deck and a handful of light guns in the bulwark.
"""

import pytest

from frigate import profiles, shiptype as st
from frigate.params import (FluteParams, FrigateParams, GalleonParams,
                            SloopParams)

S = SloopParams()
OTHERS = (FluteParams(), GalleonParams(), FrigateParams())


def test_she_is_a_ship_type_of_her_own_with_her_own_collection():
    assert S.collection == "Sloop"
    assert S.asset_stem == "sloop"
    S.validate()


def test_she_is_the_smallest_of_the_fleet_by_every_principal_dimension():
    assert 15.0 <= S.loa <= 20.0
    for other in OTHERS:
        assert S.loa < other.loa
        assert S.beam < other.beam
        assert S.draft < other.draft


def test_waterline_to_rail_cap_amidships_is_low():
    """WATERLINE to WAIST RAIL CAP amidships, against her own length: the
    frigate's is 11.3% and the sloop's is lower still."""
    rail = profiles.sheer(S, 0.5) + S.bulwark_h
    assert rail == pytest.approx(2.00, abs=1e-9)
    assert rail / S.loa < 0.113


def test_one_mast_setting_a_gaff_mainsail_and_a_gaff_topsail():
    assert S.rig.mast_names() == ("main",)
    kinds = [s.kind for s in S.rig.mast("main").sails]
    assert kinds == [st.SailKind.GAFF, st.SailKind.GAFF_TOPSAIL]
    assert not S.rig.has_square_sails()
    assert S.rig.tops() == ()


def test_two_headsails_on_a_bowsprit_longer_than_half_her_hull():
    assert [s.kind for s in S.rig.headsails] == [st.SailKind.STAYSAIL] * 2
    assert S.rig.bowsprit.projection / S.loa >= 0.55


def test_her_deck_is_low_and_near_flush():
    for tier in S.raised_tiers():
        assert tier.rise <= 0.35
        assert not tier.stands_above_the_main_rail()


def test_a_handful_of_light_guns_in_the_bulwark():
    assert len(S.gun_decks) == 1 and S.gun_decks[0].host == "bulwark"
    assert profiles.total_broadside_ports(S) == 8
    assert S.chase_ports == 0


def test_each_outer_headsail_tacks_further_out_and_is_hoisted_higher():
    """So no two headsails' luffs cross: JIB TACK forward of the
    FORESTAYSAIL TACK on the bowsprit, and JIB HEAD over the FORESTAYSAIL
    HEAD up the mast."""
    from frigate import sailplan
    inner, outer = (sailplan.corners(S, None, s)
                    for s in sorted(S.rig.headsails, key=lambda s: s.tier))
    assert outer.tack[1] > inner.tack[1]
    assert outer.throat[2] > inner.throat[2]


def test_her_foremost_guns_breeches_stand_clear_of_each_other():
    guns = profiles.gun_placements(S)
    assert min(abs(g["origin"][0]) for g in guns) > 0.45
