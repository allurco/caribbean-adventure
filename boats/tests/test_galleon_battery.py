"""Task 8a — the galleon's battery on both gun tiers. Pure, no bpy.

The maintainer's ruling: the cannons are enabled on the galleon, guns on
BOTH tiers, the hull row's on `Deck_Lower` and the bulwark row's on
`Deck_Main`. Every figure below names both of its endpoints.
"""

import pytest

from frigate import profiles
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()


def test_on_the_frigates_carriage_her_barrels_drag_on_their_sills():
    """The RED this task started from, kept as a measurement: BARREL
    UNDERSIDE to PORT SILL on a 0.83 m carriage, 0.018-0.042 m INTO it."""
    worst = max(c["sill"] for c in profiles.barrel_clearances(G, 0.83))
    assert worst < 0.0


def test_centred_in_her_ports_her_waist_muzzles_strike_their_open_lids():
    """1.07 m, the middle of CARRIAGE FLOOR to PORT CENTRE over her 42
    ports, puts every waist-row BARREL TOP 0.050 m into its OPEN LID."""
    waist = [c["lid"] for c in profiles.barrel_clearances(G, 1.07)
             if c["kind"] == "broadside"
             and profiles.gun_deck(G, c["deck"]).host == "bulwark"]
    assert len(waist) == 18 and max(waist) < 0.0


@pytest.mark.parametrize("p", [F, G], ids=["frigate", "galleon"])
def test_every_barrel_passes_between_its_sill_and_its_open_lid(p):
    """EVERY gun `gun_placements` emits, the chasers included (fix round
    1: they were left out, and hers stood 0.502 m UNDER their chase sill,
    the whole barrel through the transom planking)."""
    clear = profiles.barrel_clearances(p)
    assert len(clear) == len(profiles.gun_placements(p))
    assert sum(c["kind"] == "chase" for c in clear) == p.chase_ports
    for c in clear:
        assert c["sill"] > 0.0 and c["lid"] > 0.0, c


def test_the_frigate_keeps_her_carriage():
    assert F.gun_trunnion_h == profiles.GUN_TRUNNION_H == 0.83


def test_her_carriage_leaves_the_most_room_on_the_tighter_side():
    """Her trunnion is the height, to the centimetre, that maximises the
    smaller of SILL and LID clearance over all 42 broadside ports."""
    def worst(th):
        return min(min(c["sill"], c["lid"])
                   for c in profiles.barrel_clearances(G, th)
                   if c["kind"] == "broadside")
    best = max((i / 1000.0 for i in range(700, 1200)), key=worst)
    assert G.gun_trunnion_h == round(best, 2)
    assert worst(G.gun_trunnion_h) > 0.055   # 0.0585 at 42 m, 0.068 at 34


# --- check_cannons' keys: the frigate's read as they shipped ---------------


def test_the_frigates_battery_keys_read_as_they_shipped():
    from frigate import checklist
    assert checklist.battery_key(F) == "24 guns and 24 lids"
    assert checklist.lid_swing_key(F) == \
        "every lid swings outboard and down from its hinge"


def test_her_battery_key_counts_both_rows_and_the_chasers_from_her_rows():
    """42 broadside apertures (12 a side in the hull, 9 a side in the
    bulwark, check_gunports) plus her 2 chase ports: 44 of each."""
    from frigate import checklist
    assert checklist.battery_key(G) == (
        "44 guns and 44 lids: 24 in the hull row, 18 in the bulwark row "
        "and 2 at the chase ports")


def test_her_lid_key_says_the_hull_lids_swing_from_a_leaning_shut():
    """Task 6 concern 6: a hull lid shuts on a skin leaning 13.7-22.5 deg
    and swings the ruled 68 deg from THERE, so open it stands 8.3 deg below
    to 0.5 deg above the horizontal; "down" is a frigate assumption."""
    from frigate import checklist
    assert checklist.lid_swing_key(G) == (
        "every lid swings outboard, 68 deg from where it hangs shut "
        "(24 hull lids shut leaning out with the skin)")


# --- what her battery is allowed to touch ----------------------------------


@pytest.mark.parametrize("a, b", [
    ("Cannon_03", "Deck_Lower"),     # a hull-row carriage on its own deck
    ("PortLid_05", "Hull"),          # a hull-row lid hinged in the skin
    ("PortLid_05", "Ceiling_Lower"),  # ... and on the port's lining
])
def test_her_lower_battery_joints_are_ruled(a, b):
    from frigate import joints
    assert joints.pair(a, b) in joints.JOINTS


def test_a_lower_gun_stands_ON_its_deck_by_the_upper_guns_tolerance():
    """Brief: `Cannon_ x Deck_Lower` ON, same tolerance as on Deck_Main."""
    from frigate import joints
    rules = {(d.member, d.host): d for d in joints.DIRECTIONS}
    lower = rules[("Cannon_", "Deck_Lower")]
    upper = rules[("Cannon_", "Deck_Main")]
    assert lower.mode == upper.mode == joints.ON
    assert lower.tol == upper.tol


@pytest.mark.parametrize("a, b", [
    ("Cannon_42", "Transom"), ("Cannon_42", "Stern_Carving"),
    ("Cannon_42", "Hull"), ("Cannon_42", "Chase_Platform"),
    ("Cannon_00", "Bulwarks"), ("Cannon_00", "Ceiling_Lower"),
])
def test_a_gun_through_timber_is_NOT_ruled(a, b):
    """A barrel through timber is a defect, not a joint: a pair found here
    must FAIL, and on her rebuilt scene none of them is found at all (the
    chasers' through their re-cut ports, Task 8a fix round 1).

    CHANGED ON PURPOSE (Task 11, the maintainer's third ruling A'): `Cannon_ x
    Hull` is back on this list. It had left it as a capped DEVIATION
    (question A': the chasers' after carriages INSIDE her hull's top abaft
    Deck_Main's end); the chasers now stand on a Chase_Platform under an
    opened hull top and Blender measures 0 pairs. A chaser through the
    platform's planking is not ruled either."""
    from frigate import joints
    assert joints.pair(a, b) not in joints.JOINTS
    assert joints.pair(a, b) not in joints.DEVIATIONS


def test_her_deviations_are_capped_at_what_she_measures():
    """What is now true on her scene: exactly ONE deviation, the aft three
    mizzen shrouds a side through the poop's walls, Castle_Poop x Rigging
    14 (question B'), and no Cannon_ x Transom or Stern_Carving pair exists
    to rule on at all.

    CHANGED ON PURPOSE (Task 9): Deck_Quarter x Rigging 18 (question B)
    and Chainplates x PortLid_ 32 (question A) are retired, both at 0
    measured pairs, by the maintainer's third ruling. CHANGED ON PURPOSE (Task 11):
    Cannon_ x Hull 44 (question A') is retired the same way, the chasers
    on their chase platform (tests/test_galleon_chase_platform.py)."""
    from frigate import joints
    caps = {k: cap for k, (cap, _why) in joints.DEVIATIONS.items()}
    galleon = {k for k in caps if k != joints.pair("Deck_Quarter",
                                                   "PortLid_")}
    # CHANGED ON PURPOSE (the 42 m hull): Ceiling_Lower x Damage 18, two
    # scars between her hull ports through her side's inner planking.
    assert galleon == {joints.pair("Castle_Poop", "Rigging"),
                       joints.pair("Ceiling_Lower", "Damage")}
    assert joints.pair("Deck_Quarter", "Rigging") not in caps
    assert joints.pair("Chainplates", "PortLid_") not in caps
    assert joints.pair("Cannon_42", "Hull") not in caps
    assert caps[joints.pair("Castle_Poop", "Rigging")] == 14
    # fix round 1: Deck_Poop x Rigging (24) is its old joint again,
    # re-measured beside the mast, not a deviation
    assert joints.pair("Deck_Poop", "Rigging") not in caps


def test_the_lid_through_its_strap_deviation_is_RETIRED():
    """CHANGED ON PURPOSE (Task 9, the maintainer's third ruling A). This pair was a
    capped DEVIATION, question A for the maintainer: the straps of hull ports 6
    and 11 a side ran inside their lids' 0.08 m overhang with the STRAP
    FOOT (z 2.481) under the PORT HEAD (z 2.636), 32 face pairs. The drop
    is now 2.20, derived, every foot beside the hull row stops at least
    `strap_clear` 0.04 over its port head and every strap clears every
    hull lid's sweep by 0.0457 m or more; Blender measures 0 pairs. The
    pair is UNRULED again, so any contact at all FAILS."""
    from frigate import joints
    key = joints.pair("Chainplates", "PortLid_12")
    assert key not in joints.JOINTS
    assert key not in joints.DEVIATIONS
    assert not joints.verdict("Chainplates", "PortLid_22", 1).ok


# --- the lid check is consistent on the frigate by construction ------------


def _tip_dir(lid):
    """HINGE to TIP of a lid as `cannons` builds it: local +X pitched by
    `profiles.lid_pitch_deg` about Y, then yawed by `yaw_deg` about Z (the
    same XYZ Euler `cannons._place` applies)."""
    import math
    p_ = math.radians(profiles.lid_pitch_deg(lid))
    y_ = math.radians(lid["yaw_deg"])
    return (math.cos(p_) * math.cos(y_), math.cos(p_) * math.sin(y_),
            -math.sin(p_))


@pytest.mark.parametrize("p", [F, G], ids=["frigate", "galleon"])
def test_every_lid_swings_its_own_open_deg_from_where_it_hangs_shut(p):
    """`check_cannons` judges HINGE to TIP against HINGE to SHUT TIP within
    0.01 deg. The frigate is never rebuilt, so this proves the stricter
    check holds on her by construction: the swing the builder applies IS
    every placement's `open_deg`, plumb or leaning."""
    import math
    for lid in profiles.lid_placements(p):
        tip = _tip_dir(lid)
        lean = math.radians(lid.get("lean_deg", 0.0))
        if lid["kind"] == "broadside":
            out = (math.copysign(1.0, lid["hinge"][0]), 0.0, 0.0)
        else:
            out = (0.0, -1.0, 0.0)
        shut = (out[0] * math.sin(lean), out[1] * math.sin(lean),
                -math.cos(lean))
        dot = sum(a * b for a, b in zip(tip, shut))
        swing = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
        assert swing == pytest.approx(lid["open_deg"], abs=0.01), lid
        assert sum(a * b for a, b in zip(tip, out)) > 0.0


# --- her chase ports, measured above the deck at the gun -------------------


def test_the_frigate_keeps_her_chase_sill_on_the_sheer_at_the_transom():
    sz = profiles.sheer(F, 1.0)
    row = profiles.gun_deck(F, profiles.chase_deck_index(F))
    assert F.stern_form.chase_sill_datum == "sheer"
    assert profiles.chase_sill_z(F) == sz + row.sill
    assert profiles.chase_head_z(F) == sz + row.head
    assert profiles.transom_row_offsets(F) == profiles.bulwark_row_offsets(F)


def test_her_chase_ports_stand_where_her_chasers_are():
    """Controller ruling (fix round 1). DECK AT THE GUN (the chasers'
    carriage floor at their breech, 5.331 m over the waterline;
    it was 5.336 before the ports came down: the chasers now stand 0.068 m
    further outboard on the wider transom, where the camber is lower) to CHASE
    SILL is 0.75, inside her rows' band; the port is her bulwark row's 0.62
    tall. Over the WATERLINE: CHASE SILL 6.081, CHASE HEAD 6.701 (they
    were 6.65 and 7.27 on the sheer at the transom, 5.80)."""
    floor = profiles.chase_floor_z(G)
    chasers = [g for g in profiles.gun_placements(G) if g["kind"] == "chase"]
    for gun in chasers:
        assert gun["origin"][2] == pytest.approx(floor, abs=1e-9)
    assert floor == pytest.approx(5.490, abs=5e-4)
    sill, head = profiles.chase_sill_z(G), profiles.chase_head_z(G)
    assert sill - floor == pytest.approx(0.75)
    lo, hi = profiles.gun_deck(G, profiles.chase_deck_index(G)).sill_band
    assert lo <= sill - floor <= hi
    assert sill == pytest.approx(6.240, abs=5e-4)
    assert head == pytest.approx(6.860, abs=5e-4)
    sz = profiles.sheer(G, 1.0)
    assert profiles.transom_row_offsets(G) == pytest.approx(
        [0.0, sill - sz, head - sz, G.bulwark_h])


def test_a_chase_sill_off_its_rows_band_is_refused():
    import dataclasses
    bad = G.with_(stern_form=dataclasses.replace(G.stern_form,
                                                 chase_sill=0.80))
    with pytest.raises(ValueError, match="chase sill"):
        bad.validate()
