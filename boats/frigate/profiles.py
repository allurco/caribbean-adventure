"""Station profile math.

A hull is a compound curved surface with four simultaneous curvatures: sheer,
camber, tumblehome, and a fine entry broadening to a full run. It is generated
here as transverse station rings, parameterised by t in [0, 1] with t=0 at the
stem and t=1 at the transom. Pure arithmetic — imports no bpy.
"""

import math

from .params import FrigateParams

Point = tuple[float, float, float]

# The exponents and fractions that decide the hull's SHAPE used to be eleven
# module constants here: _TUMBLE_AT_DECK, _TUMBLE_EXP, _ENTRY_EXP, _RUN_EXP,
# _RUN_LOSS, _STEM_FRACTION, _FOREFOOT_*, _TUCK_*, _BULWARK_TUMBLE. They are
# the same class of blocker as the five named in `shiptype`, and no less
# architectural: a galleon is not a frigate with different numbers for length
# and beam, it is a bluffer bow, a fuller run and far heavier tumblehome. They
# are `shiptype.HullForm` now and the ship carries its own in `p.hull_form`.
_TS_EPS = 1e-4           # two bulwark stations closer than this make a dead face


def _check_t(t: float) -> None:
    if not 0.0 <= t <= 1.0:
        raise ValueError(f"t must be in [0, 1], got {t}")


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def station_y(p: FrigateParams, t: float) -> float:
    """Longitudinal position. Bow is +Y, so t=0 maps to +half_loa."""
    _check_t(t)
    return p.half_loa - t * p.loa


def half_beam(p: FrigateParams, t: float) -> float:
    """Maximum half-width at station t.

    Fine entry forward and a broad run aft on a frigate; a bluff bow and a
    fuller run on a galleon. Which it is, is `p.hull_form`.
    """
    _check_t(t)
    h = p.hull_form
    if t <= p.max_beam_t:
        f = t / p.max_beam_t
        factor = h.stem_fraction + (1.0 - h.stem_fraction) * f ** h.entry_exp
    else:
        g = (t - p.max_beam_t) / (1.0 - p.max_beam_t)
        factor = 1.0 - h.run_loss * g ** h.run_exp
    return p.half_beam * factor


def sheer(p: FrigateParams, t: float) -> float:
    """Deck edge height. Dips amidships, rises at both ends — classic sheer.

    `hull_form.sheer_exp` decides the SHAPE of that rise. At 2.0 it is a
    parabola over the whole length, which is the frigate's and reads as one
    long easy sweep. Above 2.0 the waist stays flat and the rise is thrown
    into the ends, which is what both galleon references show: the Andalucia's
    main rail runs near enough straight through the waist and sweeps up only
    in the last quarter.

    The exponent-2 case is written `u * u` rather than `abs(u) ** 2.0` on
    purpose. They are the same number in algebra; `pow` is not guaranteed to
    round identically, and this function sets the height of every deck, rail,
    gunport and mast foot on a hull that is frozen.
    """
    _check_t(t)
    u = (t - 0.5) / 0.5
    rise = p.bow_rise if u < 0 else p.stern_rise
    exp = p.hull_form.sheer_exp
    if exp == 2.0:
        return p.deck_z + rise * u * u
    return p.deck_z + rise * abs(u) ** exp


def keel_z(p: FrigateParams, t: float) -> float:
    """Keel depth. Deepest amidships, rising into the forefoot and the tuck."""
    _check_t(t)
    h = p.hull_form
    forefoot = _clamp01((h.forefoot_span - t) / h.forefoot_span) ** 1.6
    tuck = _clamp01((t - (1.0 - h.tuck_span)) / h.tuck_span) ** 1.8
    return -p.draft + h.forefoot_rise * forefoot + h.tuck_rise * tuck


def tumblehome(p: FrigateParams, z: float, sheer_z: float) -> float:
    """Width multiplier above the waterline. 1.0 at the waterline, narrowing up.

    How hard the topsides draw in is the single most recognisable difference
    between a frigate's section and a galleon's, so it is `p.hull_form`, not a
    constant.
    """
    if z <= 0.0 or sheer_z <= 0.0:
        return 1.0
    h = p.hull_form
    return 1.0 - h.tumble_at_deck * _clamp01(z / sheer_z) ** h.tumble_exp


def bilge_exp(p: FrigateParams, t: float) -> float:
    """Turn-of-bilge sharpness: slack forward, hard aft."""
    _check_t(t)
    return p.hull_form.bilge_root + p.hull_form.bilge_slope * t


def station_ring(p: FrigateParams, t: float) -> list[Point]:
    """One transverse section as a closed loop of 2 * pts_per_half points.

    Starboard points run keel-up-to-sheer; port mirrors them in reverse, so the
    loop is continuous and bridges cleanly to its neighbours.
    """
    _check_t(t)
    y = station_y(p, t)
    hb = half_beam(p, t)
    kz = keel_z(p, t)
    sz = sheer(p, t)
    exp = bilge_exp(p, t)
    half_width = min(p.keel_half, hb)

    starboard: list[Point] = []
    if hull_gun_decks(p):
        zs = _seamed_ring_zs(p, t)
    else:
        zs = [kz + (sz - kz) * (i / (p.pts_per_half - 1))
              for i in range(p.pts_per_half)]
    for z in zs:
        if z <= 0.0 and kz < 0.0:
            q = _clamp01((z - kz) / (0.0 - kz))
            x = half_width + (hb - half_width) * (1.0 - (1.0 - q) ** exp) ** (1.0 / exp)
        else:
            x = hb * tumblehome(p, z, sz)
        starboard.append((x, y, z))

    port = [(-x, y, z) for x, y, z in reversed(starboard)]
    return port + starboard


def hull_seam_offsets(p: FrigateParams) -> list[float]:
    """Sill and head of every HULL-hosted row, as offsets from the sheer.

    Negative: these rows stand below the deck edge, on a deck inside the
    hull. Ascending. Empty on a ship whose every row is in the bulwark,
    which is the frigate's, and then the loft is her uniform one verbatim.
    """
    out = []
    for d in hull_gun_decks(p):
        rise = p.tier(d.served_by).rise
        out += [rise + d.sill, rise + d.sill + d.height]
    return sorted(out)


def hull_ring_counts(p: FrigateParams) -> list[int]:
    """Intervals of one half-ring in each span keel-seam-...-seam-sheer.

    A hull row's apertures are cut by FACE SELECTION, so the loft needs a
    ring point at every sill and head the whole length of the ship, at the
    SAME ring index at every station or the seams zigzag. The half-ring is
    therefore split at those seams into fixed spans and each span gets a
    fixed number of intervals: two more points than `pts_per_half`, shared
    out in proportion to the spans' lengths at maximum beam, never fewer
    than one. Points inside a span are spaced evenly at each station.
    """
    seams = hull_seam_offsets(p)
    t = p.max_beam_t
    kz, sz = keel_z(p, t), sheer(p, t)
    knots = [kz] + [sz + o for o in seams] + [sz]
    spans = [b - a for a, b in zip(knots, knots[1:])]
    total = p.pts_per_half - 1 + len(seams)
    counts = [max(1, round(total * sp / (sz - kz))) for sp in spans]
    # The row's own aperture is ONE interval tall, so the cut is one band.
    for i in range(1, len(seams), 2):
        counts[i] = 1
    while sum(counts) > total:
        counts[counts.index(max(counts))] -= 1
    while sum(counts) < total:
        counts[counts.index(max(counts))] += 1
    return counts


def hull_seam_indices(p: FrigateParams) -> list[int]:
    """Starboard half-ring index of each seam in `hull_seam_offsets`."""
    out, i = [], 0
    for c in hull_ring_counts(p)[:-1]:
        i += c
        out.append(i)
    return out


def _seamed_ring_zs(p: FrigateParams, t: float) -> list[float]:
    kz, sz = keel_z(p, t), sheer(p, t)
    knots = [kz] + [sz + o for o in hull_seam_offsets(p)] + [sz]
    if any(b <= a for a, b in zip(knots, knots[1:])):
        raise ValueError(
            f"at t={t:.4f} the hull row seams {knots[1:-1]} do not stand "
            f"between the keel {kz:.3f} and the sheer {sz:.3f}")
    zs = [kz]
    for (a, b), n in zip(zip(knots, knots[1:]), hull_ring_counts(p)):
        zs += [a + (b - a) * k / n for k in range(1, n)] + [b]
    return zs


def station_ts(p: FrigateParams) -> list[float]:
    """Longitudinal stations of the hull loft: the uniform grid plus maximum beam.

    `half_beam` is piecewise about `max_beam_t` — the entry branch arrives still
    climbing, the run branch leaves flat — so the curve has a corner there. A
    uniform grid steps over it (with 24 stations the nearest are 0.3913 and
    0.4348), the loft lays a flat chord across maximum beam, and a bulwark seam
    at mid-chord stands 121 mm outside the hull skin. Sampling the corner costs
    one extra ring and drops that to ~3 mm.

    This is the single source of truth for where a station lies. The hull loft
    and the bulwark grid must agree on it, or their seams stop lining up.
    """
    ts = [i / (p.n_stations - 1) for i in range(p.n_stations)]
    if all(abs(p.max_beam_t - t) > _TS_EPS for t in ts):
        ts.append(p.max_beam_t)
    # A row cut in the HULL needs a station at each of its port edges, for
    # the same reason `bulwark_ts` puts one in the bulwark grid. None on a
    # ship whose rows are all in the bulwark.
    for d in hull_gun_decks(p):
        for fwd, aft in port_edge_ts(p, p.gun_decks.index(d)):
            for c in (fwd, aft):
                if all(abs(c - e) > _TS_EPS for e in ts):
                    ts.append(c)
    ts = sorted(ts)
    return sorted(ts + _sheer_refinement(p, ts))


# How far the cage's own chord may fall below the sheer curve between two
# stations. The uniform grid was fine for a frigate and is not for a galleon:
# a frigate's sheer is a parabola rising 0.9 m aft and its worst chord sag is
# 2.27 mm, while a galleon's rises 2.70 m on a 2.6 exponent and sags 10.34 mm.
# That is not a tolerance to widen somewhere else — it is a cage too coarse
# for the curve it is carrying, and it showed up as the BULWARK sinking
# 12.7 mm into the hull, because Catmull-Clark smooths the gunwale ALONG its
# length (a crease stops smoothing ACROSS an edge, not along it) and the
# rendered deck edge ends up below the cage polyline the bulwark is built on.
#
# 3.0 mm sits above the frigate's own 2.27 mm with a third to spare, so a
# frigate refines nowhere and its hull is untouched, and below the galleon's
# 10.34 mm, so a galleon refines until its cage carries its own sheer. This is
# the same move `max_beam_t` above already makes for the corner in the beam
# curve: sample where the curve has a feature, do not loosen what measures it.
SHEER_SAG_LIMIT = 3.0e-3
_SHEER_REFINE_DEPTH = 4


def sheer_chord_sag(p: FrigateParams, a: float, b: float) -> float:
    """Sheer-at-the-midpoint to chord-between-two-stations, in metres."""
    return abs(sheer(p, (a + b) / 2.0) - (sheer(p, a) + sheer(p, b)) / 2.0)


def _sheer_refinement(p: FrigateParams, ts: list[float]) -> list[float]:
    """Extra stations where the uniform grid cannot carry this ship's sheer."""
    extra: list[float] = []
    pending = list(zip(ts, ts[1:]))
    for _ in range(_SHEER_REFINE_DEPTH):
        nxt = []
        for a, b in pending:
            if sheer_chord_sag(p, a, b) <= SHEER_SAG_LIMIT:
                continue
            mid = (a + b) / 2.0
            if all(abs(mid - t) > _TS_EPS for t in ts + extra):
                extra.append(mid)
            nxt += [(a, mid), (mid, b)]
        if not nxt:
            break
        pending = nxt
    return extra


def all_stations(p: FrigateParams) -> list[list[Point]]:
    """Every station ring, stem to transom."""
    p.validate()
    return [station_ring(p, t) for t in station_ts(p)]


def hull_hard_edges(ring_len: int, n_rings: int) -> frozenset[frozenset[int]]:
    """Every cage edge of the hull loft that must be HARD, as vertex-index pairs.

    The loft creates vertices ring by ring, so vertex index = station * ring_len
    + i. Two families are hard:

    * the GUNWALE — the two longitudinal runs at ring index 0 (port sheer) and
      ring_len - 1 (starboard sheer). Hard here stops Catmull-Clark pulling the
      deck edge inboard, which is what once let the bulwark overhang the
      rendered hull.
    * the STEM and TRANSOM CAP perimeters — the closed ring of each end station.
      Each cap is a flat plate and the planking turns through nearly a right
      angle at its rim.

    "Hard" means both halves of hard: creased in the LIMIT SURFACE and split in
    the SHADING. Creasing alone is what commit `e35c41a` did, and a crease of
    1.0 under unsplit smooth shading averages the forward-facing stem cap into
    the side planking — measured, it swings the interpolated normal 41.3 deg off
    the surface it belongs to and collapses its lambert term from 0.739 to
    0.110. That is the black wedge that stood on the bow from `e35c41a` until
    this function replaced the edge selection that only creased.

    Pure topology on purpose: which edges are hard is a fact about the loft's
    indexing, not about Blender, so it is decided here and merely applied there.
    """
    if ring_len < 3:
        raise ValueError(f"a station ring needs at least 3 points, got {ring_len}")
    if n_rings < 2:
        raise ValueError(f"a loft needs at least 2 stations, got {n_rings}")
    edges = set()
    for i in (0, ring_len - 1):
        for s in range(n_rings - 1):
            edges.add(frozenset((s * ring_len + i, (s + 1) * ring_len + i)))
    for s in (0, n_rings - 1):
        base = s * ring_len
        for i in range(ring_len):
            edges.add(frozenset((base + i, base + (i + 1) % ring_len)))
    return frozenset(edges)


def bulwark_half_width(p: FrigateParams, t: float, z: float) -> float:
    """Outer half-width of the bulwark at height z.

    At z == sheer(t) this returns exactly the hull top-ring x, so the bulwark
    meets the hull flush. Above the deck the topsides keep leaning inward, which
    plain `tumblehome` does not do because it clamps at the sheer.
    """
    _check_t(t)
    sz = sheer(p, t)
    base = half_beam(p, t) * tumblehome(p, sz, sz)
    above = max(0.0, z - sz)
    h = p.hull_form
    # The lean is linear with height and FLOORED. Unfloored it is a straight
    # line to the centreline and past it: at `bulwark_tumble` 0.10 the side
    # reaches x = 0 ten metres over the sheer. `tumble_floor` is 0.0 on the
    # frigate, so `max(0.0, ...)` is a no-op there and her topsides do not
    # move; the galleon's is 0.52 and binds only on the top 1.20 m of its poop.
    return base * max(h.tumble_floor, 1.0 - h.bulwark_tumble * above)


def t_of_y(p: FrigateParams, y: float) -> float:
    """Inverse of `station_y`, clamped to the hull.

    Lets a geometry query go from a world coordinate back to a station. The
    gunport cut, the cannon placement, and the damage pass all need this.
    """
    return _clamp01((p.half_loa - y) / p.loa)


# --- the battery: ROWS, plural ---------------------------------------------
#
# `GUNPORTS_PER_SIDE = 11` was a module constant and `gunport_row()` returned
# ONE row index. Both were the frigate's single gun deck mistaken for the
# shape of the problem. A man-o-war carries two or three rows a side, so every
# function below takes a DECK INDEX into `p.gun_decks` and there is an `all_*`
# form for the passes that want the whole battery. One row is N == 1.


def bulwark_gun_decks(p: FrigateParams) -> list:
    """The rows cut in the bulwark, lowest sill first.

    A row whose `host` is not the bulwark is cut in the topside planking
    instead — that is the man-o-war's lower batteries — and is not part of
    this grid. Nothing emits one yet, and `bulwark_row_offsets` deliberately
    does not silently include it.
    """
    return sorted((d for d in p.gun_decks if d.host == "bulwark"),
                  key=lambda d: d.sill)


def hull_gun_decks(p: FrigateParams) -> list:
    """The rows cut in the HULL skin, lowest first: a lower battery."""
    return sorted((d for d in p.gun_decks if d.host == "hull"),
                  key=lambda d: p.tier(d.served_by).rise + d.sill)


def serving_tier(p: FrigateParams, deck: int):
    """The deck the guns of one row stand on."""
    return p.tier(gun_deck(p, deck).served_by)


def row_floor_z(p: FrigateParams, t: float, deck: int) -> float:
    """Height of the EDGE of the deck serving one row, at station t.

    The row's sill and head are measured above this. For a bulwark row on
    the gun deck it is the sheer; for a hull row it is its own deck's edge.
    """
    return sheer(p, t) + serving_tier(p, deck).rise


def sill_reading(p: FrigateParams, deck: int, t: float) -> float:
    """SERVING-DECK SURFACE `sill_inboard` m inboard of its edge to PORT SILL.

    The sill is one edge-relative figure; the camber lifts the deck inboard
    of the edge, so where the carriage stands the sill is that much lower.
    """
    d = gun_deck(p, deck)
    tier = serving_tier(p, deck)
    x = tier_half_beam(p, tier, t) - d.sill_inboard
    return d.sill - tier_camber_z(p, tier, t, x)


def gun_deck(p: FrigateParams, deck: int):
    """One row of the battery, by index into `p.gun_decks`."""
    try:
        return p.gun_decks[deck]
    except IndexError:
        raise IndexError(
            f"this ship has {len(p.gun_decks)} gun deck row(s); there is no row "
            f"{deck}"
        ) from None


def gunport_ts(p: FrigateParams, deck: int) -> list[float]:
    """Station of each broadside gunport in ONE row, forward to aft.

    Evenly spaced over its own span, unless the row is ALIGNED to another, in
    which case it takes that row's columns. See `shiptype.GunDeck.align`.
    """
    d = gun_deck(p, deck)
    if d.align is None:
        return d.ts()
    base = next(i for i, other in enumerate(p.gun_decks) if other.name == d.align)
    return d.ts(gun_deck(p, base).ts())


def all_gunport_ts(p: FrigateParams) -> list[tuple[int, float]]:
    """Every broadside port in the ship, as (deck index, station)."""
    return [(d, t) for d in range(len(p.gun_decks)) for t in gunport_ts(p, d)]


def total_broadside_ports(p: FrigateParams) -> int:
    """Apertures in the topsides: every row, both sides."""
    return 2 * sum(d.n_ports for d in p.gun_decks)


def port_center_z(p: FrigateParams, t: float, deck: int) -> float:
    """Height of a gunport's centre: sill above the deck edge, plus half the port."""
    _check_t(t)
    d = gun_deck(p, deck)
    return row_floor_z(p, t, deck) + d.sill + d.height / 2.0


def port_edge_ts(p: FrigateParams, deck: int) -> list[tuple[float, float]]:
    """Forward and aft station of each aperture in one row. y decreases aft."""
    out = []
    w = gun_deck(p, deck).width
    for t in gunport_ts(p, deck):
        y = station_y(p, t)
        out.append((t_of_y(p, y + w / 2.0), t_of_y(p, y - w / 2.0)))
    return out


def all_port_edge_ts(p: FrigateParams) -> list[tuple[float, float]]:
    """Every aperture's fore-and-aft station pair, every row."""
    return [pair for d in range(len(p.gun_decks)) for pair in port_edge_ts(p, d)]


def bulwark_ts(p: FrigateParams) -> list[float]:
    """Longitudinal sample stations for the bulwark grid.

    The hull stations, plus a seam at every gunport edge OF EVERY ROW. Without
    those seams an aperture would not line up with a face boundary, and Task
    5's face selection would either find nothing or cut a band wider than the
    port. A candidate seam within _TS_EPS of an existing station is dropped: it
    is already a face boundary, and keeping both would emit a zero-area face.
    """
    p.validate()
    ts = station_ts(p)
    for fwd, aft in all_port_edge_ts(p):
        for candidate in (fwd, aft):
            if all(abs(candidate - existing) > _TS_EPS for existing in ts):
                ts.append(candidate)
    return sorted(ts)


def bulwark_row_offsets(p: FrigateParams) -> list[float]:
    """Vertical seams of the bulwark grid, as offsets above sheer(t).

    The keel of the bulwark, then the sill and head of EVERY row of ports in
    ascending order, then the rail cap. A one-row battery gives the four
    offsets and three rows the frigate has always had; a two-decker gives six
    and five. The row count is derived from where the apertures must be cut,
    never chosen.
    """
    p.validate()
    offsets = [0.0]
    for d in bulwark_gun_decks(p):
        offsets += [d.sill, d.sill + d.height]
    offsets.append(p.bulwark_h)
    return offsets


def gunport_rows(p: FrigateParams) -> list[int]:
    """Index of each row's aperture band in the bulwark grid, lowest first.

    One entry per bulwark-hosted gun deck, in the same order as
    `bulwark_gun_decks`. Each is derived by locating that row's own sill among
    `bulwark_row_offsets`, never chosen, so that adding a row elsewhere in the
    bulwark cannot silently move a cut.
    """
    offsets = bulwark_row_offsets(p)
    out = []
    for d in bulwark_gun_decks(p):
        for r in range(len(offsets) - 1):
            if abs(offsets[r] - d.sill) <= _TS_EPS:
                out.append(r)
                break
        else:
            raise ValueError(
                f"no bulwark row starts at the sill {d.sill} of gun deck {d.name!r}"
            )
    return out


def gunport_row(p: FrigateParams, deck: int) -> int:
    """The bulwark grid row one gun deck's apertures occupy."""
    d = gun_deck(p, deck)
    order = bulwark_gun_decks(p)
    if d not in order:
        raise ValueError(
            f"gun deck {d.name!r} is hosted on the {d.host}, not in the bulwark"
        )
    return gunport_rows(p)[order.index(d)]


def chase_deck_index(p: FrigateParams) -> int:
    """Which row the stern chasers are cut at: the UPPERMOST bulwark row.

    The chase ports pierce the transom at the level of the upper battery, so
    "the gunport row" that the transom grid and the stern carving measure
    against is that row by name, not by being the only one.
    """
    top = bulwark_gun_decks(p)[-1]
    return p.gun_decks.index(top)


def chase_row(p: FrigateParams) -> int:
    """The transom grid row the stern chase ports occupy. On the sheer
    datum it is the chase row's own bulwark grid row; measured above the
    deck at the gun, the transom has its own rows and the ports are row 1
    (`transom_row_offsets`)."""
    if p.stern_form.chase_sill_datum == "sheer":
        return gunport_row(p, chase_deck_index(p))
    return 1


def gunport_bands(p: FrigateParams, deck: int) -> list[list[int]]:
    """Band indices into `bulwark_ts` covered by each gunport of one row.

    Band `i` spans `ts[i]..ts[i + 1]`. A band is taken only if it lies wholly
    inside the port, so the aperture can never come out wider than the port.
    Six of the frigate's eleven ports straddle a hull station and so span two
    bands; that is correct, and the seams `bulwark_ts` adds at the port edges
    are what keep the two-band aperture flush with the one-band one.
    """
    ts = bulwark_ts(p)
    out: list[list[int]] = []
    for fwd, aft in port_edge_ts(p, deck):
        idx = [
            i
            for i in range(len(ts) - 1)
            if ts[i] >= fwd - _TS_EPS and ts[i + 1] <= aft + _TS_EPS
        ]
        if not idx:
            raise ValueError(
                f"gunport spanning t={fwd:.4f}..{aft:.4f} selects no band; the "
                "bulwark grid is wrong — do not widen the selection"
            )
        out.append(idx)
    return out


def gunport_boxes(p: FrigateParams, deck: int) -> list[tuple[float, float, float, float]]:
    """Per gunport of one row, the region the face selection runs against.

    `(y_aft, y_fwd, z_lo, z_hi)` — a world y-interval and a pair of offsets
    above the local sheer, taken from the grid seams the aperture actually
    lands on rather than from the port centre plus a margin. A face is cut only
    if its centroid falls strictly inside, which is what keeps the port lining
    faces (whose centroids sit exactly on these bounds) out of the selection.
    """
    ts = bulwark_ts(p)
    offsets = bulwark_row_offsets(p)
    r = gunport_row(p, deck)
    return [
        (station_y(p, ts[idx[-1] + 1]), station_y(p, ts[idx[0]]), offsets[r], offsets[r + 1])
        for idx in gunport_bands(p, deck)
    ]


def all_gunport_boxes(p: FrigateParams) -> list[tuple[int, tuple[float, float, float, float]]]:
    """Every aperture in the topsides, tagged with the row it belongs to.

    This is what the cutter iterates. It used to iterate `gunport_boxes(p)`,
    which could only ever have been one row.
    """
    # The BULWARK's apertures. A row cut in the hull is in a different
    # grid and is `all_hull_gunport_boxes`'s.
    return [(d, box)
            for d in range(len(p.gun_decks))
            if p.gun_decks[d].host == "bulwark"
            for box in gunport_boxes(p, d)]


# --- the hull row: apertures cut in the HULL skin ---------------------------
#
# The same face-selection cut as the bulwark's, on the hull loft. Its seams
# are `station_ts` (which carries a station at every hull port edge) by the
# ring points `hull_seam_indices` puts at every hull row's sill and head.


def hull_ring_len(p: FrigateParams) -> int:
    """Points in one closed station ring of the hull loft."""
    return 2 * (p.pts_per_half + len(hull_seam_offsets(p)))


def hull_gunport_bands(p: FrigateParams, deck: int) -> list[list[int]]:
    """Station-interval indices into `station_ts` covered by each port of one
    HULL row. Interval `i` spans `ts[i]..ts[i + 1]`."""
    if gun_deck(p, deck).host != "hull":
        raise ValueError(
            f"gun deck {gun_deck(p, deck).name!r} is not cut in the hull")
    ts = station_ts(p)
    out: list[list[int]] = []
    for fwd, aft in port_edge_ts(p, deck):
        idx = [i for i in range(len(ts) - 1)
               if ts[i] >= fwd - _TS_EPS and ts[i + 1] <= aft + _TS_EPS]
        if not idx:
            raise ValueError(
                f"hull gunport spanning t={fwd:.4f}..{aft:.4f} selects no "
                "band; the hull loft is wrong — do not widen the selection")
        out.append(idx)
    return out


def hull_gunport_boxes(p: FrigateParams, deck: int
                       ) -> list[tuple[float, float, float, float]]:
    """`(y_aft, y_fwd, z_lo, z_hi)` per port of one hull row, z as offsets
    from the SHEER (negative: below it), off the seams the cut lands on."""
    ts = station_ts(p)
    d = gun_deck(p, deck)
    rise = p.tier(d.served_by).rise
    return [(station_y(p, ts[idx[-1] + 1]), station_y(p, ts[idx[0]]),
             rise + d.sill, rise + d.head)
            for idx in hull_gunport_bands(p, deck)]


def all_hull_gunport_boxes(p: FrigateParams) -> list[tuple[int, tuple]]:
    return [(d, box) for d in range(len(p.gun_decks))
            if p.gun_decks[d].host == "hull"
            for box in hull_gunport_boxes(p, d)]


def hull_port_rims(p: FrigateParams) -> list[list[tuple[int, int]]]:
    """Every hull aperture's rim, per aperture per side, as (station index,
    ring index) corners in loop order: sill forward to aft, aft cheek, head
    aft to forward, forward cheek. Vertex index = station * ring_len + ring.
    """
    n = p.pts_per_half + len(hull_seam_offsets(p))
    seams = hull_seam_offsets(p)
    idx = hull_seam_indices(p)
    out = []
    for d in range(len(p.gun_decks)):
        row = p.gun_decks[d]
        if row.host != "hull":
            continue
        rise = p.tier(row.served_by).rise
        k = idx[seams.index(rise + row.sill)]
        for bands in hull_gunport_bands(p, d):
            s0, s1 = bands[0], bands[-1] + 1
            for sill, head in ((n + k, n + k + 1), (n - 1 - k, n - 2 - k)):
                loop = [(s, sill) for s in range(s0, s1 + 1)]
                loop += [(s, head) for s in range(s1, s0 - 1, -1)]
                out.append(loop)
    return out


def hull_port_rim_edges(p: FrigateParams) -> frozenset[frozenset[int]]:
    """The hull apertures' rim edges as vertex-index pairs. They are HARD,
    in both senses, for the same reason as the gunwale: the rim of a hole
    cut in a Catmull-Clark cage is pulled round and open unless creased."""
    ring_len = hull_ring_len(p)
    edges = set()
    for loop in hull_port_rims(p):
        vs = [s * ring_len + i for s, i in loop]
        for a, b in zip(vs, vs[1:] + vs[:1]):
            edges.add(frozenset((a, b)))
    return frozenset(edges)


# Points across the ship on each of the ceiling's two end bulkheads, from
# the lower deck's surface up to the main deck's: `decks._ceiling` builds
# them and `checks` counts their CEILING_BULKHEAD_POINTS - 1 quads an end.
CEILING_BULKHEAD_POINTS = 9


def ceiling_offsets(p: FrigateParams, tier) -> list[float]:
    """Vertical seams of the CEILING over one deck inside the hull, as
    offsets from the sheer: under that deck's planking at its edge, the
    sill and head of every hull row it serves, and the sheer, where the
    ceiling meets the bulwark's inner skin and the gun deck's edge."""
    out = [tier.rise - p.plank_thick]
    for d in hull_gun_decks(p):
        if d.served_by == tier.name:
            out += [tier.rise + d.sill, tier.rise + d.head]
    return sorted(out) + [0.0]


def ceiling_ts(p: FrigateParams, tier) -> list[float]:
    """Stations of the ceiling: the hull loft's, clipped to the deck, plus
    the deck's own ends."""
    ts = [t for t in station_ts(p)
          if tier.t0 + _TS_EPS < t < tier.t1 - _TS_EPS]
    return [tier.t0] + ts + [tier.t1]


def ceiling_half_width(p: FrigateParams, t: float, z: float) -> float:
    """The ceiling's inner face: the hull skin less the side timber."""
    return hull_half_width(p, t, z) - p.bulwark_thick


def hull_tiers(p: FrigateParams) -> tuple:
    """Every deck inside the hull, forward to aft."""
    return tuple(sorted((t for t in p.deck_tiers if t.inside_hull),
                        key=lambda t: t.t0))


def deck_half_beam(p: FrigateParams, t: float) -> float:
    """Half-width of the walking surface, inboard of the bulwark's inner face."""
    _check_t(t)
    sz = sheer(p, t)
    return max(0.0, bulwark_half_width(p, t, sz) - p.bulwark_thick)


def offset_above_sheer(p: FrigateParams, points) -> float:
    """How far a face or an edge stands above the sheer, over its OWN corners.

    The bulwark grid is built at `sheer(t_i) + offset`, so a face's centroid
    sits at `mean(sheer over its own stations) + mean(offset)`. Measuring it
    as `centroid.z - sheer(t_of_y(centroid.y))` instead takes the sheer at an
    INTERPOLATED station, and the sheer is not linear in t: the two differ by
    the curvature of the sheer over one band.

    On the frigate that is well under a millimetre and nothing noticed. On a
    galleon, whose stern sheer rises on a 2.6 exponent, it is 2.9 mm — enough
    to lift a lining face 1.4 mm above its own sill and have the aperture test
    report the port as blocked by the timber that lines it.

    Both ends of this measurement are now the same points.
    """
    pts = list(points)
    z = sum(pt[2] for pt in pts) / len(pts)
    base = sum(sheer(p, t_of_y(p, pt[1])) for pt in pts) / len(pts)
    return z - base


def tier_half_beam(p: FrigateParams, tier, t: float) -> float:
    """Half-width of ONE tier's walking surface at station t.

    A platform that sits inside the main bulwark is measured at the SHEER, as
    the frigate's forecastle and quarterdeck always have been: the bulwark's
    inner face is near enough vertical over the metre or so they stand above
    it, and that is the geometry that shipped.

    A CASTLE deck — one standing above the main rail, which is what
    `DeckTier.stands_above_the_main_rail` means — is a different case and is
    measured at its OWN height, because by then the topsides have tumbled
    properly in. Measuring a poop deck at the sheer would lay a floor wider
    than the wall that is supposed to contain it, and it would come out
    through the castle's side.
    """
    if tier.inside_hull:
        # A deck INSIDE the hull is measured at its own height against the
        # hull skin, less the side timber: below the sheer the topsides are
        # still tumbling out, so the sheer's half-width would leave a gap.
        _check_t(t)
        z = sheer(p, t) + tier.rise
        return max(0.0, hull_half_width(p, t, z) - p.bulwark_thick)
    if not tier.stands_above_the_main_rail():
        return deck_half_beam(p, t)
    _check_t(t)
    z = sheer(p, t) + tier.rise
    return max(0.0, bulwark_half_width(p, t, z) - p.bulwark_thick)


def castle_ts(p: FrigateParams, tier) -> list[float]:
    """Longitudinal stations of one castle wall: the hull grid, clipped, plus its ends."""
    ts = [t for t in station_ts(p) if tier.t0 < t < tier.t1]
    return sorted([tier.t0] + ts + [tier.t1])


def castle_wall_zs(p: FrigateParams, tier, t: float) -> list[float]:
    """Vertical seams of a castle wall at station t, foot to head.

    Three: the waist rail cap it is stepped on, the castle deck it encloses,
    and its own rail cap. Both ends of every one of them are named — the foot
    is main-deck-edge-plus-the-waist-bulwark, the middle is the castle deck
    AT ITS EDGE (where the camber is zero), the head is that plus the castle's
    own rail.
    """
    if not tier.stands_above_the_main_rail():
        raise ValueError(
            f"deck tier {tier.name!r} sits inside the main bulwark and has no "
            "castle wall of its own"
        )
    sz = sheer(p, t)
    foot = castle_foot_z(p, tier, t)
    deck = sz + tier.rise
    if deck <= foot:
        raise ValueError(
            f"castle {tier.name!r} at t={t:.3f} has its deck at {deck:.3f} m, "
            f"not above the rail it stands on at {foot:.3f} m"
        )
    return [foot, deck, deck + tier.bulwark_h]


def castle_foot_z(p: FrigateParams, tier, t: float) -> float:
    """What a castle wall is stepped ON at station t.

    The waist rail cap, unless another castle already stands there — a poop
    over a quarterdeck is stepped on the QUARTERDECK's rail, not on the waist
    rail two decks below, and a wall that ran all the way down would pass
    straight through the deck it is supposed to stand on.
    """
    sz = sheer(p, t)
    foot = sz + p.bulwark_h
    for other in castle_tiers(p):
        if other is tier or other.rise >= tier.rise:
            continue
        if other.t0 - _TS_EPS <= t <= other.t1 + _TS_EPS:
            foot = max(foot, sz + other.rise + other.bulwark_h)
    return foot


def castle_tiers(p: FrigateParams) -> tuple:
    """Every tier that stands above the main rail, forward to aft."""
    return tuple(sorted((t for t in p.deck_tiers if t.stands_above_the_main_rail()),
                        key=lambda t: t.t0))


def camber_z(p: FrigateParams, t: float, x: float) -> float:
    """Deck crown above the deck edge: parabolic, highest on the centreline."""
    _check_t(t)
    dhb = deck_half_beam(p, t)
    if dhb <= 0.0:
        return 0.0
    u = _clamp01(abs(x) / dhb)
    return p.deck_camber * (1.0 - u * u)


def tier_camber_z(p: FrigateParams, tier, t: float, x: float) -> float:
    """Crown above ONE tier's edge. The decks at and above the sheer keep
    `camber_z` verbatim; a deck inside the hull takes the same parabola over
    its OWN half-width, so its camber is zero at its own edge."""
    if not tier.inside_hull:
        return camber_z(p, t, x)
    hb = tier_half_beam(p, tier, t)
    if hb <= 0.0:
        return 0.0
    u = _clamp01(abs(x) / hb)
    return p.deck_camber * (1.0 - u * u)


def tier_deck_z(p: FrigateParams, tier, t: float, x: float) -> float:
    """Height of one tier's walking surface; `deck_z_at` for every tier at
    or above the sheer, verbatim."""
    if not tier.inside_hull:
        return deck_z_at(p, t, x, tier.rise)
    return sheer(p, t) + tier.rise + tier_camber_z(p, tier, t, x)


def deck_z_at(p: FrigateParams, t: float, x: float, rise: float = 0.0) -> float:
    """Height of a walking surface at station t, x metres off the centreline.

    `rise` lifts a platform above the gun deck. The gun deck itself passes 0.0.
    """
    _check_t(t)
    return sheer(p, t) + rise + camber_z(p, t, x)


# --- Task 6: stern castle, transom and gallery ------------------------------
#
# The transom is a panel in the plane y = station_y(1.0). Its columns are given
# in u = x / stern_half_width(z) rather than in metres, so that a column follows
# the transom's tumblehome instead of cutting across it. The two stern chase
# ports complete the 24-gun battery (11 per side plus these two).

_CHASE_U = 0.48          # centre of each stern chase port, in transom u
# Everything else that shaped the stern -- the gallery band, the window
# joinery, the badges, the carving counts -- was fourteen module constants
# here and twelve more in `stern`. They are `shiptype.SternForm` now, on
# `p.stern_form`, because the stern is the ONE feature that most separates a
# galleon from a frigate and none of it is expressible by changing length and
# beam. The frigate's defaults are those constants verbatim.


def hull_half_width(p: FrigateParams, t: float, z: float) -> float:
    """Half-width of the hull skin at station t and height z.

    The inverse view of `station_ring`: the ring answers "where is point i",
    this answers "how wide is the hull at this height". Clamped at the keel and
    at the sheer. Everything that has to sit ON the skin — the gallery, the
    channels, the chainplates, the cannon muzzles — asks this rather than
    re-deriving the ring.
    """
    _check_t(t)
    hb = half_beam(p, t)
    kz = keel_z(p, t)
    sz = sheer(p, t)
    half_width = min(p.keel_half, hb)
    if z <= kz:
        return half_width
    if z >= sz:
        return hb * tumblehome(p, sz, sz)
    if z <= 0.0 and kz < 0.0:
        exp = bilge_exp(p, t)
        q = _clamp01((z - kz) / (0.0 - kz))
        return half_width + (hb - half_width) * (1.0 - (1.0 - q) ** exp) ** (1.0 / exp)
    return hb * tumblehome(p, z, sz)


def skin_half_width(p: FrigateParams, t: float, z: float) -> float:
    """Half-width of the ship's SIDE at station t and height z, hull or bulwark.

    `hull_half_width` clamps at the sheer, because below it the hull is all
    there is. Above the sheer the topsides keep tumbling in and the bulwark
    curve is what answers. `stern_half_width` is this function at t = 1.0 and
    has been since Task 6; a galleon's upper quarter badge is the first thing
    to need it anywhere else, because it stands against a castle wall 2.9 m
    above the sheer where the frigate's badge stands against the hull.
    """
    return (hull_half_width(p, t, z) if z <= sheer(p, t)
            else bulwark_half_width(p, t, z))


def stern_half_width(p: FrigateParams, z: float) -> float:
    """Half-width of the stern at height z, hull below the sheer, bulwark above.

    One curve for the whole transom. It agrees with `hull_half_width(p, 1.0, z)`
    below the sheer and with `bulwark_half_width(p, 1.0, z)` above it, and the
    two meet exactly at the sheer because both reduce to
    `half_beam * tumblehome(p, sz, sz)` there.
    """
    sz = sheer(p, 1.0)
    if z <= sz:
        return hull_half_width(p, 1.0, z)
    return bulwark_half_width(p, 1.0, z)


def chase_floor_z(p: FrigateParams) -> float:
    """DECK AT THE GUN: the stern chasers' carriage floor, which is where
    `_chase_gun` stands them and what a "deck_at_gun" chase sill is
    measured over. On a ship with a chase platform that floor IS the
    platform's top (`chase_platform_z`): the chasers stand ON it. Without
    one it is Deck_Main at their breech station."""
    if p.stern_form.chase_platform is not None:
        return chase_platform_z(p)
    return _deck_at_the_chasers(p)


def chase_platform_z(p: FrigateParams) -> float:
    """PLATFORM TOP. R11: Deck_Main's LEVEL carried aft at the chasers'
    station -- Deck_Main's surface (rise 0, camber at the chaser's own x)
    at their BREECH station -- level from Deck_Main's end to the transom.
    Raises on a ship that builds no platform."""
    if p.stern_form.chase_platform is None:
        raise ValueError(f"{p.collection} builds no chase platform")
    return _deck_at_the_chasers(p)


def _deck_at_the_chasers(p: FrigateParams) -> float:
    """Deck_Main's surface under the stern chasers at their breech station.

    The chaser stands at x = u * (transom half-width at its port's centre),
    and on the "deck_at_gun" datum the port's centre is measured from this
    very floor, so the two are solved together: a fixed point, converged to
    float noise (the camber barely changes over the few centimetres the
    tumblehome moves the gun)."""
    d = gun_deck(p, chase_deck_index(p))
    sf = p.stern_form
    y = station_y(p, 1.0) - GUN_MUZZLE_OUT + GUN_LENGTH
    t = t_of_y(p, y)
    z = sheer(p, 1.0) + d.sill + d.height / 2.0
    floor = deck_z_at(p, t, _CHASE_U * stern_half_width(p, z), 0.0)
    for _ in range(50):
        if sf.chase_sill_datum == "sheer":
            break
        z = floor + sf.chase_sill + d.height / 2.0
        nxt = deck_z_at(p, t, _CHASE_U * stern_half_width(p, z), 0.0)
        if abs(nxt - floor) < 1e-12:
            break
        floor = nxt
    return floor


def chase_sill_z(p: FrigateParams) -> float:
    """World height of the stern chase ports' SILL, on the ship's own
    `stern_form.chase_sill_datum`."""
    d = gun_deck(p, chase_deck_index(p))
    if p.stern_form.chase_sill_datum == "sheer":
        return sheer(p, 1.0) + d.sill
    return chase_floor_z(p) + p.stern_form.chase_sill


def chase_center_z(p: FrigateParams) -> float:
    """World height of the stern chase ports' centre."""
    d = gun_deck(p, chase_deck_index(p))
    if p.stern_form.chase_sill_datum == "sheer":
        return sheer(p, 1.0) + d.sill + d.height / 2.0
    return chase_sill_z(p) + d.height / 2.0


def chase_head_z(p: FrigateParams) -> float:
    """World height of the stern chase ports' HEAD."""
    d = gun_deck(p, chase_deck_index(p))
    if p.stern_form.chase_sill_datum == "sheer":
        return sheer(p, 1.0) + d.head
    return chase_sill_z(p) + d.height


def chase_u_edges(p: FrigateParams) -> list[tuple[float, float]]:
    """Port and starboard stern chase ports, as (u_port_side, u_stbd_side) pairs.

    Width is set at the port's mid-height so that the aperture measures exactly
    `port_w` where a gun would run out through it; above and below that it tapers
    a few centimetres with the transom's tumblehome, which is what a real port
    cut into a tumbled transom does.
    """
    if not p.chase_ports:
        return []
    d = gun_deck(p, chase_deck_index(p))
    hw = stern_half_width(p, chase_center_z(p))
    du = (d.width / 2.0) / hw
    return [(-_CHASE_U - du, -_CHASE_U + du), (_CHASE_U - du, _CHASE_U + du)]


def transom_us(p: FrigateParams) -> list[float]:
    """Column seams of the transom panel, in u. Edges, centreline, chase ports."""
    p.validate()
    us = [-1.0, 0.0, 1.0]
    for edges in chase_u_edges(p):
        for u in edges:
            if all(abs(u - existing) > _TS_EPS for existing in us):
                us.append(u)
    return sorted(us)


def transom_row_offsets(p: FrigateParams) -> list[float]:
    """Vertical seams of the transom panel, as offsets above sheer(1.0).

    On the "sheer" datum, the same rows as the bulwark, so the chase port
    sill and head line up with the broadside ports and the rail cap runs
    round the stern without a step. On "deck_at_gun" the chase ports stand
    where their own guns are, so the panel's rows are its own: sheer, chase
    sill, chase head, rail cap -- the cap still level with the bulwark's.
    """
    if p.stern_form.chase_sill_datum == "sheer":
        return bulwark_row_offsets(p)
    sz = sheer(p, 1.0)
    out = [0.0, chase_sill_z(p) - sz, chase_head_z(p) - sz, p.bulwark_h]
    if not all(a < b for a, b in zip(out, out[1:])):
        raise ValueError(
            f"the chase ports at {out[1]:.3f}..{out[2]:.3f} m over the stern "
            f"sheer do not fit the transom panel 0..{p.bulwark_h} m")
    return out


def transom_bands(p: FrigateParams) -> list[list[int]]:
    """Band indices into `transom_us` covered by each chase port."""
    us = transom_us(p)
    out: list[list[int]] = []
    for u0, u1 in chase_u_edges(p):
        idx = [
            i
            for i in range(len(us) - 1)
            if us[i] >= u0 - _TS_EPS and us[i + 1] <= u1 + _TS_EPS
        ]
        if not idx:
            raise ValueError(
                f"stern chase port spanning u={u0:.4f}..{u1:.4f} selects no band; "
                "the transom grid is wrong — do not widen the selection"
            )
        out.append(idx)
    return out


def transom_tiers(p: FrigateParams) -> list[tuple[float, float]]:
    """(foot, head) of every panel the transom has to close, lowest first.

    The frigate's stern is ONE panel: the waist bulwark, stern sheer to rail
    cap. A galleon's is a flight of them, because every castle deck that runs
    aft to station 1.0 ends in a transom of its own, and a castle wall built
    by `decks` is closed forward at its break and OPEN aft. Left open, the
    galleon's quarterdeck and poop are two dark slots over the taffrail --
    exactly the defect Task 6 fixed at the waist and nobody had to fix again
    until a ship arrived with castles.

    Each panel's foot is what its wall is stepped on, which is `castle_foot_z`
    and not the deck below it: a poop over a quarterdeck is stepped on the
    QUARTERDECK's rail, so the panels stack without a gap and without an
    overlap.
    """
    sz = sheer(p, 1.0)
    out = [(sz, sz + p.bulwark_h)]
    for tier in castle_tiers(p):
        if tier.t1 < 1.0 - _TS_EPS:
            continue
        out.append((castle_foot_z(p, tier, 1.0), sz + tier.rise + tier.bulwark_h))
    return sorted(out)


def taffrail_z(p: FrigateParams) -> float:
    """WATERLINE to the TOPMOST RAIL CAP AT THE TAFFRAIL.

    The frigate's is her waist bulwark cap, 5.20 m, 13.7% of her own length.
    The galleon's is its POOP rail cap, 11.80 m, 34.7% of its own. That ratio
    is the single number that says which ship this is.
    """
    return transom_tiers(p)[-1][1]


def gallery_band(p: FrigateParams) -> tuple[float, float]:
    """World Z span of the LOWEST stern gallery, (low, high).

    Measured down from the stern sheer, not up from the waterline, so the band
    keeps its relationship to the rail if the sheer is re-proportioned.
    """
    sz = sheer(p, 1.0)
    return (sz - p.stern_form.gallery_drop, sz - p.stern_form.gallery_head)


def gallery_tiers(p: FrigateParams) -> list[tuple[float, float, int]]:
    """(foot, head, lights) of every window band on the stern, lowest first.

    One on a frigate -- the great cabin's stern lights, under her own sheer.
    Two on a galleon: that one, and the coach's under the poop, standing in
    the quarterdeck castle's own transom panel. A flush-decked hull has no
    transom above its sheer to put a second band IN, which is why one was all
    the frigate could ever have had.
    """
    sz = sheer(p, 1.0)
    out = [(*gallery_band(p), p.gallery_windows)]
    for tier in p.stern_form.upper_galleries:
        out.append((sz + tier.foot, sz + tier.head, tier.windows))
    return out


def gallery_lowest(p: FrigateParams) -> float:
    """The bottom of the lowest timber of the stern gallery: the dentil course.

    `gallery_band(p)[0]` is where the gallery WALL starts; the dentils hang
    `stern_form.dentil_drop` below it, so anything passing under the gallery --
    the rudder head is the only such thing -- measures against this and not
    against the band.
    """
    return gallery_band(p)[0] - p.stern_form.dentil_drop


def gallery_half_width(p: FrigateParams, z: float) -> float:
    """Half-width of the gallery wall at height z: the transom, less a margin.

    `stern_half_width` and not `hull_half_width`, because a galleon's upper
    gallery stands ABOVE the stern sheer, where the hull curve clamps and the
    bulwark curve keeps tumbling. The two agree exactly at and below the
    sheer, so the frigate's one gallery does not move.
    """
    return max(0.0, stern_half_width(p, z) - p.stern_form.gallery_margin)


def gallery_window_rects(p: FrigateParams, tier: int = 0
                         ) -> list[tuple[float, float, float, float]]:
    """Per window of ONE band, (x0, x1, z0, z1), port to starboard.

    The windows are laid out at the narrowest height of the band — the head —
    so that widening the wall lower down can never push a window outside the
    hull. Mullions are equal, including the two at the ends.
    """
    sf = p.stern_form
    z_lo, z_hi, n = gallery_tiers(p)[tier]
    w_lo, w_hi = z_lo + sf.window_inset_z, z_hi - sf.window_inset_z
    hw = gallery_half_width(p, z_hi)
    width = (2.0 * hw - (n + 1) * sf.window_mullion) / n
    if width <= 0.0:
        raise ValueError(
            f"{n} windows plus {n + 1} mullions do not fit in {2 * hw:.2f} m "
            f"of transom at gallery tier {tier}"
        )
    out = []
    for i in range(n):
        x0 = -hw + sf.window_mullion + i * (width + sf.window_mullion)
        out.append((x0, x0 + width, w_lo, w_hi))
    return out


def all_gallery_window_rects(p: FrigateParams) -> list[tuple[int, tuple]]:
    """(tier index, rect) for every light on the stern. The whole-band form."""
    return [(i, r) for i in range(len(gallery_tiers(p)))
            for r in gallery_window_rects(p, i)]


# --- Task 7: mast stations, channels, chainplates, open rail ----------------
#
# Mast stations are measured off `La-penelope.webp` with the scale fixed by two
# NAMED landmarks: the stem at rail level (x=392 px) to the taffrail (x=1062 px)
# is 670 px for 38.0 m, i.e. 17.63 px/m. Mast feet read x=515, 763 and 929 px.
#
# Task 8 reads these same stations. They live here, not in `masts`, because the
# channels have to know where the masts are a task before the masts exist.

# Every per-mast NUMBER used to live in a dict keyed by "fore"/"main"/"mizzen"
# here — MAST_TS, CHANNEL_LEN, CHAINPLATES, MAST_TRUCK_FRAC, MAST_RAKE_DEG,
# MAST_RADIUS, TOP_SPAN, YARD_MAST_SCALE, eight of them. Eight dicts that all
# had to agree on the same three keys IS a mast list, badly spelled, and it
# could not be two masts or four. They are now fields on `shiptype.Mast` and
# the ship carries its own list in `p.rig`. The accessors below are all that
# reads them.

# TWENTY MORE CONSTANTS, all of the open rail, the channel and the chainplate,
# are `shiptype.RailForm` on `p.rail_form` now. The two that carry the whole
# difference between a frigate and a galleon are the CHANNEL's thickness and
# the CHAINPLATE's drop, and both are forced by the BATTERY: the plate has to
# clear the uppermost row's head and the strap's foot has to land below the
# LOWEST row's sill. One row and two rows ask that the same way and get
# different answers. `RailForm.clears_battery` is the question, stated once.
#
# The whole channel has to fit between the gunport head and the rail cap. At
# DROP 0.15 with THICK 0.16 the frigate's plate UNDERSIDE landed 10 mm BELOW
# the port head — the top cleared, the bottom did not. Name both edges of a
# plate, not just the one the formula returns.
#
# The Gardiner sheer draughts (Flora, Alcmene, Lively) all show the forecastle
# and quarterdeck rails as a top rail with a middle rail on turned stanchions;
# a single top rail is the thing our model was missing, not an extra one it
# would be gaining.


def rail_mid_z(p: FrigateParams, t: float) -> float:
    """Centre height of the middle rail at station t.

    Measured between two NAMED landmarks that both move with the sheer — the
    bulwark cap under it and the underside of the top rail over it — so the
    middle rail follows the top rail's sweep instead of running level under a
    rail that does not.
    """
    _check_t(t)
    cap = sheer(p, t) + p.bulwark_h
    under = rail_top_z(p, t) - p.rail_form.rail_t
    return cap + (under - cap) * p.rail_form.mid_frac


# --- canvas -----------------------------------------------------------------
# Grid resolution of one sail, and of the flag. They live here and not in
# `sails` / `dressing` because those two modules reach for Blender at module
# scope, and the arithmetic that governs these four numbers is spec section 5's
# triangle budget, which is under plain pytest. At 13x9 the nine sails plus the
# flag drew 1,794 triangles of a 5,500 line -- 33%, and `check_budget` indicted
# it.
SAIL_NU = 19   # grid columns, across the sail
SAIL_NV = 13   # grid rows, foot to head
FLAG_NU = 11   # grid columns, luff to fly
FLAG_NV = 5    # grid rows, head to foot


def mast_names(p: FrigateParams) -> tuple[str, ...]:
    """This ship's masts, forward to aft. Two for a schooner, three for a frigate."""
    return p.rig.mast_names()


def mast_spec(p: FrigateParams, name: str):
    """One mast's whole specification. Raises on an unknown name.

    This is the single door every per-mast number comes through, so a ship that
    does not have a mizzen says so once, loudly, instead of raising a bare
    KeyError from whichever of eight dicts was asked first.
    """
    return p.rig.mast(name)


def mast_t(p: FrigateParams, name: str) -> float:
    """Station of a mast. Raises on an unknown name rather than defaulting."""
    return mast_spec(p, name).t


def mast_radius(p: FrigateParams, name: str) -> float:
    """Mast radius at the partners."""
    return mast_spec(p, name).radius


def mast_rake_deg(p: FrigateParams, name: str) -> float:
    """How far this mast leans aft of vertical."""
    return mast_spec(p, name).rake_deg


def top_span(p: FrigateParams, name: str) -> float:
    """Fighting top, athwartships, tip to tip. 0.0 means this mast carries none."""
    return mast_spec(p, name).top_span


def channel_length(p: FrigateParams, name: str) -> float:
    return mast_spec(p, name).channel_len


def chainplate_count(p: FrigateParams, name: str) -> int:
    return mast_spec(p, name).chainplates


def tops_on(p: FrigateParams) -> tuple[str, ...]:
    """The masts that carry a fighting top, forward to aft.

    A schooner's masts carry none — there is no yard to work from — and a pass
    that built a platform on every mast would put one on a bare pole.
    """
    return p.rig.tops()


def square_sails_on(p: FrigateParams, name: str) -> tuple:
    """The square sails one mast sets, lowest tier first. Empty for a schooner."""
    from . import shiptype as _st
    return tuple(sorted(
        (sl for sl in mast_spec(p, name).sails if sl.kind is _st.SailKind.SQUARE),
        key=lambda sl: sl.tier))


def yard_index(p: FrigateParams, name: str, tier: int) -> int:
    """Which of the mast's YARDS (`yard_specs`, one per square sail, lowest
    first) the square sail at `tier` is bent to.

    On a square-rigged mast the square sails ARE tiers 0, 1, 2, so this is
    the tier itself and nothing on the frigate moves. The sloop's flying
    topsail is tier 2 of her mast, over the gaff and the gaff topsail, and
    her one yard: index 0."""
    for i, sail in enumerate(square_sails_on(p, name)):
        if sail.tier == tier:
            return i
    raise ValueError(f"mast {name!r} sets no square sail at tier {tier}")


def yard_plan_of(p: FrigateParams, name: str, tier: int):
    """The `shiptype.YardPlan` the square sail at `tier` is set by, or None
    on a mast that takes its yards from the square rig's tier tables."""
    plan = mast_spec(p, name).yard_plan
    return None if plan is None else plan[yard_index(p, name, tier)]


def channel_host(p: FrigateParams, name: str | None):
    """The CASTLE tier whose wall mast `name`'s channel hangs on, or None
    for the waist bulwark.

    `RailForm.castle_channels` is the data; empty, as on the frigate, every
    channel is on the bulwark. A galleon's mizzen channel sits high on the
    quarterdeck castle's side (the maintainer's third ruling, B), so that its
    shrouds reach the masthead clear of the castle decks.
    """
    if name is None:
        return None
    walls = {m: tier for m, tier, _drop in p.rail_form.castle_channels}
    if name not in walls:
        return None
    mast_spec(p, name)
    tier = p.tier(walls[name])
    if not tier.stands_above_the_main_rail():
        raise ValueError(
            f"the {name} channel is put on {tier.name!r}, which stands "
            "inside the main bulwark and has no castle wall of its own")
    return tier


def channel_cap_z(p: FrigateParams, t: float, name: str | None = None
                  ) -> float:
    """The RAIL CAP a channel hangs under at station t: the waist bulwark's
    (SHEER + `bulwark_h`) or, for a channel on a castle wall, that
    castle's own (CASTLE DECK EDGE + its `bulwark_h`, the head seam
    `castle_wall_zs` builds the wall to)."""
    host = channel_host(p, name)
    if host is None:
        return sheer(p, t) + p.bulwark_h
    return castle_wall_zs(p, host, t)[-1]


def chainplate_drop_of(p: FrigateParams, name: str | None = None) -> float:
    """CHANNEL EDGE to STRAP FOOT for one mast's chainplates.

    `RailForm.chainplate_drop` for a channel on the bulwark, verbatim; a
    channel on a castle wall carries its own in `castle_channels`, because
    its straps run down the castle wall and the bulwark to the hull.
    """
    if channel_host(p, name) is None:
        return p.rail_form.chainplate_drop
    return {m: d for m, _tier, d in p.rail_form.castle_channels}[name]


def channel_z(p: FrigateParams, t: float, name: str | None = None) -> float:
    """Top surface of the channel at station t.

    It rides just under the rail cap. The reference puts its channels at about
    3.46 m above the waterline, roughly mid-topside — but that is a hull whose
    gunports pierce the side low down. Ours sit high in the bulwark (the Task 4
    deviation the maintainer ratified), and a channel at the reference height would lap
    straight over them, so it goes above the port head instead. This is a
    consequence of that ruling, not a free choice.
    """
    _check_t(t)
    return channel_cap_z(p, t, name) - p.rail_form.channel_drop


def channel_span(p: FrigateParams, name: str) -> tuple[float, float]:
    """(forward station, aft station) of a channel, biased aft of its own mast.

    Shrouds lead aft from the masthead, so a channel is not centred on its mast.
    The reference's main channel spans x=738..806 px about a mast at 763, i.e.
    0.37 of its length forward; `_CHANNEL_FWD` is that fraction.
    """
    y = station_y(p, mast_t(p, name))
    length = channel_length(p, name)
    fwd = p.rail_form.channel_fwd
    return (
        t_of_y(p, y + fwd * length),
        t_of_y(p, y - (1.0 - fwd) * length),
    )


def channel_bite(p: FrigateParams) -> float:
    """How far a swept channel plate NECESSARILY bites into the bulwark.

    `rails.build_channels` takes the plate's inner edge at the plate's TOP at
    each station, and the bulwark goes on widening below that, so the bottom
    inner corner stands inside the timber by the bulwark's own tumble over
    the plate's own thickness. That is the shape of a flat plate laid on a
    curved side, not slop, and `check_directions` has to be told the figure
    rather than given a number that happened to cover the frigate.

    The frigate's bulwark tumbles 0.06 per metre under a 0.16 m plate; the
    galleon's tumbles 0.10 under a 0.20 m plate on a side half a metre wider,
    which is 2.6x the bite. Both are measured here, at the widest station any
    channel covers.
    """
    worst = 0.0
    for name in mast_names(p):
        t0, t1 = channel_span(p, name)
        for i in range(9):
            t = t0 + (t1 - t0) * i / 8.0
            z_top = channel_z(p, t, name)
            z_bot = z_top - p.rail_form.channel_thick
            worst = max(worst, bulwark_half_width(p, t, z_bot)
                        - bulwark_half_width(p, t, z_top))
    return worst


def channel_outer(p: FrigateParams, t: float, name: str | None = None
                  ) -> float:
    """Outboard half-width of the channel plate at station t. A castle
    wall is the topsides carried up (`decks._castle_wall` lays it on
    `bulwark_half_width`), so one surface serves both."""
    z = channel_z(p, t, name)
    return bulwark_half_width(p, t, z) + p.rail_form.channel_projection


def _port_y_spans(p: FrigateParams) -> list[tuple[float, float]]:
    """Fore-and-aft extent of every broadside aperture, EVERY ROW, as y intervals.

    A chainplate falls past every row of ports there is, not just the top one,
    so this walks the whole battery.
    """
    return [
        (station_y(p, t) - gun_deck(p, d).width / 2.0,
         station_y(p, t) + gun_deck(p, d).width / 2.0)
        for d, t in all_gunport_ts(p)
    ]


def _strap_blocked_spans(p: FrigateParams, name: str | None = None
                         ) -> list[tuple[float, float]]:
    """Head-y values a chainplate may NOT take, because the strap would cross a port.

    A strap falls CHAINPLATE_DROP metres while raking aft, so it sweeps
    `rake * drop + strap width` of y on the way down; placing by head alone put
    one squarely across the foremost port even after the head itself was clear.
    The span is widened on the aft side by the rake and on both sides by the
    strap's half-width plus a margin.
    """
    r = p.rail_form
    back = r.chainplate_rake * chainplate_drop_of(p, name)
    return [
        (lo - r.strap_clear - r.strap_half_w,
         hi + r.strap_clear + r.strap_half_w + back)
        for lo, hi in _port_y_spans(p)
    ]


def _free_spans(p: FrigateParams, y_aft: float, y_fwd: float,
                name: str | None = None) -> list[tuple[float, float]]:
    """The channel's y-interval with every blocked span cut out, forward to aft."""
    free = [(y_aft, y_fwd)]
    for b0, b1 in _strap_blocked_spans(p, name):
        cut = []
        for a0, a1 in free:
            if b1 <= a0 or b0 >= a1:
                cut.append((a0, a1))
                continue
            if a0 < b0:
                cut.append((a0, b0))
            if b1 < a1:
                cut.append((b1, a1))
        free = cut
    return sorted((a for a in free if a[1] > a[0]), key=lambda s: -s[1])


def _allocate(n: int, lengths: list[float], min_gap: float) -> list[int]:
    """Hand n straps to the free spans, longest-remaining-room first.

    Each span is capped at what `min_gap` allows, so a short span can never
    take two straps that end up stacked on top of each other.
    """
    caps = [max(1, int(length / min_gap) + 1) for length in lengths]
    counts = [0] * len(lengths)
    for _ in range(n):
        best = None
        for i, length in enumerate(lengths):
            if counts[i] >= caps[i]:
                continue
            if best is None or length / (counts[i] + 1) > lengths[best] / (counts[best] + 1):
                best = i
        if best is None:
            raise ValueError(
                f"{n} chainplates do not fit between the gunports on this channel; "
                "move the ports or cut the shroud count, do not stack the straps"
            )
        counts[best] += 1
    return counts


def chainplate_segments(p: FrigateParams, name: str) -> list[tuple[Point, Point]]:
    """Per chainplate, (head on the channel's outer edge, foot on the hull skin).

    Starboard only; the port side mirrors in x. The foot is pinned ONTO the skin
    by asking `hull_half_width` for the half-width at the foot's own station and
    height, so a strap can never float off a tumbling topside.
    """
    r = p.rail_form
    t_fwd, t_aft = channel_span(p, name)
    y_fwd = station_y(p, t_fwd) - r.chainplate_margin
    y_aft = station_y(p, t_aft) + r.chainplate_margin
    spans = _free_spans(p, y_aft, y_fwd, name)
    counts = _allocate(chainplate_count(p, name), [hi - lo for lo, hi in spans],
                       r.strap_min_gap)
    drop = chainplate_drop_of(p, name)
    out = []
    for (lo, hi), k in zip(spans, counts):
        for i in range(k):
            y = (lo + hi) / 2.0 if k == 1 else hi - (hi - lo) * i / (k - 1)
            t = t_of_y(p, y)
            z = channel_z(p, t, name)
            head = (channel_outer(p, t, name), y, z)
            y_foot = y - r.chainplate_rake * drop
            z_foot = z - drop
            t_foot = t_of_y(p, y_foot)
            out.append((head, (hull_half_width(p, t_foot, z_foot), y_foot, z_foot)))
    return out


# --- where a strap foot may stop: above the hull row, clear of its lids ----
#
# The maintainer's third ruling, A, and R11: the drop is the LARGEST, to the cm,
# whose STRAP FOOT lands `strap_clear` ABOVE the hull row's PORT HEAD and
# whose straps clear every hull-row lid's swept overhang, shut and open, by
# the same `strap_clear`. One margin, named once: it is already the margin
# a strap keeps from a port's cheeks fore and aft, and a hull lid is hinged
# ON the port head, so the head and the top of the lid's sweep are one
# line and one clearance answers both.


def hull_row_runs(p: FrigateParams) -> list[tuple[int, float, float]]:
    """(deck, y aft, y fwd) per HULL row: its LAST PORT'S AFT EDGE to its
    FIRST PORT'S FORE EDGE. A foot outside a run is beside no port."""
    out = []
    for d in range(len(p.gun_decks)):
        if p.gun_decks[d].host != "hull":
            continue
        boxes = hull_gunport_boxes(p, d)
        out.append((d, min(b[0] for b in boxes), max(b[1] for b in boxes)))
    return out


def strap_foot_over_head(p: FrigateParams, name: str) -> list:
    """Per chainplate of mast `name`, STRAP FOOT minus the HULL ROW'S PORT
    HEAD LINE (the serving deck's edge plus the row's head, which follows
    the sheer as the cut does), the least at the foot's two corners, each
    read at its own station `strap_w / 2` fore and aft of the foot. None
    for a foot outside every hull row's run. Positive: above the head."""
    runs = hull_row_runs(p)
    half = p.rail_form.strap_w / 2.0
    out = []
    for _head, foot in chainplate_segments(p, name):
        best = None
        for d, y_aft, y_fwd in runs:
            if not y_aft <= foot[1] <= y_fwd:
                continue
            for y in (foot[1] - half, foot[1] + half):
                t = t_of_y(p, y)
                line = row_floor_z(p, t, d) + gun_deck(p, d).head
                over = foot[2] - line
                best = over if best is None else min(best, over)
        out.append(best)
    return out


def _sweep_gap(px: float, pz: float, a0: float, a1: float) -> float:
    """POINT (OUT, z from the hinge) to a lid's SWEPT FACE: the sector of
    radius `LID_H` between angles a0 (shut) and a1 (open), each measured
    from straight down toward outboard. The lid's thickness lies on the
    gun's side of that face, inboard of it, so the face is its outer
    reach."""
    r = math.hypot(px, pz)
    ang = math.atan2(px, -pz)
    if a0 <= ang <= a1:
        return max(0.0, r - LID_H)
    best = math.inf
    for a in (a0, a1):
        ux, uz = math.sin(a), -math.cos(a)
        s = min(max(px * ux + pz * uz, 0.0), LID_H)
        best = min(best, math.hypot(px - s * ux, pz - s * uz))
    return best


STRAP_SAMPLES = 200   # points along a strap's inner face, head to foot


def strap_lid_clearance(p: FrigateParams, name: str, hosts=("hull",)
                        ) -> list[float]:
    """Per chainplate of mast `name`, the least distance from its STRAP
    (inner face, edge to edge fore and aft) to any lid's SWEPT OVERHANG,
    shut through open, over the lids of the rows whose host is in
    `hosts`. Starboard; the port side mirrors. Measured across the ship in
    the lid's own swing plane and combined with the fore-and-aft gap from
    STRAP EDGE to LID EDGE, so a strap beside a lid but clear of it
    counts its distance."""
    r = p.rail_form
    lids = [lid for lid in lid_placements(p)
            if lid["kind"] == "broadside" and lid["hinge"][0] > 0.0
            and gun_deck(p, lid["deck"]).host in hosts]
    out = []
    for head, foot in chainplate_segments(p, name):
        x0, x1 = head[0], foot[0] - r.strap_bed
        best = math.inf
        for lid in lids:
            hx, hy, hz = lid["hinge"]
            a0 = math.radians(lid.get("lean_deg", 0.0))
            a1 = a0 + math.radians(lid["open_deg"])
            for i in range(STRAP_SAMPLES + 1):
                u = i / STRAP_SAMPLES
                y = head[1] + (foot[1] - head[1]) * u
                dy = max(abs(y - hy) - LID_W / 2.0 - r.strap_w / 2.0, 0.0)
                if dy >= best:
                    continue
                d = _sweep_gap(x0 + (x1 - x0) * u - hx,
                               head[2] + (foot[2] - head[2]) * u - hz,
                               a0, a1)
                best = min(best, math.hypot(dy, d))
        out.append(best)
    return out


def drop_clears_hull_row(p: FrigateParams, name: str) -> bool:
    """Does every strap of mast `name` stop `strap_clear` above the hull
    row's head line and clear every hull-row lid's sweep by as much?"""
    clear = p.rail_form.strap_clear
    try:
        heads = [o for o in strap_foot_over_head(p, name) if o is not None]
    except ValueError:      # the straps cannot even be laid between ports
        return False
    return (all(o >= clear for o in heads)
            and all(g >= clear for g in strap_lid_clearance(p, name)))


def with_chainplate_drop(p: FrigateParams, name: str, drop: float):
    """`p` with mast `name`'s chainplate drop set to `drop`: the bulwark
    channels' shared `chainplate_drop`, or this castle channel's own."""
    import dataclasses
    r = p.rail_form
    if channel_host(p, name) is None:
        r = dataclasses.replace(r, chainplate_drop=drop)
    else:
        r = dataclasses.replace(r, castle_channels=tuple(
            (m, tier, drop if m == name else d)
            for m, tier, d in r.castle_channels))
    return dataclasses.replace(p, rail_form=r)


def largest_chainplate_drop(p: FrigateParams, name: str) -> float:
    """The LARGEST drop, to the cm, from mast `name`'s CHANNEL EDGE to its
    STRAP FOOT that `drop_clears_hull_row` passes (R11: the maintainer's "about
    2.20" derived, not typed): the end of the FIRST passing run from
    0.01 m. A ship with no hull row has no head for a foot to stop above,
    and raises.

    The rule is not monotone over every drop: the galleon's mizzen passes
    to 4.62, fails from 4.63, and passes again from 8.69 (a foot that far
    down is under the row altogether). So the upper bound is FOUND, not
    typed: doubled from the passing lower bound until it fails, and only
    then bisected. A typed 10 m bound passed on the mizzen and the
    bisection's answer was right by the luck of its path."""
    if not hull_row_runs(p):
        raise ValueError(
            "this ship cuts no row of ports in her hull; a strap foot has no "
            "hull-row head to stop above")

    def clears(cm: int) -> bool:
        return drop_clears_hull_row(with_chainplate_drop(p, name, cm / 100),
                                    name)

    lo = 1                       # cm; the 0.01 m strap is assumed clear
    if not clears(lo):
        raise ValueError(f"no drop clears the hull row on the {name} channel")
    hi = 2
    while clears(hi):
        lo, hi = hi, 2 * hi
        if hi > 100_000:
            raise ValueError(f"every drop clears the {name} channel's row")
    while hi - lo > 1:
        mid = (lo + hi) // 2
        trial = with_chainplate_drop(p, name, mid / 100)
        if drop_clears_hull_row(trial, name):
            lo = mid
        else:
            hi = mid
    return lo / 100


def forecastle_rail_t(p: FrigateParams) -> float:
    """The forwardmost station the ship's own rail reaches, open rail or not.

    The upper head rail springs off it, and it has to exist on a ship that
    builds no open rail at all: a galleon's platforms are CASTLES with
    bulwarks of their own, so `rail_runs` is empty there, and
    `rail_runs(p)[0][0]` would have raised an IndexError on the one ship the
    head module was written for. The value is `end_in` on both ships, so
    nothing moves; what changes is that it is no longer read out of a list
    that is allowed to be empty.
    """
    return p.rail_form.end_in


def railed_tiers(p: FrigateParams) -> tuple:
    """The raised platforms that need an OPEN RAIL, forward to aft.

    A platform that tucks under the main bulwark has nothing round its edge
    but the cap beside it, which over a frigate's quarterdeck stands 0.18 m
    proud — a trip hazard — so that is where the open rail goes. A CASTLE deck
    already carries a bulwark of its own, built by `decks._castle_wall` with
    its own cap, and railing it again would stand a second rail on top of the
    first. A galleon has three raised decks and all three are castles, so it
    builds no open rail anywhere, and that is a fact about the ship rather
    than a pass that quietly did nothing.
    """
    return tuple(t for t in p.raised_tiers()
                 if not t.stands_above_the_main_rail())


def rail_runs(p: FrigateParams) -> list[tuple[float, float]]:
    """Stations spanned by the open rail, one run per platform that needs one.

    Amidships the bulwark cap already stands 1.6 m over the frigate's gun
    deck, which is a rail; over her quarterdeck it stands 0.40 m, which is
    not. The rail goes where the platform is and the cap is not.
    """
    p.validate()
    # The inner end of each run is pulled in by the end stanchion's own half-width.
    # `rail_top_z` steps 0.30 m where a platform ends, and a stanchion placed ON
    # that edge reaches 45 mm past it — its forward face then stands 0.30 m above
    # the rail it belongs to. The timber has width; the run has to allow for it.
    r = p.rail_form
    pad = (r.stanchion_w / 2.0) / p.loa
    out = []
    for tier in railed_tiers(p):
        t0 = r.end_in if tier.t0 <= 0.0 else tier.t0 + pad
        t1 = 1.0 - r.end_in if tier.t1 >= 1.0 else tier.t1 - pad
        out.append((t0, t1))
    return out


def platform_runs(p: FrigateParams) -> list[tuple[float, float, float]]:
    """(t0, t1, rise) of EVERY raised platform. Not the same spans as `rail_runs`.

    The platform is what sets the rail's height; the rail run is only where the
    rail stands, inset from the ship's ends for appearance. Keying the rise off
    the RAIL run made `rail_top_z` step 0.30 m at the run's own end, because the
    end stanchion's timber reaches 45 mm past the centreline it was placed on.

    EVERY raised tier, not the frigate's two: a galleon has a POOP, and a
    poop missing from this list is a deck whose own rail height is read off
    the deck below it.
    """
    return [(t.t0, t.t1, t.rise) for t in p.raised_tiers()]


# 1e-6 of t is 38 um of hull. It absorbs exactly one thing: Blender stores mesh
# vertex coordinates as float32, so a vertex emitted at y = -3.8 reads back as
# -3.799999952316284 and lands 1.25e-9 of t outside a closed interval that ends
# there. A float64 epsilon (1e-9) was too small to cover float32 storage.
_RUN_EPS = 1e-6


def _rail_tier_at(p: FrigateParams, t: float):
    """The UPPERMOST platform over station t, or None where only the gun deck runs.

    HIGHEST rise, not the first run that contains t. PLATFORM RUNS OVERLAP:
    the galleon's Deck_Quarter spans t 0.54..1.0 and its Deck_Poop spans
    0.81..1.0, so both contain every station abaft the poop break and a
    first-match reader answered with the lower of the two over the whole poop.
    Measured: at the TAFFRAIL (t=1.0), with sheer 5.800 m above the waterline,
    the first match gave Deck_Quarter and `rail_top_z` 10.200 m, where the
    poop's own cap — the one `stern` built and the ledger records — stands at
    5.800 + 5.000 + 1.000 = 11.800. The reader was 1.600 m low.

    A frigate has no overlap (0.0..0.2 and 0.6..1.0), so she cannot move.
    Among tiers that DO overlap the highest is unique: `ShipParams.validate`
    refuses two overlapping tiers at the same rise.

    The interval is closed and `_RUN_EPS`-tolerant at both ends; see
    `_RUN_EPS` for the float32 round-trip it absorbs.
    """
    upper = None
    for tier in p.raised_tiers():
        if tier.t0 - _RUN_EPS <= t <= tier.t1 + _RUN_EPS:
            if upper is None or tier.rise > upper.rise:
                upper = tier
    return upper


def _rail_rise_at(p: FrigateParams, t: float) -> float:
    """Platform rise under the rail at station t; 0.0 where only the gun deck runs.

    Delegates to `_rail_tier_at` so the rise and the tier it belongs to cannot
    disagree. They were two independent first-match scans of `platform_runs`,
    which is how `rail_top_z` could take one tier's rise and another tier's
    bulwark. The epsilon is float round-trip, not geometric tolerance: the
    quarterdeck rail's first stanchion stands exactly on quarter_t, and a
    vertex emitted there came back through `t_of_y` as 0.5999999999999999 and
    fell off its own platform.
    """
    tier = _rail_tier_at(p, t)
    return tier.rise if tier is not None else 0.0


def rail_top_z(p: FrigateParams, t: float) -> float:
    """Top of the open rail at station t. Follows the sheer, never runs level.

    Set by the height it must guard, not by a fixed offset above the bulwark cap.
    Over the quarterdeck the cap stands only 0.18 m proud of the platform, so an
    offset-above-cap rail would be ankle height; the governing span is rail top
    to DECK EDGE, which is where a man at the rail stands. The cap clause only
    stops the rail from sinking into the cap where the platform falls away.
    """
    _check_t(t)
    r = p.rail_form
    cap = sheer(p, t) + p.bulwark_h
    platform_edge = sheer(p, t) + _rail_rise_at(p, t)
    # A CASTLE deck already carries a bulwark of its own and that bulwark's
    # cap IS the rail there — `castle_wall_zs` builds the wall's head at
    # exactly `sheer + rise + bulwark_h`. Guarding it a second time with the
    # open rail's 1.00 m put the galleon's upper head rail 0.53 m ABOVE the
    # castle wall it is supposed to spring off, floating in air. The frigate
    # has no tier that stands above its main rail, so this clause does not
    # fire on it and its rail does not move a bit.
    tier = _rail_tier_at(p, t)
    if tier is not None and tier.stands_above_the_main_rail():
        return max(cap + r.min_proud, platform_edge + tier.bulwark_h)
    return max(cap + r.min_proud, platform_edge + r.guard_h)


def stanchion_ts(p: FrigateParams, t0: float, t1: float) -> list[float]:
    """Stanchion stations across one rail run, both ends included.

    The pitch is the run divided by a whole number of bays near `RAIL_SPACING`,
    not `RAIL_SPACING` itself, so a run never ends on a stub bay.
    """
    length = station_y(p, t0) - station_y(p, t1)
    bays = max(1, round(length / p.rail_form.spacing))
    return [t0 + (t1 - t0) * i / bays for i in range(bays + 1)]


# --- Task 8: masts, yards, tops, bowsprit ----------------------------------
#
# Heights are waterline-to-truck, as a multiple of length overall. Measured off
# `La-penelope.webp` at 17.63 px/m with the waterline at y=719 px: trucks read
# y=125 (fore), 84 (main), 225 (mizzen), i.e. 33.7, 36.0 and 28.2 m.
#
# Spec section 2.1 asks for 40.0 m to the mainmast truck. The reference says
# 36.0. The spec's dimension table has already been wrong once on height — it
# carried a 4.2 m freeboard that measured 1.35x too tall — and the brief makes
# the painting the arbiter, so 36.0 stands.


# All three tops sit at 0.447 of their own truck height in the reference
# (15.0/33.7, 16.1/36.0, 12.7/28.2). That consistency is what is parameterised.
LOWER_CAP_FRAC = 0.45
TOPMAST_CAP_FRAC = 0.75
_DOUBLING = 0.06          # fraction of truck height two masts overlap at a cap

_TAPER = (1.0, 0.72, 0.52, 0.30)   # radius at foot, lower cap, topmast cap, truck

_TOP_FORE_AFT = 0.60       # mast-axis-to-top-after-edge, as a fraction of its span
_CROSSTREE_SCALE = 0.48    # crosstrees, as a fraction of the top below them

# A real top carries most of its area ABAFT the mast; its forward edge is cut
# back, because the topsail hangs ahead of the mast and would chafe on it. Ours
# were symmetric fore and aft, and that symmetry — not the canvas — was the
# anomaly: `check_intersections` reported `Sails x Tops` at 95 face pairs.
#
# Both tops in the reference painting read the same way. Measured off
# `La-penelope.webp` at 17.63 px/m: mainmast-centre x=776 px to main-top-after-
# edge x=805 px is 29 px = 1.64 m, while nothing of the platform shows forward
# of the mast at all; the fore top gives mast-centre x=505 px to top-after-edge
# x=545 px, 40 px = 2.27 m, again with no platform forward. The painting is a
# quarter view, so those after figures carry some athwartships span in them and
# are not used as dimensions — what they settle is which side of the mast the
# platform is on.
TOP_FWD_FRAC = 0.40        # mast-axis-to-top-fore-edge, over mast-axis-to-top-after-edge
TOP_FORE_EDGE_FRAC = 0.55  # half the straight fore edge, over the top's own half span
TOP_AFTER_ARC = 5          # vertices on the after arc: both widest points and one dead aft
TOP_PLATE_SIDES = 8        # vertices round a symmetric platform (the crosstrees)
TOP_THICK = 0.14           # a platform's own thickness; `masts.TOP_THICK` reads it
# Least gap this rig will accept between a lower top's fore edge and the aftmost
# point of the topsail hanging ahead of it, measured over the top's own
# athwartships span and over the z band its plate and its rail occupy.
TOP_CANVAS_CLEAR = 0.25

MAIN_YARD_BEAM_RATIO = 1.45
YARD_TIER_SCALE = (1.0, 0.72, 0.52)       # course, topsail, topgallant
YARD_HEIGHT_FRAC = (0.40, 0.65, 0.85)     # of truck height
_YARD_RADIUS = 0.013                      # yard half-thickness per metre of its length

# The bowsprit's four numbers were module constants here and are
# `p.rig.bowsprit` now — a galleon steeves hers 32 degrees where this frigate
# steeves 24, and steps her heel 4.6 m abaft the stem where this one steps 3.0.


def mast_truck_z(p: FrigateParams, name: str) -> float:
    """Waterline-to-truck for one mast."""
    return mast_spec(p, name).truck_frac * p.loa


def mast_foot(p: FrigateParams, name: str) -> Point:
    """Where the mast comes through the gun deck, on the centreline.

    It is stepped on the gun deck, not on whichever platform happens to be above
    it, so the fore and mizzen masts visibly pass through the forecastle and the
    quarterdeck as they should.
    """
    t = mast_t(p, name)
    return (0.0, station_y(p, t), deck_z_at(p, t, 0.0, 0.0))


def mast_point(p: FrigateParams, name: str, z: float) -> Point:
    """A point on the mast axis at height z. Rakes aft, stays on the centreline."""
    import math

    _x, y_foot, z_foot = mast_foot(p, name)
    rake = math.tan(math.radians(mast_rake_deg(p, name)))
    return (0.0, y_foot - rake * (z - z_foot), z)


def _mast_cap_zs(p: FrigateParams, name: str) -> tuple[float, float, float, float]:
    """(foot, lower cap, topmast cap, truck) heights for one mast."""
    truck = mast_truck_z(p, name)
    caps = mast_spec(p, name).caps
    lower, topmast = ((LOWER_CAP_FRAC, TOPMAST_CAP_FRAC) if caps is None
                      else caps)
    return (
        mast_foot(p, name)[2],
        lower * truck,
        topmast * truck,
        truck,
    )


def mast_segments(p: FrigateParams, name: str) -> list[tuple[float, float, float, float]]:
    """Per mast segment, (z bottom, z top, radius bottom, radius top).

    Lower mast, topmast, topgallant. Consecutive segments OVERLAP by `_DOUBLING`
    of the truck height rather than butting end to end: that overlap is the
    doubling, where the heel of one mast is fished alongside the head of the one
    below, and without it the joint reads as a telescope.
    """
    foot, lower_cap, tm_cap, truck = _mast_cap_zs(p, name)
    base = mast_radius(p, name)
    overlap = _DOUBLING * truck
    radii = [base * f for f in _TAPER]
    bounds = [(foot, lower_cap), (lower_cap - overlap, tm_cap), (tm_cap - overlap, truck)]
    return [
        (z0, z1, radii[i], radii[i + 1])
        for i, (z0, z1) in enumerate(bounds)
    ]


def top_platform(p: FrigateParams, name: str) -> tuple[float, float, float]:
    """(height, half span athwartships, mast-axis-to-after-edge) of the top.

    The third figure is the AFTER extent alone. It used to be half of a
    symmetric fore-and-aft length; the top is now cut away forward (see
    `top_outline`) and only the after edge still stands at this distance.
    `ropes` spreads the futtock fan over it, so it has not moved.
    """
    span = top_span(p, name)
    return (_mast_cap_zs(p, name)[1], span / 2.0, span * _TOP_FORE_AFT / 2.0)


def crosstrees(p: FrigateParams, name: str) -> tuple[float, float, float]:
    """The smaller platform at the topmast head, above the top."""
    _z, half_x, half_y = top_platform(p, name)
    return (_mast_cap_zs(p, name)[2], half_x * _CROSSTREE_SCALE, half_y * _CROSSTREE_SCALE)


def top_extents(p: FrigateParams, name: str, which: int) -> tuple[float, float, float]:
    """(half span athwartships, mast-axis-to-after-edge, mast-axis-to-fore-edge).

    `which` is 0 for the lower top and 1 for the crosstrees above it. Only the
    lower top is cut away forward: at the crosstrees, crosstree-fore-edge to
    topgallant-canvas-aftmost-point is already 0.235 m on the main (0.720 m
    against 0.955 m, both measured from the topmast axis), so there is nothing
    there to clear and nothing to change.
    """
    _z, half_x, aft = (top_platform(p, name) if which == 0 else crosstrees(p, name))
    return (half_x, aft, aft * (TOP_FWD_FRAC if which == 0 else 1.0))


def top_outline(p: FrigateParams, name: str, which: int) -> list[tuple[float, float]]:
    """The plan polygon of one platform, as (x, y) offsets from its own mast axis.

    The lower top is a half ellipse ABAFT the mast closed by a straight fore
    edge a short way forward of it: mast-axis-to-top-fore-edge is
    `TOP_FWD_FRAC` of mast-axis-to-top-after-edge. The greatest athwartships
    breadth stays exactly ON the mast axis, because that is where `ropes`
    sets up the futtock shrouds and because TOP_SPAN — the head spread this
    platform exists to give the topmast rigging — must not move.

    The crosstrees keep the symmetric ellipse they were given in the masts
    detail pass. The list STARTS dead aft, on the centreline, which is what
    makes `perimeter_points` come out symmetric across it; `TOP_AFTER_ARC` is
    odd so that such a vertex exists.
    """
    import math

    half_x, aft, fwd = top_extents(p, name, which)
    if which != 0:
        return [(half_x * math.sin(a), aft * math.cos(a))
                for a in (2 * math.pi * i / TOP_PLATE_SIDES
                          for i in range(TOP_PLATE_SIDES))]
    n = TOP_AFTER_ARC
    if n % 2 == 0:
        raise ValueError("TOP_AFTER_ARC must be odd so a vertex lands dead aft")
    arc = [(half_x * math.cos(a), -aft * math.sin(a))
           for a in (math.pi * i / (n - 1) for i in range(n))]
    fore = [(-half_x * TOP_FORE_EDGE_FRAC, fwd), (half_x * TOP_FORE_EDGE_FRAC, fwd)]
    return arc[n // 2:] + fore + arc[:n // 2]


def yard_specs(p: FrigateParams, name: str) -> list[tuple[float, float, float]]:
    """Per yard on one mast, (height, length tip to tip, radius at the slings).

    ONE YARD PER SQUARE SAIL. The frigate sets course, topsail and topgallant
    on every mast and so gets its nine yards; a schooner's gaff-rigged masts
    set no square sail and get none at all, and a galleon's lateen mizzen gets
    none either. The three tiers are no longer a fact of this function.

    Length spans TIP TO TIP athwartships; the main course yard runs 1.45 times
    the maximum beam.
    """
    truck = mast_truck_z(p, name)
    plan = mast_spec(p, name).yard_plan
    if plan is not None:
        # A mast that STATES its yards (`shiptype.YardPlan`): the sloop's
        # flying topsail, which has no course under it to take a tier from.
        base = MAIN_YARD_BEAM_RATIO * p.beam
        return [(y.height_frac * truck, base * y.scale,
                 _YARD_RADIUS * base * y.scale) for y in plan]
    base = MAIN_YARD_BEAM_RATIO * p.beam * mast_spec(p, name).yard_scale
    out = []
    for sail in square_sails_on(p, name):
        if sail.tier >= len(YARD_TIER_SCALE):
            raise ValueError(
                f"mast {name!r} sets a square sail at tier {sail.tier}, but only "
                f"{len(YARD_TIER_SCALE)} tiers of yard are dimensioned "
                f"(YARD_TIER_SCALE, YARD_HEIGHT_FRAC)"
            )
        length = base * YARD_TIER_SCALE[sail.tier]
        out.append((YARD_HEIGHT_FRAC[sail.tier] * truck, length, _YARD_RADIUS * length))
    return out


def lateen_masts(p: FrigateParams) -> tuple[str, ...]:
    """The masts setting a lateen sail. The galleon's mizzen, and nothing else."""
    return p.rig.lateen_masts()


def lateen_spar(p: FrigateParams, name: str) -> tuple[Point, Point, Point, float]:
    """(heel, slings, peak, radius at the slings) of one lateen yard.

    HEEL low and FORWARD, PEAK high and AFT, crossing its own mast once at
    the SLINGS, and lying wholly in the ship's fore-and-aft plane. Every
    figure is a fraction of a span the mast already states, so the spar
    scales with whatever mast sets it:

      MAST-FOOT to MAST-TRUCK sets the yard's own length;
      the SLINGS stand `mast_frac` of that span up the mast, on the mast's
      own RAKED axis, not on a vertical through its foot;
      `slings_frac` of the yard lies forward of the slings and the rest abaft.
    """
    import math

    spec = p.rig.lateen
    foot = mast_foot(p, name)
    truck_z = mast_truck_z(p, name)
    span = truck_z - foot[2]
    length = spec.length_frac * span
    z_slings = foot[2] + spec.mast_frac * span
    slings = mast_point(p, name, z_slings)
    rake = math.radians(spec.rake_deg)
    # Aft is -y, so the peak runs aft and up and the heel forward and down.
    dy, dz = -math.cos(rake), math.sin(rake)
    ahead = length * spec.slings_frac
    behind = length - ahead
    heel = (0.0, slings[1] - ahead * dy, slings[2] - ahead * dz)
    peak = (0.0, slings[1] + behind * dy, slings[2] + behind * dz)
    return (heel, slings, peak, spec.radius_frac * length)


def lateen_length(p: FrigateParams, name: str) -> float:
    """HEEL to PEAK, along the spar itself. Both endpoints named."""
    import math

    heel, _slings, peak, _r = lateen_spar(p, name)
    return math.dist(heel, peak)


def bowsprit_segment(p: FrigateParams) -> tuple[Point, Point, float, float]:
    """(heel, tip, radius at the heel, radius at the tip).

    The tip stands BOWSPRIT_PROJECTION metres forward of the stem, horizontally,
    which is the span spec section 2.1 quotes and which the reference confirms
    at 215 px / 17.63 = 12.2 m. The heel is stepped abaft the stem, so the spar
    is longer than its projection.
    """
    import math

    b = p.rig.bowsprit
    y_stem = station_y(p, 0.0)
    y_heel = y_stem - b.heel_in
    y_tip = y_stem + b.projection
    t_heel = t_of_y(p, y_heel)
    z_heel = sheer(p, t_heel) + p.bulwark_h * 0.5
    z_tip = z_heel + (y_tip - y_heel) * math.tan(math.radians(b.steeve_deg))
    return ((0.0, y_heel, z_heel), (0.0, y_tip, z_tip), *b.radius)


# --- Task 11: where the 24 guns and their port lids stand ------------------
#
# The cannon is ONE mesh instanced 24 times, so everything that varies between
# stations has to be absorbed by the placement rather than by the geometry.
# Two things do: the deck camber under the carriage (0.08-0.18 m across the
# battery) and how far outboard the port is.

GUN_LENGTH = 2.0        # breech face to muzzle, along the barrel
GUN_MUZZLE_OUT = 0.25   # how far the muzzle stands outside the bulwark's outer face
GUN_TRUNNION_H = 0.83   # the frigate's barrel axis over her carriage floor
# (x along the barrel, radius). The bump at 1.86 is the muzzle swell. Here and
# not in `cannons`, which imports bpy, so the pure tests can measure a barrel
# against its port.
GUN_BARREL_RINGS = ((0.00, 0.165), (0.45, 0.150), (1.25, 0.112),
                    (1.86, 0.128), (2.00, 0.118))
# The carriage, in the gun's own frame (origin at the breech end on the
# deck, +X toward the muzzle). Here and not in `cannons`, which imports bpy,
# so the pure tests can measure a carriage against what it stands on;
# `cannons` reads them back.
GUN_CHEEK_X = (0.15, 1.35)    # cheeks and bed, breech toward muzzle
GUN_TRUCK_X = (0.30, 1.20)    # the two axles
GUN_TRUCK_R = 0.14            # a truck's radius
GUN_TRUCK_Y = 0.40            # centreline to a truck's mid-plane
GUN_TRUCK_T = 0.09            # a truck's thickness
LID_W = 1.02            # lid, fore and aft — wider than the 0.90 m aperture
LID_H = 0.86            # lid, vertically — deeper than the 0.75 m aperture
LID_THICK = 0.07
LID_OPEN_DEG = 68.0     # swung up from shut; the guns are run out


def _broadside_gun(p: FrigateParams, t: float, sign: float, deck: int) -> dict:
    """One gun, placed from its own port. `origin` is the breech end, on the deck."""
    z_port = port_center_z(p, t, deck)
    # The side the port is cut in: the bulwark over the sheer, the hull skin
    # under it. `skin_half_width` IS `bulwark_half_width` for a bulwark row.
    muzzle_x = skin_half_width(p, t, z_port) + GUN_MUZZLE_OUT
    breech_x = muzzle_x - GUN_LENGTH
    carriage_x = (breech_x + muzzle_x) / 2.0
    y = station_y(p, t)
    floor = tier_deck_z(p, serving_tier(p, deck), t, carriage_x)
    return {
        "kind": "broadside",
        "origin": (sign * breech_x, y, floor),
        "carriage_x": carriage_x,
        "yaw_deg": 0.0 if sign > 0 else 180.0,
        "muzzle_out": GUN_MUZZLE_OUT,
    }


def _chase_gun(p: FrigateParams, u: float) -> dict:
    """A stern chaser, run out through the transom. Local +X points aft.
    It stands on Deck_Main at its breech, or ON the chase platform where
    the ship builds one."""
    z_port = chase_center_z(p)
    muzzle_y = station_y(p, 1.0) - GUN_MUZZLE_OUT
    y = muzzle_y + GUN_LENGTH
    x = u * stern_half_width(p, z_port)
    t = t_of_y(p, y)
    floor = (chase_platform_z(p) if p.stern_form.chase_platform is not None
             else deck_z_at(p, t, x, 0.0))
    return {
        "kind": "chase",
        "origin": (x, y, floor),
        "carriage_x": x,
        "yaw_deg": -90.0,
        "muzzle_out": GUN_MUZZLE_OUT,
    }


def gun_placements(p: FrigateParams) -> list[dict]:
    """Every gun: the whole broadside battery, both sides, plus the chasers.

    The frigate's 24 are 11 a side and two stern chasers. The count is read
    off `p.gun_decks`, so a two-decker gets both rows manned without a line
    changing here.
    """
    p.validate()
    out = [
        _broadside_gun(p, t, sign, d)
        for d, t in all_gunport_ts(p)
        for sign in (1.0, -1.0)
    ]
    for u0, u1 in chase_u_edges(p):
        out.append(_chase_gun(p, (u0 + u1) / 2.0))
    return out


def _lid_gap(lid: dict, hinge_out: float, barrel: list) -> float:
    """OPEN LID'S UNDERSIDE to the nearest BARREL-TOP point under it, in
    the plane of the gun's own bore through its port (the lid is wider than
    the barrel, so that plane is where they meet). Positive is clear.

    Every point is (OUT, z): OUT is measured along the port's outboard
    direction -- athwartships for a broadside port, aft for a chase port --
    and `hinge_out` is the hinge's. The lid hangs shut straight down, or
    leaning out by `lean_deg` on a hull skin, and swings `open_deg` outboard
    from there; its thickness is on the side that faces the gun."""
    hz = lid["hinge"][2]
    a = math.radians(lid.get("lean_deg", 0.0) + lid["open_deg"])
    ux, uz = math.sin(a), -math.cos(a)            # hinge to tip
    nx, nz = -uz, ux                               # unit normal ...
    if nz > 0.0:                                   # ... toward the gun
        nx, nz = -nx, -nz
    px, pz = hinge_out + nx * LID_THICK, hz + nz * LID_THICK
    gaps = [(x - px) * nx + (z - pz) * nz for x, z in barrel
            if 0.0 <= (x - px) * ux + (z - pz) * uz <= LID_H]
    return min(gaps, default=math.inf)


def barrel_clearances(p: FrigateParams, trunnion_h: float | None = None
                      ) -> list[dict]:
    """Per gun, broadside AND chase, in `gun_placements` order: how the
    barrel passes its port, run out.

    `sill`: BARREL UNDERSIDE (axis less the widest radius from the chase
    out, x >= 1.25, the length that passes the side) to PORT SILL -- the
    row's sill for a broadside gun, `chase_sill_z` for a chaser.
    `lid`: OPEN LID'S UNDERSIDE to BARREL TOP (`_lid_gap`). Both positive
    is a barrel that passes clear between its sill and its own open lid.
    `trunnion_h` defaults to the ship's own `gun_trunnion_h`.
    """
    th = p.gun_trunnion_h if trunnion_h is None else trunnion_h
    swell = max(r for x, r in GUN_BARREL_RINGS if x >= 1.25)
    lids = lid_placements(p)
    guns = gun_placements(p)
    rows = [(d, t) for d, t in all_gunport_ts(p) for _sign in (1.0, -1.0)]
    rows += [(chase_deck_index(p), 1.0)] * (len(guns) - len(rows))
    out = []
    for gun, lid, (d, t) in zip(guns, lids, rows):
        axis = gun["origin"][2] + th
        if gun["kind"] == "broadside":
            side = 1.0 if gun["yaw_deg"] == 0.0 else -1.0
            sill = row_floor_z(p, t, d) + gun_deck(p, d).sill
            top = [(side * gun["origin"][0] + x, axis + r)
                   for x, r in GUN_BARREL_RINGS]
            hinge_out = side * lid["hinge"][0]
        else:
            sill = chase_sill_z(p)
            top = [(-gun["origin"][1] + x, axis + r)
                   for x, r in GUN_BARREL_RINGS]
            hinge_out = -lid["hinge"][1]
        out.append({"kind": gun["kind"], "deck": d, "t": t,
                    "sill": axis - swell - sill,
                    "lid": _lid_gap(lid, hinge_out, top)})
    return out


def _hull_lids(p: FrigateParams, deck: int, t: float) -> list[dict]:
    """The two lids of one HULL-row port: hinged at the head ON the hull's
    outer face, and shut they lie on the local skin. Under the sheer the
    topsides are still tumbling out, so the skin below the hinge leans
    OUTBOARD; `lean_deg` is that lean, HINGE (port head on the skin) to
    the skin at the port's own sill, measured from the vertical. A bulwark
    row's lid carries no such key and hangs plumb, as it always has."""
    d = gun_deck(p, deck)
    z_head = row_floor_z(p, t, deck) + d.head
    x_head = hull_half_width(p, t, z_head)
    x_sill = hull_half_width(p, t, z_head - d.height)
    lean = math.degrees(math.atan2(x_sill - x_head, d.height))
    return [{
        "kind": "broadside",
        "deck": deck,
        "hinge": (sign * x_head, station_y(p, t), z_head),
        "yaw_deg": 0.0 if sign > 0 else 180.0,
        "open_deg": LID_OPEN_DEG,
        "lean_deg": lean,
    } for sign in (1.0, -1.0)]


def lid_pitch_deg(lid: dict) -> float:
    """The pitch `cannons` builds a lid at: its mesh stands straight out at
    identity (open 90 deg from plumb), so it is pitched back down by
    (90 - open), and a hull lid by its skin's `lean_deg` too, since it
    shuts leaning. Pure, so the swing can be proved without Blender."""
    return 90.0 - lid["open_deg"] - lid.get("lean_deg", 0.0)


def lid_placements(p: FrigateParams) -> list[dict]:
    """One lid per aperture, hinged on its own port head and swung open."""
    p.validate()
    out = []
    for d, t in all_gunport_ts(p):
        if gun_deck(p, d).host == "hull":
            out += _hull_lids(p, d, t)
            continue
        z_head = sheer(p, t) + gun_deck(p, d).head
        for sign in (1.0, -1.0):
            out.append({
                "kind": "broadside",
                "deck": d,
                "hinge": (sign * bulwark_half_width(p, t, z_head), station_y(p, t), z_head),
                "yaw_deg": 0.0 if sign > 0 else 180.0,
                "open_deg": LID_OPEN_DEG,
            })
    z_head = chase_head_z(p)
    for u0, u1 in chase_u_edges(p):
        u = (u0 + u1) / 2.0
        out.append({
            "kind": "chase",
            "deck": chase_deck_index(p),
            "hinge": (u * stern_half_width(p, z_head), station_y(p, 1.0), z_head),
            "yaw_deg": -90.0,
            "open_deg": LID_OPEN_DEG,
        })
    return out


# --- the maintainer's third ruling, A': the chase platform ---------------------------
#
# A heavy timber platform locally off the main deck, under the stern
# chasers' carriages. Every figure is DERIVED (R11): its level is Deck_Main's
# at the chasers' station (`chase_platform_z`), its run is Deck_Main's end to
# the hull's end cap, its edges let into the bulwark where it stands over
# the sheer and carried to the hull skin below it, its planking the deck's
# `plank_thick`, its timbers sized off that plank rule and the carriage's
# trucks. The frigate builds none.
#
# Final review 3, I-2 (ruling 3869): below the sheer the side has ONE skin
# -- no ceiling abaft y -12.58, no transom inner skin under the stern
# sheer -- so the twin-skin rule (skin less `bulwark_thick`) left the
# hull's hollow open 0.22 m round the platform. Below the sheer the
# planking runs to the HULL SKIN and to the HULL'S END CAP less ONE named
# clearance (`ChasePlatform.skin_clearance`); over the sheer the edge is
# Deck_Main's; and a riser closes Deck_Main's end down to PLATFORM TOP.

# Columns across a deck tier's walking surface (`decks._deck_patch`): her
# surface is straight between them, so her end's underside is too.
DECK_N_TRAN = 9


def chase_platform_clearance(p: FrigateParams) -> float:
    """PLATFORM EDGE to HULL SKIN and PLATFORM AFT EDGE to the HULL'S END
    CAP, below the sheer: the ship's `skin_clearance`."""
    chase_platform_z(p)            # raises on a ship that builds none
    return p.stern_form.chase_platform.skin_clearance


def chase_platform_span(p: FrigateParams) -> tuple[float, float]:
    """(FORE EDGE y, AFT EDGE y): Deck_Main's END, where the deck stops, to
    the HULL'S END CAP (the transom plane, `station_y(p, 1.0)`) less the
    clearance. There is no transom inner skin to stop at: the Transom's
    foot is the stern sheer, above PLATFORM TOP."""
    return (station_y(p, p.tier("Deck_Main").t1),
            station_y(p, 1.0) + chase_platform_clearance(p))


def _chase_frame_span(p: FrigateParams) -> tuple[float, float]:
    """(FORE, AFT) of the platform's FRAMING: Deck_Main's end to the
    TRANSOM'S INSIDE FACE, `bulwark_thick` forward of the transom plane.
    The timbers are Task 11's as built (final review 3 left them alone);
    the after planking runs on past them to the end cap."""
    fore, _aft = chase_platform_span(p)
    return fore, station_y(p, 1.0) + p.bulwark_thick


def _chase_frame_half_width(p: FrigateParams, t: float) -> float:
    """The FRAMING's edge: HULL SKIN at PLATFORM TOP less the side timber
    (Task 11's rule, which the timbers keep)."""
    return hull_half_width(p, t, chase_platform_z(p)) - p.bulwark_thick


def chase_platform_crossing_t(p: FrigateParams) -> float:
    """The station where the SHEER climbs through PLATFORM TOP: forward of
    it the platform stands over the sheer, abaft it below. Bisected on
    `sheer`, which climbs aft over the platform's run."""
    fore, aft = chase_platform_span(p)
    top = chase_platform_z(p)
    lo, hi = t_of_y(p, fore), t_of_y(p, aft)
    if sheer(p, lo) > top:
        return lo
    if sheer(p, hi) <= top:
        return hi
    for _ in range(100):
        mid = (lo + hi) / 2.0
        if sheer(p, mid) <= top:
            lo = mid
        else:
            hi = mid
    return lo


def chase_platform_pieces(p: FrigateParams) -> list[list[tuple]]:
    """The planking as outlines of [(t, half-width), ...], fore first: the
    piece OVER the sheer (Deck_Main's rule, let into the bulwark), then the
    piece BELOW it (the skin less the clearance). The edge steps outboard
    at the crossing, under the bulwark's foot. Each outline holds its two
    ends and every hull station between, so it follows the hull's taper."""
    fore, aft = chase_platform_span(p)
    t0, t1 = t_of_y(p, fore), t_of_y(p, aft)
    tc = chase_platform_crossing_t(p)
    top = chase_platform_z(p)
    c = chase_platform_clearance(p)
    out = []
    for a, b, rule in ((t0, tc, "over"), (tc, t1, "below")):
        if b - a <= _TS_EPS:
            continue
        inner = [t for t in station_ts(p) if a + _TS_EPS < t < b - _TS_EPS]
        ts = [a] + inner + [b]
        if rule == "over":
            out.append([(t, _chase_frame_half_width(p, t)) for t in ts])
        else:
            out.append([(t, hull_half_width(p, t, top) - c) for t in ts])
    return out


def chase_platform_ts(p: FrigateParams) -> list[float]:
    """Stations of the platform's outline, fore to aft: its two edges, the
    sheer crossing, and every hull station between."""
    out = []
    for piece in chase_platform_pieces(p):
        for t, _hw in piece:
            if not out or abs(t - out[-1]) > _TS_EPS:
                out.append(t)
    return out


def chase_platform_half_width(p: FrigateParams, t: float) -> float:
    """PLATFORM EDGE at station t. OVER the sheer, Deck_Main's rule: the
    HULL SKIN at the sheer less the side timber, let into the bulwark's
    inner face (`hull_half_width` above the sheer returns the SHEER's
    width, outside the bulwark's outer face, so the clearance alone would
    stand the edge through the bulwark). BELOW the sheer, where the side
    has one skin: the HULL SKIN at PLATFORM TOP less `skin_clearance`. At
    the crossing itself, the over-the-sheer edge."""
    top = chase_platform_z(p)
    if sheer(p, t) <= top:
        return _chase_frame_half_width(p, t)
    return hull_half_width(p, t, top) - chase_platform_clearance(p)


def chase_platform_riser(p: FrigateParams) -> dict:
    """The RISER that closes Deck_Main's end down to PLATFORM TOP.

    The deck is cambered and the platform level, so at her end DECK_MAIN
    UNDERSIDE stands over PLATFORM TOP across the middle of the beam -- a
    lens up to 0.063 m high with the opened hull band behind it. The riser
    stands on the platform's planking, its forward face in Deck_Main's end
    plane and `skin_clearance` deep, so its after face stands under her
    underside's after edge (her Solidify leans that edge aft) and its top,
    her underside as `decks._deck_patch` lays it (her surface's grid at
    t1 less `plank_thick`, straight between columns), is inside her plank.

    {y_aft, y_fwd, bottom, columns}: columns [(x, top z)] port to
    starboard, ending where her underside comes down to PLATFORM TOP."""
    fore, _aft = chase_platform_span(p)
    top = chase_platform_z(p)
    tier = p.tier("Deck_Main")
    hb = tier_half_beam(p, tier, tier.t1)
    n = DECK_N_TRAN
    under = [(-hb + 2.0 * hb * j / (n - 1), 0.0) for j in range(n)]
    under = [(x, tier_deck_z(p, tier, tier.t1, x) - p.plank_thick)
             for x, _z in under]
    cols = []
    for (xa, za), (xb, zb) in zip(under, under[1:]):
        if za > top:
            cols.append((xa, za))
        if (za > top) != (zb > top):
            cols.append((xa + (xb - xa) * (top - za) / (zb - za), top))
    if under[-1][1] > top:
        cols.append(under[-1])
    return {"y_aft": fore - chase_platform_clearance(p), "y_fwd": fore,
            "bottom": top, "columns": cols}


def chase_carriage_footprints(p: FrigateParams) -> list[tuple]:
    """(x_lo, x_hi, y_aft, y_fwd) of each chaser's carriage seen from above:
    its cheeks' run fore and aft, its trucks' OUTER faces athwartships.
    A chaser's local +X points aft, so the run is laid off aft of its
    breech."""
    reach = GUN_TRUCK_Y + GUN_TRUCK_T / 2.0
    out = []
    for gun in gun_placements(p):
        if gun["kind"] != "chase":
            continue
        x, y, _z = gun["origin"]
        out.append((x - reach, x + reach, y - GUN_CHEEK_X[1],
                    y - GUN_CHEEK_X[0]))
    return out


def chase_platform_timbers(p: FrigateParams) -> list[dict]:
    """The platform's framing, as boxes {kind, lo, hi}, all hung under its
    planking (top at PLATFORM TOP less `plank_thick`).

    BEAMS run athwartships, sided a TRUCK'S DIAMETER so a truck bears wholly
    on one, moulded TWO PLANKS: one at the platform's fore edge (under
    Deck_Main's end) and one under the chasers' AFTER TRUCKS. There is no
    third at the aft end: AFTER TRUCK AXLE to the TRANSOM'S INSIDE FACE is
    0.33 m, under the 0.42 a beam a side of it would need. Each beam spans
    the FRAMING's width (HULL SKIN at PLATFORM TOP less the side timber) at
    the narrower of its two faces.

    CARLINGS run fore and aft under each TRUCK LINE (gun x plus or minus
    the truck's mid-plane), sided the same, moulded ONE PLANK, from the
    platform's fore edge to the TRANSOM'S INSIDE FACE.

    The framing is Task 11's as built (`_chase_frame_span`,
    `_chase_frame_half_width`); since final review 3 the planking runs on
    past it, to the skin and the end cap less `skin_clearance`.
    """
    top = chase_platform_z(p)
    fore, aft = _chase_frame_span(p)
    sided = 2.0 * GUN_TRUCK_R
    under = top - p.plank_thick
    chasers = [g for g in gun_placements(p) if g["kind"] == "chase"]
    y_truck = chasers[0]["origin"][1] - GUN_TRUCK_X[1]

    def width(y0: float, y1: float) -> float:
        return min(_chase_frame_half_width(p, t_of_y(p, y))
                   for y in (y0, y1))

    out = []
    for y_mid in (fore - sided / 2.0, y_truck):
        y0, y1 = y_mid - sided / 2.0, y_mid + sided / 2.0
        hw = width(y0, y1)
        out.append({"kind": "beam",
                    "lo": (-hw, y0, under - 2.0 * p.plank_thick),
                    "hi": (hw, y1, under)})
    for gun in chasers:
        for side in (-1.0, 1.0):
            x = gun["origin"][0] + side * GUN_TRUCK_Y
            out.append({"kind": "carling",
                        "lo": (x - sided / 2.0, aft, under - p.plank_thick),
                        "hi": (x + sided / 2.0, fore, under)})
    return out


def chase_platform_triangles(p: FrigateParams) -> int:
    """What `decks.build_chase_platform` draws: each piece of planked slab
    (top and underside, two sides, over each segment of its outline, and
    its two ends), 12 a timber, and the riser (top, underside, after and
    forward faces over each segment between its columns; a face is one
    triangle where it runs out to nothing at the riser's end). 0 on a ship
    that builds none."""
    if p.stern_form.chase_platform is None:
        return 0
    slab = sum(2 * (4 * (len(pc) - 1) + 2)
               for pc in chase_platform_pieces(p))
    riser = chase_platform_riser(p)
    tall = [z > riser["bottom"] for _x, z in riser["columns"]]
    faces = 0
    for a, b in zip(tall, tall[1:]):
        faces += 4 + (2 if a and b else 1) * 2
    return slab + 12 * len(chase_platform_timbers(p)) + faces


def hull_open_top_bands(p: FrigateParams) -> list[int]:
    """Bands of the hull loft (between `station_ts[i]` and `[i + 1]`) whose
    sheer-level closing face is LEFT OUT, because a chase platform stands
    below the sheer there and the carriages on it rise through it. Every
    band reaching abaft Deck_Main's end. The band that also runs forward of
    it lies under Deck_Main, whose UNDERSIDE stands over PLATFORM TOP at
    her end across the middle of the beam: that lens is closed by the
    platform's riser (`chase_platform_riser`), not by the deck. Empty on a
    ship with no platform, whose hull is closed the whole length."""
    if p.stern_form.chase_platform is None:
        return []
    ts = station_ts(p)
    fore = p.tier("Deck_Main").t1
    return [i for i in range(len(ts) - 1) if ts[i + 1] > fore + _TS_EPS]


# --- Task 12: deck furniture layout ----------------------------------------

from . import shiptype as _shiptype  # noqa: E402

# THE FRIGATE'S deck plan. It lives on `FurniturePlan` now, as data on each
# ship's params (`p.furniture_plan`), because every figure in it is measured
# on the frigate's decks; these names are kept so nothing that reads them
# moves. The galleon's plan is `params.GALLEON_FURNITURE`.
_FRIGATE_PLAN = _shiptype.FRIGATE_FURNITURE
FURNITURE = _FRIGATE_PLAN.stations
BOAT_ON_SKIDS = _FRIGATE_PLAN.boat_on_skids
LANTERNS = _FRIGATE_PLAN.lanterns
LANTERN_SPREAD = _FRIGATE_PLAN.lantern_spread
ANCHOR_T = _FRIGATE_PLAN.anchor_t
# It was 0.125. Setting the anchor out from where it BEARS rather than from
# its ring moved it 0.354 m outboard, which put its after hoop through the
# fore channel -- the one that spreads the foremast shrouds. 0.112 is the
# station that clears it; `test_the_anchor_hangs_clear_of_the_fore_channel`
# is the measurement, with both ends of it named.

# The fittings' envelopes a deck plan is laid out against, bpy-free so a
# plan can be measured off Blender; `furniture` reads them back.
HATCH = (1.55, 1.25, 0.26, 0.16)  # length, width, coaming height, thickness
BOAT = (6.0, 1.00, 0.85)          # length, half beam, depth
CAPSTAN_BAR_LEN = 1.45            # capstan centre to a bar's end
WHEEL_DRUM_AFT = 0.52             # wheel station to its drum's after end
# The launch's GUNWALE (its origin) less its DEPTH less this is its SKID
# UNDERSIDE: the skids hang 0.26 m under the keel line. The skids run the
# middle 80% of the launch's length (fractions 0.10..0.90), at x +-0.55.
BOAT_SKID_DROP = 0.26
BOAT_SKID_SPAN = (0.10, 0.90)
ANCHOR_DROP = 0.35     # below the rail cap

# The anchor's own dimensions live here, bpy-free, because WHERE it hangs is
# derived from HOW BIG it is. `furniture.ANCHOR` reads them back.
ANCHOR_SHANK = 2.2         # ring to crown
ANCHOR_STOCK = 1.70        # the stock, athwart the shank
ANCHOR_ARM = 0.75          # crown to palm, each way
ANCHOR_HALF_THICK = 0.085  # half the shank's thickness, outboard-inboard
ANCHOR_BED = 0.06          # how far it beds into the planking it lies against

# --- what the shape of an admiralty-pattern anchor actually is ---------------
#
# The anchor was 320 triangles of boxes and cylinders, and it read low-res at
# the range an anchor on a pirate ship's bow is actually looked at. Its
# arithmetic lives here, bpy-free, for the same reason the launch's sections
# and a grating's lattice do: so it can be judged under plain pytest, and so
# the galleon, schooner and man-o-war inherit the SHAPE and not just the
# placement. `furniture._anchor_mesh` only emits it.
#
# THE ENVELOPE IS FROZEN. `anchor_bearing_x` stands the shank's inboard face
# on the widest the bow gets anywhere under the anchor's own footprint and
# beds it in by `ANCHOR_BED`, and `check_directions` holds that burial to the
# shank's own half thickness. So nothing richer may reach further inboard than
# `ANCHOR_HALF_THICK`, further out along an arm than `ANCHOR_ARM * 1.02`, or
# further fore-and-aft than `ANCHOR_AFT_REACH`. The enrichment is spent inside
# that box and nowhere else.

ANCHOR_RING_MAJOR = 0.17       # the ring the cable bends to
ANCHOR_RING_MINOR = 0.048      # the iron the ring is made of
ANCHOR_RING_SEGMENTS = 16
ANCHOR_RING_SIDES = 6
ANCHOR_RING_SEAT = 0.20        # the shank's head, which the ring hangs through

# The shank, from the crown (f = 0) to under the ring (f = 1). Square in
# section like a real admiralty shank, biggest where the arms load it.
ANCHOR_SHANK_SECTION = ((0.085, 0.085), (0.056, 0.056))
ANCHOR_SHANK_STATIONS = 7

# The stock, athwart the shank and lying fore-and-aft on this ship because
# that is how it is catted. Square at the middle where the shank clamps it,
# tapering in BOTH thickness and depth to each end, which is what makes a
# stock read as a baulk of oak and not as a dowel.
ANCHOR_STOCK_SECTION = ((0.075, 0.108), (0.040, 0.052))
ANCHOR_STOCK_STATIONS = 5
ANCHOR_STOCK_Z = -0.02         # the stock's centreline, below the ring seat

# Four iron hoops. They used to sit at 0.18, 0.58, 0.98 and 1.38 from the
# shank on a stock that ends at 0.85 — two of them were bands clasping thin
# air, and the outermost was what the fore-channel clearance was measured
# against. Two a side, both on the wood.
ANCHOR_HOOP_AT = (0.26, 0.62)
ANCHOR_HOOP_HALF = 0.055       # half the hoop's width along the stock
ANCHOR_HOOP_PROUD = 0.016      # how far the iron stands off the oak

# The arms. A real arm is an ARC out of the crown — it leaves nearly flat and
# arrives at the bill pointing up and out — and that curve is most of what
# makes an anchor read as an anchor rather than as a letter Y.
ANCHOR_ARM_RISE = 0.62         # the bill, above the crown
ANCHOR_ARM_CURVE = 1.75        # flat out of the crown, steep into the bill
ANCHOR_ARM_STATIONS = 9
ANCHOR_ARM_SECTION = (0.082, 0.030)   # half thickness at crown, at bill
ANCHOR_CROWN_DEPTH = 0.20      # the crown, below the foot of the shank

# The flukes: the broad blades on the back of each arm. They START clear of
# the crown and STOP short of the bill, because the bill is the point that
# bites and a blade run out to it would blunt it.
ANCHOR_FLUKE_SPAN = (0.46, 0.88)
ANCHOR_FLUKE_WIDTH = (0.26, 0.07)     # how far it stands off the arm's back
ANCHOR_FLUKE_HALF_THICK = 0.026

# The bills, the points beyond the flukes.
ANCHOR_BILL = 0.09             # how far the point runs on past the last station

# The aftmost point of the whole anchor, measured from its own station. It is
# the after END OF THE STOCK — named at both ends, and asserted against the
# geometry rather than typed — and `test_the_anchor_hangs_clear_of_the_fore_
# channel` measures it against the forward end of the fore channel.
ANCHOR_AFT_REACH = ANCHOR_STOCK / 2.0


def anchor_parts() -> tuple:
    """Every part an admiralty-pattern anchor has, and this one has them all."""
    return ("ring", "shank", "stock", "hoops", "arms", "flukes", "bills")


def anchor_arm_arc() -> list:
    """[(y, z, half)] from the crown outward, z relative to the crown.

    `y` runs outboard along the arm and `z` up; `half` is the arm's own half
    thickness there. The last station is the root of the bill, not its point.
    """
    out = []
    for i in range(ANCHOR_ARM_STATIONS):
        f = i / (ANCHOR_ARM_STATIONS - 1)
        h0, h1 = ANCHOR_ARM_SECTION
        out.append((ANCHOR_ARM * f,
                    ANCHOR_ARM_RISE * f ** ANCHOR_ARM_CURVE,
                    h0 + (h1 - h0) * f))
    return out


def anchor_fluke_span() -> tuple:
    """Where along the arm the blade starts and stops, as fractions of it."""
    return ANCHOR_FLUKE_SPAN


def anchor_fluke_width() -> tuple:
    """(at its back, at its point) — how far the blade stands off the arm."""
    return ANCHOR_FLUKE_WIDTH


def anchor_arm_point(f: float) -> tuple:
    """(y, z, half, ty, tz) at fraction `f` along an arm, z from the crown.

    The tangent is the curve's own derivative rather than a difference between
    two stations, so the sections stay square to the arc however many stations
    the arm is swept at.
    """
    f = min(1.0, max(0.0, f))
    h0, h1 = ANCHOR_ARM_SECTION
    dy = ANCHOR_ARM
    dz = ANCHOR_ARM_RISE * ANCHOR_ARM_CURVE * f ** (ANCHOR_ARM_CURVE - 1.0)
    length = math.hypot(dy, dz)
    return (ANCHOR_ARM * f, ANCHOR_ARM_RISE * f ** ANCHOR_ARM_CURVE,
            h0 + (h1 - h0) * f, dy / length, dz / length)


def anchor_fluke_centre(f: float) -> tuple:
    """(y, z, width) of the blade's own middle at fraction `f` along the arm.

    The blade stands off the arm's CONVEX side — the face that bites into the
    ground, and the only side a palm was ever forged on. The concave side
    faces the shank.
    """
    y, z, half, ty, tz = anchor_arm_point(f)
    width = anchor_fluke_profile(f)
    stand = half * 0.6 + width / 2.0
    return (y + tz * stand, z - ty * stand, width)


def anchor_fluke_profile(f: float) -> float:
    """How far the blade stands off the arm at fraction `f` along the arm.

    Nothing outside its own span, a shoulder that rises fast off the arm, and
    a long fine run out to the point. A blade that faded in and out
    symmetrically read as a leaf.
    """
    f0, f1 = ANCHOR_FLUKE_SPAN
    if not f0 <= f <= f1:
        return 0.0
    back, tip = ANCHOR_FLUKE_WIDTH
    g = (f - f0) / (f1 - f0)
    shoulder = 0.22
    if g <= shoulder:
        return back * (g / shoulder)
    return back + (tip - back) * ((g - shoulder) / (1.0 - shoulder))


def anchor_hoops() -> list:
    """[(y along the stock, half the hoop's width)], aftmost first.

    Every one of them ON the wood: `|y| + half` never reaches the stock's end.
    """
    return sorted((sign * at, ANCHOR_HOOP_HALF)
                  for sign in (-1.0, 1.0) for at in ANCHOR_HOOP_AT)


def anchor_stock_section(f: float) -> tuple:
    """(half outboard, half up) of the stock at fraction `f` of its half span.

    Symmetric in `f`: a stock is the same baulk both ways from the shank.
    """
    (x0, z0), (x1, z1) = ANCHOR_STOCK_SECTION
    g = min(1.0, abs(f))
    return (x0 + (x1 - x0) * g, z0 + (z1 - z0) * g)


def anchor_shank_section(f: float) -> tuple:
    """(half outboard, half fore-and-aft) of the shank, crown (0) to head (1)."""
    (x0, y0), (x1, y1) = ANCHOR_SHANK_SECTION
    g = min(1.0, max(0.0, f))
    return (x0 + (x1 - x0) * g, y0 + (y1 - y0) * g)


def anchor_extent_y() -> tuple:
    """(aftmost, forwardmost) of the whole anchor, from its own station.

    Everything is measured, not assumed: the stock's ends, the arms' bills
    with their points on, and the hoops' outer edges.
    """
    arm_tip = ANCHOR_ARM + ANCHOR_BILL
    hoop = max(abs(y) + half for y, half in anchor_hoops())
    reach = max(ANCHOR_STOCK / 2.0, arm_tip, hoop)
    return (-reach, reach)


def anchor_surface() -> list:
    """[(y, z, inboard)] over the whole hull-facing side of the anchor.

    `y` and `z` are in the anchor's own frame — `y` fore-and-aft from its
    station, `z` up from its ring seat — and `inboard` is how far THAT point
    of the anchor's skin reaches towards the ship from the anchor's origin.
    It is the shape itself, not a bounding box round it, and that difference
    is what `anchor_bearing_x` is built on.
    """
    out = []
    crown = -ANCHOR_SHANK
    top = ANCHOR_RING_SEAT
    for i in range(17):                                   # the shank
        f = i / 16.0
        out.append((0.0, crown + (top - crown) * f, anchor_shank_section(f)[0]))
    hx = anchor_shank_section(0.0)[0]                     # the crown
    for z, d in ((crown - ANCHOR_CROWN_DEPTH, hx * 0.70),
                 (crown - ANCHOR_CROWN_DEPTH * 0.45, hx),
                 (crown + 0.12, hx)):
        out.append((0.0, z, d))
    for sign in (-1.0, 1.0):                              # the stock
        for i in range(9):
            f = i / 8.0
            shx, shz = anchor_stock_section(f)
            for dz in (-shz * 0.5, 0.0, shz * 0.5):
                out.append((sign * f * ANCHOR_STOCK / 2.0,
                            ANCHOR_STOCK_Z + dz, shx))
    for y, half in anchor_hoops():                        # and its hoops
        shx, _shz = anchor_stock_section(abs(y) / (ANCHOR_STOCK / 2.0))
        for dy in (-half, 0.0, half):
            out.append((y + dy, ANCHOR_STOCK_Z, shx + ANCHOR_HOOP_PROUD))
    for sign in (-1.0, 1.0):                              # the arms
        for i in range(17):
            ay, az, half, ty, tz = anchor_arm_point(i / 16.0)
            out.append((sign * ay, crown + az, half))
        ty, tz = anchor_arm_point(1.0)[3:]                # and their bills
        ay, az, _h, _ty, _tz = anchor_arm_point(1.0)
        out.append((sign * (ay + ty * ANCHOR_BILL), crown + az + tz * ANCHOR_BILL,
                    0.0))
        f0, f1 = ANCHOR_FLUKE_SPAN                        # and their flukes
        for i in range(17):
            fy, fz, width = anchor_fluke_centre(f0 + (f1 - f0) * i / 16.0)
            out.append((sign * fy, crown + fz, ANCHOR_FLUKE_HALF_THICK))
    for i in range(16):                                   # the ring
        a = 2.0 * math.pi * i / 16.0
        out.append((ANCHOR_RING_MAJOR * math.cos(a),
                    ANCHOR_RING_SEAT + ANCHOR_RING_MAJOR * (1.0 + math.sin(a)),
                    ANCHOR_RING_MINOR))
    return out


def anchor_inboard_reach() -> float:
    """How far the anchor reaches towards the hull from its own origin.

    The SHANK and nothing deeper: `anchor_bearing_x` stands the shank's
    inboard face on the planking, so anything of the anchor further in than
    this is buried in the ship.
    """
    return max(ANCHOR_SHANK_SECTION[0][0],
               ANCHOR_STOCK_SECTION[0][0],
               ANCHOR_ARM_SECTION[0],
               ANCHOR_RING_MINOR,
               ANCHOR_FLUKE_HALF_THICK)


def deck_rise_at(p: FrigateParams, t: float) -> float:
    """Which walking surface is uppermost at station t: platform rise, or 0."""
    _check_t(t)
    return _rail_rise_at(p, t)


def deck_spot(p: FrigateParams, t: float, x_frac: float) -> Point:
    """A point on whichever deck is uppermost at station t, x_frac across it."""
    _check_t(t)
    rise = deck_rise_at(p, t)
    x = x_frac * deck_half_beam(p, t)
    return (x, station_y(p, t), deck_z_at(p, t, x, rise))


def furniture_placements(p: FrigateParams) -> list[dict]:
    """Every loose fitting on deck, placed on the surface it actually stands on."""
    p.validate()
    plan = p.furniture_plan
    out = []
    for kind, t, x_frac, yaw in plan.stations:
        x, y, z = deck_spot(p, t, x_frac)
        if kind == "boat":
            z += plan.boat_on_skids
        out.append({"kind": kind, "origin": (x, y, z), "yaw_deg": yaw})
    # THE TOPMOST RAIL CAP AT THE TAFFRAIL. On the frigate that is her waist
    # bulwark cap, `sheer(1.0) + bulwark_h`, to the bit; on the galleon it is
    # her POOP's cap, 6.00 m higher than the waist cap the old sum named.
    rail_z = taffrail_z(p)
    half = stern_half_width(p, rail_z)
    n = plan.lanterns
    for i in range(n):
        f = 0.0 if n == 1 else (i / (n - 1)) * 2.0 - 1.0
        out.append({
            "kind": "lantern",
            "origin": (f * plan.lantern_spread * half,
                       station_y(p, 1.0) + 0.12, rail_z),
            "yaw_deg": 0.0,
        })
    z_anchor = anchor_ring_z(p)
    for sign in (-1.0, 1.0):
        out.append({
            "kind": "anchor",
            "origin": (sign * anchor_bearing_x(p),
                       station_y(p, plan.anchor_t), z_anchor),
            "yaw_deg": 0.0 if sign > 0 else 180.0,
        })
    return out


def anchor_ring_z(p: FrigateParams) -> float:
    """Height of the anchor ring: a drop below the rail cap at its own station."""
    t = p.furniture_plan.anchor_t
    return sheer(p, t) + p.bulwark_h - ANCHOR_DROP


def anchor_bearing_x(p: FrigateParams) -> float:
    """How far outboard the anchor hangs, from WHERE IT BEARS, not from its ring.

    The ring used to set it: x was the bulwark's outer face at ring height.
    An anchor is 2.2 m of shank and 1.5 m of arms hanging BELOW and ABAFT that
    ring, and a bow flares 0.33 m across that footprint, so the ship's side
    came out to meet it: the fluke sat 0.226 m INSIDE the rendered planking it
    is ruled to LIE AGAINST, and the whole after arm was swallowed. Measuring
    at the ring is measuring the one point of the anchor that is not touching
    anything.

    So: take the ship's side AT EVERY POINT OF THE ANCHOR'S OWN SKIN, and set
    the anchor out so that its DEEPEST point beds in by exactly `ANCHOR_BED`.
    A rigid anchor on a doubly-curved bow must bed somewhere; this says where
    and how far, and it guarantees contact by construction.

    THE SHAPE, NOT A BOX ROUND IT, AND THAT IS NOT A REFINEMENT. The first
    version of this took the widest the hull gets anywhere under the anchor's
    FOOTPRINT and stood the shank's inboard face on that, which is the same
    arithmetic applied to a solid block of half-thickness `ANCHOR_HALF_THICK`
    filling the whole footprint. The old anchor was near enough that block —
    boxes at full thickness over a wide span — so it happened to hold. A real
    admiralty anchor is mostly air: at the bow's widest point under the
    footprint there is nothing of it but the tip of an arm 30 mm thick, so the
    block assumption lifted the whole anchor 26 mm clear of the ship.
    MEASURED, and `check_directions` caught it exactly: `Anchor_ is ON Hull`
    went to 0 contact vertices with the complaint "it crosses the object
    without touching it, which is neither INTO nor ON".

    NOTHING ABOVE THE RAIL CAP IS CONSIDERED. The ring stands 0.19 m over the
    cap, where there is no ship's side to bear on — only open deck — and the
    half-width functions are not defined to mean anything up there.
    """
    p.validate()
    y0 = station_y(p, p.furniture_plan.anchor_t)
    z0 = anchor_ring_z(p)
    deepest = 0.0
    for dy, dz, inboard in anchor_surface():
        y, z = y0 + dy, z0 + dz
        t = _clamp01(t_of_y(p, y))
        if z >= sheer(p, t) + p.bulwark_h:
            continue
        side = (hull_half_width(p, t, z) if z < sheer(p, t)
                else bulwark_half_width(p, t, z))
        deepest = max(deepest, side + inboard)
    return deepest - ANCHOR_BED


# --- Task 12 revisited: the shapes the fittings are made of ----------------
#
# Task 12 placed every fitting correctly and then drew it out of a handful of
# boxes — 72 triangles for an anchor, 44 for a barrel — which is how deck
# furniture came to spend 24% of its 5,000 line. Placement was never the
# problem. These are the parts of the richer shapes that are arithmetic rather
# than emission, so they can be tested off Blender.

# Half-section of the launch, (u across, v down), gunwale to keel to gunwale.
BOAT_SECTION = (
    (-1.0, 0.0), (-0.90, -0.46), (-0.66, -0.80), (-0.30, -0.97),
    (0.0, -1.0),
    (0.30, -0.97), (0.66, -0.80), (0.90, -0.46), (1.0, 0.0),
)
BOAT_STATIONS = 11     # sections along the length, stem to transom
BOAT_THWARTS = 5
_BOAT_END_PLAN = 0.12  # the launch keeps this much beam at its fine ends
GRATING_BATTEN = 0.045
GRATING_PITCH = 0.115


def boat_station(f: float) -> tuple:
    """(plan, rise) of the launch at `f` of its length, stem 0 to transom 1.

    `plan` scales the half beam, `rise` the depth. Both are symmetric end for
    end, because the launch is double-ended in plan and the thwarts that cross
    it are laid out against this and nothing else.
    """
    if not 0.0 <= f <= 1.0:
        raise ValueError(f"boat station must lie in [0, 1], got {f}")
    s = 2.0 * f - 1.0
    return (max(_BOAT_END_PLAN, (1.0 - s * s) ** 0.5), 1.0 - 0.45 * s * s)


def boat_thwart_fracs() -> list:
    """Where the thwarts cross the launch, as fractions of its length.

    Evenly spaced and symmetric about midships, and kept off the fine ends
    where a thwart would be shorter than a man is wide.
    """
    n = BOAT_THWARTS
    lo, hi = 0.22, 0.78
    return [lo + (hi - lo) * i / (n - 1) for i in range(n)]


def grating_lattice(clear: float, batten: float = GRATING_BATTEN,
                    pitch: float = GRATING_PITCH) -> list:
    """Batten centres across a hatch's clear opening, centred on the opening.

    The battens are laid at `pitch` and the whole lattice is centred, so the
    two outermost always stand clear of the coaming they sit inside. A narrow
    opening still gets two battens rather than none: a grating with no timber
    in it is a hole, and the coaming is already the hole.
    """
    if batten >= pitch:
        raise ValueError(f"batten {batten} must be narrower than pitch {pitch}")
    n = max(2, int((clear - batten) // pitch) + 1)
    span = (n - 1) * pitch
    while span + batten >= clear and n > 2:
        n -= 1
        span = (n - 1) * pitch
    return [-span / 2.0 + pitch * i for i in range(n)]


# --- Task 8 revisited: how a spar is actually shaped -----------------------
#
# Spec section 5's "8-sided tapered cylinders" was already met — MAST_SIDES has
# been 8 since Task 8. The rig came to 808 triangles because every one of the
# nine mast segments was a single ring-to-ring tube, every yard half was one
# more, and the tops were bare plates with no ironwork on them. The side count
# was never the defect. What follows is the arithmetic the richer spars need.

MAST_DIVISIONS = 4       # rings along each mast segment, so the taper is a curve
YARD_DIVISIONS = 4       # and along each half of a yard
BOWSPRIT_DIVISIONS = 4
TOP_RAIL_STANCHIONS = 10
TOP_RAIL_H = 0.95        # rail above the top it guards
MAST_CAP_THICK = 0.24
_CAP_CLEAR = 0.05        # timber between the cap's eye and the spar through it
_CAP_OUT = 1.85          # cap outer radius, as a multiple of its own eye
_TRESTLE_GAP = 1.55      # trestletree inner face, as a multiple of the spar
_TRESTLE_LEN = 0.92      # trestletree length, as a fraction of its own top
_TRESTLE_THICK = 0.11


def spar_radius(r_root: float, r_tip: float, f: float) -> float:
    """Radius at fraction `f` root-to-tip of a spar tapering ELLIPTICALLY.

    A yard is squared at the slings and falls away toward the arm; a mast is
    full at the partners and falls away toward the head. Neither is a cone, and
    a straight taper between the two stated radii is visibly too thin over the
    whole middle of the spar — which is most of what anyone sees of it.
    """
    import math

    k = (r_tip / r_root) ** 2 if r_root > 0.0 else 0.0
    return r_root * math.sqrt(max(0.0, 1.0 - (1.0 - k) * f * f))


def spar_radius_at(p: FrigateParams, name: str, z: float) -> float:
    """The widest mast timber standing at height z on one mast.

    At a doubling two spars overlap, so this is the maximum over the segments
    that actually reach that height — which is what a cap or a trestletree has
    to clear.
    """
    out = 0.0
    for z0, z1, r0, r1 in mast_segments(p, name):
        if z0 - 1e-9 <= z <= z1 + 1e-9 and z1 > z0:
            out = max(out, spar_radius(r0, r1, (z - z0) / (z1 - z0)))
    return out


def mast_cap(p: FrigateParams, name: str, which: int) -> tuple:
    """(height, eye radius, outer radius, thickness) of one mast cap.

    `which` is 0 for the cap at the top and 1 for the cap at the crosstrees —
    the two doublings, where the heel of one spar is fished alongside the head
    of the one below and an iron-bound cap holds the pair together.
    """
    z = (top_platform(p, name)[0] if which == 0 else crosstrees(p, name)[0])
    eye = spar_radius_at(p, name, z) + _CAP_CLEAR
    return (z, eye, eye * _CAP_OUT, MAST_CAP_THICK)


def trestletrees(p: FrigateParams, name: str, which: int) -> tuple:
    """(height, half gap athwartships, length aft, length forward, thickness).

    The pair of fore-and-aft timbers the top is framed on. They straddle the
    mast — a trestletree that runs THROUGH the spar it carries is a drawing
    error, so the gap is set off the spar's own radius at that height. The two
    lengths are measured from the mast axis aft and forward separately, because
    the lower top they frame is itself cut away forward: a trestletree that ran
    its full length forward would stand out past the fore edge into the canvas
    the cut was made to clear.
    """
    z = (top_platform(p, name) if which == 0 else crosstrees(p, name))[0]
    _half_x, aft, fwd = top_extents(p, name, which)
    return (z, spar_radius_at(p, name, z) * _TRESTLE_GAP,
            aft * _TRESTLE_LEN, fwd * _TRESTLE_LEN, _TRESTLE_THICK)


def perimeter_points(outline: list, n: int) -> list:
    """`n` points spaced equally by ARC LENGTH round a closed plan polygon.

    Spacing by arc length rather than by angle is what lets a stanchion stand on
    a straight fore edge as happily as on a curved after rim. Phased half a step
    from the polygon's first vertex, which for `top_outline` is the point dead
    aft on the centreline, so the set comes out symmetric across it — a top's
    rail is.
    """
    import math

    m = len(outline)
    legs = [math.dist(outline[i], outline[(i + 1) % m]) for i in range(m)]
    total = sum(legs)
    out = []
    for i in range(n):
        s = total * (i + 0.5) / n
        for j, leg in enumerate(legs):
            if s <= leg or j == m - 1:
                f = s / leg if leg > 0.0 else 0.0
                ax, ay = outline[j]
                bx, by = outline[(j + 1) % m]
                out.append((ax + f * (bx - ax), ay + f * (by - ay)))
                break
            s -= leg
    return out


def top_rail_posts(p: FrigateParams, name: str) -> list:
    """(x, y) of each rail stanchion, standing on the rim of its own lower top."""
    return perimeter_points(top_outline(p, name, 0), TOP_RAIL_STANCHIONS)


# --- Task 13 recarved: the Minerva figurehead -------------------------------
#
# The carving is laid out in its OWN frame, not the ship's: an axis raked
# FIG_RAKE_DEG forward of vertical running from the heel ring centre, tucked at
# the stem head, up to the helmet crown apex. `figure_point` is the only place
# that frame is converted into ship coordinates.
#
# Scale, with both endpoints named: heel-ring-centre to helmet-crown-apex is
# FIG_HEIGHT along that axis. Gardiner's three sheer draughts (Flora, Alcmene,
# Lively) put a frigate's figurehead at about the height of a man, 1.5-1.8 m,
# which is 0.35-0.42 of waterline-to-rail-cap-at-maximum-beam (4.3307 m on this
# hull). The shape this replaces ran about 2.7 m on its own axis and read as a
# lump rather than as carving.
#
# The drapery is the point. `fold_ring` varies each ring's radius with angle,
# r(theta) = r0 * (1 + a * cos(N * theta)), with the amplitude `a` near zero at
# the throat and deepest at the hem. FIG_SIDES is exactly 2 * FIG_FOLDS so
# cos(N * theta) evaluates to +-1 at every vertex: each crest and each trough
# lands ON a vertex and none is sampled on its flank, where a fold reads as a
# wobble. That is what makes the richness cheap -- a radial ripple costs ring
# resolution and nothing else.

FIG_HEIGHT = 1.68        # heel ring centre to helmet crown apex, along the axis
FIG_RAKE_DEG = 34.0      # how far the figure's own axis leans forward of vertical
FIG_HEEL_FWD = 0.45      # heel ring centre, forward of the stem at station 0
FIG_HEEL_DROP = 0.300    # heel ring centre, below the sheer at station 0
FIG_SIDES = 24           # ring points round the body
FIG_FOLDS = 12           # drapery folds round the body; FIG_SIDES == 2 * FIG_FOLDS
FIG_HEAD_SIDES = 12
FIG_ARM_SIDES = 8
FIG_SHIELD_SIDES = 12
FIG_SPEAR_SIDES = 6
FIG_DRAPERY_SIDES = 12

# (name, s along the axis, half-breadth, half-depth, fold amplitude).
# Breadth is athwartships and depth is fore-and-aft in the figure's own frame:
# a torso is wider than it is deep, so the fold rides on an ellipse.
FIG_BODY = (
    ("heel",       0.00, 0.145, 0.115, 0.080),
    ("drapefoot",  0.09, 0.175, 0.145, 0.140),
    ("skirt",      0.20, 0.245, 0.190, 0.170),
    ("hip",        0.30, 0.272, 0.205, 0.160),
    ("hem",        0.37, 0.298, 0.222, 0.180),
    ("abovehem",   0.43, 0.250, 0.190, 0.140),
    ("waist",      0.53, 0.222, 0.165, 0.100),
    ("bust",       0.63, 0.238, 0.168, 0.070),
    ("shoulder",   0.700, 0.248, 0.155, 0.050),
    ("collar",     0.755, 0.228, 0.168, 0.085),
    ("collartop",  0.790, 0.150, 0.115, 0.030),
    ("throat",     0.825, 0.062, 0.058, 0.000),
)

# (name, s, half-breadth, half-depth, facing offset). The head is tilted UP and
# forward: the jaw stands out ahead of the skull and the helmet's crown sweeps
# back over it, so the facing offset falls from the jaw to the crown.
FIG_HEAD = (
    ("neck",  0.820, 0.062, 0.060,  0.055),
    ("jaw",   0.868, 0.092, 0.088,  0.103),
    ("face",  0.912, 0.114, 0.107,  0.090),
    ("brow",  0.950, 0.124, 0.116,  0.042),
    ("skull", 0.980, 0.096, 0.100, -0.003),
    ("crown", 1.000, 0.046, 0.048, -0.062),
)

# (s, athwartships offset, facing offset, radius). Shoulder down to the hand.
FIG_ARM = (
    (0.700, 0.244, 0.020, 0.088),
    (0.570, 0.272, 0.070, 0.064),
    (0.450, 0.270, 0.115, 0.052),
    (0.345, 0.252, 0.145, 0.056),
)

# The round shield hangs at one hip EDGE-ON to a viewer ahead, so its face looks
# outboard: thin athwartships, round in the ship's own fore-and-aft plane.
FIG_SHIELD_S = 0.33
FIG_SHIELD_B = 0.02
FIG_SHIELD_R = 0.235
FIG_SHIELD_X = ((0.300, 0.208), (0.325, 0.235), (0.365, 0.235), (0.390, 0.202))

# (s, athwartships offset, facing offset, radius), butt to point. Held
# diagonally across the body, hand at the hip, point up past the far shoulder.
FIG_SPEAR = (
    (0.155, -0.310, 0.240, 0.020),
    (0.330, -0.268, 0.185, 0.026),
    (0.430, -0.244, 0.155, 0.030),
    (0.720, -0.205, 0.113, 0.022),
    (0.845, -0.188, 0.095, 0.046),
    (0.905, -0.175, 0.085, 0.006),
)

# The lower drapery, in SHIP coordinates: it leaves the heel and sweeps down and
# aft until it is let into the stem, which is what truncates the figure below.
FIG_DRAPERY = (
    (19.42, 3.545, 0.165, 0.125, 0.10),
    (19.26, 3.390, 0.220, 0.155, 0.16),
    (19.08, 3.215, 0.225, 0.150, 0.15),
    (18.90, 3.040, 0.165, 0.105, 0.10),
)
FIG_DRAPERY_FOLDS = 6

FIG_FOOT = ((-0.055, 19.100, 3.000), (0.055, 19.280, 3.120))

# The trailboards. Their UPPER EDGE is the curve a head rail will later be
# faired into, so it is specified as a curve and not as the two flat
# parallelograms it replaces: steep where it leaves the bow, flattening to
# nearly level where it runs out into the figure's own drapery, with no kink
# and no inflection anywhere between. Head rails themselves are deliberately
# NOT built here.
# Its two endpoints are stated against two NAMED LANDMARKS of whatever hull
# this is built on — the STEM AT THE RAIL and the RAIL CAP AT THE STEM — and
# live on `p.head_form`, because a galleon's board is 3.40 m long where this
# frigate's is 1.25 m. On the frigate the offsets reproduce the literals this
# replaces, (18.10, 4.30) and (19.35, 3.66), EXACTLY: stem-at-the-rail is
# y = 19.0 and rail-cap-at-the-stem is z = 5.5, both exact in binary, and
# 19.0 - 0.90, 19.0 + 0.35, 5.5 - 1.20 and 5.5 - 1.84 are each exact too.
# `tests/test_frigate_frozen.py` is what proves it rather than this comment.


def trailboard_aft(p: FrigateParams) -> tuple[float, float]:
    """(y, z) where a head rail comes down onto the trailboard's aft end."""
    h = p.head_form
    return (station_y(p, 0.0) - h.board_aft_abaft_stem,
            sheer(p, 0.0) + p.bulwark_h - h.board_aft_below_cap)


def trailboard_fwd(p: FrigateParams) -> tuple[float, float]:
    """(y, z) where the trailboard runs out into the carving."""
    h = p.head_form
    return (station_y(p, 0.0) + h.board_fwd_fwd_of_stem,
            sheer(p, 0.0) + p.bulwark_h - h.board_fwd_below_cap)


def fold_ring(sides: int, rx: float, ry: float, amp: float,
              folds: int) -> list[tuple[float, float]]:
    """One drapery ring as (athwartships, facing) offsets in the figure's frame.

    r(theta) = r0(theta) * (1 + amp * cos(folds * theta)), r0 an ellipse.
    """
    import math

    out = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        m = 1.0 + amp * math.cos(folds * a)
        out.append((rx * m * math.cos(a), ry * m * math.sin(a)))
    return out


def _fig_index(table, name: str) -> int:
    return next(i for i, row in enumerate(table) if row[0] == name)


FIG_HEM_RING = _fig_index(FIG_BODY, "hem")
FIG_COLLAR_RING = _fig_index(FIG_BODY, "collar")
FIG_SHOULDER_RING = _fig_index(FIG_BODY, "shoulder")


def figure_axis(p: FrigateParams) -> tuple[Point, Point, Point]:
    """(heel ring centre, unit vector heel->crown, unit vector the figure faces).

    The facing vector points forward AND down, perpendicular to the axis, which
    is why a forward offset lowers a point: the figure leans out over the water.
    """
    import math

    rake = math.radians(FIG_RAKE_DEG)
    heel = (0.0,
            station_y(p, 0.0) + FIG_HEEL_FWD,
            sheer(p, 0.0) - FIG_HEEL_DROP)
    up = (0.0, math.sin(rake), math.cos(rake))
    fwd = (0.0, math.cos(rake), -math.sin(rake))
    return heel, up, fwd


def figure_point(p: FrigateParams, s: float, a: float, b: float) -> Point:
    """A point `s` of the way up the figure's axis, `a` athwartships, `b` forward."""
    heel, up, fwd = figure_axis(p)
    d = FIG_HEIGHT * s
    return (heel[0] + a,
            heel[1] + up[1] * d + fwd[1] * b,
            heel[2] + up[2] * d + fwd[2] * b)


def figure_body_rings(p: FrigateParams) -> list[list[Point]]:
    """The fluted body, heel to throat. The drapery folds live here."""
    rings = []
    for _name, s, rx, ry, amp in FIG_BODY:
        rings.append([figure_point(p, s, a, b)
                      for a, b in fold_ring(FIG_SIDES, rx, ry, amp, FIG_FOLDS)])
    return rings


def figure_head_rings(p: FrigateParams) -> list[list[Point]]:
    """Neck, face and helmet. No folds: a helmet is beaten metal, not cloth."""
    rings = []
    for _name, s, rx, ry, b in FIG_HEAD:
        rings.append([figure_point(p, s, a, b + db)
                      for a, db in fold_ring(FIG_HEAD_SIDES, rx, ry, 0.0, 1)])
    return rings


def figure_crown(p: FrigateParams) -> Point:
    """The highest point of the helmet, which must be the highest point of all."""
    return max(figure_head_rings(p)[-1], key=lambda pt: pt[2])


def figure_arm_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    """One arm, shoulder to hand, down the side of the robe."""
    rings = []
    for s, x, b, r in FIG_ARM:
        rings.append([figure_point(p, s, sign * x + a, b + db)
                      for a, db in fold_ring(FIG_ARM_SIDES, r, r, 0.0, 1)])
    return rings


def figure_shield(p: FrigateParams) -> dict:
    """The round shield at the starboard hip, and the rings that build it."""
    import math

    _heel, up, fwd = figure_axis(p)
    hub = figure_point(p, FIG_SHIELD_S, 0.0, FIG_SHIELD_B)
    rings = []
    for x, r in FIG_SHIELD_X:
        ring = []
        for i in range(FIG_SHIELD_SIDES):
            a = 2 * math.pi * i / FIG_SHIELD_SIDES
            c, s = r * math.cos(a), r * math.sin(a)
            ring.append((hub[0] + x,
                         hub[1] + up[1] * c + fwd[1] * s,
                         hub[2] + up[2] * c + fwd[2] * s))
        rings.append(ring)
    xs = [x for x, _r in FIG_SHIELD_X]
    return {
        "centre": (hub[0] + (min(xs) + max(xs)) / 2.0, hub[1], hub[2]),
        "radius": FIG_SHIELD_R,
        "thick": max(xs) - min(xs),
        "rings": rings,
    }


def figure_spear_rings(p: FrigateParams) -> list[list[Point]]:
    rings = []
    for s, x, b, r in FIG_SPEAR:
        rings.append([figure_point(p, s, x + a, b + db)
                      for a, db in fold_ring(FIG_SPEAR_SIDES, r, r, 0.0, 1)])
    return rings


def figure_spear(p: FrigateParams) -> tuple[Point, Point]:
    """(butt, point) of the spear, as ship coordinates."""
    first, last = FIG_SPEAR[0], FIG_SPEAR[-1]
    return (figure_point(p, first[0], first[1], first[2]),
            figure_point(p, last[0], last[1], last[2]))


def figure_drapery(p: FrigateParams) -> list[dict]:
    """The lower drapery, sweeping down and aft until it is let into the stem.

    `FIG_DRAPERY` is in the FRIGATE's ship coordinates, so it is carried
    with the figure as `figure_foot_box` is (`_figure_shift`)."""
    _dx, dy, dz = _figure_shift(p)
    return [{"centre": (0.0, y + dy, z + dz), "radius": max(rx, ry),
             "rx": rx, "ry": ry, "amp": amp}
            for y, z, rx, ry, amp in FIG_DRAPERY]


def figure_drapery_rings(p: FrigateParams) -> list[list[Point]]:
    _heel, up, fwd = figure_axis(p)
    rings = []
    for item in figure_drapery(p):
        cx, cy, cz = item["centre"]
        ring = [(cx + c, cy + fwd[1] * s, cz + fwd[2] * s)
                for c, s in fold_ring(FIG_DRAPERY_SIDES, item["rx"], item["ry"],
                                      item["amp"], FIG_DRAPERY_FOLDS)]
        rings.append(ring)
    return rings


def trailboard_top_edge(p: FrigateParams, sign: float) -> list[Point]:
    """The upper edge of one trailboard, aft end first. A head rail meets this.

    Fair by construction: z falls as (1 - u) ** TRAILBOARD_EXP, which is convex
    on [0, 1], so every segment is less steep than the one abaft it and the
    forward end runs out level. Its outer face follows the bow's own half-width
    plus TRAILBOARD_PROUD where there is hull under it, then draws in to
    TRAILBOARD_TUCK of that forward of the stem, where the figure takes over.
    """
    h = p.head_form
    (y0, z0), (y1, z1) = trailboard_aft(p), trailboard_fwd(p)
    y_stem = station_y(p, 0.0)
    out = []
    for i in range(h.board_stations):
        u = i / (h.board_stations - 1)
        y = y0 + (y1 - y0) * u
        z = z1 + (z0 - z1) * (1.0 - u) ** h.board_exp
        w = bulwark_half_width(p, t_of_y(p, y), z) + h.board_proud
        if y > y_stem:
            g = (y - y_stem) / (y1 - y_stem)
            w *= 1.0 - (1.0 - h.board_tuck) * g ** 1.4
        out.append((sign * w, y, z))
    return out


def trailboard_rings(p: FrigateParams, sign: float) -> list[list[Point]]:
    """Each station as a four-cornered section: outer top, outer bottom, inner
    bottom, inner top. Bridged, that is a carved board with a real thickness."""
    h = p.head_form
    rings = []
    edge = trailboard_top_edge(p, sign)
    for i, (x, y, z) in enumerate(edge):
        u = i / (h.board_stations - 1)
        depth = h.board_depth[0] + (h.board_depth[1] - h.board_depth[0]) * u
        xi = x - sign * h.board_thick
        rings.append([(x, y, z), (x, y, z - depth),
                      (xi, y, z - depth), (xi, y, z)])
    return rings


def _figure_shift(p: FrigateParams) -> Point:
    """How far THIS ship's figure heel ring stands from the frigate's. The
    parts of Minerva measured in the frigate's own ship coordinates (her
    foot and her lower drapery) are carried by it; on the frigate it is
    exactly zero, so they come back to the bit."""
    here = figure_axis(p)[0]
    there = figure_axis(FrigateParams())[0]
    return tuple(a - b for a, b in zip(here, there))


def figure_foot_box(p: FrigateParams) -> tuple[Point, Point]:
    """One bare foot, peeping forward from under the lower drapery.

    `FIG_FOOT` is a WORLD box measured off the frigate, so it is carried
    with the figure: offset by how far this ship's heel ring stands from the
    frigate's. On the frigate that offset is exactly zero and the box comes
    back to the bit; on the sloop it brings the foot home from the
    frigate's bow, 10 m ahead of her own stem.
    """
    d = _figure_shift(p)
    lo, hi = FIG_FOOT
    return (tuple(c + e for c, e in zip(lo, d)),
            tuple(c + e for c, e in zip(hi, d)))


def _loft_tris(rings: int, sides: int) -> int:
    """Triangles in a capped tube of `rings` rings of `sides` points each."""
    return 2 * (rings - 1) * sides + 2 * (sides - 2)


def figure_triangles(p: FrigateParams) -> int:
    """What the carving costs, counted from the tables `dressing` emits.

    The dressing budget line is 2,000 triangles and `Sail_Patches` took 252 of
    it in the interpenetration pass (it was 28 when the carving was designed),
    with `Damage` on 234, so the carving has about 1,500 to spend and is aimed
    at 1,200. Overspending the line fails `check_budget` from the other side.
    """
    return (
        _loft_tris(len(FIG_BODY), FIG_SIDES)
        + _loft_tris(len(FIG_HEAD), FIG_HEAD_SIDES)
        + 2 * _loft_tris(len(FIG_ARM), FIG_ARM_SIDES)
        + _loft_tris(len(FIG_SHIELD_X), FIG_SHIELD_SIDES)
        + _loft_tris(len(FIG_SPEAR), FIG_SPEAR_SIDES)
        + _loft_tris(len(FIG_DRAPERY), FIG_DRAPERY_SIDES)
        + 12
        + trailboard_triangles(p)
    )


def trailboard_triangles(p: FrigateParams) -> int:
    """Both boards. They belong to the carving object, whichever carving it is."""
    return 2 * _loft_tris(p.head_form.board_stations, 4)


def figure_all_points(p: FrigateParams) -> list[Point]:
    """Every vertex of the carving, in the order `dressing` emits them."""
    out = []
    for rings in (figure_body_rings(p), figure_head_rings(p),
                  figure_arm_rings(p, 1.0), figure_arm_rings(p, -1.0),
                  figure_shield(p)["rings"], figure_spear_rings(p),
                  figure_drapery_rings(p),
                  trailboard_rings(p, 1.0), trailboard_rings(p, -1.0)):
        for ring in rings:
            out.extend(ring)
    (x0, y0, z0), (x1, y1, z1) = figure_foot_box(p)
    out += [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    return out


def figure_bounds(p: FrigateParams) -> tuple[Point, Point]:
    """The carving's bounding box, which is what `check_dressing` holds it to."""
    pts = figure_all_points(p)
    return (tuple(min(pt[k] for pt in pts) for k in range(3)),
            tuple(max(pt[k] for pt in pts) for k in range(3)))


def figure_height(p: FrigateParams) -> float:
    """HEEL RING CENTRE to HELMET CROWN APEX. Both endpoints named on purpose:
    this project once certified a hull 1.35x too tall from an unnamed span."""
    import math

    return math.dist(figure_point(p, 0.0, 0.0, 0.0), figure_crown(p))
