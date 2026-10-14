"""The flute's own triangle budget, read off her built scene.

Every line is what she DRAWS, measured in Blender on the build of her own
params, rounded up to the hundred -- the rule the galleon's re-derived lines
follow -- so no line is padded and none is starved.
"""

from frigate import budget, texbudget
from frigate.params import FluteParams, FrigateParams

L = FluteParams()

# Measured in Blender (frigate.build.rebuild(FluteParams()), 60 objects: the
# owner's Pennant and Hull_Stripe joined her 57, then her Sail_Band).
FLUTE_SCENE = {
    "Hull": 8176, "Bulwarks": 1270, "Castle_Quarter": 284, "Castle_Poop": 144,
    "Deck_Main": 644, "Deck_Forecastle": 212, "Deck_Quarter": 356,
    "Deck_Poop": 212, "Transom": 124, "Stern_Gallery": 1282,
    "Stern_Carving": 2772, "Rudder": 144, "Rails": 110, "Channels": 168,
    "Chainplates": 288, "Headrails": 388, "Beakhead": 24, "Masts": 684,
    "Tops": 1080, "Yard_00": 136, "Yard_01": 136, "Yard_02": 136,
    "Yard_03": 136, "Lateen_Mizzen": 112, "Bowsprit": 108, "Sails": 2146,
    "Rigging": 750,
    **{f"Cannon_{i:02d}": 232 for i in range(8)},
    **{f"PortLid_{i:02d}": 12 for i in range(8)},
    "Deck_Furniture": 866, "Wheel": 488, "Gratings": 684,
    **{f"Barrel_{i:02d}": 156 for i in range(4)},
    "Lantern_00": 196, "Anchor_00": 1180, "Anchor_01": 1180,
    "Figurehead": 928, "Jolly_Roger": 80, "Sail_Patches": 252, "Damage": 234,
    "Pennant": 24, "Hull_Stripe": 240, "Sail_Band": 144,
}


def test_the_scene_is_31094_triangles_in_60_objects():
    assert len(FLUTE_SCENE) == 60
    assert sum(FLUTE_SCENE.values()) == 31094


def test_she_carries_her_own_budget():
    assert L.budget is budget.FLUTE_BUDGET
    assert L.budget is not FrigateParams().budget
    budget.validate_rules(L)


def test_every_line_is_what_she_draws_rounded_up_to_the_hundred():
    drawn = budget.totals(L, FLUTE_SCENE)
    for line in L.budget.lines:
        assert line.budget == -(-drawn[line.key] // 100) * 100, line.key
    assert all(budget.audit(L, FLUTE_SCENE).values())


def test_her_ceiling_keeps_the_frigates_proportion_over_target():
    assert L.budget.total == 31700
    assert L.budget.ceiling == 34400
    assert L.budget.ceiling / L.budget.total <= 50000 / 46000


def test_her_glb_ceiling_is_derived_the_frigates_way():
    repeats = 7 * 232 + 7 * 12 + 3 * 156 + 1180
    assert budget.FLUTE_SHARED_REPEATS == repeats
    assert L.budget.glb_ceiling == texbudget.glb_ceiling(
        31700 - repeats, 4)
