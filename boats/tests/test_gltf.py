"""The glb reader and the axis claim, under plain pytest. No bpy here.

The point of this module existing at all is that spec section 2.2's axis
mapping must be verified against the exported BYTES rather than against the
exporter's own word for it. So the reader is tested against glb bytes this file
builds itself, and the axis assertion is tested against a deliberately WRONG
export as well as a right one.
"""

import json
import struct

import pytest

from frigate import gltf


def _glb(doc: dict, binary: bytes = b"") -> bytes:
    """Assemble a minimal, valid glb the way the spec says to."""
    js = json.dumps(doc).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    chunks = struct.pack("<II", len(js), gltf.CHUNK_JSON) + js
    if binary:
        chunks += struct.pack("<II", len(binary), gltf.CHUNK_BIN) + binary
    return struct.pack("<III", gltf.GLB_MAGIC, 2, 12 + len(chunks)) + chunks


def _ship_glb(points, node=None):
    """A one-node, one-mesh glb holding exactly `points`."""
    binary = b"".join(struct.pack("<fff", *p) for p in points)
    doc = {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [0]}],
        "nodes": [dict({"name": "Hull", "mesh": 0}, **(node or {}))],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [{"bufferView": 0, "componentType": 5126,
                       "count": len(points), "type": "VEC3"}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binary)}],
        "buffers": [{"byteLength": len(binary)}],
    }
    return _glb(doc, binary)


# --- the container -----------------------------------------------------------


def test_a_valid_glb_round_trips():
    doc, binary = gltf.parse_glb(_ship_glb([(1.0, 2.0, 3.0)]))
    assert doc["asset"]["version"] == "2.0"
    assert len(binary) == 12


def test_anything_that_is_not_a_glb_is_refused_rather_than_half_read():
    with pytest.raises(ValueError):
        gltf.parse_glb(b"")
    with pytest.raises(ValueError):
        gltf.parse_glb(b"NOPE" + b"\x00" * 20)
    truncated = _ship_glb([(0.0, 0.0, 0.0)])[:-8]
    with pytest.raises(ValueError):
        gltf.parse_glb(truncated)


def test_a_glb_with_no_json_chunk_is_refused():
    body = struct.pack("<II", 4, gltf.CHUNK_BIN) + b"\x00\x00\x00\x00"
    with pytest.raises(ValueError):
        gltf.parse_glb(struct.pack("<III", gltf.GLB_MAGIC, 2, 12 + len(body)) + body)


def test_positions_are_decoded_out_of_the_binary_chunk():
    pts = [(1.0, 2.0, 3.0), (-4.0, 5.0, -6.0)]
    doc, binary = gltf.parse_glb(_ship_glb(pts))
    assert gltf.accessor(doc, binary, 0) == pts


def test_an_interleaved_buffer_view_is_read_by_its_stride():
    """Exporters interleave. Reading VEC3s back-to-back out of a strided view
    silently returns somebody else's attribute, which looks like a geometry bug
    rather than a reader bug."""
    binary = b"".join(struct.pack("<fffff", x, y, z, 99.0, 99.0)
                      for x, y, z in ((1.0, 2.0, 3.0), (4.0, 5.0, 6.0)))
    doc = {
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 2,
                       "type": "VEC3"}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteStride": 20,
                         "byteLength": len(binary)}],
        "buffers": [{"byteLength": len(binary)}],
    }
    assert gltf.accessor(doc, binary, 0) == [(1.0, 2.0, 3.0), (4.0, 5.0, 6.0)]


def test_a_node_transform_is_applied_to_the_points_it_owns():
    data = _ship_glb([(1.0, 0.0, 0.0)], node={"translation": [0.0, 10.0, 0.0]})
    doc, binary = gltf.parse_glb(data)
    assert gltf.object_points(doc, binary, "Hull") == [(1.0, 10.0, 0.0)]


def test_a_parents_transform_reaches_its_children():
    """The Blender exporter may put the Z-up to Y-up conversion on a ROOT node
    rather than in the vertex data. Stopping at the node's own matrix would then
    read the unconverted coordinates and certify the wrong axis."""
    binary = struct.pack("<fff", 0.0, 0.0, 1.0)
    doc = {
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "root", "children": [1], "translation": [0.0, 0.0, 5.0]},
            {"name": "Hull", "mesh": 0, "translation": [0.0, 0.0, 2.0]},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1,
                       "type": "VEC3"}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 12}],
        "buffers": [{"byteLength": 12}],
    }
    assert gltf.object_points(doc, binary, "Hull") == [(0.0, 0.0, 8.0)]


def test_an_object_that_is_not_in_the_file_yields_nothing():
    doc, binary = gltf.parse_glb(_ship_glb([(0.0, 0.0, 0.0)]))
    assert gltf.object_points(doc, binary, "Bowsprit") == []


# --- the axis claim ----------------------------------------------------------

# The frigate's Blender box, with both ends of every span named: keel at
# z = -4.5 to mainmast truck at z = +36.0, transom at y = -19.0 to stem at
# y = +19.0, port at x = -5.1 to starboard at x = +5.1.
BLENDER = ((-5.1, -19.0, -4.5), (5.1, 19.0, 36.0))


def test_the_claimed_mapping_is_x_z_minus_y():
    assert gltf.blender_to_gltf((1.0, 2.0, 3.0)) == (1.0, 3.0, -2.0)


def test_the_bow_at_blender_plus_y_becomes_gltf_minus_z():
    """This IS the claim in spec section 2.2, stated as the thing it is for:
    -Z is glTF's forward, so the ship must face the way it sails."""
    stem = (0.0, 19.0, 2.0)
    assert gltf.blender_to_gltf(stem)[2] < 0.0


def test_a_correctly_exported_box_has_no_axis_faults():
    exported = ((-5.1, -4.5, -19.0), (5.1, 36.0, 19.0))
    assert gltf.axis_faults(BLENDER, exported) == []


def test_an_export_that_forgot_the_conversion_is_caught():
    """The mutant that matters most: the exporter wrote Blender's own
    coordinates. The ship then lies on its side in every engine, and nothing in
    Blender shows it."""
    faults = gltf.axis_faults(BLENDER, BLENDER)
    assert faults and any("Y" in f for f in faults)


def test_an_export_that_got_the_SIGN_wrong_is_caught():
    """(x, z, +y) instead of (x, z, -y): the ship is the right way up and
    sailing backwards. Every bounding-box dimension is identical, so only the
    sign of the ends catches it."""
    backwards = ((-5.1, -4.5, -19.0), (5.1, 36.0, 19.0))
    asymmetric = ((-5.1, -22.0, -4.5), (5.1, 16.0, 36.0))
    assert gltf.axis_faults(asymmetric, backwards)


def test_the_flip_puts_the_right_end_of_the_axis_at_the_minimum():
    """Blender max Y maps to glTF min Z. A comparison that paired min with min
    would condemn a correct export, and would then get loosened."""
    blender = ((0.0, 1.0, 0.0), (0.0, 5.0, 0.0))
    exported = ((0.0, 0.0, -5.0), (0.0, 0.0, -1.0))
    assert gltf.axis_faults(blender, exported) == []


# --- the origin --------------------------------------------------------------

# The HULL's own box in glTF space, stem to transom, and the WHOLE ASSET's,
# which runs 12 m further forward because the bowsprit does.
HULL = ((-5.1, -4.5, -19.0), (5.1, 4.2, 19.0))
ASSET = ((-7.4, -4.5, -31.0), (7.4, 36.0, 19.8))


def test_a_correct_origin_has_no_faults():
    assert gltf.origin_faults(HULL, ASSET, draft=4.5, loa=38.0) == []


def test_the_bowsprits_overhang_does_not_condemn_a_correct_ship():
    """The assertion this replaces measured the WHOLE ASSET bow to stern and
    failed the real export: the bowsprit stands 12 m forward of the stem, so
    the asset is correctly asymmetric. Amidships is a station of the HULL."""
    assert ASSET[0][2] + ASSET[1][2] < -10.0, "the asset really is that lopsided"
    assert gltf.origin_faults(HULL, ASSET, draft=4.5, loa=38.0) == []


def test_a_hull_displaced_along_its_own_length_is_caught():
    """And this is what the old form could not catch. Shift the hull 3 m aft and
    the whole asset becomes MORE symmetric, not less — the bowsprit's overhang
    shrinks — so a test on the asset's box reads it as an improvement."""
    shifted = ((-5.1, -4.5, -16.0), (5.1, 4.2, 22.0))
    asset = ((-7.4, -4.5, -28.0), (7.4, 36.0, 22.8))
    assert abs(asset[0][2] + asset[1][2]) < abs(ASSET[0][2] + ASSET[1][2])
    faults = gltf.origin_faults(shifted, asset, draft=4.5, loa=38.0)
    assert any("AMIDSHIPS" in f for f in faults)


def test_an_origin_off_the_centreline_is_caught_and_named():
    off = ((0.0, -4.5, -19.0), (10.2, 4.2, 19.0))
    faults = gltf.origin_faults(off, ASSET, draft=4.5, loa=38.0)
    assert any("CENTRELINE" in f and "hull" in f for f in faults)


def test_a_mirrored_rig_is_caught_on_the_asset_box():
    """The yards are the widest thing aboard and the first to show a rig that
    came out one-sided. The hull alone would not notice."""
    lopsided = ((-7.4, -4.5, -31.0), (2.0, 36.0, 19.8))
    faults = gltf.origin_faults(HULL, lopsided, draft=4.5, loa=38.0)
    assert any("CENTRELINE" in f and "whole asset" in f for f in faults)


def test_an_origin_above_or_below_the_waterline_is_caught_and_named():
    sunk = ((-5.1, -9.0, -19.0), (5.1, -0.3, 19.0))
    faults = gltf.origin_faults(sunk, ASSET, draft=4.5, loa=38.0)
    assert any("WATERLINE" in f for f in faults)


def test_a_ship_that_lost_most_of_itself_is_caught():
    """A glb exported with the wrong selection is correctly centred, correctly
    floated and a third of a ship."""
    stump = ((-5.1, -4.5, -5.0), (5.1, 4.2, 5.0))
    faults = gltf.origin_faults(stump, ASSET, draft=4.5, loa=38.0)
    assert any("left out" in f for f in faults)


def test_a_hull_longer_than_its_own_length_overall_is_caught():
    stretched = ((-5.1, -4.5, -25.0), (5.1, 4.2, 25.0))
    assert any("left out" in f for f in
               gltf.origin_faults(stretched, ASSET, draft=4.5, loa=38.0))


# --- the textures and the counts ---------------------------------------------


def _mat(base=True, mr=True, normal=True):
    pbr = {}
    if base:
        pbr["baseColorTexture"] = {"index": 0}
    if mr:
        pbr["metallicRoughnessTexture"] = {"index": 1}
    out = {"name": "Frigate_HullTimber", "pbrMetallicRoughness": pbr}
    if normal:
        out["normalTexture"] = {"index": 2}
    return out


def test_a_fully_textured_document_has_no_texture_faults():
    doc = {"materials": [_mat()], "images": [{"bufferView": 0}]}
    assert gltf.texture_faults(doc) == []


def test_a_material_with_no_textures_is_caught():
    """This is the shipped-untextured failure as it appears in the FILE: a
    perfectly valid glb whose materials reference nothing."""
    doc = {"materials": [_mat(False, False, False)], "images": [{"bufferView": 0}]}
    faults = gltf.texture_faults(doc)
    assert len(faults) == 3


def test_a_document_with_no_images_is_caught():
    assert any("no images" in f for f in gltf.texture_faults({"materials": [_mat()]}))


def test_a_document_with_no_materials_is_caught():
    assert gltf.texture_faults({"materials": []})


def test_an_image_with_neither_data_nor_a_uri_is_caught():
    doc = {"materials": [_mat()], "images": [{"name": "nothing"}]}
    assert any("no data and no uri" in f for f in gltf.texture_faults(doc))


def test_triangles_are_counted_off_the_exported_accessors():
    doc = {
        "meshes": [{"primitives": [{"indices": 0, "attributes": {"POSITION": 1}},
                                   {"attributes": {"POSITION": 1}}]}],
        "accessors": [{"count": 36}, {"count": 12}],
    }
    assert gltf.triangle_count(doc) == 12 + 4


def test_a_line_primitive_is_not_counted_as_triangles():
    doc = {"meshes": [{"primitives": [{"mode": 1, "indices": 0}]}],
           "accessors": [{"count": 36}]}
    assert gltf.triangle_count(doc) == 0


def test_the_rendered_count_counts_every_node_and_the_file_count_counts_the_mesh():
    """Two different true numbers. The file stores one cannon; the ship draws
    twenty-four. Quoting either as "the triangle count" without the other is
    how an asset gets certified under a budget it misses."""
    doc = {
        "meshes": [{"primitives": [{"indices": 0}]}],
        "accessors": [{"count": 30}],
        "nodes": [{"mesh": 0} for _ in range(24)],
    }
    assert gltf.triangle_count(doc) == 10
    assert gltf.rendered_triangle_count(doc) == 240


def test_a_node_with_no_mesh_draws_nothing():
    doc = {"meshes": [{"primitives": [{"indices": 0}]}], "accessors": [{"count": 30}],
           "nodes": [{"mesh": 0}, {"name": "empty"}]}
    assert gltf.rendered_triangle_count(doc) == 10


# --- what format each image shipped in ---------------------------------------
#
# Reading the mime types out of the FILE, for the same reason the axis is read
# out of the file: the exporter choosing a format per image is exactly the kind
# of thing that works in six of eight cases and is never noticed in the other
# two. A normal map that came out JPEG is shading error, and nothing in Blender
# would show it.


def _textured(mats, images):
    return {
        "materials": mats,
        "images": images,
        "textures": [{"source": i} for i in range(len(images))],
    }


def _png(name="n"):
    return {"name": name, "mimeType": "image/png", "bufferView": 0}


def _jpeg(name="j"):
    return {"name": name, "mimeType": "image/jpeg", "bufferView": 0}


def _budgeted_doc(base=_jpeg, mr=_png, normal=_png, alpha_mode="OPAQUE"):
    mat = {
        "name": "Frigate_HullTimber",
        "alphaMode": alpha_mode,
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicRoughnessTexture": {"index": 1},
        },
        "normalTexture": {"index": 2},
    }
    return _textured([mat], [base("base"), mr("mr"), normal("normal")])


def test_the_roles_an_image_plays_are_read_off_the_materials():
    roles = gltf.image_roles(_budgeted_doc())
    assert roles[0] == {"baseColor"}
    assert roles[1] == {"metallicRoughness"}
    assert roles[2] == {"normal"}


def test_a_budget_the_brief_asked_for_has_no_mime_faults():
    assert gltf.mime_faults(_budgeted_doc()) == []


def test_a_normal_map_that_came_out_jpeg_is_caught():
    """The failure this exists for. Ringing in a normal map is shading error,
    and it is invisible in Blender because Blender never reads the glb back."""
    faults = gltf.mime_faults(_budgeted_doc(normal=_jpeg))
    assert any("normal" in f and "image/jpeg" in f for f in faults)


def test_an_albedo_still_shipping_as_png_is_caught_when_it_has_no_alpha_to_carry():
    """Not a cosmetic complaint: a lossless albedo is most of the 46.6 MB this
    pass exists to remove, and an export that silently kept PNG would look
    exactly like one that worked."""
    faults = gltf.mime_faults(_budgeted_doc(base=_png))
    assert any("baseColor" in f and "image/png" in f for f in faults)


def test_an_albedo_carrying_an_alpha_cut_is_allowed_to_stay_png():
    assert gltf.mime_faults(_budgeted_doc(base=_png, alpha_mode="BLEND")) == []
    assert gltf.mime_faults(_budgeted_doc(base=_png, alpha_mode="MASK")) == []


def test_a_transparent_material_whose_albedo_went_to_jpeg_is_caught():
    """JPEG has no alpha channel, so this one is not a size question: it is the
    rigging's alpha cut silently gone."""
    faults = gltf.mime_faults(_budgeted_doc(base=_jpeg, alpha_mode="BLEND"))
    assert any("baseColor" in f and "alpha" in f for f in faults)


def test_metallic_roughness_is_png_because_the_exporter_composes_it():
    """Not a budget choice. Blender 5.2 fills the blue channel white before it
    writes this map, which takes it off the exporter's happy path and onto the
    newly-built-image path, and a newly built image is PNG under AUTO. The one
    way back — packing metallic into the roughness atlas's blue — was measured
    and costs the roughness map 0.041 mean error at quality 95. See ROLE_MIME."""
    assert gltf.mime_faults(_budgeted_doc(mr=_png)) == []
    faults = gltf.mime_faults(_budgeted_doc(mr=_jpeg))
    assert any("metallicRoughness" in f and "image/jpeg" in f for f in faults)


def test_an_image_with_no_declared_mime_type_is_caught_rather_than_assumed():
    doc = _budgeted_doc()
    doc["images"][2].pop("mimeType")
    assert any("declares no mime type" in f for f in gltf.mime_faults(doc))


def test_the_bytes_each_image_costs_are_read_off_its_buffer_view():
    doc = _budgeted_doc()
    doc["bufferViews"] = [{"buffer": 0, "byteOffset": 0, "byteLength": 1000}]
    for img in doc["images"]:
        img["bufferView"] = 0
    assert gltf.image_bytes(doc) == 3000


def test_a_uv_set_nothing_samples_is_reported_so_it_can_be_stripped():
    doc = _budgeted_doc()
    doc["meshes"] = [{"primitives": [{"attributes": {
        "POSITION": 0, "TEXCOORD_0": 1, "TEXCOORD_1": 2}}]}]
    assert gltf.unused_uv_sets(doc) == ["TEXCOORD_1"]


def test_a_uv_set_a_texture_points_at_is_not_reported_as_unused():
    doc = _budgeted_doc()
    doc["materials"][0]["normalTexture"]["texCoord"] = 1
    doc["meshes"] = [{"primitives": [{"attributes": {
        "POSITION": 0, "TEXCOORD_0": 1, "TEXCOORD_1": 2}}]}]
    assert gltf.unused_uv_sets(doc) == []


# --- the colours' switchable UV set ------------------------------------------
#
# The ship's colours are a two-state node: TEXCOORD_0 is the Jolly Roger and
# TEXCOORD_1 the plain flag. Nothing in the FILE samples TEXCOORD_1 on
# purpose, because the engine picks it. These are written as the mutants they
# have to catch.


def _two_state_doc(carrier="Jolly_Roger", sets=("TEXCOORD_0", "TEXCOORD_1")):
    return {
        "materials": [{"pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0, "texCoord": 0}}}],
        "meshes": [
            {"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}}]},
            {"primitives": [{"attributes": dict(
                {"POSITION": 0}, **{k: 1 for k in sets})}]},
        ],
        "nodes": [{"name": "Hull", "mesh": 0}, {"name": carrier, "mesh": 1}],
    }


def test_the_declared_switchable_set_is_not_a_fault():
    from frigate import gltf

    doc = _two_state_doc()
    assert gltf.unused_uv_sets(doc) == ["TEXCOORD_1"]
    assert gltf.uv_set_faults(doc, {"TEXCOORD_1": ["Jolly_Roger"]}) == []


def test_an_undeclared_unsampled_set_is_still_a_fault():
    from frigate import gltf

    doc = _two_state_doc()
    faults = gltf.uv_set_faults(doc, {})
    assert len(faults) == 1 and "nothing samples it" in faults[0]


def test_the_switchable_set_going_missing_is_a_fault():
    """The mutation that matters: a re-bake that quietly drops the plain flag."""
    from frigate import gltf

    doc = _two_state_doc(sets=("TEXCOORD_0",))
    faults = gltf.uv_set_faults(doc, {"TEXCOORD_1": ["Jolly_Roger"]})
    assert len(faults) == 1 and "the file has none on it" in faults[0]


def test_the_switchable_set_turning_up_on_the_wrong_mesh_is_a_fault():
    from frigate import gltf

    doc = _two_state_doc(carrier="Sails")
    faults = gltf.uv_set_faults(doc, {"TEXCOORD_1": ["Jolly_Roger"]})
    assert len(faults) == 2
    assert any("only declared switchable on" in f for f in faults)
    assert any("the file has none on it" in f for f in faults)


def test_a_node_without_a_mesh_does_not_confuse_the_lookup():
    from frigate import gltf

    doc = _two_state_doc()
    doc["nodes"].append({"name": "Empty"})
    assert gltf.mesh_of_node(doc) == {"Hull": 0, "Jolly_Roger": 1}


# --- the animation rig, read out of the file ---------------------------------
#
# A glTF node animates about ITS OWN ORIGIN. A part whose transform is baked
# into its mesh looks identical in Blender and can only ever turn about the
# ship's origin, so these are checked on the node transforms in the file.


def _rig_doc(translation=(1.0, 2.0, 3.0), rotation=None):
    node = {"name": "Rudder", "mesh": 0, "translation": list(translation)}
    if rotation is not None:
        node["rotation"] = list(rotation)
    return {"nodes": [node], "meshes": [{"primitives": []}],
            "scenes": [{"nodes": [0]}]}


def test_a_node_s_pivot_is_its_own_origin_and_its_own_axis():
    from frigate import gltf

    origin, axis = gltf.node_pivot(_rig_doc(), "Rudder", (0.0, 1.0, 0.0))
    assert origin == pytest.approx((1.0, 2.0, 3.0))
    assert axis == pytest.approx((0.0, 1.0, 0.0))


def test_a_rotated_node_turns_about_a_rotated_axis():
    """Quarter turn about X takes the node's own Y onto the world Z."""
    from frigate import gltf

    half = 0.5 ** 0.5
    _origin, axis = gltf.node_pivot(
        _rig_doc(rotation=(half, 0.0, 0.0, half)), "Rudder", (0.0, 1.0, 0.0))
    assert axis == pytest.approx((0.0, 0.0, 1.0), abs=1e-9)


def test_a_part_on_its_own_axis_is_no_fault():
    from frigate import gltf

    doc = _rig_doc()
    assert gltf.pivot_faults(
        doc, [("Rudder", (0.0, 1.0, 0.0), (1.0, 2.0, 3.0), (0.0, 1.0, 0.0))]) == []


def test_anywhere_ALONG_its_own_axis_is_still_on_it():
    from frigate import gltf

    doc = _rig_doc()
    assert gltf.pivot_faults(
        doc, [("Rudder", (0.0, 1.0, 0.0), (1.0, 9.0, 3.0), (0.0, 1.0, 0.0))]) == []


def test_a_pivot_displaced_off_its_axis_is_reported():
    """The mutation this exists for: a node re-origined by a later refactor."""
    from frigate import gltf

    doc = _rig_doc()
    faults = gltf.pivot_faults(
        doc, [("Rudder", (0.0, 1.0, 0.0), (1.3, 2.0, 3.0), (0.0, 1.0, 0.0))])
    assert len(faults) == 1 and "off the axis it turns about" in faults[0]


def test_a_node_whose_own_axis_leans_off_its_pivot_is_reported():
    from frigate import gltf

    doc = _rig_doc()
    faults = gltf.pivot_faults(
        doc, [("Rudder", (0.0, 1.0, 0.0), (1.0, 2.0, 3.0), (0.0, 0.0, 1.0))])
    assert len(faults) == 1 and "no single channel animates it" in faults[0]


def test_a_part_that_never_reached_the_file_is_reported():
    """A later pass re-merging the yards would land exactly here."""
    from frigate import gltf

    faults = gltf.pivot_faults(
        _rig_doc(), [("Yard_04", (0.0, 0.0, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 1.0))])
    assert len(faults) == 1 and "not a node in the file at all" in faults[0]


def test_opposite_axes_are_the_same_axis_in_the_file_too():
    from frigate import gltf

    assert gltf.axis_angle_deg((0, 1, 0), (0, -1, 0)) == pytest.approx(0.0)
    assert gltf.axis_angle_deg((0, 1, 0), (1, 0, 0)) == pytest.approx(90.0)
