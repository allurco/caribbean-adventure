"""The town's board contract (ADR 0002 amendment (d), PRD #392).

Every town `.glb` is merged or instanced into the village's one material, so
it is held to: its kind's triangle budget, at most `MAX_BYTES`, no images at
all (colour is `COLOR_0`), `COLOR_0` and the `_TINT` channel on every
primitive, tint values among the five channels, and the anchors its kind
names. `contract_faults` reads those numbers off the written file; here it
is fed synthetic ones.
"""

from town import board

GOOD = dict(kind="tavern", nbytes=150_000, tris=1_400, images=0,
            attributes=[{"POSITION", "NORMAL", "COLOR_0", "_TINT"}],
            tints={0, 1, 2, 3, 4, 5},
            node_names={"Walls", "Chimney_00", "Window_00"})


def faults(**over):
    return board.contract_faults(**{**GOOD, **over})


def test_the_contract_is_the_prds():
    assert board.MAX_TRIS["tavern"] == 1_800
    assert board.MAX_BYTES == 250_000
    assert board.TINTS == {"none": 0, "wall": 1, "roof": 2, "trim": 3,
                           "shutter": 4, "glass": 5}


def test_a_file_inside_the_contract_has_no_faults():
    assert faults() == []


def test_over_budget_triangles_are_refused():
    assert any("1,801 triangles" in f for f in faults(tris=1_801))


def test_an_oversized_file_is_refused():
    assert any("250,000" in f for f in faults(nbytes=250_001))


def test_any_image_is_refused():
    assert any("image" in f for f in faults(images=1))


def test_a_primitive_without_vertex_colours_or_tint_is_refused():
    assert any("COLOR_0" in f for f in faults(attributes=[{"POSITION", "_TINT"}]))
    assert any("_TINT" in f for f in faults(attributes=[{"POSITION", "COLOR_0"}]))


def test_a_tint_outside_the_channels_is_refused():
    assert any("tint 6" in f for f in faults(tints={0, 6}))


def test_the_kinds_anchors_and_footprint_part_must_be_there():
    assert any("Chimney_00" in f for f in faults(node_names={"Walls", "Window_00"}))
    assert any("Window_" in f for f in faults(node_names={"Walls", "Chimney_00"}))
    assert any("Walls" in f for f in faults(node_names={"Chimney_00", "Window_00"}))


def test_an_unknown_kind_has_no_budget():
    assert any("no budget" in f for f in faults(kind="cathedral"))
