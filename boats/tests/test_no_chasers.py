"""A ship may carry NO stern chasers.

`chase_u_edges` always answered two ports, so `chase_ports` was a count that
could only ever be 2: a ship asking for none got two cut anyway, and
`check_gunports` then failed her for having them. The flute's stern is 0.32
of her beam wide at the taffrail, and two 0.70 m ports and their carriages
do not fit across it beside the carving; a fluyt carried her few guns in
the waist. So 0 is a count a ship may state, and 2 stays the frigate's.
"""

import pytest

from frigate import profiles
from frigate.params import FluteParams, FrigateParams

F = FrigateParams()
NONE = FluteParams().with_(chase_ports=0)


def test_a_ship_with_no_chasers_has_no_chase_ports():
    assert profiles.chase_u_edges(NONE) == []


def test_her_guns_are_her_broadsides_alone():
    guns = profiles.gun_placements(NONE)
    # `total_broadside_ports` already counts both sides
    assert len(guns) == profiles.total_broadside_ports(NONE)
    assert all(g["kind"] == "broadside" for g in guns)
    assert len(profiles.lid_placements(NONE)) == len(guns)


def test_her_transom_panel_has_no_port_columns():
    assert profiles.transom_us(NONE) == [-1.0, 0.0, 1.0]
    assert profiles.transom_bands(NONE) == []


def test_the_frigate_keeps_her_two():
    assert F.chase_ports == 2
    assert len(profiles.chase_u_edges(F)) == 2


def test_any_count_but_none_or_two_is_refused_by_name():
    with pytest.raises(ValueError, match="chase_ports"):
        FluteParams().with_(chase_ports=1).validate()
