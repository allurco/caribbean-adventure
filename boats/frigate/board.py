"""The BOARD variant's rules. Pure -- imports no bpy.

The full export is a ship built to be looked at from her own deck. The game
draws her on a board, at map, mid and ship zoom, beside five more players
and the NPC fleets, and holds every ship it loads to one contract (issue
#132): at most `MAX_BYTES`, at most `MAX_TRIS` triangles DRAWN, no texture
over `MAX_TEXTURE` px, with the full export's origin (the waterline
amidships), metres and bow axis (glTF -Z), and the parts it tints under
their own names, `NAMED_PARTS`.

THE VARIANT IS MADE FROM THE BAKED SHIP, NEVER REBUILT. `export.export_board`
takes the scene `bake` left, and:

  * DROPS what no board camera can see: whatever lies under a deck.
  * THINS everything else that is worth it by ONE ratio, chosen here so the
    whole lands under `TARGET_TRIS`. One ratio, not one per part, so no part
    is spent down to rubble to save another; and only FAMILIES of
    `THIN_FLOOR` triangles or more, a family being a part with its numbered
    siblings (Cannon_00..Cannon_23): no one 232-triangle gun is worth a
    collapse, the frigate's 24 of them are 5,568. A member under
    `MEMBER_FLOOR` is kept whatever its family, because a 12-triangle port
    lid has nothing to give.
  * Never thins `WHOLE`: canvas is one quad a grid cell and rope two
    triangles a rope, so a collapsed sail is a torn sail and a collapsed
    rope is no rope.
  * Downsizes every baked atlas to `ATLAS`.

Why each figure is what it is is stated beside it.
"""

import math
import re

MAX_TRIS = 20_000
MAX_BYTES = 4_000_000
MAX_TEXTURE = 1024

# 10% under the contract, so a decimation that lands a little over its ratio
# (Blender's collapse counts faces, not the triangles they make) still clears.
TARGET_TRIS = 18_000

# Every baked atlas, halved from the full export's 1024. A quarter of the
# texels is a quarter of the bytes, give or take the JPEG, and at ship zoom a
# 30 m hull spans a few hundred pixels of screen.
ATLAS = 512

# NORMAL MAPS go down once more, to 256. They are lossless PNG, so halving
# them does not quarter them the way it quarters a JPEG albedo: measured on
# the flute's first board file at 512 throughout, her four normal maps were
# 1,402,472 of its 2,840,857 bytes of image and the file stood 4,290,352
# bytes, over `MAX_BYTES`. What a normal map carries is plank seams, weave
# and rope lay, which at board zoom fall inside one screen pixel.
NORMAL_ATLAS = 256


def atlas_size(kind: str) -> int:
    """The board copy's edge, in texels, for one kind of baked atlas."""
    return NORMAL_ATLAS if kind == "normal" else ATLAS

# The parts the game reads by name: the hull, the canvas it tints in the
# owner's colour, and the flag.
NAMED_PARTS = ("Hull", "Sails", "Jolly_Roger")

# Never thinned. See the module docstring.
WHOLE = ("Sails", "Jolly_Roger", "Rigging", "Sail_Patches")

# A FAMILY with fewer triangles than this is kept as it is.
THIN_FLOOR = 400

# A member with fewer triangles than this is kept whatever its family: a box
# collapsed is no longer a box. Above every port lid (12) and under every
# yard (136), barrel (156), lantern (196) and gun (232).
MEMBER_FLOOR = 50

# Never below this ratio: past it a collapse stops simplifying a shape and
# starts deleting it. A ship that needs more is over-built for the board and
# is refused by name rather than shipped as rubble.
MIN_RATIO = 0.15

# WHAT LIES UNDER A DECK. Seen from above, a deck covers it; seen from the
# side, the hull does. The galleon's lower gun deck and the ceiling inboard
# of its row, and the chase platform under her quarterdeck.
HIDDEN = ("Deck_Lower", "Ceiling_Lower", "Chase_Platform")


def hidden_from_above(name: str) -> bool:
    return name in HIDDEN


def family(name: str) -> str:
    """The family a part belongs to: its name without a row number."""
    return re.sub(r"_\d+$", "", name)


def plan(counts: dict, target: int = TARGET_TRIS) -> dict:
    """What the board variant does to each object, from its drawn triangles.

    Returns {"drop": [...], "thin": [...], "ratio": r, "expected": n}:
    the objects left out, the objects thinned, the one ratio they are thinned
    by, and the triangles that leaves if each lands on its ratio.
    """
    drop = sorted(n for n in counts if hidden_from_above(n))
    families = {}
    for n, c in counts.items():
        if n not in drop:
            families[family(n)] = families.get(family(n), 0) + c
    kept = {n: c for n, c in counts.items()
            if n not in drop and (n in WHOLE or c < MEMBER_FLOOR
                                  or families[family(n)] < THIN_FLOOR)}
    thin = {n: c for n, c in counts.items()
            if n not in drop and n not in kept}
    fixed = sum(kept.values())
    if fixed + sum(thin.values()) <= target:
        return {"drop": drop, "thin": [], "ratio": 1.0,
                "expected": fixed + sum(thin.values())}
    ratio = (target - fixed) / sum(thin.values())
    if ratio < MIN_RATIO:
        raise ValueError(
            f"the board variant cannot reach {target} triangles: "
            f"{fixed} are in parts it never thins, which leaves a ratio of "
            f"{ratio:.3f} for the rest, under the {MIN_RATIO} floor")
    expected = fixed + sum(math.floor(c * ratio) for c in thin.values())
    return {"drop": drop, "thin": sorted(thin), "ratio": ratio,
            "expected": expected}


def contract_faults(nbytes: int, tris: int, dims, node_names) -> list:
    """Every way a written board `.glb` breaks the game's contract, read off
    the file: its size in bytes, the triangles it DRAWS, (name, w, h) of each
    embedded image, and the names of the nodes that draw something."""
    out = []
    if nbytes > MAX_BYTES:
        out.append(f"the file is {nbytes:,} bytes, over {MAX_BYTES:,}")
    if tris > MAX_TRIS:
        out.append(f"it draws {tris:,} triangles, over {MAX_TRIS:,}")
    for name, w, h in dims:
        if max(w, h) > MAX_TEXTURE:
            out.append(f"texture {name} is {w} x {h}, over {MAX_TEXTURE}")
    for part in NAMED_PARTS:
        if part not in node_names:
            out.append(f"no part named {part}")
    return out
