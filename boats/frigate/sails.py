"""The ship's canvas. Spec section 6 step 9, spec section 7.

One grid per sail, displaced by the shared wind field in `frigate.wind`. The
grids are single-sided on purpose: canvas has no thickness worth 1,700 extra
triangles, and the material is two-sided.

WHICH sails exist is the ship's own rig plan, not nine. This module asks
`sailplan` for the list and for each sail's surface, so a gaff mainsail or a
jib would be emitted by the same loop that emits a square course.
"""

import bmesh
import bpy

from . import env, profiles, sailplan
from .params import FrigateParams

# The grid resolution lives in `profiles`, which imports no bpy, because the
# number is set by spec section 5's triangle budget and that arithmetic is under
# plain pytest. `sails.SAIL_NU` is kept as the name every caller already uses.
SAIL_NU = profiles.SAIL_NU
SAIL_NV = profiles.SAIL_NV


def build_sails(p: FrigateParams) -> bpy.types.Object:
    p.validate()
    bm = bmesh.new()
    # Every sail the ship's own rig declares, whatever kind it is, in
    # `sailplan.all_sails` order: masts forward to aft, tiers bottom to top,
    # then the headsails. The frigate's nine square sails come out of this in
    # the order they always did; a schooner's gaff mainsails and jibs would
    # come out of the same loop.
    for mast, sail in sailplan.all_sails(p):
        grid = sailplan.sail_grid(p, mast, sail, SAIL_NU, SAIL_NV)
        rows = [[bm.verts.new(pt) for pt in row] for row in grid]
        for a, b in zip(rows, rows[1:]):
            for i in range(SAIL_NU - 1):
                bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Sails")
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new("Sails", mesh)
    env.link(obj)
    return obj
