"""Task 11 — where the 24 guns and their port lids stand. Pure, no bpy."""

import math

import pytest

from frigate.params import FrigateParams
from frigate import profiles


@pytest.fixture
def p():
    return FrigateParams()


def test_the_battery_is_twenty_four_guns(p):
    placements = profiles.gun_placements(p)
    assert len(placements) == 24
    assert sum(1 for g in placements if g["kind"] == "broadside") == 22
    assert sum(1 for g in placements if g["kind"] == "chase") == 2


def test_every_gun_stands_on_a_deck_not_in_the_air(p):
    for gun in profiles.gun_placements(p):
        x, y, z = gun["origin"]
        t = profiles.t_of_y(p, y)
        assert z == pytest.approx(profiles.deck_z_at(p, t, gun["carriage_x"], 0.0))


def test_the_broadside_is_mirror_symmetric(p):
    guns = [g for g in profiles.gun_placements(p) if g["kind"] == "broadside"]
    stbd = sorted((g for g in guns if g["yaw_deg"] == 0.0), key=lambda g: g["origin"][1])
    port = sorted((g for g in guns if g["yaw_deg"] == 180.0), key=lambda g: g["origin"][1])
    assert len(stbd) == len(port) == 11
    for a, b in zip(stbd, port):
        assert a["origin"][0] == pytest.approx(-b["origin"][0])
        assert a["origin"][1] == pytest.approx(b["origin"][1])
        assert a["origin"][2] == pytest.approx(b["origin"][2])


def test_every_muzzle_stands_outside_its_own_port(p):
    for gun in profiles.gun_placements(p):
        assert gun["muzzle_out"] == pytest.approx(profiles.GUN_MUZZLE_OUT)


def test_no_gun_breech_crosses_the_centreline(p):
    """The forwardmost ports sit where the gun deck is only 1.91 m half-wide.
    A gun too long for that station would push its breech past the keel and
    through its opposite number."""
    for gun in profiles.gun_placements(p):
        if gun["kind"] != "broadside":
            continue
        breech_x = gun["origin"][0]
        assert abs(breech_x) > 0.0
        assert breech_x * (1.0 if gun["yaw_deg"] == 0.0 else -1.0) > 0.0


def test_a_barrel_lies_close_to_the_centre_of_its_own_port(p):
    """Span: barrel axis to port centre. The carriage is shared geometry, so the
    trunnion height is one number for all 24 guns while deck camber varies
    0.08-0.18 m across the battery; the axis cannot be exact everywhere."""
    for gun in profiles.gun_placements(p):
        if gun["kind"] != "broadside":
            continue
        t = profiles.t_of_y(p, gun["origin"][1])
        axis_z = gun["origin"][2] + profiles.GUN_TRUNNION_H
        assert abs(axis_z - profiles.port_center_z(p, t, 0)) < 0.06


def test_the_two_chasers_point_aft_through_the_transom(p):
    chasers = [g for g in profiles.gun_placements(p) if g["kind"] == "chase"]
    assert len(chasers) == 2
    for gun in chasers:
        assert gun["yaw_deg"] == pytest.approx(-90.0)
        muzzle_y = gun["origin"][1] - profiles.GUN_LENGTH
        assert muzzle_y == pytest.approx(
            profiles.station_y(p, 1.0) - profiles.GUN_MUZZLE_OUT
        )
    assert chasers[0]["origin"][0] == pytest.approx(-chasers[1]["origin"][0])


def test_a_chaser_still_stands_on_the_gun_deck(p):
    """Deck_Main runs t 0.04..0.96. A chaser whose carriage fell aft of that
    would be standing on nothing."""
    for gun in profiles.gun_placements(p):
        if gun["kind"] == "chase":
            assert profiles.t_of_y(p, gun["origin"][1]) < 0.96


def test_there_is_one_lid_for_every_port(p):
    assert len(profiles.lid_placements(p)) == 24


def test_every_lid_hinges_on_its_own_port_head(p):
    heads = set()
    for t in profiles.gunport_ts(p, 0):
        heads.add(round(profiles.sheer(p, t) + p.gun_decks[0].sill + p.gun_decks[0].height, 6))
    for lid in profiles.lid_placements(p):
        if lid["kind"] != "broadside":
            continue
        assert round(lid["hinge"][2], 6) in heads


def test_lids_overlap_the_aperture_they_cover(p):
    assert profiles.LID_W > p.gun_decks[0].width
    assert profiles.LID_H > p.gun_decks[0].height


def test_every_lid_is_swung_open(p):
    for lid in profiles.lid_placements(p):
        assert 30.0 < lid["open_deg"] < 90.0


def test_lid_and_gun_counts_agree_port_by_port(p):
    guns = profiles.gun_placements(p)
    lids = profiles.lid_placements(p)
    gun_ys = sorted(round(g["origin"][1], 4) for g in guns if g["kind"] == "broadside")
    lid_ys = sorted(round(x["hinge"][1], 4) for x in lids if x["kind"] == "broadside")
    assert gun_ys == lid_ys


def test_the_hinge_is_the_HEAD_of_its_own_port_and_never_the_sill(p):
    """The maintainer's screenshot read as lids hanging oddly below each port, so this
    pins the edge they hang FROM. Both ends of the measurement named: the lid's
    hinge line, and the head (top) of the aperture it closes.

    On a ship of this date a broadside port lid is hinged at the HEAD and
    triced up by a tackle; a bottom-hinged lid is a half-port or a sweep port,
    not a gun port. `test_every_lid_hinges_on_its_own_port_head` already checks
    the hinge is at SOME port head; this checks it is at its OWN, and that it
    is nowhere near its own sill.
    """
    lids = [x for x in profiles.lid_placements(p) if x["kind"] == "broadside"]
    assert lids
    for lid in lids:
        t = profiles.t_of_y(p, lid["hinge"][1])
        sheer = profiles.sheer(p, t)
        head = sheer + p.gun_decks[0].sill + p.gun_decks[0].height
        sill = sheer + p.gun_decks[0].sill
        assert lid["hinge"][2] == pytest.approx(head, abs=1e-6)
        assert lid["hinge"][2] - sill == pytest.approx(p.gun_decks[0].height, abs=1e-6)


def test_the_lid_hangs_below_its_hinge_which_is_what_top_hinged_means(p):
    """A lid swung `LID_OPEN_DEG` from shut: its free edge must end up BELOW
    the hinge and OUTBOARD of it. Hinged at the sill instead, the same swing
    would carry the free edge ABOVE the hinge and across the aperture."""
    drop = profiles.LID_H * math.sin(math.radians(90.0 - profiles.LID_OPEN_DEG))
    out = profiles.LID_H * math.cos(math.radians(90.0 - profiles.LID_OPEN_DEG))
    assert drop == pytest.approx(0.322, abs=5e-4), "free edge below the hinge"
    assert out == pytest.approx(0.797, abs=5e-4), "free edge outboard of it"
    assert drop < p.gun_decks[0].height, "a triced-up lid does not hang past its own sill"
