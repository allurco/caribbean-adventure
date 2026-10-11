"""Gunport apertures cut from the bulwark quad grid by face selection.

Spec section 6 step 5. The grid already carries a seam at every port edge --
`profiles.bulwark_ts` puts it there -- so this pass only has to *find* the
faces that lie inside a port and remove them. It never moves a seam, never
widens a box, and never chooses how tall an aperture is: the row comes from
`profiles.gunport_rows`, which derives one per gun deck from its own sill.
Every row of ports in `p.gun_decks` is cut in the same sweep, so a two-decker
needs nothing here but a second row in its parameters.

Six of the eleven ports straddle a hull station and so span two bands. That is
correct and is why the selection works on a region rather than on single faces.
If a port selects nothing the grid is wrong, and `profiles.gunport_bands`
raises rather than letting a silent no-op ship.
"""

import bmesh
import bpy
from mathutils import Vector

from . import env, profiles
from .params import FrigateParams

SELECT_EPS = 1e-3   # m; narrowest aperture band is 60 mm, so this is 30x clear


def _offset_of(p: FrigateParams, verts) -> float:
    """Height above the sheer, measured over a face's or edge's OWN corners.

    See `profiles.offset_above_sheer` for why this is not the sheer under the
    centroid: that is the sheer at an interpolated station, and the sheer is
    a curve.
    """
    return profiles.offset_above_sheer(p, [tuple(v.co) for v in verts])


def cut_gunports(p: FrigateParams) -> dict:
    """Open every gunport through both bulwark skins and line the hole.

    Returns a summary; raises if the selection does not find exactly the faces
    the grid says are there, because a short count means the grid has drifted
    and the fix belongs there rather than in a looser box.
    """
    p.validate()
    hull_summary = cut_hull_ports(p)
    obj = env.obj("Bulwarks")
    rows = [d for d in range(len(p.gun_decks))
            if p.gun_decks[d].host == "bulwark"]
    boxes = [box for d in rows for box in profiles.gunport_boxes(p, d)]
    bands = [idx for d in rows for idx in profiles.gunport_bands(p, d)]
    expected = 2 * 2 * sum(len(idx) for idx in bands)   # both skins, both sides

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    def key_of(verts):
        """Which aperture and which side of the ship a face or edge belongs to."""
        co = sum((v.co for v in verts), Vector()) / len(verts)
        off = _offset_of(p, verts)
        for k, (y_aft, y_fwd, z_lo, z_hi) in enumerate(boxes):
            if y_aft + SELECT_EPS < co.y < y_fwd - SELECT_EPS and \
               z_lo + SELECT_EPS < off < z_hi - SELECT_EPS:
                return (k, co.x > 0)
        return None

    doomed = []
    for face in bm.faces:
        if key_of(face.verts) is not None:
            doomed.append(face)

    if len(doomed) != expected:
        bm.free()
        raise ValueError(
            f"gunport selection found {len(doomed)} faces, expected {expected}; "
            "the bulwark grid is wrong -- do not widen the selection box"
        )

    # 'FACES' also drops the edge left stranded between two bands of one
    # aperture; its end vertices survive on the sill and head edges either side.
    bmesh.ops.delete(bm, geom=doomed, context="FACES")

    # Line each opening: bridge the outer rim to the inner rim so the bulwark
    # reads as timber with thickness rather than as paper.
    rims: dict[tuple, list] = {}
    for edge in bm.edges:
        if len(edge.link_faces) >= 2:
            continue
        mid = (edge.verts[0].co + edge.verts[1].co) / 2
        off = _offset_of(p, edge.verts)
        for k, (y_aft, y_fwd, z_lo, z_hi) in enumerate(boxes):
            if y_aft - SELECT_EPS < mid.y < y_fwd + SELECT_EPS and \
               z_lo - SELECT_EPS <= off <= z_hi + SELECT_EPS:
                rims.setdefault((k, mid.x > 0), []).append(edge)
                break

    lined = 0
    for key, edges in sorted(rims.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        result = bmesh.ops.bridge_loops(bm, edges=edges)
        lined += len(result["faces"])

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()

    return {
        "apertures": 2 * len(boxes) + hull_summary["apertures"],
        "faces_removed": len(doomed),
        "lining_faces": lined,
        "faces": len(obj.data.polygons),
        "hull": hull_summary,
    }


def _inside(co, off, box, eps):
    y_aft, y_fwd, z_lo, z_hi = box
    return y_aft + eps < co.y < y_fwd - eps and z_lo + eps < off < z_hi - eps


def cut_hull_ports(p: FrigateParams) -> dict:
    """Cut every HULL row through the hull skin and its ceiling, and line it.

    The hull loft already carries a station at every hull port edge and a
    ring point at every hull row's sill and head (`profiles.station_ts`,
    `profiles.hull_seam_indices`), so this only FINDS the faces inside each
    port and removes them, from the skin and from the ceiling inboard of it.
    No boolean: the skin is a creased Catmull-Clark cage, and its rims are
    creased and split here exactly as the gunwale is, with the four corners
    pinned, or the subsurf would round each port into a lozenge.

    The lining — sill, head and both cheeks — belongs to the ceiling object
    and is bridged from the ceiling's rim out to the hull skin's own rim
    points, so it reads as timber with the side's thickness.
    """
    boxes = [box for _d, box in profiles.all_hull_gunport_boxes(p)]
    if not boxes:
        return {"apertures": 0}
    bands = [idx for d in range(len(p.gun_decks))
             if p.gun_decks[d].host == "hull"
             for idx in profiles.hull_gunport_bands(p, d)]
    expected = 2 * sum(len(idx) for idx in bands)   # both sides, one row tall

    def doomed_faces(bm):
        return [f for f in bm.faces
                if any(_inside(f.calc_center_median(), _offset_of(p, f.verts),
                               box, SELECT_EPS) for box in boxes)]

    # --- the skin -------------------------------------------------------
    hull = env.obj("Hull")
    bm = bmesh.new()
    bm.from_mesh(hull.data)
    n_verts = len(bm.verts)
    doomed = doomed_faces(bm)
    if len(doomed) != expected:
        bm.free()
        raise ValueError(
            f"hull gunport selection found {len(doomed)} faces, expected "
            f"{expected}; the hull loft is wrong -- do not widen the box")
    bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
    loose = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="EDGES")
    if len(bm.verts) != n_verts:
        bm.free()
        raise ValueError("cutting the hull ports dropped a loft vertex")
    bm.to_mesh(hull.data)
    bm.free()
    mesh = hull.data
    rims = profiles.hull_port_rim_edges(p)
    creases = mesh.edge_creases_ensure()
    marked = 0
    for e in mesh.edges:
        if frozenset(e.vertices) in rims:
            creases.data[e.index].value = 1.0
            e.use_edge_sharp = True
            marked += 1
    if marked != len(rims):
        raise ValueError(
            f"marked {marked} hull port rim edges hard, expected {len(rims)}")
    ring_len = profiles.hull_ring_len(p)
    corners = mesh.vertex_creases_ensure()
    for loop in profiles.hull_port_rims(p):
        for s, i in (loop[0], loop[len(loop) // 2 - 1],
                     loop[len(loop) // 2], loop[-1]):
            corners.data[s * ring_len + i].value = 1.0
    mesh.update()

    # --- the ceiling, pierced and lined ----------------------------------
    from .decks import ceiling_name

    lining = 0
    for tier in profiles.hull_tiers(p):
        lining += _pierce_ceiling(p, env.obj(ceiling_name(tier)), boxes)
    return {"apertures": 2 * len(boxes), "hull_faces_removed": len(doomed),
            "rim_edges": marked, "lining_faces": lining}


def _pierce_ceiling(p: FrigateParams, obj, boxes) -> int:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [f for f in bm.faces
              if any(_inside(f.calc_center_median(), _offset_of(p, f.verts),
                             box, SELECT_EPS) for box in boxes)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    outer = {}

    def skin(v):
        if v not in outer:
            x, y, z = v.co
            t = profiles.t_of_y(p, y)
            w = profiles.hull_half_width(p, t, z)
            outer[v] = bm.verts.new((w if x > 0 else -w, y, z))
        return outer[v]

    made = 0
    for edge in list(bm.edges):
        if len(edge.link_faces) != 1:
            continue
        mid = (edge.verts[0].co + edge.verts[1].co) / 2
        off = _offset_of(p, edge.verts)
        box = next((b for b in boxes
                    if b[0] - SELECT_EPS < mid.y < b[1] + SELECT_EPS
                    and b[2] - SELECT_EPS <= off <= b[3] + SELECT_EPS), None)
        if box is None:
            continue
        a, b = edge.verts
        face = bm.faces.new((a, b, skin(b), skin(a)))
        # The lining faces INTO the aperture: toward the port's own axis.
        face.normal_update()
        axis_y = 0.5 * (box[0] + box[1])
        axis_off = 0.5 * (box[2] + box[3])
        c = face.calc_center_median()
        to_axis = Vector((0.0, axis_y - c.y,
                          axis_off - _offset_of(p, face.verts)))
        if face.normal.dot(to_axis) < 0.0:
            face.normal_flip()
        made += 1
    bm.normal_update()
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return made
