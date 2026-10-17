"""The tavern's plan is the board's, frozen.

The board already lays out a tavern at every port with a footprint of its
own: `AGED_BUILDING_PLAN.tavern` (half 0.11 across, 0.09 deep, at scale 1),
`AGED_BUILDING_HEIGHT.tavern` (0.278) and `BUILDING_FOOTING` (0.16), in
`src/board/visuals/`, one unit there being 65 m before the family factor
(`METRES_PER_UNIT`, `worldScale.ts`). The model takes those in metres, so the
placement sweeps (`villagePlacement.*.test.ts`) are untouched by the swap.

If this fails, the tavern no longer fits the place the board keeps for it.
Change the board's plan and re-run the sweeps first, never this alone.
"""

import pytest

from town import tavern
from town.params import TavernParams

P = TavernParams()


def test_the_footprint_is_the_boards_in_metres():
    assert P.half_width == pytest.approx(7.15)
    assert P.half_depth == pytest.approx(5.85)


def test_the_height_and_footing_are_the_boards_in_metres():
    assert P.height == pytest.approx(18.07)
    assert P.footing == pytest.approx(10.4)


def test_the_planned_walls_stand_on_that_footprint():
    (lo, hi) = tavern.plan(P).part_bounds("Walls")
    assert (lo[0], hi[0]) == pytest.approx((-7.15, 7.15))
    assert (lo[1], hi[1]) == pytest.approx((-5.85, 5.85))
    assert lo[2] == pytest.approx(0.0)


def test_the_planned_piece_rises_to_that_height_and_reaches_down_to_that_footing():
    (lo, hi) = tavern.plan(P).bounds()
    assert hi[2] == pytest.approx(18.07)
    assert lo[2] == pytest.approx(-10.4)
