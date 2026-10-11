"""Masts come from the ship's own rig plan, not from three dicts keyed by name.

`MAST_TS = {"fore": ..., "main": ..., "mizzen": ...}` and seven more dicts
beside it made three masts a fact of the module. A schooner has two and a
lugger would have one. These tests drive the whole mast layer off
`p.rig`, and prove it by putting a TWO-masted ship through every function in
`profiles` that used to index those dicts.
"""

import math

import pytest

from frigate import profiles, shiptype as st
from frigate.params import FrigateParams

P = FrigateParams()


def _two_masted() -> FrigateParams:
    """The schooner's hull parameters are not settled, so this is the frigate's
    hull carrying the schooner's two-masted rig. It exercises the mast layer,
    which is the only thing under test here."""
    return FrigateParams(rig=st.SCHOONER_RIG)


# --- the frigate, unchanged -------------------------------------------------


def test_the_frigate_still_has_its_three_masts_in_the_same_order():
    assert profiles.mast_names(P) == ("fore", "main", "mizzen")


def test_the_frigates_mast_stations_are_unchanged():
    assert profiles.mast_t(P, "fore") == 0.184
    assert profiles.mast_t(P, "main") == 0.554
    assert profiles.mast_t(P, "mizzen") == 0.801


def test_the_frigates_mast_dimensions_come_through_the_plan_unchanged():
    assert profiles.mast_truck_z(P, "main") == pytest.approx(0.947 * P.loa)
    assert profiles.mast_radius(P, "fore") == 0.39
    assert profiles.mast_rake_deg(P, "mizzen") == 2.5
    assert profiles.top_span(P, "main") == 5.0
    assert profiles.channel_length(P, "main") == 3.6
    assert profiles.chainplate_count(P, "fore") == 5


# --- a two-masted ship goes through the same code ---------------------------


def test_a_two_masted_ship_reports_two_masts():
    assert profiles.mast_names(_two_masted()) == ("fore", "main")


def test_every_mast_function_answers_for_a_two_masted_ship():
    p = _two_masted()
    for name in profiles.mast_names(p):
        assert profiles.mast_truck_z(p, name) > 0.0
        assert profiles.mast_radius(p, name) > 0.0
        assert profiles.channel_length(p, name) > 0.0
        assert profiles.chainplate_count(p, name) >= 1
        assert math.isfinite(profiles.mast_rake_deg(p, name))


def test_asking_a_two_masted_ship_for_a_mizzen_is_a_loud_error_not_a_KeyError_on_a_dict():
    p = _two_masted()
    with pytest.raises(KeyError, match="mizzen"):
        profiles.mast_t(p, "mizzen")


def test_a_two_masted_ship_has_channels_and_chainplates_on_both_masts():
    p = _two_masted()
    for name in profiles.mast_names(p):
        aft, fwd = profiles.channel_span(p, name)
        assert fwd > aft
        assert len(profiles.chainplate_segments(p, name)) \
            == profiles.chainplate_count(p, name)


# --- a mast need not carry a fighting top -----------------------------------


def test_a_schooner_mast_carries_no_fighting_top_and_the_model_says_so():
    p = _two_masted()
    assert profiles.tops_on(p) == ()
    for name in profiles.mast_names(p):
        assert profiles.top_span(p, name) == 0.0


def test_the_frigate_carries_a_top_on_every_mast():
    assert profiles.tops_on(P) == ("fore", "main", "mizzen")


# --- the yards follow the sails, not a hardcoded three ----------------------


def test_the_frigate_still_carries_three_yards_to_a_mast():
    for name in profiles.mast_names(P):
        assert len(profiles.yard_specs(P, name)) == 3


def test_a_mast_with_no_square_sail_carries_no_yard():
    p = _two_masted()
    for name in profiles.mast_names(p):
        assert profiles.yard_specs(p, name) == []


def test_the_galleons_mizzen_carries_no_yard_because_its_sail_is_lateen():
    p = FrigateParams(rig=st.GALLEON_RIG)
    assert profiles.yard_specs(p, "mizzen") == []
    assert len(profiles.yard_specs(p, "main")) == 3
    assert len(profiles.yard_specs(p, "fore")) == 2
