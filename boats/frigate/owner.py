"""The owner's colours: a masthead pennant and a hull stripe. The plan is pure.

The maintainer's ruling (issue #134, rewritten): the owner's colour goes on a
pennant, the flag and a hull stripe, and the sails stay plain canvas. The
game tints a part by multiplying its material's base colour, after it has
merged the file by material, so each of these two is its OWN mesh wearing its
OWN plain white material (`palette.tinted_material_names`): white times the
owner's colour is the owner's colour, and nothing else on the ship shares the
material to be tinted with it.

  * PENNANT: a long, narrow streamer at the truck of her tallest mast that
    does not fly the flag, streaming downwind on the same field as the flag
    and the canvas. On a one-masted ship the truck flies both, the pennant
    above and the flag's head dropped under it (`wind.flag_staff`).
  * HULL STRIPE: a band laid along her wale, both sides, standing
    `STRIPE_PROUD` off the RENDERED hull (the bpy half samples the evaluated
    skin). Where a shot scar lies under it, the quad over the scar is left
    out: paint does not bridge a shot hole.

`build_owner_colours` is the bpy half, run from the dressing pass.
"""

import math

from . import profiles, wind
from .params import FrigateParams

PENNANT = "Pennant"
STRIPE = "Hull_Stripe"
TINTED_PARTS = (PENNANT, STRIPE)

# --- the pennant -------------------------------------------------------------

PENNANT_NU = 13            # columns, staff to fly
PENNANT_NV = 2             # rows: the head and the foot
PENNANT_FLY_FRAC = 0.22    # staff to fly, of her length: 8.4 m on the frigate
PENNANT_HOIST_FRAC = 0.012  # head to foot at the staff, of her length
PENNANT_TIP = 0.25         # hoist at the fly, over hoist at the staff
PENNANT_DROOP_FRAC = 0.05  # how far the fly falls under the staff head, of the fly
PENNANT_WAVE_FRAC = 0.03   # cross-wind amplitude at the fly, of the fly
PENNANT_WAVES = 1.5        # waves down the fly: a whole number and a half
#                            puts the tip back on the wind axis
PENNANT_GAP = 0.10         # PENNANT FOOT to FLAG HEAD, on a one-masted ship


def pennant_hoist(p: FrigateParams) -> float:
    return PENNANT_HOIST_FRAC * p.loa


def pennant_mast(p: FrigateParams) -> str:
    """The TALLEST truck that does not fly the flag; on a one-masted ship,
    her one mast."""
    flag = wind.flag_mast(p)
    names = [m for m in profiles.mast_names(p) if m != flag] or [flag]
    return max(names, key=lambda m: profiles.mast_truck_z(p, m))


def pennant_staff(p: FrigateParams) -> tuple[float, float, float]:
    """The pennant's head at the staff: the truck of `pennant_mast`."""
    mast = pennant_mast(p)
    return profiles.mast_point(p, mast, profiles.mast_truck_z(p, mast))


def flag_drop(p: FrigateParams) -> float:
    """How far the flag's head stands under its truck: nothing, unless the
    pennant flies from the same truck, when it is the pennant's hoist and
    `PENNANT_GAP`."""
    if pennant_mast(p) != wind.flag_mast(p):
        return 0.0
    return pennant_hoist(p) + PENNANT_GAP


def pennant_grid(p: FrigateParams) -> list[list]:
    """Rows from the head down, columns from the staff to the fly."""
    sx, sy, sz = pennant_staff(p)
    dx, dy, _dz = wind.wind_direction(p, sz)
    nx, ny = -dy, dx
    fly = PENNANT_FLY_FRAC * p.loa
    hoist = pennant_hoist(p)
    droop = PENNANT_DROOP_FRAC * fly
    amp = PENNANT_WAVE_FRAC * fly
    grid = []
    for j in range(PENNANT_NV):
        f = j / (PENNANT_NV - 1)
        row = []
        for i in range(PENNANT_NU):
            u = i / (PENNANT_NU - 1)
            wave = amp * u ** 1.3 * math.sin(2 * math.pi * PENNANT_WAVES * u)
            head = sz - droop * u
            depth = hoist * (1.0 - (1.0 - PENNANT_TIP) * u)
            row.append((sx + dx * fly * u + nx * wave,
                        sy + dy * fly * u + ny * wave,
                        head - depth * f))
        grid.append(row)
    return grid


# --- the hull stripe -----------------------------------------------------------

STRIPE_PITCH = 0.75     # column to column along the side, at most, metres
STRIPE_ROWS = 3         # head, middle and foot of the band
STRIPE_PROUD = 0.03     # off the rendered skin, along its normal


def stripe_band(p: FrigateParams) -> tuple[float, float]:
    """(lo, hi), SHEER-RELATIVE: her `stripe_form.band`, or the wale it
    names taken in by its inset."""
    from . import palette

    form = p.stripe_form
    if form.band is not None:
        return tuple(form.band)
    for name, lo, hi in palette.wale_bands(p):
        if name == form.wale:
            return (lo + form.inset, hi - form.inset)
    raise ValueError(
        f"{p.collection} has no wale called {form.wale!r} to lay her stripe "
        f"on; her wales are {[w[0] for w in palette.wale_bands(p)]}")


def stripe_rows(p: FrigateParams) -> list[float]:
    """SHEER-RELATIVE heights of the stripe's rows, foot to head."""
    lo, hi = stripe_band(p)
    return [lo + (hi - lo) * k / (STRIPE_ROWS - 1) for k in range(STRIPE_ROWS)]


def stripe_ts(p: FrigateParams) -> list[float]:
    """The stripe's column stations, fore to aft: one on every hull station
    inside its span, where the rendered skin bends hardest, and the gaps
    between split evenly no further apart than `STRIPE_PITCH`."""
    t0, t1 = p.stripe_form.span
    knots = [t0] + [t for t in profiles.station_ts(p) if t0 < t < t1] + [t1]
    out = [t0]
    for a, b in zip(knots, knots[1:]):
        length = profiles.station_y(p, a) - profiles.station_y(p, b)
        n = max(1, math.ceil(length / STRIPE_PITCH - 1e-9))
        out += [a + (b - a) * i / n for i in range(1, n + 1)]
    return out


def _rect_gap(y: float, z: float, y0: float, y1: float, z0: float,
              z1: float) -> float:
    dy = max(y0 - y, 0.0, y - y1)
    dz = max(z0 - z, 0.0, z - z1)
    return math.hypot(dy, dz)


def stripe_holes(p: FrigateParams) -> set[tuple[float, int, int]]:
    """{(side, column, row)} of every stripe quad a shot scar lies under:
    SCAR CENTRE to the quad's nearest point under the scar's radius, on the
    scar's own side. Empty on a ship that runs no damage pass."""
    if not p.builds("damage"):
        return set()
    from . import damage

    ts, rows = stripe_ts(p), stripe_rows(p)
    out = set()
    for s in damage.shot_scars(p):
        y = profiles.station_y(p, s["t"])
        for i in range(len(ts) - 1):
            y_fwd = profiles.station_y(p, ts[i])
            y_aft = profiles.station_y(p, ts[i + 1])
            sheer = profiles.sheer(p, (ts[i] + ts[i + 1]) / 2.0)
            for j in range(len(rows) - 1):
                gap = _rect_gap(y, s["z"], y_aft, y_fwd,
                                sheer + rows[j], sheer + rows[j + 1])
                if gap < s["radius"]:
                    out.add((s["sign"], i, j))
    return out


def stripe_targets(p: FrigateParams, sign: float) -> list[list[tuple]]:
    """[column][row] (x, y, z) on the CAGE hull, which the bpy half moves
    onto the rendered skin before standing the stripe off it."""
    out = []
    for t in stripe_ts(p):
        y = profiles.station_y(p, t)
        sheer = profiles.sheer(p, t)
        col = []
        for h in stripe_rows(p):
            z = sheer + h
            col.append((sign * profiles.hull_half_width(p, t, z), y, z))
        out.append(col)
    return out


# --- the bpy half --------------------------------------------------------------


def _pennant(bm, p: FrigateParams) -> None:
    rows = [[bm.verts.new(pt) for pt in row] for row in pennant_grid(p)]
    for a, b in zip(rows, rows[1:]):
        for i in range(PENNANT_NU - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))


def _stripe(bm, p: FrigateParams) -> None:
    """Each target moved onto the RENDERED hull and stood `STRIPE_PROUD`
    off it along the skin's own outward normal, the way a scar is sunk
    into it (`damage.scar_craters`)."""
    from mathutils import Vector

    from . import damage

    tree = damage._hull_bvh()
    holes = stripe_holes(p)
    for sign in (-1.0, 1.0):
        grid = []
        for col in stripe_targets(p, sign):
            verts = []
            for pt in col:
                # Cast IN from outboard at the target's own (y, z), as a
                # scar is placed (`damage.scar_anchors`): the nearest point
                # to a cage target can slide along the skin where it curves.
                origin = Vector((sign * 50.0, pt[1], pt[2]))
                loc, nrm, _i, _d = tree.ray_cast(origin,
                                                 Vector((-sign, 0.0, 0.0)))
                if loc is None:
                    raise ValueError(f"no hull surface under {pt}")
                if nrm.x * sign < 0.0:
                    nrm = -nrm
                verts.append(bm.verts.new(tuple(loc + nrm * STRIPE_PROUD)))
            grid.append(verts)
        for i in range(len(grid) - 1):
            for j in range(STRIPE_ROWS - 1):
                if (sign, i, j) in holes:
                    continue
                quad = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1],
                        grid[i][j + 1])
                # outward-facing on both sides
                bm.faces.new(quad if sign < 0 else tuple(reversed(quad)))
    loose = [v for v in bm.verts if not v.link_faces]
    for v in loose:
        bm.verts.remove(v)


def build_owner_colours(p: FrigateParams) -> list:
    """The pennant, with the canvas, and the stripe, on the hull."""
    import bmesh

    from . import prims

    # The stripe keeps its own winding (outward on both sides): an open
    # strip has no outward for `recalc_face_normals` to find.
    parts = []
    if p.builds("sails"):
        parts.append((PENNANT, _pennant, True, True))
    parts.append((STRIPE, _stripe, True, False))
    built = []
    for name, fn, smooth, recalc in parts:
        bm = bmesh.new()
        fn(bm, p)
        built.append(prims.finish(bm, name, smooth=smooth, recalc=recalc))
    return built
