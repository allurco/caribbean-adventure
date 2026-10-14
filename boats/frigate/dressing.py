"""Figurehead, Jolly Roger, patched canvas. Spec section 6 step 13.

The flag is NOT its own thing: it reads `frigate.wind`, the same field that
bellies the nine sails, because spec section 7 says one vector drives all of
them. The patches are laid with `wind.sail_point`, so each lands on the curved
canvas rather than on the flat panel the sail was cut from — up to 1.5 m apart
on a main course.
"""

import bmesh
import bpy

from . import carving, prims, profiles, wind
from .params import FrigateParams

FLAG_NU = profiles.FLAG_NU
FLAG_NV = profiles.FLAG_NV
FIG_SIDES = profiles.FIG_SIDES
FIG_FOLDS = profiles.FIG_FOLDS


def _figurehead(bm, p: FrigateParams) -> None:
    """The carving on the stem head, whichever carving this ship wears.

    The frigate wears Minerva, helmeted, after Johan Tornstrom's figure for
    the Swedish frigate *Minerva* of 1783: a scalloped collar at the throat,
    DEEP VERTICAL DRAPERY FOLDS down to a flounced hem, a round shield edge-on
    at one hip and a spear across the body. The galleon wears a CROWNED LION
    RAMPANT, which is the Spanish crown's own beast and what both of that
    hull's references carry; `frigate.lion` argues it at length.

    What they have in common is what makes them cheap: `profiles.fold_ring`
    ripples a ring's radius with angle, so richness costs ring resolution and
    nothing else. Minerva spends it on drapery over the whole body; the lion
    spends it on the mane alone, because a pelt is not cloth.

    Every coordinate comes from `frigate.carving`, which is bpy-free and under
    plain pytest; this function only emits. The ORDER is the carving's own
    ring groups, then its solid boxes, then both trailboards — which is the
    order `carving.all_points` reports and the order the frigate shipped in.
    """
    for rings in carving.ring_groups(p):
        prims.bridge(bm, [[bm.verts.new(pt) for pt in ring] for ring in rings])
    for lo, hi in carving.boxes(p):
        prims.box(bm, lo, hi)
    # Trailboards: a FAIR CURVE the head rail is faired into, steep off the bow
    # and flattening to level out at the carving. They belong to this object on
    # both ships, and `check_head` asserts the join in both objects' vertices.
    for sign in (1.0, -1.0):
        prims.bridge(bm, [[bm.verts.new(pt) for pt in ring]
                          for ring in profiles.trailboard_rings(p, sign)])


def _flag(bm, p: FrigateParams) -> None:
    grid = wind.flag_grid(p, FLAG_NU, FLAG_NV)
    rows = [[bm.verts.new(pt) for pt in row] for row in grid]
    for a, b in zip(rows, rows[1:]):
        for i in range(FLAG_NU - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))


def _patches(bm, p: FrigateParams) -> None:
    """A patch is a GRID that inherits the sail's own wind displacement.

    It used to be one flat quad with its four corners on the bellied cloth.
    The corners were right — every patch stands 35 mm proud along the canvas
    normal, which is what a patch sewn on top does — but the flat chord
    between corners up to 3.0 m apart cut through canvas that bellies 72 mm
    over the same span, so the sail came out through its own patch. The lift
    is correct and unchanged; the resolution was the bug.
    """
    for patch in wind.sail_patches(p):
        rows = [[bm.verts.new(pt) for pt in row]
                for row in wind.patch_grid(p, patch)]
        for a, b in zip(rows, rows[1:]):
            for i in range(wind.PATCH_NU - 1):
                bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))


def build_dressing(p: FrigateParams) -> list[bpy.types.Object]:
    """The carving always; the colours and the patches only with canvas.

    A flag and a sail patch are CANVAS — the flag bears on the same wind field
    the sails do and a patch is sewn to a sail that has to exist. A hull built
    only as far as its head has neither, and emitting an empty `Jolly_Roger`
    would be a mesh with no vertices claiming to be a flag. So the canvas
    dressing follows the canvas pass, stated here rather than remembered.
    """
    p.validate()
    built = []
    # The carving is shaded FLAT on purpose. Smooth shading averages the normal
    # across every fold crest and trough, and at FIG_SIDES == 2 * FIG_FOLDS
    # every vertex IS a crest or a trough, so the drapery washed out into a
    # smooth sack -- the exact lump this pass set out to replace. Flat, each
    # flute catches its own light and the carving reads as carving.
    parts = [("Figurehead", _figurehead, False)]
    if p.builds("sails"):
        parts += [("Jolly_Roger", _flag, True), ("Sail_Patches", _patches, False)]
    for name, fn, smooth in parts:
        bm = bmesh.new()
        fn(bm, p)
        built.append(prims.finish(bm, name, smooth=smooth))
    # The owner's colours: the pennant with the canvas, the hull stripe on
    # the hull (`frigate.owner`).
    from . import owner
    built += owner.build_owner_colours(p)
    return built
