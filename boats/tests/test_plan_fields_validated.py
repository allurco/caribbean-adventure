"""The third ruling's plan fields are refused in `ShipParams.validate`.

Final review 3, M-6: `castle_channels`, `between_ports`,
`wales_between_rows` and `chase_platform` were refused late -- at draw or
material-build time, or as a bare IndexError (`chasers[0]`), or not at
all (a misspelt mast in `castle_channels` was silently ignored). Each is
now refused where the other cross-field rules live, by name. The frigate
and the galleon validate unchanged.
"""

import dataclasses

import pytest

from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


def _rails(**kw):
    return dataclasses.replace(
        G, rail_form=dataclasses.replace(G.rail_form, **kw))


def test_both_ships_validate_unchanged():
    F.validate()
    G.validate()


def test_a_castle_channel_on_a_mast_she_does_not_have_is_refused():
    bad = _rails(castle_channels=(("mizen", "Deck_Quarter", 4.62),))
    with pytest.raises(ValueError, match="castle channel.*'mizen'"):
        bad.validate()


def test_a_castle_channel_on_a_tier_she_does_not_have_is_refused():
    bad = _rails(castle_channels=(("mizzen", "Deck_Qarter", 4.62),))
    with pytest.raises(ValueError, match="castle channel.*'Deck_Qarter'"):
        bad.validate()


def test_a_castle_channel_on_a_tier_inside_the_bulwark_is_refused():
    bad = _rails(castle_channels=(("mizzen", "Deck_Main", 4.62),))
    with pytest.raises(ValueError, match="castle channel.*castle wall"):
        bad.validate()


def test_a_castle_channel_needs_a_positive_drop():
    bad = _rails(castle_channels=(("mizzen", "Deck_Quarter", 0.0),))
    with pytest.raises(ValueError, match="castle channel.*drop"):
        bad.validate()


def test_a_mast_has_one_castle_channel():
    bad = _rails(castle_channels=(("mizzen", "Deck_Quarter", 4.62),
                                  ("mizzen", "Deck_Poop", 4.62)))
    with pytest.raises(ValueError, match="castle channel.*twice"):
        bad.validate()


def test_a_damage_band_between_ports_of_a_row_she_does_not_have():
    bad = dataclasses.replace(G, damage_form=dataclasses.replace(
        G.damage_form, between_ports="orlop"))
    with pytest.raises(ValueError, match="between_ports.*'orlop'"):
        bad.validate()


def test_a_damage_band_between_ports_cut_in_the_bulwark_is_refused():
    waist = next(d.name for d in G.gun_decks if d.host == "bulwark")
    bad = dataclasses.replace(G, damage_form=dataclasses.replace(
        G.damage_form, between_ports=waist))
    with pytest.raises(ValueError, match="between_ports.*hull timber"):
        bad.validate()


def test_wales_between_rows_need_a_hull_row_and_a_bulwark_row():
    bad = dataclasses.replace(F, livery_form=dataclasses.replace(
        F.livery_form, wales_between_rows=True))
    with pytest.raises(ValueError, match="wales_between_rows"):
        bad.validate()


def test_a_chase_platform_on_a_ship_with_no_chasers_is_refused():
    bad = dataclasses.replace(G, chase_ports=0)
    with pytest.raises(ValueError, match="chase platform.*no stern chasers"):
        bad.validate()
