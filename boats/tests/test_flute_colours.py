"""The flute wears no national ensign. No bpy.

The maintainer's ruling: a ship's flags are the OWNER's colours and nothing
else, so the flute does not fly false Dutch colours, nor the Red Ensign she
was built with. Her flag (`Jolly_Roger`) keeps its one state, the device, and
carries no second, switchable ensign state: no parked island in the canvas
atlas and no `TEXCOORD_1` on the flag in her file. Since #163 the other ships
follow her (`test_no_national_ensigns.py`); a ship given an ensign explicitly
still gets the two states, which is what these tests compare her against.
"""

import pytest

from frigate import colours, shiptype as st
from frigate.params import FluteParams, FrigateParams

L = FluteParams()
# A frigate given the Red Ensign by hand: no ship ships like this any more,
# but the two-state machinery is still the generator's and is pinned here.
E = FrigateParams(ensign=st.EnsignKind.RED_ENSIGN)


def test_the_flute_wears_no_national_ensign():
    assert L.ensign is None
    L.validate()


def test_a_ship_given_an_ensign_carries_it():
    E.validate()
    assert colours.carries_ensign(E)
    assert not colours.carries_ensign(L)


def test_the_flute_s_colours_have_one_state_the_device():
    assert colours.states_of(L) == (colours.device_state(),)
    assert colours.states_of(E) == colours.STATES


def test_her_flag_declares_no_switchable_uv_set():
    assert colours.switchable_uv_sets("Jolly_Roger", L) == {}
    assert colours.switchable_uv_sets("Jolly_Roger", E) == {
        "TEXCOORD_1": ["Jolly_Roger"]}


def test_her_canvas_atlas_is_copied_only_when_there_is_a_second_state():
    """The bake's order on the canvas atlas: the copy for the ensign's
    island is taken only on a ship that has one."""
    assert colours.colour_bake_order(E) == {
        "albedo": ["measured", "colours_copied", "colours_painted", "saved"],
        "normal": ["measured", "colours_copied", "colours_painted", "saved"],
        "roughness": ["measured", "colours_copied", "saved"],
    }
    assert colours.colour_bake_order(L) == {
        "albedo": ["measured", "colours_painted", "saved"],
        "normal": ["measured", "colours_painted", "saved"],
        "roughness": ["measured", "saved"],
    }


def test_a_ship_whose_ensign_is_not_an_ensign_is_refused():
    with pytest.raises(ValueError):
        FrigateParams(ensign="dutch").validate()
