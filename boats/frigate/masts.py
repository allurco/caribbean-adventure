"""Masts, yards, tops and the bowsprit. Spec section 6 step 8.

Four objects: `Masts` (three masts of three segments each), `Tops` (the top and
the crosstrees on every mast), NINE `Yard_nn` (three to a mast — the nine
sails spec section 7 asks for), and `Bowsprit`.

The yards are nine objects and not one because a yard BRACES: it turns about
its own mast, and a glTF node turns about its own origin. See `frigate.rig`.

Spars are 8-sided tapered tubes, per the spec's own budget note; yards are
6-sided, since nothing ever sees a yard end-on. Every position comes from
`profiles`, which took it from the reference painting.
"""

import math

import bmesh
import bpy
from mathutils import Vector

from . import env, prims, profiles
from .params import FrigateParams

MAST_SIDES = 8
YARD_SIDES = 6
TOP_SIDES = 8
# The platform's own thickness lives in `profiles`, which imports no bpy,
# because `wind.top_fore_edge_clearance` needs the z band a top occupies and
# that arithmetic is under plain pytest. The name every caller already uses is
# kept here.
TOP_THICK = profiles.TOP_THICK
TOP_RAIL_SECTION = 0.05    # half-section of the rail round a top
STANCHION = 0.045          # half-section of a top-rail stanchion
CLEAT_IN = 0.35            # how far inboard of the arm a stop-cleat stands
BOWSPRIT_HOOPS = (0.34, 0.66)   # iron bands, as fractions of the spar's length


def _frame(direction: Vector) -> tuple[Vector, Vector]:
    """Two unit vectors perpendicular to `direction`, for sweeping a ring."""
    up = Vector((0.0, 1.0, 0.0)) if abs(direction.z) > 0.99 else Vector((0.0, 0.0, 1.0))
    u = direction.cross(up)
    if u.length < 1e-9:
        u = direction.cross(Vector((1.0, 0.0, 0.0)))
    u.normalize()
    return u, direction.cross(u).normalized()


def _tube(bm, p0, p1, r0: float, r1: float, sides: int, divisions: int = 1) -> None:
    """A tapered, capped tube from p0 to p1, in `divisions` rings of length.

    The taper between the two stated radii is elliptical, not straight — a spar
    is full over its middle and falls away toward its head or its arm. With one
    division that curve has nowhere to show, which is why every mast segment and
    every yard half used to be a plain cone.
    """
    a, b = Vector(p0), Vector(p1)
    axis = (b - a)
    if axis.length < 1e-9:
        raise ValueError(f"degenerate spar from {p0} to {p1}")
    u, v = _frame(axis.normalized())
    rings = []
    for k in range(divisions + 1):
        f = k / divisions
        centre = a + axis * f
        radius = profiles.spar_radius(r0, r1, f)
        rings.append([
            bm.verts.new(centre + (u * math.cos(θ) + v * math.sin(θ)) * radius)
            for θ in (2 * math.pi * i / sides for i in range(sides))
        ])
    for lo, hi in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))


def _band(bm, centre, radius: float, thick: float, sides: int, axis: int = 2) -> None:
    """An iron band round a spar: an open tube, no caps."""
    cx, cy, cz = centre
    ends = []
    for d in (-thick / 2.0, thick / 2.0):
        step = [cx, cy, cz]
        step[axis] += d
        ends.append(prims.ring(bm, tuple(step), radius, sides, axis))
    prims.bridge(bm, ends, cap=False)


def _annulus(bm, centre, inner: float, outer: float, thick: float, sides: int) -> None:
    """A mast cap: a flat ring lying in the XY plane with the spar through it."""
    cx, cy, cz = centre
    rings = [prims.ring(bm, (cx, cy, cz + dz), r, sides, 2)
             for r, dz in ((outer, 0.0), (outer, thick),
                           (inner, thick), (inner, 0.0))]
    rings.append(rings[0])
    prims.bridge(bm, rings, cap=False)


def _link(bm, a, b, z0: float, z1: float, half: float) -> None:
    """A rail between two posts, as an oriented box rather than a spanning one."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    nx, ny = (-dy / length) * half, (dx / length) * half
    verts = []
    for px, py in ((ax, ay), (bx, by)):
        for sx, sy in ((-nx, -ny), (nx, ny)):
            for z in (z0, z1):
                verts.append(bm.verts.new((px + sx, py + sy, z)))
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([verts[i] for i in quad])


def _plate(bm, centre, outline, thick: float) -> None:
    """A flat platform of arbitrary plan shape, lying in the XY plane.

    It used to take a half span and a half length and sweep an ELLIPSE, which
    could only ever draw a top symmetric fore and aft. The plan shape now comes
    in from `profiles.top_outline` as (x, y) offsets from the mast axis, which
    is what lets the lower top be cut away forward of its mast.
    """
    cx, cy, cz = centre
    rings = [[bm.verts.new((cx + x, cy + y, z)) for x, y in outline]
             for z in (cz, cz + thick)]
    lo, hi = rings
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(tuple(reversed(lo)))
    bm.faces.new(tuple(hi))


def _finish(bm, name: str) -> bpy.types.Object:
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def build_mast_spars(p: FrigateParams) -> bpy.types.Object:
    bm = bmesh.new()
    for name in profiles.mast_names(p):
        for z0, z1, r0, r1 in profiles.mast_segments(p, name):
            _tube(
                bm,
                profiles.mast_point(p, name, z0),
                profiles.mast_point(p, name, z1),
                r0, r1, MAST_SIDES, profiles.MAST_DIVISIONS,
            )
    return _finish(bm, "Masts")


def build_tops(p: FrigateParams) -> bpy.types.Object:
    """The top and crosstrees on every mast, with the ironwork that holds them.

    Everything that is not a bare plate lives here rather than on `Masts`,
    because `check_masts` holds every vertex of `Masts` inside the widest mast
    radius — that is what "the whole rig stands on the centreline" means — and
    a cap and a pair of trestletrees are, correctly, wider than the spar.
    """
    bm = bmesh.new()
    # `tops_on`, not `mast_names`: a mast with no fighting top carries no
    # platform, no crosstrees and no cap, and building one on it is building
    # a platform of zero span -- which is a ZeroDivisionError in the outline,
    # not a small platform. A schooner's masts carry none at all and a
    # galleon's LATEEN mizzen carries none either: there is no yard to work
    # from. All three of the frigate's masts have one, so she does not move.
    for name in profiles.tops_on(p):
        for which in (0, 1):
            z = (profiles.top_platform(p, name) if which == 0
                 else profiles.crosstrees(p, name))[0]
            axis = profiles.mast_point(p, name, z)
            # Trestletrees fore and aft of the spar, with cross timbers over
            # them: the frame the platform is actually laid on. Their two arms
            # are measured from the mast axis separately, because the lower top
            # they frame reaches further aft than forward.
            tz, gap, aft, fwd, thick = profiles.trestletrees(p, name, which)
            ax, ay, _az = profiles.mast_point(p, name, tz)
            for sign in (-1.0, 1.0):
                prims.box(bm, (ax + sign * gap - thick / 2, ay - aft, tz - 0.26),
                          (ax + sign * gap + thick / 2, ay + fwd, tz))
            for at in (-aft * 0.8, 0.0, fwd * 0.8):
                yc = ay + at
                prims.box(bm, (ax - gap - thick, yc - thick / 2, tz - 0.14),
                          (ax + gap + thick, yc + thick / 2, tz - 0.03))

            _plate(bm, axis, profiles.top_outline(p, name, which), TOP_THICK)

            cz, inner, outer, cap_thick = profiles.mast_cap(p, name, which)
            cap_at = profiles.mast_point(p, name, cz + TOP_THICK + 0.03)
            _annulus(bm, cap_at, inner, outer, cap_thick, TOP_SIDES)

        # A rail round the lower top, which is the one anybody stands on.
        z, _hx, _hy = profiles.top_platform(p, name)
        ax, ay, _az = profiles.mast_point(p, name, z)
        base, head = z + TOP_THICK, z + TOP_THICK + profiles.TOP_RAIL_H
        posts = [(ax + x, ay + y) for x, y in profiles.top_rail_posts(p, name)]
        for px, py in posts:
            prims.box(bm, (px - STANCHION, py - STANCHION, base),
                      (px + STANCHION, py + STANCHION, head))
        for a, b in zip(posts, posts[1:] + posts[:1]):
            _link(bm, a, b, head - 2 * TOP_RAIL_SECTION, head, TOP_RAIL_SECTION)
    return _finish(bm, "Tops")


def _one_yard(bm, p: FrigateParams, name: str, z: float, length: float,
              radius: float) -> None:
    """One yard, in WORLD space, into whatever bmesh it is given."""
    _x, y, _z = profiles.mast_point(p, name, z)
    # A yard tapers from the slings to both arms, so it is two tubes.
    for sign in (-1.0, 1.0):
        _tube(bm, (0.0, y, z), (sign * length / 2, y, z),
              radius, radius * 0.45, YARD_SIDES, profiles.YARD_DIVISIONS)
        # A stop-cleat inboard of the arm, which is what keeps the lift and
        # the brace pendant from rendering off the yardarm.
        xc = sign * (length / 2 - CLEAT_IN)
        r = profiles.spar_radius(radius, radius * 0.45,
                                 1.0 - CLEAT_IN / (length / 2))
        prims.box(bm, (min(xc, xc - sign * 0.11), y - r - 0.05, z - r - 0.05),
                  (max(xc, xc - sign * 0.11), y + r + 0.05, z + r + 0.05))


def build_yards(p: FrigateParams) -> list[bpy.types.Object]:
    """NINE objects, one per yard, each with its origin on its own mast.

    It used to be one merged mesh sitting at the world origin, which could
    only ever turn about the ship's keel. A yard BRACES — it swings about the
    mast it is slung on — so each one is now its own node with its origin at
    its own slings and its local Z lying along its own mast's raked axis.
    `frigate.rig` rules where those go; this only emits.

    THE SPLIT IS PROVED AGAINST THE MERGE IT REPLACES, EVERY BUILD. The old
    merged mesh is built first, into a throwaway bmesh, purely to be the
    reference the nine are measured against. If splitting ever moves a vertex
    in world space — which is the one thing re-origining must not do, and the
    one thing that looks identical in the viewport — this raises here instead
    of shipping a ship whose yards have crept.
    """
    from . import rig

    reference = bmesh.new()
    for name in profiles.mast_names(p):
        for z, length, radius in profiles.yard_specs(p, name):
            _one_yard(reference, p, name, z, length, radius)
    want = [tuple(v.co) for v in reference.verts]
    reference.free()

    out = []
    for index, (name, tier) in enumerate(rig.yard_order(p)):
        z, length, radius = profiles.yard_specs(p, name)[tier]
        bm = bmesh.new()
        _one_yard(bm, p, name, z, length, radius)
        obj = _finish(bm, rig.yard_name(index))
        # Local Z on the mast's own axis, so bracing is ONE channel. The mast
        # rakes aft, which is a rotation about X of exactly its own rake.
        prims.set_pivot(obj, rig.yard_pivots(p)[index].point,
                        (math.radians(profiles.mast_rake_deg(p, name)), 0.0, 0.0))
        out.append(obj)
    prims.same_world_points(
        want, [tuple(o.matrix_world @ v.co) for o in out for v in o.data.vertices])
    return out


def build_lateen_yards(p: FrigateParams) -> list[bpy.types.Object]:
    """One object per lateen yard. None on a ship that sets no lateen sail.

    A SEPARATE OBJECT and not part of `Masts`, for the same reason the square
    yards are nine objects: a lateen yard swings. It is one object and not
    one-per-mast-and-tier because a lateen mast sets exactly one, which is
    what makes it a lateen mast.

    DEFECT 12: IT SWUNG ABOUT NOTHING. `rig.lateen_pivots` gave this spar a
    pivot at its own slings turning about its own mast's raked axis, and that
    rule was measured and ruled and tested — but THIS FUNCTION, the emitter,
    was never told. The object kept the origin `_finish` gives it, the world
    origin, with no rotation, exactly as it had when it was a static node.

    Caught by `check_export`, which had never run on this ship because the
    galleon had never been exported. Measured, both ends of each figure
    named: the object's origin stood at (0, 0, 0) where its pivot point is
    (0, -10.5747, 11.2057) -- 9.9738 m off the axis it turns about, against
    0.002 m allowed -- and its own local Z (0, 0, 1) leaned 3.000 deg off
    that axis, which is the mizzen's rake, so no single channel could animate
    it. Every square yard already had both: `Yard_04`'s origin IS its pivot
    point (0, -1.0908, 26.877) and its euler carries the main's 1.000 deg.

    So it is given exactly what `build_yards` gives a square yard, and proved
    the same way: re-origining must not move a vertex in world space, which
    is the one thing that looks identical in the viewport.
    """
    from . import rig

    pivots = {piv.part: piv for piv in rig.lateen_pivots(p)}
    out = []
    for name in profiles.lateen_masts(p):
        heel, slings, peak, radius = profiles.lateen_spar(p, name)
        tip = radius * p.rig.lateen.tip_taper
        bm = bmesh.new()
        # Two tubes meeting at the slings, so the spar is full where it
        # crosses its mast and falls away to both ends -- which is what a
        # lateen yard is, and what one tube from heel to peak would not be.
        for end in (heel, peak):
            _tube(bm, slings, end, radius, tip, YARD_SIDES,
                  profiles.YARD_DIVISIONS)
        want = [tuple(v.co) for v in bm.verts]
        obj = _finish(bm, f"Lateen_{name.capitalize()}")
        # Local Z on the mast's own axis, so swinging is ONE channel. The
        # mast rakes aft, which is a rotation about X of exactly its own rake.
        prims.set_pivot(obj, pivots[obj.name].point,
                        (math.radians(profiles.mast_rake_deg(p, name)), 0.0, 0.0))
        prims.same_world_points(
            want, [tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
        out.append(obj)
    return out


def build_gaffs(p: FrigateParams) -> list[bpy.types.Object]:
    """One object per gaff and per boom. None on a ship that sets no gaff.

    Separate objects for the lateen yard's reason: each swings about its own
    mast, so each is given the pivot `rig.gaff_pivots` rules, at its jaws on
    the mast's raked axis, and re-origining is proved not to move a vertex.
    The spar is one tube tapering from its jaws to its end
    (`sailplan.gaff_spars`).
    """
    from . import rig, sailplan

    pivots = {piv.part: piv for piv in rig.gaff_pivots(p)}
    out = []
    for name in profiles.mast_names(p):
        for key, (root, tip, r0, r1) in sailplan.gaff_spars(p, name).items():
            bm = bmesh.new()
            _tube(bm, root, tip, r0, r1, YARD_SIDES,
                  2 * profiles.YARD_DIVISIONS)
            want = [tuple(v.co) for v in bm.verts]
            obj = _finish(bm, rig.gaff_name(name, key))
            prims.set_pivot(obj, pivots[obj.name].point,
                            (math.radians(profiles.mast_rake_deg(p, name)),
                             0.0, 0.0))
            prims.same_world_points(
                want,
                [tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
            out.append(obj)
    return out


def build_bowsprit(p: FrigateParams) -> bpy.types.Object:
    bm = bmesh.new()
    heel, tip, r0, r1 = profiles.bowsprit_segment(p)
    _tube(bm, heel, tip, r0, r1, MAST_SIDES, profiles.BOWSPRIT_DIVISIONS)
    axis = Vector(tip) - Vector(heel)
    for f in BOWSPRIT_HOOPS:
        centre = Vector(heel) + axis * f
        _band(bm, centre, profiles.spar_radius(r0, r1, f) + 0.025, 0.10, MAST_SIDES, 1)
    return _finish(bm, "Bowsprit")


def build_masts(p: FrigateParams) -> list[bpy.types.Object]:
    p.validate()
    return [
        build_mast_spars(p),
        build_tops(p),
        *build_yards(p),
        *build_lateen_yards(p),
        *build_gaffs(p),
        build_bowsprit(p),
    ]
