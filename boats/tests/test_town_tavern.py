"""The tavern's pure plan: every face, colour, tint and anchor, before Blender.

`tavern.plan(p)` is the whole piece as data -- named parts of faces, each with
a linear colour and a tint channel, and the named anchors -- so its budget,
its reach and its dressing are checked here in milliseconds. `build` only
turns it into meshes and bakes the occlusion.
"""

import math

import pytest

from town import board, tavern
from town.params import TavernParams

P = TavernParams()
PLAN = tavern.plan(P)

# The code-built tavern's plan circle at scale 1 (`AGED_BUILDING_HALF_DIAGONAL`,
# 0.195) in metres: what keeps the layout's buildings apart.
BOARD_REACH = 0.195 * 65


def test_it_holds_the_kinds_budget_with_room_for_the_old_tavern():
    # The PRD's 1,800, and under 670 + 890 per port: the triangle growth
    # #394 allows over the code-built tavern ((1,800 - 910) a port).
    assert PLAN.triangles() <= board.MAX_TRIS["tavern"]
    assert PLAN.triangles() <= board.CODE_BUILT_TRIS["tavern"] + board.MAX_GROWTH


def test_it_states_its_planned_triangles():
    assert PLAN.triangles() == tavern.PLANNED_TRIANGLES


def test_it_names_the_parts_of_the_reference():
    assert set(PLAN.parts) == {"Footing", "Walls", "Upper", "Gables", "Roof",
                               "Chimney", "Door", "Windows", "Sign", "Benches"}


def test_every_face_is_a_real_polygon():
    for name, part in PLAN.parts.items():
        for face in part.faces:
            assert len(face.points) >= 3, name
            assert face.area() > 1e-4, name


def test_no_face_reaches_past_the_layouts_plan_circle():
    (lo, hi) = PLAN.bounds()
    for part in PLAN.parts.values():
        for face in part.faces:
            for x, y, _z in face.points:
                assert math.hypot(x, y) <= BOARD_REACH


def test_the_front_is_minus_y_where_the_sign_and_benches_stand():
    (lo, hi) = PLAN.bounds()
    assert -lo[1] > hi[1]
    for name in ("Sign", "Benches", "Door"):
        (plo, phi) = PLAN.part_bounds(name)
        assert phi[1] < 0.0, name


def test_colours_are_linear_and_in_range():
    for part in PLAN.parts.values():
        for face in part.faces:
            assert all(0.0 <= c <= 1.0 for c in face.colour)


def test_tints_are_channels_and_glass_is_only_in_the_windows():
    for name, part in PLAN.parts.items():
        for face in part.faces:
            assert face.tint in board.TINTS.values()
            if face.tint == board.TINTS["glass"]:
                assert name == "Windows"
    tints = {f.tint for f in PLAN.parts["Upper"].faces}
    assert board.TINTS["wall"] in tints and board.TINTS["trim"] in tints
    assert {f.tint for f in PLAN.parts["Roof"].faces} >= {board.TINTS["roof"]}


def test_the_anchors_are_the_chimney_and_one_per_window():
    names = set(PLAN.anchors)
    assert "Chimney_00" in names
    windows = sorted(n for n in names if n.startswith("Window_"))
    assert windows == [f"Window_{i:02d}" for i in range(tavern.WINDOW_COUNT)]
    x, y, z = PLAN.anchors["Chimney_00"]
    assert z == pytest.approx(P.height)


def test_every_window_anchor_sits_on_a_pane():
    glass = [f for f in PLAN.parts["Windows"].faces
             if f.tint == board.TINTS["glass"]]
    assert len(glass) == tavern.WINDOW_COUNT
    for name, at in PLAN.anchors.items():
        if not name.startswith("Window_"):
            continue
        assert min(math.dist(at, f.centre()) for f in glass) < 0.2


def test_the_same_params_give_the_same_plan():
    again = tavern.plan(TavernParams())
    assert [f.colour for f in again.parts["Walls"].faces] == \
        [f.colour for f in PLAN.parts["Walls"].faces]


def test_another_seed_changes_the_tones_not_the_shape():
    other = tavern.plan(TavernParams(seed=7))
    assert other.bounds() == PLAN.bounds()
    assert other.triangles() == PLAN.triangles()
    assert [f.colour for f in other.parts["Walls"].faces] != \
        [f.colour for f in PLAN.parts["Walls"].faces]
