"""No ship wears a national ensign. No bpy.

The maintainer's ruling (#158 decision 6, #163): a ship's flags are the
OWNER's colours and nothing else. The flute was the first to lose her false
colours; the frigate's Red Ensign, the sloop's Red Ensign and the galleon's
Cross of Burgundy go the same way. Every flag (`Jolly_Roger`, the part the
game tints) keeps its one state, the device, with no switchable second state:
no parked island in the canvas atlas and no `TEXCOORD_1` on the flag.

The ensigns' drawing in `colours.py` stays as a library (its own tests pin
it); it is simply no longer any ship's.
"""

import pytest

from frigate import colours
from frigate.params import (FluteParams, FrigateParams, GalleonParams,
                            SloopParams)

SHIPS = {
    "frigate": FrigateParams(),
    "galleon": GalleonParams(),
    "flute": FluteParams(),
    "sloop": SloopParams(),
}


@pytest.mark.parametrize("name", sorted(SHIPS))
def test_no_ship_wears_a_national_ensign(name):
    p = SHIPS[name]
    assert p.ensign is None, name
    assert not colours.carries_ensign(p), name
    p.validate()


@pytest.mark.parametrize("name", sorted(SHIPS))
def test_every_flag_has_one_state_the_device(name):
    assert colours.states_of(SHIPS[name]) == (colours.device_state(),)


@pytest.mark.parametrize("name", sorted(SHIPS))
def test_no_flag_declares_a_switchable_uv_set(name):
    assert colours.switchable_uv_sets("Jolly_Roger", SHIPS[name]) == {}


@pytest.mark.parametrize("name", sorted(SHIPS))
def test_no_canvas_atlas_takes_a_copy_for_an_ensign_island(name):
    assert colours.colour_bake_order(SHIPS[name]) == {
        "albedo": ["measured", "colours_painted", "saved"],
        "normal": ["measured", "colours_painted", "saved"],
        "roughness": ["measured", "saved"],
    }
