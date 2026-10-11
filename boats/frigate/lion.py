"""The galleon's figurehead: a CROWNED LION RAMPANT. Pure — imports no bpy.

WHY A LION, AND NOT ANOTHER MINERVA
-----------------------------------
The frigate wears Minerva because she is a late-eighteenth-century Swedish
frigate conceit, after Johan Tornstrom's figure for the *Minerva* of 1783:
neoclassical, human, draped. None of that belongs on a Spanish galleon a
century and a half earlier, and copying it across would have been the clearest
possible sign that the second ship was the first ship repainted.

The lion is the galleon's own, on three separate grounds:

1. **Heraldry.** The crowned lion rampant is the beast of the Crown of
   Castile-and-Leon and quarters the Spanish royal arms. A king's ship carried
   the king's beast. The province is literally named for it.
2. **The type.** A lion is the standard figurehead of the sixteenth- and
   seventeenth-century galleon across every navy that built them. The one
   surviving high-charged galleon, *Vasa* of 1628 — which is also this hull's
   second reference — carries a gilded lion rampant on her beakhead, and the
   *Galeon Andalucia* replica, which is this hull's FIRST reference, carries
   one too. Both references agree, which is as close to evidence as this
   project gets.
3. **It is a different modelling problem, and that is the point.** Minerva is
   an UPRIGHT figure on a raked axis whose whole richness is drapery. A lion
   is a QUADRUPED on a near-horizontal axis: haunches down on the knee of the
   head, body stretched out along the beak, forelegs reaching forward over the
   water, head up, tail curled back over the rump. If the galleon's carving had
   come out as a reskin of the frigate's, the generalisation would have been
   decorative.

WHAT IT INHERITS, AND WHAT IT DOES NOT
--------------------------------------
It inherits the FRAME — a heel point, a unit vector along the carving's own
axis, and a unit vector it faces, exactly as `profiles.figure_axis` sets up
Minerva's, so one carving's coordinates are read the same way as the other's.

It inherits `profiles.fold_ring`, the radial ripple r(theta) = r0 * (1 + a *
cos(N * theta)) — but it uses it ON ONE REGION ONLY. Minerva is fluted from
hem to collar because she is wearing cloth. A lion's pelt is not cloth, and
rippling the whole body would have read as a sheep. The ripple is spent where
a lion actually has one: the MANE, a ruff of locks round the neck, amplitude
climbing from 0.03 on the smooth shoulder to 0.26 at the ruff and falling away
again at the muzzle. `LION_SIDES == 2 * LION_FOLDS` for the same reason it
holds on Minerva — every crest and every trough then lands ON a vertex and
none is sampled on its flank, where a lock reads as a wobble.

It does NOT inherit the shield, the spear, the helmet or the lower drapery,
and it adds four legs, a curled tail and a crown, which Minerva never needed.

SCALE, WITH BOTH ENDPOINTS NAMED
--------------------------------
HEEL-RING-CENTRE (at the rump, where the carving is let into the knee of the
head) to NOSE-TIP, along the carving's own axis, is `LION_HEIGHT` = 2.40 m.
Against waterline-to-waist-rail-cap-amidships of 5.00 m on this galleon that
is 0.480 (0.432 of 5.55 m before the lower battery left the bulwark and the
cap dropped 0.55 m). Minerva is 1.68 m against the frigate's
waterline-to-rail-cap-at-maximum-beam of 4.3307 m, which is 0.388. So the
galleon's beast is slightly bolder relative to its own ship, which is what both
references show: *Vasa*'s lion is about 3 m from rump to nose on a 47.5 m hull.
"""

import math

from . import profiles
from .params import FrigateParams

Point = tuple[float, float, float]

# Heel-ring-centre to nose-tip, along the carving's own axis.
LION_HEIGHT = 2.40
# How far the axis leans FORWARD OF VERTICAL. Minerva stands at 34 degrees,
# which is a figure leaning out over the water. A lion rampant on a beakhead
# is thrown much further forward than that: 62 degrees off vertical is 28
# degrees above the horizontal, which is a beast springing along the beak
# rather than a statue standing on it.
LION_RAKE_DEG = 62.0
# Heel ring centre, against two named landmarks of the hull: forward of THE
# STEM AT THE RAIL, and below THE DECK EDGE AT THE STEM. On the galleon those
# are y = +17.00 m and z = +4.55 m, so the rump sits at (18.45, 3.30). Her
# knee of the head falls with the rail (the maintainer's third ruling, E) and enters
# the lion through its rump: at the heel's y the KNEE TOP (3.2802) stands
# inside the RUMP RING (3.1234 .. 3.4767), which is what "let into the
# knee of the head" means now (`tests/test_galleon_knee.py`).
LION_HEEL_FWD = 1.45
LION_HEEL_DROP = 1.25

LION_SIDES = 20        # ring points round the body
LION_FOLDS = 10        # locks round the mane; LION_SIDES == 2 * LION_FOLDS
LION_LEG_SIDES = 8
LION_TAIL_SIDES = 8
LION_CROWN_SIDES = 10

# (name, s along the axis, half-breadth, half-depth, ripple amplitude).
# Breadth is athwartships and depth is across the body in the plane it faces.
# The amplitude column is the mane and nothing else: it is 0.02-0.04 over the
# whole smooth body and only wakes up at the neck.
LION_BODY = (
    ("rump",      0.000, 0.235, 0.205, 0.030),
    ("haunch",    0.115, 0.275, 0.250, 0.030),
    ("loin",      0.270, 0.212, 0.212, 0.020),
    ("belly",     0.410, 0.228, 0.228, 0.020),
    ("chest",     0.545, 0.264, 0.252, 0.025),
    ("shoulder",  0.655, 0.252, 0.238, 0.040),
    ("maneroot",  0.720, 0.272, 0.258, 0.160),
    ("ruff",      0.790, 0.332, 0.318, 0.260),   # the deepest locks
    ("manefront", 0.855, 0.282, 0.276, 0.200),
    ("muzzle",    0.930, 0.148, 0.150, 0.020),
    ("nose",      1.000, 0.082, 0.080, 0.000),
)

# (s, athwartships offset, facing offset, radius), shoulder or haunch down to
# the paw. The radii are the SECOND set: the first ran 0.084 m at the shoulder
# down to 0.057 m at the knee, which on a beast 2.40 m from rump to nose read
# as bent wire rather than as a carved limb in a Right orthographic. The facing offset carries a leg FORWARD AND DOWN, because that is
# where the carving's facing vector points when the body is raked 62 degrees:
# the forelegs reach out over the water, the hind legs are gathered under the
# haunch.
LION_FORELEG = (
    (0.650, 0.172, 0.105, 0.105),
    (0.700, 0.212, 0.330, 0.090),
    (0.682, 0.238, 0.540, 0.078),
    (0.640, 0.252, 0.655, 0.098),   # the paw, slightly swollen
)
LION_HINDLEG = (
    (0.120, 0.190, 0.070, 0.118),
    (0.095, 0.232, 0.255, 0.098),
    (0.135, 0.248, 0.405, 0.082),
    (0.120, 0.258, 0.498, 0.100),
)

# The tail, in the carving's own frame: (s, athwartships, facing, radius). It
# leaves the rump, sweeps BACK over the haunch — negative facing is up and aft
# with this rake — and curls to a tuft.
LION_TAIL = (
    (0.010, 0.060, -0.140, 0.062),
    (-0.090, 0.105, -0.300, 0.056),
    (-0.150, 0.140, -0.470, 0.050),
    (-0.140, 0.150, -0.620, 0.046),
    (-0.080, 0.130, -0.740, 0.044),
    (-0.010, 0.095, -0.800, 0.075),   # the tuft
)

# The crown, which is what makes it the KING's lion rather than a lion: three
# rings on top of the skull. (s, facing offset, radius) — facing offset is
# NEGATIVE, which with this rake is up and aft, i.e. on top of the head.
LION_CROWN = (
    (0.878, -0.168, 0.118),
    (0.872, -0.258, 0.132),
    (0.866, -0.330, 0.150),   # the circlet flares, as a crown does
)


def _index(name: str) -> int:
    return next(i for i, row in enumerate(LION_BODY) if row[0] == name)


LION_RUFF_RING = _index("ruff")
LION_SHOULDER_RING = _index("shoulder")
LION_RUMP_RING = _index("rump")


def axis(p: FrigateParams) -> tuple[Point, Point, Point]:
    """(heel ring centre, unit vector rump->nose, unit vector the lion faces).

    Built exactly as `profiles.figure_axis` builds Minerva's, so a reader who
    knows one knows the other: the facing vector points forward AND down,
    perpendicular to the axis, which is why a forward offset lowers a point.
    """
    rake = math.radians(LION_RAKE_DEG)
    heel = (0.0,
            profiles.station_y(p, 0.0) + LION_HEEL_FWD,
            profiles.sheer(p, 0.0) - LION_HEEL_DROP)
    up = (0.0, math.sin(rake), math.cos(rake))
    fwd = (0.0, math.cos(rake), -math.sin(rake))
    return heel, up, fwd


def point(p: FrigateParams, s: float, a: float, b: float) -> Point:
    """A point `s` of the way along the axis, `a` athwartships, `b` forward."""
    heel, up, fwd = axis(p)
    d = LION_HEIGHT * s
    return (heel[0] + a,
            heel[1] + up[1] * d + fwd[1] * b,
            heel[2] + up[2] * d + fwd[2] * b)


def body_rings(p: FrigateParams) -> list[list[Point]]:
    """Rump to nose. The mane's locks live in the amplitude column."""
    return [[point(p, s, a, b)
             for a, b in profiles.fold_ring(LION_SIDES, rx, ry, amp, LION_FOLDS)]
            for _name, s, rx, ry, amp in LION_BODY]


def _limb_rings(p: FrigateParams, table, sign: float) -> list[list[Point]]:
    return [[point(p, s, sign * x + a, b + db)
             for a, db in profiles.fold_ring(LION_LEG_SIDES, r, r, 0.0, 1)]
            for s, x, b, r in table]


def foreleg_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    return _limb_rings(p, LION_FORELEG, sign)


def hindleg_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    return _limb_rings(p, LION_HINDLEG, sign)


def tail_rings(p: FrigateParams) -> list[list[Point]]:
    """One tail, curled back over the rump, on the starboard side of it."""
    return [[point(p, s, x + a, b + db)
             for a, db in profiles.fold_ring(LION_TAIL_SIDES, r, r, 0.0, 1)]
            for s, x, b, r in LION_TAIL]


def crown_rings(p: FrigateParams) -> list[list[Point]]:
    return [[point(p, s, a, b + db)
             for a, db in profiles.fold_ring(LION_CROWN_SIDES, r, r, 0.0, 1)]
            for s, b, r in LION_CROWN]


def nose(p: FrigateParams) -> Point:
    """The forwardmost point of the carving: the tip of the muzzle."""
    return max(body_rings(p)[-1], key=lambda pt: pt[1])


def paws(p: FrigateParams) -> list[Point]:
    """The two forward paws, which are what reach furthest out over the water."""
    s, x, b, _r = LION_FORELEG[-1]
    return [point(p, s, sign * x, b) for sign in (1.0, -1.0)]


def ring_groups(p: FrigateParams) -> list[list[list[Point]]]:
    """Every lofted part, in the order the emitter bridges them."""
    return [
        body_rings(p),
        foreleg_rings(p, 1.0), foreleg_rings(p, -1.0),
        hindleg_rings(p, 1.0), hindleg_rings(p, -1.0),
        tail_rings(p),
        crown_rings(p),
    ]


def boxes(p: FrigateParams) -> list[tuple[Point, Point]]:
    """A lion has no bare feet to peep out from under a hem."""
    return []


def _loft_tris(rings: int, sides: int) -> int:
    return 2 * (rings - 1) * sides + 2 * (sides - 2)


def triangles(p: FrigateParams) -> int:
    """What the carving costs, counted from the tables above plus the boards."""
    return (
        _loft_tris(len(LION_BODY), LION_SIDES)
        + 2 * _loft_tris(len(LION_FORELEG), LION_LEG_SIDES)
        + 2 * _loft_tris(len(LION_HINDLEG), LION_LEG_SIDES)
        + _loft_tris(len(LION_TAIL), LION_TAIL_SIDES)
        + _loft_tris(len(LION_CROWN), LION_CROWN_SIDES)
        + profiles.trailboard_triangles(p)
    )


def all_points(p: FrigateParams) -> list[Point]:
    """Every vertex of the carving, in the order the emitter writes them."""
    out: list[Point] = []
    for rings in ring_groups(p):
        for ring in rings:
            out.extend(ring)
    for sign in (1.0, -1.0):
        for ring in profiles.trailboard_rings(p, sign):
            out.extend(ring)
    return out


def height(p: FrigateParams) -> float:
    """HEEL RING CENTRE at the rump to NOSE TIP. Both endpoints named: this
    project once certified a hull 1.35x too tall from an unnamed span."""
    return math.dist(point(p, 0.0, 0.0, 0.0), nose(p))
