"""Spec section 6 step 15, part two: UV unwrap, and bake to a PBR set.

One texture set per material family — albedo, normal, roughness at
`texbudget.ATLAS_SIZE` — so the ship ships as four atlases and four materials.
The size and the file format of each atlas are `frigate.texbudget`'s ruling,
not this module's: 1024, albedo and roughness as JPEG, normals as PNG.

THE BLANKNESS VERDICT IS TAKEN BEFORE ANY ENCODING, AND THE ORDER IS RECORDED.
The sentinel is magenta and JPEG does not preserve magenta — measured, a
round trip at quality 90 moves every sentinel texel off (1, 0, 1, 1), so a
guard that counted surviving sentinels in a DECODED jpeg would count zero and
call every bake clean. `bake_all` measures the float buffer, then fills the
background, then encodes, and the scene records which happened first per
image so `check_bake` can refuse a run that did it the other way round.

THE SENTINEL. Every bake target is filled with magenta before the bake and the
bake is told NOT to clear it. Magenta is a colour none of the four graphs can
produce, so a texel still holding it afterwards is a texel the bake did not
write. That turns "did the bake actually do anything" from a thing you squint
at into a count, and `frigate.texstats` takes the verdict on the counts. The
project's Review Focus names the failure: a green export of empty textures.

ONE OBJECT PER MESH IS BAKED, NOT ONE PER OBJECT. 61 of the 86 objects share a
mesh datablock with another — 24 cannons, 24 port lids, 8 barrels, 2 anchors, 3
lanterns — so they share a slice of the atlas and would otherwise bake over each
other 24 times for one result. `frigate.materials` already makes that result
identical by shading from OBJECT coordinates, so baking the representative is
baking all of them.

THE SUBSURF IS NOT APPLIED. The hull carries a Subdivision modifier and
`check_hull` asserts its cage vertex count. The bake reads the evaluated mesh
and interpolates the cage's UVs across it, which is what a subdivision surface
is for; applying the modifier to unwrap would change the number the check
guards and buy nothing.
"""

import math
import os

import bpy

from . import env, palette, texbudget, texstats
from .params import FrigateParams

UV_LAYER = palette.BAKE_UV
BAKE_SIZE = texbudget.ATLAS_SIZE
ISLAND_MARGIN = 0.0025
BAKE_MARGIN = 8
PNG_COMPRESSION = 95   # lossless at every setting; this one is just smaller
JPEG_QUALITY = texbudget.JPEG_QUALITY

TEXTURE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "build", "textures")

# (our name for the pass, the Cycles bake type)
PASSES = (("albedo", "DIFFUSE"), ("normal", "NORMAL"), ("roughness", "ROUGHNESS"))

# The two carved objects. A NORMAL bake of an object onto ITSELF records the
# difference between its shading normal and its face normal, which for a
# flat-shaded object is zero everywhere — so the Minerva figurehead's drapery
# and the stern frieze, the two pieces of fold-depth detail on the ship and the
# ones the maintainer has reservations about, would bake to flat tangent space and the
# normal map would carry nothing of them. They get a second, high-to-low pass
# instead: a smooth, once-subdivided copy of the same mesh is baked ONTO the
# original, which puts the fold curvature in the texture while the carving
# keeps its crisp flat-shaded silhouette in the geometry.
CARVINGS = ("Figurehead", "Stern_Carving")

BAKE_NODE_LABEL = "bake:target"

# The procedural graph's terminals, by the label `frigate.materials` gives them,
# and the Principled input each one feeds. Labels, not names: ours, not
# localised, and they survive a file reload where a Python reference does not.
PROCEDURAL_OUT = {
    "out:base_color": 0, "out:metallic": 1, "out:roughness": 2,
    "out:alpha": 4, "out:normal": 6,
}
BAKED_NODE_LABEL = {"albedo": "tex:albedo", "normal": "tex:normal",
                    "roughness": "tex:roughness"}

# A baked atlas is only correct for the unwrap it was baked against, and
# `build.rebuild` re-unwraps every time it runs. Without this, a rebuild after a
# bake leaves a ship wearing somebody else's textures — which looks like a
# shading bug and is not one. The signature is stored on the SCENE so it
# survives being saved into the `.blend` and reopened.
UV_SIGNATURE_KEY = "frigate_bake_uv_signature"

# What `measure` saw BEFORE the background was painted out, by image name. The
# post-fill image is still judgeable — a bake that did nothing fills uniformly
# and `texstats.faults` condemns it as flat — but this is the reading taken
# while the sentinel was still there to count.
LAST_BAKE_STATS = {}

# Two readings `check_bake` needs that a module-level dict cannot hold: a
# module reload — which the bootstrap does on every session — would wipe them,
# and so would reopening the `.blend`. They go on the SCENE for the same reason
# the UV signature does, as JSON because an ID property cannot hold a nest.
#
# SAVE_ORDER_KEY: {image name: ["measured", "saved"]} in the order the two
# actually happened. The sentinel count is only meaningful on the unencoded
# float buffer — JPEG does not round-trip magenta, so a verdict taken after
# encoding would read zero surviving sentinels on an atlas that was never
# baked at all, and the guard would go green precisely when it had failed.
#
# CARVING_SPAN_KEY: {carving: {"self": [red, green], "high_to_low": [red,
# green]}}. Both regimes, measured every run, because the floor `check_bake`
# holds the carvings to has to sit in the GAP between them, and the gap moves
# with the atlas size. At 2048 it was 0.243/0.106 against 0.965/0.992; at 1024
# the texels are a quarter the area, so the spans are re-read, not reused.
SAVE_ORDER_KEY = "frigate_bake_save_order"
CARVING_SPAN_KEY = "frigate_bake_carving_spans"

# SCAR_PAINT_KEY: {scar index: {"texels": n, "metres_per_texel": m, ...}} from
# the last bake. The nine shot scars are cut 2 mm into a CLOSED hull, so they
# cannot be seen from outside; they are painted into the hull timber albedo
# and normal atlases instead. The paint runs strictly BETWEEN the blankness
# measure and the encode — after, so a painted scar can never make a blank
# bake look baked, and before, so the file on disk and the image in the `.glb`
# both carry it. `check_bake` asserts that order on every hull timber atlas.
SCAR_PAINT_KEY = "frigate_bake_scar_paint"
# SCAR_REGIME_KEY: {kind: {"unpainted": x, "painted": y}} — the worst of
# the nine scars under each regime, read off the SAME atlas before and
# after the paint. See `scar_regimes`.
SCAR_REGIME_KEY = "frigate_bake_scar_regimes"
# ALPHA_CUT_KEY: {family: {"cut": n, "covered": n, "margin": texels}} for
# every family whose albedo carries an alpha cut, from the last bake: the
# texels cut to alpha 0, the texels that are not background, and the bake
# margin. `check_bake` holds the grating's to its cards' open fraction.
ALPHA_CUT_KEY = "frigate_bake_alpha_cut"


def _record(key: str, value) -> None:
    import json

    bpy.context.scene[key] = json.dumps(value)


def _recorded(key: str) -> dict:
    import json

    raw = bpy.context.scene.get(key)
    return json.loads(raw) if raw else {}


def save_order() -> dict:
    """{image name: the order `measure` and `_save` ran in} from the last bake."""
    return _recorded(SAVE_ORDER_KEY)


def alpha_cuts() -> dict:
    """{family: {"cut", "covered", "margin"}} from the last bake."""
    return _recorded(ALPHA_CUT_KEY)


def carving_spans() -> dict:
    """{carving: {regime: [red span, green span]}} from the last bake."""
    return _recorded(CARVING_SPAN_KEY)


def scar_paint() -> dict:
    """{scar index: what the painter wrote} from the last bake."""
    return _recorded(SCAR_PAINT_KEY)


def _enum(owner, prop: str, wanted: str) -> str:
    items = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    if wanted not in items:
        raise ValueError(
            f"{owner.bl_rna.identifier}.{prop} has no value {wanted!r}; "
            f"this Blender offers {items}"
        )
    return wanted


def _set_enum(owner, prop: str, wanted: str) -> None:
    setattr(owner, prop, _enum(owner, prop, wanted))


def representatives(p=None) -> dict:
    """{family: [one object per unique mesh datablock]}, in a stable order.

    Over `palette.families(p)`: the frigate's four, or a ship's five when
    her beakhead deck carries the grating family."""
    coll = bpy.data.collections[env.collection_name()]
    fams = palette.FAMILIES if p is None else palette.families(p)
    seen, out = set(), {f: [] for f in fams}
    for obj in sorted(coll.objects, key=lambda o: o.name):
        if obj.type != "MESH" or obj.data.name in seen:
            continue
        # A mesh with NO FACES has no texels to unwrap or bake, and Cycles
        # refuses the whole bake over it: the sloop's `Tops`, on a mast that
        # carries no top. Every object the frigate and galleon build has
        # faces, so neither list moves.
        if not obj.data.polygons:
            continue
        seen.add(obj.data.name)
        out[palette.family_of(obj.name)].append(obj)
    return out


# --- unwrap ------------------------------------------------------------------


def _ensure_uv_layer(mesh) -> None:
    """Give the mesh a `UVMap` layer and make it the one the bake reads.

    The rigging already carries `rope_width`, which is the FIRST layer on that
    mesh and would otherwise be both active and active_render — the unwrap would
    overwrite the alpha cut's coordinate and the bake would read it. Naming the
    bake layer explicitly and setting active_render on it is what keeps the two
    apart.
    """
    layer = mesh.uv_layers.get(UV_LAYER) or mesh.uv_layers.new(name=UV_LAYER)
    mesh.uv_layers.active = layer
    for other in mesh.uv_layers:
        other.active_render = other.name == UV_LAYER


def unwrap_all(p: FrigateParams) -> dict:
    """Smart-project and pack each family's meshes into one 0..1 square.

    Returns {family: n meshes unwrapped}. Packing is done per FAMILY, across all
    of that family's meshes at once in multi-object edit mode, because the
    family is what shares an atlas.
    """
    reps = representatives(p)
    for objs in reps.values():
        for obj in objs:
            _ensure_uv_layer(obj.data)
    view = bpy.context.view_layer
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for _family, objs in reps.items():
        if not objs:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.hide_set(False)
            obj.select_set(True)
        view.objects.active = objs[0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=ISLAND_MARGIN)
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(margin=ISLAND_MARGIN)
        bpy.ops.object.mode_set(mode="OBJECT")
        if _family == COLOURS_FAMILY and p.canvas_pack < 1.0:
            _shrink_pack(objs, p.canvas_pack)
    bpy.ops.object.select_all(action="DESELECT")
    return {f: len(o) for f, o in reps.items()}


def _shrink_pack(objs, scale: float) -> None:
    """Scale a packed family's islands toward the atlas corner by `scale`.

    The ensign's second state is parked in a free block of the canvas atlas
    (`place_alt_island`), and a canvas that packs the square full leaves
    none: the sloop's, whose sails are few and whose flag is the frigate's,
    packed with no 172 x 106 block free. Shrinking the pack leaves an L of
    free texels `1 - scale` of the atlas wide along two edges.
    """
    for obj in objs:
        layer = obj.data.uv_layers.get(UV_LAYER)
        uv = [0.0] * (2 * len(layer.data))
        layer.data.foreach_get("uv", uv)
        layer.data.foreach_set("uv", [c * scale for c in uv])


# --- bake --------------------------------------------------------------------


def _target_image(p, family: str, kind: str):
    name = f"{family}_{kind}"
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    # ALPHA ONLY WHERE SOMETHING USES IT. A fourth channel that is 1.0
    # everywhere still costs a byte a texel in the PNG: measured on the hull
    # timber normal map at 1024, 1,411,884 bytes with it and 1,265,340
    # without, 10.4% for a channel nothing reads. Only the albedo of a family
    # with an alpha cut needs one.
    img = bpy.data.images.new(
        name, BAKE_SIZE, BAKE_SIZE,
        alpha=kind == "albedo" and family_carries_alpha(p, family),
        is_data=kind != "albedo")
    img.colorspace_settings.name = (
        "sRGB" if kind == "albedo" else "Non-Color"
    )
    # The sentinel. Not a clear to black: a correct albedo bake of the black
    # wales IS black, and a guard that reads black as empty condemns exactly the
    # part of the scheme the reference is most specific about.
    img.pixels.foreach_set(list(texstats.SENTINEL) * (BAKE_SIZE * BAKE_SIZE))
    return img


def _bake_node(mat, img):
    tree = mat.node_tree
    node = next((n for n in tree.nodes
                 if n.type == "TEX_IMAGE" and n.label == BAKE_NODE_LABEL), None)
    if node is None:
        node = tree.nodes.new("ShaderNodeTexImage")
        node.label = BAKE_NODE_LABEL
        node.location = (900, -400)
    node.image = img
    # Unconnected on purpose: it is the bake TARGET, not an input. If it were
    # wired into Base Color the second bake would read the first bake's output.
    tree.nodes.active = node
    node.select = True
    return node


def _use_cycles(scene) -> str:
    """Switch to Cycles, which is the only engine that bakes, and say what was
    there before so it can be put back.

    `scene.render.engine` is a dynamic enum that RNA under-reports — engines
    registered by add-ons are not RNA enum items — so the current value is read
    (always valid) and the switch is made inside try/except TypeError, whose
    message lists every identifier this Blender really accepts.
    """
    previous = scene.render.engine
    try:
        scene.render.engine = "CYCLES"
    except TypeError as exc:
        raise RuntimeError(
            f"this Blender will not switch to CYCLES, which is the only engine "
            f"that bakes: {exc}"
        ) from exc
    return previous


def bake_all(p: FrigateParams, samples: int = 8) -> dict:
    """Bake albedo, normal and roughness for all four families. Returns paths.

    SETS THE ACTIVE SHIP FIRST, which `build.rebuild` and `build.check_all`
    have always done and this had not. `env.collection_name()` is read from a
    module global, so with it left pointing elsewhere this baked whatever ship
    was last active into THIS ship's atlases, under this ship's names, and
    said it had worked. See DEFECT 11 on `export.export`.
    """
    p.validate()
    env.set_active(p)
    scene = bpy.context.scene
    reps = representatives(p)
    everything = [o for objs in reps.values() for o in objs]
    if not everything:
        raise RuntimeError(
            f"nothing to bake — the {env.collection_name(p)!r} collection is empty")

    previous_engine = _use_cycles(scene)
    bake = scene.render.bake
    bake.use_selected_to_active = False
    bake.margin = BAKE_MARGIN
    _set_enum(bake, "margin_type", "ADJACENT_FACES")
    _set_enum(bake, "normal_space", "TANGENT")
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    scene.cycles.samples = samples

    os.makedirs(TEXTURE_DIR, exist_ok=True)
    order = {}
    _record(SAVE_ORDER_KEY, order)
    _record(ALPHA_CUT_KEY, {})
    # Worked out once, on the hull's evaluated mesh, and used by both the
    # albedo pass and the normal pass — they must paint the same texels or the
    # dent and the splinters would sit in different places.
    footprints = None
    painted = {}
    regimes = {}
    # The colours' second state: where it is parked, what the device covers,
    # and how far it moved each atlas. Decided once, on the albedo, and reused
    # by the normal and roughness passes — the two states must be the same two
    # rectangles in all three or the engine switches one map and not the rest.
    place = {}
    colours_plan = None
    flown = {}
    sewn = {}
    colour_regimes = {}
    # Blender's default PNG compression is 15, which on four 2048 atlases of
    # procedural noise costs tens of megabytes for nothing: PNG is lossless at
    # every setting, so the only thing 15 buys over 90 is encode time.
    scene.render.image_settings.compression = PNG_COMPRESSION
    written = {}
    try:
        # The procedural graph must be the thing on the BSDF while baking, or
        # the second bake reads the first one's output back in.
        for family in palette.families(p):
            connect_procedural(bpy.data.materials[palette.material_names(p)[family]])
        for kind, bake_type in PASSES:
            images = {}
            for family in palette.families(p):
                mat = bpy.data.materials[palette.material_names(p)[family]]
                images[family] = _target_image(p, family, kind)
                _bake_node(mat, images[family])
            bpy.ops.object.select_all(action="DESELECT")
            for obj in everything:
                obj.hide_set(False)
                obj.hide_render = False
                obj.select_set(True)
            bpy.context.view_layer.objects.active = everything[0]
            bpy.ops.object.bake(type=_enum(scene.cycles, "bake_type", bake_type),
                                use_clear=False)
            if kind == "normal":
                # BOTH REGIMES, EVERY RUN. The carvings' own texels are read
                # once with only the self-bake in them and once after the
                # high-to-low pass, so the gap the threshold has to sit in is a
                # measurement of THIS bake at THIS atlas size rather than a
                # number inherited from a bake at a different one.
                self_bake = _carving_spans(images[palette.HULL_TIMBER])
                _bake_carving_normals(scene)
                high = _carving_spans(images[palette.HULL_TIMBER])
                _record(CARVING_SPAN_KEY, {
                    name: {"self": list(self_bake[name]),
                           "high_to_low": list(high[name])}
                    for name in self_bake})
            for family, img in images.items():
                # MEASURE FIRST, THEN FILL. The measurement is taken on the
                # sentinel and the fill erases it, so doing these in the other
                # order would destroy the evidence the verdict rests on.
                stats = measure(img, kind)
                LAST_BAKE_STATS[img.name] = stats
                order[img.name] = ["measured"]
                _record(SAVE_ORDER_KEY, order)
                background = _sentinel_mask(img)
                fill_background(img, stats, background)
                if kind == "albedo":
                    # STRICTLY AFTER THE FILL. Compositing the alpha cut first
                    # moves every background texel off (1, 0, 1, 1) to
                    # (1, 0, 1, 0), which stops it being recognised as the
                    # sentinel — so nothing gets filled and the atlas ships with
                    # its magenta still in it. That is exactly what happened the
                    # first time this ran.
                    cut = _bake_alpha_into_albedo(p, scene, family, background)
                    if cut:
                        written[f"{family}_alpha_texels_cut"] = cut
                if family == COLOURS_FAMILY:
                    # See the colours section: place, copy, THEN paint, all
                    # after the sentinel verdict and before the encode.
                    if not place:
                        place.update(place_alt_island(background))
                        ensure_alt_uv(place)
                        _record(COLOURS_PLACE_KEY, place)
                    copy_island(img, place)
                    order[img.name].append("colours_copied")
                    if colours_plan is None:
                        colours_plan = colours_footprint(p)
                    if kind in ("albedo", "normal"):
                        # THE CLOTH'S GRAIN IS READ HERE AND NOWHERE ELSE:
                        # after the copy, before either state is painted. It
                        # is the noise floor both relief figures divide by, so
                        # it has to be the bare cloth's and not the grain of
                        # something painted on top of it.
                        grain = cloth_grain(img, kind, place, colours_plan)
                        # STRICTLY AFTER THE COPY, BOTH OF THEM. The copy is
                        # what the flag baked to; painting the device first
                        # would put the skull in both states and the flag
                        # would stop being gainable while every other check
                        # stayed green. The device goes on the PRIMARY island,
                        # the ensign on the PARKED copy, and never the other
                        # way round.
                        flown[kind] = paint_device(p, img, kind, colours_plan)
                        sewn[kind] = paint_ensign(p, img, kind, place,
                                                  colours_plan)
                        colour_regimes[kind] = colours_change(
                            img, kind, place, colours_plan, grain)
                        _record(COLOURS_REGIME_KEY, colour_regimes)
                        order[img.name].append("colours_painted")
                    _record(SAVE_ORDER_KEY, order)
                # Only a ship that was DAMAGED has scars to paint.
                if family == SCAR_FAMILY and kind in ("albedo", "normal") \
                        and p.builds("damage"):
                    # STRICTLY AFTER THE MEASURE AND STRICTLY BEFORE THE SAVE.
                    # See the painter section: measured first so nine painted
                    # blobs can never make a blank bake look baked, saved
                    # after so the bytes on disk — which are the bytes the
                    # `.glb` embeds — carry the scars.
                    if footprints is None:
                        footprints = scar_footprints(p)
                    before = _pixels(img)[0].copy()
                    painted[kind] = paint_scars(p, img, kind, footprints)
                    regimes[kind] = scar_change(img, kind, footprints, before)
                    _record(SCAR_REGIME_KEY, regimes)
                    order[img.name].append("scars_painted")
                    _record(SAVE_ORDER_KEY, order)
                written[f"{family}_{kind}"] = _save(p, img, family, kind)
                order[img.name].append("saved")
                _record(SAVE_ORDER_KEY, order)
    finally:
        scene.render.engine = previous_engine
        bpy.ops.object.select_all(action="DESELECT")
    _record(SCAR_PAINT_KEY, painted.get("albedo", {}))
    written["colours_device_texels"] = flown.get("albedo", {}).get("device_texels", 0)
    written["colours_ensign_texels"] = sewn.get("albedo", {}).get("texels", 0)
    # The baked images are what the `.glb` carries, so they go on the BSDF now.
    stamp_uv_signature()
    for family in palette.families(p):
        connect_baked(bpy.data.materials[palette.material_names(p)[family]], family)
    return written


# --- the verdict -------------------------------------------------------------


EXTENSION = {texbudget.PNG: "png", texbudget.JPEG: "jpg"}


def family_carries_alpha(p, family: str) -> bool:
    """Does this family's albedo atlas have to carry a fourth channel?

    True exactly where the material graph has an `out:alpha` terminal, which on
    this ship is the rope and iron family and nothing else. Asked of the graph
    rather than hardcoded, so adding an alpha cut to another family moves the
    atlas back to PNG by itself instead of silently losing the cut.
    """
    mat = bpy.data.materials.get(palette.material_names(p)[family])
    if mat is None or not mat.use_nodes:
        return False
    return _labelled(mat.node_tree, "out:alpha") is not None


def _save(p, img, family: str, kind: str) -> str:
    """Write one atlas in the format `frigate.texbudget` rules it ships as.

    The other extension is deleted if it is lying around, so `build/textures/`
    is exactly what the `.glb` carries rather than that plus a previous pass.
    """
    fmt = texbudget.image_format(kind, family_carries_alpha(p, family))
    stem = os.path.join(TEXTURE_DIR, palette.atlas_stem(p, family, kind))
    for ext in EXTENSION.values():
        stale = f"{stem}.{ext}"
        if ext != EXTENSION[fmt] and os.path.exists(stale):
            os.remove(stale)
    path = f"{stem}.{EXTENSION[fmt]}"
    settings = bpy.context.scene.render.image_settings
    _set_enum(settings, "file_format", fmt)
    settings.quality = JPEG_QUALITY
    settings.compression = PNG_COMPRESSION
    img.filepath_raw = path
    img.file_format = _enum(img, "file_format", fmt)
    img.save(quality=JPEG_QUALITY if fmt == texbudget.JPEG else PNG_COMPRESSION)
    return path


def _carving_spans(img) -> dict:
    """{carving: (red span, green span)} over each carving's OWN texels.

    Red and green are where a tangent-space normal map's tilt lives; blue is
    close to 1.0 over every flat face on the ship whether the bake worked or
    not, which is why it is not read here.
    """
    out = {}
    for name in CARVINGS:
        if bpy.data.objects.get(name) is None:
            continue
        s = measure_uv_region(img, name, "normal")
        out[name] = (s.channels[0].hi - s.channels[0].lo,
                     s.channels[1].hi - s.channels[1].lo)
    return out


def _channel_stats(flat, bins: int = 256):
    import numpy as np

    lo, hi = float(flat.min()), float(flat.max())
    counts = np.bincount(
        np.clip(((flat - lo) / (hi - lo) * (bins - 1)).astype(np.int32), 0, bins - 1)
        if hi > lo else np.zeros(flat.shape, dtype=np.int32),
        minlength=bins,
    )
    return texstats.ChannelStats(
        lo=lo, hi=hi, mean=float(flat.mean()), std=float(flat.std()),
        modal_share=float(counts.max()) / float(flat.size),
    )


def measure(img, kind: str) -> texstats.TextureStats:
    """Statistics of a baked image, over the texels the bake actually wrote.

    Covered means "no longer the sentinel". The comparison is exact rather than
    tolerant: the sentinel is written exactly and a bake that touches a texel at
    all moves it off (1, 0, 1) in some channel, so there is nothing to tune.
    """
    import numpy as np

    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgba = buf.reshape(-1, 4)
    sentinel = np.asarray(texstats.SENTINEL, dtype=np.float32)
    covered_mask = np.any(rgba != sentinel, axis=1)
    covered = rgba[covered_mask]
    if covered.size == 0:
        channels = tuple(texstats.ChannelStats(0.0, 0.0, 0.0, 0.0, 1.0) for _ in range(4))
    else:
        channels = tuple(_channel_stats(covered[:, i]) for i in range(4))
    return texstats.TextureStats(
        name=img.name, kind=kind, width=w, height=h,
        covered=int(covered_mask.sum()), total=w * h, channels=channels,
    )


def measure_all(p=None) -> list:
    out = []
    fams = palette.FAMILIES if p is None else palette.families(p)
    for family in fams:
        for kind, _ in PASSES:
            img = bpy.data.images.get(f"{family}_{kind}")
            if img is None:
                continue
            out.append(measure(img, kind))
    return out


def _sentinel_mask(img):
    """Texels the bake never wrote, as a boolean mask. Must be taken BEFORE any
    compositing, because anything written into any channel ends the sentinel."""
    import numpy as np

    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    sentinel = np.asarray(texstats.SENTINEL, dtype=np.float32)
    return np.all(buf.reshape(-1, 4) == sentinel, axis=1)


def fill_background(img, stats, mask=None) -> int:
    """Paint the unbaked part of an atlas out of the sentinel. Returns texels filled.

    Called only AFTER `measure`. If the bake wrote nothing at all the sentinel
    is deliberately left in place: a wholly magenta image is both obvious to a
    human and flat to `texstats.faults`, and there is no mean to fill it with.
    """
    import numpy as np

    if stats.covered == 0:
        return 0
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgba = buf.reshape(-1, 4)
    sentinel = np.asarray(texstats.SENTINEL, dtype=np.float32)
    empty = np.all(rgba == sentinel, axis=1) if mask is None else mask
    fill = texstats.background_fill(
        stats.kind, (stats.channels[0].mean, stats.channels[1].mean,
                     stats.channels[2].mean))
    rgba[empty] = np.asarray(fill, dtype=np.float32)
    img.pixels.foreach_set(rgba.reshape(-1))
    img.update()
    return int(empty.sum())


def _highpoly_copy(obj):
    """A smooth, once-subdivided copy of a mesh, to bake its curvature down."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = f"{obj.name}_HiPoly"
    bpy.context.scene.collection.objects.link(copy)
    copy.data.shade_smooth()
    mod = copy.modifiers.new("Subdivision", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    return copy


def _bake_carving_normals(scene) -> list:
    """Bake the carvings' fold depth down from a smooth copy. Returns the names done.

    `use_selected_to_active` writes only the ACTIVE object's UV islands, and the
    bake is run with `use_clear` off, so this overwrites the two carvings' own
    corner of the hull timber atlas and leaves the other fourteen meshes'
    regions exactly as the first pass left them.
    """
    bake = scene.render.bake
    done = []
    try:
        for name in CARVINGS:
            target = bpy.data.objects.get(name)
            if target is None:
                continue
            source = _highpoly_copy(target)
            try:
                bake.use_selected_to_active = True
                bake.cage_extrusion = 0.06
                bake.max_ray_distance = 0.12
                bpy.ops.object.select_all(action="DESELECT")
                source.select_set(True)
                target.select_set(True)
                bpy.context.view_layer.objects.active = target
                bpy.ops.object.bake(
                    type=_enum(scene.cycles, "bake_type", "NORMAL"), use_clear=False)
                done.append(name)
            finally:
                mesh = source.data
                bpy.data.objects.remove(source, do_unlink=True)
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
    finally:
        bake.use_selected_to_active = False
    return done


def measure_uv_region(img, obj_name: str, kind: str):
    """Statistics of just the texels ONE object's UV vertices land on.

    Named because an atlas average hides a region: the hull timber normal map
    can read healthy on the planking's wood grain while the figurehead's own
    corner of it is flat tangent space, and the figurehead is the part of the
    bake that was asked for by name.
    """
    import numpy as np

    obj = env.obj(obj_name)
    layer = obj.data.uv_layers.get(UV_LAYER)
    if layer is None:
        raise KeyError(f"{obj_name} has no {UV_LAYER} layer")
    w, h = img.size
    uvs = np.empty(len(layer.data) * 2, dtype=np.float32)
    layer.data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2)
    xs = np.clip((uvs[:, 0] * w).astype(np.int32), 0, w - 1)
    ys = np.clip((uvs[:, 1] * h).astype(np.int32), 0, h - 1)
    idx = np.unique(ys * w + xs)
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgba = buf.reshape(-1, 4)[idx]
    sentinel = np.asarray(texstats.SENTINEL, dtype=np.float32)
    covered = rgba[np.any(rgba != sentinel, axis=1)]
    if covered.size == 0:
        channels = tuple(texstats.ChannelStats(0.0, 0.0, 0.0, 0.0, 1.0) for _ in range(4))
    else:
        channels = tuple(_channel_stats(covered[:, i]) for i in range(4))
    return texstats.TextureStats(
        name=f"{img.name}@{obj_name}", kind=kind, width=w, height=h,
        covered=int(len(covered)), total=int(len(idx)), channels=channels,
    )


# --- painting the shot scars -------------------------------------------------
#
# THE PROBLEM THIS SOLVES, STATED AS THE PREVIOUS PASS LEFT IT. The nine shot
# scars were corrected from standing 0.151 m proud of the hull to being cut
# 2 mm into it, under the ruling `Damage -> Hull, INTO`. That is right and it
# made them invisible: the hull is a CLOSED surface, so a depression behind
# its skin is behind its skin. The maintainer's ruling is to paint them — splintered
# pale wood in the albedo, a real dent in the normal map — and to leave the
# recessed geometry exactly where it is. Nothing here moves a vertex.
#
# WHERE IT SITS IN THE ORDER, AND WHY THAT IS NOT NEGOTIABLE. The paint runs
# AFTER `measure` and BEFORE `_save`:
#   after, because a painted scar is a texture, and a guard that measured it
#   would let a wholly blank bake through on nine painted blobs;
#   before, because the `.glb` embeds the bytes of the file on disk, so paint
#   applied after the save would be in Blender and in nothing that ships.
# `check_bake` asserts the sequence ["measured", "scars_painted", "saved"] on
# both hull timber atlases rather than trusting this comment.

SCAR_FAMILY = palette.HULL_TIMBER
SCAR_HOST = "Hull"

# The mutation knob, and the only reason it exists. 1.0 is the shipped paint.
# Setting it to 0.0 paints nothing, which is how the scar assertions in
# `check_bake` were watched to fail; see the ledger.
PAINT_STRENGTH = 1.0

# The comparison ring. Everything from the outer edge of the paint out to this
# multiple of the paint radius is UNPAINTED planking of the same object, and
# it is what the scar's own texels are measured against — so the assertion
# compares the scar with the timber beside it rather than with a number.
SCAR_COMPARE_RING = 2.2


def _hull_triangles():
    """(world-space vertices, bake UVs) of every triangle of the RENDERED hull.

    The rendered hull, not the cage: the subsurf is 5,488 of the ship's
    triangles and the scars were raycast onto the limit surface in the first
    place. The UVs come off the evaluated mesh too, which is where the cage's
    unwrap has been interpolated across the subdivision — the same
    interpolation Cycles baked through.
    """
    obj = env.obj(SCAR_HOST)
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    try:
        mesh.calc_loop_triangles()
        layer = mesh.uv_layers.get(UV_LAYER)
        if layer is None:
            raise KeyError(f"{SCAR_HOST} has no {UV_LAYER} layer to paint into")
        mw = obj.matrix_world
        co = [mw @ v.co for v in mesh.vertices]
        out = []
        for tri in mesh.loop_triangles:
            out.append((
                tuple(tuple(co[i]) for i in tri.vertices),
                tuple(tuple(layer.data[loop].uv) for loop in tri.loops),
            ))
        return out
    finally:
        ev.to_mesh_clear()


def scar_footprints(p: FrigateParams) -> list:
    """Which texels each shot scar owns, and where in the scar each one lies.

    Returns one dict per scar: `texels` maps (x, y) to (d, angle) where d is
    the distance from the scar centre divided by the PAINT radius and the
    angle is taken in a deterministic tangent frame on the hull there;
    `outside` is the unpainted comparison ring; `metres_per_texel` is this
    scar's own texel size, measured from the triangles it lands on rather
    than from an atlas average.
    """
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    from . import damage, scarpaint

    tris = _hull_triangles()
    tree = BVHTree.FromPolygons(
        [Vector(v) for t in tris for v in t[0]],
        [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(tris))],
    )
    out = []
    for index, scar in enumerate(damage.scar_anchors(p)):
        aim = Vector((scar["x"], scar["y"], scar["z"]))
        loc, nrm, _idx, _dist = tree.find_nearest(aim, 5.0)
        if loc is None:
            raise ValueError(f"scar {index} has no hull surface under it")
        centre = tuple(loc)
        t1, t2 = scarpaint.tangent_basis(tuple(nrm))
        radius = scarpaint.paint_radius(scar["radius"])
        reach = radius * SCAR_COMPARE_RING
        texels, outside, band_of = {}, {}, {}
        world_area = uv_area = 0.0
        for world, uvs in tris:
            near = min(
                sum((a - b) ** 2 for a, b in zip(v, centre)) for v in world)
            if near > (reach + 0.6) ** 2:
                continue
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = world
            e1 = (bx - ax, by - ay, bz - az)
            e2 = (cx - ax, cy - ay, cz - az)
            cross = (e1[1] * e2[2] - e1[2] * e2[1],
                     e1[2] * e2[0] - e1[0] * e2[2],
                     e1[0] * e2[1] - e1[1] * e2[0])
            world_area += 0.5 * sum(c * c for c in cross) ** 0.5
            (u0, v0), (u1, v1), (u2, v2) = uvs
            uv_area += 0.5 * abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0))
            for x, y, bary in scarpaint.rasterize_triangle(uvs, BAKE_SIZE, BAKE_SIZE):
                point = tuple(sum(bary[k] * world[k][axis] for k in range(3))
                              for axis in range(3))
                dist, angle = scarpaint.polar(point, centre, t1, t2)
                if dist <= radius:
                    d = dist / radius
                    held = texels.get((x, y))
                    if held is None or d < held[0]:
                        texels[(x, y)] = (d, angle)
                elif dist <= reach:
                    held = outside.get((x, y))
                    if held is None or dist < held:
                        outside[(x, y)] = dist
                        band_of[(x, y)] = _livery_band_at(p, point)
        for key in texels:
            outside.pop(key, None)
            band_of.pop(key, None)
        if uv_area <= 0.0:
            raise ValueError(f"scar {index} lands on no UV area at all")
        out.append({
            "index": index,
            "centre": centre,
            "normal": tuple(nrm),
            "crater_radius": scar["radius"],
            "paint_radius": radius,
            "metres_per_texel": (world_area / (uv_area * BAKE_SIZE * BAKE_SIZE)) ** 0.5,
            "texels": texels,
            "outside": outside,
            "outside_band": band_of,
        })
    return out


def _livery_band_at(p: FrigateParams, point) -> str:
    """The livery band (`palette.livery_band`) of a point on the hull's
    OUTER skin, which is where every shot scar lands."""
    from . import profiles

    _x, y, z = point
    t = min(max(profiles.t_of_y(p, y), 0.0), 1.0)
    h = z - profiles.sheer(p, t)
    return palette.livery_band(h, z, p.bulwark_h, False,
                               palette.wale_bands(p))


def paint_scars(p: FrigateParams, img, kind: str, footprints=None) -> dict:
    """Paint every shot scar into one atlas. Albedo and normal only.

    The albedo is mixed; the normal is COMBINED, not replaced — the dent's own
    gradient is added to the baked wood grain's, which is what
    `scarpaint.combine_normals` does, so the planking keeps its texture
    through the scar instead of going glassy inside it.
    """
    import numpy as np

    from . import scarpaint

    if kind not in ("albedo", "normal"):
        return {}
    plans = scar_footprints(p) if footprints is None else footprints
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgba = buf.reshape(-1, 4)
    done = {}
    for plan in plans:
        texels = plan["texels"]
        if kind == "albedo":
            for (x, y), (d, angle) in texels.items():
                i = y * w + x
                base = (float(rgba[i, 0]), float(rgba[i, 1]), float(rgba[i, 2]))
                mixed = scarpaint.blend_albedo(base, d, angle)
                rgba[i, 0:3] = tuple(
                    b + (m - b) * PAINT_STRENGTH for b, m in zip(base, mixed))
        else:
            mpt = plan["metres_per_texel"]
            field = {k: scarpaint.height(d, a) * PAINT_STRENGTH
                     for k, (d, a) in texels.items()}
            for (x, y) in texels:
                # Finite differences in TEXEL space, divided by the texel's own
                # world size, so the slope is metres of height per metre of
                # surface. A neighbour the scar does not own is undisturbed
                # planking at height zero, which is exactly what it is.
                du = (field.get((x + 1, y), 0.0) - field.get((x - 1, y), 0.0)) \
                    / (2.0 * mpt)
                dv = (field.get((x, y + 1), 0.0) - field.get((x, y - 1), 0.0)) \
                    / (2.0 * mpt)
                i = y * w + x
                base = scarpaint.decode_normal(
                    (float(rgba[i, 0]), float(rgba[i, 1]), float(rgba[i, 2])))
                rgba[i, 0:3] = scarpaint.encode_normal(
                    scarpaint.combine_normals(base, scarpaint.detail_normal(du, dv)))
        done[plan["index"]] = {
            "texels": len(texels),
            "outside_texels": len(plan["outside"]),
            "metres_per_texel": float(plan["metres_per_texel"]),
            "paint_radius": float(plan["paint_radius"]),
        }
    img.pixels.foreach_set(rgba.reshape(-1))
    img.update()
    return done


def _luminance(rgb) -> float:
    # float(), because this is read straight out of a numpy buffer and the
    # result is recorded on the scene as JSON, which has never heard of
    # float32.
    return float(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2])


def _pixels(img):
    """(rows of RGBA, width, height) of an image's float buffer."""
    import numpy as np

    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(-1, 4), w, h


def _mean(rows, indices, channels) -> tuple:
    return tuple(float(sum(rows[i, c] for i in indices)) / len(indices)
                 for c in channels)


def _distance(a, b) -> float:
    return float(sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5)


def scar_change(img, kind: str, plans, before) -> list:
    """What the paint DID to one atlas, per scar, against the planking's grain.

    `before` is the same image's float buffer from immediately before
    `paint_scars` touched it, so both ends of every figure are the SAME
    TEXELS at two moments — which is the only control that is not confounded
    by the livery. A scar may sit on the black wale while the ring around it
    reaches up into the ochre strake; measured against that ring, two of the
    nine scars departed from their surroundings MORE before the paint than
    after it.

    Per scar:
      `shift`  — the mean distance EACH TEXEL moved. In albedo that is linear
                 RGB over `scarpaint.SPLINTER_BAND`; in the normal map it is
                 the tangent (red, green) pair over every texel of the scar.
                 PER TEXEL AND NOT THE MOVE OF THE MEAN: a dent is radially
                 symmetric, so the mean normal over a whole scar barely moves
                 at all — measured, the move of the mean read 0.000 on all
                 nine scars of an atlas whose individual texels had been
                 tilted by up to 0.3.
      `grain`  — the unpainted planking's own TEXEL-TO-TEXEL variation in the
                 same quantity, over the comparison ring outside the paint:
                 the mean distance between each ring texel and its neighbour
                 one texel along u. This is the scale the shift is judged on,
                 exactly as `frigate.texbudget` judges JPEG ringing against
                 the ochre's own noise — a change smaller than the grain is
                 not a change anyone can see.
                 NEIGHBOUR TO NEIGHBOUR AND NOT SPREAD ABOUT THE RING'S MEAN:
                 the ring is 2.2 paint radii across and crosses the livery, so
                 its spread about its own mean is mostly the black wale
                 against the ochre strake. Measured that way the "grain" came
                 out 0.16 to 0.37 of linear RGB, which is the PAINT SCHEME,
                 and it buried a real 0.19 shift. And only steps INSIDE ONE
                 LIVERY BAND (`scarpaint.planking_grain`): once her wales
                 ran between the rows (the maintainer's third ruling, C), 11..17% of
                 the neighbour steps were black-to-ochre edges of the
                 scheme, and the grain read 0.10..0.14 against 0.02..0.04
                 inside the bands (final review 3's bake).
      `relief` — shift / grain. Zero when nothing was painted.
    """
    from . import scarpaint

    after, w, _h = _pixels(img)
    channels = (0, 1, 2) if kind == "albedo" else (0, 1)
    lo, hi = scarpaint.SPLINTER_BAND
    out = []
    for plan in plans:
        around = [y * w + x for (x, y) in plan["outside"]]
        if kind == "albedo":
            inside = [y * w + x for (x, y), (d, _a) in plan["texels"].items()
                      if lo <= d <= hi]
        else:
            inside = [y * w + x for (x, y) in plan["texels"]]
        if not inside or not around:
            out.append({"shift": 0.0, "grain": 0.0, "relief": 0.0,
                        "luminance_before": 0.0, "luminance_after": 0.0})
            continue
        shift = sum(
            _distance([float(after[i, c]) for c in channels],
                      [float(before[i, c]) for c in channels])
            for i in inside) / len(inside)
        ring = set(around)
        band = {y * w + x: b for (x, y), b in
                plan.get("outside_band", {}).items()}
        steps = [(i, i + 1) for i in around if (i + 1) in ring]
        grain = scarpaint.planking_grain(
            (_distance([float(before[i, c]) for c in channels],
                       [float(before[j, c]) for c in channels]),
             band.get(i), band.get(j))
            for i, j in steps)
        out.append({
            "shift": shift,
            "grain": grain,
            "relief": shift / grain if grain > 1e-9 else 0.0,
            "luminance_before":
                sum(_luminance(before[i, 0:3]) for i in inside) / len(inside),
            "luminance_after":
                sum(_luminance(after[i, 0:3]) for i in inside) / len(inside),
            "planking_luminance":
                sum(_luminance(before[i, 0:3]) for i in around) / len(around),
        })
    return out


def scar_regimes() -> dict:
    """{kind: [one `scar_change` entry per scar]} from the last bake.

    Measured every run, on the same atlas moments apart, so the floor
    `check_bake` holds the scars to is judged against THIS bake's planking
    grain instead of against a number inherited from a bake at a different
    atlas size.
    """
    return _recorded(SCAR_REGIME_KEY)


# --- painting the colours, and parking the second state ----------------------
#
# The maintainer's game EARNS the pirate flag, so the colours are a TWO-STATE node.
# `frigate.colours` is the ruling — what the states are, what the device is,
# and how a second island is parked. This is the bpy half.
#
# The sequence per canvas atlas, and every step of it is asserted in
# `check_bake` rather than trusted to this comment:
#
#   measure            the blankness verdict, on the float buffer, first
#   fill_background    the magenta sentinel is painted out
#   place              the free rectangle is chosen FROM THAT SENTINEL MASK,
#                      which is exact: a texel still magenta after the bake is
#                      a texel no island and no bake margin reached. Chosen
#                      once, on the albedo, and reused by the other two.
#   copy               the flag's island, PLUS its bake margin, is copied
#                      verbatim into that rectangle. This is the cloth both
#                      states are made of.
#   paint              the device goes on the ORIGINAL island and the
#                      national ensign on the COPY. The copy was taken first,
#                      so the two states differ by their own paint and by
#                      nothing else — which `check_bake` measures as an EXACT
#                      equality over the copied bleed that neither one reaches.
#   save               and only now is anything encoded.

COLOURS_FAMILY = palette.CANVAS
COLOURS_OBJECT = "Jolly_Roger"

# The mutation knobs, and the only reason they exist. 1.0 is what ships; 0.0
# paints nothing, which makes that state bare cloth again and is how the
# distinctness assertions in `check_bake` were watched to fail.
DEVICE_STRENGTH = 1.0
ENSIGN_STRENGTH = 1.0

# HOW THE DYE KEEPS THE CLOTH'S GRAIN. The ensign is not a decal pasted over
# the flag, it is bunting that was woven and then dyed, so the weave, the
# weathering and the baked wrinkle shading all have to come through it. The
# paint therefore MULTIPLIES: each texel's new colour is the ensign swatch
# scaled by how light or dark that texel was relative to the island's own
# mean.
#
# THE GAMMA IS NOT COSMETIC, IT PROTECTS A MEASUREMENT. The flag's cloth bakes
# dark — `palette.CANVAS_BLACK` is 0.011 in linear — and its texel-to-texel
# grain is 0.0054, which is half its own mean. Carried through at gamma 1.0
# that is a red field swinging +/- 50 percent, which reads as mildew rather
# than as bunting. At 0.6 the swing is about +/- 27 percent and the grain
# still survives, which matters because `cloth_grain` is the denominator
# every relief figure in `check_bake` is divided by: flatten the cloth and
# that denominator goes to zero.
# How much of a sewn seam has to run through a texel before that texel counts
# as carrying the ensign's relief. The hem's own ridge peaks at 1.0 and falls
# to 0 within `colours.ENSIGN_SOFT`, so a quarter is the shoulder of the hem.
SEAM_EDGE = 0.25

ENSIGN_TINT_GAMMA = 0.6
ENSIGN_TINT_FLOOR = 0.40
ENSIGN_TINT_CEILING = 2.00

COLOURS_PLACE_KEY = "frigate_bake_colours_place"
COLOURS_REGIME_KEY = "frigate_bake_colours_regimes"


def colours_place() -> dict:
    """Where the ensign state's island was parked, from the last bake."""
    return _recorded(COLOURS_PLACE_KEY)


def colours_regimes() -> dict:
    """{kind: how far the device moved the island} from the last bake."""
    return _recorded(COLOURS_REGIME_KEY)


def _flag_mesh():
    return env.obj(COLOURS_OBJECT).data


def island_rect(obj_name: str, margin: int = BAKE_MARGIN) -> tuple:
    """(x0, y0, width, height) of one object's UV island, plus its bake bleed.

    A RECTANGLE AND NOT A SET OF TRIANGLES. The second state has to be
    samplable, which means it needs the same `BAKE_MARGIN` of bled-out colour
    round its edges that the bake gave the original; copying the triangles
    alone would hand it a hard edge that every mip level smears into the
    background.
    """
    mesh = env.obj(obj_name).data
    layer = mesh.uv_layers.get(UV_LAYER)
    if layer is None:
        raise KeyError(f"{obj_name} has no {UV_LAYER} layer")
    us = [d.uv[0] for d in layer.data]
    vs = [d.uv[1] for d in layer.data]
    x0 = max(0, int(math.floor(min(us) * BAKE_SIZE)) - margin)
    y0 = max(0, int(math.floor(min(vs) * BAKE_SIZE)) - margin)
    x1 = min(BAKE_SIZE, int(math.ceil(max(us) * BAKE_SIZE)) + margin)
    y1 = min(BAKE_SIZE, int(math.ceil(max(vs) * BAKE_SIZE)) + margin)
    return (x0, y0, x1 - x0, y1 - y0)


def place_alt_island(background) -> dict:
    """Choose where the ensign state lives, from the bake's own sentinel mask.

    `background` is the numpy boolean mask of texels still holding the magenta
    sentinel — exactly the texels nothing reached. Returns the source
    rectangle, the destination corner and the UV offset between them.
    """
    from . import colours

    x0, y0, w, h = island_rect(COLOURS_OBJECT)
    spot = colours.free_rectangle(background.tolist(), BAKE_SIZE, w, h)
    if spot is None:
        raise RuntimeError(
            f"no free {w}x{h} block in the {COLOURS_FAMILY} atlas to park the "
            f"ensign in. The atlas is full; either the island has to "
            f"shrink or the pack has to leave room"
        )
    return {"src": [x0, y0, w, h], "dst": list(spot),
            "offset": [spot[0] - x0, spot[1] - y0]}


def ensure_alt_uv(place: dict) -> str:
    """Give the colours a second UV layer: the first one, shifted.

    AFTER `UVMap`, never before. The glTF exporter writes a texture's
    `texCoord` from the UV layer INDEX, so a second layer in front of the bake
    layer would point every canvas texture at TEXCOORD_1 and split one
    material into two. That trap is in the bake handoff and it cost a round
    trip the first time.
    """
    from . import colours

    mesh = _flag_mesh()
    if mesh.uv_layers and mesh.uv_layers[0].name != UV_LAYER:
        raise RuntimeError(
            f"{UV_LAYER} must be layer 0 on {COLOURS_OBJECT}, not "
            f"{mesh.uv_layers[0].name}"
        )
    layer = mesh.uv_layers.get(colours.ALT_UV) or mesh.uv_layers.new(
        name=colours.ALT_UV, do_init=False)
    du = place["offset"][0] / BAKE_SIZE
    dv = place["offset"][1] / BAKE_SIZE
    primary = mesh.uv_layers[UV_LAYER]
    for src, dst in zip(primary.data, layer.data):
        dst.uv = (src.uv[0] + du, src.uv[1] + dv)
    # The bake must keep reading the primary layer, whatever was just added.
    mesh.uv_layers.active = primary
    for other in mesh.uv_layers:
        other.active_render = other.name == UV_LAYER
    return colours.ALT_UV


def copy_island(img, place: dict) -> int:
    """Copy the flag's island, bleed and all, into the parked rectangle."""
    rows, w, _h = _pixels(img)
    x0, y0, bw, bh = place["src"]
    dx, dy = place["dst"]
    for j in range(bh):
        src = (y0 + j) * w + x0
        dst = (dy + j) * w + dx
        rows[dst:dst + bw] = rows[src:src + bw]
    img.pixels.foreach_set(rows.reshape(-1))
    img.update()
    return bw * bh


def colours_footprint(p: FrigateParams) -> dict:
    """Which texels of the flag's island carry how much of each state's paint.

    Three things, all keyed on the SAME texels of the primary island, because
    the two states are the same island twice and anything measured on one has
    to be measurable on the other:

      `coverage`  {(x, y): device coverage}   — the Jolly Roger, state 0
      `ensign`    {(x, y): (sRGB, panel, seam)} — the national ensign, state 1
      `metres_per_texel`                      — what the normal slopes divide by
    """
    from . import colours, profiles, scarpaint

    obj = env.obj(COLOURS_OBJECT)
    mesh = obj.data
    mesh.calc_loop_triangles()
    layer = mesh.uv_layers[UV_LAYER]
    nu, nv = profiles.FLAG_NU, profiles.FLAG_NV
    aspect = colours.flag_aspect(p)
    # WHICH ENSIGN, asked of the SHIP. It was the British Red Ensign for
    # every hull because `colours` hardcoded it; the galleon wears the
    # Cross of Burgundy. See `shiptype.EnsignKind`.
    flag = colours.ensign_kind(p)
    mw = obj.matrix_world
    co = [mw @ v.co for v in mesh.vertices]
    cover, ensign, world_area, uv_area = {}, {}, 0.0, 0.0
    for tri in mesh.loop_triangles:
        uvs = tuple(tuple(layer.data[loop].uv) for loop in tri.loops)
        local = [colours.flag_local(nu, nv, i) for i in tri.vertices]
        a, b, c = (co[i] for i in tri.vertices)
        world_area += (b - a).cross(c - a).length / 2.0
        (u0, v0), (u1, v1), (u2, v2) = uvs
        uv_area += abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) / 2.0
        for x, y, bary in scarpaint.rasterize_triangle(uvs, BAKE_SIZE, BAKE_SIZE):
            fu = sum(bary[k] * local[k][0] for k in range(3))
            fv = sum(bary[k] * local[k][1] for k in range(3))
            value = colours.device_coverage(fu, fv, aspect)
            cover[(x, y)] = max(cover.get((x, y), 0.0), value)
            # The ensign dyes the WHOLE flag, so unlike the device it has no
            # "uncovered" case: every island texel gets a colour and a layer
            # count. Last writer wins where two triangles share a texel,
            # which is the same texel either way at this resolution.
            ensign[(x, y)] = (colours.ensign_colour(fu, fv, aspect, flag),
                              colours.ensign_layer(fu, fv, aspect, flag),
                              colours.ensign_seam(fu, fv, aspect, flag))
    if uv_area <= 0.0:
        raise ValueError("the colours land on no UV area at all")
    return {
        "coverage": cover,
        "ensign": ensign,
        "metres_per_texel": (world_area / (uv_area * BAKE_SIZE * BAKE_SIZE)) ** 0.5,
    }


def paint_device(p: FrigateParams, img, kind: str, footprint=None) -> dict:
    """Paint the skull and crossbones into one atlas, on the PRIMARY island."""
    from . import colours, scarpaint

    if kind not in ("albedo", "normal"):
        return {}
    plan = colours_footprint(p) if footprint is None else footprint
    cover = plan["coverage"]
    rows, w, _h = _pixels(img)
    device = scarpaint.srgb_to_linear(colours.DEVICE_COLOUR)
    if kind == "albedo":
        for (x, y), c in cover.items():
            if c <= 0.0:
                continue
            i = y * w + x
            weight = c * DEVICE_STRENGTH
            for ch in range(3):
                base = float(rows[i, ch])
                rows[i, ch] = base + (device[ch] - base) * weight
    else:
        mpt = plan["metres_per_texel"]
        field = {k: colours.DEVICE_RELIEF * c * DEVICE_STRENGTH
                 for k, c in cover.items()}
        for (x, y), c in cover.items():
            du = (field.get((x + 1, y), 0.0) - field.get((x - 1, y), 0.0)) \
                / (2.0 * mpt)
            dv = (field.get((x, y + 1), 0.0) - field.get((x, y - 1), 0.0)) \
                / (2.0 * mpt)
            if du == 0.0 and dv == 0.0:
                continue
            i = y * w + x
            base = scarpaint.decode_normal(
                (float(rows[i, 0]), float(rows[i, 1]), float(rows[i, 2])))
            rows[i, 0:3] = scarpaint.encode_normal(
                scarpaint.combine_normals(base, scarpaint.detail_normal(du, dv)))
    img.pixels.foreach_set(rows.reshape(-1))
    img.update()
    return {"texels": len(cover),
            "device_texels": sum(1 for c in cover.values() if c > 0.5),
            "metres_per_texel": float(plan["metres_per_texel"])}


def cloth_grain(img, kind: str, place: dict, footprint) -> float:
    """The bare cloth's own texel-to-texel variation, measured on the COPY.

    TAKEN BEFORE EITHER STATE IS PAINTED, which is the whole point. This is
    the noise floor every distinctness figure in `check_bake` is divided by —
    "is the change bigger than what is already in the atlas" — so it has to be
    the cloth's grain and not the grain of something painted on it. Before the
    ensign existed the second island was never painted at all, so the same
    number could be read off it at the end; it cannot be any more.

    Both ends of the figure are named: it is the mean distance between a texel
    of the PARKED COPY of the flag's island and its neighbour one texel
    towards the fly, over every texel of that island.
    """
    rows, w, _h = _pixels(img)
    channels = (0, 1, 2) if kind == "albedo" else (0, 1)
    dx, dy = place["offset"]
    cover = footprint["coverage"]
    gaps = []
    for (x, y) in cover:
        if (x + 1, y) not in cover:
            continue
        here = [float(rows[(y + dy) * w + (x + dx), c]) for c in channels]
        there = [float(rows[(y + dy) * w + (x + 1 + dx), c]) for c in channels]
        gaps.append(_distance(here, there))
    return sum(gaps) / len(gaps) if gaps else 0.0


def paint_ensign(p: FrigateParams, img, kind: str, place: dict,
                 footprint=None) -> dict:
    """Dye the national ensign into one atlas, on the PARKED COPY only.

    THE SECOND ISLAND AND NOTHING ELSE. The primary island is the Jolly Roger
    and must come out of this untouched; every write here is offset by
    `place["offset"]`, which is the vector between the two islands. Painting
    the ensign on the primary instead would leave both assertions about the
    device intact and quietly swap the two states over, so `colours_change`
    measures which island came out red.
    """
    from . import colours, scarpaint

    if kind not in ("albedo", "normal"):
        return {}
    plan = colours_footprint(p) if footprint is None else footprint
    ensign = plan["ensign"]
    dx, dy = place["offset"]
    rows, w, _h = _pixels(img)
    if kind == "albedo":
        # The island's own mean brightness, read off the pristine copy, is
        # what the dye is scaled against. Luminance and not the raw channels,
        # because a weathered texel is darker in all three at once.
        lums = []
        for (x, y) in ensign:
            i = (y + dy) * w + (x + dx)
            lums.append(0.2126 * float(rows[i, 0]) + 0.7152 * float(rows[i, 1])
                        + 0.0722 * float(rows[i, 2]))
        mean = sum(lums) / len(lums) if lums else 0.0
        for (x, y), (srgb, _panel, _seam) in ensign.items():
            i = (y + dy) * w + (x + dx)
            lum = (0.2126 * float(rows[i, 0]) + 0.7152 * float(rows[i, 1])
                   + 0.0722 * float(rows[i, 2]))
            ratio = (lum / mean) if mean > 0.0 else 1.0
            scale = min(ENSIGN_TINT_CEILING,
                        max(ENSIGN_TINT_FLOOR, ratio ** ENSIGN_TINT_GAMMA))
            dye = scarpaint.srgb_to_linear(srgb)
            for ch in range(3):
                base = float(rows[i, ch])
                rows[i, ch] = base + (dye[ch] * scale - base) * ENSIGN_STRENGTH
    else:
        mpt = plan["metres_per_texel"]
        field = {k: colours.ENSIGN_STEP * panel * ENSIGN_STRENGTH
                 for k, (_srgb, panel, _seam) in ensign.items()}
        for (x, y) in ensign:
            du = (field.get((x + 1, y), 0.0) - field.get((x - 1, y), 0.0)) \
                / (2.0 * mpt)
            dv = (field.get((x, y + 1), 0.0) - field.get((x, y - 1), 0.0)) \
                / (2.0 * mpt)
            if du == 0.0 and dv == 0.0:
                continue
            i = (y + dy) * w + (x + dx)
            base = scarpaint.decode_normal(
                (float(rows[i, 0]), float(rows[i, 1]), float(rows[i, 2])))
            rows[i, 0:3] = scarpaint.encode_normal(
                scarpaint.combine_normals(base, scarpaint.detail_normal(du, dv)))
    img.pixels.foreach_set(rows.reshape(-1))
    img.update()
    seams = sum(1 for (_srgb, _panel, seam) in ensign.values() if seam > 0.5)
    return {"texels": len(ensign), "sewn_texels": seams}


def colours_change(img, kind: str, place: dict, footprint, grain: float) -> dict:
    """How far the two states differ, and whether they differ only by paint.

    Both ends of every figure are the same texel of the same atlas, read once
    through each state's own UV set — which is as direct a comparison as there
    is.

      `same_outside` — the WORST difference between the two states anywhere in
                       the COPIED RECTANGLE that neither state paints and
                       neither state's halo reaches. It must be 0: the second
                       island is a verbatim copy, so anything else means the
                       copy ran in the wrong order or the parked rectangle is
                       sitting on something.

                       THIS IS A WIDER SET THAN IT USED TO BE, NOT A NARROWER
                       ONE. When the second state was bare cloth the quiet
                       region was the island outside the skull; the ensign
                       dyes the island end to end, so that region is gone and
                       the measurement moves OUT to the bake bleed that
                       `island_rect` copies with the island. Those texels were
                       never checked before and they are checked now.
      `shift`        — the mean difference between the two states where they
                       are meant to differ. For the albedo that is every texel
                       of the flag, because one state is a black flag and the
                       other is a red one. For the normal map it is the SEAMS
                       of both states — the skull's outline and the ensign's
                       sewn edges — because appliqué is flat and a flat
                       thing's normal map is all edge.
      `grain`        — the bare cloth's own texel-to-texel variation, handed
                       in from `cloth_grain`, which read it off the copy
                       before either state was painted.
      `relief`       — shift / grain.
      `field_gap`    — albedo only: the same difference restricted to the
                       ensign's bare red field where the skull does not reach.
      `field_lead`   — albedo only, and SIGNED: how much redder the second
                       state is than the first across that field. It is the
                       assertion that the ensign went onto the PARKED copy and
                       not onto the primary island, which nothing else here
                       would notice.
    """
    rows, w, _h = _pixels(img)
    channels = (0, 1, 2) if kind == "albedo" else (0, 1)
    dx, dy = place["offset"]
    cover = footprint["coverage"]
    ensign = footprint["ensign"]
    x0, y0, bw, bh = place["src"]

    def value(x, y):
        return [float(rows[y * w + x, c]) for c in channels]

    def spread(table, x, y, default=0.0):
        got = [table.get((x + i, y + j), default)
               for i in (-1, 0, 1) for j in (-1, 0, 1)]
        return (min(got), max(got))

    panels = {k: v[1] for k, v in ensign.items()}
    seams = {k: v[2] for k, v in ensign.items()}

    # --- the quiet region: the copied bleed, which neither state touches ----
    worst, quiet = 0.0, 0
    for j in range(bh):
        for i in range(bw):
            x, y = x0 + i, y0 + j
            if any((x + a, y + b) in cover
                   for a in (-1, 0, 1) for b in (-1, 0, 1)):
                # On the island or in its one-texel halo. BOTH painters'
                # normal gradients reach one texel past their own coverage, so
                # a bare texel that TOUCHES the island is supposed to change.
                continue
            worst = max(worst, _distance(value(x, y), value(x + dx, y + dy)))
            quiet += 1

    # --- where the two states are meant to differ ---------------------------
    shifts, field_gaps, field_leads = [], [], []
    for (x, y), c in cover.items():
        gap = _distance(value(x, y), value(x + dx, y + dy))
        if kind == "albedo":
            shifts.append(gap)
            lo, hi = spread(panels, x, y)
            if c <= 0.0 and hi <= 0.5:
                # Bare red field, no skull, no seam: the cleanest place to ask
                # which of the two islands came out red.
                field_gaps.append(gap)
                field_leads.append(float(rows[(y + dy) * w + (x + dx), 0])
                                   - float(rows[y * w + x, 0]))
        else:
            # WHERE EACH STATE'S PAINT ACTUALLY TILTS THE SURFACE, and nowhere
            # else. The skull is flat appliqué, so its normal signal is its
            # OUTLINE — that ruling is in the ledger and it is unchanged, and
            # it is the device's coverage stepping across the 3x3 that finds
            # it. The ensign is appliqué too, so its signal is where one sewn
            # panel steps up onto another, and `colours.ensign_seam` is the
            # design SAYING where those joins are rather than this inferring
            # it from a neighbourhood.
            #
            # IT IS NOT THE CHOICE OF SET THAT CARRIES THE FIGURE, AND THAT
            # WAS CHECKED RATHER THAN ASSUMED. Measured on the shipped bake
            # both ways: the seam set reads 1.860 of the cloth's grain over
            # 1,440 texels and the wider "wherever the panel index changes"
            # set reads 1.869 over 1,692. They agree to half a percent. What
            # moved the figure was modelling the ensign as an 8 mm STEP
            # instead of as a hem — 1.58 to 1.86 — which is a change to the
            # cloth, not to the ruler.
            dlo, dhi = spread(cover, x, y)
            if dhi - dlo > 0.1 or seams.get((x, y), 0.0) > SEAM_EDGE:
                shifts.append(gap)

    shift = sum(shifts) / len(shifts) if shifts else 0.0
    out = {
        "same_outside": worst,
        "quiet_texels": quiet,
        "shift": shift,
        "grain": grain,
        "relief": shift / grain if grain > 0.0 else 0.0,
        "measured_texels": len(shifts),
        "island_texels": len(cover),
    }
    if kind == "albedo":
        out["field_gap"] = sum(field_gaps) / len(field_gaps) if field_gaps else 0.0
        out["field_lead"] = (sum(field_leads) / len(field_leads)
                             if field_leads else 0.0)
        out["field_texels"] = len(field_gaps)
    return out


# --- which graph drives the BSDF ---------------------------------------------
#
# The ship has to be able to be both things. The PROCEDURAL graph is what the
# bake bakes, so it must be on the BSDF while baking or the second bake would
# read the first one's output back in. The BAKED images are what the `.glb`
# carries, so they must be on the BSDF at export or the exporter writes four
# materials with no textures on them — which is the shipped-untextured failure,
# arriving by a different door. Nothing is ever deleted; only the links move.


def _bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _labelled(tree, label):
    return next((n for n in tree.nodes if n.label == label), None)


def _out_socket(node):
    """The result socket of a terminal node. An RGBA Mix puts its colour on
    output 2; everything else here uses output 0."""
    return node.outputs[2] if node.type == "MIX" else node.outputs[0]


def connect_procedural(mat) -> int:
    """Put the authored node graph back on the Principled. Returns links made."""
    tree = mat.node_tree
    bsdf = _bsdf(mat)
    made = 0
    for label, socket in PROCEDURAL_OUT.items():
        node = _labelled(tree, label)
        if node is None:
            continue
        for link in list(bsdf.inputs[socket].links):
            tree.links.remove(link)
        tree.links.new(_out_socket(node), bsdf.inputs[socket])
        made += 1
    return made


def connect_baked(mat, family: str) -> list:
    """Put the baked texture set on the Principled. Returns the kinds wired.

    Base colour, roughness and normal come off the three images. Alpha comes
    off the ALBEDO image's alpha channel, where `_bake_alpha_into_albedo` put
    it, because a glTF material has nowhere else to carry it — and without it
    the 741 rigging ribbons go back to being flat tape in every engine that
    opens the file.
    """
    tree = mat.node_tree
    bsdf = _bsdf(mat)
    wired = []
    normal_map = _labelled(tree, "tex:normal_map")
    if normal_map is None:
        normal_map = tree.nodes.new("ShaderNodeNormalMap")
        normal_map.label = "tex:normal_map"
        normal_map.location = (60, -520)
    for kind in ("albedo", "normal", "roughness"):
        img = bpy.data.images.get(f"{family}_{kind}")
        if img is None:
            continue
        label = BAKED_NODE_LABEL[kind]
        node = _labelled(tree, label)
        if node is None:
            node = tree.nodes.new("ShaderNodeTexImage")
            node.label = label
            node.location = (-250, -200 - 320 * ("albedo", "normal", "roughness").index(kind))
        node.image = img
        target = {"albedo": 0, "roughness": 2}.get(kind)
        if kind == "normal":
            tree.links.new(node.outputs[0], normal_map.inputs["Color"])
            for link in list(bsdf.inputs[6].links):
                tree.links.remove(link)
            tree.links.new(normal_map.outputs[0], bsdf.inputs[6])
        else:
            for link in list(bsdf.inputs[target].links):
                tree.links.remove(link)
            tree.links.new(node.outputs[0], bsdf.inputs[target])
        wired.append(kind)
    albedo = _labelled(tree, BAKED_NODE_LABEL["albedo"])
    if albedo is not None and _labelled(tree, "out:alpha") is not None:
        # THROUGH A ROUND NODE, AND THAT IS WHAT MAKES IT MASK. Blender 5.2's
        # glTF exporter no longer reads the Eevee blend method for alphaMode;
        # it reads the GRAPH (`search_node_tree.detect_alpha_clip`), and a
        # Math:ROUND feeding Alpha is the pattern it recognises as a clip,
        # which it writes as alphaMode MASK with the default 0.5 cutoff. The
        # cut baked into this atlas is already hard 0-or-1, so rounding it
        # changes not one texel and not the preview — it only tells the file
        # the truth, and MASK costs an engine nothing where BLEND costs it a
        # transparency sort of 741 ribbons.
        clip = _labelled(tree, "tex:alpha_clip")
        if clip is None:
            clip = tree.nodes.new("ShaderNodeMath")
            clip.label = "tex:alpha_clip"
            clip.location = (60, -760)
        clip.operation = _enum(clip, "operation", "ROUND")
        tree.links.new(albedo.outputs["Alpha"], clip.inputs[0])
        for link in list(bsdf.inputs[4].links):
            tree.links.remove(link)
        tree.links.new(clip.outputs[0], bsdf.inputs[4])
        wired.append("alpha")
    # Metallic has no bake of its own — it is a constant per look, not a map —
    # so the procedural branch keeps driving it.
    metal = _labelled(tree, "out:metallic")
    if metal is not None and not bsdf.inputs[1].is_linked:
        tree.links.new(_out_socket(metal), bsdf.inputs[1])
    return wired


def _bake_alpha_into_albedo(p, scene, family: str, background=None) -> int:
    """Bake the alpha cut into the albedo image's alpha channel. Returns texels cut.

    An alpha expression is not a bakeable PASS, so the material output is
    temporarily driven by an Emission node carrying the alpha value, an EMIT
    bake writes it to a scratch image, and its red channel is composited into
    the albedo's alpha. The output link is restored in a `finally`.
    """
    import numpy as np

    mat = bpy.data.materials[palette.material_names(p)[family]]
    tree = mat.node_tree
    alpha_node = _labelled(tree, "out:alpha")
    albedo = bpy.data.images.get(f"{family}_albedo")
    if alpha_node is None or albedo is None:
        return 0
    output = next(n for n in tree.nodes if n.type == "OUTPUT_MATERIAL")
    was = output.inputs[0].links[0].from_socket if output.inputs[0].is_linked else None
    scratch = bpy.data.images.new(f"{family}_alpha_scratch", BAKE_SIZE, BAKE_SIZE,
                                  alpha=True, is_data=True)
    scratch.pixels.foreach_set([0.0, 0.0, 0.0, 1.0] * (BAKE_SIZE * BAKE_SIZE))
    emit = tree.nodes.new("ShaderNodeEmission")
    emit.label = "bake:alpha_emit"
    emit.location = (300, -900)
    try:
        tree.links.new(_out_socket(alpha_node), emit.inputs["Color"])
        tree.links.new(emit.outputs[0], output.inputs[0])
        _bake_node(mat, scratch)
        objs = representatives(p)[family]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.bake(type=_enum(scene.cycles, "bake_type", "EMIT"),
                            use_clear=False)
        n = BAKE_SIZE * BAKE_SIZE
        cut = np.empty(n * 4, dtype=np.float32)
        scratch.pixels.foreach_get(cut)
        buf = np.empty(n * 4, dtype=np.float32)
        albedo.pixels.foreach_get(buf)
        rgba = buf.reshape(-1, 4)
        red = cut.reshape(-1, 4)[:, 0]
        alpha = np.where(red > 0.5, 1.0, 0.0)
        if background is not None:
            # The unused atlas stays OPAQUE. It is never sampled by a correct
            # UV, but a transparent background erodes every island edge the
            # moment a renderer builds a mip chain.
            alpha[background] = 1.0
        rgba[:, 3] = alpha
        albedo.pixels.foreach_set(rgba.reshape(-1))
        albedo.update()
        cut_n = int((rgba[:, 3] < 0.5).sum())
        covered = n - (int(np.count_nonzero(background))
                       if background is not None else 0)
        record = _recorded(ALPHA_CUT_KEY)
        record[family] = {"cut": cut_n, "covered": covered,
                          "margin": BAKE_MARGIN}
        _record(ALPHA_CUT_KEY, record)
        return cut_n
    finally:
        tree.nodes.remove(emit)
        if was is not None:
            tree.links.new(was, output.inputs[0])
        bpy.data.images.remove(scratch)


def sentinel_remaining(img) -> int:
    """How many texels of a finished atlas are still magenta. Must be zero.

    This is a separate assertion from "the bake was not blank", and it catches a
    different bug: compositing an alpha cut into the albedo before the
    background was painted out moved every background texel off the sentinel,
    so the fill found nothing to fill and the atlas shipped with its magenta
    still in it. The bake looked fine by every other measure.
    """
    return int(_sentinel_mask(img).sum())


def uv_signature() -> str:
    """A stable fingerprint of the unwrap every atlas was baked against.

    Rounded to 1e-5, which is a fortieth of a texel on a 2048 map: finer than
    that is float noise between two runs of the same unwrap, coarser than that
    would miss a real re-pack.
    """
    import hashlib

    digest = hashlib.sha1()
    coll = bpy.data.collections[env.collection_name()]
    for obj in sorted(coll.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        layer = obj.data.uv_layers.get(UV_LAYER)
        if layer is None:
            digest.update(f"{obj.name}:none".encode())
            continue
        digest.update(f"{obj.name}:{len(layer.data)}".encode())
        for d in layer.data:
            digest.update(f"{d.uv[0]:.5f},{d.uv[1]:.5f};".encode())
    return digest.hexdigest()


def stamp_uv_signature() -> str:
    sig = uv_signature()
    bpy.context.scene[UV_SIGNATURE_KEY] = sig
    return sig


def baked_uv_signature():
    return bpy.context.scene.get(UV_SIGNATURE_KEY)
