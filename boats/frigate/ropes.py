"""Where every rope in the standing rigging begins and ends. Spec section 6 step 10.

Pure arithmetic — imports no bpy. `frigate.rigging` turns these endpoint pairs
into ribbon quads; spec section 5 chose ribbons over tubes before the masts
existed, because 200 ropes as tubes would be tens of thousands of triangles for
something that reads as "ropes".

Everything is derived: a shroud is set up to a chainplate head that Task 7
already placed, a ratline is seized to the two outermost shrouds of its own
fan, a stay leads forward and down from its own masthead. Nothing here picks a
coordinate out of the air.
"""

from . import head, profiles, shiptype as st, wind
from .params import FrigateParams

Point = tuple[float, float, float]
# A rope is a POLYLINE of two or more points, not a pair. Most ropes are two
# points and one ribbon, exactly as before. The ones that are not are the ones
# whose SHAPE is the point of them: a footrope is a catenary -- a straight
# footrope is a rod, not a rope -- and a buntline lies against canvas that
# bellies, so a chord between its ends would cut through the sail it is rove to.
Rope = tuple[Point, ...]

HOUNDS_DROP = 0.30        # shroud gathering point, below the top it passes
MAST_SPREAD = 0.35        # fore-and-aft spread of a shroud fan at the masthead
RATLINE_SPACING = 0.38    # a man's stride up the shrouds
RATLINE_FOOT_UP = 0.70    # lowest ratline, above the channel
RATLINE_HEAD_DOWN = 1.10  # highest ratline, below the hounds
TOPMAST_SHROUDS = 4
BACKSTAY_STEP = 0.45      # spacing of the two backstay feet along the channel
# The topmast fan is set up ABAFT the mast axis, between these two fractions of
# the platform half-depth (and of MAST_SPREAD at its head). A topsail hangs
# `wind.SAIL_FWD` = 0.45 m forward of its own mast; a fan that straddled the
# axis put its forward legs inside that canvas and sliced through the topsail.
# Its foot spreads one platform half-depth aft, which is as far as the rim
# goes; its head keeps exactly the spread it had when it straddled the axis.
TOPMAST_FAN_FOOT = 1.00
TOPMAST_FAN_HEAD = 2.00


def _lerp(a: Point, b: Point, f: float) -> Point:
    return tuple(x + (y - x) * f for x, y in zip(a, b))


def point_at_height(rope: Rope, z: float) -> Point:
    """Where a rope crosses height z. The rope must actually rise."""
    a, b = rope
    if abs(b[2] - a[2]) < 1e-9:
        raise ValueError("a level rope has no single crossing height")
    return _lerp(a, b, (z - a[2]) / (b[2] - a[2]))


def hounds_z(p: FrigateParams, mast: str) -> float:
    """Height the lower shrouds gather at, just under the top."""
    return profiles.top_platform(p, mast)[0] - HOUNDS_DROP


def topmast_hounds_z(p: FrigateParams, mast: str) -> float:
    return profiles.crosstrees(p, mast)[0] - HOUNDS_DROP


def _fan_head(p: FrigateParams, mast: str, sign: float, z: float, i: int, n: int) -> Point:
    """One shroud's upper end: on the mast's own circumference at height z, the
    fan spread fore and aft so the forward shroud leads from forward."""
    _x, y_axis, _z = profiles.mast_point(p, mast, z)
    f = 0.5 if n == 1 else i / (n - 1)
    return (sign * profiles.mast_radius(p, mast), y_axis + MAST_SPREAD * (0.5 - f) * 2.0, z)


def lower_shrouds(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """(chainplate head, masthead) for every lower shroud on one side."""
    heads = [h for h, _foot in profiles.chainplate_segments(p, mast)]
    z = hounds_z(p, mast)
    n = len(heads)
    return [
        ((sign * hx, hy, hz), _fan_head(p, mast, sign, z, i, n))
        for i, (hx, hy, hz) in enumerate(heads)
    ]


def topmast_shrouds(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Futtock-and-topmast shrouds: the top's outer edge up to the crosstrees.

    The whole fan stands ABAFT the mast axis. It used to straddle it, and the
    forward legs then ran through the topsail set 0.45 m forward of the same
    mast — fourteen ropes through canvas, which `check_intersections` caught
    and the twelve checks before it could not, because each of those measures
    one component against the hull and never two against each other.
    """
    top_z, half_x, half_y = profiles.top_platform(p, mast)
    _x, y_axis, _z = profiles.mast_point(p, mast, top_z)
    z = topmast_hounds_z(p, mast)
    _hx, y_head, _hz = profiles.mast_point(p, mast, z)
    n = TOPMAST_SHROUDS
    out = []
    for i in range(n):
        f = i / (n - 1)
        out.append((
            (sign * half_x, y_axis - half_y * TOPMAST_FAN_FOOT * f, top_z),
            (sign * profiles.mast_radius(p, mast),
             y_head - MAST_SPREAD * TOPMAST_FAN_HEAD * f, z),
        ))
    return out


def _ratline_band(p: FrigateParams, mast: str, lo: float, hi: float) -> list[float]:
    span = hi - lo
    if span <= RATLINE_SPACING:
        return []
    bays = int(span / RATLINE_SPACING)
    return [lo + span * i / bays for i in range(bays + 1)]


def ratlines(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Level rungs across one shroud fan, seized to its outermost shrouds."""
    fan = lower_shrouds(p, mast, sign)
    lo = max(foot[2] for foot, _h in fan) + RATLINE_FOOT_UP
    hi = hounds_z(p, mast) - RATLINE_HEAD_DOWN
    forward, aft = fan[0], fan[-1]
    return [
        (point_at_height(forward, z), point_at_height(aft, z))
        for z in _ratline_band(p, mast, lo, hi)
    ]


def topmast_ratlines(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    fan = topmast_shrouds(p, mast, sign)
    lo = profiles.top_platform(p, mast)[0] + RATLINE_FOOT_UP
    hi = topmast_hounds_z(p, mast) - RATLINE_HEAD_DOWN
    forward, aft = fan[0], fan[-1]
    return [
        (point_at_height(forward, z), point_at_height(aft, z))
        for z in _ratline_band(p, mast, lo, hi)
    ]


def _bowsprit_at(p: FrigateParams, f: float) -> Point:
    heel, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    return _lerp(heel, tip, f)


def _on_mast(p: FrigateParams, mast: str, z: float) -> Point:
    return profiles.mast_point(p, mast, z)


def stays(p: FrigateParams) -> list[Rope]:
    """The fore-and-aft standing rigging, nine ropes, all on the centreline.

    Each leads FORWARD and DOWN from its own masthead — that is what a stay is,
    the thing that stops the mast falling aft. The two headstays are set up to
    the bowsprit; the main and mizzen stays lead to the mast ahead of them.
    """
    if profiles.mast_names(p) != ("fore", "main", "mizzen"):
        return _stays_fore_and_aft(p)
    out = []
    trucks = {m: profiles.mast_truck_z(p, m) for m in profiles.mast_names(p)}

    out.append((_on_mast(p, "fore", hounds_z(p, "fore")), _bowsprit_at(p, 0.55)))
    out.append((_on_mast(p, "fore", topmast_hounds_z(p, "fore")), _bowsprit_at(p, 0.88)))
    out.append((_on_mast(p, "fore", 0.92 * trucks["fore"]), _bowsprit_at(p, 1.0)))

    fore_foot = profiles.mast_foot(p, "fore")
    out.append((_on_mast(p, "main", hounds_z(p, "main")),
                (0.0, fore_foot[1], fore_foot[2] + 1.6)))
    out.append((_on_mast(p, "main", topmast_hounds_z(p, "main")),
                _on_mast(p, "fore", hounds_z(p, "fore") - 1.2)))
    out.append((_on_mast(p, "main", 0.92 * trucks["main"]),
                _on_mast(p, "fore", topmast_hounds_z(p, "fore") - 0.8)))

    out.append((_on_mast(p, "mizzen", hounds_z(p, "mizzen")),
                _on_mast(p, "main", 0.28 * trucks["main"])))
    out.append((_on_mast(p, "mizzen", topmast_hounds_z(p, "mizzen")),
                _on_mast(p, "main", hounds_z(p, "main") - 1.2)))
    out.append((_on_mast(p, "mizzen", 0.92 * trucks["mizzen"]),
                _on_mast(p, "main", topmast_hounds_z(p, "main") - 0.8)))
    return out


def _stays_fore_and_aft(p: FrigateParams) -> list[Rope]:
    """The stays of any rig but the three-masted square one.

    A HEADSAIL IS HANKED TO A STAY, so each headsail's stay is its own luff,
    head to tack, and one more runs from the foremost topmast head to the
    bowsprit's end. Every mast abaft the first is stayed to the one ahead of
    it, from its hounds and its topmast hounds, as the frigate's main is to
    her fore. The three-masted ships never reach this: `stays` keeps their
    nine ropes verbatim.
    """
    from . import sailplan

    names = profiles.mast_names(p)
    fore = names[0]
    out = []
    for sail in sorted(p.rig.headsails, key=lambda s: s.tier):
        c = sailplan.corners(p, None, sail)
        out.append((c.throat, c.tack))
    truck = profiles.mast_truck_z(p, fore)
    out.append((_on_mast(p, fore, 0.92 * truck), _bowsprit_at(p, 1.0)))
    for ahead, mast in zip(names, names[1:]):
        out.append((_on_mast(p, mast, hounds_z(p, mast)),
                    _on_mast(p, ahead, hounds_z(p, ahead) - 1.2)))
        out.append((_on_mast(p, mast, topmast_hounds_z(p, mast)),
                    _on_mast(p, ahead, topmast_hounds_z(p, ahead) - 0.8)))
    return out


def backstays(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Two a side, from the topmast head down AFT to the after end of the channel."""
    _t_fwd, t_aft = profiles.channel_span(p, mast)
    y_aft = profiles.station_y(p, t_aft)
    head = _fan_head(p, mast, sign, topmast_hounds_z(p, mast), 0, 1)
    out = []
    for k in range(2):
        y = y_aft + BACKSTAY_STEP * k
        t = profiles.t_of_y(p, y)
        out.append((head, (sign * profiles.channel_outer(p, t, mast), y,
                           profiles.channel_z(p, t, mast))))
    return out


BRACE_LEAD = 0.18   # how far aft, in station t, a brace is led from its yard arm
# A brace is belayed to a block hooked at the ship's SIDE, so its foot stands
# this far outboard of the bulwark's outer skin. It used to sit exactly on the
# skin, which buried half of every brace ribbon in the timber: 18 braces, 36
# intersecting face pairs with `Bulwarks`.
BRACE_FOOT_CLEAR = 0.12


def braces(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Running rigging: each yard arm led aft and down to the rail behind it.

    Two to a yard, six to a mast, eighteen in all. They are what stops a bare
    rig reading as three poles with washing on them.
    """
    out = []
    t_aft = min(0.98, profiles.mast_t(p, mast) + BRACE_LEAD)
    y = profiles.station_y(p, t_aft)
    cap = profiles.sheer(p, t_aft) + p.bulwark_h
    foot = (sign * (profiles.bulwark_half_width(p, t_aft, cap) + BRACE_FOOT_CLEAR),
            y, cap)
    for z, length, _r in profiles.yard_specs(p, mast):
        _x, y_yard, _z = profiles.mast_point(p, mast, z)
        out.append(((sign * length / 2.0, y_yard, z), foot))
    return out


# --- Task 16: the rest of the rig ------------------------------------------
#
# What was here was the STANDING rigging plus braces: 345 ropes, which held the
# masts up and hauled the yards round and left the ship with no gear to work
# its sails by. Everything below is what a frigate actually had and this model
# did not: the futtock and topgallant shrouds that carry the upper fans, the
# lifts that hold the yards level, the footropes the men stood on, the
# clewlines, buntlines and sheets that handle the canvas, and the head rigging
# that stays the bowsprit down and sideways.
#
# Two of these are POLYLINES rather than pairs, and neither for the sake of a
# triangle count. A footrope hangs in a catenary between its seizings -- that
# IS a footrope, and a straight one reads as a steel rod bolted under the yard.
# A buntline is rove to the foot of its sail and leads up the sail's FORE side,
# which bellies forward, so the chord between its ends passes through the
# canvas it is supposed to lie against. Both follow the shape they really have.
# Nothing else is segmented. Shrouds and stays are set up TAUT and are left
# dead straight, because a sagging stay is a modelling error, not detail.

FUTTOCK_DROP = 1.60          # futtock stave, below the top it hangs under
TOPGALLANT_SHROUDS = 3       # a side, per mast
TOPGALLANT_HEAD = 0.92       # topgallant masthead, as a fraction of the truck
LIFT_ARM_IN = 0.05           # a lift is bent this far in from the yard arm

FOOTROPE_INNER = 0.10        # inner seizing, as a fraction of the half yard
FOOTROPE_IN = 0.08           # outer seizing, this far in from the arm
FOOTROPE_AFT = 0.30          # the men stand ABAFT the yard, clear of the canvas
FOOTROPE_HANG = 0.12         # the seizings themselves hang this far under
FOOTROPE_SAG = 0.85          # and the bight this much further at mid span
FOOTROPE_SEGMENTS = 4
# Stirrups stand at the footrope's INTERIOR NODES rather than at a spacing of
# their own, so a stirrup's foot is a point the footrope actually passes
# through. Pitched independently they landed between nodes, hanging on the
# true parabola while the rope had already been cut into chords -- off by a
# couple of centimetres, and off for a reason that would have grown with any
# change to the segment count.

CLEWLINE_IN = 0.26           # where a clewline meets its yard, in half yards
BUNTLINES = 3                # per sail
# How far off the canvas a buntline stands. Tied to `wind.PATCH_LIFT` because
# that is the thing it actually has to clear: a patch is SEWN to the sail and
# stands 0.035 m proud of it, so a buntline lying closer than that is inside
# the patch, not on the sail. At a flat 0.040 it was, 36 face pairs' worth.
# The margin has to swallow the chord sag as well -- the canvas is convex, so
# a chord between two points on the offset surface lies nearer the sail than
# either end does, by 0.019 m at five segments on a main course.
BUNTLINE_CLEAR = 0.040
BUNTLINE_LIFT = wind.PATCH_LIFT + BUNTLINE_CLEAR
BUNTLINE_SEGMENTS = 5
BUNTLINE_BLOCK = 0.09        # its block sits this far above the sail head
SHEET_ARM_IN = 0.10          # a sheet lands this far in from the arm below it
SHEET_LEAD = 0.18            # how far aft, in station t, a course sheet leads

BOBSTAY_SPAR = (0.42, 0.58)  # along the bowsprit, heel to tip
BOBSTAY_KNEE = (0.50, 0.70)  # up the knee of the head, forefoot to stem head
BOWSPRIT_SHROUD_SPAR = 0.50
JIB_GUY_SPAR = 0.85
HEAD_RIG_FOOT_CLEAR = 0.10   # head rigging sets up this far outboard of the cap


def _sag(f: float) -> float:
    """0 at either seizing, 1 at the bight. A parabola is a catenary's own
    small-sag limit and costs no transcendentals."""
    return 4.0 * f * (1.0 - f)


def _mast_y(p: FrigateParams, mast: str, z: float) -> float:
    return profiles.mast_point(p, mast, z)[1]


def topgallant_head_z(p: FrigateParams, mast: str) -> float:
    return TOPGALLANT_HEAD * profiles.mast_truck_z(p, mast)


def futtock_shrouds(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """The top's rim down and INBOARD to a futtock stave on the lower shrouds.

    `topmast_shrouds` was already named "futtock-and-topmast shrouds" and runs
    from that same rim UPWARD. What was missing is the half that takes the
    load back DOWN into the lower rigging, which is the whole reason a top has
    a rim to stand on.
    """
    top_z, half_x, half_y = profiles.top_platform(p, mast)
    y_axis = _mast_y(p, mast, top_z)
    fan = lower_shrouds(p, mast, sign)
    z = top_z - FUTTOCK_DROP
    n = TOPMAST_SHROUDS
    out = []
    for i in range(n):
        f = i / (n - 1)
        k = min(len(fan) - 1, int(round(f * (len(fan) - 1))))
        out.append((point_at_height(fan[k], z),
                    (sign * half_x, y_axis - half_y * TOPMAST_FAN_FOOT * f, top_z)))
    return out


def topgallant_shrouds(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Crosstree rim up to the topgallant masthead. Abaft the axis, like the
    topmast fan below it and for the same reason: the canvas is forward."""
    cross_z, half_x, half_y = profiles.crosstrees(p, mast)
    y_axis = _mast_y(p, mast, cross_z)
    z = topgallant_head_z(p, mast)
    y_head = _mast_y(p, mast, z)
    r = profiles.spar_radius_at(p, mast, z)
    n = TOPGALLANT_SHROUDS
    return [
        ((sign * half_x, y_axis - half_y * TOPMAST_FAN_FOOT * (i / (n - 1)), cross_z),
         (sign * r, y_head - MAST_SPREAD * (i / (n - 1)), z))
        for i in range(n)
    ]


def topgallant_backstays(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """One a side, topgallant head down AFT to the after end of the channel."""
    _t_fwd, t_aft = profiles.channel_span(p, mast)
    y = profiles.station_y(p, t_aft) + BACKSTAY_STEP * 2.0
    t = profiles.t_of_y(p, y)
    z = topgallant_head_z(p, mast)
    r = profiles.spar_radius_at(p, mast, z)
    return [((sign * r, _mast_y(p, mast, z), z),
             (sign * profiles.channel_outer(p, t, mast), y,
              profiles.channel_z(p, t, mast)))]


def lifts(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Yard arm up to the masthead above it, one a side per yard.

    A lift is what holds a yard level when its sail is off it. Without them a
    yard hangs on its slings alone and the rig reads as spars resting on poles.
    """
    out = []
    for i, (z, length, _r) in enumerate(profiles.yard_specs(p, mast)):
        plan = profiles.yard_plan_of(p, mast, _sail_tier(p, mast, i))
        if plan is not None:
            # a flying yard's lifts lead to where its mast says
            z_head = plan.lift_frac * profiles.mast_truck_z(p, mast)
        else:
            z_head = (hounds_z(p, mast), topmast_hounds_z(p, mast),
                      topgallant_head_z(p, mast))[i]
        out.append(((sign * (length / 2.0 - LIFT_ARM_IN), _mast_y(p, mast, z), z),
                    (sign * profiles.spar_radius_at(p, mast, z_head),
                     _mast_y(p, mast, z_head), z_head)))
    return out


def _sail_tier(p: FrigateParams, mast: str, index: int) -> int:
    """The TIER of the square sail bent to yard `index` of this mast. On a
    square-rigged mast it is the index itself; the sloop's one yard carries
    her tier-2 flying topsail (`profiles.yard_index`)."""
    return profiles.square_sails_on(p, mast)[index].tier


def _footrope_span(p: FrigateParams, mast: str, tier: int, sign: float):
    z, length, _r = profiles.yard_specs(p, mast)[tier]
    half = length / 2.0
    return (sign * FOOTROPE_INNER * half, sign * (half - FOOTROPE_IN),
            _mast_y(p, mast, z) - FOOTROPE_AFT, z)


def footropes(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """One a side per yard, hanging in a catenary ABAFT the yard it is slung on.

    Abaft, because that is where the men stand to furl and because the canvas
    is set forward: a footrope hung forward of its yard would be inside its own
    sail. Segmented, because the sag is the whole shape of the thing.
    """
    out = []
    for tier in range(len(profiles.yard_specs(p, mast))):
        x0, x1, y, z = _footrope_span(p, mast, tier, sign)
        pts = []
        for i in range(FOOTROPE_SEGMENTS + 1):
            f = i / FOOTROPE_SEGMENTS
            pts.append((x0 + (x1 - x0) * f, y,
                        z - FOOTROPE_HANG - FOOTROPE_SAG * _sag(f)))
        out.append(tuple(pts))
    return out


def stirrups(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Short pendants from the yard down to the footrope under it."""
    out = []
    for tier in range(len(profiles.yard_specs(p, mast))):
        x0, x1, y, z = _footrope_span(p, mast, tier, sign)
        for k in range(FOOTROPE_SEGMENTS - 1):
            f = (k + 1) / FOOTROPE_SEGMENTS
            x = x0 + (x1 - x0) * f
            out.append(((x, y + FOOTROPE_AFT, z),
                        (x, y, z - FOOTROPE_HANG - FOOTROPE_SAG * _sag(f))))
    return out


def clewlines(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Clew up to the yard, one a side per sail.

    It passes ABAFT its own sail without being routed to: the clew is on the
    canvas, which is set `wind.SAIL_FWD` forward of the mast and bellies
    further forward still, and the yard it leads to is on the mast. The rope
    therefore leads aft from the moment it leaves the clew.
    """
    out = []
    for i, (z, length, _r) in enumerate(profiles.yard_specs(p, mast)):
        clew = wind.sail_point(p, mast, _sail_tier(p, mast, i), sign * 1.0, 0.0)
        out.append((clew, (sign * CLEWLINE_IN * length / 2.0, _mast_y(p, mast, z), z)))
    return out


def sheets(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """Clew down to the yard arm below it; for a course, aft to the ship's
    side; for a FLYING topsail (`shiptype.YardPlan`), in to the lower
    masthead its foot is sheeted home to."""
    specs = profiles.yard_specs(p, mast)
    out = []
    for tier in range(len(specs)):
        sail_tier = _sail_tier(p, mast, tier)
        clew = wind.sail_point(p, mast, sail_tier, sign * 1.0, 0.0)
        plan = profiles.yard_plan_of(p, mast, sail_tier)
        if plan is not None:
            z = clew[2]
            foot = (sign * profiles.spar_radius_at(p, mast, z),
                    _mast_y(p, mast, z), z)
        elif tier == 0:
            t = min(0.98, profiles.mast_t(p, mast) + SHEET_LEAD)
            cap = profiles.sheer(p, t) + p.bulwark_h
            foot = (sign * (profiles.bulwark_half_width(p, t, cap) + BRACE_FOOT_CLEAR),
                    profiles.station_y(p, t), cap)
        else:
            z, length, _r = specs[tier - 1]
            foot = (sign * (length / 2.0 - SHEET_ARM_IN), _mast_y(p, mast, z), z)
        out.append((clew, foot))
    return out


def buntlines(p: FrigateParams, mast: str) -> list[Rope]:
    """Up the FORE side of each sail, standing off the canvas it is rove to.

    Laid exactly as `dressing`'s patches are: on `wind.sail_point`, lifted
    along `wind.sail_normal`, so the line follows the belly instead of cutting
    the chord through it. The last leg carries it up to its block above the
    sail head, which is where a buntline is actually led.
    """
    out = []
    for i, (z, _length, _r) in enumerate(profiles.yard_specs(p, mast)):
        tier = _sail_tier(p, mast, i)
        head_z = wind.sail_panel(p, mast, tier)["head_z"]
        for k in range(BUNTLINES):
            u = -1.0 + 2.0 * (k + 1) / (BUNTLINES + 1)
            pts = []
            for i in range(BUNTLINE_SEGMENTS + 1):
                v = i / BUNTLINE_SEGMENTS
                c = wind.sail_point(p, mast, tier, u, v)
                n = wind.sail_normal(p, mast, tier, v)
                pts.append(tuple(c[j] + BUNTLINE_LIFT * n[j] for j in range(3)))
            top = pts[-1]
            pts.append((top[0], _mast_y(p, mast, z), head_z + BUNTLINE_BLOCK))
            out.append(tuple(pts))
    return out


def _spar_at(p: FrigateParams, f: float) -> Point:
    return _bowsprit_at(p, f)


def _bow_cap(p: FrigateParams, sign: float) -> Point:
    """Where head rigging sets up on the ship's side: the bulwark cap at the
    beakhead bulkhead's own station, which is the strongest point there is."""
    t = head.beakhead_t(p)
    cap = profiles.sheer(p, t) + p.bulwark_h
    return (sign * (profiles.bulwark_half_width(p, t, cap) + HEAD_RIG_FOOT_CLEAR),
            profiles.station_y(p, t), cap)


def bobstays(p: FrigateParams) -> list[Rope]:
    """Bowsprit down to the KNEE OF THE HEAD, on the centreline.

    A bobstay is what stops the bowsprit lifting, and it sets up to the knee --
    which this ship only acquired in the task before this one. Both pass under
    the figurehead rather than through it, because the knee's forward edge
    stands forward of the stem while Minerva leans out above it.
    """
    y_stem = profiles.station_y(p, 0.0)
    z_foot = profiles.keel_z(p, 0.0)
    z_head = profiles.sheer(p, 0.0)
    reach = p.head_form.knee_reach_frac * (z_head - z_foot)
    out = []
    for f_spar, f_knee in zip(BOBSTAY_SPAR, BOBSTAY_KNEE):
        z = z_foot + f_knee * (z_head - z_foot)
        proj = max(q for fz, q in p.head_form.knee_outline if fz <= f_knee)
        out.append((_spar_at(p, f_spar), (0.0, y_stem + proj * reach, z)))
    return out


def bowsprit_shrouds(p: FrigateParams, sign: float) -> list[Rope]:
    """One a side, staying the bowsprit against an athwartships pull."""
    return [(_spar_at(p, BOWSPRIT_SHROUD_SPAR), _bow_cap(p, sign))]


def jib_guys(p: FrigateParams, sign: float) -> list[Rope]:
    """One a side, further out along the spar than the shroud below it."""
    return [(_spar_at(p, JIB_GUY_SPAR), _bow_cap(p, sign))]


# --- the lateen's own running rigging ---------------------------------------
#
# The first new running rigging anyone has had to write. `shiptype.rope_families`
# names four: `lateen_halyard`, `lateen_tack`, `lateen_sheet` and `vang`.
#
# THE SPAR THEY ALL LEAD FROM IS `profiles.lateen_spar`, the one that is cut.
# Measured on the galleon's mizzen, with every station named:
#   HEEL/TACK (0, -7.669, 10.339) at t 0.7256, over the quarterdeck
#   SLINGS    (0, -10.682, 13.249) at t 0.8142, where it crosses its own mast
#   PEAK      (0, -17.711, 20.037) abaft the taffrail at -17.000
# and the canvas's one derived corner, from `sailplan`:
#   CLEW      (0, -15.502, 12.424) at t 0.9559, over the poop

LATEEN_ROPE_CLEAR = 0.12     # a rope stands this far off the skin of the spar it leads past
LATEEN_HALYARD_HEAD = 0.94   # the halyard block, as a fraction of its own mast's truck
LATEEN_TACK_LEAD = 0.04      # the tack's deck block, in station t FORWARD of the heel
LATEEN_SHEET_LEAD = 0.03     # the sheet's rail block, in station t ABAFT the clew
LATEEN_VANG_LEAD = 0.06      # the vang's rail block, in station t FORWARD of the peak


def _sets_lateen(p: FrigateParams, mast: str) -> bool:
    return mast in profiles.lateen_masts(p)


def _lateen_sail(p: FrigateParams, mast: str):
    (sail,) = [s for s in p.rig.mast(mast).sails
               if s.kind is st.SailKind.LATEEN]
    return sail


def _abaft_the_mast(p: FrigateParams, mast: str, z: float) -> Point:
    """On the centreline, just abaft the mast's own skin at height z.

    A rope whose ends sit ON the mast axis is a ribbon buried in the spar —
    the same defect `BRACE_FOOT_CLEAR` exists for at the bulwark.
    """
    return (0.0,
            _mast_y(p, mast, z) - profiles.spar_radius_at(p, mast, z)
            - LATEEN_ROPE_CLEAR,
            z)


def _rail_block(p: FrigateParams, t: float, sign: float) -> Point:
    """A block hooked at the RAIL CAP at station t, just outboard of it.

    `profiles.rail_top_z` and NOT `sheer + bulwark_h`: the braces and course
    sheets lead to the waist cap because that is where a frigate's rail is,
    but a lateen's sheet and vangs come down over a galleon's POOP, whose own
    cap stands 6.00 m above the sheer there. This is `rail_top_z`'s first
    galleon consumer, which is why its poop blindness had to be fixed first.
    """
    cap = profiles.rail_top_z(p, t)
    return (sign * (profiles.bulwark_half_width(p, t, cap) + BRACE_FOOT_CLEAR),
            profiles.station_y(p, t), cap)


def lateen_halyards(p: FrigateParams, mast: str) -> list[Rope]:
    """SLINGS up to the halyard block at its own masthead. CENTRELINE.

    Bent at the SLINGS and not at the heel, because the slings are what a
    lateen yard is hoisted by — it is the point the whole spar hangs from and
    the point `rig.lateen_pivots` swings it about. One rope, not a pair: the
    halyard is rove on the centreline.
    """
    if not _sets_lateen(p, mast):
        return []
    _heel, slings, _peak, r_yard = profiles.lateen_spar(p, mast)
    z_head = LATEEN_HALYARD_HEAD * profiles.mast_truck_z(p, mast)
    return [((0.0, slings[1] - r_yard - LATEEN_ROPE_CLEAR, slings[2]),
             _abaft_the_mast(p, mast, z_head))]


def lateen_tacks(p: FrigateParams, mast: str) -> list[Rope]:
    """HEEL down and FORWARD to the deck under it. CENTRELINE.

    Down AND forward: holding the heel forward is the whole job of a tack,
    and one that led straight down would not do it. The deck it lands on is
    whichever is uppermost at its own station, which over the galleon's
    mizzen is the quarterdeck.
    """
    if not _sets_lateen(p, mast):
        return []
    heel, _slings, _peak, _r = profiles.lateen_spar(p, mast)
    t = max(0.02, profiles.t_of_y(p, heel[1]) - LATEEN_TACK_LEAD)
    return [(heel, profiles.deck_spot(p, t, 0.0))]


def lateen_sheets(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """CLEW aft and down to a block at the rail. ONE A SIDE.

    A pair, so the sail can be sheeted on either tack — the same reason a
    square course has two sheets. The clew is `sailplan`'s, because the clew
    is canvas and not timber: it is the one corner no spar gives.
    """
    if not _sets_lateen(p, mast):
        return []
    from . import sailplan
    c = sailplan.corners(p, mast, _lateen_sail(p, mast))
    t = min(0.98, profiles.t_of_y(p, c.clew[1]) + LATEEN_SHEET_LEAD)
    return [(c.clew, _rail_block(p, t, sign))]


def lateen_vangs(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """PEAK forward and down to a block at the rail. ONE A SIDE.

    FORWARD of the peak, because the peak overhangs the taffrail by 0.54 m
    and a vang led aft of it would have nothing to set up to. A vang steadies
    the peak athwartships, which is why there must be one each side: a single
    centreline vang would steady nothing.
    """
    if not _sets_lateen(p, mast):
        return []
    _heel, _slings, peak, _r = profiles.lateen_spar(p, mast)
    t = max(0.02, profiles.t_of_y(p, peak[1]) - LATEEN_VANG_LEAD)
    return [(peak, _rail_block(p, t, sign))]


# --- the fore-and-aft rig's own: gaff, gaff topsail, headsails --------------
#
# The sloop is the first built ship to set a gaff sail, a gaff topsail or a
# headsail, so these are the first drawings of their families. One rule runs
# through them: A ROPE THAT WORKS A CORNER OF CANVAS IS BENT TO THE SPAR OR
# THE CORNER AND LEADS AWAY ON THE WINDWARD SIDE OR OVER THE SAIL'S EDGE, never
# across the belly. A gaff sail and its topsail lie in the ship's centre plane
# and belly to LEEWARD across it, so a rope in that plane, or to leeward of
# it, runs through the cloth.

FA_ROPE_CLEAR = 0.12        # a rope stands this far off the skin of a spar
# a rope led past a sail stands this far to windward of it
FA_WINDWARD = 0.25
GAFF_PEAK_HALYARD_AT = 0.60  # along the gaff, throat to peak, where it is bent
GAFF_HALYARD_HEAD = 0.97    # the halyard blocks, under the lower cap
# the vang's rail block, in station t FORWARD of the peak
GAFF_VANG_LEAD = 0.05
STAYSAIL_HALYARD_RISE = 0.50  # the halyard block, over the sail's head
# the sheet's rail block, in station t ABAFT the clew
STAYSAIL_SHEET_LEAD = 0.04
# a sheet or downhaul stands this far off its corner
STAYSAIL_CLEAR = 0.10


def _sail_of(p: FrigateParams, mast: str, kind) -> object | None:
    found = [s for s in p.rig.mast(mast).sails if s.kind is kind]
    return found[0] if found else None


def _windward(p: FrigateParams, z: float) -> float:
    """The sign of x on the WINDWARD side at height z."""
    return -lee_sign(p, z)


def _gaff(p: FrigateParams, mast: str):
    from . import sailplan
    sail = _sail_of(p, mast, st.SailKind.GAFF)
    return None if sail is None else sailplan.corners(p, mast, sail)


def _forward_of_the_mast(p: FrigateParams, mast: str, z: float) -> Point:
    return (0.0,
            _mast_y(p, mast, z) + profiles.spar_radius_at(p, mast, z)
            + FA_ROPE_CLEAR,
            z)


def throat_halyards(p: FrigateParams, mast: str) -> list[Rope]:
    """GAFF JAWS up to the block under the lower cap. CENTRELINE, FORWARD of
    the mast, where the jaws' own tackle hangs, clear of the topsail's luff
    laced up the after side."""
    c = _gaff(p, mast)
    if c is None:
        return []
    _foot, cap, _tm, _truck = profiles._mast_cap_zs(p, mast)
    return [(_forward_of_the_mast(p, mast, c.throat[2]),
             _forward_of_the_mast(p, mast, GAFF_HALYARD_HEAD * cap))]


def peak_halyards(p: FrigateParams, mast: str) -> list[Rope]:
    """From the gaff, `GAFF_PEAK_HALYARD_AT` along it, up to the topmast
    hounds, on the WINDWARD side of the gaff topsail that fills to leeward
    between them."""
    c = _gaff(p, mast)
    if c is None:
        return []
    z_head = topmast_hounds_z(p, mast)
    w = _windward(p, z_head) * FA_WINDWARD
    on = _lerp(c.throat, c.peak, GAFF_PEAK_HALYARD_AT)
    head = profiles.mast_point(p, mast, z_head)
    return [((w, on[1], on[2]), (w, head[1], head[2]))]


def topping_lifts(p: FrigateParams, mast: str) -> list[Rope]:
    """BOOM END up to the lower masthead, to WINDWARD of the mainsail."""
    c = _gaff(p, mast)
    if c is None:
        return []
    _foot, cap, _tm, _truck = profiles._mast_cap_zs(p, mast)
    z_head = GAFF_HALYARD_HEAD * cap
    w = _windward(p, z_head) * FA_WINDWARD
    head = profiles.mast_point(p, mast, z_head)
    end = c.clew
    return [((w, end[1], end[2] - FA_ROPE_CLEAR),
             (w, head[1], head[2]))]


# where the boom sheet is set up: the deck just inside the taffrail
BOOM_SHEET_T = 0.95


def boom_sheets(p: FrigateParams, mast: str) -> list[Rope]:
    """From UNDER the boom straight down to the deck at `BOOM_SHEET_T`,
    inside the taffrail. CENTRELINE: the sail is loose-footed and stands
    over the boom, so nothing of it is under there; and led down inboard,
    clear of the taffrail and its carving, which a sheet led from the boom's
    end over the stern ran through."""
    from . import sailplan
    if _gaff(p, mast) is None:
        return []
    root, tip, r0, _r1 = sailplan.gaff_spars(p, mast)["boom"]
    deck = profiles.deck_spot(p, BOOM_SHEET_T, 0.0)
    f = (deck[1] - root[1]) / (tip[1] - root[1])
    z_axis = root[2] + (tip[2] - root[2]) * f
    return [((0.0, deck[1], z_axis - r0 - FA_ROPE_CLEAR), deck)]


def gaff_vangs(p: FrigateParams, mast: str, sign: float) -> list[Rope]:
    """PEAK down to a block at the rail FORWARD of it, on the WINDWARD side
    only: the lee vang of a gaff sail full of wind lies in its belly, and
    is let go and set up again on the other tack, as the galleon's lee
    backstay is."""
    c = _gaff(p, mast)
    if c is None or sign != _windward(p, c.peak[2]):
        return []
    t = max(0.02, profiles.t_of_y(p, c.peak[1]) - GAFF_VANG_LEAD)
    return [((sign * FA_ROPE_CLEAR, c.peak[1], c.peak[2]),
             _rail_block(p, t, sign))]


def _topsail(p: FrigateParams, mast: str):
    from . import sailplan
    sail = _sail_of(p, mast, st.SailKind.GAFF_TOPSAIL)
    return None if sail is None else sailplan.corners(p, mast, sail)


def topsail_halyards(p: FrigateParams, mast: str) -> list[Rope]:
    """The topsail's HEAD up to the truck. CENTRELINE, over the canvas."""
    c = _topsail(p, mast)
    if c is None:
        return []
    truck = profiles.mast_truck_z(p, mast)
    return [((0.0, c.throat[1], c.throat[2] + FA_ROPE_CLEAR),
             _abaft_the_mast(p, mast, 0.995 * truck))]


def topsail_sheets(p: FrigateParams, mast: str) -> list[Rope]:
    """The topsail's CLEW in along the gaff to its jaws, on the WINDWARD
    side of the gaff, clear of the timber and of the canvas over it."""
    c = _topsail(p, mast)
    if c is None:
        return []
    w = _windward(p, c.clew[2]) * FA_WINDWARD
    return [((w, c.clew[1], c.clew[2]), (w, c.peak[1], c.peak[2]))]


def _headsail(p: FrigateParams, sail):
    from . import sailplan
    return sailplan.corners(p, None, sail)


def staysail_halyards(p: FrigateParams, sail) -> list[Rope]:
    """The sail's HEAD up its stay to a block on the mast it is set to."""
    c = _headsail(p, sail)
    fore = profiles.mast_names(p)[0]
    z0 = c.throat[2] + FA_ROPE_CLEAR
    z = c.throat[2] + STAYSAIL_HALYARD_RISE
    return [(_forward_of_the_mast(p, fore, z0),
             _forward_of_the_mast(p, fore, z))]


def downhauls(p: FrigateParams, sail) -> list[Rope]:
    """HEAD down the stay to the TACK, standing `STAYSAIL_CLEAR` to
    windward of the luff it hauls down."""
    c = _headsail(p, sail)
    w = _windward(p, c.throat[2]) * STAYSAIL_CLEAR
    return [((w, c.throat[1], c.throat[2]), (w, c.tack[1], c.tack[2]))]


def staysail_sheets(p: FrigateParams, sail, sign: float) -> list[Rope]:
    """CLEW aft to a block at the rail, on the LEE side only: the sail is
    sheeted to leeward, and a windward sheet would cross its canvas."""
    c = _headsail(p, sail)
    if sign != lee_sign(p, c.clew[2]):
        return []
    t = min(0.98, profiles.t_of_y(p, c.clew[1]) + STAYSAIL_SHEET_LEAD)
    start = (sign * STAYSAIL_CLEAR, c.clew[1] - STAYSAIL_CLEAR,
             c.clew[2] - STAYSAIL_CLEAR)
    return [(start, _rail_block(p, t, sign))]


# Rigging comes in two kinds and they generalise differently.
#
# STANDING rigging holds a MAST up. Every ship has shrouds and stays whatever
# canvas it sets, so these are driven by the mast list. The upper fans depend
# on a fighting top to spread them, which a schooner's masts do not have.
#
# RUNNING rigging works a SAIL, so which families a ship needs is decided by
# the KINDS of sail it sets — `shiptype.rope_families` per sail kind — and not
# by assuming a square rig. A gaff sail needs a throat halyard and a boom
# sheet and has no yard to brace.
#
# Their order within one mast is unchanged: standing first, then running, which
# is the order the catalogue was emitted in before it was split.
STANDING_PER_SIDE = (
    ("shroud", lower_shrouds, False),
    ("topmast_shroud", topmast_shrouds, True),
    ("futtock", futtock_shrouds, True),
    ("topgallant_shroud", topgallant_shrouds, True),
    ("ratline", ratlines, False),
    ("topmast_ratline", topmast_ratlines, True),
    ("backstay", backstays, False),
    ("topgallant_backstay", topgallant_backstays, True),
)

# RUNNING RIGGING IS KEYED BY SAIL KIND, and it has to be. This used to be two
# flat tuples run against every mast behind one boolean,
# `square = bool(profiles.square_sails_on(p, mast))` — which is "is this a
# SQUARE mast" being used to mean "does this mast have canvas to WORK". A mast
# setting a lateen and nothing else therefore got NO running rigging at all,
# including the four families a lateen exists for, and a green suite said so.
#
# A FAMILY NAME DOES NOT FIX ITS GEOMETRY, which is the second reason for the
# key. `vang` belongs to both GAFF and LATEEN: a lateen's leads from the PEAK
# of one long raking yard down to the rail a side, a gaff's from the peak of a
# gaff standing over a boom. One builder cannot serve both, so a vang builder
# written for the galleon must NOT make the schooner's vang look buildable.
RUNNING_PER_SIDE = {
    st.SailKind.SQUARE: (
        ("brace", braces),
        ("lift", lifts),
        ("footrope", footropes),
        ("stirrup", stirrups),
        ("clewline", clewlines),
        ("sheet", sheets),
    ),
    st.SailKind.LATEEN: (
        ("lateen_sheet", lateen_sheets),
        ("vang", lateen_vangs),
    ),
    st.SailKind.GAFF: (
        ("vang", gaff_vangs),
    ),
}

RUNNING_PER_MAST = {
    st.SailKind.SQUARE: (
        ("buntline", buntlines),
    ),
    st.SailKind.LATEEN: (
        ("lateen_halyard", lateen_halyards),
        ("lateen_tack", lateen_tacks),
    ),
    st.SailKind.GAFF: (
        ("throat_halyard", throat_halyards),
        ("peak_halyard", peak_halyards),
        ("topping_lift", topping_lifts),
        ("boom_sheet", boom_sheets),
    ),
    st.SailKind.GAFF_TOPSAIL: (
        ("topsail_halyard", topsail_halyards),
        ("topsail_sheet", topsail_sheets),
    ),
}

# A HEADSAIL BELONGS TO NO MAST, so its running rigging is drawn per sail:
# once a sail, and once a sail a side.
RUNNING_PER_HEADSAIL = {
    st.SailKind.STAYSAIL: (
        ("staysail_halyard", staysail_halyards),
        ("downhaul", downhauls),
    ),
}

RUNNING_PER_HEADSAIL_SIDE = {
    st.SailKind.STAYSAIL: (
        ("staysail_sheet", staysail_sheets),
    ),
}


def buildable_for(kind: st.SailKind) -> frozenset[str]:
    """The families this module can draw FOR ONE KIND of sail.

    Per kind and not per name: see the comment on `RUNNING_PER_SIDE`. The
    schooner's `vang` is unbuildable and the galleon's is drawn, and both
    statements are true at once.
    """
    return frozenset([k for k, _fn in RUNNING_PER_MAST.get(kind, ())]
                     + [k for k, _fn in RUNNING_PER_SIDE.get(kind, ())]
                     + [k for k, _fn in RUNNING_PER_HEADSAIL.get(kind, ())]
                     + [k for k, _fn in
                        RUNNING_PER_HEADSAIL_SIDE.get(kind, ())])


# Every running family this package can emit for SOME kind of sail. Useful as
# a roster; it is NOT the test of whether a given rig can be drawn, because
# that question is per kind. `unbuildable_families` is.
BUILDABLE = frozenset().union(
    *(buildable_for(k) for k in st.SailKind)
) if len(st.SailKind) else frozenset()


def unbuildable_families(p: FrigateParams) -> list[str]:
    """Running-rigging families this ship's rig needs and this module cannot draw.

    Asked per sail kind, so a family drawn for one kind is not credited to
    another. A rig may ask for a family that is modelled but not yet built —
    the schooner's throat and peak halyards, its boom sheet, its own vang —
    and `all_ropes` names them rather than quietly dropping the rope.
    """
    missing: set[str] = set()
    for sail in p.rig.all_sails():
        missing |= set(st.rope_families(sail.kind)) - buildable_for(sail.kind)
    return sorted(missing)


def running_families_for_mast(p: FrigateParams, name: str) -> dict[str, list]:
    """{"per_mast": [(family, fn)], "per_side": [(family, fn)]} for one mast.

    The union over the KINDS of sail that mast sets, in sail order, deduped —
    a mast carrying both a square sail and a lateen would get both sets, once
    each. `all_ropes` and `families_for_mast` both read this, so the plan and
    the drawing cannot drift apart.
    """
    per_mast: list = []
    per_side: list = []
    for sail in sorted(p.rig.mast(name).sails, key=lambda s: s.tier):
        for bucket, table in ((per_mast, RUNNING_PER_MAST),
                              (per_side, RUNNING_PER_SIDE)):
            for entry in table.get(sail.kind, ()):
                if entry not in bucket:
                    bucket.append(entry)
    return {"per_mast": per_mast, "per_side": per_side}


def families_for_mast(p: FrigateParams, name: str) -> dict[str, list[str]]:
    """Which rope families one mast gets, and why, WITHOUT drawing any of them.

    Separating the plan from the drawing is what lets a rig be reasoned about
    before every one of its families has a builder: a galleon's lateen mizzen
    can be shown to get shrouds and no braces, and its four lateen families
    and no square ones, without a single rope being emitted.
    """
    spec = p.rig.mast(name)
    running = running_families_for_mast(p, name)
    return {
        "standing": [k for k, _fn, needs_top in STANDING_PER_SIDE
                     if spec.has_top() or not needs_top],
        "running": ([k for k, _fn in running["per_mast"]]
                    + [k for k, _fn in running["per_side"]]),
    }

# Running rigging that handles canvas, as opposed to rigging that holds spars
# up. `rigging` gives it a lighter ribbon, and it is the only rigging allowed
# to be anything but dead straight.
RUNNING = ("brace", "lift", "footrope", "stirrup", "clewline", "sheet",
           "buntline", "lateen_halyard", "lateen_tack", "lateen_sheet",
           "vang", "throat_halyard", "peak_halyard", "topping_lift",
           "boom_sheet", "topsail_halyard", "topsail_sheet",
           "staysail_halyard", "downhaul", "staysail_sheet")

# THE RIBBON EACH FAMILY IS DRAWN AS: its width in metres, and the axis its
# flat face looks along. It lives here, beside the family tables, and not in
# `rigging`, because "which families exist" and "how each one is drawn" have
# to be the same list — a family added to one and forgotten in the other is a
# bare `KeyError` inside `build_rigging`, which is a crash in Blender for
# something a pure test can see. `rigging.ROPE_STYLE` is this dict.
ROPE_STYLE = {
    # standing rigging: it holds the spars up, and it is heavier
    "stay": (0.090, (1.0, 0.0, 0.0)),
    "shroud": (0.070, (0.0, 1.0, 0.0)),
    "topmast_shroud": (0.055, (0.0, 1.0, 0.0)),
    "futtock": (0.055, (0.0, 1.0, 0.0)),
    "topgallant_shroud": (0.045, (0.0, 1.0, 0.0)),
    "ratline": (0.045, (0.0, 1.0, 0.0)),
    "topmast_ratline": (0.040, (0.0, 1.0, 0.0)),
    "backstay": (0.075, (0.0, 1.0, 0.0)),
    "topgallant_backstay": (0.060, (0.0, 1.0, 0.0)),
    # head rigging: fore-and-aft ropes, so they are turned to face athwartships
    "bobstay": (0.080, (1.0, 0.0, 0.0)),
    "bowsprit_shroud": (0.065, (1.0, 0.0, 0.0)),
    "jib_guy": (0.055, (1.0, 0.0, 0.0)),
    # running rigging: it works the yards and the canvas, and it is lighter
    "brace": (0.055, (0.0, 1.0, 0.0)),
    "lift": (0.050, (0.0, 1.0, 0.0)),
    "footrope": (0.050, (0.0, 1.0, 0.0)),
    "stirrup": (0.035, (0.0, 1.0, 0.0)),
    "clewline": (0.045, (0.0, 1.0, 0.0)),
    "buntline": (0.040, (0.0, 1.0, 0.0)),
    "sheet": (0.055, (0.0, 1.0, 0.0)),
    # the lateen's own, which run FORE AND AFT in the ship's centre plane, so
    # they are turned to face athwartships as the head rigging is. The halyard
    # is the heaviest of the four: it hoists the whole spar.
    "lateen_halyard": (0.065, (1.0, 0.0, 0.0)),
    "lateen_tack": (0.055, (1.0, 0.0, 0.0)),
    "lateen_sheet": (0.055, (0.0, 1.0, 0.0)),
    "vang": (0.050, (0.0, 1.0, 0.0)),
    # the gaff's, its topsail's and the headsails': the halyards, lifts and
    # sheets run fore and aft or up the mast, so they face athwartships
    "throat_halyard": (0.050, (1.0, 0.0, 0.0)),
    "peak_halyard": (0.050, (1.0, 0.0, 0.0)),
    "topping_lift": (0.045, (1.0, 0.0, 0.0)),
    "boom_sheet": (0.055, (1.0, 0.0, 0.0)),
    "topsail_halyard": (0.040, (1.0, 0.0, 0.0)),
    "topsail_sheet": (0.040, (1.0, 0.0, 0.0)),
    "staysail_halyard": (0.045, (1.0, 0.0, 0.0)),
    "downhaul": (0.035, (1.0, 0.0, 0.0)),
    "staysail_sheet": (0.045, (0.0, 1.0, 0.0)),
}


def lee_sign(p: FrigateParams, z: float) -> float:
    """The LEE side at height z, as the sign of x: the side the shared wind
    pushes the canvas toward. `wind.wind_direction` is the one wind every sail
    bellies in, so the lee side is read off it and not stated twice."""
    return 1.0 if wind.wind_direction(p, z)[0] >= 0.0 else -1.0


def cast_off_to_lee(p: FrigateParams, mast: str) -> frozenset[str]:
    """Standing families this mast does not set up on its LEE side, because
    of a sail it sets (`shiptype.cast_off_to_lee`). Empty on a mast of square
    sails only, which is every mast the frigate has."""
    return frozenset(k for sail in p.rig.mast(mast).sails
                     for k in st.cast_off_to_lee(sail.kind))


def all_ropes(p: FrigateParams) -> list[tuple[str, Rope]]:
    """Every rope in the ship, tagged with what it is. Each is a POLYLINE.

    This used to return `(kind, a, b)` triples, which could not express a rope
    with a shape. It now returns `(kind, points)` with two or more points; the
    overwhelming majority still have exactly two.

    What is emitted is decided by the ship's own rig: a mast with no fighting
    top gets no futtock or topmast fan, and a mast setting no square sail gets
    no braces, lifts, clewlines or sheets, because there is no yard for them
    to lead to.
    """
    p.validate()
    missing = unbuildable_families(p)
    if missing:
        raise NotImplementedError(
            f"this rig needs running rigging this module cannot draw yet: "
            f"{missing}. They are declared in shiptype.rope_families and a "
            f"builder has to be written for each — do not drop them silently."
        )
    out: list[tuple[str, Rope]] = [("stay", r) for r in stays(p)]
    for mast in profiles.mast_names(p):
        spec = p.rig.mast(mast)
        # PER SAIL KIND, not behind a "is this a square mast" boolean. See
        # the comment on `RUNNING_PER_SIDE` for what that gate cost.
        running = running_families_for_mast(p, mast)
        cast_off = cast_off_to_lee(p, mast)
        lee = lee_sign(p, topmast_hounds_z(p, mast))
        for kind, fn in running["per_mast"]:
            out += [(kind, tuple(r)) for r in fn(p, mast)]
        for sign in (-1.0, 1.0):
            for kind, fn, needs_top in STANDING_PER_SIDE:
                if needs_top and not spec.has_top():
                    continue
                if kind in cast_off and sign == lee:
                    continue   # let go to leeward; see `cast_off_to_lee`
                out += [(kind, tuple(r)) for r in fn(p, mast, sign)]
            for kind, fn in running["per_side"]:
                out += [(kind, tuple(r)) for r in fn(p, mast, sign)]
    for sign in (-1.0, 1.0):
        out += [("bowsprit_shroud", r) for r in bowsprit_shrouds(p, sign)]
        out += [("jib_guy", r) for r in jib_guys(p, sign)]
    out += [("bobstay", r) for r in bobstays(p)]
    # The headsails' own, AFTER everything the frigate draws, so a ship that
    # sets none emits her ropes in exactly the order she always did.
    for sail in sorted(p.rig.headsails, key=lambda s: s.tier):
        for kind, fn in RUNNING_PER_HEADSAIL.get(sail.kind, ()):
            out += [(kind, tuple(r)) for r in fn(p, sail)]
        for sign in (-1.0, 1.0):
            for kind, fn in RUNNING_PER_HEADSAIL_SIDE.get(sail.kind, ()):
                out += [(kind, tuple(r)) for r in fn(p, sail, sign)]
    return out


def segments(rope: Rope) -> int:
    return len(rope) - 1


def face_kinds(p: FrigateParams) -> list[str]:
    """The kind of rope each emitted FACE belongs to, in emission order.

    `check_intersections` used to say "face i of `Rigging` is rope i of the
    plan" and index `all_ropes` directly. That was true only while every rope
    was one quad. A footrope is four and a buntline is five, so face 400 is no
    longer rope 400 and the canvas ruling would have been read off the wrong
    rope entirely. This is the mapping that replaces the assumption.
    """
    return [kind for kind, rope in all_ropes(p) for _ in range(segments(rope))]


def kind_counts(p: FrigateParams) -> dict:
    counts: dict = {}
    for kind, _rope in all_ropes(p):
        counts[kind] = counts.get(kind, 0) + 1
    return counts
