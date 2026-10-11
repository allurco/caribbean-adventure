"""Bulwarks and the deck surfaces.

The bulwark is a quad grid: longitudinal bands from `profiles.bulwark_ts` by
vertical rows from `profiles.bulwark_row_offsets`, in two skins (outer and inner)
per side. Those seam lists exist so that Task 5 can delete exactly one face per
skin per gunport. Do not resample the grid here.

The decks are a continuous gun deck plus however many raised platforms the ship
declares, not a set of abutting tiers: the aftmost gunports sit under the
quarterdeck and still need deck beneath them. Which tiers exist is `p.deck_tiers`
— two raised ones on the frigate, three on a galleon with a poop.
"""

import bmesh
import bpy

from . import env, profiles
from .params import FrigateParams

def build_bulwarks(p: FrigateParams) -> bpy.types.Object:
    """Twin-skin bulwark grid rising from the sheer. Returns the `Bulwarks` object."""
    p.validate()
    ts = profiles.bulwark_ts(p)
    offsets = profiles.bulwark_row_offsets(p)
    rows = len(offsets) - 1
    bm = bmesh.new()

    def column(t: float, sign: float, inset: float) -> list:
        sz = profiles.sheer(p, t)
        y = profiles.station_y(p, t)
        col = []
        for off in offsets:
            z = sz + off
            x = profiles.bulwark_half_width(p, t, z) - inset
            col.append(bm.verts.new((sign * max(x, 0.0), y, z)))
        return col

    skins: dict[tuple[float, str], list] = {}
    for sign in (-1.0, 1.0):
        skins[(sign, "outer")] = [column(t, sign, 0.0) for t in ts]
        skins[(sign, "inner")] = [column(t, sign, p.bulwark_thick) for t in ts]

    for sign in (-1.0, 1.0):
        outer = skins[(sign, "outer")]
        inner = skins[(sign, "inner")]
        for i in range(len(ts) - 1):
            for r in range(rows):
                a, b = outer[i], outer[i + 1]
                bm.faces.new((a[r], a[r + 1], b[r + 1], b[r]))
                c, d = inner[i], inner[i + 1]
                bm.faces.new((c[r], c[r + 1], d[r + 1], d[r]))
            # Rail cap joining the two skins along the top row.
            bm.faces.new(
                (outer[i][rows], inner[i][rows], inner[i + 1][rows], outer[i + 1][rows])
            )

    # Close the bulwark across the stem, where port and starboard nearly meet.
    port_stem = skins[(-1.0, "outer")][0]
    stbd_stem = skins[(1.0, "outer")][0]
    for r in range(rows):
        bm.faces.new((port_stem[r], port_stem[r + 1], stbd_stem[r + 1], stbd_stem[r]))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("Bulwarks")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("Bulwarks", mesh)
    env.link(obj)
    build_castles(p)
    build_ceilings(p)
    return obj


def ceiling_name(tier) -> str:
    return f"Ceiling{tier.name.replace('Deck', '')}"


def build_ceilings(p: FrigateParams) -> list[bpy.types.Object]:
    """One CEILING per deck inside the hull: the inner planking between
    that deck and the gun deck's underside, over the deck's own run.

    It is the bulwark's inner skin carried DOWN: `bulwark_thick` inboard of
    the hull skin at every height, meeting the bulwark's inner skin exactly
    at the sheer, with seams at every hull row's sill and head so the
    gunports pass can pierce it the way it pierces the bulwark. A bulkhead
    closes each end, from the lower deck's surface to the gun deck's.

    Why it exists: the hull skin is ONE surface, single-sided in the export.
    Looked into through an open lower port, its inside is a back face —
    culled — and without this the eye would go straight through it to the
    sea. The frigate has no deck inside her hull and builds none.
    """
    return [_ceiling(p, tier) for tier in profiles.hull_tiers(p)]


def _ceiling(p: FrigateParams, tier) -> bpy.types.Object:
    ts = profiles.ceiling_ts(p, tier)
    offsets = profiles.ceiling_offsets(p, tier)
    rows = len(offsets) - 1
    bm = bmesh.new()
    cols = {}
    for sign in (-1.0, 1.0):
        cols[sign] = []
        for t in ts:
            sz, y = profiles.sheer(p, t), profiles.station_y(p, t)
            cols[sign].append([bm.verts.new((
                sign * profiles.ceiling_half_width(p, t, sz + off), y,
                sz + off)) for off in offsets])
    # Wound so every face's normal points INBOARD, at the eye looking in.
    for sign in (-1.0, 1.0):
        c = cols[sign]
        for i in range(len(ts) - 1):
            for r in range(rows):
                quad = (c[i][r], c[i + 1][r], c[i + 1][r + 1], c[i][r + 1])
                bm.faces.new(quad if sign > 0 else quad[::-1])
    # The two end bulkheads, deck surface to deck surface across the ship.
    n = profiles.CEILING_BULKHEAD_POINTS
    lower = tier
    main = p.tier("Deck_Main")
    for end, t in ((0, ts[0]), (1, ts[-1])):
        y = profiles.station_y(p, t)
        hb_lo = profiles.tier_half_beam(p, lower, t)
        hb_hi = profiles.tier_half_beam(p, main, t)
        foot, head = [], []
        for j in range(n):
            f = -1.0 + 2.0 * j / (n - 1)
            xb, xt = f * hb_lo, f * hb_hi
            foot.append(bm.verts.new(
                (xb, y, profiles.tier_deck_z(p, lower, t, xb))))
            head.append(bm.verts.new(
                (xt, y, profiles.tier_deck_z(p, main, t, xt))))
        for j in range(n - 1):
            quad = (foot[j], foot[j + 1], head[j + 1], head[j])
            # The forward bulkhead faces AFT (-y), the after one forward.
            bm.faces.new(quad if end == 0 else quad[::-1])
    bm.normal_update()
    name = ceiling_name(tier)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def build_castles(p: FrigateParams) -> list[bpy.types.Object]:
    """One twin-skin wall per deck tier that stands ABOVE the main rail.

    This is the stern castle. The frigate declares no such tier and gets
    nothing; a galleon declares its poop and gets the wall that makes it a
    galleon. The wall is the ship's own topsides carried up —
    `profiles.bulwark_half_width` keeps leaning in with height, so the castle
    narrows as it rises, which is what makes a galleon's stern read as a tower
    and not as a box.
    """
    built = []
    for tier in profiles.castle_tiers(p):
        built.append(_castle_wall(p, tier))
    return built


def _castle_wall(p: FrigateParams, tier) -> bpy.types.Object:
    ts = profiles.castle_ts(p, tier)
    bm = bmesh.new()

    def column(t: float, sign: float, inset: float) -> list:
        y = profiles.station_y(p, t)
        col = []
        for z in profiles.castle_wall_zs(p, tier, t):
            x = profiles.bulwark_half_width(p, t, z) - inset
            col.append(bm.verts.new((sign * max(x, 0.0), y, z)))
        return col

    rows = len(profiles.castle_wall_zs(p, tier, ts[0])) - 1
    skins = {}
    for sign in (-1.0, 1.0):
        skins[(sign, "outer")] = [column(t, sign, 0.0) for t in ts]
        skins[(sign, "inner")] = [column(t, sign, p.bulwark_thick) for t in ts]

    for sign in (-1.0, 1.0):
        outer, inner = skins[(sign, "outer")], skins[(sign, "inner")]
        for i in range(len(ts) - 1):
            for r in range(rows):
                a, b = outer[i], outer[i + 1]
                bm.faces.new((a[r], a[r + 1], b[r + 1], b[r]))
                c, d = inner[i], inner[i + 1]
                bm.faces.new((c[r], c[r + 1], d[r + 1], d[r]))
            bm.faces.new(
                (outer[i][rows], inner[i][rows], inner[i + 1][rows], outer[i + 1][rows])
            )

    # The castle's forward face: a bulkhead across the ship, the break of the
    # deck. Without it the wall is two loose sides and you can see straight in.
    port_fwd = skins[(-1.0, "outer")][0]
    stbd_fwd = skins[(1.0, "outer")][0]
    for r in range(rows):
        bm.faces.new((port_fwd[r], port_fwd[r + 1], stbd_fwd[r + 1], stbd_fwd[r]))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    name = f"Castle{tier.name.replace('Deck', '')}"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def _deck_patch(
    p: FrigateParams,
    tier,
    n_tran: int = profiles.DECK_N_TRAN,
) -> bpy.types.Object:
    name, t0, t1, n_long, rise = tier.name, tier.t0, tier.t1, tier.n_long, tier.rise
    bm = bmesh.new()
    grid = []
    for i in range(n_long):
        t = t0 + (t1 - t0) * i / (n_long - 1)
        hb = profiles.tier_half_beam(p, tier, t)
        y = profiles.station_y(p, t)
        row = []
        for j in range(n_tran):
            x = -hb + 2.0 * hb * j / (n_tran - 1)
            z = profiles.tier_deck_z(p, tier, t, x)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)

    for i in range(n_long - 1):
        for j in range(n_tran - 1):
            bm.faces.new(
                (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
            )

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)

    # Planks have thickness; a zero-thickness deck shows a paper edge at the break.
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = p.plank_thick
    mod.offset = -1.0
    return obj


def build_decks(p: FrigateParams) -> list[bpy.types.Object]:
    """Every walking surface the ship declares, in declaration order.

    The table of tiers used to live here, with the frigate's three hardcoded
    and two of their numbers fetched out of the params by name. It is now
    `p.deck_tiers`: a galleon adds a poop by declaring a fourth tier and
    nothing in this module changes.
    """
    p.validate()
    built = [_deck_patch(p, tier) for tier in p.deck_tiers]
    if p.stern_form.chase_platform is not None:
        built.append(build_chase_platform(p))
    return built


def build_chase_platform(p: FrigateParams) -> bpy.types.Object:
    """The `Chase_Platform` under the stern chasers (the maintainer's third ruling,
    A'): a level planked slab `plank_thick` deep at Deck_Main's level at the
    chasers' station, from Deck_Main's end to the hull's end cap, let into
    the bulwark over the sheer and carried to the skin below it, on the
    beams and carlings `profiles.chase_platform_timbers` frames it with,
    and the riser that closes Deck_Main's end down to it. Every figure is
    `profiles`'; this only emits, and `profiles.chase_platform_triangles`
    counts what it emits."""
    top = profiles.chase_platform_z(p)
    under = top - p.plank_thick
    bm = bmesh.new()
    for piece in profiles.chase_platform_pieces(p):
        cols = []
        for t, hw in piece:
            y = profiles.station_y(p, t)
            cols.append([bm.verts.new((x, y, z)) for z in (top, under)
                         for x in (-hw, hw)])
        # each column: [top port, top stbd, under port, under stbd]
        for a, b in zip(cols, cols[1:]):
            for i, j in ((0, 1), (3, 2), (2, 0), (1, 3)):  # top, under, sides
                bm.faces.new((a[i], a[j], b[j], b[i]))
        for col in (cols[0], cols[-1]):                     # the two ends
            bm.faces.new((col[0], col[1], col[3], col[2]))
    for timber in profiles.chase_platform_timbers(p):
        _box(bm, timber["lo"], timber["hi"])
    _riser(bm, profiles.chase_platform_riser(p))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Chase_Platform")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Chase_Platform", mesh)
    env.link(obj)
    return obj


def _riser(bm, riser: dict) -> None:
    """The riser as a closed solid: per column an after and a forward
    edge, bottom to top, one vertex each where the column has no height."""
    z0 = riser["bottom"]
    cols = []
    for x, z in riser["columns"]:
        col = {}
        for face, y in (("aft", riser["y_aft"]), ("fwd", riser["y_fwd"])):
            lo = bm.verts.new((x, y, z0))
            col[face] = (lo, bm.verts.new((x, y, z)) if z > z0 else lo)
        cols.append(col)
    for a, b in zip(cols, cols[1:]):
        bm.faces.new((a["aft"][1], b["aft"][1], b["fwd"][1], a["fwd"][1]))
        bm.faces.new((a["aft"][0], a["fwd"][0], b["fwd"][0], b["aft"][0]))
        for face in ("aft", "fwd"):
            ring = [a[face][0], b[face][0], b[face][1], a[face][1]]
            uniq = [v for k, v in enumerate(ring) if v not in ring[:k]]
            bm.faces.new(uniq)


def _box(bm, lo, hi) -> None:
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1)
         for z in (z0, z1)]
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in quad])
