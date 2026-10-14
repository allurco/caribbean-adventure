"""Battle damage. Spec section 6 step 14, and spec section 3's destructive phase.

Spec section 3: weathering and battle damage are irregular BY DEFINITION, and
expressed parametrically they come out uniform, which is the one thing damage
must not look like. So this pass is seeded-random rather than derived — but
seeded, not loose: `DAMAGE_SEED` means the ship rebuilds identically and a
screenshot taken today matches the one taken tomorrow.

It is the only pass that takes geometry AWAY. The plan below is therefore the
single source of truth for the final state, and `check_rails` and `check_sails`
read it so they assert what the ship actually is after Phase 2, not what Phase 1
left behind.

The pure plan imports no bpy; `apply_damage` is the bpy half.
"""

import math
import random

from . import profiles
from .params import FrigateParams

DAMAGE_SEED = 1797
RAIL_GAPS = 3           # whole rail bays shot away, spread over both sides
CANVAS_TEARS = 7        # grid quads torn out of the canvas, at a leech or a foot
SHOT_SCARS = 9          # shot marks in the topside planking
SCAR_R = 0.40           # outer radius of a scar
SCAR_JITTER = (0.7, 1.25)  # the seeded draw's range, as fractions of SCAR_R
SCAR_DRAW_GUARD = 500      # seeded draws before the placement gives up
SCAR_RIM = 0.002        # how far the splintered rim stands proud of the skin
SCAR_SHELF = 0.075      # how far in the splintered shelf is driven
SCAR_DEPTH = 0.20       # how far the middle is driven in
SPLINTERS_PER_GAP = 4
SPLINTER_LEN = 0.42


def scar_size(p: FrigateParams) -> tuple[float, float, float, float]:
    """(radius, rim, shelf, depth) of HER craters: the frigate's figures
    times `damage_form.scar_scale`, bar the 2 mm rim, which is the joint
    tolerance that keeps a crater touching the skin and not a size."""
    k = p.damage_form.scar_scale
    return (SCAR_R * k, SCAR_RIM, SCAR_SHELF * k, SCAR_DEPTH * k)


def _rng() -> random.Random:
    return random.Random(DAMAGE_SEED)


def rail_gaps(p: FrigateParams) -> list[tuple[int, float, int]]:
    """(run index, side, bay index) of every rail bay shot away."""
    p.validate()
    rng = _rng()
    candidates = []
    for run_i, (t0, t1) in enumerate(profiles.rail_runs(p)):
        bays = len(profiles.stanchion_ts(p, t0, t1)) - 1
        for sign in (-1.0, 1.0):
            for bay in range(bays):
                candidates.append((run_i, sign, bay))
    if len(candidates) < RAIL_GAPS:
        # A ship whose raised decks are all castles builds no open rail, so
        # there is none to shoot away. Returning what there is, rather than
        # raising out of `random.sample`, because "nothing" is the correct
        # answer and not an error -- and a ship with FEWER bays than the
        # damage plan wants is the same statement, one bay at a time.
        return sorted(candidates)
    return sorted(rng.sample(candidates, RAIL_GAPS))


def gap_y_span(p: FrigateParams, run_i: int, bay: int) -> tuple[float, float]:
    """(aft y, forward y) of a shot-away bay: the rail span plus its AFT stanchion.

    The forward stanchion is deliberately left standing — a bay has two ends and
    they are shared with the bays either side, so taking both would make two
    adjacent gaps indistinguishable from one long one.
    """
    t0, t1 = profiles.rail_runs(p)[run_i]
    ts = profiles.stanchion_ts(p, t0, t1)
    half = p.rail_form.stanchion_w / 2.0
    return (profiles.station_y(p, ts[bay + 1]) - half - 1e-4,
            profiles.station_y(p, ts[bay]) - 1e-4)


def _sail_list(p: FrigateParams):
    """Deferred: `sailplan` reads `profiles` and `wind`, and this module is
    imported early in the pass order. The dependency is one-way at module
    scope."""
    from . import sailplan
    return sailplan.all_sails(p)


def canvas_tears(p: FrigateParams, nu: int, nv: int) -> list[tuple[str, int, int, int]]:
    """(mast, tier, column, row) of every grid quad torn out of the canvas.

    Only at a leech or along the foot. A hole in the middle of a sail reads as a
    modelling mistake; a tear that runs in from an edge reads as damage.
    """
    rng = _rng()
    rng.random()
    # THE SAILS THIS SHIP ACTUALLY SETS, of whatever kind. This was
    # `[(m, k) for m in profiles.mast_names(p) for k in range(3)]` — the
    # frigate's three tiers on every mast, written as a loop — and on the
    # galleon, which sets 2 + 3 + a lateen, it tore `('fore', 2)`: canvas that
    # does not exist. The same class of defect as `rig.yard_order`'s old
    # `range(YARD_TIERS)`.
    #
    # Masted sails only: a headsail's "mast" is None and a tear keyed on None
    # could not be found again. THE FRIGATE CANNOT MOVE — her derived list is
    # the hardcoded one element for element and in the same order, which is
    # what the seeded draw picks out of, and there is a test that says so.
    sails = [(m, sl.tier) for m, sl in _sail_list(p) if m is not None]
    edges = [(0, j) for j in range(nv - 1)] + [(nu - 2, j) for j in range(nv - 1)] \
        + [(i, 0) for i in range(1, nu - 2)]
    out = set()
    while len(out) < CANVAS_TEARS:
        mast, tier = rng.choice(sails)
        i, j = rng.choice(edges)
        out.add((mast, tier, i, j))
    return sorted(out)


def tear_centre(p: FrigateParams, mast: str, tier: int, i: int, j: int,
                nu: int, nv: int) -> tuple:
    """The centre of torn quad (i, j), rounded as a face centre is matched.

    Off `sailplan.sail_point`, which takes ANY sail kind. It was off
    `wind.sail_point`, which only knows a square sail hung under a yard, and
    the galleon's lateen mizzen has no yard: tearing it raised IndexError
    out of `yard_specs`. For a square sail `sailplan.sail_point` IS
    `wind.sail_point`, with the same u and v, so the frigate's tears land on
    the same faces to the bit.
    """
    sail = next((sl for m, sl in _sail_list(p)
                 if m == mast and sl.tier == tier), None)
    if sail is None:
        raise ValueError(
            f"{p.collection} carries no sail on mast {mast!r} at tier {tier} "
            "to tear")
    from . import sailplan

    corners = []
    for di, dj in ((0, 0), (1, 0), (1, 1), (0, 1)):
        u = -1.0 + 2.0 * (i + di) / (nu - 1)
        v = (j + dj) / (nv - 1)
        corners.append(sailplan.sail_point(p, mast, sail, u, v))
    return tuple(round(sum(c[k] for c in corners) / 4.0, 4) for k in range(3))


def shot_scars(p: FrigateParams) -> list[dict]:
    """Shot marks in the topside: station, height and side. X comes from a raycast.

    The height is kept between the waterline and the sheer, and clear of the
    gunports: a scar straddling an aperture would read as a badly cut port.
    """
    return _place_scars(p)[0]


def scar_draws(p: FrigateParams) -> int:
    """How many seeded draws the placement took, of `SCAR_DRAW_GUARD`."""
    return _place_scars(p)[1]


def _overlaps(p: FrigateParams, scar: dict, placed: list[dict]) -> bool:
    """Is `scar` cut across a scar already placed on the SAME side?
    SCAR CENTRE to SCAR CENTRE under the RADIUS SUM plus the ship's own
    `damage_form.scar_spacing` says yes."""
    y = profiles.station_y(p, scar["t"])
    for other in placed:
        if other["sign"] != scar["sign"]:
            continue
        gap = math.hypot(y - profiles.station_y(p, other["t"]),
                         scar["z"] - other["z"])
        if gap < scar["radius"] + other["radius"] \
                + p.damage_form.scar_spacing:
            return True
    return False


def _place_scars(p: FrigateParams) -> tuple[list[dict], int]:
    """The seeded draw. Its ORDER is the frigate's and cannot move: t, z,
    the port rule, then side and radius, then the spacing rule. A draw the
    spacing rule rejects has spent its side and radius; on the frigate it
    rejects none, so her nine scars are drawn exactly as they always were
    (`FRIGATE_SCARS_SHA1`)."""
    p.validate()
    windows = [s for s in scar_strips(p) if s["drawn"]]
    rng = _rng()
    for _ in range(3):
        rng.random()
    out, guard = [], 0
    while len(out) < SHOT_SCARS and guard < SCAR_DRAW_GUARD:
        guard += 1
        if windows and guard % 2 == 0:
            t, z = _draw_between_ports(p, rng, windows)
            band = "between_ports"
            sheer_z = profiles.sheer(p, t)
        else:
            t = rng.uniform(0.12, 0.90)
            band = "topside"
            sheer_z = profiles.sheer(p, t)
            z = rng.uniform(p.damage_form.band_floor,
                            sheer_z - p.damage_form.band_head)
        if _fouls_a_port(p, t, z, sheer_z):
            continue
        scar = {
            "band": band,
            "t": t,
            "z": z,
            "sign": rng.choice((-1.0, 1.0)),
            "radius": scar_size(p)[0] * rng.uniform(*SCAR_JITTER),
        }
        if _overlaps(p, scar, out):
            continue
        out.append(scar)
    if len(out) < SHOT_SCARS:
        raise ValueError("could not place the scars clear of the gunports")
    return out, guard


def scar_reach(p: FrigateParams) -> float:
    """SCAR CENTRE to the NEAREST POINT of an aperture, at least, on the
    "aperture" rule: the LARGEST radius a scar is drawn at plus the ship's
    `scar_margin`."""
    return scar_size(p)[0] * SCAR_JITTER[1] + p.damage_form.scar_margin


def scar_strips(p: FrigateParams) -> list[dict]:
    """The strips of hull-side timber a SECOND BAND could be drawn in, on a
    ship whose `damage_form.between_ports` names a hull row, each measured
    against what a crater needs: the REACH from both of its edges, so
    `need` is twice `scar_reach` and `window` is what is left for the scar
    centre. Empty on a ship with no such band.

    "between_ports": PORT AFT EDGE to the next PORT FORE EDGE along the
    row, one strip a gap, at the row's own height (sill to head over its
    serving deck). `centre_y` is the window, (aft, fore). Drawn where it
    fits.

    "head_to_sill": the row's PORT HEAD to the SILL of the port over it in
    each row aligned to it (`align`), one strip a shared column.
    `centre_z` is the window, (low, high), and `on_hull` says whether it
    lies wholly under the sheer, on the hull skin a scar is cut into
    (`Damage` INTO `Hull`). It is named and measured and NEVER drawn: on
    the galleon its window stands wholly above the sheer, on the bulwark,
    and a ship whose window stood on the hull would need a draw of its
    own, which this band does not make.
    """
    form = p.damage_form
    if form.between_ports is None:
        return []
    names = [d.name for d in p.gun_decks]
    if form.between_ports not in names:
        raise ValueError(
            f"the damage band is set between the ports of row "
            f"{form.between_ports!r}, and {p.collection} has no such row "
            f"(her rows are {names})")
    d = names.index(form.between_ports)
    deck = p.gun_decks[d]
    if deck.host != "hull":
        raise ValueError(
            f"row {deck.name!r} is cut in the {deck.host}; the band between "
            "its ports must be hull timber, which a scar is cut into")
    reach = scar_reach(p)
    need = 2.0 * reach
    out = []
    ts = profiles.gunport_ts(p, d)
    for fwd_t, aft_t in zip(ts, ts[1:]):
        fwd_edge = profiles.station_y(p, fwd_t) - deck.width / 2.0
        aft_edge = profiles.station_y(p, aft_t) + deck.width / 2.0
        width = fwd_edge - aft_edge
        out.append({
            "kind": "between_ports", "deck": d,
            "t": profiles.t_of_y(p, (fwd_edge + aft_edge) / 2.0),
            "y": (aft_edge, fwd_edge), "width": width, "need": need,
            "window": width - need,
            "centre_y": (aft_edge + reach, fwd_edge - reach),
            "on_hull": True, "drawn": width > need,
        })
    for du, upper in enumerate(p.gun_decks):
        if upper.align != deck.name:
            continue
        for t in profiles.gunport_ts(p, du):
            head = profiles.row_floor_z(p, t, d) + deck.head
            sill = profiles.row_floor_z(p, t, du) + upper.sill
            lo, hi = head + reach, sill - reach
            on_hull = hi <= profiles.sheer(p, t)
            out.append({
                "kind": "head_to_sill", "deck": d, "upper": du, "t": t,
                "z": (head, sill), "width": sill - head, "need": need,
                "window": sill - head - need, "centre_z": (lo, hi),
                "on_hull": on_hull,
                "drawn": False,
            })
    return out


def _draw_between_ports(p: FrigateParams, rng, windows: list) -> tuple:
    """One seeded draw in the second band: a gap, a centre in its window,
    and a height between the row's sill and head at that station."""
    strip = rng.choice(windows)
    y = rng.uniform(*strip["centre_y"])
    t = profiles.t_of_y(p, y)
    deck = profiles.gun_deck(p, strip["deck"])
    floor = profiles.row_floor_z(p, t, strip["deck"])
    return t, rng.uniform(floor + deck.sill, floor + deck.head)


def aperture_boxes(p: FrigateParams) -> list[tuple]:
    """(y_aft, y_fwd, z_lo, z_hi) of every broadside aperture, every row.

    World heights: the row's SERVING-DECK EDGE plus its sill and its head,
    so a HULL row (sill over `Deck_Lower`, 2.00 m under the sheer on the
    galleon) and a BULWARK row are read the same way.
    """
    out = []
    for d, t in profiles.all_gunport_ts(p):
        deck = profiles.gun_deck(p, d)
        y = profiles.station_y(p, t)
        floor = profiles.row_floor_z(p, t, d)
        out.append((y - deck.width / 2.0, y + deck.width / 2.0,
                    floor + deck.sill, floor + deck.head))
    return out


def _nearest_box(y: float, z: float, boxes) -> float:
    """POINT (y, z) to the NEAREST POINT of the nearest (y0, y1, z0, z1)
    box, seen square to the ship's side; inf with no box."""
    best = math.inf
    for y0, y1, z0, z1 in boxes:
        dy = max(y0 - y, 0.0, y - y1)
        dz = max(z0 - z, 0.0, z - z1)
        best = min(best, math.hypot(dy, dz))
    return best


def scar_port_gap(p: FrigateParams, t: float, z: float) -> float:
    """SCAR CENTRE to the NEAREST POINT of the nearest aperture, any row."""
    return _nearest_box(profiles.station_y(p, t), z, aperture_boxes(p))


def lid_leaf_boxes(p: FrigateParams) -> list[tuple]:
    """(y_aft, y_fwd, z_lo, z_hi) of every broadside lid's HINGE LEAF, open:
    the lid's own width `LID_W` along its hinge at the port head, and
    `LID_THICK` deep under it, where the leaf meets the side. The lid is
    0.16 m wider than a 0.86 m hull port, so the leaf stands 0.08 m beyond
    each port edge, which the aperture's own box does not reach."""
    out = []
    for lid in profiles.lid_placements(p):
        if lid["kind"] != "broadside":
            continue
        _x, y, z = lid["hinge"]
        out.append((y - profiles.LID_W / 2.0, y + profiles.LID_W / 2.0,
                    z - profiles.LID_THICK, z))
    return out


def scar_lid_gap(p: FrigateParams, t: float, z: float) -> float:
    """SCAR CENTRE to the NEAREST POINT of the nearest open lid's hinge
    leaf (`lid_leaf_boxes`), any row."""
    return _nearest_box(profiles.station_y(p, t), z, lid_leaf_boxes(p))


def _fouls_a_port(p: FrigateParams, t: float, z: float,
                  sheer_z: float) -> bool:
    """Would a scar drawn at (t, z) reach a gunport? `p.damage_form` rules.

    It is asked BEFORE the scar's radius is drawn -- the seeded draw order
    is the frigate's and cannot move -- so "aperture" holds every scar to
    the LARGEST radius it can be drawn at, `SCAR_R * SCAR_JITTER[1]`.
    """
    form = p.damage_form
    if form.scar_clear == "port_column":
        return any(abs(profiles.station_y(p, t) - profiles.station_y(p, pt))
                   < profiles.gun_deck(p, d).width
                   for d, pt in profiles.all_gunport_ts(p)) \
            and z > sheer_z - 1.4
    reach = scar_reach(p)
    if scar_port_gap(p, t, z) <= reach:
        return True
    # An open lid is wider than its port (`LID_W`), so its hinge leaf
    # overhangs the port edge along the head: judged as its own box.
    if scar_lid_gap(p, t, z) <= reach:
        return True
    # A ship whose port rule is "aperture" carries a row in the HULL, and
    # on her the chainplate feet come down onto the hull too (Task 6):
    # SCAR CENTRE to a STRAP'S CENTRELINE, less the strap's half width.
    return scar_strap_gap(p, t, z) - p.rail_form.strap_w / 2.0 <= reach


def scar_strap_gap(p: FrigateParams, t: float, z: float) -> float:
    """SCAR CENTRE to the nearest CHAINPLATE STRAP CENTRELINE (channel edge
    to foot), seen square to the ship's side."""
    y = profiles.station_y(p, t)
    best = math.inf
    for mast in profiles.mast_names(p):
        for head, foot in profiles.chainplate_segments(p, mast):
            ay, az, by, bz = head[1], head[2], foot[1], foot[2]
            dy, dz = by - ay, bz - az
            u = ((y - ay) * dy + (z - az) * dz) / (dy * dy + dz * dz)
            u = min(max(u, 0.0), 1.0)
            best = min(best, math.hypot(y - ay - u * dy, z - az - u * dz))
    return best


def splinter_spikes(p: FrigateParams) -> list[tuple[tuple, tuple, float]]:
    """(base point, tip, half width) for the splinters left at each rail gap."""
    rng = _rng()
    for _ in range(7):
        rng.random()
    out = []
    for run_i, sign, bay in rail_gaps(p):
        y_aft, y_fwd = gap_y_span(p, run_i, bay)
        for k in range(SPLINTERS_PER_GAP):
            f = (k + 0.5) / SPLINTERS_PER_GAP
            y = y_aft + (y_fwd - y_aft) * f
            t = profiles.t_of_y(p, y)
            cap = profiles.sheer(p, t) + p.bulwark_h
            x = sign * (profiles.bulwark_half_width(p, t, cap) - p.bulwark_thick / 2)
            length = SPLINTER_LEN * p.damage_form.scar_scale
            height = length * rng.uniform(0.35, 1.0)
            lean = length * rng.uniform(-0.35, 0.35)
            out.append(((x, y, cap), (x + lean * 0.4, y + lean, cap + height), 0.035))
    return out


# --- the bpy half -----------------------------------------------------------

def _hull_bvh():
    """BVH over the SUBSURF-EVALUATED hull, so a scar lands on the rendered skin.

    The control cage and the limit surface are not the same place — the ledger
    records the deck edge shrinking 0.198 m between them — so a scar placed on
    cage math would float off the hull it is supposed to be cut into.
    """
    import bpy

    from . import env
    from mathutils.bvhtree import BVHTree

    ev = env.obj("Hull").evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    try:
        return BVHTree.FromPolygons(
            [v.co.copy() for v in mesh.vertices],
            [tuple(poly.vertices) for poly in mesh.polygons],
        )
    finally:
        ev.to_mesh_clear()


def scar_anchors(p: FrigateParams) -> list[dict]:
    """Each scar's plan, plus the x where it actually meets the rendered hull."""
    from mathutils import Vector

    tree = _hull_bvh()
    out = []
    for scar in shot_scars(p):
        y = profiles.station_y(p, scar["t"])
        origin = Vector((scar["sign"] * 50.0, y, scar["z"]))
        hit = tree.ray_cast(origin, Vector((-scar["sign"], 0.0, 0.0)))
        if hit[0] is None:
            raise ValueError(f"no hull under the scar at t={scar['t']:.3f}")
        out.append({**scar, "x": hit[0].x, "y": y})
    return out


def _shoot_rails(p: FrigateParams) -> int:
    import bmesh
    import bpy

    from . import env

    gaps = rail_gaps(p)
    if not gaps:
        # A ship whose raised decks are all castles builds no `Rails`
        # object at all, and `rail_gaps` says so with an empty plan: there
        # is no rail to shoot away and none to look up.
        return 0
    obj = env.obj("Rails")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = []
    for run_i, sign, bay in gaps:
        y_aft, y_fwd = gap_y_span(p, run_i, bay)
        for face in bm.faces:
            c = face.calc_center_median()
            if c.x * sign > 0.0 and y_aft < c.y < y_fwd:
                doomed.append(face)
    bmesh.ops.delete(bm, geom=list(set(doomed)), context="FACES")
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return len(set(doomed))


def _tear_canvas(p: FrigateParams) -> int:
    import bmesh
    import bpy

    from . import env

    from . import sails

    obj = env.obj("Sails")
    nu, nv = sails.SAIL_NU, sails.SAIL_NV
    wanted = {tear_centre(p, mast, tier, i, j, nu, nv)
              for mast, tier, i, j in canvas_tears(p, nu, nv)}

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [f for f in bm.faces
              if tuple(round(v, 4) for v in f.calc_center_median()) in wanted]
    if len(doomed) != len(wanted):
        bm.free()
        raise ValueError(
            f"tear selection found {len(doomed)} faces, expected {len(wanted)}; "
            "the canvas grid has drifted -- do not widen the match"
        )
    # 'FACES', not 'FACES_ONLY': the latter keeps every edge of a torn quad,
    # and an edge that has lost all its faces is a wire edge. 'FACES' takes the
    # faces plus exactly the edges and vertices nothing else is using.
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return len(doomed)


def scar_craters(p: FrigateParams) -> list[dict]:
    """Every scar's vertices, each one planted on the RENDERED hull and driven IN.

    The shape this replaces was wrong in the same direction twice. Its six rim
    vertices all sat at ONE x -- the x where the scar's own centre ray met the
    hull -- so a flat ring up to 0.5 m across stood proud of a skin that curves
    away under it; and its inner ring was then pushed a further 0.055 m
    OUTBOARD to make a splintered lip. Measured from the hull's own surface
    along its own normal, the result stood 0.151 m PROUD: a hexagonal boss
    bulging out of the planking, under a ruling that reads "a shot scar is cut
    INTO the hull skin it scars".

    Every vertex is now dropped onto the hull where it actually lies and
    pushed in along the hull's own normal there, so the crater follows the
    planking it is cut into instead of cutting a chord across it.

    The rim keeps `SCAR_RIM` -- 2 mm, 75 times less than the boss it replaces
    -- of splintered timber standing proud. Not for looks: at exactly flush
    the crater would lie wholly inside the hull, no face of it would cross the
    skin, and `Damage x Hull` would stop being a joint at all. A scar has to
    touch the thing it scars.
    """
    import math as _m

    from mathutils import Vector

    tree = _hull_bvh()
    _r, rim, shelf, deep = scar_size(p)

    def sink(point, depth):
        """The hull surface nearest `point`, `depth` metres in along its normal."""
        loc, nrm, _idx, _dist = tree.find_nearest(Vector(point), 50.0)
        if loc is None:
            raise ValueError(f"no hull surface near {tuple(point)}")
        return tuple(loc - nrm * depth)

    out = []
    for scar in scar_anchors(p):
        x, y, z, r = scar["x"], scar["y"], scar["z"], scar["radius"]
        rings = []
        for radius, depth in ((r, -rim), (r * 0.55, shelf)):
            rings.append([
                sink((x, y + radius * _m.cos(a), z + radius * _m.sin(a)), depth)
                for a in (2 * _m.pi * i / 6 for i in range(6))
            ])
        out.append({**scar, "rings": rings, "centre": sink((x, y, z), deep)})
    return out


def _build_scars(p: FrigateParams):
    import bmesh

    from . import prims

    bm = bmesh.new()
    for crater in scar_craters(p):
        outer = [bm.verts.new(c) for c in crater["rings"][0]]
        shelf = [bm.verts.new(c) for c in crater["rings"][1]]
        centre = bm.verts.new(crater["centre"])
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((outer[i], outer[j], shelf[j], shelf[i]))
            bm.faces.new((shelf[i], shelf[j], centre))
    for base, tip, half in splinter_spikes(p):
        bx, by, bz = base
        foot = [bm.verts.new((bx + dx, by + dy, bz)) for dx, dy in
                ((-half, -half), (half, -half), (half, half), (-half, half))]
        apex = bm.verts.new(tip)
        for i in range(4):
            bm.faces.new((foot[i], foot[(i + 1) % 4], apex))
        bm.faces.new(tuple(reversed(foot)))
    return prims.finish(bm, "Damage")


def apply_damage(p: FrigateParams) -> dict:
    """The destructive pass. Runs last, and takes geometry away."""
    p.validate()
    removed = _shoot_rails(p)
    torn = _tear_canvas(p)
    obj = _build_scars(p)
    return {"rail_faces_removed": removed, "canvas_quads_torn": torn,
            "scars": SHOT_SCARS, "damage_object": obj.name}
