"""Stern castle massing, transom and gallery. Spec section 6 step 6.

Three objects:

- `Transom` closes the bulwark across the stern. Task 4 shut the bulwark across
  the stem but left the transom open — a dark slot in a side ortho — and this
  owns it. The panel carries the two stern chase ports that complete the 24-gun
  battery, cut on the same rows as the broadside ports so the rail cap runs
  round the stern without a step.
- `Stern_Gallery` is the window band below the sheer, standing proud of the hull
  transom: five sashes with their glazing bars, pilasters between them, a
  modillioned cornice, a dentilled sill and two quarter badges.
- `Stern_Carving` is everything that stands proud of the transom ABOVE the
  sheer — name board, friezes, dentil courses, taffrail cap and quarter
  scrolls. It is a separate object because `Transom` is the hull's closing
  panel and may not poke aft of the hull's own transom plane, while carving
  must. Keeping them apart lets both invariants stay strict.

Every column of the transom is given in `u = x / stern_half_width(z)`, so a
column follows the transom's tumblehome rather than cutting across it. All of
that math lives in `profiles`; this module only emits.
"""

import math

import bmesh
import bpy

from . import env, prims, profiles
from .params import FrigateParams

# EVERY CONSTANT THIS MODULE CARRIED IS NOW `p.stern_form`. There were twelve
# -- MOULDING_*, BADGE_*, PILASTER_*, MUNTIN*, MODILLIONS, DENTILS,
# CARVING_* -- and all twelve were measured at a 38 m frigate's transom. They
# are `shiptype.SternForm` now, and the frigate's defaults are them verbatim.


def _finish(bm: bmesh.types.BMesh, name: str) -> bpy.types.Object:
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def build_transom(p: FrigateParams) -> bpy.types.Object:
    """Twin-skin transom panel with two chase ports. Returns the `Transom` object."""
    p.validate()
    us = profiles.transom_us(p)
    offsets = profiles.transom_row_offsets(p)
    rows = len(offsets) - 1
    row = profiles.chase_row(p)
    cut = {band[0] for band in profiles.transom_bands(p)}

    sz = profiles.sheer(p, 1.0)
    y_out = profiles.station_y(p, 1.0)
    y_in = y_out + p.bulwark_thick
    bm = bmesh.new()
    _upper_transom_panels(bm, p, y_out, y_in)

    def column(u: float, y: float, chamfer: bool) -> list:
        """One vertical column of the panel. `chamfer` pulls an end column inboard.

        Only the two end columns are inset. Insetting every column proportionally
        would look the same but put each chase port's jamb centroid 0.022 of u
        INSIDE the aperture box — the jamb would read as blocking the port it
        lines. Task 5 avoided this on the broadside ports because the bulwark's
        inner skin is offset in x with y unchanged, so its lining centroids land
        exactly on the box bound and a strict-interior test clears them. Keeping
        interior columns at the same u on both skins restores that property here.
        """
        col = []
        for off in offsets:
            z = sz + off
            hw = profiles.stern_half_width(p, z)
            col.append(bm.verts.new((u * (hw - p.bulwark_thick if chamfer else hw), y, z)))
        return col

    outer = [column(u, y_out, False) for u in us]
    inner = [column(u, y_in, i in (0, len(us) - 1)) for i, u in enumerate(us)]

    for i in range(len(us) - 1):
        for r in range(rows):
            if r == row and i in cut:
                continue
            a, b = outer[i], outer[i + 1]
            bm.faces.new((a[r], a[r + 1], b[r + 1], b[r]))
            c, d = inner[i], inner[i + 1]
            bm.faces.new((c[r], c[r + 1], d[r + 1], d[r]))
        # Rail cap, joining the two skins along the top row.
        bm.faces.new((outer[i][rows], inner[i][rows], inner[i + 1][rows], outer[i + 1][rows]))

    # Corner returns. The bulwark ends at y_out with its 180 mm cross-section facing
    # aft; these chamfer across it, so the stern closes without a coplanar overlap
    # that would z-fight against the bulwark's outer skin.
    for end in (0, -1):
        for r in range(rows):
            quad = (outer[end][r], inner[end][r], inner[end][r + 1], outer[end][r + 1])
            bm.faces.new(quad if end == 0 else tuple(reversed(quad)))

    # Line each chase port: sill, head and two jambs, bridging outer skin to inner.
    for i in sorted(cut):
        for a, b in ((i, i + 1), (i + 1, i)):            # the two jambs
            bm.faces.new((outer[a][row], inner[a][row], inner[a][row + 1], outer[a][row + 1]))
        for r in (row, row + 1):                          # sill, then head
            bm.faces.new((outer[i][r], outer[i + 1][r], inner[i + 1][r], inner[i][r]))

    return _finish(bm, "Transom")


UPPER_PANEL_ROWS = 3   # seams up one castle's transom panel: foot, two, head


def _upper_transom_panels(bm: bmesh.types.BMesh, p: FrigateParams,
                          y_out: float, y_in: float) -> None:
    """Close the transom of every castle deck that runs aft to station 1.0.

    `decks._castle_wall` closes a castle FORWARD, at its break, and leaves it
    open aft: on a frigate nothing stands above the waist rail at the stern,
    so there was nothing to close and nobody noticed. A galleon's quarterdeck
    and poop both run to the taffrail, and unclosed they are two dark slots
    over it -- the same defect Task 6 fixed at the waist, one deck up.

    Twin-skinned and capped exactly as the waist panel is, so the rail cap
    runs round each castle's stern without a step, and every column is given
    in u so it follows the transom's own tumblehome.
    """
    tiers = profiles.transom_tiers(p)
    for foot, head in tiers[1:]:
        zs = [foot + (head - foot) * i / UPPER_PANEL_ROWS
              for i in range(UPPER_PANEL_ROWS + 1)]
        us = (-1.0, 0.0, 1.0)

        def column(u: float, y: float, chamfer: bool) -> list:
            col = []
            for z in zs:
                hw = profiles.stern_half_width(p, z)
                col.append(bm.verts.new(
                    (u * (hw - p.bulwark_thick if chamfer else hw), y, z)))
            return col

        outer = [column(u, y_out, False) for u in us]
        inner = [column(u, y_in, i in (0, len(us) - 1))
                 for i, u in enumerate(us)]
        rows = len(zs) - 1
        for i in range(len(us) - 1):
            for r in range(rows):
                a, b = outer[i], outer[i + 1]
                bm.faces.new((a[r], a[r + 1], b[r + 1], b[r]))
                c, d = inner[i], inner[i + 1]
                bm.faces.new((c[r], c[r + 1], d[r + 1], d[r]))
            bm.faces.new((outer[i][rows], inner[i][rows],
                          inner[i + 1][rows], outer[i + 1][rows]))
        for end in (0, -1):
            for r in range(rows):
                quad = (outer[end][r], inner[end][r],
                        inner[end][r + 1], outer[end][r + 1])
                bm.faces.new(quad if end == 0 else tuple(reversed(quad)))
        # And a floor across the foot of the panel, so a castle's transom is
        # a closed box rather than a pair of skins open underneath.
        bm.faces.new((outer[0][0], outer[-1][0], inner[-1][0], inner[0][0]))


def _boss(bm: bmesh.types.BMesh, x: float, z: float, radius: float,
          y_face: float, depth: float, sides: int = 8) -> None:
    """A faceted carved boss standing `depth` aft of a flat transom face."""
    prims.cylinder(bm, (x, y_face, z), radius, sides, 1, -depth)


def _badge_point(p: FrigateParams, sign: float, z: float, radius: float,
                 i: int) -> tuple:
    """Facet corner `i` of the badge section at height z, `radius` out from the skin."""
    sf = p.stern_form
    a = math.pi * i / sf.badge_facets
    skin = profiles.skin_half_width(p, sf.badge_t, z)
    return (
        sign * (skin - 0.08 + radius * math.sin(a)),
        profiles.station_y(p, sf.badge_t) + radius * math.cos(a),
        z,
    )


def _badge_ring(bm: bmesh.types.BMesh, p: FrigateParams, sign: float,
                z: float, radius: float) -> list:
    """One half-circle of badge section at height z, `radius` out from the skin."""
    return [bm.verts.new(_badge_point(p, sign, z, radius, i))
            for i in range(p.stern_form.badge_facets + 1)]


def _quarter_badge(bm: bmesh.types.BMesh, p: FrigateParams, sign: float,
                   band: tuple[float, float], bracket: bool = True) -> None:
    """A moulded bay at one aft corner: sill, two tiers of lights, cornice, hood.

    The badge's OUTERMOST point is still exactly `badge_bulge` outboard of the
    skin, because the wall is set in by `badge_mould` and only the sill and
    cornice flanges reach the full bulge. The silhouette the maintainer signed off does
    not move; what changes is that the bay now has a profile instead of being a
    bare prism.

    `band` is the gallery tier it belongs to, so a galleon gets ONE BADGE PER
    TIER -- which is what a two-storey quarter gallery is -- and the frigate,
    having one tier, gets the one badge it has always had. `bracket` is False
    on a badge standing on another badge: the scrolled bracket is what a bay
    appears to STAND on, and a bay stacked on its own twin stands on that.
    """
    sf = p.stern_form
    z_lo, z_hi = band
    wall = sf.badge_bulge - sf.badge_mould
    light_lo, light_hi = z_lo + 0.30, z_hi - 0.30
    mid = (light_lo + light_hi) / 2.0

    # (height, radius) up the bay. A pair at the same radius makes a flat band;
    # a step between radii makes the flange that reads as a moulding.
    courses = [
        (z_lo, wall), (z_lo + 0.14, wall),
        (z_lo + 0.16, sf.badge_bulge), (z_lo + 0.28, sf.badge_bulge),
        (light_lo, wall),
        (mid - 0.05, wall), (mid + 0.05, wall),
        (light_hi, wall),
        (z_hi - 0.28, sf.badge_bulge), (z_hi - 0.16, sf.badge_bulge),
        (z_hi - 0.14, wall), (z_hi, wall),
    ]
    rings = [_badge_ring(bm, p, sign, z, r) for z, r in courses]
    glazed = {4, 6}        # the two bands of lights, between the mouldings
    first_light = (sf.badge_facets - sf.badge_lights) // 2

    def face(quad):
        bm.faces.new(quad if sign > 0 else tuple(reversed(quad)))

    for band_i, (lo, hi) in enumerate(zip(rings, rings[1:])):
        for i in range(sf.badge_facets):
            corners = (lo[i], lo[i + 1], hi[i + 1], hi[i])
            if band_i in glazed and first_light <= i < first_light + sf.badge_lights:
                # A light: the pane is set in toward the bay's own axis and the
                # four reveals carry the eye into it.
                z0, z1 = courses[band_i][0], courses[band_i + 1][0]
                pane = [
                    bm.verts.new(_badge_point(p, sign, z, wall - 0.075, i + di))
                    for z, di in ((z0, 0), (z0, 1), (z1, 1), (z1, 0))
                ]
                face(tuple(pane))
                for k in range(4):
                    j = (k + 1) % 4
                    face((corners[k], corners[j], pane[j], pane[k]))
            else:
                face(corners)

    bm.faces.new(tuple(reversed(rings[0])) if sign > 0 else tuple(rings[0]))

    # An ogee hood over the bay, which is what carries the badge visually at the
    # stern sheer.
    hood = [rings[-1]]
    for dz, scale in ((sf.badge_hood * 0.55, 0.72), (sf.badge_hood, 0.30)):
        hood.append(_badge_ring(bm, p, sign, z_hi + dz, wall * scale))
    for lo, hi in zip(hood, hood[1:]):
        for i in range(sf.badge_facets):
            face((lo[i], lo[i + 1], hi[i + 1], hi[i]))
    bm.faces.new(tuple(hood[-1]) if sign > 0 else tuple(reversed(hood[-1])))

    if not bracket:
        return
    # The scrolled bracket the bay appears to stand on.
    skin = profiles.skin_half_width(p, sf.badge_t, z_lo)
    y_c = profiles.station_y(p, sf.badge_t)
    # Kept inside 0.24 m below the band: `check_stern` holds the gallery's foot
    # to within 0.3 m of the band the math declares, and the bracket is the
    # lowest thing on the object.
    for drop, out, half in ((0.04, 0.26, 0.17), (0.14, 0.14, 0.10)):
        x0, x1 = sign * (skin - 0.10), sign * (skin - 0.10 + out)
        prims.box(bm,
                  (min(x0, x1), y_c - half, z_lo - drop - 0.10),
                  (max(x0, x1), y_c + half, z_lo - drop + 0.02))


def _gallery_tier(bm: bmesh.types.BMesh, p: FrigateParams, tier: int) -> None:
    """One band of stern lights: wall, glazing, bars, pilasters, mouldings.

    The frigate has one of these. A galleon has two -- the great cabin's stern
    lights under its own sheer, and the coach's inside the quarterdeck
    castle's transom panel -- and the second is the thing a flush-decked hull
    has no transom above its sheer to carry.
    """
    sf = p.stern_form
    z_lo, z_hi, _n = profiles.gallery_tiers(p)[tier]
    rects = profiles.gallery_window_rects(p, tier)
    hw = profiles.gallery_half_width(p, z_hi)
    y_hull = profiles.station_y(p, 1.0)
    y_wall = y_hull - sf.gallery_depth
    y_glass = y_wall + sf.window_recess

    xs = [-hw]
    for x0, x1, _z0, _z1 in rects:
        xs += [x0, x1]
    xs.append(hw)
    zs = [z_lo, rects[0][2], rects[0][3], z_hi]
    window_bands = {1 + 2 * i for i in range(len(rects))}

    wall = [[bm.verts.new((x, y_wall, z)) for z in zs] for x in xs]

    for i in range(len(xs) - 1):
        for r in range(len(zs) - 1):
            if r == 1 and i in window_bands:
                continue
            a, b = wall[i], wall[i + 1]
            bm.faces.new((a[r], b[r], b[r + 1], a[r + 1]))

    # The wall is a flush panel set on the hull transom; four faces box in the gap.
    back = [[bm.verts.new((x, y_hull, z)) for z in (zs[0], zs[-1])] for x in (xs[0], xs[-1])]
    bm.faces.new((wall[0][0], wall[0][-1], back[0][1], back[0][0]))
    bm.faces.new((wall[-1][0], back[1][0], back[1][1], wall[-1][-1]))
    bm.faces.new((wall[0][0], back[0][0], back[1][0], wall[-1][0]))
    bm.faces.new((wall[0][-1], wall[-1][-1], back[1][1], back[0][1]))

    # Glazing, set back behind the frame, with a jamb on each of its four sides.
    for i in sorted(window_bands):
        rim = [wall[i][1], wall[i + 1][1], wall[i + 1][2], wall[i][2]]
        pane = [bm.verts.new((v.co.x, y_glass, v.co.z)) for v in rim]
        bm.faces.new(tuple(reversed(pane)))
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((rim[k], pane[k], pane[j], rim[j]))

    # Glazing bars. The sash is a single pane with raised bars laid across it —
    # six lights to a window, rather than six separate faces. The bars pierce
    # the glass plane deliberately: a bar face sitting exactly ON y_glass would
    # be counted as a pane by `check_stern`, which asks for the band's own
    # count and not six times it.
    for x0, x1, zw0, zw1 in rects:
        y0, y1 = y_glass - sf.muntin_proud, y_glass + 0.015
        xc = (x0 + x1) / 2.0
        prims.box(bm, (xc - sf.muntin / 2, y0, zw0), (xc + sf.muntin / 2, y1, zw1))
        for k in (1, 2):
            zc = zw0 + (zw1 - zw0) * k / 3.0
            prims.box(bm, (x0, y0, zc - sf.muntin / 2), (x1, y1, zc + sf.muntin / 2))
        # Head and sill moulding across each sash.
        for zb, zt in ((zw1, zw1 + sf.window_band_h), (zw0 - sf.window_band_h, zw0)):
            prims.box(bm, (x0 - 0.03, y_wall - 0.07, zb), (x1 + 0.03, y_wall, zt))

    # A pilaster on every mullion, including the two at the ends: the vertical
    # rhythm the reference's stern reads by.
    mullions = [-hw + sf.window_mullion / 2.0]
    for a, b in zip(rects, rects[1:]):
        mullions.append((a[1] + b[0]) / 2.0)
    mullions.append(hw - sf.window_mullion / 2.0)
    for xc in mullions:
        for half, zb, zt in ((0.08, z_lo - 0.08, z_lo + 0.12),
                             (sf.pilaster_w / 2.0, z_lo + 0.12, z_hi - 0.14),
                             (0.08, z_hi - 0.14, z_hi + 0.04)):
            prims.box(bm, (xc - half, y_wall - sf.pilaster_proud, zb),
                      (xc + half, y_wall, zt))

    # Cornice over the gallery and a matching sill under it: the horizontal banding
    # that makes a stern read as a stern rather than as a hole in a wall.
    y_f = y_wall - sf.moulding_depth
    for out, y_front, zb, zt in (
        (0.10, y_wall - 0.10, z_hi, z_hi + 0.06),
        (sf.moulding_overhang, y_f, z_hi + 0.06, z_hi + 0.14),
        (0.16, y_wall - 0.12, z_hi + 0.14, z_hi + 0.20),
        (0.08, y_wall - 0.06, z_hi + 0.20, z_hi + 0.28),
        (0.16, y_wall - 0.14, z_lo - 0.08, z_lo),
        (0.10, y_wall - 0.09, z_lo - sf.moulding_h, z_lo - 0.08),
    ):
        prims.box(bm, (-(hw + out), y_front, zb), (hw + out, y_hull, zt))

    dentil_foot = (profiles.gallery_lowest(p) if tier == 0
                   else z_lo - sf.dentil_drop)
    for count, zb, zt, depth in ((sf.modillions, z_hi - 0.12, z_hi, 0.14),
                                 (sf.dentils, dentil_foot, z_lo - sf.moulding_h, 0.08)):
        reach = hw * 0.96
        for i in range(count):
            xc = -reach + 2.0 * reach * i / (count - 1)
            prims.box(bm, (xc - 0.05, y_wall - depth, zb), (xc + 0.05, y_wall, zt))


def build_stern_gallery(p: FrigateParams) -> bpy.types.Object:
    """Every window band, its mouldings and its quarter badges. `Stern_Gallery`."""
    p.validate()
    bm = bmesh.new()
    tiers = profiles.gallery_tiers(p)
    for i in range(len(tiers)):
        _gallery_tier(bm, p, i)
    for i, (z_lo, z_hi, _n) in enumerate(tiers):
        for sign in (-1.0, 1.0):
            _quarter_badge(bm, p, sign, (z_lo, z_hi), bracket=(i == 0))

    return _finish(bm, "Stern_Gallery")


def _carve_upper_panel(bm: bmesh.types.BMesh, p: FrigateParams,
                       foot: float, head: float) -> None:
    """Carved work on one CASTLE's transom panel: rail cap, dentils, a frieze.

    Lighter than the waist panel's, which carries the name board and the
    quarter scrolls round the chase ports. These panels have no ports, so what
    they need is the horizontal banding that makes six metres of transom read
    as a flight of steps instead of one tall wall.
    """
    sf = p.stern_form
    y_t = profiles.station_y(p, 1.0)

    def band(u0, u1, zb, zt, depth):
        # The NARROWEST width the block spans, not the width at its middle.
        # A castle transom tumbles in 0.10 m per metre of height on this
        # galleon against the frigate's 0.06, and a frieze 1.4 m tall laid out
        # at its own mid-height stands 70 mm outboard of the panel at its top
        # corners. `check_stern` catches that as carving outside the transom's
        # own width at its own height, and the honest answer is to lay the
        # block out on the width it has to fit INSIDE everywhere.
        hw = min(profiles.stern_half_width(p, zb),
                 profiles.stern_half_width(p, zt))
        prims.box(bm, (u0 * hw, y_t - depth, zb), (u1 * hw, y_t, zt))

    for shrink, depth, zb, zt in ((0.995, 0.06, head - 0.16, head - 0.10),
                                  (0.985, sf.carving_proud, head - 0.10, head - 0.04),
                                  (0.970, 0.09, head - 0.04, head)):
        band(-shrink, shrink, zb, zt, depth)

    for i in range(sf.upper_dentils):
        u = -0.90 + 1.80 * i / (sf.upper_dentils - 1)
        band(u - 0.016, u + 0.016, head - 0.34, head - 0.16, 0.10)

    # The frieze fills WHAT IS LEFT of the panel. A gallery band standing in
    # this panel owns its own height and the mouldings above and below it, and
    # carving laid over the top of one is not carving, it is two objects in
    # the same cubic metre -- 1,404 intersecting face pairs of it, when the
    # coach's lights and the quarterdeck's frieze were both laid out from the
    # panel without either knowing about the other.
    f_lo, f_hi = foot + 0.08, head - 0.42
    for z_lo, z_hi, _n in profiles.gallery_tiers(p):
        if z_hi < f_lo or z_lo > f_hi:
            continue
        f_lo = max(f_lo, z_hi + 0.28 + 0.05)   # clear of the band's own cornice
    if f_hi - f_lo < 0.20:
        return
    edge = 0.93
    pitch = 2.0 * edge / sf.upper_panels
    for i in range(sf.upper_panels + 1):
        u = -edge + pitch * i
        band(u - 0.028, u + 0.028, f_lo, f_hi, sf.carving_proud)
    for i in range(sf.upper_panels):
        u0, u1 = -edge + pitch * i + 0.028, -edge + pitch * (i + 1) - 0.028
        for a, b, zb, zt in ((u0, u1, f_lo, f_lo + 0.06),
                             (u0, u1, f_hi - 0.06, f_hi),
                             (u0, u0 + 0.020, f_lo, f_hi),
                             (u1 - 0.020, u1, f_lo, f_hi)):
            band(a, b, zb, zt, 0.10)
        band(u0 + 0.020, u1 - 0.020, f_lo + 0.06, f_hi - 0.06, 0.05)
        hw_s = profiles.stern_half_width(p, (f_lo + f_hi) / 2.0)
        _boss(bm, (u0 + u1) / 2.0 * hw_s, (f_lo + f_hi) / 2.0,
              0.07, y_t - 0.06, 0.06)


# Where the name board's end and the quarter scrolls' inner edge stand, in
# transom u, on a stern with no chase ports to lay them out round. 0.62 is
# the frigate's own outer port edge less one port's half width, so the board
# spans what her board and her two ports span together.
NO_CHASER_BOARD_U = 0.62


def build_stern_carving(p: FrigateParams) -> bpy.types.Object:
    """Carved work on the transom ABOVE the sheer. Returns `Stern_Carving`.

    A separate object from `Transom` on purpose. The transom is the hull's
    closing panel and `check_stern` holds every one of its vertices forward of
    the hull's own transom plane; carving is the thing that must stand aft of
    it. Two objects keep both statements strict instead of trading one away.

    Everything here is laid out in the transom's own `u = x / stern_half_width(z)`
    so that it follows the tumblehome, and everything keeps clear of the two
    chase ports — a carved wreath over a gun is a blocked gun.
    """
    p.validate()
    sf = p.stern_form
    sz = profiles.sheer(p, 1.0)
    rail_z = sz + p.bulwark_h
    y_t = profiles.station_y(p, 1.0)
    offs = profiles.transom_row_offsets(p)
    row = profiles.chase_row(p)
    port_lo, port_hi = sz + offs[row], sz + offs[row + 1]
    edges = profiles.chase_u_edges(p)
    if edges:
        u_in = min(abs(u) for pair in edges for u in pair)
        u_out = max(abs(u) for pair in edges for u in pair)
    else:
        # NO CHASE PORTS: the name board takes the panel the ports and the
        # board shared, and the quarter scrolls keep their own outboard band.
        u_in = u_out = NO_CHASER_BOARD_U

    bm = bmesh.new()

    edge = sf.carving_edge

    def band(u0, u1, zb, zt, depth, inset=0.0):
        """A block spanning u0..u1 of the transom's own width at its mid-height.

        `carving_edge` pulls the whole layout in toward the centreline. It is
        1.0 on the frigate, exactly, and a multiply by 1.0 is exact in IEEE,
        so her carving does not move; it is 0.95 on the galleon, whose
        transom tumbles half as hard again over panels half as tall again.
        """
        hw = profiles.stern_half_width(p, (zb + zt) / 2.0)
        prims.box(bm, (u0 * edge * hw + inset, y_t - depth, zb),
                  (u1 * edge * hw - inset, y_t, zt))

    # Taffrail cap: three steps, the topmost flush with the rail the bulwark
    # cap already runs at, so the stern reads as finished rather than sawn off.
    for shrink, depth, zb, zt in ((0.995, 0.06, rail_z - 0.16, rail_z - 0.10),
                                  (0.985, sf.carving_proud, rail_z - 0.10, rail_z - 0.04),
                                  (0.970, 0.09, rail_z - 0.04, rail_z)):
        band(-shrink, shrink, zb, zt, depth)

    # Dentil course under the taffrail, above the chase port heads.
    for i in range(sf.carving_dentils):
        u = -0.90 + 1.80 * i / (sf.carving_dentils - 1)
        band(u - 0.018, u + 0.018, port_hi + 0.02, rail_z - 0.16, 0.10)

    # Name board on the centre panel between the two chase ports, with its own
    # frame and a row of carved bosses standing on it.
    board_u = u_in - 0.03
    b_lo, b_hi = port_lo + 0.07, port_hi - 0.06
    hw_board = profiles.stern_half_width(p, (b_lo + b_hi) / 2.0)
    for u0, u1, zb, zt in ((-board_u, board_u, b_lo, b_lo + 0.08),
                           (-board_u, board_u, b_hi - 0.08, b_hi),
                           (-board_u, -board_u + 0.06, b_lo, b_hi),
                           (board_u - 0.06, board_u, b_lo, b_hi)):
        band(u0, u1, zb, zt, sf.carving_proud)
    band(-board_u + 0.06, board_u - 0.06, b_lo + 0.08, b_hi - 0.08, 0.08)
    for i in range(sf.name_board_bosses):
        u = (-board_u + 0.12) + (2 * board_u - 0.24) * i / (sf.name_board_bosses - 1)
        _boss(bm, u * edge * hw_board, (b_lo + b_hi) / 2.0, 0.055, y_t - 0.08, 0.05)

    # Frieze below the chase ports: carved panels between pilasters.
    f_lo, f_hi = sz + 0.06, port_lo - 0.05
    span = 0.93
    pitch = 2.0 * span / sf.carving_panels
    for i in range(sf.carving_panels + 1):
        u = -span + pitch * i
        band(u - 0.030, u + 0.030, f_lo, f_hi, sf.carving_proud)
    for i in range(sf.carving_panels):
        u0, u1 = -span + pitch * i + 0.030, -span + pitch * (i + 1) - 0.030
        for a, b, zb, zt in ((u0, u1, f_lo, f_lo + 0.06),
                             (u0, u1, f_hi - 0.06, f_hi),
                             (u0, u0 + 0.022, f_lo, f_hi),
                             (u1 - 0.022, u1, f_lo, f_hi)):
            band(a, b, zb, zt, 0.10)
        band(u0 + 0.022, u1 - 0.022, f_lo + 0.06, f_hi - 0.06, 0.05)

    # Quarter scrolls, outboard of the chase ports, where the transom turns into
    # the topside. One rosette apiece.
    for sign in (-1.0, 1.0):
        u0, u1 = sign * (u_out + 0.04), sign * 0.96
        lo, hi = min(u0, u1), max(u0, u1)
        for a, b, zb, zt in ((lo, hi, port_lo + 0.02, port_lo + 0.10),
                             (lo, hi, port_hi - 0.10, port_hi - 0.02),
                             (lo, lo + 0.05, port_lo + 0.02, port_hi - 0.02)):
            band(a, b, zb, zt, 0.10)
        hw_s = profiles.stern_half_width(p, (port_lo + port_hi) / 2.0)
        _boss(bm, (lo + hi) / 2.0 * edge * hw_s, (port_lo + port_hi) / 2.0,
              0.11, y_t - 0.06, 0.08)

    # And one carved panel per CASTLE transom above the waist. The frigate has
    # none of these, which is why her taffrail cap above is also her topmost.
    for foot, head in profiles.transom_tiers(p)[1:]:
        _carve_upper_panel(bm, p, foot, head)

    return _finish(bm, "Stern_Carving")


def build_stern(p: FrigateParams) -> list[bpy.types.Object]:
    return [build_transom(p), build_stern_gallery(p), build_stern_carving(p)]
