"""The frigate's triangle budget is frozen, and so is what its audit SAYS.

Captured BEFORE the budget moved off module globals and onto each ship's own
params object (Task 4). The refactor is only correct if the frigate's table is
carried across verbatim -- same ten lines, same figures, same `floor_why` and
`budget_why` -- and her audit prints byte-for-byte what it printed before.
Every key below was produced by the module-global `budget.audit(counts)` at
ab0168b and pasted in as a literal, so this file cannot agree with a refactor
merely by calling the same code twice.

If this fails, the frigate's budget has moved. Do not re-paste the goldens to
make it pass: find what moved.
"""

import hashlib

from frigate import budget
from frigate.params import FrigateParams

P = FrigateParams()

# SHA-1 of `repr()` of the frigate's ten `Line`s at ab0168b. A Line's repr
# carries every field -- key, title, budget, names, prefixes, floor,
# floor_why, spec_budget, budget_why -- so one changed character anywhere in
# the table moves it.
FRIGATE_LINES_SHA1 = "20026aa2925648eff27f92e87ba2e17ba608a10a"

# The scene at commit 4088f8c (the one tests/test_budget.py indicts), copied
# here so an edit to that file's fixture cannot move this capture.
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

STARVED_AUDIT = [
    ("hull drew 6870 tris of its 8000 line (86%), band 4000-8000", True),
    ("decks drew 1356 tris of its 3000 line (45%), band 1500-3000", False),
    ("stern drew 266 tris of its 3500 line (8%), band 1750-3500", False),
    ("rails drew 1164 tris of its 2500 line (47%), band 1250-2500", False),
    ("masts drew 808 tris of its 4500 line (18%), band 2250-4500", False),
    ("sails drew 1794 tris of its 5500 line (33%), band 2750-5500", False),
    ("rigging drew 690 tris of its 4000 line (17%), band 1000-4000 "
     "[floor 25%]", False),
    ("cannons drew 5856 tris of its 6000 line (98%), band 3000-6000", True),
    ("furniture drew 1178 tris of its 7000 line (17%), band 3500-7000", False),
    ("dressing drew 374 tris of its 2000 line (19%), band 1000-2000", False),
]

# One object per line at 75% of it, the stern pushed one triangle over.
OVER_SCENE = {
    "Hull": 6000, "Deck_Main": 2250, "Transom": 3501, "Rails": 1875,
    "Masts": 3375, "Sails": 4125, "Rigging": 3000, "Cannon_00": 4500,
    "Deck_Furniture": 5250, "Figurehead": 1500,
}

OVER_AUDIT = [
    ("hull drew 6000 tris of its 8000 line (75%), band 4000-8000", True),
    ("decks drew 2250 tris of its 3000 line (75%), band 1500-3000", True),
    ("stern drew 3501 tris of its 3500 line (100%), band 1750-3500", False),
    ("rails drew 1875 tris of its 2500 line (75%), band 1250-2500", True),
    ("masts drew 3375 tris of its 4500 line (75%), band 2250-4500", True),
    ("sails drew 4125 tris of its 5500 line (75%), band 2750-5500", True),
    ("rigging drew 3000 tris of its 4000 line (75%), band 1000-4000 "
     "[floor 25%]", True),
    ("cannons drew 4500 tris of its 6000 line (75%), band 3000-6000", True),
    ("furniture drew 5250 tris of its 7000 line (75%), band 3500-7000", True),
    ("dressing drew 1500 tris of its 2000 line (75%), band 1000-2000", True),
]


def _lines():
    return P.budget.lines


def _audit(counts):
    return budget.audit(P, counts)


def test_the_frigate_table_is_the_table_that_shipped():
    digest = hashlib.sha1(repr(_lines()).encode()).hexdigest()
    assert digest == FRIGATE_LINES_SHA1


def test_the_frigate_target_is_still_46000():
    assert sum(line.budget for line in _lines()) == 46000


def test_the_starved_scene_audits_byte_for_byte_as_it_did():
    assert list(_audit(STARVED_SCENE).items()) == STARVED_AUDIT


def test_an_overspent_scene_audits_byte_for_byte_as_it_did():
    assert list(_audit(OVER_SCENE).items()) == OVER_AUDIT


def test_the_frigate_carries_the_frigate_budget_and_its_50000_ceiling():
    assert P.budget is budget.FRIGATE_BUDGET
    assert P.budget.total == 46000 and P.budget.ceiling == 50000


def test_the_in_blender_ceiling_and_footer_lines_read_as_they_did():
    """`check_budget`'s ceiling key and `check_all`'s footer were f-strings over
    `checks.HARD_CEILING` and `budget.SPEC_TOTAL` at ab0168b. These are those
    strings, at the frigate's shipped 35,926 triangles, pasted as literals."""
    assert budget.ceiling_result(P, 35926) == (
        "the whole ship drew 35926 tris of the 50000 ceiling", True)
    assert budget.ceiling_result(P, 50001) == (
        "the whole ship drew 50001 tris of the 50000 ceiling", False)
    assert budget.tris_summary(P, 35926) == \
        "TRIS 35926 of 46000 target / 50000 ceiling"


def test_the_export_size_key_reads_as_it_did():
    """`check_export`'s size key was an f-string over
    `texbudget.MAX_GLB_BYTES` at f765b16. Her ceiling is now her Budget's
    and the key is the same string, at her shipped 12,002,512 bytes."""
    assert P.budget.glb_ceiling == 13_000_000
    assert budget.glb_result(P, 12_002_512) == (
        "the glb is 12.0 MB, under the 13 MB a quarter-area atlas set has "
        "to beat (was 47.4 MB)", True)
    assert budget.glb_result(P, 13_000_001)[1] is False
