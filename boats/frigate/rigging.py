"""Standing and running rigging as ribbon quads. Spec section 6 step 10.

Spec section 5 chose ribbons over tubes before the masts existed: 200 ropes as
tube meshes would be tens of thousands of triangles for something that reads as
"ropes", while a ribbon is two. Each rope is ONE quad, turned so its flat face
points at the viewer for the view that rope is normally judged in — shrouds,
ratlines, backstays and braces face fore and aft; stays, which run fore and aft
themselves, face athwartships.

Where every rope begins and ends is `frigate.ropes`' business.
"""

import bmesh
import bpy
from mathutils import Vector

from . import env, ropes
from .params import FrigateParams

# Ribbon width in metres, and the axis the ribbon's flat face looks along.
# THE TABLE LIVES IN `ropes`, beside the family tables it has to match: a
# family added to one list and forgotten in the other was a bare `KeyError`
# here, which is a crash in Blender for something a pure pytest can see. This
# name is kept because `build_rigging` and the checks read it.
ROPE_STYLE = ropes.ROPE_STYLE


def _ribbon(bm, a, b, width: float, facing) -> None:
    start, end = Vector(a), Vector(b)
    direction = end - start
    if direction.length < 1e-9:
        raise ValueError(f"degenerate rope from {a} to {b}")
    across = direction.normalized().cross(Vector(facing))
    if across.length < 1e-6:
        # The rope runs along its own facing axis; any perpendicular will do.
        across = direction.normalized().cross(Vector((0.0, 0.0, 1.0)))
    across = across.normalized() * (width / 2.0)
    verts = [bm.verts.new(pt) for pt in
             (start - across, start + across, end + across, end - across)]
    bm.faces.new(verts)


def build_rigging(p: FrigateParams) -> bpy.types.Object:
    p.validate()
    bm = bmesh.new()
    # One quad per SEGMENT. Most ropes are a single segment and come out
    # exactly as they always did; a footrope's catenary and a buntline's run
    # up the belly of its sail are the ones that are not.
    for kind, rope in ropes.all_ropes(p):
        width, facing = ROPE_STYLE[kind]
        for a, b in zip(rope, rope[1:]):
            _ribbon(bm, a, b, width, facing)
    bm.normal_update()
    mesh = bpy.data.meshes.new("Rigging")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Rigging", mesh)
    env.link(obj)
    return obj
