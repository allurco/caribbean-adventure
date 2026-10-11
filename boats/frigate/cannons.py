"""One cannon, one port lid, forty-eight objects. Spec section 6 step 11.

Spec section 5's whole affordability argument rests on this task: in Blender
`obj.data` is a datablock separate from the object, so 24 cannon objects share
ONE mesh. Unique geometry is 1x even though drawn triangles are 24x. The check
asserts the sharing, because a copied mesh would look identical and quietly
cost 24 times the memory and file size.

The cannon is authored once in its own frame: origin at the breech end ON THE
DECK, local +X toward the muzzle, barrel axis at `p.gun_trunnion_h` (one
figure per ship, since the mesh is shared). Everything that varies between
stations — deck camber, how far outboard the port is — is
absorbed by the placement matrix, never by the geometry.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix

from . import env, profiles
from .params import FrigateParams

BARREL_SIDES = 8
WHEEL_SIDES = 6
BARREL_RINGS = profiles.GUN_BARREL_RINGS
TRUNNION_X = 0.70
TRUNNION_R = 0.075
TRUNNION_OUT = 0.21
CHEEK_X = profiles.GUN_CHEEK_X
CHEEK_Y = (0.22, 0.34)
CHEEK_Z0 = 0.18
BED_Z = (0.10, 0.22)
WHEEL_R = profiles.GUN_TRUCK_R
WHEEL_T = profiles.GUN_TRUCK_T
WHEEL_X = profiles.GUN_TRUCK_X
WHEEL_Y = profiles.GUN_TRUCK_Y
MAX_CANNON_TRIS = 250   # spec section 10's fallback trigger


def _ring(bm, centre, radius, sides, axis):
    """A circle of `sides` points about `centre`, normal along `axis` (0=X, 1=Y)."""
    cx, cy, cz = centre
    out = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        if axis == 0:
            out.append(bm.verts.new((cx, cy + radius * math.cos(a), cz + radius * math.sin(a))))
        else:
            out.append(bm.verts.new((cx + radius * math.cos(a), cy, cz + radius * math.sin(a))))
    return out


def _bridge(bm, rings, cap=True):
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(tuple(reversed(rings[0])))
        bm.faces.new(tuple(rings[-1]))


def _box(bm, lo, hi):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in quad])


def _cannon_mesh(p: FrigateParams) -> bpy.types.Mesh:
    axis_z = p.gun_trunnion_h
    bm = bmesh.new()
    _bridge(bm, [_ring(bm, (x, 0.0, axis_z), r, BARREL_SIDES, 0) for x, r in BARREL_RINGS])
    for sign in (-1.0, 1.0):
        _bridge(bm, [
            _ring(bm, (TRUNNION_X, sign * out, axis_z), TRUNNION_R, WHEEL_SIDES, 1)
            for out in (0.0, TRUNNION_OUT)
        ])
    for sign in (-1.0, 1.0):
        _box(bm,
             (CHEEK_X[0], sign * CHEEK_Y[0], CHEEK_Z0),
             (CHEEK_X[1], sign * CHEEK_Y[1], axis_z - 0.03))
    _box(bm, (CHEEK_X[0], -CHEEK_Y[1], BED_Z[0]), (CHEEK_X[1], CHEEK_Y[1], BED_Z[1]))
    for wx in WHEEL_X:
        for sign in (-1.0, 1.0):
            _bridge(bm, [
                _ring(bm, (wx, sign * y, WHEEL_R), WHEEL_R, WHEEL_SIDES, 1)
                for y in (WHEEL_Y - WHEEL_T / 2, WHEEL_Y + WHEEL_T / 2)
            ])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Cannon")
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def _lid_mesh(p: FrigateParams) -> bpy.types.Mesh:
    """Hinge along local Y at the origin; the lid reaches out along +X.

    At identity it stands straight out, which is a lid open 90 degrees. The
    placement pitches it back down by (90 - open).
    """
    bm = bmesh.new()
    _box(bm, (0.0, -profiles.LID_W / 2, -profiles.LID_THICK),
         (profiles.LID_H, profiles.LID_W / 2, 0.0))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("PortLid")
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def _place(obj, origin, yaw_deg: float, pitch_deg: float = 0.0) -> None:
    rot = Euler((0.0, math.radians(pitch_deg), math.radians(yaw_deg)), "XYZ")
    obj.matrix_world = Matrix.Translation(origin) @ rot.to_matrix().to_4x4()


def build_battery(p: FrigateParams) -> list[bpy.types.Object]:
    """24 guns and 24 lids, each set sharing a single mesh datablock."""
    p.validate()
    gun_mesh = _cannon_mesh(p)
    lid_mesh = _lid_mesh(p)
    built = []
    for i, gun in enumerate(profiles.gun_placements(p)):
        obj = bpy.data.objects.new(f"Cannon_{i:02d}", gun_mesh)
        env.link(obj)
        _place(obj, gun["origin"], gun["yaw_deg"])
        built.append(obj)
    for i, lid in enumerate(profiles.lid_placements(p)):
        obj = bpy.data.objects.new(f"PortLid_{i:02d}", lid_mesh)
        env.link(obj)
        # A hull-row lid shuts onto a skin that leans out by `lean_deg`.
        _place(obj, lid["hinge"], lid["yaw_deg"], profiles.lid_pitch_deg(lid))
        built.append(obj)
    return built
