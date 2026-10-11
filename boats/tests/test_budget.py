"""The spec section 5 triangle budget, as a testable band. Pure, no bpy.

Twelve checks test correctness — manifold, clear of the gunport, under the rail
— and not one of them tests SUFFICIENCY of detail. That is how the stern came
to be built at 266 triangles against a 3,500 line, 8% of the budget for what
spec section 5 calls the highest-detail region, with every check green. This
module is the missing measurement.
"""

import pytest

from frigate import budget
from frigate.params import FrigateParams

P = FrigateParams()


# The scene as it stood at commit 4088f8c: 20,356 drawn triangles, every check
# green, five components starved. Used as the fixture the band must indict.
STARVED_SCENE = {
    "Hull": 5488, "Bulwarks": 1382,
    "Deck_Main": 716, "Deck_Quarter": 356, "Deck_Forecastle": 284,
    "Transom": 104, "Stern_Gallery": 162,
    "Rails": 636, "Channels": 168, "Chainplates": 360,
    "Masts": 252, "Tops": 168, "Bowsprit": 28,
    **{f"Yard_{i:02d}": 40 for i in range(9)},
    "Sails": 1714, "Jolly_Roger": 80,
    "Rigging": 690,
    **{f"Cannon_{i:02d}": 232 for i in range(24)},
    **{f"PortLid_{i:02d}": 12 for i in range(24)},
    "Deck_Furniture": 460, "Wheel": 66,
    **{f"Barrel_{i:02d}": 44 for i in range(8)},
    **{f"Lantern_{i:02d}": 52 for i in range(3)},
    **{f"Anchor_{i:02d}": 72 for i in range(2)},
    "Figurehead": 112, "Sail_Patches": 28, "Damage": 234,
}


def _in_band_scene():
    """One object per component, each carrying exactly 75% of its own line."""
    return {
        line.exemplar: int(round(line.budget * 0.75)) for line in P.budget.lines
    }


def test_the_table_is_the_ten_lines_of_spec_section_5():
    keys = [line.key for line in P.budget.lines]
    assert keys == ["hull", "decks", "stern", "rails", "masts", "sails",
                    "rigging", "cannons", "furniture", "dressing"]
    assert sum(line.budget for line in P.budget.lines) == P.budget.total
    assert P.budget.total == 46000


def test_the_furniture_line_was_raised_out_of_the_global_surplus():
    """The maintainer's call, recorded rather than quietly applied. Spec section 5's
    5,000 furniture line was an estimate made BEFORE the parts were built; the
    anchor is a conspicuous close-range object on a pirate ship and 320
    triangles of it read low-res. The 2,000 comes off the 9,794 the whole ship
    had unspent, so the 50,000 hard ceiling does not move."""
    line = budget.line_of(P, "furniture")
    assert line.budget == 7000
    assert line.spec_budget == 5000, "the figure it was raised FROM is kept"
    assert P.budget.total == 46000 == 44000 + 2000
    assert P.budget.total < 50000
    assert len(line.budget_why) > 60


def test_only_the_furniture_line_has_moved_off_its_spec_figure():
    moved = [l.key for l in P.budget.lines if l.spec_budget]
    assert moved == ["furniture"]


def test_a_line_that_departs_from_its_spec_figure_has_to_say_why():
    """The same discipline `floor_why` already carries. A budget line moved in
    silence is indistinguishable from a ceiling quietly widened to let
    something through."""
    with pytest.raises(ValueError):
        budget.validate_line(budget.Line("x", "X", 1234, ("A",),
                                         spec_budget=1000))
    budget.validate_line(budget.Line("y", "Y", 1234, ("A",), spec_budget=1000,
                                     budget_why="x" * 61))
    # And a line still on its spec figure needs no argument at all.
    budget.validate_line(budget.Line("z", "Z", 1234, ("A",)))


def test_the_band_runs_from_half_a_line_to_the_whole_line():
    assert budget.STARVED_FLOOR == 0.50
    assert budget.OVERSPEND_CEILING == 1.00
    assert budget.band(P, "stern") == (1750.0, 3500.0)


def test_every_object_in_the_shipped_scene_lands_on_exactly_one_line():
    for name in STARVED_SCENE:
        budget.component_of(P, name)


def test_an_object_no_line_claims_is_an_error_not_a_silent_zero():
    """A new object that no budget line covers must stop the check, not vanish
    from it. Unclassified geometry is how a component drifts over its line."""
    with pytest.raises(ValueError, match="Mizzen_Staysail"):
        budget.component_of(P, "Mizzen_Staysail")


def test_no_two_lines_claim_the_same_object():
    budget.validate_rules(P)


def test_deck_furniture_is_furniture_and_the_deck_planking_is_decks():
    """`Deck_Furniture` starts with `Deck_`, and must not be swallowed by the
    decks line it looks like it belongs to."""
    assert budget.component_of(P, "Deck_Furniture") == "furniture"
    assert budget.component_of(P, "Deck_Main") == "decks"


def test_linked_duplicates_count_once_per_object_drawn():
    """Spec section 5 budgets 24 cannons at ~250 tris each for a 6,000 line, so
    the budget counts triangles DRAWN, not the unique mesh behind them."""
    totals = budget.totals(P, STARVED_SCENE)
    assert totals["cannons"] == 24 * 232 + 24 * 12


def test_the_starved_stern_fails_the_band():
    totals = budget.totals(P, STARVED_SCENE)
    assert totals["stern"] == 266
    results = budget.audit(P, STARVED_SCENE)
    assert not all(results.values())
    starved = [k for k, ok in results.items() if not ok]
    assert any("stern" in k for k in starved)


def test_the_hull_and_the_battery_already_sit_inside_the_band():
    results = budget.audit(P, STARVED_SCENE)
    assert all(ok for k, ok in results.items() if k.startswith("hull "))
    assert all(ok for k, ok in results.items() if k.startswith("cannons "))


def test_a_component_over_its_line_fails_as_loudly_as_a_starved_one():
    scene = _in_band_scene()
    scene[budget.exemplar_of(P, "stern")] = 3501
    results = budget.audit(P, scene)
    assert not all(results.values())
    assert any("stern" in k and not ok for k, ok in results.items())


def test_a_scene_inside_every_band_passes():
    assert all(budget.audit(P, _in_band_scene()).values())


def test_a_missing_component_reads_as_starved_rather_than_absent():
    scene = _in_band_scene()
    del scene[budget.exemplar_of(P, "masts")]
    results = budget.audit(P, scene)
    assert any("masts" in k and not ok for k, ok in results.items())


def test_each_line_names_both_ends_of_its_measurement():
    """Never 'stern is 266'. A measurement line says what it spans: the drawn
    triangles of the stern's own objects, against the stern's own spec line."""
    results = budget.audit(P, STARVED_SCENE)
    key = next(k for k in results if k.startswith("stern "))
    assert "266" in key and "3500" in key


def test_the_canvas_grid_fills_the_sails_budget_line():
    """Both ends named: the triangles DRAWN by the nine sails and the flag,
    against spec section 5's own 5,500 "Sails x9 + flag" line.

    The grid resolution is the only thing that sets this number, and at 13x9 it
    came to 1,794 — 33% of the line, which `check_budget` indicted. The constant
    lives in `profiles` rather than in `sails` precisely so this arithmetic can
    be tested without bpy.
    """
    from frigate import damage, profiles

    quads = (9 * (profiles.SAIL_NU - 1) * (profiles.SAIL_NV - 1)
             + (profiles.FLAG_NU - 1) * (profiles.FLAG_NV - 1)
             - damage.CANVAS_TEARS)
    floor, ceiling = budget.band(P, "sails")
    assert floor <= 2 * quads <= ceiling


# --- Task 16: a per-line floor, because one line's floor was unreachable ----

def test_the_default_floor_is_still_half_a_line_for_every_other_component():
    for line in P.budget.lines:
        if line.key != "rigging":
            assert line.floor == budget.STARVED_FLOOR
            assert budget.band(P, line.key) == (0.50 * line.budget, 1.0 * line.budget)


def test_the_rigging_line_alone_carries_a_lower_floor_and_says_why():
    line = budget.line_of(P, "rigging")
    assert line.floor == 0.25
    assert budget.band(P, "rigging") == (1000.0, 4000.0)
    # The exception is not allowed to be silent. A floor that differs from the
    # default has to carry its reason in the data, not only in a comment, or
    # the next person reads it as a typo and "fixes" it.
    assert line.floor_why and len(line.floor_why) > 60


def test_no_other_line_may_quietly_acquire_an_exception():
    """The one authorised exception is rigging's. Anything else must argue.

    This project has been caught widening tolerances before; the ledger names
    it. `validate_rules` is where a second lowered floor gets stopped.
    """
    lowered = [l.key for l in P.budget.lines if l.floor < budget.STARVED_FLOOR]
    assert lowered == ["rigging"]


def test_a_lowered_floor_without_a_reason_is_rejected():
    import dataclasses
    import pytest

    bad = dataclasses.replace(budget.line_of(P, "rigging"), floor_why="")
    with pytest.raises(ValueError, match="floor"):
        budget.validate_line(bad)


def test_a_floor_above_the_ceiling_is_rejected():
    import dataclasses
    import pytest

    bad = dataclasses.replace(budget.line_of(P, "hull"), floor=1.5)
    with pytest.raises(ValueError, match="floor"):
        budget.validate_line(bad)


def test_an_honest_complete_rig_clears_the_new_floor_and_would_miss_the_old():
    """1,482 triangles is what a full rig costs with the ribbon technique.

    Both numbers named: rigging-drawn-triangles against the rigging line's own
    floor. At the 50% the spec wrote it needs 2,000 and cannot reach them
    without padding; at 25% it clears by 482.
    """
    drawn = 1482
    assert drawn < budget.STARVED_FLOOR * budget.line_of(P, "rigging").budget
    assert drawn > budget.band(P, "rigging")[0]


# --- Task 4: the budget is the SHIP's, on her params ------------------------


def test_a_ship_that_declares_no_budget_is_refused_not_given_the_frigates():
    """The table was module-global and the frigate's; falling back on it for
    a ship that declares none is exactly the defect `Budget` removes."""
    from frigate.params import ShipParams
    bare = ShipParams()
    with pytest.raises(ValueError, match="declares no triangle budget"):
        budget.audit(bare, {"Hull": 1})
    with pytest.raises(ValueError, match="declares no triangle budget"):
        budget.component_of(bare, "Hull")


def test_a_budget_whose_target_is_not_the_sum_of_its_lines_is_refused():
    import dataclasses
    bad = dataclasses.replace(P.budget, total=P.budget.total + 1)
    with pytest.raises(ValueError, match="sum to 46000"):
        budget.validate_budget(bad)


def test_a_target_over_its_own_ceiling_is_refused():
    import dataclasses
    bad = dataclasses.replace(P.budget, ceiling=P.budget.total - 1)
    with pytest.raises(ValueError, match="under a target"):
        budget.validate_budget(bad)


def test_a_ceiling_that_does_not_say_where_it_comes_from_is_refused():
    import dataclasses
    bad = dataclasses.replace(P.budget, ceiling_why="")
    with pytest.raises(ValueError, match="ceiling_why"):
        budget.validate_budget(bad)


def test_a_key_used_twice_is_refused():
    import dataclasses
    lines = P.budget.lines + (dataclasses.replace(
        P.budget.lines[0], names=("Spare",)),)
    bad = dataclasses.replace(P.budget, lines=lines,
                              total=P.budget.total + lines[-1].budget)
    with pytest.raises(ValueError, match="repeat"):
        budget.validate_budget(bad)
