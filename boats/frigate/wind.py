"""The shared wind field, and the nine sail panels it drives. Spec section 7.

A physically correct catenary canvas looks limp. A game sail is a subdivided
grid displaced along its normal by a smooth falloff, plus a progressive twist
with height — faked wind pressure, cheaper than cloth and art-directable.

ONE wind vector drives all nine sails and the flag. `wind_direction` is a
function of HEIGHT ALONE: it never takes a mast or a sail, because the moment
it could, two sails could belly in different weathers. Task 13's Jolly Roger
reads the same function.

Pure arithmetic — imports no bpy.
"""

import math

from . import profiles
from .params import FrigateParams
from .shiptype import CourseFloor

WIND_AZIMUTH_DEG = 14.0     # where the wind pushes the canvas: off +Y toward +X
WIND_STRENGTH = 1.0
TWIST_PER_METRE_DEG = 0.33  # extra twist per metre of height above the waterline
MAX_TWIST_DEG = 14.0
BELLY_FRAC = 0.11           # deepest belly, as a fraction of the sail's head width

HEAD_FRAC = 0.92            # sail head, as a fraction of its own yard
DEPTH_FRAC = (0.58, 0.80, 0.70)   # sail depth, as a fraction of its head width
FOOT_CLEAR = 0.80           # a sail's foot stops this far above the yard below
# a course's FOOT stops this far above the rail at its own mast station;
# which rail is `course_rail_z`
COURSE_RAIL_CLEAR = 1.00
# A yard is slung FORWARD of its mast, so the canvas hangs forward too. Without
# this the sail plane passes straight through the mast it belongs to.
#
# IT IS A FLOOR, NOT THE WHOLE ANSWER — see `sail_fwd`. 0.45 is a FRIGATE
# figure: her thickest mast is 0.420 m in the radius, so it clears by 0.030 m.
# The galleon's MAINMAST is 0.480 m in the radius, so a flat 0.450 put all
# three of her main courses 0.030 m INSIDE their own mast. Measured, SAIL
# PLANE to MAST AXIS at each sail's own head against that mast's own radius
# there: frigate fore 0.4500 vs 0.3900, main 0.4500 vs 0.4200, mizzen 0.4500
# vs 0.3300; galleon fore 0.4500 vs 0.4200, GALLEON MAIN 0.4500 vs 0.4800.
SAIL_FWD = 0.45
# What the TIMBER demands on top of its own radius, where the stated stand-off
# is not enough. 0.030 m, which is exactly the air the frigate's thickest mast
# has under the figure above, so the galleon's main is given the same clearance
# the frigate's main always had rather than a number chosen to make a check go
# green.
SAIL_MAST_CLEAR = 0.03


def sail_fwd(p: FrigateParams, mast: str) -> float:
    """How far forward of its own mast's AXIS one mast's canvas plane stands.

    The GREATER of the ship's stated stand-off and what the mast's own girth
    demands — the same shape of argument as `HullForm.tumble_floor` and
    `rail_top_z`'s cap clause, and for the same reason: a linear figure
    measured on one ship is not a fact about ships.

    THE FRIGATE CANNOT MOVE. Her masts are 0.390, 0.420 and 0.330 m in the
    radius, so radius + clearance is 0.420, 0.450 and 0.360 against a stated
    0.450 — the stated figure wins on all three and the floor never binds on
    her. There is a test that asserts exactly that.
    """
    return max(SAIL_FWD, profiles.mast_radius(p, mast) + SAIL_MAST_CLEAR)


def twist_deg(p: FrigateParams, z: float) -> float:
    """Extra turn given to the canvas at height z, over the base wind azimuth."""
    return min(MAX_TWIST_DEG, TWIST_PER_METRE_DEG * max(0.0, z))


def wind_direction(p: FrigateParams, z: float) -> tuple[float, float, float]:
    """Unit vector the canvas is pushed along at height z. Horizontal, shared."""
    az = math.radians(WIND_AZIMUTH_DEG + twist_deg(p, z))
    return (math.sin(az), math.cos(az), 0.0)


def belly(u: float, v: float) -> float:
    """Displacement falloff over a sail, 0..1. `u` is -1..1 across, `v` 0..1 up.

    Zero along the head (v=1, laced to the yard) and along both leeches
    (u=+/-1, held by the braces and bowlines), deepest at the middle of the
    foot. The clews fall out of that for free: at v=0, u=+/-1 both terms meet.
    """
    return (1.0 - u * u) * (1.0 - abs(v) ** 2.2)


def course_rail_z(p: FrigateParams, mast: str) -> float:
    """The rail height a COURSE on `mast` is floored against, at its own
    station.

    `COURSE_RAIL_CLEAR` spans from this height up to the course's FOOT. Which
    rail it is, is the ship's own ruling, `p.rig.course_floor` — never a
    branch on which ship this is. WAIST_CAP (the default, the frigate
    verbatim) is the waist bulwark's cap `sheer + bulwark_h`; RAIL_TOP is
    `rail_top_z`, the rail actually standing there, castle wall heads
    included.
    """
    t = profiles.mast_t(p, mast)
    floor = p.rig.course_floor
    if floor is CourseFloor.WAIST_CAP:
        return profiles.sheer(p, t) + p.bulwark_h
    if floor is CourseFloor.RAIL_TOP:
        return profiles.rail_top_z(p, t)
    raise ValueError(f"unknown course_floor {floor!r} on the rig; "
                     f"expected a CourseFloor member")


def course_foul_z(p: FrigateParams, mast: str) -> float:
    """The height at or below which a COURSE's FOOT on `mast` fouls its rail.

    `checks.check_sails` judges each course by this and nothing else: the
    course's FOOT must stand more than 0.5 m above `course_rail_z`, the rail
    height at the course's own mast station under the ship's own
    `p.rig.course_floor`. It reads the same rule `sail_panel` floors the course
    on, so the check and the rule cannot diverge; on the frigate (WAIST_CAP)
    it is `sheer + bulwark_h + 0.5` exactly, as it always was.
    """
    return course_rail_z(p, mast) + 0.5


def sail_panel(p: FrigateParams, mast: str, tier: int) -> dict:
    """The flat sail before the wind gets to it.

    `head_half`/`foot_half` are half widths; `y` is the vertical plane the sail
    hangs in, taken from its own yard, so a raked mast carries its canvas aft
    with it. A topsail's foot is sheeted to the arms of the yard BELOW, which is
    why every sail but a course flares downward.
    """
    yards = profiles.yard_specs(p, mast)
    head_z, yard_len, _r = yards[tier]
    head_half = HEAD_FRAC * yard_len / 2.0
    foot_half = head_half if tier == 0 else HEAD_FRAC * yards[tier - 1][1] / 2.0
    depth = DEPTH_FRAC[tier] * 2.0 * head_half
    if tier == 0:
        floor = course_rail_z(p, mast) + COURSE_RAIL_CLEAR
    else:
        floor = yards[tier - 1][0] + FOOT_CLEAR
    return {
        "head_z": head_z,
        "foot_z": max(head_z - depth, floor),
        "head_half": head_half,
        "foot_half": foot_half,
        "y": profiles.mast_point(p, mast, head_z)[1] + sail_fwd(p, mast),
    }


def sail_point(p: FrigateParams, mast: str, tier: int, u: float, v: float):
    """A point on the bellied canvas. `u` is -1..1 across, `v` 0..1 foot to head.

    Task 13 lays its patches with this, so a patch lands ON the curved surface
    rather than on the flat panel the sail was cut from.
    """
    panel = sail_panel(p, mast, tier)
    head_z, foot_z = panel["head_z"], panel["foot_z"]
    z = foot_z + (head_z - foot_z) * v
    half = panel["foot_half"] + (panel["head_half"] - panel["foot_half"]) * v
    dx, dy, _dz = wind_direction(p, z)
    d = BELLY_FRAC * 2.0 * panel["head_half"] * WIND_STRENGTH * belly(u, v)
    return (u * half + d * dx, panel["y"] + d * dy, z)


def sail_normal(p: FrigateParams, mast: str, tier: int, v: float):
    """Which way the canvas faces at height fraction v: downwind, horizontal."""
    panel = sail_panel(p, mast, tier)
    z = panel["foot_z"] + (panel["head_z"] - panel["foot_z"]) * v
    return wind_direction(p, z)


def sail_grid(p: FrigateParams, mast: str, tier: int, nu: int, nv: int) -> list[list]:
    """The displaced grid, rows running FOOT to HEAD so `grid[-1]` is the yard."""
    return [
        [sail_point(p, mast, tier, -1.0 + 2.0 * i / (nu - 1), j / (nv - 1))
         for i in range(nu)]
        for j in range(nv)
    ]


# --- how close a top's fore edge comes to the canvas hanging ahead of it -----
#
# A topsail is set `SAIL_FWD` forward of its own mast and bellies further
# forward still, while the lower top it passes is a platform built round that
# same mast. Whether the two touch is arithmetic, so it is settled here rather
# than by a BVH tree in Blender: `check_intersections` then has nothing left to
# find. The sampling is deliberately fine — the aftmost canvas inside the band
# sits at the corner of it, where a coarse grid steps straight over the answer.

CLEARANCE_SAMPLES = 161


def topsail_aftmost_over_top(p: FrigateParams, mast: str) -> tuple:
    """The aftmost canvas point that stands over one lower top, (y, x, z).

    "Over the top" means inside the top's own athwartships span and inside the
    z band its plate and its rail occupy. Returns None if no canvas is in that
    band at all, which is the case a top clear of its topsail would give.
    """
    z, half_x, _aft = profiles.top_platform(p, mast)
    lo = z
    hi = z + profiles.TOP_THICK + profiles.TOP_RAIL_H
    n = CLEARANCE_SAMPLES
    best = None
    for i in range(n):
        u = -1.0 + 2.0 * i / (n - 1)
        for j in range(n):
            x, y, zz = sail_point(p, mast, 1, u, j / (n - 1))
            if lo - 1e-9 <= zz <= hi + 1e-9 and abs(x) <= half_x + 1e-9:
                if best is None or y < best[0]:
                    best = (y, x, zz)
    return best


def top_fore_edge_clearance(p: FrigateParams, mast: str) -> float:
    """Top-fore-edge to topsail-canvas-aftmost-point, over that top's own span.

    Positive is clear: the canvas stands that far forward of the fore edge.
    Negative is the defect this measures — the topsail's foot crossing the
    platform. A top with no canvas over it at all reads as `float("inf")`.
    """
    aftmost = topsail_aftmost_over_top(p, mast)
    if aftmost is None:
        return float("inf")
    z, _half_x, _aft = profiles.top_platform(p, mast)
    y_axis = profiles.mast_point(p, mast, z)[1]
    fore_edge = max(y for _x, y in profiles.top_outline(p, mast, 0))
    return aftmost[0] - (y_axis + fore_edge)


# --- Task 13: the Jolly Roger, flown in the same weather --------------------

FLAG_FLY = 2.60      # staff to fly, downwind
FLAG_HOIST = 1.55    # top to bottom at the staff
FLAG_WAVE = 0.30     # cross-wind amplitude at the fly
FLAG_WAVES = 1.35    # how many waves run down the fly
FLAG_DROOP = 0.22    # how far the fly falls below the staff head

PATCHES = 14
PATCH_SEED = 20261003    # fixed, so a rebuild puts every patch back where it was
PATCH_LIFT = 0.035       # how far a patch stands off the canvas under it
# A patch is a GRID, not a quad. Its corners always sat on the bellied canvas,
# but the flat quad between them cut straight through it: a patch is up to
# 3.0 m across on a main course, the canvas bellies up to 72 mm over that
# chord, and the patch only stands 35 mm proud. 4x4 nodes bring the worst
# chord sag to about 8 mm, comfortably inside the lift.
PATCH_NU = 4
PATCH_NV = 4


def flag_mast(p: FrigateParams) -> str:
    """The mast the colours fly from: the AFTMOST. On a three-master that is
    the mizzen, where they always flew (it was `FLAG_MAST = "mizzen"`); a
    sloop has no mizzen, and flies them from her one mast."""
    return profiles.mast_names(p)[-1]


def flag_staff(p: FrigateParams) -> tuple[float, float, float]:
    """Head of the staff the colours are hoisted on: the aftmost truck."""
    mast = flag_mast(p)
    return profiles.mast_point(p, mast, profiles.mast_truck_z(p, mast))


def flag_grid(p: FrigateParams, nu: int, nv: int) -> list[list]:
    """The Jolly Roger, streaming downwind on the SAME field as the canvas.

    Rows run from the head of the staff down. The wave is cross-wind and grows
    toward the fly, because a flag is held at the luff and free at the fly.

    It streams WITH the field, which on this ship means forward. The reference's
    colours stream aft because that ship is on a reach with its yards braced
    round; ours has square yards and canvas bellied forward, so a following wind
    is the only thing consistent with it, and a flag in a following wind flies
    forward. Spec section 7's one-wind rule decides this, not the painting.
    """
    sx, sy, sz = flag_staff(p)
    dx, dy, _dz = wind_direction(p, sz)
    nx, ny = -dy, dx          # horizontal, perpendicular to the wind
    grid = []
    for j in range(nv):
        t = j / (nv - 1)
        row = []
        for i in range(nu):
            u = i / (nu - 1)
            wave = FLAG_WAVE * u ** 1.3 * math.sin(2 * math.pi * FLAG_WAVES * u)
            row.append((
                sx + dx * FLAG_FLY * u + nx * wave,
                sy + dy * FLAG_FLY * u + ny * wave,
                sz - FLAG_HOIST * t - FLAG_DROOP * u,
            ))
        grid.append(row)
    return grid


def _sail_list(p: FrigateParams):
    """Deferred import: `sailplan` reads `wind`, so this cannot be a top-level
    import without a cycle. The dependency is one-way at module scope."""
    from . import sailplan
    return sailplan.all_sails(p)


def _sail_at(p: FrigateParams, mast: str, tier: int):
    """The sail one patch is sewn to, so its KIND can be dispatched on.

    LOOKED UP rather than carried in the patch dict, deliberately:
    `tests/test_frigate_frozen.py` hashes `wind.sail_patches(p)` whole, and a
    new key in that dict would move the frigate's digest for a ship that has
    not moved a millimetre.
    """
    for name, sail in _sail_list(p):
        if name == mast and sail.tier == tier:
            return sail
    raise ValueError(
        f"no sail on mast {mast!r} at tier {tier}; this ship sets "
        f"{[(m, s.tier) for m, s in _sail_list(p)]}"
    )


def _SQUARE_KIND():
    """`SailKind.SQUARE`, fetched late. `wind` is imported by `sailplan`, so
    it keeps its own imports to `profiles` at module scope."""
    from . import shiptype
    return shiptype.SailKind.SQUARE


def sail_patches(p: FrigateParams) -> list[dict]:
    """Mismatched canvas, as (mast, tier, centre, half extents) in sail space.

    Seeded, so the ship rebuilds identically — Phase 2 is ordered and
    destructive, not random, and an unseeded patch set would move every time
    anyone re-ran the build.
    """
    import random

    rng = random.Random(PATCH_SEED)
    # The sails the ship actually sets, in `sailplan.all_sails` order — for the
    # frigate that is fore/main/mizzen x three tiers, exactly the list this
    # used to build by hand, so the seeded draw lands on the same canvas.
    sails = [(m, sl.tier) for m, sl in _sail_list(p)]
    out = []
    for _ in range(PATCHES):
        mast, tier = rng.choice(sails)
        # The half extents are drawn FIRST and the centre is then drawn inside
        # what is left, so a patch can never hang off the foot or the leech of
        # the sail it is sewn to.
        du = rng.uniform(0.10, 0.22)
        dv = rng.uniform(0.07, 0.16)
        out.append({
            "mast": mast,
            "tier": tier,
            "u": rng.uniform(-0.96 + du, 0.96 - du),
            "v": rng.uniform(0.04 + dv, 0.92 - dv),
            "du": du,
            "dv": dv,
        })
    return out


def patch_grid(p: FrigateParams, patch: dict, nu: int | None = None,
               nv: int | None = None) -> list[list]:
    """One patch, sampled on the SAME displacement function as its own sail.

    Rows run across `v`, columns across `u`, both from the low corner. Every
    node is lifted `PATCH_LIFT` along the canvas's own normal at that node, so
    the patch is a parallel surface to the cloth rather than a plane laid over
    a curve.
    """
    # Resolved at CALL time, not bound as a default: a default argument freezes
    # the module constant at import, and `dressing` reads `wind.PATCH_NU`
    # separately for its face loop. The two silently disagreed under a
    # mutation test, which is exactly how a mutation test earns its keep.
    nu = PATCH_NU if nu is None else nu
    nv = PATCH_NV if nv is None else nv
    mast, tier = patch["mast"], patch["tier"]
    # WHICH KIND OF SAIL IT IS SEWN TO. `sail_patches` draws from
    # `sailplan.all_sails`, which is every sail of every kind, and this
    # sampled all of them with `sail_point` — the SQUARE path, which indexes
    # `profiles.yard_specs(p, mast)[tier]`. The galleon's mizzen sets a LATEEN
    # and has no square yard, so three of its fourteen patches raised
    # IndexError. The surface a patch is sewn to is the surface of the sail it
    # is sewn to.
    sail = _sail_at(p, mast, tier)
    square = sail.kind is _SQUARE_KIND()
    if not square:
        from . import sailplan
        corners = sailplan.corners(p, mast, sail)
    out = []
    for j in range(nv):
        v = patch["v"] + (-1.0 + 2.0 * j / (nv - 1)) * patch["dv"]
        row = []
        for i in range(nu):
            u = patch["u"] + (-1.0 + 2.0 * i / (nu - 1)) * patch["du"]
            if square:
                # THE SQUARE SAIL KEEPS ITS OWN ARITHMETIC, to the last bit.
                # These two formulae produced the canvas the frigate shipped
                # with; the general bilinear is only ALGEBRAICALLY equal to
                # them. The frigate's patches must not move, so they do not
                # go near it. A square sail's normal is horizontal, which is
                # why z takes no lift here.
                x, y, z = sail_point(p, mast, tier, u, v)
                nx, ny, _nz = sail_normal(p, mast, tier, v)
                row.append((x + nx * PATCH_LIFT, y + ny * PATCH_LIFT, z))
            else:
                from . import sailplan
                cloth = sailplan.surface_point(p, corners, sail.kind, u, v)
                n = sailplan.belly_direction(p, corners, cloth[2])
                row.append(tuple(a + b * PATCH_LIFT
                                 for a, b in zip(cloth, n)))
        out.append(row)
    return out
