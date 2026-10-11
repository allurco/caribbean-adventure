"""Open rail, channels and chainplates along the sheer. Spec section 6 step 7.

Three objects:

- `Rails` — stanchions and a swept top rail over the forecastle and the
  quarterdeck. Not over the waist: there the bulwark cap already stands 1.6 m
  above the gun deck, which is a rail. Over the quarterdeck it stands 0.18 m
  above the deck edge, which is a trip hazard, so that is where the rail goes.
- `Channels` — the chain-wales, one plate per mast per side, standing proud of
  the bulwark just under the rail cap and biased aft of their own mast.
- `Chainplates` — the iron straps from each channel's outer edge down onto the
  hull skin, raking aft along the shroud's line.

Where each thing goes is `profiles`' business; this module only emits. In
particular every chainplate foot is pinned to `hull_half_width` at its own
station and height, so a strap cannot float off a tumbling topside.
"""

import bmesh
import bpy

from . import env, profiles
from .params import FrigateParams

# The rail's own section lives in `profiles` with the stanchion pitch it has to
# divide: it is layout, not cosmetics, and the middle rail's height is derived
# from the top rail's underside.
# The rail's section, the strap's section and the stanchion pitch are all
# `p.rail_form` now. `STRAP_THICK` is kept as a NAME because `check_rails`
# quotes it when it measures a chainplate foot against the skin, and a check
# that names a module constant is clearer than one that names a field path.


def _prism(bm, sections) -> None:
    """Sweep a quadrilateral cross-section along a list of 4-tuples of points."""
    rings = [[bm.verts.new(pt) for pt in sec] for sec in sections]
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))


def _stanchion_face(p: FrigateParams, sign: float, y: float, half: float):
    """One end face of a stanchion, taken at its own station."""
    t = profiles.t_of_y(p, y)
    cap = profiles.sheer(p, t) + p.bulwark_h
    top = profiles.rail_top_z(p, t) - p.rail_form.rail_t
    x = sign * (profiles.bulwark_half_width(p, t, cap) - p.bulwark_thick / 2)
    return [
        (x - half, y, cap),
        (x + half, y, cap),
        (x + half, y, top),
        (x - half, y, top),
    ]


def _finish(bm, name: str) -> bpy.types.Object:
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    env.link(obj)
    return obj


def build_open_rail(p: FrigateParams) -> bpy.types.Object:
    """Stanchions and top rail over the two raised platforms."""
    p.validate()
    bm = bmesh.new()
    for t0, t1 in profiles.rail_runs(p):
        ts = profiles.stanchion_ts(p, t0, t1)
        for sign in (-1.0, 1.0):
            sections, mid_sections = [], []
            for t in ts:
                y = profiles.station_y(p, t)
                cap = profiles.sheer(p, t) + p.bulwark_h
                top = profiles.rail_top_z(p, t)
                # Stand on the middle of the bulwark cap, not on its outer lip.
                x = sign * (profiles.bulwark_half_width(p, t, cap) - p.bulwark_thick / 2)
                # Each of the stanchion's two faces sits on the cap at its OWN
                # station. The sheer slopes 0.12 m per metre near the stem, so a
                # flat-bottomed box 90 mm long hangs 5 mm through the cap at one end.
                _prism(bm, [
                    _stanchion_face(p, sign, y_face, p.rail_form.stanchion_w / 2)
                    for y_face in (y - p.rail_form.stanchion_w / 2,
                                   y + p.rail_form.stanchion_w / 2)
                ])
                rw, rt = p.rail_form.rail_w, p.rail_form.rail_t
                sections.append([
                    (x - rw / 2, y, top - rt),
                    (x + rw / 2, y, top - rt),
                    (x + rw / 2, y, top),
                    (x - rw / 2, y, top),
                ])
                # The middle rail. Swept on the SAME stations as the top rail,
                # so both follow the sheer together and the two of them plus a
                # stanchion read as one piece of joinery rather than as a rail
                # with a stick under it.
                mid = profiles.rail_mid_z(p, t)
                half_w = p.rail_form.midrail_w / 2
                half_t = p.rail_form.midrail_t / 2
                mid_sections.append([
                    (x - half_w, y, mid - half_t),
                    (x + half_w, y, mid - half_t),
                    (x + half_w, y, mid + half_t),
                    (x - half_w, y, mid + half_t),
                ])
            _prism(bm, sections)
            _prism(bm, mid_sections)
    return _finish(bm, "Rails")


def build_channels(p: FrigateParams) -> bpy.types.Object:
    """One chain-wale per mast per side, hugging the outer face of the wall
    it is bolted to: the waist bulwark, or a castle's own wall where
    `RailForm.castle_channels` puts it there."""
    p.validate()
    bm = bmesh.new()
    for name in profiles.mast_names(p):
        t_fwd, t_aft = profiles.channel_span(p, name)
        ts = [t_fwd + (t_aft - t_fwd) * i / 3 for i in range(4)]
        for sign in (-1.0, 1.0):
            sections = []
            for t in ts:
                y = profiles.station_y(p, t)
                z_top = profiles.channel_z(p, t, name)
                z_bot = z_top - p.rail_form.channel_thick
                x_in = sign * profiles.bulwark_half_width(p, t, z_top)
                x_out = sign * profiles.channel_outer(p, t, name)
                sections.append([
                    (x_in, y, z_bot),
                    (x_out, y, z_bot),
                    (x_out, y, z_top),
                    (x_in, y, z_top),
                ])
            _prism(bm, sections)
    return _finish(bm, "Channels")


def build_chainplates(p: FrigateParams) -> bpy.types.Object:
    """The straps from each channel's outer edge down onto the hull skin."""
    p.validate()
    bm = bmesh.new()
    for name in profiles.mast_names(p):
        for head, foot in profiles.chainplate_segments(p, name):
            for sign in (-1.0, 1.0):
                # The strap is 130 mm wide fore and aft, and the hull narrows
                # 0.31 m per metre of y near the fore channel. Taking one x for
                # the whole width floated the aft corners 63 mm off the skin, so
                # each corner's half-width is read at that corner's own station.
                sections = []
                sw, st = p.rail_form.strap_w, p.rail_form.strap_thick
                for point, on_skin in ((head, False), (foot, True)):
                    _x, _y, z = point
                    section = []
                    for y in (_y - sw / 2, _y + sw / 2):
                        t = profiles.t_of_y(p, y)
                        x = sign * (profiles.hull_half_width(p, t, z)
                                    - p.rail_form.strap_bed if on_skin
                                    else profiles.channel_outer(p, t, name))
                        section.append((x, y, z))
                    sections.append([
                        section[0],
                        (section[0][0] + sign * st, section[0][1], z),
                        (section[1][0] + sign * st, section[1][1], z),
                        section[1],
                    ])
                _prism(bm, sections)
    return _finish(bm, "Chainplates")


def build_rails(p: FrigateParams) -> list[bpy.types.Object]:
    """The channels and chainplates always; the open rail only where one is
    needed.

    `profiles.railed_tiers` is the rule: a platform that tucks under the main
    bulwark has nothing round its edge, so it gets a rail; a CASTLE deck
    already carries a bulwark of its own and railing it again would stand a
    second rail on the first. All three of the galleon's raised decks are
    castles, so it builds no `Rails` object at all -- and an empty mesh
    called `Rails` would be a worse answer than no mesh, because every later
    pass would find it and believe it.
    """
    built = []
    if profiles.rail_runs(p):
        built.append(build_open_rail(p))
    return built + [build_channels(p), build_chainplates(p)]
