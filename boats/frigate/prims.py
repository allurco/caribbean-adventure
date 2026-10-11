"""Small bmesh primitives shared by the fittings tasks.

Tasks 6-11 each grew their own `_box` and `_ring`. From Task 12 on they live
here instead; the earlier modules were left alone rather than refactored under
passing checks.
"""

import math

import bmesh
import bpy

from . import env


def box(bm, lo, hi):
    """An axis-aligned box from two opposite corners."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in quad])


def ring(bm, centre, radius, sides, axis):
    """A circle of `sides` points about `centre`, its normal along axis 0=X/1=Y/2=Z."""
    cx, cy, cz = centre
    out = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        c, s = radius * math.cos(a), radius * math.sin(a)
        pt = ((cx, cy + c, cz + s) if axis == 0 else
              (cx + c, cy, cz + s) if axis == 1 else
              (cx + c, cy + s, cz))
        out.append(bm.verts.new(pt))
    return out


def bridge(bm, rings, closed=True, cap=True):
    """Bridge a list of equal-length rings into a tube."""
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap and closed:
        bm.faces.new(tuple(reversed(rings[0])))
        bm.faces.new(tuple(rings[-1]))


def cylinder(bm, centre, radius, sides, axis, length, taper=1.0):
    """A capped cylinder of `length` along `axis`, starting at `centre`."""
    step = [0.0, 0.0, 0.0]
    step[axis] = length
    far = tuple(c + s for c, s in zip(centre, step))
    bridge(bm, [ring(bm, centre, radius, sides, axis),
                ring(bm, far, radius * taper, sides, axis)])


def torus(bm, centre, major: float, minor: float, segments: int, sides: int = 4):
    """A ring lying in the XZ plane — a ship's wheel rim, seen from forward.

    The loop closes by reusing its own first ring rather than by welding a
    duplicate away afterwards. `remove_doubles` would have run over every
    vertex in the bmesh, including whatever else had already been built into
    it, and two fittings that happen to share a corner are not the same vertex.
    """
    cx, cy, cz = centre
    rings = []
    for s in range(segments):
        a = 2 * math.pi * s / segments
        hub = (cx + major * math.cos(a), cy, cz + major * math.sin(a))
        out = (math.cos(a), 0.0, math.sin(a))
        rings.append([
            bm.verts.new((
                hub[0] + minor * (math.cos(b) * out[0]),
                hub[1] + minor * math.sin(b),
                hub[2] + minor * (math.cos(b) * out[2]),
            ))
            for b in (2 * math.pi * i / sides for i in range(sides))
        ])
    rings.append(rings[0])
    bridge(bm, rings, cap=False)


def finish(bm, name: str, smooth: bool = False,
           recalc: bool = True) -> bpy.types.Object:
    """Link `bm` as object `name`. `recalc` turns every connected region's
    faces outward; a mesh of isolated flat cards has no outward, and
    recalculating one flips cards at whim, so it keeps its own winding."""
    bm.normal_update()
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def mesh_only(bm, name: str) -> bpy.types.Mesh:
    """Like `finish`, but returns the datablock for linked duplicates to share."""
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def set_pivot(obj, point, rotation=(0.0, 0.0, 0.0), tol: float = 1e-5) -> float:
    """Move an object's ORIGIN to `point`, WITHOUT moving a vertex in the world.

    A glTF node animates about its own origin, so every part that turns needs
    its origin on the line it turns about. Everything in this project is built
    in world space with the object left at (0, 0, 0), which is why the merged
    parts can only turn about the ship's keel.

    The object is given the new transform and the mesh is taken through the
    inverse, so the world positions come out the same. That is ASSERTED
    rather than assumed: the worst vertex displacement is measured before and
    after and returned, and anything over `tol` raises. A re-origin that
    moved the ship would otherwise look exactly like a re-origin that did not.

    Refuses a shared mesh datablock. `obj.data.transform` moves the mesh, not
    the object, so doing this to one of 24 cannons would move the other 23.
    """
    from mathutils import Euler, Matrix, Vector

    if obj.data.users != 1:
        raise ValueError(
            f"{obj.name} shares its mesh with {obj.data.users - 1} other "
            f"object(s); re-origining it would move them too"
        )
    before = [obj.matrix_world @ v.co.copy() for v in obj.data.vertices]
    target = Matrix.Translation(Vector(point)) \
        @ Euler(tuple(rotation), "XYZ").to_matrix().to_4x4()
    obj.data.transform(target.inverted() @ obj.matrix_world)
    obj.matrix_world = target
    obj.data.update()
    worst = max((a - (obj.matrix_world @ v.co)).length
                for a, v in zip(before, obj.data.vertices)) if before else 0.0
    if worst > tol:
        raise RuntimeError(
            f"re-origining {obj.name} moved a vertex {worst:.3e} m in world "
            f"space, which is more than the {tol:.0e} m allowed"
        )
    return worst


def same_world_points(left, right, tol: float = 1e-5) -> float:
    """The worst gap between two sets of world points that must be the same set.

    This answers "did splitting this mesh move anything", so it is a SPATIAL
    match and not a sorted walk. The first cut of it sorted both lists on
    coordinates rounded to six decimals and compared them in step; it
    reported the yards 0.253 m out on a split that had not moved anything,
    because rounding x from ...4565 to ...456 or ...457 reorders two points
    whose y are a quarter of a metre apart. Lexicographic order is not stable
    under float noise and the quantity under test is a DISTANCE.

    Points are bucketed into cells `tol * 10` across and each point on the
    right is matched to an unused point on the left within `tol`, searching
    its own cell and the twenty-six around it so a pair that straddles a cell
    boundary still finds itself. Raises on the first point with no partner,
    and on two sets of different size, because a split that lost a vertex is
    not a split.
    """
    if len(left) != len(right):
        raise ValueError(
            f"the split has {len(right)} vertices where the merged mesh had "
            f"{len(left)}"
        )
    cell = tol * 10.0
    buckets = {}
    for i, pt in enumerate(left):
        buckets.setdefault(tuple(int(math.floor(c / cell)) for c in pt),
                           []).append(i)
    taken = [False] * len(left)
    worst = 0.0
    for pt in right:
        home = tuple(int(math.floor(c / cell)) for c in pt)
        best, best_d = None, None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for i in buckets.get((home[0] + dx, home[1] + dy,
                                          home[2] + dz), ()):
                        if taken[i]:
                            continue
                        d = math.sqrt(sum((a - b) ** 2
                                          for a, b in zip(left[i], pt)))
                        if best_d is None or d < best_d:
                            best, best_d = i, d
        if best is None or best_d > tol:
            raise RuntimeError(
                f"splitting the mesh moved a vertex: {tuple(round(c, 4) for c in pt)} "
                f"has no partner within {tol:.0e} m in the merged mesh "
                f"(nearest {best_d if best_d is not None else float('inf'):.3e})"
            )
        taken[best] = True
        worst = max(worst, best_d)
    return worst
