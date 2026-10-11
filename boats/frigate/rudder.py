"""The rudder: a blade hung on the sternpost, pivoting on its own stock.

The ship had none. Everything else aft of amidships was there — transom,
gallery, carving, chase ports, taffrail lanterns — and the one fitting that
makes a hull a ship that can be steered was missing.

WHERE IT HANGS, WITH BOTH ENDS OF EVERY FIGURE NAMED. This hull's run ends in
a flat transom at station 1.0, which is `station_y(p, 1.0)` = -19.00 m, and
the keel rises into the tuck to `keel_z(p, 1.0)` = -3.20 m there. So the
sternpost is the vertical line x = 0, y = -19.00, and the rudder hangs abaft
it from the keel at z = -3.20 up to z = +1.52.

WHY THERE IS NO TILLER, AND THIS IS A MEASUREMENT RATHER THAN A PREFERENCE.
The brief says "a tiller or quarter-tiller as appropriate". Neither is.
`profiles.gallery_lowest(p)` puts the stern gallery's lowest timber — the
dentil course under its sill — at z = +1.44, and `stern_form.gallery_depth`
stands its wall 0.30 m ABAFT the hull transom —
dead on the centreline a rudder head would have to rise through. A tiller
abaft the transom would come out through the middle window of the stern
gallery. On the real ship the rudder head passes up a trunk INSIDE the hull
and the tiller sweeps the gunroom under the quarterdeck, which on a closed
hull is geometry nobody can ever see — and building geometry nobody can see
is the exact mistake the scar pass was spent undoing. The head therefore
stops `GALLERY_CLEAR` = 0.18 m under the gallery's lowest timber, at z =
+1.26, and the steering gear a
viewer can see is the WHEEL on the quarterdeck, which is already modelled.

WHAT IT TOUCHES. The leading edge is let `STOCK_BITE` = 0.060 m into the
transom, and the pintle straps `PINTLE_FWD` = 0.030 m further, which is how a
pintle-and-gudgeon hanging works: the straps are let into both timbers. That
makes `Rudder x Hull` a real joint and it is ruled in `frigate.joints`, with
a direction rule that states the number. Nothing else on the ship is within
reach of it.

THE PIVOT IS THE WHOLE POINT. `stock_axis` is the vertical line through the
pintles, which is the rudder's own leading edge — so a glTF node whose origin
sits there swings the blade and leaves the nose in the sternpost. Pure, and
parameterised off `FrigateParams`, so the galleon and the man-o-war inherit
it instead of bolting one on.

The pure plan imports no bpy; `build_rudder` is the bpy half.
"""

import math

from . import profiles
from .params import FrigateParams

Point = tuple[float, float, float]

# Spec section 5 line this spends, and why it is the hull's and not the
# stern's. The stern line is "Stern castle, gallery windows, transom" — three
# named works ABOVE the counter, and the rudder is none of them. The rudder is
# backbone: keel, stem, sternpost, rudder, hung on the timber where the hull
# planking closes aft and almost entirely below the waterline. The hull line
# also had the room, standing at 6,870 of 8,000 before this existed.
BUDGET_LINE = "hull"

# How far under the stern gallery's lower edge the rudder head stops. See the
# module docstring: this clearance is what rules out a tiller.
GALLERY_CLEAR = 0.18

# The leading edge is let this far into the transom, and the pintle straps
# this much further still. `joints.DIRECTIONS` states both numbers.
STOCK_BITE = 0.060
PINTLE_FWD = 0.030

HALF_THICK = 0.17

# The blade's outline, as chord fractions of the heel chord at three heights
# that are NAMED RATHER THAN NUMBERED: the heel, the load waterline, and the
# head. A rudder is nearly full chord everywhere it is working — under water
# — and rakes forward above it, so the knuckle in the outline IS the
# waterline. Writing that knuckle as a fraction of the rudder's own depth,
# which the first cut of this file did, pins it to a number that moves the
# moment the head or the heel moves: the head came down 0.26 m to clear the
# gallery dentils and the knuckle slid below the waterline with it.
CHORD_HEEL_FRAC = 0.39        # heel chord over the rudder's own depth
CHORD_AT_HEEL = 1.00
CHORD_AT_WATERLINE = 0.94
CHORD_AT_HEAD = 0.25
RAKE_EXP = 1.6                # how the trailing edge sweeps in above the water

# Where the lofted sections sit: three from the heel to the waterline and four
# from the waterline to the head, the waterline shared, so the knuckle in the
# outline is a real edge loop and not something the loft cuts a corner across.
BELOW_WATER_FRACS = (0.00, 0.34, 0.67)
ABOVE_WATER_FRACS = (0.00, 0.33, 0.66, 1.00)

# One half of a cross-section, as (chord fraction, half-thickness multiple).
# A timber rudder is a blunt-nosed plank: thickest just abaft the stock, and
# still thick at the trailing edge, which is why the last multiple is not 0.
SECTION = ((0.00, 0.45), (0.14, 1.00), (0.55, 0.62), (1.00, 0.16))
RING_POINTS = 2 * len(SECTION)

PINTLES = 3
PINTLE_FRACS = (0.08, 0.36, 0.64)   # up the rudder's own depth
PINTLE_HALF_H = 0.07                # the strap, vertically
PINTLE_AFT = 0.60                   # how far aft of the nose a strap reaches
PINTLE_PROUD = 0.035                # how far it stands off the blade, each side

# Hard over. 35 degrees is the helm angle a ship of this size carries; it is
# here because the pivot check and the tests both need a real angle to swing
# the blade through rather than one chosen for the arithmetic.
HARD_OVER_DEG = 35.0


def sternpost_y(p: FrigateParams) -> float:
    """The aft face of the hull, which is the timber the rudder hangs on."""
    p.validate()
    return profiles.station_y(p, 1.0)


def heel_z(p: FrigateParams) -> float:
    """The bottom of the rudder: the keel, at the sternpost."""
    p.validate()
    return profiles.keel_z(p, 1.0)


def head_z(p: FrigateParams) -> float:
    """The top of the rudder head, clear under the stern gallery.

    Measured against `profiles.gallery_lowest`, which is the DENTIL COURSE and
    not the gallery band: the dentils hang 0.26 m below the wall, and the
    first cut of this file measured against the band, put the head at +1.52
    and drove it straight through them. `check_intersections` reported it as
    `Rudder x Stern_Gallery: 9 intersecting face pairs, UNRULED`.
    """
    return profiles.gallery_lowest(p) - GALLERY_CLEAR


def depth(p: FrigateParams) -> float:
    return head_z(p) - heel_z(p)


def nose_y(p: FrigateParams) -> float:
    """The leading edge, let `STOCK_BITE` into the transom."""
    return sternpost_y(p) + STOCK_BITE


def _frac_of_z(p: FrigateParams, z: float) -> float:
    return (z - heel_z(p)) / depth(p)


def chord(p: FrigateParams, z: float) -> float:
    """Fore-and-aft width of the rudder at height z.

    Two segments, each with both of its ends named: heel to waterline, where
    the blade is doing its work and stays nearly full chord, and waterline to
    head, where the trailing edge rakes forward to the bare stock.
    """
    full = heel_chord(p)
    z = min(head_z(p), max(heel_z(p), z))
    if z <= 0.0:
        t = (z - heel_z(p)) / (0.0 - heel_z(p))
        return full * (CHORD_AT_HEEL + (CHORD_AT_WATERLINE - CHORD_AT_HEEL) * t)
    u = z / head_z(p)
    return full * (CHORD_AT_WATERLINE
                   + (CHORD_AT_HEAD - CHORD_AT_WATERLINE) * u ** RAKE_EXP)


def heel_chord(p: FrigateParams) -> float:
    """Fore and aft at the heel, the widest the rudder gets."""
    return CHORD_HEEL_FRAC * depth(p)


def stock_chord(p: FrigateParams) -> float:
    """The head, fore and aft: the bare stock above the blade.

    DERIVED from `CHORD_AT_HEAD` and the heel chord, not declared beside
    them. A constant here and a table there would be two sources for one
    number, and the first version of this file had them disagreeing by
    0.2 mm.
    """
    return heel_chord(p) * CHORD_AT_HEAD


def station_zs(p: FrigateParams) -> list:
    """The heights of the lofted sections, heel first. The waterline is one."""
    heel, head = heel_z(p), head_z(p)
    return [heel + (0.0 - heel) * f for f in BELOW_WATER_FRACS] \
        + [head * f for f in ABOVE_WATER_FRACS]


def section_ring(p: FrigateParams, z: float) -> list:
    """One closed cross-section at height z, `RING_POINTS` long.

    The ring runs down the starboard face from the nose to the trailing edge
    and back up the port face, so consecutive rings bridge without a twist.
    """
    c = chord(p, z)
    y0 = nose_y(p)
    out = [(HALF_THICK * m, y0 - f * c, z) for f, m in SECTION]
    out += [(-HALF_THICK * m, y0 - f * c, z) for f, m in reversed(SECTION)]
    return out


def stock_axis(p: FrigateParams) -> tuple:
    """(a point on the rudder stock, the axis it turns about).

    The pintles are strung down the leading edge, so the leading edge IS the
    axis. The point returned is at mid-depth, which is where the object's
    origin goes.
    """
    return ((0.0, nose_y(p), 0.5 * (heel_z(p) + head_z(p))), (0.0, 0.0, 1.0))


def pintle_boxes(p: FrigateParams) -> list:
    """(low corner, high corner) of each pintle strap, heel first."""
    y0 = nose_y(p)
    out = []
    for f in PINTLE_FRACS[:PINTLES]:
        zc = heel_z(p) + f * depth(p)
        half = HALF_THICK + PINTLE_PROUD
        out.append((
            (-half, y0 - PINTLE_AFT, zc - PINTLE_HALF_H),
            (half, y0 + PINTLE_FWD, zc + PINTLE_HALF_H),
        ))
    return out


def all_points(p: FrigateParams) -> list:
    """Every vertex the rudder emits, blade and straps."""
    out = [pt for z in station_zs(p) for pt in section_ring(p, z)]
    for lo, hi in pintle_boxes(p):
        out += [(x, y, z) for x in (lo[0], hi[0])
                for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    return out


def bounds(p: FrigateParams) -> tuple:
    pts = all_points(p)
    return (tuple(min(pt[i] for pt in pts) for i in range(3)),
            tuple(max(pt[i] for pt in pts) for i in range(3)))


def swung(p: FrigateParams, point, degrees: float) -> Point:
    """Where a point goes when the rudder is put over, about its own stock.

    Here rather than in the rig because it is what the pivot MEANS, and
    because the pure tests swing the blade before any glTF node exists.
    """
    (ox, oy, _oz), _axis = stock_axis(p)
    a = math.radians(degrees)
    dx, dy = point[0] - ox, point[1] - oy
    return (ox + dx * math.cos(a) - dy * math.sin(a),
            oy + dx * math.sin(a) + dy * math.cos(a),
            point[2])


def triangle_count(p: FrigateParams) -> int:
    """Derived from the loft, not observed from the mesh."""
    bands = len(station_zs(p)) - 1
    return bands * RING_POINTS * 2 + 2 * (RING_POINTS - 2) + PINTLES * 12


# --- the bpy half -----------------------------------------------------------


def build_rudder(p: FrigateParams):
    """Emit the `Rudder` object, with its origin ON its own stock."""
    import bmesh

    from . import prims

    p.validate()
    from . import rig

    bm = bmesh.new()
    rings = [[bm.verts.new(pt) for pt in section_ring(p, z)] for z in station_zs(p)]
    prims.bridge(bm, rings, closed=True, cap=True)
    for lo, hi in pintle_boxes(p):
        prims.box(bm, lo, hi)
    obj = prims.finish(bm, "Rudder")
    # A glTF node turns about its own origin, so the rudder's goes on its own
    # stock. Its local Z is already the world vertical, which the stock is, so
    # putting the helm over is one channel.
    prims.set_pivot(obj, rig.rudder_pivot(p).point)
    return obj
