"""Loft the station rings into a hull skin."""

import bmesh
import bpy

from . import env
from .params import FrigateParams
from .profiles import all_stations


def _mark_hard_edges(mesh: bpy.types.Mesh, ring_len: int, n_rings: int) -> int:
    """Make the gunwale and both end-cap rims hard, in BOTH senses of hard.

    `profiles.hull_hard_edges` decides WHICH edges those are; this only applies
    the decision, because which ones they are is pure loft topology and belongs
    under plain pytest.

    Hard means two separate things and this used to do only one of them.

    * CREASE 1.0 pins the Catmull-Clark limit surface to the control cage.
      Without it the deck edge is pulled inboard and the bulwark, built on cage
      math, overhangs the rendered hull.
    * SHARP splits the shading. Without it the smooth normals are averaged
      straight across an edge the geometry treats as a corner. On the stem that
      averaged the flat, forward-facing cap into the side planking and swung
      the interpolated normal 41.3 deg off the surface, dropping its lambert
      term from 0.739 to 0.110 — the black wedge that stood on the bow from
      `e35c41a` until this was written. `check_shading` holds the two sets equal.

    Returns the number of edges marked.
    """
    from .profiles import hull_hard_edges

    hard = hull_hard_edges(ring_len, n_rings)
    layer = mesh.edge_creases_ensure()
    values = [0.0] * len(mesh.edges)
    marked = 0
    for e in mesh.edges:
        if frozenset(e.vertices) not in hard:
            continue
        values[e.index] = 1.0
        e.use_edge_sharp = True
        marked += 1
    layer.data.foreach_set("value", values)
    return marked


def build_hull(p: FrigateParams) -> bpy.types.Object:
    from .profiles import hull_open_top_bands

    rings = all_stations(p)
    ring_len = len(rings[0])
    open_top = set(hull_open_top_bands(p))

    bm = bmesh.new()
    ring_verts = [[bm.verts.new(pt) for pt in ring] for ring in rings]
    bm.verts.ensure_lookup_table()

    # Bridge consecutive stations into a quad skin. The ring is closed, so the
    # final quad of each band wraps from the last point back to the first:
    # that quad is the hull's closing face at the sheer, across the ship,
    # and it is left out over a chase platform (`hull_open_top_bands`),
    # where the carriages standing below the sheer would rise through it.
    for band, (a, b) in enumerate(zip(ring_verts, ring_verts[1:])):
        for i in range(ring_len):
            j = (i + 1) % ring_len
            if j == 0 and band in open_top:
                continue
            bm.faces.new((a[i], a[j], b[j], b[i]))

    # Close the stem and the transom so the hull is a solid, not a tube.
    bm.faces.new(tuple(reversed(ring_verts[0])))
    bm.faces.new(tuple(ring_verts[-1]))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("Hull")
    bm.to_mesh(mesh)
    bm.free()
    _mark_hard_edges(mesh, ring_len, len(rings))
    mesh.shade_smooth()

    obj = bpy.data.objects.new("Hull", mesh)
    env.link(obj)

    mod = obj.modifiers.new("Subdivision", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    return obj
