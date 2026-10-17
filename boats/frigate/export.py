"""Spec section 6 step 16: export the `.glb` and the `.blend`, and PROVE the axis.

THE EXPORT IS GUARDED, NOT TRUSTED. Two things happen before a byte is written
and one happens after.

Before: `check_bake` must come back clean. The project's Review Focus names the
failure this stops — `export_scene` succeeds on a material whose image is still
blank, shipping a silently untextured `.glb` that looks correct in Blender,
because in Blender the procedural graph is still there doing the work and only
the export sees the empty image. `export` raises rather than writing a file.

Before: the baked images are put on the Principled, because the procedural
graph exports as four materials with no textures on them, which is the same
failure arriving by a different door.

After: the file that was just written is read back AS BYTES by `frigate.gltf`,
which imports no bpy, and the axis and the origin are checked against the
Blender coordinates they came from. Asking Blender what it exported would be
asking the thing under test to mark its own paper. Spec section 2.2 says the
mapping is "asserted here and verified explicitly in step 16, not assumed", and
this is step 16.
"""

import os

import bpy

from . import bake, blendsave, board, checks, colours, env, gltf, palette, texbudget
from .params import FrigateParams

BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "build")
# NOT `build/frigate.glb` AND `build/frigate.blend` AS CONSTANTS, which is
# what these were. `export(GalleonParams())` would have written the galleon
# over the frigate's own two deliverables and said "done" — the same defect
# class as `wind.SAIL_FWD`: a frigate's name written down as a fact about
# ships. The ship names her own file, and `p.asset_stem` lower-cases the
# collection name, so the frigate's two paths are unchanged to the letter.


def glb_path(p) -> str:
    return os.path.join(BUILD_DIR, f"{p.asset_stem}.glb")


def blend_path(p) -> str:
    return os.path.join(BUILD_DIR, f"{p.asset_stem}.blend")


def _enum(owner, prop: str, wanted: str) -> str:
    items = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    if wanted not in items:
        raise ValueError(
            f"{owner.bl_rna.identifier}.{prop} has no value {wanted!r}; "
            f"this Blender offers {items}"
        )
    return wanted


def ship_objects():
    coll = bpy.data.collections[env.collection_name()]
    return [o for o in coll.objects if o.type == "MESH"]


def blender_bounds(p: FrigateParams, only=None) -> tuple:
    """A box in Blender world space, off the EVALUATED meshes.

    Evaluated, not cage: the hull carries a Subdivision modifier and the export
    applies it, so comparing the export against the cage would be comparing it
    against a ship that was never exported.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for obj in ship_objects():
        if only is not None and obj.name not in only:
            continue
        ev = obj.evaluated_get(dg)
        mesh = ev.to_mesh()
        mw = ev.matrix_world
        for v in mesh.vertices:
            world = mw @ v.co
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
        ev.to_mesh_clear()
    return (tuple(lo), tuple(hi))


# Three objects the axis is proved on individually, each chosen because it sits
# at a different extreme and would fail differently. The HULL spans the origin
# in all three axes; the BOWSPRIT is the furthest thing forward, so it is what a
# forgotten -Y flip sends out the back; the FIGUREHEAD straddles the centreline
# at the bow and is the smallest of the three, so a mapping that is right for a
# big box and wrong for a small one shows up here.
AXIS_WITNESSES = ("Hull", "Bowsprit", "Figurehead")


def _unclean(p: FrigateParams) -> list:
    return [k for k, v in checks.check_bake(p).items() if not v]


def write_glb(p: FrigateParams, path: str | None = None) -> str:
    """Write the `.glb`. Refuses outright if the bake is not clean."""
    path = path or glb_path(p)
    bad = _unclean(p)
    if bad:
        raise RuntimeError(
            "refusing to export: the bake is not clean, and a green export of "
            "empty textures is the worst outcome this pass can have. "
            + "; ".join(bad)
        )
    for family in palette.families(p):
        bake.connect_baked(bpy.data.materials[palette.material_names(p)[family]], family)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in ship_objects():
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = ship_objects()[0]
    # TANGENTS NEED TRIANGLES. Twelve meshes carry n-gons and the exporter
    # refuses to compute tangents for them — among them the Figurehead and the
    # Stern_Carving, the two whose normal maps this pass went to the most
    # trouble over. A Triangulate modifier at export time fixes it, moves no
    # vertex, changes no triangle count (the budget check already counts loop
    # triangles) and is removed in the `finally` so the scene is as it was.
    # ...but ONLY on objects that do not share their mesh. `export_apply`
    # evaluates modifiers per OBJECT, so a Triangulate modifier on an instanced
    # mesh makes 24 cannons into 24 separate meshes and the file stops
    # instancing: measured, that put 34,062 triangles of unique mesh data in the
    # glb where 26,646 had been enough. The trade is taken the other way round
    # for the eight unique meshes that carry n-gons — among them the Figurehead
    # and the Stern_Carving, the two this pass went to the most trouble over —
    # because they cost nothing to triangulate and gain real tangents. The
    # instanced ironwork keeps its sharing and lets the engine compute tangents,
    # which the glTF spec says a client SHOULD do when they are absent.
    added = []
    for obj in ship_objects():
        if obj.data.users > 1:
            continue
        mod = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
        added.append((obj, mod.name))
    stripped = _strip_extra_uv_layers()
    as_files = _as_file_sources(p)
    try:
        _write(path)
    finally:
        _restore_generated(as_files)
        _restore_uv_layers(stripped)
        for obj, name in added:
            mod = obj.modifiers.get(name)
            if mod is not None:
                obj.modifiers.remove(mod)
    return path


def _as_file_sources(p) -> list:
    """Point every baked atlas at the file it was written to, and remember the
    buffer so the scene can be put back exactly as it was.

    WHY THIS IS NEEDED. The exporter decides an image's mime type from
    `image.source`: `__is_blender_image_a_jpeg` returns False outright for
    anything that is not FILE or TILED, whatever its filepath says. A baked
    atlas is GENERATED, so under AUTO every one of them came out `image/png` —
    the three albedos went through as JPEG only because their datablocks were
    already pointed at a `.jpg`, and the four metallic-roughness images, which
    the exporter looks up separately, were silently re-encoded to PNG at twice
    the size. Measured: 2.64 MB of PNG where 1.07 MB of our own JPEG was
    sitting on disk. The check that caught it reads the mime types out of the
    written file.

    WHY IT IS PUT BACK. Setting `source = FILE` reloads the pixels from disk,
    and for the seven lossy atlases that is a JPEG round trip — which would
    quietly replace the float buffer `check_bake` takes its verdict on with a
    decoded copy in which no texel is exactly the magenta sentinel any more.
    The sentinel count would then read zero on an atlas that was never baked.
    So the buffers are saved first and written back in the `finally`.

    AND `file_format` AND `filepath_raw` ARE PUT BACK WITH THEM, which is not
    tidiness. Going FILE -> GENERATED resets an image's `file_format` to PNG,
    and the exporter decides the mime type from THAT: so the FIRST export
    after a bake wrote eight JPEGs and every export after it wrote twelve
    PNGs, taking the `.glb` from 11.98 MB to 14.20 MB with nothing in the
    scene changed. `check_export`'s own mime and byte-for-byte assertions
    caught it the moment a second export was run — which is exactly what they
    are for — but nothing before this pass had ever run two in a row.
    """
    import numpy as np

    saved = []
    for family in palette.families(p):
        for kind, _ in bake.PASSES:
            img = bpy.data.images.get(f"{family}_{kind}")
            if img is None or not img.filepath_raw:
                continue
            w, h = img.size
            buf = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(buf)
            saved.append((img, buf, w, h, img.colorspace_settings.name,
                          img.file_format, img.filepath_raw))
            img.source = _enum(img, "source", "FILE")
    return saved


def _restore_generated(saved) -> None:
    for img, buf, w, h, colorspace, fmt, filepath in saved:
        img.source = _enum(img, "source", "GENERATED")
        img.generated_width, img.generated_height = w, h
        img.colorspace_settings.name = colorspace
        img.pixels.foreach_set(buf)
        # See `_as_file_sources`: GENERATED resets these, and the exporter
        # reads the mime type off `file_format`.
        img.file_format = _enum(img, "file_format", fmt)
        img.filepath_raw = filepath
        img.update()


def _strip_extra_uv_layers() -> list:
    """Take every UV layer but the bake layer off, remembering it. Returns them.

    `rope_width` is the coordinate the rigging's alpha cut was baked FROM. The
    bake made it redundant — the cut now lives in the albedo atlas's alpha
    channel — but `export_texcoords` is one switch for all layers, so it went
    on exporting as TEXCOORD_1 on every mesh, two floats a vertex for a set no
    texture samples. The layers are put back in the `finally`, because the
    material graph still reads `rope_width` and a re-bake would need it.

    ONE LAYER IS DELIBERATELY KEPT. `colours.ALT_UV` is the ensign state of the
    ship's colours, and nothing in the FILE samples it on purpose: the point
    is that the ENGINE chooses it, by setting `texCoord: 1` on a material
    instance for that one node. It is 55 vertices, 440 bytes, and it is the
    whole of how the flag is gainable. `check_export` knows it by name and by
    mesh rather than being widened to let any stray coordinate through.
    """
    from . import colours

    keep = {bake.UV_LAYER, colours.ALT_UV}
    saved, seen = [], set()
    for obj in ship_objects():
        mesh = obj.data
        if mesh.name in seen:
            continue
        seen.add(mesh.name)
        for layer in list(mesh.uv_layers):
            if layer.name in keep:
                continue
            buf = [0.0] * (len(layer.data) * 2)
            layer.data.foreach_get("uv", buf)
            saved.append((mesh, layer.name, buf))
            mesh.uv_layers.remove(layer)
    return saved


def _restore_uv_layers(saved) -> None:
    for mesh, name, buf in saved:
        layer = mesh.uv_layers.get(name)
        if layer is None:
            layer = mesh.uv_layers.new(name=name, do_init=False)
        layer.data.foreach_set("uv", buf)
        bake_layer = mesh.uv_layers.get(bake.UV_LAYER)
        if bake_layer is not None:
            # The bake layer must stay the one the render reads, or the next
            # bake would sample `rope_width` and pack the ship into a ribbon.
            mesh.uv_layers.active = bake_layer
            for other in mesh.uv_layers:
                other.active_render = other.name == bake.UV_LAYER


def _write(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        # Apply the modifiers. The hull's Subdivision is 5,488 of the ship's
        # triangles and without this the `.glb` carries the 700-vertex control
        # cage, which is a different ship.
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        # AUTO, not JPEG. JPEG would take the normal maps with it, and ringing
        # in a normal map is shading error exactly where the detail is. AUTO
        # writes each image in the format its Blender datablock already has,
        # which `frigate.bake._save` set from `frigate.texbudget`. Whether the
        # exporter embeds our bytes or re-encodes them, the quality is the one
        # that was measured.
        export_image_format="AUTO",
        export_jpeg_quality=texbudget.JPEG_QUALITY,
    )


def write_blend(p, path: str | None = None) -> str:
    path = path or blend_path(p)
    # Relative texture paths and no remembered directory: the file is public.
    return blendsave.save_clean(path)


MIME_EXTENSION = {"image/png": "png", "image/jpeg": "jpg"}


def _encode_faults(sizes) -> list:
    """Any image the exporter did not carry through byte for byte.

    `bake` wrote twelve atlas files in the formats `frigate.texbudget` rules,
    at the JPEG quality that was measured. If the glb's copy is a different
    length, the exporter re-encoded it — at a quality nobody chose, in a format
    nobody asked for, or both. That is exactly how the four metallic-roughness
    atlases came out as 2.64 MB of PNG with 1.07 MB of JPEG sitting next to
    them on disk, and it is invisible from inside Blender.
    """
    out = []
    for name, mime, size, roles in sizes:
        if any(r in gltf.COMPOSED_ROLES for r in roles):
            # glTF builds this one by combining channels, so there is no atlas
            # on disk it could be byte-identical to. See gltf.ROLE_MIME.
            continue
        ext = MIME_EXTENSION.get(mime)
        if ext is None:
            out.append(f"{name} shipped as {mime}, which this asset does not write")
            continue
        on_disk = os.path.join(bake.TEXTURE_DIR, f"{name}.{ext}")
        if not os.path.exists(on_disk):
            out.append(f"{name} is in the glb as {mime} but no {ext} of that "
                       f"name was ever written to {bake.TEXTURE_DIR}")
            continue
        want = os.path.getsize(on_disk)
        if size != want:
            out.append(
                f"{name} was re-encoded on the way out: {size:,} bytes in the "
                f"glb against {want:,} in the {ext} the bake wrote"
            )
    return out


def _wanted_pivots(p: FrigateParams) -> list:
    """Every animatable part, with its pivot converted into glTF coordinates.

    THE AXIS IS CONVERTED AS A DIRECTION, not as a point. `blender_to_gltf`
    maps (x, y, z) to (x, z, -y), which is linear, so a direction converts by
    the same map — but only because it carries no translation. Running a
    direction through a point conversion that did would silently rotate every
    axis on the ship by whatever the offset happened to be.
    """
    from . import furniture
    from . import rig as rig_rules

    # The parts HER OWN passes emit: a port lid on a ship that runs no
    # `cannons` pass is not a node the file should have. One of a pass she
    # does run that is not in the file is still a fault.
    out = []
    for piv in rig_rules.built_pivots(p, furniture.wheel_hub_height()):
        out.append((
            piv.part,
            gltf.blender_to_gltf(piv.local_axis),
            gltf.blender_to_gltf(piv.point),
            gltf.blender_to_gltf(piv.axis),
        ))
    return out


def verify(p: FrigateParams, path: str | None = None) -> dict:
    """Read the written `.glb` back as bytes and check what it actually says.

    Returns a dict of findings; `check_export` turns it into assertions.
    """
    path = path or glb_path(p)
    with open(path, "rb") as handle:
        doc, binary = gltf.parse_glb(handle.read())

    names = [n.get("name") for n in doc.get("nodes", []) if "mesh" in n]
    points = []
    for name in names:
        points.extend(gltf.object_points(doc, binary, name))
    exported_bounds = gltf.bounds(points)
    here = blender_bounds(p)
    hull_gltf = gltf.bounds(gltf.object_points(doc, binary, "Hull"))

    # The axis proved on three named objects as well as on the whole asset, so
    # that a mapping which happens to be right for one box has to be right for
    # four.
    witnesses = {}
    axis_faults = list(gltf.axis_faults(here, exported_bounds))
    for name in AXIS_WITNESSES:
        pts = gltf.object_points(doc, binary, name)
        if not pts:
            axis_faults.append(f"{name} is not in the exported file at all")
            continue
        got = gltf.bounds(pts)
        witnesses[name] = {
            "blender": blender_bounds(p, only={name}),
            "gltf": got,
        }
        axis_faults.extend(
            f"{name}: {f}" for f in gltf.axis_faults(witnesses[name]["blender"], got)
        )

    stem_y = here[1][1]
    bow_z = min(pt[2] for pt in points)
    stern_z = max(pt[2] for pt in points)

    return {
        "path": path,
        "bytes": os.path.getsize(path),
        "blender_bounds": here,
        "gltf_bounds": exported_bounds,
        "hull_gltf_bounds": hull_gltf,
        "witnesses": witnesses,
        "axis_faults": axis_faults,
        "origin_faults": gltf.origin_faults(hull_gltf, exported_bounds,
                                            p.draft, p.loa),
        "texture_faults": gltf.texture_faults(
            doc, plain=tuple(palette.tinted_material_names(p).values())),
        "mime_faults": gltf.mime_faults(doc),
        "image_bytes": gltf.image_bytes(doc),
        "image_sizes": gltf.image_sizes(doc),
        "encode_faults": _encode_faults(gltf.image_sizes(doc)),
        "unused_uv_sets": gltf.unused_uv_sets(doc),
        "uv_set_faults": gltf.uv_set_faults(
            doc, colours.switchable_uv_sets(bake.COLOURS_OBJECT, p)),
        "pivot_faults": gltf.pivot_faults(doc, _wanted_pivots(p)),
        "animatable": len(_wanted_pivots(p)),
        "alpha_modes": {m.get("name", f"#{i}"): m.get("alphaMode", "OPAQUE")
                        for i, m in enumerate(doc.get("materials", []))},
        "mesh_triangles": gltf.triangle_count(doc),
        "triangles": gltf.rendered_triangle_count(doc),
        "materials": [m.get("name") for m in doc.get("materials", [])],
        "images": len(doc.get("images", [])),
        "nodes": len(names),
        "stem_blender_y": stem_y,
        "bow_gltf_z": bow_z,
        "stern_gltf_z": stern_z,
        "uv_sets": sorted({
            key for mesh in doc.get("meshes", [])
            for prim in mesh.get("primitives", [])
            for key in prim.get("attributes", {}) if key.startswith("TEXCOORD")
        }),
    }


def export(p: FrigateParams | None = None) -> dict:
    """Spec section 6 step 16, end to end. Returns the verification findings.

    DEFECT 11: THIS DID NOT SAY WHICH SHIP IT WAS EXPORTING. `env` holds the
    active collection in a module global that `build.rebuild` and
    `build.check_all` both set and this did not, so `export(GalleonParams())`
    exported whatever `env._ACTIVE` happened to hold. Caught the loud way —
    the global had reset to its "Frigate" default across a module reload and
    `check_bake` raised `no object named 'Rigging' in the 'Frigate'
    collection` — but the quiet way is the one that matters: with BOTH ships
    in one .blend it would have written the FRIGATE into `build/galleon.glb`
    and verified it happily, because every assertion downstream reads the
    same wrong global.
    """
    p = p or FrigateParams()
    p.validate()
    env.set_active(p)
    glb = write_glb(p)
    found = verify(p, glb)
    found["blend"] = write_blend(p)
    found["blend_bytes"] = os.path.getsize(found["blend"])
    return found


# --- the BOARD variant -------------------------------------------------------
#
# The rules are `frigate.board`, which is pure; this is the bpy half. It takes
# the BAKED scene as `export` left it and puts every change it makes back in
# its `finally`, so the full export can be written again straight after.


def board_glb_path(p) -> str:
    return os.path.join(BUILD_DIR, f"{p.asset_stem}_board.glb")


def _board_atlases(p) -> dict:
    """{full-size image: its `board.atlas_size` copy}, each written to disk
    beside the full atlas in the format the full one has, and loaded back as
    a FILE image so the exporter embeds those bytes rather than re-encoding.
    """
    out = {}
    for family in palette.families(p):
        for kind, _ in bake.PASSES:
            img = bpy.data.images.get(f"{family}_{kind}")
            if img is None or not img.filepath_raw:
                continue
            src = bpy.path.abspath(img.filepath_raw)
            stem, ext = os.path.splitext(os.path.basename(src))
            dst = os.path.join(bake.TEXTURE_DIR, f"{stem}_board{ext}")
            small = bpy.data.images.load(src, check_existing=False)
            small.name = f"{family}_{kind}_board"
            small.colorspace_settings.name = img.colorspace_settings.name
            edge = board.atlas_size(kind)
            small.scale(edge, edge)
            fmt = img.file_format
            small.filepath_raw = dst
            small.file_format = _enum(small, "file_format", fmt)
            small.save(quality=texbudget.JPEG_QUALITY if fmt == "JPEG"
                       else bake.PNG_COMPRESSION)
            small.source = _enum(small, "source", "FILE")
            small.reload()
            out[img] = small
    return out


def _swap_images(p, mapping: dict) -> list:
    """Point every texture node of this ship's materials from each key of
    `mapping` to its value. Returns what to put back."""
    undo = []
    for name in palette.material_names(p).values():
        mat = bpy.data.materials.get(name)
        if mat is None or mat.node_tree is None:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image in mapping:
                undo.append((node, node.image))
                node.image = mapping[node.image]
    return undo


def write_board_glb(p, path: str | None = None) -> tuple:
    """Write the board variant. Returns (path, the plan it was made by)."""
    path = path or board_glb_path(p)
    bad = _unclean(p)
    if bad:
        raise RuntimeError(
            "refusing to export the board variant: the bake is not clean. "
            + "; ".join(bad))
    for family in palette.families(p):
        bake.connect_baked(
            bpy.data.materials[palette.material_names(p)[family]], family)
    objs = ship_objects()
    plan = board.plan({o.name: checks.tri_count(o.name) for o in objs})
    keep = [o for o in objs if o.name not in plan["drop"]]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in keep:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    added = []
    for obj in keep:
        if obj.name in plan["thin"]:
            mod = obj.modifiers.new("BoardThin", "DECIMATE")
            mod.decimate_type = _enum(mod, "decimate_type", "COLLAPSE")
            mod.ratio = plan["ratio"]
            added.append((obj, mod.name))
        if obj.data.users == 1 or obj.name in plan["thin"]:
            mod = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
            added.append((obj, mod.name))
    small = _board_atlases(p)
    undo = _swap_images(p, small)
    stripped = _strip_extra_uv_layers()
    try:
        _write(path)
    finally:
        _restore_uv_layers(stripped)
        for node, img in undo:
            node.image = img
        for img in small.values():
            bpy.data.images.remove(img)
        for obj, name in added:
            mod = obj.modifiers.get(name)
            if mod is not None:
                obj.modifiers.remove(mod)
    return path, plan


def verify_board(p, path: str | None = None) -> dict:
    """Read the written board `.glb` back as bytes and measure it."""
    path = path or board_glb_path(p)
    with open(path, "rb") as handle:
        doc, binary = gltf.parse_glb(handle.read())
    names = [n.get("name") for n in doc.get("nodes", []) if "mesh" in n]
    points = []
    for name in names:
        points.extend(gltf.object_points(doc, binary, name))
    whole = gltf.bounds(points)
    hull = gltf.bounds(gltf.object_points(doc, binary, "Hull"))
    nbytes = os.path.getsize(path)
    tris = gltf.rendered_triangle_count(doc)
    dims = gltf.image_dimensions(doc, binary)
    return {
        "path": path,
        "bytes": nbytes,
        "triangles": tris,
        "mesh_triangles": gltf.triangle_count(doc),
        "largest_texture": max((max(w, h) for _n, w, h in dims), default=0),
        "images": len(dims),
        "nodes": len(names),
        "bounds": whole,
        "hull_bounds": hull,
        # HULL, stem to taffrail along glTF Z, the bowsprit excluded: the
        # length the game's catalogue sizes her by
        "hull_length": hull[1][2] - hull[0][2],
        # the bow is the hull's -Z end; the bowsprit reaches past it
        "bow_is_minus_z": whole[0][2] < hull[0][2] < 0.0 < hull[1][2],
        "origin_faults": gltf.origin_faults(hull, whole, p.draft, p.loa),
        "contract_faults": board.contract_faults(nbytes, tris, dims, names),
    }


def export_board(p=None) -> dict:
    """The board variant, end to end: written, then measured off the file."""
    p = p or FrigateParams()
    p.validate()
    env.set_active(p)
    path, plan = write_board_glb(p)
    found = verify_board(p, path)
    found["plan"] = plan
    return found
