"""The sloop's rigging: the first gaff, gaff topsail and headsail ropes.

A gaff sail and the topsail over it lie in the centre plane and belly to
LEEWARD, so every rope that works them is led to WINDWARD of the cloth, or
along a spar, or over an edge -- never across the belly.
"""

import pytest

from frigate import profiles, ropes, sailplan, wind
from frigate.params import SloopParams

S = SloopParams()


def _ropes(kind):
    return [r for k, r in ropes.all_ropes(S) if k == kind]


def test_every_family_her_rig_names_is_drawn():
    assert ropes.unbuildable_families(S) == []
    assert S.rig.rope_kinds() <= set(ropes.kind_counts(S))


def test_each_headsail_is_hanked_to_a_stay_that_is_its_own_luff():
    stays = _ropes("stay")
    for sail in S.rig.headsails:
        c = sailplan.corners(S, None, sail)
        assert (c.throat, c.tack) in stays


def test_the_lee_gaff_vang_is_let_go():
    lee = ropes.lee_sign(S, 15.0)
    vangs = _ropes("vang")
    assert len(vangs) == 1
    assert all(pt[0] * lee <= 0.0 for pt in vangs[0])


def test_the_halyards_and_lift_stand_to_windward_of_the_canvas():
    for kind in ("peak_halyard", "topping_lift"):
        (rope,) = _ropes(kind)
        for pt in rope:
            assert pt[0] * ropes.lee_sign(S, pt[2]) < 0.0, kind


def test_one_sheet_a_headsail_led_to_leeward():
    sheets = _ropes("staysail_sheet")
    assert len(sheets) == len(S.rig.headsails)
    for rope in sheets:
        assert rope[-1][0] * ropes.lee_sign(S, rope[-1][2]) > 0.0


def test_her_colours_fly_from_her_one_mast():
    assert wind.flag_mast(S) == "main"
    staff = wind.flag_staff(S)
    # under the owner's pennant, which takes her one truck
    # (`tests/test_owner_colours.py`)
    from frigate import owner
    assert staff[2] == pytest.approx(
        profiles.mast_truck_z(S, "main") - owner.flag_drop(S))
    assert owner.flag_drop(S) > 0.0
