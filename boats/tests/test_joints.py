"""Task 1 (interpenetration): which object pairs may share space, and why.

Pure — imports no bpy. `checks.check_intersections` does the BVH work; the
table of what is a JOINT and what is a DEFECT is arithmetic-free policy, and
policy that lives only inside an in-Blender check cannot be unit tested.
"""

import pytest

from frigate.params import FrigateParams, GalleonParams
from frigate import budget, joints


def test_an_instanced_object_collapses_to_its_family():
    assert joints.family("Cannon_07") == "Cannon_"
    assert joints.family("PortLid_23") == "PortLid_"
    assert joints.family("Deck_Main") == "Deck_Main"
    assert joints.family("Jolly_Roger") == "Jolly_Roger"


def test_a_pair_reads_the_same_whichever_way_round_it_is_asked():
    for a, b in joints.JOINTS:
        assert joints.verdict(a, b, 1) == joints.verdict(b, a, 1)
    assert joints.verdict("Hull", "Bulwarks", 262).ok
    assert joints.verdict("Bulwarks", "Hull", 262).ok


def test_the_three_reported_defects_are_not_allowed():
    """The live complaint. Each of these must read as a defect, not a joint."""
    for a, b in (("Rigging", "Bulwarks"), ("Sails", "Sail_Patches"),
                 ("Barrel_", "Cannon_")):
        assert not joints.verdict(a, b, 1).ok
        assert not joints.verdict(a, b, 1).allowed_by


def test_an_unlisted_pair_is_a_defect_until_someone_rules_on_it():
    assert not joints.verdict("Hull", "Masts", 1).ok


def test_a_recorded_deviation_passes_at_its_cap_and_fails_above_it():
    cap, _why = joints.DEVIATIONS[joints.pair("Deck_Quarter", "PortLid_")]
    assert joints.verdict("Deck_Quarter", "PortLid_", cap).ok
    assert not joints.verdict("Deck_Quarter", "PortLid_", cap + 1).ok


def test_a_top_may_not_touch_the_canvas_that_hangs_ahead_of_it():
    """`Sails x Tops` and `Sail_Patches x Tops` were deviations capped at 110
    and 20 face pairs. The lower tops are cut away forward of their masts now,
    so neither pair may have a single face pair: they must read as DEFECTS,
    not as deviations with a smaller cap. A deviation that merely shrinks is
    still a deviation."""
    for other in ("Sails", "Sail_Patches"):
        assert joints.pair(other, "Tops") not in joints.DEVIATIONS
        assert not joints.verdict(other, "Tops", 1).ok
        assert not joints.verdict(other, "Tops", 1).allowed_by


def test_no_pair_is_both_a_joint_and_a_deviation():
    assert not set(joints.JOINTS) & set(joints.DEVIATIONS)


def test_every_reason_says_why_rather_than_merely_that():
    for table in (joints.JOINTS, joints.DEVIATIONS):
        for key, value in table.items():
            why = value if isinstance(value, str) else value[1]
            assert len(why) > 20, key


# Every ship that is built. A name is checked against HER budget, not the
# frigate's alone: `Beakhead_Deck` is claimed by the galleon's budget only,
# and `FRIGATE_LINES` is verbatim and SHA-1 pinned, so it must never be
# edited to make a galleon-only joint pass.
SHIPS = (FrigateParams(), GalleonParams())


def _claims(p, name: str) -> bool:
    """Whether ship `p`'s budget has a line for object `name`."""
    if name.endswith("_"):
        name += "00"
    try:
        budget.component_of(p, name)
    except ValueError:
        return False
    return True


def _assert_some_ship_builds_both(a: str, b: str) -> None:
    """Two objects can only meet on a ship whose budget claims them both."""
    assert any(_claims(p, a) and _claims(p, b) for p in SHIPS), (
        f"no shipped ship's budget claims both {a!r} and {b!r}: "
        + "; ".join(f"{p.collection} claims {a!r} {_claims(p, a)}, "
                    f"{b!r} {_claims(p, b)}" for p in SHIPS))


def test_every_object_named_in_the_table_spends_a_budget_line():
    """A typo in a name would silently allow nothing, and silently allow the
    real pair to keep failing. Every family here must be an object the build
    actually emits, which `budget.component_of` is the register of — on a
    ship that builds BOTH objects of the pair."""
    for a, b in list(joints.JOINTS) + list(joints.DEVIATIONS):
        _assert_some_ship_builds_both(a, b)


def test_only_a_stay_a_LATEEN_HALYARD_and_a_VANG_may_touch_canvas():
    """Three kinds, and each has its own reason. Nothing else has one.

    A STAY: every SQUARE sail is set `wind.sail_fwd` FORWARD of its own mast
    and every stay leaves the mast AXIS, so a centreline stay must cross the
    canvas plane of some sail on its way forward.

    A LATEEN HALYARD: a lateen's canvas lies in the ship's own CENTRE plane —
    `check_sails` asserts every corner on x = 0 and the plane normal
    athwartships — and the halyard is rove on that same centreline from the
    slings up to a block at the masthead. Two things in one plane meet. It is
    the same joint twice over, too: the halyard is bent to the SLINGS and the
    sail's HEAD is the spar those slings are on.

    A LATEEN VANG: a CORNER contact, not a crossing. It is bent to the PEAK,
    which is a corner of the canvas as well as the end of the yard; Blender
    measured its contact at y -17.71..-16.98, z 18.90..20.04, the peak.

    Shrouds, ratlines, braces and BACKSTAYS have no such excuse and must pass
    clear: a backstay through a lateen's belly is fixed by casting off the lee
    pair, never by excusing it here.
    """
    assert joints.CANVAS_CONTACT_KINDS == ("stay", "lateen_halyard", "vang")
    for excused in ("shroud", "ratline", "brace", "lift", "clewline",
                    "lateen_sheet", "lateen_tack", "backstay",
                    "topgallant_backstay"):
        assert excused not in joints.CANVAS_CONTACT_KINDS


# --- WHICH WAY the overlap goes --------------------------------------------
#
# `verdict` counts intersecting face pairs and cannot tell a scar cut INTO the
# planking from one bulging OUT of it. These cover the ruling that can.


def test_the_direction_table_is_internally_consistent():
    joints.validate_directions()


def test_every_direction_rules_on_a_pair_that_is_already_a_joint():
    for d in joints.DIRECTIONS:
        assert d.key in joints.JOINTS, d


def test_every_object_named_in_the_direction_table_spends_a_budget_line():
    for d in joints.DIRECTIONS:
        _assert_some_ship_builds_both(d.member, d.host)


def test_a_pair_finds_its_direction_whichever_way_round_it_is_asked():
    assert joints.directions_for("Damage", "Hull") == \
        joints.directions_for("Hull", "Damage")
    assert len(joints.directions_for("Damage", "Hull")) == 1


def test_the_shot_scar_is_ruled_cut_into_the_hull():
    rule, = joints.directions_for("Damage", "Hull")
    assert rule.member == "Damage" and rule.host == "Hull"
    assert rule.mode == joints.INTO


def _scar_rule():
    rule, = joints.directions_for("Damage", "Hull")
    return rule


def test_a_scar_that_bulges_out_of_the_planking_is_caught():
    """THE MUTATION. These are the numbers measured on the shipped ship:
    117 Damage vertices at the Hull surface, the deepest 0.197 m in and the
    proudest 0.151 m OUT. `check_intersections` called this a ruled joint
    because the face-pair count is the same either way round."""
    v = joints.direction_verdict(_scar_rule(), 117, 0.197, 0.151)
    assert not v.ok
    assert "PROUD" in v.complaint and "0.151" in v.complaint


def test_a_scar_that_is_properly_cut_in_passes():
    """The same crater, driven in instead of out: deeper, and nothing proud."""
    assert joints.direction_verdict(_scar_rule(), 117, 0.200, 0.004).ok


def test_the_direction_rule_does_not_fire_on_a_recessed_scar_at_its_tolerance():
    rule = _scar_rule()
    assert joints.direction_verdict(rule, 117, 0.200, rule.tol).ok
    assert not joints.direction_verdict(rule, 117, 0.200, rule.tol + 1e-6).ok


def test_an_into_rule_does_not_care_how_deep_the_member_goes():
    """Being let in is the point; only standing proud is the defect."""
    rule = _scar_rule()
    assert joints.direction_verdict(rule, 117, 5.0, 0.0).ok


def test_the_splinters_keep_the_rule_that_matches_them():
    """`Bulwarks x Damage` is 'the splinters stand where the rail and bulwark
    were shot away'. Standing 0.415 m proud of a shot-away rail is correct, so
    the rule must be ON and must not complain about proud at all."""
    rule, = joints.directions_for("Damage", "Bulwarks")
    assert rule.mode == joints.ON
    assert joints.direction_verdict(rule, 60, 0.006, 0.415).ok
    assert not joints.direction_verdict(rule, 60, 0.415, 0.006).ok


def test_an_on_rule_catches_a_member_sunk_into_its_host():
    """The anchor, measured: its fluke was 0.226 m inside the bow planking it
    is supposed to LIE AGAINST."""
    rule, = joints.directions_for("Anchor_", "Hull")
    assert rule.mode == joints.ON
    assert not joints.direction_verdict(rule, 94, 0.226, 0.097).ok
    assert joints.direction_verdict(rule, 94, 0.030, 0.097).ok


def test_a_member_that_crosses_without_touching_is_neither_into_nor_on():
    p = FrigateParams()
    for rule in joints.DIRECTIONS:
        tol = joints.resolve_tol(rule, p)
        assert not joints.direction_verdict(rule, 0, 0.0, 0.0, tol).ok


def test_a_tolerance_that_is_a_measurement_resolves_off_the_SHIP_not_a_constant():
    """'a deck edge let in deeper than the timber it is let into has come out
    of the ship's side' is the rule. 0.180 was the frigate's instance of it."""
    rule = next(d for d in joints.DIRECTIONS
                if (d.member, d.host) == ("Deck_Main", "Bulwarks"))
    assert rule.tol == "bulwark_thick"
    assert joints.resolve_tol(rule, FrigateParams()) == 0.18
    assert joints.resolve_tol(rule, GalleonParams()) == 0.22


def test_resolving_a_tolerance_is_NOT_optional_when_it_names_a_measurement():
    rule = next(d for d in joints.DIRECTIONS
                if (d.member, d.host) == ("Deck_Main", "Bulwarks"))
    with pytest.raises(ValueError, match="resolve_tol"):
        joints.direction_verdict(rule, 10, 0.0, 0.0)


def test_a_tier_conditioned_ruling_applies_to_one_ship_and_not_the_other():
    """A frigate's forecastle is let into the WAIST bulwark; a galleon's is a
    castle deck let into its own castle wall. Same member name, two joints."""
    inside = next(d for d in joints.DIRECTIONS
                  if (d.member, d.host) == ("Deck_Forecastle", "Bulwarks"))
    castle = next(d for d in joints.DIRECTIONS
                  if (d.member, d.host) == ("Deck_Forecastle", "Castle_Forecastle"))
    f, g = FrigateParams(), GalleonParams()
    assert joints.applies_to(inside, f) and not joints.applies_to(castle, f)
    assert joints.applies_to(castle, g) and not joints.applies_to(inside, g)


def test_a_ruling_with_no_tier_condition_applies_to_every_ship():
    rule = next(d for d in joints.DIRECTIONS
                if (d.member, d.host) == ("Bulwarks", "Hull"))
    assert rule.tier_inside is None
    for p in (FrigateParams(), GalleonParams()):
        assert joints.applies_to(rule, p)


def test_a_direction_may_not_be_both_ruled_and_excused():
    assert not {d.key for d in joints.DIRECTIONS} & set(joints.UNRULED_DIRECTIONS)


def test_every_excused_direction_is_excused_about_a_real_joint():
    for key in joints.UNRULED_DIRECTIONS:
        assert key in joints.JOINTS


def test_a_direction_on_an_unruled_pair_is_refused():
    """A direction without a joint rules on nothing, and would read as cover."""
    bad = joints.Direction("Hull", "Masts", joints.INTO, 0.01, "x" * 50)
    original = joints.DIRECTIONS
    joints.DIRECTIONS = original + (bad,)
    try:
        with pytest.raises(ValueError, match="not a ruled joint"):
            joints.validate_directions()
    finally:
        joints.DIRECTIONS = original


def test_a_tolerance_wide_enough_to_hide_a_defect_is_refused():
    """This project has been caught widening tolerances. A direction whose
    tolerance is no longer a joint clearance must not validate."""
    rule = _scar_rule()
    wide = joints.Direction(rule.member, rule.host, rule.mode, 0.25, rule.why)
    original = joints.DIRECTIONS
    joints.DIRECTIONS = tuple(wide if d is rule else d for d in original)
    try:
        with pytest.raises(ValueError, match="not a joint clearance"):
            joints.validate_directions()
    finally:
        joints.DIRECTIONS = original


# --- a CORNER contact is bounded to its corner ------------------------------
#
# `vang` is excused from "nothing but a stay passes through canvas" because it
# is bent to the lateen's PEAK. The excuse must hold AT the peak only: a vang
# driven through the belly abaft the slings is a crossing, and must fail.
#
# The two fixtures are Blender's own measurements on the galleon rebuilt at
# 8c21587, as world-space quads over each face's measured extent on the
# lateen's centre plane x = 0: the face the vangs touch (y -17.71..-16.98,
# z 18.90..20.04) and the face the weather backstay crossed in the belly
# before the lee pair was cast off (y -12.14..-10.93, z 11.83..13.29).

VANG_FACE = [(0.0, -17.71, 18.90), (0.0, -16.98, 18.90),
             (0.0, -16.98, 20.04), (0.0, -17.71, 20.04)]
BELLY_FACE = [(0.0, -12.14, 11.83), (0.0, -10.93, 11.83),
              (0.0, -10.93, 13.29), (0.0, -12.14, 13.29)]


def _vang_width():
    from frigate import ropes
    return ropes.ROPE_STYLE["vang"][0]


def test_a_vang_is_excused_at_the_peak_and_nowhere_else():
    assert joints.CANVAS_CORNER_KINDS == {"vang": "peak"}


def test_the_vangs_corner_is_the_lateens_real_peak():
    from frigate import sailplan
    G = GalleonParams()
    mizzen = G.rig.mast("mizzen")
    lateen = next(s for s in mizzen.sails if s.name == "lateen_mizzen")
    peak = sailplan.corners(G, "mizzen", lateen).peak
    assert joints.canvas_corners(G, "vang") == [peak]
    # the frigate sets no sail that a vang works, so she has no such corner
    assert joints.canvas_corners(FrigateParams(), "vang") == []


def test_a_vang_touching_the_face_at_the_peak_passes():
    corners = joints.canvas_corners(GalleonParams(), "vang")
    assert joints.off_corner([VANG_FACE], corners, _vang_width()) == []


def test_a_vang_touching_the_belly_abaft_the_slings_fails_naming_both_ends():
    corners = joints.canvas_corners(GalleonParams(), "vang")
    strays = joints.off_corner([VANG_FACE, BELLY_FACE], corners,
                               _vang_width())
    assert len(strays) == 1
    vertex, corner, dist = strays[0]
    assert vertex == (0.0, -12.14, 13.29)
    assert corner == corners[0]
    # 8.7499 m between the belly face's nearest vertex (0, -12.14, 13.29)
    # and the lateen's peak (0, -17.7113, 20.0370)
    assert dist == pytest.approx(8.7499, abs=5e-5)
    text = joints.off_corner_text("vang", strays[0], _vang_width())
    assert "m between" in text and "peak" in text
    assert "(0.0000, -12.1400, 13.2900)" in text
    assert "(0.0000, -17.7113, 20.0370)" in text
