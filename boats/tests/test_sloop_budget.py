"""The sloop's own triangle budget, read off her built scene.

Every line is what she DRAWS, measured in Blender on the build of her own
params, rounded up to the hundred, as the flute's are.
"""

from frigate import budget, texbudget
from frigate.params import FrigateParams, SloopParams

S = SloopParams()

# Measured in Blender (frigate.build.rebuild(SloopParams()), 47 objects).
SLOOP_SCENE = {
    "Hull": 3936, "Bulwarks": 822, "Deck_Main": 572, "Deck_Forecastle": 140,
    "Deck_Quarter": 212, "Transom": 40, "Stern_Gallery": 1098,
    "Stern_Carving": 916, "Rudder": 144, "Rails": 304, "Channels": 56,
    "Chainplates": 96, "Masts": 228, "Tops": 0, "Gaff_Main": 104,
    "Boom_Main": 104, "Bowsprit": 108, "Sails": 1728, "Rigging": 172,
    **{f"Cannon_{i:02d}": 232 for i in range(8)},
    **{f"PortLid_{i:02d}": 12 for i in range(8)},
    "Deck_Furniture": 866, "Wheel": 488, "Gratings": 684,
    **{f"Barrel_{i:02d}": 156 for i in range(4)},
    "Anchor_00": 1180, "Anchor_01": 1180, "Figurehead": 1200,
    "Jolly_Roger": 80, "Sail_Patches": 252,
}


def test_the_scene_is_19286_triangles_in_47_objects():
    assert len(SLOOP_SCENE) == 47
    assert sum(SLOOP_SCENE.values()) == 19286


def test_she_carries_her_own_budget():
    assert S.budget is budget.SLOOP_BUDGET
    assert S.budget is not FrigateParams().budget
    budget.validate_rules(S)


def test_every_line_is_what_she_draws_rounded_up_to_the_hundred():
    drawn = budget.totals(S, SLOOP_SCENE)
    for line in S.budget.lines:
        assert line.budget == -(-drawn[line.key] // 100) * 100, line.key
    assert all(budget.audit(S, SLOOP_SCENE).values())


def test_she_is_the_smallest_budget_in_the_fleet():
    assert S.budget.total == 19900
    assert S.budget.ceiling == 21600
    assert S.budget.ceiling / S.budget.total <= 50000 / 46000
    assert S.budget.total < budget.FLUTE_BUDGET.total


def test_her_glb_ceiling_is_derived_the_frigates_way():
    assert budget.SLOOP_SHARED_REPEATS == 7 * 232 + 7 * 12 + 3 * 156 + 1180
    assert S.budget.glb_ceiling == texbudget.glb_ceiling(
        19900 - budget.SLOOP_SHARED_REPEATS, 4)
