"""The ship's head: head rails, head timbers, the knee, the beakhead bulkhead.

Pure — imports no bpy, so it is testable off-Blender under plain pytest, and
it is parameterised off `FrigateParams` and off `profiles` rather than off
numbers measured at this frigate's bow. That is deliberate: the galleon that
comes after this ship has a far more prominent head, and it should INHERIT
this module rather than fork it. Nothing here may be a constant that only
makes sense at 38 metres.

The idea the whole module turns on
----------------------------------
`profiles` already carries the trailboard's upper edge as a fair convex curve

    z(u) = z_fwd + (z_aft - z_fwd) * (1 - u) ** TRAILBOARD_EXP

sampled over u in [0, 1], from (y 18.10, z 4.30) where it leaves the bow to
(y 19.35, z 3.66) where it runs out into Minerva's drapery. It was shaped that
way so a head rail could be faired into it.

The lower head rail is **not a second curve fitted to that one**. It is the
SAME curve continued over u < 0, cut off where it meets the bulwark cap, and
given the same four-cornered section. So the rail and the trailboard share a
tangent exactly, not to within a tolerance, and `lower_rail_rings(...)[-1]`
is literally equal to `profiles.trailboard_rings(...)[0]`. There is no join to
measure because there is no join: one curve, sampled over two ranges.

A consequence worth stating, because it looks wrong before it looks right: the
curve is convex, so running AFT from the trailboard it gets steeper, not
gentler. The rail leaves the ship at about -2.4 and is only 0.55 m long
fore-and-aft. That is forced by the -1.16 departure slope the trailboard was
given, and by Minerva standing lower than the rail cap. A shallower head rail
would need a higher figurehead, and the figurehead is frozen.

What is here, and what each piece is
------------------------------------
- **lower head rail** — the curve above, from the bulwark cap to the trailboard.
- **upper head rail** — springs from the forward end of the ship's own open
  rail and dies into the figure's hip, converging on the lower rail all the way.
- **head timbers** — the short posts between the two rails.
- **knee of the head** — the cutwater: a centreline fin let into the stem,
  swelling forward once and returning to the stem at the forefoot, carrying
  the figure above it.
- **beakhead bulkhead** — the athwartships wall closing the forecastle, standing
  at the bowsprit heel, which is where a beakhead bulkhead stands on a real
  ship because the bowsprit is stepped against it.
- **beakhead deck** — on a head form that asks for one, a flight of
  level grated platforms forward of the stem between the upper head rails,
  stepping down with the rails towards the figure: over a level-topped
  knee the first passes over it and the rest are split either side of it;
  over a knee whose top falls with the rail (`knee_under_rail`) every one
  passes over it unsplit, and the flight stops short of the carving.
"""

import math

from . import carving, profiles
from .params import FrigateParams

Point = tuple[float, float, float]

# EVERY CONSTANT THIS MODULE USED TO CARRY IS NOW `p.head_form`.
#
# There were twenty of them — HEADRAIL_STATIONS, UPPER_*, TIMBER_*, KNEE_*,
# BEAKHEAD_* — and each one was measured at THIS frigate's bow even though the
# module's own docstring said none of them might be. They are
# `shiptype.HeadForm` now, stated against two named landmarks of whatever hull
# they are built on, and the galleon's values are `shiptype.GALLEON_HEAD`.
#
# What is left here is the only number that is not about the head at all:

# What the rails have to clear is not the bowsprit but the bowsprit's HOOPS,
# which `masts.build_bowsprit` sets 0.025 m proud of the spar. Measuring
# against the bare spar said the rail was 19 mm clear while it was in fact
# 6 mm inside a hoop. Stated here so the pure test can measure the same thing
# the mesh will.
BOWSPRIT_HOOP_PROUD = 0.025


# --- the one fair curve ----------------------------------------------------

def head_curve(p: FrigateParams, u: float) -> tuple[float, float]:
    """(y, z) on the single fair line from the bulwark out to the figure.

    u == 0 is `profiles.TRAILBOARD_AFT`, u == 1 is `profiles.TRAILBOARD_FWD`,
    and u < 0 is the head rail — the same analytic curve continued aft.
    """
    (y0, z0), (y1, z1) = profiles.trailboard_aft(p), profiles.trailboard_fwd(p)
    return (y0 + (y1 - y0) * u,
            z1 + (z0 - z1) * (1.0 - u) ** p.head_form.board_exp)


def head_curve_slope(p: FrigateParams, u: float) -> float:
    """dz/dy of that curve. Negative everywhere, rising to 0 at the figure."""
    (y0, z0), (y1, z1) = profiles.trailboard_aft(p), profiles.trailboard_fwd(p)
    e = p.head_form.board_exp
    return -(z0 - z1) * e * (1.0 - u) ** (e - 1.0) / (y1 - y0)


def board_half_width(p: FrigateParams, y: float, z: float) -> float:
    """Outer face of a head board at (y, z), as `trailboard_top_edge` has it.

    The bow's own half-width plus the trailboard's standoff, drawing in
    forward of the stem where the figure takes over. Re-derived here rather
    than imported because `profiles` cannot import this module; the equality
    is held by `test_the_head_board_width_rule_is_the_trailboards_own`.
    """
    h = p.head_form
    y_stem = profiles.station_y(p, 0.0)
    y_fwd = profiles.trailboard_fwd(p)[0]
    w = (profiles.bulwark_half_width(p, profiles.t_of_y(p, y), z) + h.board_proud)
    if y > y_stem:
        g = min(1.0, (y - y_stem) / (y_fwd - y_stem))
        w *= 1.0 - (1.0 - h.board_tuck) * g ** 1.4
    return w


def _cap_z(p: FrigateParams, y: float) -> float:
    return profiles.sheer(p, profiles.t_of_y(p, y)) + p.bulwark_h


def springing_u(p: FrigateParams) -> float:
    """The u at which the head curve comes up to meet the bulwark cap.

    Bisected rather than solved: the cap is `sheer` composed with `t_of_y`,
    which is piecewise and clamped, and a closed form for it would have to be
    re-derived for every hull this module is reused on. The curve rises much
    faster than the cap does, so the crossing is simple and unique.
    """
    def over(u: float) -> float:
        y, z = head_curve(p, u)
        return z - _cap_z(p, y)

    lo, hi = 0.0, -1.0
    if over(lo) >= 0.0:
        raise ValueError("the trailboard's aft end is already above the rail cap")
    if over(hi) <= 0.0:
        raise ValueError("the head curve never rises to the rail cap")
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if over(mid) > 0.0:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < 1e-15:
            break
    return 0.5 * (lo + hi)


# --- the lower rail --------------------------------------------------------

def lower_rail_points(p: FrigateParams, sign: float) -> list[Point]:
    """Upper outer edge of one lower head rail, springing end first.

    The last point is the trailboard's own aft end, to the last bit.
    """
    u0 = springing_u(p)
    n = p.head_form.headrail_stations
    out = []
    for i in range(n):
        u = u0 * (1.0 - i / (n - 1))
        y, z = head_curve(p, u)
        out.append((sign * board_half_width(p, y, z), y, z))
    return out


def _board_ring(x: float, y: float, z: float, sign: float,
                thick: float, depth: float) -> list[Point]:
    """Outer top, outer bottom, inner bottom, inner top — a moulded timber."""
    xi = x - sign * thick
    return [(x, y, z), (x, y, z - depth), (xi, y, z - depth), (xi, y, z)]


def lower_rail_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    """Sections of one lower head rail. Its last ring IS the trailboard's first.

    The section is the trailboard's own — `TRAILBOARD_THICK` by
    `TRAILBOARD_DEPTH[0]` — for exactly that reason. Giving the rail a section
    of its own would have put a step in the moulding at the join.
    """
    return [_board_ring(x, y, z, sign,
                        p.head_form.board_thick, p.head_form.board_depth[0])
            for x, y, z in lower_rail_points(p, sign)]


def head_line(p: FrigateParams, sign: float) -> list[Point]:
    """The whole fair line, bulwark cap to figure: rail then trailboard.

    The rail's last point and the trailboard's first are the same point, so it
    is dropped once here; what is left is one strictly convex run of stations.
    """
    return lower_rail_points(p, sign) + profiles.trailboard_top_edge(p, sign)[1:]


def lower_z_at(p: FrigateParams, y: float) -> float:
    """Height of the lower line at a given y, rail or trailboard alike."""
    (y0, _z0), (y1, _z1) = profiles.trailboard_aft(p), profiles.trailboard_fwd(p)
    u = min(1.0, (y - y0) / (y1 - y0))
    return head_curve(p, u)[1]


# --- the upper rail --------------------------------------------------------

def upper_rail_ends(p: FrigateParams) -> tuple[tuple[float, float],
                                               tuple[float, float]]:
    """((y, z) at the ship's rail, (y, z) at the figure) for the upper rail.

    Both endpoints are named landmarks of frozen geometry: the aft end is the
    forwardmost station the ship's own rail reaches, at that rail's own top;
    the forward end is a fixed fraction into the carving's own bounding box.

    `forecastle_rail_t` and not `rail_runs(p)[0][0]`, because a ship whose
    platforms are all CASTLES builds no open rail and that list is empty on
    it. The value is the same on both ships; what changed is that it is no
    longer read out of a list that is allowed to have nothing in it.
    """
    t0 = profiles.forecastle_rail_t(p)
    aft = (profiles.station_y(p, t0), profiles.rail_top_z(p, t0))
    lo, hi = carving.bounds(p)
    y_stem = profiles.station_y(p, 0.0)
    fwd = (y_stem + p.head_form.upper_land_fwd_frac * (hi[1] - y_stem),
           lo[2] + p.head_form.upper_land_z_frac * (hi[2] - lo[2]))
    return aft, fwd


def upper_z_at(p: FrigateParams, y: float) -> float:
    (y_a, z_a), (y_f, z_f) = upper_rail_ends(p)
    v = min(1.0, max(0.0, (y - y_a) / (y_f - y_a)))
    return z_f + (z_a - z_f) * (1.0 - v) ** p.head_form.upper_exp


def upper_rail_points(p: FrigateParams, sign: float) -> list[Point]:
    """Upper outer edge of one upper head rail, springing end first."""
    (y_a, _z_a), (y_f, _z_f) = upper_rail_ends(p)
    n = p.head_form.upper_stations
    out = []
    for i in range(n):
        v = i / (n - 1)
        y = y_a + (y_f - y_a) * v
        z = upper_z_at(p, y)
        out.append((sign * board_half_width(p, y, z), y, z))
    return out


def upper_rail_thick(p: FrigateParams, station: int) -> float:
    """Athwartships thickness at one upper-rail station. The heel is a scarph.

    The HEEL ring alone is broadened. The upper rail springs off the forward
    end of the ship's own open rail, whose timber reaches further outboard
    than the head rail's own outer face, so at the plain thickness its inner
    face MISSED the rail it springs from by 4 mm — a seam exactly where the
    eye follows the sweep from ship to head. Broadening the WHOLE rail closed
    that seam and opened a worse one, because two stations forward the rail
    then clipped the bowsprit's hoops. So the scarph is local to the heel,
    which is what a scarph is.
    """
    h = p.head_form
    return h.upper_heel_thick if station == 0 else h.upper_thick


def upper_rail_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    return [_board_ring(x, y, z, sign, upper_rail_thick(p, i),
                        p.head_form.upper_depth)
            for i, (x, y, z) in enumerate(upper_rail_points(p, sign))]


def rail_gaps(p: FrigateParams, sign: float) -> list[float]:
    """Upper-rail-underside to lower-rail-top, at each upper rail station."""
    return [upper_z_at(p, y) - p.head_form.upper_depth - lower_z_at(p, y)
            for _x, y, _z in upper_rail_points(p, sign)]


# --- head timbers ----------------------------------------------------------

def head_timber_boxes(p: FrigateParams, sign: float) -> list[tuple[Point, Point]]:
    """(lo, hi) corners of each head timber, aft to forward.

    They are let into both rails rather than butted against them, so the head
    reads as a framed structure instead of three loose mouldings.
    """
    h = p.head_form
    (y_a, _z_a), (y_f, _z_f) = upper_rail_ends(p)
    out = []
    for i in range(h.head_timbers):
        f = h.timber_first + (h.timber_last - h.timber_first) * i / (h.head_timbers - 1)
        y = y_a + (y_f - y_a) * f
        z_lo = lower_z_at(p, y) - h.timber_sink
        z_hi = upper_z_at(p, y) + h.timber_sink
        x_out = board_half_width(p, y, 0.5 * (z_lo + z_hi))
        xs = sorted((sign * x_out, sign * (x_out - h.timber_thick)))
        out.append(((xs[0], y - 0.5 * h.timber_fore_aft, z_lo),
                    (xs[1], y + 0.5 * h.timber_fore_aft, z_hi)))
    return out


# --- the knee of the head --------------------------------------------------

def _knee_edge(p: FrigateParams) -> list[tuple[float, float]]:
    """(y, z) of the cutwater's FORWARD edge, forefoot first, off
    `knee_outline`: each height's own forward reach."""
    h = p.head_form
    y_stem = profiles.station_y(p, 0.0)
    z_foot = profiles.keel_z(p, 0.0)
    z_head = profiles.sheer(p, 0.0)
    reach = h.knee_reach_frac * (z_head - z_foot)
    return [(y_stem + f_y * reach, z_foot + f_z * (z_head - z_foot))
            for f_z, f_y in h.knee_outline]


def knee_rings(p: FrigateParams) -> list[list[Point]]:
    """The cutwater, as one box-section fin.

    Each ring is a rectangle in plan at one height, forefoot ring first:
    aft edge let into the stem, forward edge on the knee's own profile.
    Bridged, that is a fin of constant thickness whose fore-and-aft reach
    swells once and falls away, its top level at the stem head.

    On a head form with `knee_under_rail` the top is not level: it falls
    with the upper head rail (`knee_top_line`), so the rings stand
    athwartships instead, aft first (`_knee_rings_under_rail`).
    """
    h = p.head_form
    if h.knee_under_rail:
        return _knee_rings_under_rail(p)
    y_aft = profiles.station_y(p, 0.0) - h.knee_into_stem
    return [[(-h.knee_half, y_aft, z), (h.knee_half, y_aft, z),
             (h.knee_half, y_fwd, z), (-h.knee_half, y_fwd, z)]
            for y_fwd, z in _knee_edge(p)]


def knee_rail_offset(p: FrigateParams) -> float:
    """RAIL INBOARD TOP to KNEE TOP where the knee falls with the rail.

    The beakhead flight's rail rise + one platform's depth + the named
    margin: `deck_clear` plus the flight's STEEPEST STEP (one platform's
    top to the next one's). A level platform stands `deck_rail_rise` under
    the BUILT rail at its forward end, so at its aft end the rail -- and a
    knee following it -- stand a full step higher; with the step in the
    offset, every platform clears the knee by `deck_clear` at least, and
    the steepest by exactly that at its aft end. So the flight passes over
    the knee unsplit.
    """
    h = p.head_form
    tops = [pl["top"] for pl in _flight_levels(p)]
    if len(tops) < 2:
        raise ValueError(
            "knee_rail_offset needs a flight of two platforms at least, to "
            f"have a step; {p.collection}'s rail gives {len(tops)}")
    step = max(a - b for a, b in zip(tops, tops[1:]))
    return h.deck_rail_rise + h.deck_thick + h.deck_clear + step


def knee_top_line(p: FrigateParams) -> list[tuple[float, float]]:
    """(y, z) of the knee's TOP edge on a `knee_under_rail` head, aft first.

    * from the knee's aft edge (let into the stem) LEVEL at the stem head,
      `profiles.sheer(p, 0.0)`, as the level-topped knee's is, until the
      BUILT upper rail's inboard top edge stands `knee_rail_offset` above
      it;
    * from there the rail's own chords let down by that offset, station by
      station, to the rail's forward end, where it dies into the figure;
    * from there level at that height forward to the cutwater's own
      forward edge (`knee_outline`), which is the tip.
    """
    h = p.head_form
    rail = _built_rail(p)
    off = knee_rail_offset(p)
    z_head = profiles.sheer(p, 0.0)
    y_aft = profiles.station_y(p, 0.0) - h.knee_into_stem
    line = [(y_aft, z_head)]
    falling = False
    for (ya, _xa, za), (yb, _xb, zb) in zip(rail, rail[1:]):
        if yb <= y_aft:
            continue
        if not falling:
            if zb - off >= z_head:
                continue
            # the chord on which the rail comes down to the offset over the
            # stem head: the knee leaves the stem head there
            f = (za - off - z_head) / (za - zb)
            if f < 0.0 or ya + (yb - ya) * f < y_aft:
                raise ValueError(
                    "the upper head rail is already within knee_rail_offset "
                    "of the stem head at the knee's aft edge")
            line.append((ya + (yb - ya) * f, z_head))
            falling = True
        line.append((yb, zb - off))
    if not falling:
        raise ValueError(
            "the upper head rail never comes down to the knee_rail_offset "
            "over the stem head; the knee has nothing to fall with")
    z_end = line[-1][1]
    edge = _knee_edge(p)
    for (ya, za), (yb, zb) in zip(edge, edge[1:]):
        if za <= z_end < zb:
            y_tip = ya + (yb - ya) * (z_end - za) / (zb - za)
            break
    else:
        raise ValueError("the knee's top falls below its own forefoot")
    if y_tip <= line[-1][0]:
        raise ValueError(
            "the cutwater's forward edge at the knee top's height lies abaft "
            "the upper rail's end; the knee would have no top forward of it")
    line.append((y_tip, z_end))
    return line


def _knee_rings_under_rail(p: FrigateParams) -> list[list[Point]]:
    """Athwartships rings of a knee whose top falls with the rail, aft first.

    Each is (port, stbd) at its UNDERSIDE then (stbd, port) at its TOP: the
    underside is the forefoot, level from the knee's aft edge to the stem,
    then the cutwater's forward edge; the top is `knee_top_line`. Rings
    stand at every vertex of either line. The last is not upright: it lies
    ALONG the cutwater's forward edge, from that edge's last vertex under
    the top up to the tip, and its cap is the knee's forward face there.
    """
    h = p.head_form
    k = h.knee_half
    top = knee_top_line(p)
    y_tip, z_end = top[-1]
    z_foot = profiles.keel_z(p, 0.0)
    under = [(top[0][0], z_foot)] + [pt for pt in _knee_edge(p)
                                     if pt[1] < z_end]
    y_c = under[-1][0]
    if any(y > y_c for y, _z in top[:-1]):
        raise ValueError(
            "the knee's top line turns level forward of the cutwater's last "
            "vertex under it; the forward ring would cross it")

    def at(line, y):
        for (ya, za), (yb, zb) in zip(line, line[1:]):
            if ya <= y <= yb:
                if yb == ya:
                    return za
                return za + (zb - za) * (y - ya) / (yb - ya)
        raise ValueError(f"y = {y} is off the knee")

    ys = sorted({y for y, _z in top[:-1]} | {y for y, _z in under[:-1]})
    rings = []
    for y in ys:
        z_lo, z_hi = at(under, y), at(top, y)
        rings.append([(-k, y, z_lo), (k, y, z_lo), (k, y, z_hi),
                      (-k, y, z_hi)])
    z_c = under[-1][1]
    rings.append([(-k, y_c, z_c), (k, y_c, z_c), (k, y_tip, z_end),
                  (-k, y_tip, z_end)])
    return rings


# --- the beakhead bulkhead -------------------------------------------------

def beakhead_t(p: FrigateParams) -> float:
    """The station the bulkhead stands at: the bowsprit heel's own.

    Not chosen by eye. A beakhead bulkhead is the wall the bowsprit is stepped
    against, so the spar's heel names the station, and on any hull this module
    is reused on it will still name it.
    """
    heel, _tip, _r0, _r1 = profiles.bowsprit_segment(p)
    return profiles.t_of_y(p, heel[1])


def beakhead_wall(p: FrigateParams) -> tuple[Point, Point]:
    """(lo, hi) corners of the bulkhead itself."""
    h = p.head_form
    t = beakhead_t(p)
    y = profiles.station_y(p, t)
    deck = profiles.deck_z_at(p, t, 0.0, p.fcastle_rise)
    # The wall's HEAD is the cap of whatever rail guards the forecastle here.
    # On the frigate the forecastle tucks under the main rail, so that is the
    # waist bulwark cap. On a galleon the forecastle is a CASTLE standing
    # clear above the waist rail with a bulwark of its own, and the same
    # expression read against the waist cap put the wall's top 0.45 m BELOW
    # its own floor — an inside-out box, not a tall tolerance.
    tier = p.tier("Deck_Forecastle")
    if tier.stands_above_the_main_rail():
        # The castle's OWN rail cap, as `profiles.castle_wall_zs` builds the
        # wall's head: sheer + rise + the castle's bulwark, at the DECK EDGE
        # where the camber is zero. Adding the centreline camber instead put
        # the bulkhead's head 0.22 m above the wall it closes.
        cap = profiles.castle_wall_zs(p, tier, t)[-1]
        # And its width is taken at its OWN MID HEIGHT, not at its head. A
        # castle wall tumbles in 0.17 m over its own 0.85 m, so a box sized
        # at the head stands 0.12 m clear of the wall's inboard face at the
        # foot — a bulkhead that crosses the wall without touching it, which
        # is neither let into it nor seated on it. Sized at mid height it is
        # let into the timber over the whole of its own height.
        z_ref = 0.5 * (deck - h.beakhead_sink + cap)
    else:
        cap = profiles.sheer(p, t) + p.bulwark_h
        z_ref = cap
    outer = profiles.bulwark_half_width(p, t, z_ref)
    half = outer - p.bulwark_thick + h.beakhead_into_side
    return ((-half, y - 0.5 * h.beakhead_thick, deck - h.beakhead_sink),
            (half, y + 0.5 * h.beakhead_thick, cap))


def beakhead_cap(p: FrigateParams) -> tuple[Point, Point]:
    """(lo, hi) corners of the cap timber across the bulkhead's head."""
    lo, hi = beakhead_wall(p)
    out = p.head_form.beakhead_cap_out
    t = p.head_form.beakhead_cap_t
    return ((lo[0] - out, lo[1] - out, hi[2] - 0.5 * t),
            (hi[0] + out, hi[1] + out, hi[2] + 0.5 * t))


# --- the beakhead deck -----------------------------------------------------
#
# The FIRST platform of the beakhead flight (see `beakhead_platforms`):
# forward of the stem, between the two upper head rails, over the knee.
# Only a head form with `beakhead_deck` set plans one; on any other every
# function below returns nothing, so a ship that does not ask for a deck
# emits exactly what she emitted before.

def _deck_z(p: FrigateParams) -> tuple[float, float]:
    """(underside, top) of the platform. It is LEVEL.

    The underside sits `deck_clear` above the KNEE OF THE HEAD's top face,
    which is the stem head, `profiles.sheer(p, 0.0)` -- the highest timber
    on the centreline forward of the stem below the rails. The knee is part
    of `Headrails`, and the deck must not touch Headrails, so it rides just
    clear of it rather than on it. The top is `deck_thick` above that.
    """
    h = p.head_form
    bottom = profiles.sheer(p, 0.0) + h.deck_clear
    return bottom, bottom + h.deck_thick


def _built_rail(p: FrigateParams) -> list[tuple[float, float, float]]:
    """(y, inboard x, top z) of the starboard upper head rail AS BUILT.

    `Headrails` bridges `upper_rail_rings` station to station with straight
    quads, so between two stations the rail's inboard face is the CHORD
    between their inboard corners, not the analytic curve those stations were
    sampled from. The chord sits a few millimetres inboard of the curve where
    the curve bows outboard, and a clearance measured to the curve was not
    the clearance in the mesh. Every deck figure is measured to this instead:
    the inboard-top corner (ring index 3) of each ring Headrails emits.
    """
    return [(ring[3][1], ring[3][0], ring[3][2])
            for ring in upper_rail_rings(p, 1.0)]


def _built_rail_at(p: FrigateParams, y: float,
                   rail=None) -> tuple[float, float]:
    """(inboard x, inboard top z) of the built upper rail at y, read off the
    straight segment between the two rail stations either side of it. Pass
    `rail` (from `_built_rail`) to avoid re-deriving it in a loop."""
    rail = rail if rail is not None else _built_rail(p)
    for (ya, xa, za), (yb, xb, zb) in zip(rail, rail[1:]):
        if ya <= y <= yb:
            f = (y - ya) / (yb - ya)
            return xa + (xb - xa) * f, za + (zb - za) * f
    raise ValueError(f"y = {y} is outside the upper head rail's own length")


def beakhead_deck_half_width(p: FrigateParams, y: float,
                             _rail=None, _y1=None) -> float:
    """Centreline to the deck's outboard edge at y. The edge is STRAIGHT.

    It is the WIDEST straight line that stands exactly `deck_clear` inboard
    of the BUILT upper rail's inboard face (`_built_rail_at`) at the deck's
    forward end and nowhere stands nearer that face than `deck_clear`. The
    built face is a polyline, so the line clears it everywhere if it clears
    it at the deck's two ends and at every rail station between them; the
    aft end's width is the largest those constraints allow. On the galleon
    the binding station is the rail station just forward of the stem, where
    the built face turns from drawing in steeply to running almost straight.

    A plank is a straight timber, and an edge that followed the rail would
    widen before it narrowed. Both endpoints of `deck_clear`: the deck's edge
    and the inboard face of the rail Headrails actually emits, at the same y,
    measured ATHWARTSHIPS. The shortest 3D distance between the two is
    smaller wherever the face is drawing in: at the forward corner it runs
    at ~10 degrees to the centreline, so 0.020 m athwartships is 0.0197 m
    square to the face, which is what Blender's nearest-point measures.
    """
    h = p.head_form
    rail = _rail if _rail is not None else _built_rail(p)
    y0 = profiles.station_y(p, 0.0) + h.deck_stem_clear
    y1 = _y1 if _y1 is not None else beakhead_deck_forward_y(p, rail)
    w1 = _built_rail_at(p, y1, rail)[0] - h.deck_clear
    w0 = _built_rail_at(p, y0, rail)[0] - h.deck_clear
    for ys, xs, _zs in rail:
        if y0 < ys < y1:
            t = (ys - y0) / (y1 - y0)
            w0 = min(w0, (xs - h.deck_clear - w1 * t) / (1.0 - t))
    return w0 + (w1 - w0) * (y - y0) / (y1 - y0)


def beakhead_deck_forward_y(p: FrigateParams, _rail=None) -> float:
    """Where the platform ends: the y at which the upper rail's inboard TOP
    edge has come down to `deck_rail_rise` above the deck top.

    The rails sweep down towards the figure much faster than any deck could;
    forward of this point a level platform would stand above the rails it is
    supposed to lie between. The rail edge is the BUILT one (`_built_rail_at`,
    straight between the stations Headrails emits), not the analytic curve.
    Bisected, because the station heights fall monotonically along the rail.
    """
    h = p.head_form
    rail = _rail if _rail is not None else _built_rail(p)
    _bottom, top = _deck_z(p)
    y_aft = profiles.station_y(p, 0.0) + h.deck_stem_clear
    y_f = rail[-1][0]

    def gap(y: float) -> float:
        return _built_rail_at(p, y, rail)[1] - top - h.deck_rail_rise

    if gap(y_aft) <= 0.0:
        raise ValueError(
            "the upper head rail is already within deck_rail_rise of the deck "
            "top at the stem; there is no room for a beakhead deck")
    if gap(y_f) >= 0.0:
        raise ValueError(
            "the upper head rail never comes down to the deck; the platform "
            "would have no forward end short of the figure")
    lo, hi = y_aft, y_f
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if gap(mid) > 0.0:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-13:
            break
    return 0.5 * (lo + hi)


def beakhead_deck_outline(
        p: FrigateParams) -> list[tuple[float, float, float, float]]:
    """(y, half width, top z, underside z) at each deck station, stem first.

    Empty unless the head form asks for a deck. WHAT EACH FIGURE SPANS:

    * y runs from `deck_stem_clear` forward of the stem at the rail
      (`profiles.station_y(p, 0.0)`) to `beakhead_deck_forward_y`, in
      `deck_stations` equal steps;
    * half width is centreline to the deck edge: straight, and never nearer
      than `deck_clear` to the BUILT upper rail's inboard face at the same y,
      exactly that at the forward end (`beakhead_deck_half_width`);
    * the platform top sits level, `deck_rail_rise` below the BUILT upper
      rail's inboard top edge at the FORWARD END and further below it
      everywhere aft (the rail sweeps up towards the ship); its underside
      sits `deck_clear`
      above the knee of the head's top face.
    """
    h = p.head_form
    if not h.beakhead_deck:
        return []
    bottom, top = _deck_z(p)
    rail = _built_rail(p)
    y0 = profiles.station_y(p, 0.0) + h.deck_stem_clear
    y1 = beakhead_deck_forward_y(p, rail)
    n = h.deck_stations
    out = []
    for i in range(n):
        y = y0 + (y1 - y0) * i / (n - 1)
        out.append((y, beakhead_deck_half_width(p, y, rail, y1), top, bottom))
    return out


# --- the flight: level platforms stepping down past the knee -------------
#
# THE MAINTAINER'S RULINGS: the deck goes the length of the head as a flight
# STEPPING DOWN PAST THE KNEE (2026-10-05); and the knee's top falls with
# the rails so the flight passes over it UNSPLIT, ending at the last rail
# station clear of the carving: three platforms, two shorter than Task 7's
# split flight of five (third ruling, 2026-10-06, E and F). The platform
# above is the first of the flight. Over a LEVEL-topped knee (the stem
# head, z = sheer at the stem, out to the figure) it is the only one that
# can pass over it, since the upper rails fall below that top within half
# a metre of the stem, so
# every platform forward of it is SPLIT, a half either side of the knee.
# Over a knee that falls with the rail (`knee_under_rail`,
# `knee_rail_offset`) none is split. Each stands lower than the one abaft
# it because the rails it lies between have fallen.
#
# The flight is DERIVED, not chosen:
#
# * its steps stand at the BUILT upper rail's own stations -- the corners
#   Headrails bridges -- forward of the first platform's end, so each step's
#   drop is the rail's own fall over one of its own bays;
# * split, it ends at the FIGURE: `deck_clear` abaft the lion's rump, the aft
#   end of the carving's body (`_figure_rump_y`), where the rails die into
#   it; unsplit, at the last rail station whose platform slab the carving's
#   SURFACE (tail and all) comes nowhere within `deck_clear` of;
# * each platform's top stands `deck_rail_rise` under the built rail's
#   inboard top edge at its OWN forward end, exactly as the first does;
# * a split half's inboard edge stands `deck_clear` off the knee's side
#   face, or off any part of the carving inside the platform's own height
#   band if that reaches further outboard (the lion's tail does, once);
# * its outboard edge is the widest straight line `deck_clear` inboard of
#   the built rail's inboard face and of every head timber's inboard face
#   in its height band (`_widest_edge`).
#
# The floor of each is an alpha-masked GRATING CARD (the `Beakhead_Grating`
# object, its own material family) and its frame is timber: two side
# ledges, a head ledge at each end, and at every step the lower platform's
# aft ledge carried up as the step's RISER (`Beakhead_Deck`).


def _figure_rump_y(p: FrigateParams) -> float:
    """The aft end of the carving's BODY, the first of its ring groups. The
    trailboards are not counted: they are the head's, not the figure's."""
    return min(pt[1] for ring in carving.ring_groups(p)[0] for pt in ring)


def beakhead_deck_limit_y(p: FrigateParams) -> float:
    """The flight's forward end: `deck_clear` abaft the figure's rump."""
    return _figure_rump_y(p) - p.head_form.deck_clear


def _widest_edge(p: FrigateParams, y0: float, y1: float, top: float,
                 bottom: float, rail) -> tuple[float, float]:
    """(half width at y0, at y1) of the widest straight outboard edge that
    stands `deck_clear` inboard of the BUILT rail's inboard face at both
    ends and at every rail station between, and `deck_clear` inboard of
    every head timber's inboard face that reaches into [bottom, top] over
    the same y. Exactly that clearance at y1, from whichever binds there."""
    h = p.head_form
    c = h.deck_clear
    limits = [(y0, _built_rail_at(p, y0, rail)[0] - c),
              (y1, _built_rail_at(p, y1, rail)[0] - c)]
    limits += [(ys, xs - c) for ys, xs, _zs in rail if y0 < ys < y1]
    for lo, hi in head_timber_boxes(p, 1.0):
        if hi[1] < y0 or lo[1] > y1 or hi[2] < bottom or lo[2] > top:
            continue
        for y in (max(lo[1], y0), min(hi[1], y1)):
            limits.append((y, lo[0] - c))
    w1 = min(x for y, x in limits if y >= y1 - 1e-12)
    w0 = float("inf")
    for y, x in limits:
        t = (y - y0) / (y1 - y0)
        if t < 1.0 - 1e-12:
            w0 = min(w0, (x - w1 * t) / (1.0 - t))
    return w0, w1


def _carving_quads(p: FrigateParams):
    """Every quad Figurehead bridges between two neighbouring rings of one
    of the carving's ring groups, as its four corners."""
    for group in carving.ring_groups(p):
        for a, b in zip(group, group[1:]):
            n = len(a)
            for i in range(n):
                yield (a[i], a[(i + 1) % n], b[i], b[(i + 1) % n])


def _quad_meets_slab(quad, y0: float, y1: float, bottom: float,
                     top: float, c: float) -> bool:
    """Whether a carving quad's BOX comes within `c` of a slab from y0 to
    y1, underside to top, at any x. The box holds every point of the quad,
    so a slab it misses is clear of the quad's surface itself."""
    ys = [q[1] for q in quad]
    zs = [q[2] for q in quad]
    return not (max(ys) < y0 - c or min(ys) > y1 + c
                or max(zs) < bottom - c or min(zs) > top + c)


def _inboard_edge(p: FrigateParams, y0: float, y1: float, top: float,
                  bottom: float) -> float:
    """Centreline to a SPLIT half's inboard edge: `deck_clear` off the
    knee's side face, or off the carving wherever its SURFACE comes within
    `deck_clear` of the platform's span and height band.

    The surface, not the rings' vertices: Figurehead bridges each pair of
    neighbouring rings with quads, and a quad reaches between its rings.
    Its x is bilinear in its corners, so no point of it stands further
    outboard than its outermost corner; any quad whose box meets the
    window counts with that corner. Read off the vertices alone, the
    lion's tail stood 0.013 m off a half that claimed 0.020.
    """
    h = p.head_form
    c = h.deck_clear
    reach = [h.knee_half]
    for quad in _carving_quads(p):
        if _quad_meets_slab(quad, y0, y1, bottom, top, c):
            reach.append(max(abs(q[0]) for q in quad))
    return max(reach) + c


def _carving_meets_slab(p: FrigateParams, y0: float, y1: float,
                        bottom: float, top: float) -> bool:
    """Whether any of the carving's SURFACE comes within `deck_clear` of a
    platform slab from y0 to y1, underside to top, at any x. Approximated
    FROM ABOVE: read off its loft quads' boxes, which hold every point of
    each quad, so a slab called clear is clear of the surface itself, and
    one called met may only be near a box."""
    c = p.head_form.deck_clear
    return any(_quad_meets_slab(quad, y0, y1, bottom, top, c)
               for quad in _carving_quads(p))


def _flight_levels(p: FrigateParams) -> list[dict]:
    """{y_aft, y_fwd, top, bottom} of every platform of the flight, stem
    first: what the rail alone sets. `beakhead_platforms` adds the edges.

    Where the flight ENDS depends on the knee. Over a level-topped knee it
    runs split either side of it to `beakhead_deck_limit_y`, the lion's
    rump. Over a knee that falls with the rail (`knee_under_rail`) every
    platform is unsplit, so nothing may stand in its slab at all: the
    flight ends at the last rail station whose platform slab the carving's
    SURFACE (tail and all) comes nowhere within `deck_clear` of."""
    h = p.head_form
    rail = _built_rail(p)
    bottom, top = _deck_z(p)
    y0 = profiles.station_y(p, 0.0) + h.deck_stem_clear
    y1 = beakhead_deck_forward_y(p, rail)
    out = [dict(y_aft=y0, y_fwd=y1, top=top, bottom=bottom)]

    def level(aft, fwd):
        top = _built_rail_at(p, fwd, rail)[1] - h.deck_rail_rise
        return dict(y_aft=aft, y_fwd=fwd, top=top, bottom=top - h.deck_thick)

    if h.knee_under_rail:
        for ys, _xs, _zs in rail:
            if ys <= y1:
                continue
            lv = level(out[-1]["y_fwd"], ys)
            if _carving_meets_slab(p, lv["y_aft"], lv["y_fwd"],
                                   lv["bottom"], lv["top"]):
                break
            out.append(lv)
        return out
    limit = beakhead_deck_limit_y(p)
    ends = [ys for ys, _xs, _zs in rail if y1 < ys < limit] + [limit]
    for fwd in ends:
        out.append(level(out[-1]["y_fwd"], fwd))
    return out


def beakhead_platforms(p: FrigateParams) -> list[dict]:
    """The flight, stem first. Empty unless the head form asks for a deck.

    Each is {y_aft, y_fwd, top, bottom, x_in, w_aft, w_fwd}: y from its aft
    edge to its forward edge; top and underside z; x_in is centreline to a
    split half's INBOARD edge (None on a platform that spans the
    centreline over the knee: the first always, and every one over a knee
    that falls with the rail); w_aft and w_fwd are centreline to its
    OUTBOARD edge at its two ends. A split one is built once a side.
    """
    h = p.head_form
    if not h.beakhead_deck:
        return []
    rail = _built_rail(p)
    levels = _flight_levels(p)
    first = levels[0]
    y0, y1 = first["y_aft"], first["y_fwd"]
    out = [dict(first, x_in=None,
                w_aft=beakhead_deck_half_width(p, y0, rail, y1),
                w_fwd=beakhead_deck_half_width(p, y1, rail, y1))]
    for lv in levels[1:]:
        aft, fwd, top, bottom = (lv["y_aft"], lv["y_fwd"], lv["top"],
                                 lv["bottom"])
        wa, wf = _widest_edge(p, aft, fwd, top, bottom, rail)
        x_in = (None if h.knee_under_rail
                else _inboard_edge(p, aft, fwd, top, bottom))
        out.append(dict(lv, x_in=x_in, w_aft=wa, w_fwd=wf))
    return out


def _pieces(p: FrigateParams) -> list[tuple[dict, float, float]]:
    """(platform, inner x, sign) for every piece built: the first platform
    once, from -w to +w; each split one a side, from x_in out to w."""
    out = []
    for pl in beakhead_platforms(p):
        if pl["x_in"] is None:
            out.append((pl, None, 1.0))
        else:
            out += [(pl, pl["x_in"], 1.0), (pl, pl["x_in"], -1.0)]
    return out


def _w(pl: dict, y: float) -> float:
    f = (y - pl["y_aft"]) / (pl["y_fwd"] - pl["y_aft"])
    return pl["w_aft"] + (pl["w_fwd"] - pl["w_aft"]) * f


def _slab(x_a, x_b, y_a, y_b, z_lo, z_hi, sign):
    """Two four-point rings, aft then fwd, of a timber whose athwartships
    span is (x_a(y), x_b(y)) -- callables, so a ledge can taper with the
    edge it runs along. Mirrored by `sign`."""
    rings = []
    for y in (y_a, y_b):
        xa, xb = sign * x_a(y), sign * x_b(y)
        rings.append([(xa, y, z_hi), (xa, y, z_lo), (xb, y, z_lo),
                      (xb, y, z_hi)])
    return rings


def beakhead_deck_timbers(p: FrigateParams) -> list[list[list[Point]]]:
    """Every frame timber of the flight as two section rings, aft first.

    A piece's frame is its two SIDE LEDGES (along its outboard and inboard
    edges, `deck_ledge` wide, tapering with them) and a HEAD LEDGE across
    each end; on every platform but the first, the aft head ledge is
    carried up to the top of the platform abaft it and is the step's
    RISER. All `deck_thick` deep under the platform's top.
    """
    h = p.head_form
    led = h.deck_ledge
    plats = beakhead_platforms(p)
    out = []
    for pl, x_in, sign in _pieces(p):
        k = plats.index(pl)
        ya, yf = pl["y_aft"], pl["y_fwd"]
        lo, hi = pl["bottom"], pl["top"]
        rise = plats[k - 1]["top"] if k else hi

        def outer(y, pl=pl):
            return _w(pl, y)

        def outer_in(y, pl=pl):
            return _w(pl, y) - led

        if x_in is None:
            def inner(y, pl=pl):
                return -_w(pl, y)

            def inner_in(y, pl=pl):
                return -_w(pl, y) + led
        else:
            def inner(y, x=x_in):
                return x

            def inner_in(y, x=x_in):
                return x + led
        out.append(_slab(outer_in, outer, ya, yf, lo, hi, sign))
        out.append(_slab(inner, inner_in, ya, yf, lo, hi, sign))
        # the head ledges sit between the side ledges, so the frame's
        # timbers meet rather than cross
        out.append(_slab(inner_in, outer_in, ya, ya + led, lo, rise, sign))
        out.append(_slab(inner_in, outer_in, yf - led, yf, lo, hi, sign))
    return out


def beakhead_grating_cards(p: FrigateParams) -> list[list[Point]]:
    """Every grating card: one flat quad per piece at the platform's top,
    filling its frame's opening `deck_grating_gap` short of each ledge's
    inner face, so it lies IN the frame without touching it."""
    h = p.head_form
    led, gap = h.deck_ledge, h.deck_grating_gap
    out = []
    for pl, x_in, sign in _pieces(p):
        ya = pl["y_aft"] + led + gap
        yf = pl["y_fwd"] - led - gap
        z = pl["top"]
        quad = []
        for y in (ya, yf):
            xo = _w(pl, y) - led - gap
            xi = (-xo if x_in is None else x_in + led + gap)
            quad.append(((sign * xi, y, z), (sign * xo, y, z)))
        (a, b), (c, d) = quad
        # mirrored to port the corners run the other way round: reverse
        # them so every card's normal faces up, as the starboard ones do
        out.append([a, b, d, c] if sign > 0 else [c, d, b, a])
    return out


def _open_length(x0: float, x1: float, pitch: float, bar: float) -> float:
    """Metres of [x0, x1] that fall in a hole of the lattice along x: the
    span from one bar's FAR edge to the next bar's NEAR edge, every pitch."""
    def run(x):
        return (math.floor(x / pitch) * (pitch - bar)
                + max(0.0, (x % pitch) - bar))
    return run(x1) - run(x0)


def beakhead_grating_open_fractions(p: FrigateParams) -> list[tuple]:
    """(area m^2, perimeter m, open fraction) for every grating card: the
    share of its area `palette.grating_alpha` cuts, integrated row by row
    across the card in its own metres (object x and y, as the material
    reads them), each row's open length exact. Empty with no cards."""
    from . import palette

    pitch, bar = palette.GRATING_PITCH, palette.GRATING_BAR
    rows = 4000
    out = []
    for quad in beakhead_grating_cards(p):
        xy = [(pt[0], pt[1]) for pt in quad]
        edges = list(zip(xy, xy[1:] + xy[:1]))
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in edges)) / 2
        perimeter = sum(math.dist(a, b) for a, b in edges)
        y0 = min(y for _x, y in xy)
        y1 = max(y for _x, y in xy)
        dy = (y1 - y0) / rows
        open_area = 0.0
        for r in range(rows):
            y = y0 + (r + 0.5) * dy
            if (y % pitch) < bar:
                continue
            xs = [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
                  for a, b in edges
                  if min(a[1], b[1]) <= y <= max(a[1], b[1])
                  and a[1] != b[1]]
            open_area += _open_length(min(xs), max(xs), pitch, bar) * dy
        out.append((area, perimeter, open_area / area))
    return out


# --- what it costs ---------------------------------------------------------

def _loft_tris(rings: int, sides: int) -> int:
    """Triangles in a capped tube of `rings` rings of `sides` points each."""
    return 2 * (rings - 1) * sides + 2 * (sides - 2)


def headrail_triangles(p: FrigateParams) -> int:
    """What `Headrails` costs: both rails a side, the timbers, and the knee."""
    h = p.head_form
    return (2 * _loft_tris(h.headrail_stations, 4)
            + 2 * _loft_tris(h.upper_stations, 4)
            + 2 * h.head_timbers * 12
            + _loft_tris(len(knee_rings(p)), 4))


def beakhead_triangles(p: FrigateParams) -> int:
    """What `Beakhead` costs: the wall and its cap, two boxes."""
    return 2 * 12


def beakhead_deck_triangles(p: FrigateParams) -> int:
    """What `Beakhead_Deck` costs: every frame timber a capped two-ring
    loft of four points, 12 triangles. Zero on a head form with no deck."""
    return len(beakhead_deck_timbers(p)) * _loft_tris(2, 4)


def beakhead_grating_triangles(p: FrigateParams) -> int:
    """What `Beakhead_Grating` costs: one quad, 2 triangles, per card."""
    return 2 * len(beakhead_grating_cards(p))


def head_triangles(p: FrigateParams) -> int:
    return (headrail_triangles(p) + beakhead_triangles(p)
            + beakhead_deck_triangles(p) + beakhead_grating_triangles(p))
