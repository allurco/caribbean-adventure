"""Where a sail's four corners are, and what surface hangs between them.

`wind.sail_panel` knew one shape of sail: a trapezoid symmetric about its own
mast, hanging in an athwartships plane under a yard. That is a SQUARE sail,
and three of the four ships planned carry nothing else — which is exactly why
it had to be generalised before the schooner, not during it. An abstraction
grown against the galleon and the man-o-war would have kept the yard, kept the
symmetry, kept the athwartships plane, and then the fourth ship would have
paid for all three.

So a sail here is FOUR NAMED CORNERS and a belly function:

        throat ------------------- peak        (the head: yard, gaff, or a point)
          |                          |
        tack   ------------------- clew        (the foot: boom, deck, or a point)

    u runs -1 at the luff to +1 at the leech
    v runs  0 at the foot to  1 at the head

and a three-sided sail is that quad with one pair of corners coincident,
`shiptype.degenerate_corner` saying which. One bilinear patch then draws a
square course, a gaff mainsail, a jib and a lateen.

THE SQUARE SAIL KEEPS ITS OWN ARITHMETIC. `wind.sail_point` is not re-derived
through the general bilinear, because the two are only algebraically equal and
not equal to the last bit, and the frigate that shipped is the regression test
for all of this. The general quad is what every OTHER kind is built from, and
`test_sailplan.py` proves the two agree on the square sail to 1e-12.

Pure arithmetic — imports no bpy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import profiles, shiptype as st, wind
from .params import ShipParams

Point = tuple[float, float, float]


def _lerp(a: Point, b: Point, f: float) -> Point:
    return (a[0] + (b[0] - a[0]) * f,
            a[1] + (b[1] - a[1]) * f,
            a[2] + (b[2] - a[2]) * f)


def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a: Point, b: Point) -> Point:
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _dot(a: Point, b: Point) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _norm(a: Point) -> float:
    return math.sqrt(_dot(a, a))


def _unit(a: Point) -> Point:
    n = _norm(a)
    if n < 1e-12:
        raise ValueError(f"cannot normalise a zero-length vector {a}")
    return (a[0] / n, a[1] / n, a[2] / n)


def _dist(a: Point, b: Point) -> float:
    return _norm(_sub(a, b))


@dataclass(frozen=True)
class SailCorners:
    """One sail's four corners in world space.

    `tack` luff/foot, `clew` leech/foot, `peak` leech/head, `throat` luff/head.
    On a three-sided sail one pair is the same point, by construction.
    """

    tack: Point
    clew: Point
    peak: Point
    throat: Point

    def head_length(self) -> float:
        return _dist(self.throat, self.peak)

    def foot_length(self) -> float:
        return _dist(self.tack, self.clew)

    def luff_length(self) -> float:
        return _dist(self.tack, self.throat)

    def leech_length(self) -> float:
        return _dist(self.clew, self.peak)

    def chord(self) -> float:
        """Mean of head and foot: the across-the-sail scale the belly uses."""
        return (self.head_length() + self.foot_length()) / 2.0

    def plane_normal(self) -> Point:
        """Unit normal of the sail's own plane, from the two DIAGONALS.

        The diagonals are used rather than two edges because a three-sided
        sail has a zero-length edge and a cross product with it is nothing.
        Both diagonals exist on every kind.
        """
        return _unit(_cross(_sub(self.peak, self.tack), _sub(self.throat, self.clew)))

    def as_tuple(self) -> tuple[Point, Point, Point, Point]:
        return (self.tack, self.clew, self.peak, self.throat)


# --- fore-and-aft geometry, parameterised -----------------------------------
#
# None of these numbers governs the frigate: it sets no fore-and-aft sail. They
# are what a schooner's, and a galleon's lateen mizzen's, geometry is derived
# FROM, and they live here with both ends of every measurement named so the
# next pass can argue with them against a reference instead of guessing.

BOOM_RAIL_CLEAR = 0.90   # boom underside, above the rail cap at its own station
GAFF_HOIST_FRAC = 0.62   # throat, from boom height up towards the truck
GAFF_PEAK_DEG = 32.0     # gaff, above horizontal
GAFF_LEN_FRAC = 0.56     # gaff, as a fraction of its own boom
BOOM_GAP_CLEAR = 1.20    # boom end, forward of the next mast abaft it
BOOM_OVERHANG = 2.40     # aftmost boom, abaft the taffrail
SAIL_ABAFT_MAST = 0.22   # the luff stands this far abaft its own mast's axis

# A LATEEN'S YARD IS NOT DIMENSIONED HERE. `LATEEN_YARD_DEG = 48.0` and
# `LATEEN_TACK_DROP = 0.55` used to live on this line and they derived a
# second lateen yard, 3.5 m from the one `masts` cuts. The yard — its rake,
# its length, its slings, where it crosses the mast — is `shiptype.LateenSpar`
# and `profiles.lateen_spar`, and the only figure the canvas still needs of
# its own is where the CLEW stands, which is the one corner no spar gives.
LATEEN_FOOT_FRAC = 0.78  # clew, as a fraction of the yard's HORIZONTAL run aft of the tack
LATEEN_CLEW_CLEAR = 1.20  # clew, above the rail cap at the clew's OWN station

# THE GAFF TOPSAIL. Its head is hoisted to this fraction of the truck, up
# the topmast, under the colours flown from the truck (`wind.FLAG_HOIST`
# and `FLAG_DROOP` hang them 1.77 m down it; at 0.96 the topsail's head
# stood in them); its foot stands this far over the mainsail's head, which is
# clear over the gaff laid along it: the gaff's top stands 2 x 0.084 + 0.02
# = 0.19 m over that head at the jaws (`gaff_spars`).
TOPSAIL_HEAD_FRAC = 0.88
TOPSAIL_FOOT_LIFT = 0.30

STAYSAIL_FOOT_CLEAR = 1.10   # staysail foot, above the rail or the bowsprit
STAYSAIL_HEAD_FRAC = 0.86    # head, up the stay it is hanked to
HEADSAIL_CLEAR = 0.10        # tack over the bowsprit, head forward of the mast

BELLY_FRAC = wind.BELLY_FRAC   # one belly rule for every kind of canvas


def _rail_z(p: ShipParams, t: float) -> float:
    """The top of whatever rail is actually there at station `t`.

    DEFECT 10, AND IT IS DEFECT 2 AGAIN. This was `sheer(p, t) + p.bulwark_h`
    — the WAIST cap, which is the only rail a flush-decked frigate has. On a
    castle ship it is blind to every tier above it, exactly as
    `profiles.rail_top_z` was blind to the poop before Task 29. Measured on
    the galleon, both ends of each figure named:

        at the lateen TACK's station t 0.7256   waist cap 5.8908   rail 7.8408
        at the lateen CLEW's station t 0.9559   waist cap 7.6742   rail 11.2242

    — 1.95 m and 3.55 m low.

    LATENT, NOT LIVE, AND PROVED SO BOTH WAYS. Its two callers are
    `_gaff_corners` (through `_highest_rail_between`) and `_staysail_corners`,
    and no BUILT ship sets either sail: the frigate's rig is all SQUARE and
    the galleon's is SQUARE plus one LATEEN. `SCHOONER_RIG` is all GAFF and
    would have hung both its booms on the waist cap. And independently of
    that, on a flush-decked hull `rail_top_z` IS the waist cap at every
    station of the length, so the frigate could not move even if she set one.
    """
    return profiles.rail_top_z(p, t)


def _highest_rail_between(p: ShipParams, y_a: float, y_b: float,
                          samples: int = 33) -> float:
    """The highest the rail cap gets anywhere between two stations.

    A boom is LEVEL and the rail under it is not: the sheer sweeps up towards
    both ends. Setting a boom's height from the rail at its own mast left the
    clew — the other end, eight metres aft — with 0.892 m of air where 0.900 m
    was intended. Both ends of a measurement get named here, and the one that
    governs is the worst point along the span, not either end.
    """
    lo, hi = (y_b, y_a) if y_a > y_b else (y_a, y_b)
    return max(
        _rail_z(p, profiles.t_of_y(p, lo + (hi - lo) * i / (samples - 1)))
        for i in range(samples)
    )


def boom_span(p: ShipParams, mast: str) -> tuple[float, float]:
    """(y at the mast, y at the boom end) for one mast's boom. Aft is -y.

    An aftmost boom overhangs the taffrail; any other stops clear of the mast
    abaft it, because a boom that swings into the next mast is a broken boom.
    """
    names = profiles.mast_names(p)
    y_mast = profiles.station_y(p, profiles.mast_t(p, mast))
    i = names.index(mast)
    if i + 1 < len(names):
        y_next = profiles.station_y(p, profiles.mast_t(p, names[i + 1]))
        y_end = y_next + BOOM_GAP_CLEAR
    else:
        y_end = profiles.station_y(p, 1.0) - BOOM_OVERHANG
    if y_end >= y_mast:
        raise ValueError(
            f"the boom on {mast!r} has no room abaft it: mast at y={y_mast:.2f}, "
            f"boom end would be at y={y_end:.2f}"
        )
    return (y_mast, y_end)


def _gaff_corners(p: ShipParams, mast: str) -> SailCorners:
    """A four-sided fore-and-aft sail: gaff above, boom below, mast at the luff."""
    y_mast, y_end = boom_span(p, mast)
    luff_y = y_mast - SAIL_ABAFT_MAST
    boom_z = _highest_rail_between(p, luff_y, y_end) + BOOM_RAIL_CLEAR
    truck_z = profiles.mast_truck_z(p, mast)
    throat_z = boom_z + GAFF_HOIST_FRAC * (truck_z - boom_z)
    # THE LUFF IS LACED TO A RAKED MAST, so tack and throat each stand
    # SAIL_ABAFT_MAST abaft the mast's axis AT THEIR OWN HEIGHT. Both used to
    # take the axis at the deck: on the sloop's mast, raked 4 degrees, the
    # throat then stood 0.62 m FORWARD of the mast it is laced to, the head
    # of the canvas through the timber.
    tack_y = profiles.mast_point(p, mast, boom_z)[1] - SAIL_ABAFT_MAST
    throat_y = profiles.mast_point(p, mast, throat_z)[1] - SAIL_ABAFT_MAST
    gaff_len = GAFF_LEN_FRAC * (tack_y - y_end)
    peak_y = throat_y - gaff_len * math.cos(math.radians(GAFF_PEAK_DEG))
    peak_z = throat_z + gaff_len * math.sin(math.radians(GAFF_PEAK_DEG))
    x = 0.0
    return SailCorners(
        tack=(x, tack_y, boom_z),
        clew=(x, y_end, boom_z),
        peak=(x, peak_y, peak_z),
        throat=(x, throat_y, throat_z),
    )


def _lateen_corners(p: ShipParams, mast: str) -> SailCorners:
    """Three-sided, on one long raking yard. Degenerate at the TACK.

    THE SAIL IS BENT TO THE SPAR THAT IS CUT, and that spar is
    `profiles.lateen_spar` — the timber `masts.build_lateen_yards` builds out
    of `shiptype.LateenSpar`. This function used to derive a yard of its OWN
    from local constants, and the two disagreed: measured, the built yard ran
    16.173 m at 52 deg from HEEL (0, -7.588, 7.382) to PEAK
    (0, -17.545, 20.127), while the canvas ran 11.609 m at 48 deg from TACK
    (0, -6.316, 10.929) to its own PEAK (0, -14.084, 19.556) — the two heels
    3.768 m apart and the two peaks 3.508 m. The canvas hung beside its own
    spar, and `spar_segments` asserted the identity outright.

    So: the yard IS the luff and the HEEL IS THE TACK. The luff is degenerate
    at the tack (tack == throat), so `luff_length()` is 0.0 by construction
    and the edge the yard is is throat-to-peak, which `SailCorners` calls the
    HEAD. The CLEW is the one corner the spar does not give; see below.
    """
    heel, _slings, peak, _radius = profiles.lateen_spar(p, mast)
    tack = (0.0, heel[1], heel[2])
    peak = (0.0, peak[1], peak[2])
    clew = _lateen_clew(p, tack, peak)
    return SailCorners(tack=tack, clew=clew, peak=peak, throat=tack)


def _lateen_clew(p: ShipParams, tack: Point, peak: Point) -> Point:
    """The lateen's aft lower corner: the only one the spar does not give.

    STATION FIRST, THEN HEIGHT, so there is no circularity. The clew is
    placed by STATION: it stands `LATEEN_FOOT_FRAC` of the yard's own
    HORIZONTAL RUN aft of the tack, because what is wanted is the station
    the sheet is belayed at. Then the height is read at that station:
    `LATEEN_CLEW_CLEAR` above the rail cap at THAT station, read with
    `profiles.rail_top_z`, which has to be the clew's own station and not the
    tack's: the sheer sweeps up aft and the poop stands 5.00 m over the gun
    deck, so the cap under the clew is 11.224 m above the waterline where the
    cap at the mizzen's own station is far lower.

    MEASURED on the galleon's mizzen (the ruled spar on `GALLEON_RIG`):
    TACK y -7.669 to PEAK y -17.711 is a run of 10.042 m; 0.78 of it puts
    the CLEW at y -15.502, station t 0.9559, over the POOP, whose cap stands
    at 11.224, so the clew is at 12.424 m above the waterline — 0.624 m
    above the poop rail cap at the TAFFRAIL (11.800) and 7.613 m under its
    own PEAK (20.037).

    The clearance is 1.20 m against the gaff boom's `BOOM_RAIL_CLEAR` 0.90
    because a lateen clew is a CORNER with a sheet block and its lashing
    hanging under it, where a gaff boom has nothing below it but its own
    timber. Both endpoints of that figure are the clew and the rail cap
    beneath it.

    This derivation could not have been written before DEFECT 2 was fixed:
    `rail_top_z` at t 0.9516 answered 9.572 — the QUARTERDECK's cap, because
    Deck_Quarter and Deck_Poop overlap there and the reader took the first
    match — and the clew would have been sheeted 1.600 m too low.
    """
    run = tack[1] - peak[1]
    clew_y = tack[1] - LATEEN_FOOT_FRAC * run
    cap = profiles.rail_top_z(p, profiles.t_of_y(p, clew_y))
    return (0.0, clew_y, cap + LATEEN_CLEW_CLEAR)


def _gaff_topsail_corners(p: ShipParams, mast: str) -> SailCorners:
    """Three-sided, over the gaff. Degenerate at the TACK, as a lateen is.

    Its luff is laced up the topmast and its foot along the gaff; the leech
    from its head down to the gaff's peak is the one free edge. The sail
    model bellies every canvas from zero along its head (v = 1) and both
    sides (u = -1 and u = +1) to deepest at the middle of its foot (v = 0),
    so the corners are NAMED to put the two held edges on the zero ones:

      peak           = the gaff's throat, where luff and foot meet
      throat = tack  = the topsail's head, up the topmast
      clew           = the gaff's peak

    throat -> peak is then the luff, clew -> peak the foot along the gaff,
    and tack -> clew the free leech. Each corner stands TOPSAIL_FOOT_LIFT
    above the gaff corner it is sheeted to.
    """
    gaff = _gaff_corners(p, mast)
    lift = TOPSAIL_FOOT_LIFT
    head_z = TOPSAIL_HEAD_FRAC * profiles.mast_truck_z(p, mast)
    head_y = profiles.mast_point(p, mast, head_z)[1] - SAIL_ABAFT_MAST
    head = (0.0, head_y, head_z)
    return SailCorners(
        tack=head,
        clew=(0.0, gaff.peak[1], gaff.peak[2] + lift),
        peak=(0.0, gaff.throat[1], gaff.throat[2] + lift),
        throat=head,
    )


def _staysail_corners(p: ShipParams, sail: st.Sail) -> SailCorners:
    """Three-sided, hanked to a stay off the bowsprit. Degenerate at the HEAD.

    Tack on the bowsprit, head up the foremast's stay, clew aft over the
    forecastle. `tier` walks it outboard: tier 0 is the inner staysail, each
    further one tacks further out along the spar AND IS HOISTED HIGHER, to
    the topmast where the inner one goes to the hounds.

    IT USED TO HOIST EACH OUTER ONE LOWER, and on the sloop, the first ship
    to set two, the jib's luff then crossed the forestaysail's: jib head
    13.82 m under the forestaysail's 16.25 while tacking 3.84 m further out,
    so at the forestaysail's tack the jib stood 3.87 m over it and at the
    mast 2.43 m under it. No built ship set a headsail before the sloop.
    """
    heel, tip, r0, r1 = profiles.bowsprit_segment(p)
    fore = profiles.mast_names(p)[0]
    truck = profiles.mast_truck_z(p, fore)
    n = max(1, len(p.rig.headsails))
    f_tack = 0.30 + 0.60 * (sail.tier / n)
    tack = _lerp(heel, tip, f_tack)
    # ON the spar and ON the mast, not in them: the tack stands
    # `HEADSAIL_CLEAR` over the bowsprit's skin and the head as far forward
    # of the mast's.
    tack = (tack[0], tack[1],
            tack[2] + r0 + (r1 - r0) * f_tack + HEADSAIL_CLEAR)
    head_z = STAYSAIL_HEAD_FRAC * truck * (0.70 + 0.30 * (sail.tier + 1) / n)
    head = profiles.mast_point(p, fore, head_z)
    head = (head[0], head[1] + profiles.spar_radius_at(p, fore, head_z)
            + HEADSAIL_CLEAR, head[2])
    t_fore = profiles.mast_t(p, fore)
    clew_y = profiles.station_y(p, t_fore) + 0.5 * (tack[1]
                                                    - profiles.station_y(p, t_fore))
    clew_z = _rail_z(p, profiles.t_of_y(p, clew_y)) + STAYSAIL_FOOT_CLEAR
    return SailCorners(tack=(0.0, tack[1], tack[2]),
                       clew=(0.0, clew_y, clew_z),
                       peak=(0.0, head[1], head[2]),
                       throat=(0.0, head[1], head[2]))


def _square_corners(p: ShipParams, mast: str, tier: int) -> SailCorners:
    """The frigate's own sail, read back out of `wind.sail_panel` unchanged."""
    panel = wind.sail_panel(p, mast, tier)
    y = panel["y"]
    return SailCorners(
        tack=(-panel["foot_half"], y, panel["foot_z"]),
        clew=(panel["foot_half"], y, panel["foot_z"]),
        peak=(panel["head_half"], y, panel["head_z"]),
        throat=(-panel["head_half"], y, panel["head_z"]),
    )


def corners(p: ShipParams, mast: str | None, sail: st.Sail) -> SailCorners:
    """The four corners of one sail. `mast` is None for a headsail."""
    kind = sail.kind
    if kind is st.SailKind.SQUARE:
        return _square_corners(p, mast, sail.tier)
    if kind is st.SailKind.GAFF:
        return _gaff_corners(p, mast)
    if kind is st.SailKind.LATEEN:
        return _lateen_corners(p, mast)
    if kind is st.SailKind.STAYSAIL:
        return _staysail_corners(p, sail)
    if kind is st.SailKind.GAFF_TOPSAIL:
        return _gaff_topsail_corners(p, mast)
    raise ValueError(f"no corner geometry for sail kind {kind}")


def check_degeneracy(kind: st.SailKind, c: SailCorners, tol: float = 1e-9) -> None:
    """The corners must be degenerate exactly where the sail kind says they are.

    This is the join between the model and the geometry, and it is checked
    rather than assumed: a lateen whose tack and throat have drifted apart is
    a four-sided lateen, which is not a thing.
    """
    where = st.degenerate_corner(kind)
    pairs = {"head": (c.throat, c.peak), "tack": (c.tack, c.throat)}
    if where is not None:
        a, b = pairs[where]
        if _dist(a, b) > tol:
            raise ValueError(
                f"a {kind.value} sail is degenerate at the {where}, but its two "
                f"{where} corners stand {_dist(a, b):.4f} m apart"
            )
    else:
        names = ("tack", "clew", "peak", "throat")
        pts = c.as_tuple()
        for i in range(4):
            for j in range(i + 1, 4):
                if _dist(pts[i], pts[j]) <= tol:
                    raise ValueError(
                        f"a {kind.value} sail has four distinct corners, but its "
                        f"{names[i]} and {names[j]} are the same point"
                    )


# --- the surface ------------------------------------------------------------


def flat_point(c: SailCorners, u: float, v: float) -> Point:
    """A point on the FLAT sail, before the wind gets to it.

    Bilinear in (u, v): along the foot from tack to clew, along the head from
    throat to peak, and between them. A coincident corner pair collapses that
    edge to a point and the patch becomes a triangle with no special case.
    """
    s = (u + 1.0) / 2.0
    return _lerp(_lerp(c.tack, c.clew, s), _lerp(c.throat, c.peak, s), v)


def belly_direction(p: ShipParams, c: SailCorners, z: float) -> Point:
    """Which way this sail's canvas bulges: its own normal, turned to leeward.

    ONE wind, per spec section 7: the direction comes from `wind.wind_direction`
    at the height asked for, exactly as the square sails' does. What differs
    between a square sail and a fore-and-aft one is not the weather, it is the
    plane the canvas hangs in — so a square sail bellies along the wind and a
    gaff sail bellies across the ship, and both are the same wind.
    """
    n = c.plane_normal()
    w = wind.wind_direction(p, z)
    return n if _dot(n, w) >= 0.0 else (-n[0], -n[1], -n[2])


def belly_scale(c: SailCorners, kind: st.SailKind) -> float:
    """The across-the-sail length the belly depth is a fraction of.

    For a square sail it is the HEAD — the yard the canvas is laced to — which
    is the length `wind.sail_point` has always used, so the general path and
    the square one differ in direction alone and not in depth. For any other
    kind it is the widest edge, because a three-sided sail's head is a point
    and a sail scaled off a point would not belly at all.
    """
    if kind is st.SailKind.SQUARE:
        return c.head_length()
    return max(c.head_length(), c.foot_length())


def belly_depth(p: ShipParams, c: SailCorners, kind: st.SailKind,
                u: float, v: float) -> float:
    """How far the canvas stands off its own flat panel at (u, v)."""
    return BELLY_FRAC * belly_scale(c, kind) * wind.WIND_STRENGTH * wind.belly(u, v)


def surface_point(p: ShipParams, c: SailCorners, kind: st.SailKind,
                  u: float, v: float) -> Point:
    """A point on the bellied canvas of ANY kind of sail.

    The canvas stands off its own plane along that plane's normal, turned to
    leeward. `wind.sail_point` instead pushes a square sail along the
    HORIZONTAL wind vector, which for a sail standing nearly square to the
    wind is the same depth with a small downwind skew added; the two agree in
    magnitude exactly and differ in direction by the wind's own azimuth. The
    frigate keeps its own path (see `sail_point`); this is the rule every
    other kind is drawn by, and the one a sail in an arbitrary plane needs,
    because pushing a FORE-AND-AFT sail along a fore-and-aft wind vector would
    stretch it end to end instead of bellying it.
    """
    flat = flat_point(c, u, v)
    d = belly_depth(p, c, kind, u, v)
    nx, ny, nz = belly_direction(p, c, flat[2])
    return (flat[0] + nx * d, flat[1] + ny * d, flat[2] + nz * d)


def sail_point(p: ShipParams, mast: str | None, sail: st.Sail,
               u: float, v: float) -> Point:
    """One point of one sail, whichever kind it is.

    A SQUARE sail is routed straight back to `wind.sail_point`. That is not a
    special case kept out of laziness: the frigate's canvas is verified
    geometry and the general bilinear is only algebraically equal to the
    formula that produced it, not equal in floating point. The general path is
    held to the same answer by test, to 1e-12.
    """
    if sail.kind is st.SailKind.SQUARE:
        return wind.sail_point(p, mast, sail.tier, u, v)
    return surface_point(p, corners(p, mast, sail), sail.kind, u, v)


def sail_grid(p: ShipParams, mast: str | None, sail: st.Sail,
              nu: int, nv: int) -> list[list[Point]]:
    """The displaced grid, rows running FOOT to HEAD so `grid[-1]` is the head."""
    return [
        [sail_point(p, mast, sail, -1.0 + 2.0 * i / (nu - 1), j / (nv - 1))
         for i in range(nu)]
        for j in range(nv)
    ]


# --- spars ------------------------------------------------------------------


def spar_segments(p: ShipParams, mast: str | None,
                  sail: st.Sail) -> list[tuple[st.SparKind, Point, Point]]:
    """The timber this sail is bent to, as (kind, end, end).

    A square sail gives its yard, a gaff sail a gaff AND a boom, a lateen its
    one long yard, and a staysail nothing at all — a jib hangs on a stay, and
    a spar list that had to produce something for every sail would invent one.
    """
    c = corners(p, mast, sail)
    kinds = st.spars_for(sail.kind)
    if not kinds:
        return []
    if sail.kind is st.SailKind.SQUARE:
        # The yard is the head, run out to its own full length rather than to
        # the canvas, which is cut HEAD_FRAC of it.
        _z, length, _r = profiles.yard_specs(p, mast)[sail.tier]
        mid = _lerp(c.throat, c.peak, 0.5)
        return [(st.SparKind.YARD,
                 (mid[0] - length / 2.0, mid[1], mid[2]),
                 (mid[0] + length / 2.0, mid[1], mid[2]))]
    if sail.kind is st.SailKind.GAFF:
        return [(st.SparKind.GAFF, c.throat, c.peak),
                (st.SparKind.BOOM, c.tack, c.clew)]
    if sail.kind is st.SailKind.LATEEN:
        return [(st.SparKind.LATEEN_YARD, c.tack, c.peak)]
    raise ValueError(f"no spar geometry for sail kind {sail.kind}")


# --- the gaff and the boom, as timber ------------------------------------
#
# `spar_segments` gives the EDGES of canvas a gaff sail is bent to. The
# timber is not those edges: it stands `SPAR_STANDOFF` off them, the gaff
# over the head and the boom under the loose foot, so spar and cloth do not
# share a surface, and it runs from just abaft its mast to `SPAR_OVERHANG`
# past the sail's outer corner. Its radius is a fraction of its length, as a
# lateen yard's is.

GAFF_RADIUS_FRAC = 0.011    # radius at the jaws, per metre of spar
SPAR_TIP_TAPER = 0.60       # radius at the outer end, over that at the jaws
SPAR_OVERHANG = 0.30        # past the sail's peak or clew
SPAR_STANDOFF = 0.02        # off the canvas edge, and off the mast's skin


def gaff_spars(p: ShipParams, mast: str) -> dict:
    """{"gaff": (root, tip, r_root, r_tip), "boom": (...)} for a mast that
    sets a gaff sail, and {} for one that does not. `root` is at the jaws,
    `SPAR_STANDOFF` abaft the mast's skin; both are in the centre plane."""
    gaffs = [s for s in p.rig.mast(mast).sails if s.kind is st.SailKind.GAFF]
    if not gaffs:
        return {}
    c = corners(p, mast, gaffs[0])
    out = {}
    for key, a, b, up in (("gaff", c.throat, c.peak, 1.0),
                          ("boom", c.tack, c.clew, -1.0)):
        run = _dist(a, b) + SAIL_ABAFT_MAST + SPAR_OVERHANG
        r0 = GAFF_RADIUS_FRAC * run
        d = _unit(_sub(b, a))
        # VERTICALLY off the edge by its radius plus the standoff over the
        # cosine of its own slope, so SQUARE TO THE SPAR its skin stands
        # SPAR_STANDOFF off the canvas: a gaff peaked up 32 degrees lifted
        # by its bare radius had its underside 4 mm over the head and cut
        # the cloth below it.
        lift = up * (r0 + SPAR_STANDOFF) / math.hypot(d[0], d[1])
        # Its jaws stand a radius clear of the mast too, for the same
        # reason, and ON the lifted line: the jaws are abaft the sail's
        # corner, so on a peaked gaff they stand higher than it. Settled by
        # iterating, since the mast's skin and rake are read at the jaws.
        def jaws_y(z):
            return (profiles.mast_point(p, mast, z)[1]
                    - profiles.spar_radius_at(p, mast, z) - SPAR_STANDOFF - r0)

        z0 = a[2] + lift
        for _ in range(8):
            z0 = a[2] + lift + (jaws_y(z0) - a[1]) * d[2] / d[1]
        y0 = jaws_y(z0)
        tip = (0.0, b[1] + d[1] * SPAR_OVERHANG,
               b[2] + d[2] * SPAR_OVERHANG + lift)
        out[key] = ((0.0, y0, z0), tip, r0, r0 * SPAR_TIP_TAPER)
    return out


# --- the whole ship's canvas ------------------------------------------------


def all_sails(p: ShipParams) -> list[tuple[str | None, st.Sail]]:
    """Every sail in the ship as (mast or None, sail), in emission order.

    Masts forward to aft, tiers bottom to top, then the headsails inboard to
    outboard. This is the order `sails.build_sails` emits in and the order
    `dressing` draws its patches against, so it is fixed here once.
    """
    out: list[tuple[str | None, st.Sail]] = []
    for name in profiles.mast_names(p):
        for sail in sorted(p.rig.mast(name).sails, key=lambda s: s.tier):
            out.append((name, sail))
    for sail in sorted(p.rig.headsails, key=lambda s: s.tier):
        out.append((None, sail))
    return out
