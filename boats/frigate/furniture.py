"""Wheel, capstan, hatches, boat, barrels, anchors, lanterns, gratings.

The WHEEL is its own object, because it turns. Its two standards are not: a
pedestal bolted to the quarterdeck stays in `Deck_Furniture`. See `frigate.rig`.

Spec section 6 step 12.

Where each piece stands is `profiles.furniture_placements`, which puts it on
whichever deck is actually uppermost at that station — the helmsman stands on
the quarterdeck, not on the gun deck 1.2 m under it. What each piece is SHAPED
like is partly here and partly in `profiles`: the launch's sections and thwarts
and a grating's lattice are arithmetic, so they live there under pytest, and
only the bmesh emission is here.

Repeated fittings (barrels, anchors, lanterns) are linked duplicates sharing one
mesh each, the same technique spec section 5 relies on for the battery. Enriching
one of those meshes is paid for once and drawn eight times, so the unique
geometry is where the detail goes.

`Gratings` is its own object because spec section 5 counts gratings against the
DECKS line ("Decks, gratings, hatch coamings"), not against deck furniture,
even though they are emitted here with the coamings they drop into.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix

from . import env, prims, profiles
from .params import FrigateParams

WHEEL_R = 0.58
WHEEL_RIM = 0.055
WHEEL_PEDESTAL = 0.35
WHEEL_SPOKES = 10
WHEEL_RIM_SEGMENTS = 16
WHEEL_HANDLE = 0.17        # how far a spoke end stands outside the rim

CAPSTAN_SIDES = 10
CAPSTAN_R = (0.38, 0.33, 0.30, 0.36, 0.44)
CAPSTAN_Z = (0.0, 0.30, 0.72, 0.86, 0.95)
CAPSTAN_WHELPS = 8
CAPSTAN_BARS = 4
CAPSTAN_BAR_LEN = profiles.CAPSTAN_BAR_LEN

# The envelopes a deck plan is laid out against live in `profiles`, bpy-free,
# so a plan (the frigate's or the galleon's) is measured under plain pytest.
HATCH = profiles.HATCH   # length, width, coaming height, coaming thickness
BOAT = profiles.BOAT     # length, half beam, depth

BARREL_SIDES = 10
BARREL_R = (0.26, 0.30, 0.32, 0.30, 0.26)
BARREL_Z = (0.0, 0.18, 0.35, 0.52, 0.70)
BARREL_HOOPS = (0.10, 0.35, 0.60)
BARREL_HOOP_PROUD = 0.022

ANCHOR = (profiles.ANCHOR_SHANK, profiles.ANCHOR_STOCK, profiles.ANCHOR_ARM)
# shank length, stock span, arm reach. They live in `profiles` because the
# anchor's PLACEMENT is derived from its size -- see `anchor_bearing_x`.
# Everything else about the anchor's SHAPE is `profiles`' arithmetic, under
# plain pytest, so the other three hulls inherit the shape and not just the
# placement. Only how many sides a swept section carries is here, because that
# is a triangle-budget decision and nothing else reads it.
ANCHOR_SIDES = 8                   # a chamfered square, in section
ANCHOR_FLUKE_SIDES = 6             # a blade is a lens, not a plank

LANTERN_R = 0.18
LANTERN_H = 0.55
LANTERN_SIDES = 6
LANTERN_POST = 0.028


def _place(obj, origin, yaw_deg: float) -> None:
    rot = Euler((0.0, 0.0, math.radians(yaw_deg)), "XYZ")
    obj.matrix_world = Matrix.Translation(origin) @ rot.to_matrix().to_4x4()


def _stack(bm, centre, radii, heights, sides, axis=2, caps=True):
    """Bridge a run of rings of varying radius — a barrel, a capstan, a mast."""
    cx, cy, cz = centre
    rings = []
    for r, h in zip(radii, heights):
        step = [cx, cy, cz]
        step[axis] += h
        rings.append(prims.ring(bm, tuple(step), r, sides, axis))
    prims.bridge(bm, rings, cap=caps)
    return rings


def _hoop(bm, centre, radius, z0, z1, sides):
    """A band standing proud of a barrel or a stock: an open tube, no caps."""
    cx, cy, cz = centre
    prims.bridge(bm, [prims.ring(bm, (cx, cy, cz + z), radius, sides, 2)
                      for z in (z0, z1)], cap=False)


def _spar(bm, centre, heading: float, length: float, half_w: float, half_h: float):
    """A box lying in the deck plane, heading `heading` radians off +X.

    Built from eight corners rather than from an axis-aligned span, because the
    axis-aligned bounding box of a diagonal capstan bar is not a capstan bar.
    """
    cx, cy, cz = centre
    c, s = math.cos(heading), math.sin(heading)
    verts = []
    for along in (-length, length):
        for across in (-half_w, half_w):
            for dz in (-half_h, half_h):
                verts.append(bm.verts.new((cx + along * c - across * s,
                                           cy + along * s + across * c,
                                           cz + dz)))
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([verts[i] for i in quad])


def _section(bm, centre, u, v, hu, hv, sides: int):
    """A closed `sides`-gon ring in the plane spanned by the unit vectors u, v.

    Half-sizes `hu` and `hv` are independent, so one call draws a chamfered
    square shank, a rectangular baulk of a stock and a flat blade alike. The
    half-step offset puts FLATS on the axes rather than corners, which is what
    a sawn and chamfered timber looks like.
    """
    out = []
    for i in range(sides):
        a = 2.0 * math.pi * (i + 0.5) / sides
        du, dv = hu * math.cos(a), hv * math.sin(a)
        out.append(bm.verts.new(tuple(
            centre[k] + u[k] * du + v[k] * dv for k in range(3))))
    return out


ANCHOR_CHAMFER = 0.42   # how much of each corner a forged square has taken off


def _chamfered(bm, centre, u, v, hu, hv, cut: float = ANCHOR_CHAMFER):
    """A SQUARE with its corners cut off — what a forged shank or a sawn baulk
    of a stock actually is in section.

    NOT a regular octagon, and the difference is load-bearing. A regular
    octagon of half-size `hu` only reaches `hu * cos(22.5°)` along its own
    axis, which on the anchor's shank is 0.0785 instead of 0.0850 — and
    `anchor_bearing_x` stands the shank's inboard FACE on the planking, so an
    inscribed section lifts the whole anchor 6.5 mm off the ship. Measured:
    it took `Anchor_ is ON Hull` from 4 contact vertices to 0, and
    `check_directions` called it correctly — crossing without touching is
    neither INTO nor ON.
    """
    a, b = hu * (1.0 - cut), hv * (1.0 - cut)
    pts = ((hu, b), (a, hv), (-a, hv), (-hu, b),
           (-hu, -b), (-a, -hv), (a, -hv), (hu, -b))
    return [bm.verts.new(tuple(centre[k] + u[k] * du + v[k] * dv
                               for k in range(3))) for du, dv in pts]


def _sweep_square(bm, stations, cap=True):
    """Bridge a run of `_chamfered` sections. Stations as for `_sweep`."""
    rings = [_chamfered(bm, c, u, v, hu, hv) for c, u, v, hu, hv in stations]
    prims.bridge(bm, rings, cap=cap)
    return rings


def _sweep(bm, stations, sides: int, cap=True):
    """Bridge a run of `_section` rings. `stations` are (centre, u, v, hu, hv)."""
    rings = [_section(bm, c, u, v, hu, hv, sides) for c, u, v, hu, hv in stations]
    prims.bridge(bm, rings, cap=cap)
    return rings


def _cap(bm, ring, reverse=False):
    bm.faces.new(tuple(reversed(ring)) if reverse else tuple(ring))


def _point(bm, ring, apex):
    """Close a swept run to a single point — a bill, a spike, a nose."""
    tip = bm.verts.new(apex)
    n = len(ring)
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], tip))


def _flat_ring(bm, centre, major, minor, segments, sides):
    """A torus lying in the YZ plane — a ring hanging flat against the ship.

    `prims.torus` lies in XZ, which on an anchor catted flat against the bow
    would stand the ring out from the planking by its own diameter and bury
    half of it in the hull. Same construction, turned a quarter.
    """
    cx, cy, cz = centre
    rings = []
    for s in range(segments):
        a = 2.0 * math.pi * s / segments
        oy, oz = math.cos(a), math.sin(a)
        hy, hz = cy + major * oy, cz + major * oz
        rings.append([
            bm.verts.new((cx + minor * math.sin(b),
                          hy + minor * math.cos(b) * oy,
                          hz + minor * math.cos(b) * oz))
            for b in (2.0 * math.pi * i / sides for i in range(sides))
        ])
    rings.append(rings[0])
    prims.bridge(bm, rings, cap=False)


def _lerp_radius(radii, heights, z: float) -> float:
    """The radius of a stacked run of rings at height z, between its rings."""
    for (r0, h0), (r1, h1) in zip(zip(radii, heights), zip(radii[1:], heights[1:])):
        if h0 <= z <= h1:
            f = 0.0 if h1 == h0 else (z - h0) / (h1 - h0)
            return r0 + (r1 - r0) * f
    return radii[0] if z < heights[0] else radii[-1]


# The hub above the deck the pedestal stands on. `frigate.rig` is bpy-free and
# cannot import this module, so it is handed this number rather than reaching
# for it — and `wheel_hub_height` is the one place it is derived.
def wheel_hub_height() -> float:
    return WHEEL_PEDESTAL + WHEEL_R


def _wheel_standards(bm, o) -> None:
    """The two standards and the base plate. These do NOT turn.

    A ship's wheel is journalled between two uprights bolted to the deck. The
    uprights are deck furniture; the wheel is a wheel. Splitting the two is
    what lets the wheel be its own node without taking its pedestal round
    with it.
    """
    ox, oy, oz = o
    for sign in (-1.0, 1.0):
        prims.box(bm, (ox + sign * 0.10 - 0.05, oy - 0.14, oz),
                  (ox + sign * 0.10 + 0.05, oy + 0.14, oz + WHEEL_PEDESTAL))
    prims.box(bm, (ox - 0.26, oy - 0.20, oz), (ox + 0.26, oy + 0.20, oz + 0.07))


def _wheel_turning(bm, o) -> None:
    """Rim, barrel, hub boss and ten spokes whose ends are the handles.

    Everything here turns about the spindle at `(ox, oy, hub_z)` running fore
    and aft, and nothing here is anywhere else.
    """
    ox, oy, oz = o
    hub_z = oz + wheel_hub_height()
    prims.torus(bm, (ox, oy, hub_z), WHEEL_R, WHEEL_RIM, WHEEL_RIM_SEGMENTS, 6)
    # The drum the wheel rope winds on, and the hub boss on the fore side.
    prims.cylinder(bm, (ox, oy - 0.26, hub_z), 0.22, 8, 1, 0.52)
    prims.cylinder(bm, (ox, oy - 0.14, hub_z), 0.12, 8, 1, 0.28)

    for i in range(WHEEL_SPOKES):
        a = 2 * math.pi * i / WHEEL_SPOKES
        c, s = math.cos(a), math.sin(a)
        for r0, r1, half in ((0.10, WHEEL_R, 0.035), (WHEEL_R, WHEEL_R + WHEEL_HANDLE, 0.045)):
            x0, z0 = ox + r0 * c, hub_z + r0 * s
            x1, z1 = ox + r1 * c, hub_z + r1 * s
            prims.box(bm,
                      (min(x0, x1) - half, oy - half, min(z0, z1) - half),
                      (max(x0, x1) + half, oy + half, max(z0, z1) + half))


def _wheel(bm, o) -> None:
    """Both halves, in one mesh. Kept because it is the REFERENCE the split is
    proved against on every build -- see `build_furniture`."""
    _wheel_standards(bm, o)
    _wheel_turning(bm, o)


def _capstan(bm, o) -> None:
    """Barrel, whelps, pawl rim, drumhead and four bars shipped for heaving."""
    ox, oy, oz = o
    _stack(bm, (ox, oy, oz), CAPSTAN_R, CAPSTAN_Z, CAPSTAN_SIDES)
    _hoop(bm, (ox, oy, oz), CAPSTAN_R[0] + 0.03, 0.02, 0.12, CAPSTAN_SIDES)

    for i in range(CAPSTAN_WHELPS):
        a = 2 * math.pi * i / CAPSTAN_WHELPS
        c, s = math.cos(a), math.sin(a)
        r0, r1 = 0.28, 0.50
        prims.box(bm,
                  (ox + min(r0 * c, r1 * c) - 0.05, oy + min(r0 * s, r1 * s) - 0.05, oz + 0.12),
                  (ox + max(r0 * c, r1 * c) + 0.05, oy + max(r0 * s, r1 * s) + 0.05, oz + 0.62))

    prims.cylinder(bm, (ox, oy, oz + CAPSTAN_Z[-1]), 0.50, CAPSTAN_SIDES, 2, 0.14)
    for i in range(CAPSTAN_BARS):
        a = math.pi * i / CAPSTAN_BARS
        _spar(bm, (ox, oy, oz + CAPSTAN_Z[-1] + 0.07), a, CAPSTAN_BAR_LEN, 0.045, 0.045)


def _hatch(bm, o) -> None:
    ox, oy, oz = o
    length, width, high, thick = HATCH
    half_l, half_w = length / 2, width / 2
    for lo, hi in (
        ((ox - half_w, oy + half_l - thick, oz), (ox + half_w, oy + half_l, oz + high)),
        ((ox - half_w, oy - half_l, oz), (ox + half_w, oy - half_l + thick, oz + high)),
        ((ox - half_w, oy - half_l, oz), (ox - half_w + thick, oy + half_l, oz + high)),
        ((ox + half_w - thick, oy - half_l, oz), (ox + half_w, oy + half_l, oz + high)),
    ):
        prims.box(bm, lo, hi)
    # A head ledge round the inside of the coaming for the grating to land on.
    for lo, hi in (
        ((ox - half_w + thick, oy - half_l + thick, oz + high - 0.09),
         (ox + half_w - thick, oy - half_l + thick + 0.05, oz + high - 0.04)),
        ((ox - half_w + thick, oy + half_l - thick - 0.05, oz + high - 0.09),
         (ox + half_w - thick, oy + half_l - thick, oz + high - 0.04)),
    ):
        prims.box(bm, lo, hi)


def _grating(bm, o) -> None:
    """The lattice inside one hatch: battens both ways, half-lapped."""
    ox, oy, oz = o
    length, width, high, thick = HATCH
    clear_x, clear_y = width - 2 * thick, length - 2 * thick
    batten = profiles.GRATING_BATTEN
    top = oz + high - 0.03
    for xc in profiles.grating_lattice(clear_x, batten):
        prims.box(bm, (ox + xc - batten / 2, oy - clear_y / 2, top - 0.055),
                  (ox + xc + batten / 2, oy + clear_y / 2, top - 0.015))
    for yc in profiles.grating_lattice(clear_y, batten):
        prims.box(bm, (ox - clear_x / 2, oy + yc - batten / 2, top - 0.035),
                  (ox + clear_x / 2, oy + yc + batten / 2, top))


def _boat(bm, o) -> None:
    """The launch on her skids: eleven sections, five thwarts, keelson, posts."""
    ox, oy, oz = o
    length, half_beam, depth = BOAT
    n = profiles.BOAT_STATIONS

    def station_y(f):
        return oy - length / 2 + length * f

    rings = []
    for s in range(n):
        f = s / (n - 1)
        plan, rise = profiles.boat_station(f)
        rings.append([
            bm.verts.new((ox + u * half_beam * plan, station_y(f), oz + v * depth * rise))
            for u, v in profiles.BOAT_SECTION
        ])
    prims.bridge(bm, rings, closed=False, cap=False)
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    # The launch is left OPEN at the gunwale. Task 12 capped it with one n-gon,
    # which turned the boat into a lens and would now hide the thwarts, risings
    # and keelson inside her — the whole point of the detail. The cap was never
    # load-bearing: the boundary edges it closed each carry a face either way,
    # so `check_furniture`'s no-wire-edges assertion is unaffected.

    for f in profiles.boat_thwart_fracs():
        plan, rise = profiles.boat_station(f)
        half = half_beam * plan - 0.05
        y = station_y(f)
        prims.box(bm, (ox - half, y - 0.06, oz - 0.30 * depth * rise),
                  (ox + half, y + 0.06, oz - 0.22 * depth * rise))
    # Risings down each side, a keelson along the bottom, stem and stern posts.
    for sign in (-1.0, 1.0):
        prims.box(bm, (ox + sign * (half_beam * 0.80) - 0.05, station_y(0.08), oz - 0.26),
                  (ox + sign * (half_beam * 0.80) + 0.05, station_y(0.92), oz - 0.18))
    prims.box(bm, (ox - 0.07, station_y(0.04), oz - depth - 0.05),
              (ox + 0.07, station_y(0.96), oz - depth + 0.10))
    for f, dz in ((0.0, 0.14), (1.0, 0.10)):
        y = station_y(f)
        prims.box(bm, (ox - 0.08, y - 0.09, oz - depth * 0.55),
                  (ox + 0.08, y + 0.09, oz + dz))
    for sign in (-1.0, 1.0):
        f0, f1 = profiles.BOAT_SKID_SPAN
        prims.box(bm, (ox + sign * 0.55 - 0.08, station_y(f0),
                       oz - depth - profiles.BOAT_SKID_DROP),
                  (ox + sign * 0.55 + 0.08, station_y(f1),
                   oz - depth - 0.06))


def _barrel_mesh() -> bpy.types.Mesh:
    """Ten staves bulging at the bilge, with two iron hoops standing proud."""
    bm = bmesh.new()
    _stack(bm, (0.0, 0.0, 0.0), BARREL_R, BARREL_Z, BARREL_SIDES)
    for z in BARREL_HOOPS:
        r = _lerp_radius(BARREL_R, BARREL_Z, z) + BARREL_HOOP_PROUD
        _hoop(bm, (0.0, 0.0, 0.0), r, z - 0.05, z + 0.05, BARREL_SIDES)
    return prims.mesh_only(bm, "Barrel")


def _anchor_mesh() -> bpy.types.Mesh:
    """An admiralty-pattern anchor. +X outboard, +Z up, origin at the ring.

    Ring, square tapering shank, a stock across it with four iron hoops on the
    WOOD, a crown, two arms SWEPT ALONG AN ARC, flukes on the back of them and
    a bill at each point. It was 320 triangles of boxes and read low-res at the
    range an anchor on a pirate ship's bow is looked at; this is paid ONCE,
    because both anchors share this datablock.

    Every figure comes out of `profiles`, which is bpy-free and under plain
    pytest. Nothing here decides a dimension; this only emits one.
    """
    shank, stock, _arm = ANCHOR
    bm = bmesh.new()
    X = (1.0, 0.0, 0.0)
    Y = (0.0, 1.0, 0.0)
    Z = (0.0, 0.0, 1.0)
    crown_z = -shank

    # --- the ring, hanging flat against the ship's side ---------------------
    _flat_ring(bm, (0.0, 0.0, profiles.ANCHOR_RING_SEAT + profiles.ANCHOR_RING_MAJOR),
               profiles.ANCHOR_RING_MAJOR, profiles.ANCHOR_RING_MINOR,
               profiles.ANCHOR_RING_SEGMENTS, profiles.ANCHOR_RING_SIDES)

    # --- the shank, crown to head -------------------------------------------
    top = profiles.ANCHOR_RING_SEAT
    stations = []
    for i in range(profiles.ANCHOR_SHANK_STATIONS):
        f = i / (profiles.ANCHOR_SHANK_STATIONS - 1)
        hx, hy = profiles.anchor_shank_section(f)
        stations.append(((0.0, 0.0, crown_z + (top - crown_z) * f), X, Y, hx, hy))
    _sweep_square(bm, stations)

    # --- the crown: the mass the two arms load the shank through ------------
    hx, _hy = profiles.anchor_shank_section(0.0)
    _sweep_square(bm, [
        ((0.0, 0.0, crown_z - profiles.ANCHOR_CROWN_DEPTH), X, Y, hx * 0.70, 0.070),
        ((0.0, 0.0, crown_z - profiles.ANCHOR_CROWN_DEPTH * 0.45), X, Y, hx, 0.118),
        ((0.0, 0.0, crown_z + 0.12), X, Y, hx, 0.100),
    ])

    # --- the stock, both halves, and the four hoops that bind it ------------
    for sign in (-1.0, 1.0):
        stations = []
        for i in range(profiles.ANCHOR_STOCK_STATIONS):
            f = i / (profiles.ANCHOR_STOCK_STATIONS - 1)
            shx, shz = profiles.anchor_stock_section(f)
            stations.append(((0.0, sign * f * stock / 2.0, profiles.ANCHOR_STOCK_Z),
                             X, Z, shx, shz))
        _sweep_square(bm, stations)
    for y, half in profiles.anchor_hoops():
        shx, shz = profiles.anchor_stock_section(abs(y) / (stock / 2.0))
        proud = profiles.ANCHOR_HOOP_PROUD
        rings = []
        for dy, grow in ((-half, 0.0), (-half * 0.7, proud),
                         (half * 0.7, proud), (half, 0.0)):
            rings.append(_chamfered(bm, (0.0, y + dy, profiles.ANCHOR_STOCK_Z),
                                    X, Z, shx + grow, shz + grow))
        prims.bridge(bm, rings, cap=False)

    # --- the arms, each swept along its own arc, with a bill at the point ---
    for sign in (-1.0, 1.0):
        stations = []
        for i in range(profiles.ANCHOR_ARM_STATIONS):
            ay, az, half, ty, tz = profiles.anchor_arm_point(
                i / (profiles.ANCHOR_ARM_STATIONS - 1))
            # The section stands square to the arc: X across the anchor, and
            # the arc's own normal in the fore-and-aft plane.
            stations.append(((0.0, sign * ay, crown_z + az), X,
                             (0.0, -sign * tz, ty), half, half))
        rings = _sweep(bm, stations, ANCHOR_SIDES, cap=False)
        _cap(bm, rings[0], reverse=True)
        ay, az, _h, ty, tz = profiles.anchor_arm_point(1.0)
        _point(bm, rings[-1],
               (0.0, sign * (ay + ty * profiles.ANCHOR_BILL),
                crown_z + az + tz * profiles.ANCHOR_BILL))

        # The fluke: a blade standing off the convex back of the arm, clear of
        # the crown and stopping short of the bill, which is what bites.
        f0, f1 = profiles.anchor_fluke_span()
        blade = []
        for i in range(9):
            f = f0 + (f1 - f0) * i / 8.0
            fy, fz, width = profiles.anchor_fluke_centre(f)
            _ay, _az, _h, ty, tz = profiles.anchor_arm_point(f)
            blade.append((
                (0.0, sign * fy, crown_z + fz), X, (0.0, sign * tz, -ty),
                # A feather edge, not a knife edge: 8 mm keeps the two ends of
                # the blade off a zero-area face without showing.
                profiles.ANCHOR_FLUKE_HALF_THICK, max(width / 2.0, 0.008)))
        _sweep(bm, blade, ANCHOR_FLUKE_SIDES)
    return prims.mesh_only(bm, "Anchor")


def _lantern_mesh() -> bpy.types.Mesh:
    """A six-light stern lantern: base, framed glass, roof and a lifting ring."""
    bm = bmesh.new()
    prims.cylinder(bm, (0.0, 0.0, 0.0), 0.13, LANTERN_SIDES, 2, 0.10, 0.85)
    _stack(bm, (0.0, 0.0, 0.0), (LANTERN_R, LANTERN_R, LANTERN_R),
           (0.10, 0.32, LANTERN_H), LANTERN_SIDES, caps=False)
    for i in range(LANTERN_SIDES):
        a = 2 * math.pi * (i + 0.5) / LANTERN_SIDES
        x, y = LANTERN_R * math.cos(a), LANTERN_R * math.sin(a)
        prims.box(bm, (x - LANTERN_POST, y - LANTERN_POST, 0.08),
                  (x + LANTERN_POST, y + LANTERN_POST, LANTERN_H + 0.02))
    _stack(bm, (0.0, 0.0, 0.0), (LANTERN_R + 0.02, 0.12, 0.04),
           (LANTERN_H, LANTERN_H + 0.14, LANTERN_H + 0.22), LANTERN_SIDES)
    prims.torus(bm, (0.0, 0.0, LANTERN_H + 0.30), 0.075, 0.022, 6, 4)
    return prims.mesh_only(bm, "Lantern")


def build_gratings(p: FrigateParams) -> bpy.types.Object:
    """The lattices in the three hatch coamings. Returns `Gratings`.

    Separate from `Deck_Furniture` because spec section 5 budgets gratings on
    the decks line, not on deck furniture.
    """
    bm = bmesh.new()
    for item in profiles.furniture_placements(p):
        if item["kind"].startswith("hatch"):
            _grating(bm, item["origin"])
    return prims.finish(bm, "Gratings")


def build_furniture(p: FrigateParams) -> list[bpy.types.Object]:
    p.validate()
    placements = profiles.furniture_placements(p)
    from . import rig

    # THE MERGE THIS SPLIT REPLACES, built first and thrown away, purely to be
    # the reference the two objects are measured against. Re-origining a part
    # must not move a vertex in world space, and that is the one failure that
    # looks identical in the viewport.
    reference = bmesh.new()
    merged = {"wheel": _wheel, "capstan": _capstan, "boat": _boat,
              "hatch_fore": _hatch, "hatch_main": _hatch, "hatch_aft": _hatch}
    for item in placements:
        fn = merged.get(item["kind"])
        if fn is not None:
            fn(reference, item["origin"])
    want = [tuple(v.co) for v in reference.verts]
    reference.free()

    bm = bmesh.new()
    wheel_bm = bmesh.new()
    builders = dict(merged, wheel=_wheel_standards)
    for item in placements:
        fn = builders.get(item["kind"])
        if fn is not None:
            fn(bm, item["origin"])
        if item["kind"] == "wheel":
            _wheel_turning(wheel_bm, item["origin"])
    furniture = prims.finish(bm, "Deck_Furniture")
    wheel = prims.finish(wheel_bm, rig.WHEEL)
    prims.set_pivot(wheel, rig.wheel_pivot(p, wheel_hub_height()).point)
    prims.same_world_points(
        want, [tuple(o.matrix_world @ v.co) for o in (furniture, wheel)
               for v in o.data.vertices])
    built = [furniture, wheel, build_gratings(p)]

    shared = {"barrel": _barrel_mesh(), "anchor": _anchor_mesh(),
              "lantern": _lantern_mesh()}
    counts = {k: 0 for k in shared}
    for item in placements:
        kind = item["kind"]
        if kind not in shared:
            continue
        obj = bpy.data.objects.new(f"{kind.capitalize()}_{counts[kind]:02d}", shared[kind])
        env.link(obj)
        _place(obj, item["origin"], item["yaw_deg"])
        counts[kind] += 1
        built.append(obj)
    return built
