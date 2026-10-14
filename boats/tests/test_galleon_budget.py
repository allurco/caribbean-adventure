"""The galleon's own triangle budget, and the ship-wide checks that judge her.

The maintainer's ruling: she gets her OWN budget, 20-35% above the frigate's 46,000,
for ornate stern galleries, tumblehome curvature and the beakhead. Every line
below is derived from what she ACTUALLY DRAWS plus what is still absent, and
both ends of every figure are named.

THE SPEND IS TRIANGLES, not faces. `GALLEON_SCENE` is the per-object triangle
count the ledger recorded for her build at e3fc7ea (30 objects, 30,592
triangles), plus the beakhead deck Task 5 added (31 objects). The
scratchpad's faces file counts BASE-MESH faces, which run 5-8x
under the drawn triangles on the subdivided hull and decks; a budget line
sized off it would have been sized off the wrong quantity.
"""

import re
from pathlib import Path

import pytest

from frigate import budget, head, rig, ropes, rudder, profiles, texbudget
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()
# HER, WITH THE TWO PASSES TASK 8b ADDED HELD BACK. Every pass runs on her
# now, so the machinery that NAMES a line her passes leave empty is proved
# on this copy of her rather than left untested.
G_SKIP = G.with_(passes=tuple(x for x in G.passes
                              if x not in ("furniture", "damage")))

# Her 34 objects as built with the lower gun deck (the maintainer's ruling
# 2026-10-05): the 31 built before it, plus `Deck_Lower` and the ceiling
# `Ceiling_Lower` inboard of the hull row, plus `Beakhead_Grating`, the
# beakhead flight's grating cards (Task 7).
GALLEON_OBJECTS = (
    "Hull", "Bulwarks", "Castle_Forecastle", "Castle_Quarter", "Castle_Poop",
    "Deck_Main", "Deck_Forecastle", "Deck_Quarter", "Deck_Poop", "Transom",
    "Stern_Gallery", "Stern_Carving", "Channels", "Chainplates", "Headrails",
    "Beakhead", "Beakhead_Deck", "Beakhead_Grating", "Masts", "Tops",
    *(f"Yard_{i:02d}" for i in range(5)),
    "Lateen_Mizzen", "Bowsprit", "Sails", "Rigging", "Figurehead",
    "Jolly_Roger", "Sail_Patches", "Deck_Lower", "Ceiling_Lower",
    # Task 8a, the maintainer's ruling: the rudder, and the battery on both tiers --
    # 42 broadside guns (24 in the hull row, 18 in the bulwark row) and 2
    # stern chasers, each with its lid.
    "Rudder",
    *(f"Cannon_{i:02d}" for i in range(44)),
    *(f"PortLid_{i:02d}" for i in range(44)),
    # Task 8b, the maintainer's ruling: her deck furniture on her own plan, and her
    # battle damage.
    "Deck_Furniture", "Wheel", "Gratings", "Damage",
    *(f"Barrel_{i:02d}" for i in range(8)),
    *(f"Anchor_{i:02d}" for i in range(2)),
    *(f"Lantern_{i:02d}" for i in range(3)),
    # Task 11, the maintainer's third ruling A': the chase platform under the stern
    # chasers.
    "Chase_Platform",
    # The owner's colours (issue #134).
    "Pennant", "Hull_Stripe", "Sail_Band",
)

# TRIANGLES, per object, read off `build.rebuild(GalleonParams())` in
# Blender with the lower gun deck built: 33 objects, 35,352 triangles. It
# replaces the ledger's 30,952 at e3fc7ea: the hull loft gained a station at
# every hull port edge and a ring point at the hull row's sill and head
# (9,520 -> 14,176), the bulwark lost the lower row (3,830 -> 2,150), the
# castle walls stepped on a waist cap 0.55 m lower grew (812 -> 972) and the
# transom panel under it shrank (244 -> 188), and ten more ratlines rig the
# longer lower shrouds (886 -> 906). Task 9: the mizzen channel up on the
# quarterdeck castle shortens the mizzen shrouds, eight ratlines fewer
# (906 -> 890), read off the rebuilt scene; the total was 52,684. Task 10:
# the knee falling with the rail (Headrails 484 -> 532) and the unsplit
# flight one station short of the carving (Beakhead_Deck 432 -> 144,
# Beakhead_Grating 18 -> 6), from the pure counters `check_head` holds the
# scene to; the total is 52,432. Task 11: the chase platform draws 92
# (profiles.chase_platform_triangles) and the hull's two closing quads
# opened over it take 16 out of the subdivided Hull (14,176 -> 14,160),
# read off the rebuilt scene; the total was 52,508. Final review 3 (I-2):
# the platform carried to the skin and the end cap below the sheer and the
# riser under Deck_Main's end, Chase_Platform 92 -> 148; the total is
# 52,564.
GALLEON_SCENE = {
    "Hull": 14688, "Bulwarks": 2206, "Ceiling_Lower": 748,
    "Castle_Forecastle": 204, "Castle_Quarter": 564, "Castle_Poop": 204,
    "Deck_Main": 716, "Deck_Forecastle": 284, "Deck_Quarter": 428,
    "Deck_Poop": 248, "Deck_Lower": 572,
    "Transom": 188, "Stern_Gallery": 3536, "Stern_Carving": 2732,
    "Channels": 168, "Chainplates": 360, "Headrails": 532, "Beakhead": 24,
    # Task 10: the unsplit flight. 12 frame timbers at 12 apiece
    # (head.beakhead_deck_triangles) and 3 grating cards at 2 apiece
    # (head.beakhead_grating_triangles); the split flight drew 432 and 18,
    # and seven planks 364 before it.
    "Beakhead_Deck": 144, "Beakhead_Grating": 6,
    "Masts": 684, "Tops": 1080,
    **{f"Yard_{i:02d}": 136 for i in range(5)},
    "Lateen_Mizzen": 112, "Bowsprit": 108,
    # 2,592 on the canvas grid, less the 7 quads (14 triangles) her damage
    # pass tears out.
    "Sails": 2578, "Jolly_Roger": 80,
    # The mizzen's lee pair of backstays is cast off on a mast setting a
    # lateen (`ropes.cast_off_to_lee`). Derived below.
    "Rigging": 1010,
    "Figurehead": 960, "Sail_Patches": 252,
    # Task 8a, read off `build.rebuild(GalleonParams())` with `rudder` and
    # `cannons` in her passes: 123 objects, 46,318 triangles. The rudder is
    # its own loft (rudder.triangle_count); every gun is ONE shared 232-
    # triangle mesh and every lid ONE shared 12-triangle box, drawn 44 times
    # each.
    "Rudder": 144,
    **{f"Cannon_{i:02d}": 232 for i in range(44)},
    **{f"PortLid_{i:02d}": 12 for i in range(44)},
    # Task 8b, read off `build.rebuild(GalleonParams())` with `furniture`
    # and `damage` in her passes: 140 objects, 52,700 triangles. Repeated
    # fittings share one mesh each and are drawn once per object.
    "Deck_Furniture": 866, "Wheel": 488, "Gratings": 684, "Damage": 162,
    **{f"Barrel_{i:02d}": 156 for i in range(8)},
    **{f"Anchor_{i:02d}": 1180 for i in range(2)},
    **{f"Lantern_{i:02d}": 196 for i in range(3)},
    "Chase_Platform": 104,
    # The owner's colours (issue #134): her masthead pennant and her hull
    # stripe on her lower wale, each a plain white material of its own.
    "Pennant": 24, "Hull_Stripe": 470,
    # ...and the band across her main course, two sheets of 18 x 2 quads.
    "Sail_Band": 144,
}

# Every pass label `build._passes` knows, read off its source because the
# module imports bpy.
BUILD_SRC = (Path(__file__).parent.parent / "frigate" / "build.py").read_text()
PASS_LABELS = set(re.findall(r'\("([a-z]+)", ',
                             BUILD_SRC.split("def _passes")[1]
                             .split("def rebuild")[0]))


def test_the_pass_labels_were_read():
    assert {"hull", "cannons", "furniture", "rudder", "damage",
            "headworks", "bake"} <= PASS_LABELS


# --- her table ---------------------------------------------------------------


def test_the_scene_is_54114_triangles_in_144_objects():
    """Measured in Blender. 35,438 in 34 objects before Task 8a (35,352 in
    33 with the lower gun deck built; the split beakhead flight put 432 + 18
    where the planked stub drew 364, and added `Beakhead_Grating`); the
    rudder adds 144 and the battery 44 x 232 + 44 x 12 = 10,736, 46,318 in
    123. Task 8b's furniture adds 6,234 in 16 objects (with the Gratings),
    her damage 162 in one, and the tears take 14 out of the canvas: 52,700.
    Task 9's shorter mizzen shrouds take 16 out of the rigging: 52,684.
    Task 10's knee and unsplit flight: Headrails +48, Beakhead_Deck -288,
    Beakhead_Grating -12, 52,432. Task 11's chase platform +92 and the
    hull's top opened over it -16: 52,508. Final review 3's platform to
    the skin and end cap with its riser +56: 52,564. The owner's sail band
    (#134) +144 in one: 54,114 in 144. See
    `GALLEON_SCENE`."""
    assert len(GALLEON_OBJECTS) == len(set(GALLEON_OBJECTS)) == 144
    assert set(GALLEON_SCENE) == set(GALLEON_OBJECTS)
    assert sum(GALLEON_SCENE.values()) == 54114
    assert GALLEON_SCENE["Chase_Platform"] \
        == profiles.chase_platform_triangles(G)
    # each opened closing quad is 4 quads, 8 triangles, under the subsurf
    assert 14704 - GALLEON_SCENE["Hull"] \
        == 8 * len(profiles.hull_open_top_bands(G))
    assert GALLEON_SCENE["Headrails"] == head.headrail_triangles(G)
    assert GALLEON_SCENE["Rudder"] == rudder.triangle_count(G)
    assert GALLEON_SCENE["Beakhead_Deck"] == head.beakhead_deck_triangles(G)
    assert GALLEON_SCENE["Beakhead_Grating"] \
        == head.beakhead_grating_triangles(G)


def test_she_carries_her_own_budget_and_the_frigate_keeps_hers():
    assert G.budget is budget.GALLEON_BUDGET
    assert F.budget is budget.FRIGATE_BUDGET
    assert G.budget is not F.budget


def test_her_target_is_20_to_35_percent_over_the_frigates():
    """59,200 over the frigate's 46,000 is 28.7%. It was 58,000 (26.1%)
    until her lower gun deck (the maintainer's ruling 2026-10-05) put the hull line
    over its band and it was re-derived from what she draws, 15,000 to
    19,000; the 4,000 came out of her surplus under the 63,000 ceiling.
    62,000 fell by 500 when the rails line was re-derived from the split
    beakhead flight (Task 7), 2,000 to 1,500. 61,500 fell by 2,000 when
    the furniture and dressing lines were re-derived from what her
    furniture and damage passes draw (Task 8b), 7,000 to 5,600 and 2,000
    to 1,400. 59,500 fell by 200 when the cannons line was rounded up to
    the hundred over what it draws, as every other re-derived line is,
    11,000 to 10,800 (controller ruling, final fix wave 2). 59,300 fell
    by 200 when the rails line was re-derived from the unsplit flight over
    a knee falling with the rail (the maintainer's third ruling, E and F), 1,500 to
    1,300. 59,100 rose by 100 when the decks line was re-derived for the
    chase platform (the maintainer's third ruling, A'), 3,000 to 3,100."""
    assert 46000 * 1.20 <= G.budget.total <= 46000 * 1.35
    assert G.budget.total == 59200
    budget.validate_rules(G)


def test_her_ceiling_keeps_the_frigates_proportion_over_target_and_says_so():
    """The frigate's 50,000 stands 8.7% over her 46,000. 58,000 x 50/46 is
    63,043; rounded DOWN, so her margin is not wider than the frigate's."""
    assert G.budget.ceiling == 63000
    assert G.budget.ceiling / G.budget.total <= 50000 / 46000
    assert len(G.budget.ceiling_why) > 60


def test_every_one_of_her_lines_carries_its_own_reason():
    for line in G.budget.lines:
        assert len(line.budget_why) > 60, line.key


def test_every_object_she_builds_lands_on_exactly_one_of_her_lines():
    for name in GALLEON_OBJECTS:
        budget.component_of(G, name)


def test_a_name_none_of_her_lines_claims_is_a_hard_failure_in_audit():
    with pytest.raises(ValueError, match="Mizzen_Staysail"):
        budget.audit(G, {**GALLEON_SCENE, "Mizzen_Staysail": 10})


def test_she_claims_no_open_rail_because_she_builds_none():
    """All three of her raised decks are castles (`rails.build_rails`), so an
    object called `Rails` on her would be a defect, not a line item."""
    with pytest.raises(ValueError, match="Rails"):
        budget.component_of(G, "Rails")


def test_the_beakhead_deck_spends_the_rails_line():
    """`Beakhead_Deck` (the flight's frame timbers) and `Beakhead_Grating`
    (its cards) spend the line the head rails and the beakhead spend, and
    the line's reason states each figure it draws (the maintainer: the line moves,
    re-derived from the new spend, never above 100% of itself)."""
    assert budget.component_of(G, "Beakhead_Deck") == "rails"
    assert budget.component_of(G, "Beakhead_Grating") == "rails"
    line = budget.line_of(G, "rails")
    why = line.budget_why
    for figure in ("Channels 168", "Chainplates 360", "Headrails 532",
                   "Beakhead 24", "Beakhead_Deck 144",
                   "Beakhead_Grating 6", "1,234"):
        assert figure in why, figure
    spent = budget.totals(G, GALLEON_SCENE)["rails"]
    assert spent == 1234 <= line.budget
    assert line.budget == 1300
    assert all(budget.audit(G, GALLEON_SCENE).values())


@pytest.mark.parametrize("key, spend", [
    ("hull", 18256), ("decks", 3036), ("stern", 7428), ("rails", 1234),
    ("masts", 2664), ("sails", 2826), ("rigging", 1010), ("cannons", 10736),
    ("furniture", 5550), ("dressing", 1374),
])
def test_her_spend_per_line_is_the_ledgers(key, spend):
    assert budget.totals(G, GALLEON_SCENE)[key] == spend


def test_every_line_she_spends_sits_inside_its_band():
    measured = budget.totals(G, GALLEON_SCENE)
    for line in G.budget.lines:
        if measured[line.key]:
            lo, hi = budget.band(G, line.key)
            assert lo <= measured[line.key] <= hi, line.key


def test_her_rigging_and_canvas_are_derived_not_just_recorded():
    """The ledger figures for the two lines Tasks 1 and 3 could have moved,
    re-derived off-Blender: two triangles per rope segment, and a fixed grid
    per sail (5 square + 1 lateen) plus the flag."""
    rope_tris = 2 * sum(ropes.segments(r) for _k, r in ropes.all_ropes(G))
    assert rope_tris == GALLEON_SCENE["Rigging"] == 1010
    quads = (profiles.SAIL_NU - 1) * (profiles.SAIL_NV - 1)
    flag = (profiles.FLAG_NU - 1) * (profiles.FLAG_NV - 1)
    from frigate import damage
    assert 2 * 6 * quads - 2 * damage.CANVAS_TEARS == GALLEON_SCENE["Sails"]
    assert 2 * flag == GALLEON_SCENE["Jolly_Roger"]


def test_her_hull_line_carries_the_rudder_she_now_builds():
    # the 42 m hull's, and the owner's stripe on the hull line too
    hull = GALLEON_SCENE["Hull"] + GALLEON_SCENE["Bulwarks"] \
        + GALLEON_SCENE["Ceiling_Lower"] + GALLEON_SCENE["Rudder"]
    assert hull == 17786 <= budget.line_of(G, "hull").budget
    why = budget.line_of(G, "hull").budget_why
    for figure in ("Rudder 144", "Hull 14,688", "17,786", "Hull_Stripe 470",
                   "18,256", "96%"):
        assert figure in why, figure
    assert "does not build yet" not in why


def test_her_battery_line_is_re_derived_from_what_she_draws():
    """The maintainer's ruling: the cannons line from HER spend. 44 guns (42
    broadside from her two rows' port counts, plus her 2 chasers) at 232
    and 44 lids at 12, read off the rebuilt scene."""
    n_guns = len(profiles.gun_placements(G))
    n_lids = len(profiles.lid_placements(G))
    assert n_guns == profiles.total_broadside_ports(G) + G.chase_ports == 44
    assert n_lids == n_guns
    spent = budget.totals(G, GALLEON_SCENE)["cannons"]
    assert spent == n_guns * 232 + n_lids * 12 == 10736
    lo, hi = budget.band(G, "cannons")
    assert lo <= spent <= hi
    why = budget.line_of(G, "cannons").budget_why
    for figure in ("44 x 232", "44 x 12", "10,736", "99%",
                   "rounded up to the hundred"):
        assert figure in why, figure
    assert budget.line_of(G, "cannons").budget == 10800
    assert "Absent today" not in why


# --- starved lines are SAID, not hidden --------------------------------------


def _skipped_scene():
    """Her scene as it stood without the two passes G_SKIP holds back."""
    from frigate import damage
    out = {k: v for k, v in GALLEON_SCENE.items()
           if not k.startswith(("Deck_Furniture", "Wheel", "Gratings",
                                "Damage", "Barrel_", "Anchor_", "Lantern_"))}
    out["Sails"] += 2 * damage.CANVAS_TEARS
    return out


def test_her_audit_passes_and_no_line_of_hers_is_starved():
    """Every pass runs on her now: nothing is STARVED and nothing is said
    to be missing from her passes."""
    results = budget.audit(G, GALLEON_SCENE)
    assert all(results.values())
    assert not any("STARVED" in k or "p.passes" in k for k in results)


def test_a_line_her_passes_leave_empty_is_named_by_its_pass():
    results = budget.audit(G_SKIP, _skipped_scene())
    assert all(results.values())
    assert ("furniture: STARVED — pass 'furniture' not in p.passes "
            "(0 of 5600)" in results)


def test_a_line_partly_fed_by_a_pass_she_skips_says_so_on_its_own_key():
    keys = list(budget.audit(G_SKIP, _skipped_scene()))
    hull = next(k for k in keys if k.startswith("hull "))
    assert "p.passes" not in hull
    decks = next(k for k in keys if k.startswith("decks "))
    assert "pass 'furniture' not in p.passes" in decks
    dressing = next(k for k in keys if k.startswith("dressing "))
    assert "pass 'damage' not in p.passes" in dressing


def test_a_zero_line_whose_pass_she_DOES_run_fails():
    scene = {k: v for k, v in GALLEON_SCENE.items()
             if not k.startswith(("Cannon_", "PortLid_"))}
    results = budget.audit(G, scene)
    key = next(k for k in results if k.startswith("cannons"))
    assert not results[key]
    assert "STARVED —" not in key


def test_every_line_says_which_passes_feed_it_and_they_are_real_passes():
    for b in (F.budget, G.budget):
        fed = dict(b.fed_by)
        assert set(fed) == {line.key for line in b.lines}
        for passes in fed.values():
            assert passes and set(passes) <= PASS_LABELS, passes


def test_the_frigate_runs_every_pass_so_her_audit_names_none():
    results = budget.audit(F, {line.exemplar: line.budget
                               for line in F.budget.lines})
    assert not any("p.passes" in k for k in results)


# --- pivots and export: expected from the passes she runs --------------------


def test_the_frigate_expects_every_animatable_part():
    assert rig.built_pivots(F, 1.0) == rig.pivots(F, 1.0)
    assert rig.unbuilt_pivots(F, 1.0) == ()
    assert rig.merged_expected(F) == tuple(rig.MERGED_ON_PURPOSE)


def test_every_animatable_part_of_hers_is_expected_wheel_included():
    """Task 8a armed and steered her; Task 8b furnished her, so the wheel
    is expected too and no node of hers is excused as unbuilt."""
    assert rig.unbuilt_pivots(G, 1.0) == ()
    built = {piv.part for piv in rig.built_pivots(G, 1.0)}
    assert built == ({f"Yard_{i:02d}" for i in range(5)}
                     | {"Lateen_Mizzen", "Rudder", "Wheel"}
                     | {f"PortLid_{i:02d}" for i in range(44)})
    assert "Deck_Furniture" in rig.merged_expected(G)


def test_the_wheel_of_a_pass_she_skips_is_named_as_unbuilt():
    assert dict(rig.unbuilt_pivots(G_SKIP, 1.0)) == {"furniture": ("Wheel",)}
    assert "Deck_Furniture" not in rig.merged_expected(G_SKIP)


def test_a_part_from_a_pass_she_DOES_run_is_still_expected():
    assert "Rudder" in [piv.part for piv in rig.built_pivots(G, 1.0)]
    assert "rudder" not in dict(rig.unbuilt_pivots(G, 1.0))


def test_every_animatable_kind_and_merged_object_has_a_real_emitting_pass():
    assert set(rig.EMITTED_BY.values()) <= PASS_LABELS
    assert {piv.kind for piv in rig.pivots(F, 1.0)} <= set(rig.EMITTED_BY)
    assert set(rig.MERGED_EMITTED_BY) == set(rig.MERGED_ON_PURPOSE)
    assert set(rig.MERGED_EMITTED_BY.values()) <= PASS_LABELS


# --- check_all runs the ship-wide checks whatever her passes say -------------


def test_the_frigate_runs_every_check_in_the_order_it_always_did():
    from frigate import checklist
    assert checklist.labels_for(F) == (
        "hull", "decks", "gunports", "stern", "rudder", "rails", "head",
        "masts", "sails", "rigging", "cannons", "furniture", "dressing",
        "damage", "intersections", "directions", "pivots", "budget",
        "shading", "materials", "bake", "export")


def test_the_ship_wide_checks_run_on_the_galleon():
    from frigate import checklist
    labels = checklist.labels_for(G)
    for label in ("budget", "pivots", "shading", "export",
                  "intersections", "directions"):
        assert label in labels, label
    for label in ("furniture", "damage"):
        assert label in labels, label
        assert label not in checklist.labels_for(G_SKIP), label
    for label in ("cannons", "rudder"):
        assert label in labels, label
    assert "head" in labels


def test_a_ship_that_names_only_her_hull_still_gets_the_ship_wide_checks():
    from frigate import checklist
    labels = checklist.labels_for(G.with_(passes=("hull",)))
    assert set(checklist.SHIP_WIDE) <= set(labels)


def test_an_empty_line_one_of_whose_passes_she_runs_fails_and_is_not_starved():
    """`decks` is fed by `decks` and `furniture` (not G_SKIP's). Her decks
    gone missing is a defect, whatever the furniture pass is doing. All five
    go: the scene carries them one by one now, not as one total on
    Deck_Main, and any four of them still draw over the line's floor."""
    scene = {k: v for k, v in _skipped_scene().items()
             if not k.startswith("Deck_")}
    results = budget.audit(G_SKIP, scene)
    key = next(k for k in results if k.startswith("decks"))
    assert not results[key]
    assert "STARVED —" not in key
    assert "pass 'furniture' not in p.passes" in key


def test_spend_on_a_line_her_plan_leaves_empty_is_judged_not_waved_through():
    results = budget.audit(G_SKIP, {**_skipped_scene(), "Barrel_00": 300})
    key = next(k for k in results if k.startswith("furniture"))
    assert "STARVED —" not in key and not results[key]


def test_a_budget_whose_fed_by_gives_a_line_no_pass_is_refused():
    """An empty pass tuple would print a STARVED line naming no pass."""
    import dataclasses
    key, _passes = G.budget.fed_by[0]
    bad = dataclasses.replace(
        G.budget, fed_by=((key, ()),) + G.budget.fed_by[1:])
    with pytest.raises(ValueError, match="fed_by"):
        budget.validate_budget(bad)


def test_a_budget_whose_fed_by_misses_a_line_is_refused():
    import dataclasses
    bad = dataclasses.replace(G.budget, fed_by=G.budget.fed_by[:-1])
    with pytest.raises(ValueError, match="fed_by"):
        budget.validate_budget(bad)


def test_her_furniture_and_dressing_lines_are_what_she_draws():
    """The maintainer's ruling (Task 8b): both lines re-derived from her own spend,
    read off the rebuilt scene, each rounded up to the hundred."""
    spent = budget.totals(G, GALLEON_SCENE)
    furniture = budget.line_of(G, "furniture")
    assert spent["furniture"] == 866 + 488 + 8 * 156 + 2 * 1180 + 3 * 196 \
        == 5550 <= furniture.budget == 5600
    for figure in ("Deck_Furniture 866", "Wheel 488", "1,248", "2,360",
                   "588", "5,550", "99%"):
        assert figure in furniture.budget_why, figure
    dressing = budget.line_of(G, "dressing")
    assert spent["dressing"] == 960 + 252 + 162 == 1374 \
        <= dressing.budget == 1400
    for figure in ("Figurehead 960", "Sail_Patches 252", "Damage 162",
                   "1,374", "98%"):
        assert figure in dressing.budget_why, figure
    assert "absent today" not in furniture.budget_why


# --- her .glb ceiling --------------------------------------------------------


def test_the_frigates_measured_rates_give_back_her_own_13_mb():
    """build/frigate.glb as shipped: 12,002,512 bytes, 9,724,937 of them
    her twelve images (four sets), 27,650 unique triangles. At those rates
    her own mesh and four sets come to 12,002,512 -- rounded up to the MB,
    her 13,000,000."""
    assert texbudget.glb_ceiling(27_650, 4) == 13_000_000
    assert texbudget.MESH_BYTES_PER_TRI == pytest.approx(82.372, abs=1e-3)
    assert texbudget.SET_BYTES == pytest.approx(2_431_234.25)


def test_her_glb_ceiling_is_derived_from_her_budget_and_her_sets():
    """Her drawn target less the copies she draws of a shared mesh (what
    the file stores once), at the frigate's measured bytes a triangle,
    plus one atlas set per family at the frigate's measured cost a set,
    rounded up to the MB."""
    from frigate import palette
    repeats = budget.GALLEON_SHARED_REPEATS
    # every shared mesh is stored once and drawn n times: n - 1 repeats
    shared = {"Cannon_": 232, "PortLid_": 12, "Barrel_": 156,
              "Anchor_": 1180, "Lantern_": 196}
    want = 0
    for prefix, tris in shared.items():
        n = sum(1 for k in GALLEON_SCENE if k.startswith(prefix))
        assert all(GALLEON_SCENE[k] == tris
                   for k in GALLEON_SCENE if k.startswith(prefix))
        want += (n - 1) * tris
    assert repeats == want == 13156
    unique = G.budget.total - repeats
    assert unique == 46044
    sets = len(palette.families(G))
    assert sets == 5
    assert G.budget.glb_ceiling == texbudget.glb_ceiling(unique, sets) \
        == 16_000_000
    for figure in ("59,200", "13,156", "46,044", "82.37", "2,431,234",
                   "15,948,814", "16,000,000"):
        assert figure in G.budget.glb_why, figure


def test_her_export_size_key_names_her_own_ceiling():
    key, ok = budget.glb_result(G, 15_900_000)
    assert ok and "16 MB" in key and "47.4" not in key
    assert budget.glb_result(G, 16_000_001)[1] is False


def test_a_budget_with_no_glb_ceiling_or_reason_is_refused():
    import dataclasses
    with pytest.raises(ValueError, match="glb"):
        budget.validate_budget(
            dataclasses.replace(G.budget, glb_ceiling=0))
    with pytest.raises(ValueError, match="glb_why"):
        budget.validate_budget(
            dataclasses.replace(G.budget, glb_why="short"))


# --- every alpha family exports as MASK --------------------------------------


def test_the_frigates_rope_mask_key_reads_as_it_did():
    from frigate import checklist, palette
    from frigate.params import FrigateParams
    f = FrigateParams()
    rope = palette.material_names(f)[palette.ROPE_IRON]
    assert checklist.alpha_mask_results(
        f, (palette.ROPE_IRON,), {rope: "MASK"}) == {
        "the rigging's hard alpha cut exports as MASK, not BLEND (MASK)":
            True}


def test_every_family_that_carries_alpha_must_export_as_mask():
    """An OPAQUE grating is a solid card: the rope was the only family the
    key read, so the grating's holes were never read back off the file."""
    from frigate import checklist, palette
    names = palette.material_names(G)
    alpha = (palette.ROPE_IRON, palette.GRATING)
    modes = {names[palette.ROPE_IRON]: "MASK",
             names[palette.GRATING]: "OPAQUE"}
    results = checklist.alpha_mask_results(G, alpha, modes)
    assert results["the rigging's hard alpha cut exports as MASK, not "
                   "BLEND (MASK)"] is True
    assert results["the grating family's hard alpha cut exports as MASK, "
                   "not BLEND (OPAQUE)"] is False
    modes[names[palette.GRATING]] = "MASK"
    assert all(checklist.alpha_mask_results(G, alpha, modes).values())


# --- the joints summary counts its deviations, only when there are any -----


def test_the_frigates_joints_summary_reads_as_it_did():
    from frigate import checklist
    assert checklist.joints_summary_key(41, 0) == (
        "all 41 intersecting object pairs are ruled joints in "
        "frigate.joints")


def test_a_ship_with_capped_deviations_says_how_many_in_the_summary():
    from frigate import checklist
    assert checklist.joints_summary_key(64, 3) == (
        "all 64 intersecting object pairs are ruled joints in "
        "frigate.joints, and 3 of them capped deviations")


def test_her_decks_line_is_re_derived_for_the_chase_platform():
    """The maintainer's third ruling, A' (Task 11): `Chase_Platform` spends the decks
    line, planked like a deck. Her decks drew 2,932; with the platform's
    92 (profiles.chase_platform_triangles) they drew 3,024, over the 3,000
    line, so it was re-derived to that spend rounded up to the hundred,
    3,100, and the target follows as the sum of the lines. Final review 3
    (I-2) brought the platform to 148: 3,080, still inside 3,100 (99%), so
    the line and the target stay."""
    assert budget.component_of(G, "Chase_Platform") == "decks"
    line = budget.line_of(G, "decks")
    spent = budget.totals(G, GALLEON_SCENE)["decks"]
    assert spent == 3036 <= line.budget == 3100
    for figure in ("Chase_Platform 104", "3,036", "3,100", "98%"):
        assert figure in line.budget_why, figure
    assert G.budget.total == sum(ln.budget for ln in G.budget.lines)
