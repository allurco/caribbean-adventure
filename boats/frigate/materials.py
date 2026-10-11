"""Spec section 6 step 15, part one: the four material families.

`frigate.palette` decides the scheme; this module only emits it. Four node
graphs, one per family, and the per-mesh coordinates they are driven by.

TWO BLENDER RULES, both project global constraints, both obeyed throughout:

* Shader nodes are found by `node.type`, NEVER by `node.name`. Node names are
  localised, so `nodes["Principled BSDF"]` is `None` on a non-English UI and
  dies at bake time. `_of_type` is the only way a node is looked up here.
* No enum identifier is written without reading the valid values off `bl_rna`
  first. `_enum` does that read and raises with the real list if the wanted
  value is not in it.

WHY THE GRAPHS ARE DRIVEN BY MESH ATTRIBUTES
--------------------------------------------
The paint scheme needs three coordinates the shader cannot work out for itself:
height above the DECK EDGE (the wales are strakes and follow the sheer), height
above the WATERLINE (the boot top is flat and does not), and whether a face
looks inboard. All three are facts about the mesh, so they are written onto it
as attributes, exactly as UVs are, and the node graph does the banding. The
graph tests the same thresholds `palette.livery_band` tests and in the reverse
order, and `check_materials` reads those thresholds back out of the graph and
compares them with the module they came from.

INSTANCED MESHES SHADE IDENTICALLY, ON PURPOSE. 24 cannons, 24 port lids, 8
barrels, 2 anchors and 3 lanterns each share ONE mesh datablock, so they share
one region of their family's atlas and must bake to one answer. The attributes
are therefore written once per MESH, using the world matrix of the first object
that carries it. For the port lids — the only instanced objects that wear the
livery — all 24 sit in the same gunport strake, so one answer is the right one.
"""

import bpy

from . import env, palette, profiles
from .params import FrigateParams

SHEER_H = "sheer_h"      # POINT float: height above the deck edge, metres
WATERLINE_Z = "wl_z"     # POINT float: height above the waterline, metres
INBOARD = "inboard"      # FACE float: 1.0 if the face looks at the centreline
GLAZE = "glaze"          # FACE float: 1.0 on a pane of the stern gallery


# --- the two global constraints, as code ------------------------------------


def _enum(owner, prop: str, wanted: str) -> str:
    """Return `wanted` only after reading it out of `owner`'s RNA enum."""
    items = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    if wanted not in items:
        raise ValueError(
            f"{owner.bl_rna.identifier}.{prop} has no value {wanted!r}; "
            f"this Blender offers {items}"
        )
    return wanted


def _set_enum(owner, prop: str, wanted: str) -> None:
    setattr(owner, prop, _enum(owner, prop, wanted))


def _of_type(tree, type_name: str):
    """Every node of a type, by `node.type`. The only node lookup in this file."""
    return [n for n in tree.nodes if n.type == type_name]


def _one_of_type(tree, type_name: str):
    found = _of_type(tree, type_name)
    if len(found) != 1:
        raise ValueError(f"expected exactly one {type_name} node, found {len(found)}")
    return found[0]


# --- the coordinates the graphs are driven by -------------------------------


def _float_attribute(mesh, name: str, domain: str):
    existing = mesh.attributes.get(name)
    if existing is not None:
        mesh.attributes.remove(existing)
    attr = mesh.attributes.new(name=name, type="FLOAT", domain=domain)
    # The enum read happens after the fact here because `attributes.new` takes
    # its enums as function arguments, which carry no `bl_rna.properties` entry;
    # the created attribute does, so it is verified rather than assumed.
    if attr.domain != _enum(attr, "domain", domain):
        raise ValueError(f"attribute {name} landed on domain {attr.domain}")
    if attr.data_type != _enum(attr, "data_type", "FLOAT"):
        raise ValueError(f"attribute {name} landed as {attr.data_type}")
    return attr


def _deck_edge_z(p: FrigateParams, y: float) -> float:
    """Height of the deck edge at a station, which is what the wales follow."""
    return profiles.sheer(p, profiles.t_of_y(p, y))


def _glaze_faces(p: FrigateParams, mesh) -> set:
    """Face indices of EVERY stern gallery pane, found the way `check_stern`
    finds them — at the recessed plane and inside a window rect.

    Every band, not just the lowest: a galleon carries two, and glazing only
    the great cabin's lights would leave the coach's as bare timber."""
    y_glass = (profiles.station_y(p, 1.0) - p.stern_form.gallery_depth
               + p.stern_form.window_recess)
    rects = [r for _tier, r in profiles.all_gallery_window_rects(p)]
    out = set()
    for poly in mesh.polygons:
        c = poly.center
        if abs(c.y - y_glass) > 1e-3:
            continue
        if any(x0 < c.x < x1 and z0 < c.z < z1 for x0, x1, z0, z1 in rects):
            out.add(poly.index)
    return out


def write_coordinates(p: FrigateParams) -> dict:
    """Write the four driving attributes onto every mesh in the ship.

    Returns {mesh name: n vertices written}, which is what `check_materials`
    counts against the collection.
    """
    coll = bpy.data.collections[env.collection_name(p)]
    done = {}
    for obj in sorted(coll.objects, key=lambda o: o.name):
        if obj.type != "MESH" or obj.data.name in done:
            continue
        mesh = obj.data
        mw = obj.matrix_world
        look = palette.look_value(obj.name)

        sheer_h = _float_attribute(mesh, SHEER_H, "POINT")
        wl_z = _float_attribute(mesh, WATERLINE_Z, "POINT")
        look_a = _float_attribute(mesh, palette.LOOK_ATTRIBUTE, "POINT")
        for v in mesh.vertices:
            world = mw @ v.co
            sheer_h.data[v.index].value = world.z - _deck_edge_z(p, world.y)
            wl_z.data[v.index].value = world.z
            look_a.data[v.index].value = look

        inboard = _float_attribute(mesh, INBOARD, "FACE")
        glaze = _float_attribute(mesh, GLAZE, "FACE")
        panes = _glaze_faces(p, mesh) if obj.name == "Stern_Gallery" else set()
        normal_m = mw.to_3x3().inverted_safe().transposed()
        for poly in mesh.polygons:
            c = mw @ poly.center
            n = (normal_m @ poly.normal).normalized()
            # Inboard means the face looks back at the centreline: its normal's
            # athwartships component runs opposite to the side it sits on.
            inboard.data[poly.index].value = 1.0 if n.x * c.x < 0.0 else 0.0
            glaze.data[poly.index].value = 1.0 if poly.index in panes else 0.0
        done[mesh.name] = len(mesh.vertices)
    return done


def write_rope_width_uv() -> int:
    """A UV layer across the WIDTH of every rigging ribbon, for the alpha cut.

    `rigging._ribbon` emits each quad in a fixed order — start-across,
    start+across, end+across, end-across — so u is 0, 1, 1, 0 round the loop
    without measuring anything. v runs along the rope so the baked round-rope
    shading has something to vary along if it ever needs to.
    """
    mesh = env.obj("Rigging").data
    # The BAKE layer is created first so it is layer 0. The glTF exporter writes
    # a texture's `texCoord` from the layer INDEX, so with the rope layer first
    # the rigging's baked textures pointed at TEXCOORD_1 and one Blender
    # material exported as two glTF materials.
    if mesh.uv_layers.get(palette.BAKE_UV) is None:
        mesh.uv_layers.new(name=palette.BAKE_UV)
    layer = mesh.uv_layers.get(palette.ROPE_UV) or mesh.uv_layers.new(name=palette.ROPE_UV)
    uvs = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    written = 0
    for poly in mesh.polygons:
        if len(poly.loop_indices) != 4:
            raise ValueError(
                f"rigging face {poly.index} has {len(poly.loop_indices)} corners; "
                "the ribbon emitter promises quads and the alpha cut relies on it"
            )
        for k, li in enumerate(poly.loop_indices):
            layer.data[li].uv = uvs[k]
            written += 1
    return written


# --- small node builders -----------------------------------------------------


def _nt(mat):
    return mat.node_tree


def _col(c):
    r, g, b = palette.srgb_to_linear(c)
    return (r, g, b, 1.0)


def _attr(tree, name, x, y):
    n = tree.nodes.new("ShaderNodeAttribute")
    _set_enum(n, "attribute_type", "GEOMETRY")
    n.attribute_name = name
    n.label = f"attr:{name}"
    n.location = (x, y)
    return n   # outputs: 0 Color, 1 Vector, 2 Fac, 3 Alpha


def _math(tree, op, a, b, label, x, y):
    n = tree.nodes.new("ShaderNodeMath")
    _set_enum(n, "operation", op)
    n.label = label
    n.location = (x, y)
    for k, v in ((0, a), (1, b)):
        if v is None:
            continue
        if hasattr(v, "default_value") or hasattr(v, "node"):
            tree.links.new(v, n.inputs[k])
        else:
            n.inputs[k].default_value = v
    return n


def _mix_rgb(tree, fac, a, b, label, x, y):
    """A colour mix. Sockets are indexed, not named: an RGBA Mix node has three
    sockets called "Factor" and two called "A", so a name lookup is ambiguous
    while 0/6/7 and output 2 are the stable identifiers."""
    n = tree.nodes.new("ShaderNodeMix")
    _set_enum(n, "data_type", "RGBA")
    _set_enum(n, "blend_type", "MIX")
    n.clamp_factor = True
    n.label = label
    n.location = (x, y)
    for k, v in ((0, fac), (6, a), (7, b)):
        if v is None:
            continue
        if hasattr(v, "node"):
            tree.links.new(v, n.inputs[k])
        else:
            n.inputs[k].default_value = v
    return n


def _noise(tree, scale, detail, label, x, y, coords=None):
    n = tree.nodes.new("ShaderNodeTexNoise")
    _set_enum(n, "noise_dimensions", "3D")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.label = label
    n.location = (x, y)
    if coords is not None:
        tree.links.new(coords, n.inputs["Vector"])
    return n


def _between(tree, value, lo, hi, label, x, y):
    """1.0 where lo <= value <= hi, 0.0 outside. Two comparisons and a product,
    which is exactly the `lo <= h <= hi` the pure band function writes."""
    ge = _math(tree, "GREATER_THAN", value, lo, f"{label}:lo", x, y + 160)
    le = _math(tree, "LESS_THAN", value, hi, f"{label}:hi", x, y)
    return _math(tree, "MULTIPLY", ge.outputs[0], le.outputs[0], label, x + 180, y + 80)


def _weather(tree, colour_out, family, bsdf, extra_rough=None):
    """Salt, sun and rain, procedurally: one noise field greys the albedo, drives
    roughness from clean to worn, and raises a bump. One field for all three, so
    a patch that has gone grey has also gone rough and rippled — which is what
    weathering looks like and what three independent noises never do."""
    coords = tree.nodes.new("ShaderNodeTexCoord")
    coords.location = (-1500, -600)
    # OBJECT coordinates, not world: 61 of the 86 objects are instances sharing
    # a mesh and a slice of the atlas, and world-space noise would bake 24
    # different cannons into one texture region.
    obj_co = coords.outputs[3]

    broad = _noise(tree, 2.6, 6.0, "weather:broad", -1250, -500, obj_co)
    fine = _noise(tree, 38.0, 8.0, "weather:fine", -1250, -800, obj_co)

    # 0.24, not 0.42. At 0.42 the salt-grey lerp lifted the WALES — measured in
    # the viewport, a (34,28,18) wale came out around (90,70,55) and the scheme
    # stopped reading as black-and-ochre at all. Weathering must not repaint the
    # ship it is weathering.
    amount = _math(tree, "MULTIPLY", broad.outputs["Fac"], 0.24, "weather:amount", -1050, -500)
    greyed = _mix_rgb(tree, amount.outputs[0], colour_out,
                      _col(palette.WEATHERED_GREY), "weather:grey", -850, -500)

    clean, worn = palette.ROUGHNESS[family]
    rough = _math(tree, "MULTIPLY", broad.outputs["Fac"], worn - clean, "rough:span", -1050, -700)
    rough = _math(tree, "ADD", rough.outputs[0], clean, "rough:base", -870, -700)
    if extra_rough is not None:
        rough = _math(tree, "ADD", rough.outputs[0], extra_rough, "rough:extra", -690, -700)

    bump = tree.nodes.new("ShaderNodeBump")
    bump.location = (-500, -850)
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.02
    tree.links.new(fine.outputs["Fac"], bump.inputs["Height"])

    # Labelled so `frigate.bake` can put the procedural graph BACK on the BSDF
    # after it has swapped the baked images in. The authoring graph is never
    # deleted — it is what a re-bake bakes — and a label survives a file reload
    # where a Python reference does not.
    greyed.label = "out:base_color"
    rough.label = "out:roughness"
    bump.label = "out:normal"
    tree.links.new(greyed.outputs[2], bsdf.inputs[0])      # Base Color
    tree.links.new(rough.outputs[0], bsdf.inputs[2])       # Roughness
    tree.links.new(bump.outputs["Normal"], bsdf.inputs[6])  # Normal
    return greyed, rough, bump


def _new_material(name: str, family: str):
    mat = bpy.data.materials.get(name)
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # Double-sided: the canvas and the rope ribbons are one-layer sheets, and
    # the glTF exporter writes `doubleSided` from this flag being off.
    mat.use_backface_culling = family not in palette.DOUBLE_SIDED
    tree = mat.node_tree
    bsdf = _one_of_type(tree, "BSDF_PRINCIPLED")
    bsdf.location = (300, 0)
    _one_of_type(tree, "OUTPUT_MATERIAL").location = (600, 0)
    return mat, tree, bsdf


def _look_is(tree, look_attr, name, x, y):
    """1.0 where the `look` attribute holds the named look. The looks are 0, 1,
    2 ... so a half-unit window round the value is exact, not a tolerance."""
    v = palette.LOOK[name]
    return _between(tree, look_attr.outputs["Fac"], v - 0.5, v + 0.5, f"look:{name}", x, y)


# --- the four families -------------------------------------------------------


def build_hull_timber(p: FrigateParams):
    """Ochre strakes, black wales, blue inboard trim — and the gallery glass.

    The band tests below are the same thresholds `palette.livery_band` tests,
    applied in the REVERSE order, so the band it returns last is the one mixed
    on top here. `check_materials` reads them back off these nodes.
    """
    mat, tree, bsdf = _new_material(palette.material_names(p)[palette.HULL_TIMBER],
                                    palette.HULL_TIMBER)
    h = _attr(tree, SHEER_H, -1900, 400)
    z = _attr(tree, WATERLINE_Z, -1900, 240)
    inb = _attr(tree, INBOARD, -1900, 80)
    glz = _attr(tree, GLAZE, -1900, -80)
    look = _attr(tree, palette.LOOK_ATTRIBUTE, -1900, -240)

    # One band and one mix per wale, in `palette.wale_bands` order. The
    # frigate's one is labelled and placed exactly as it always was.
    wales = palette.wale_bands(p)
    wale_fs = [
        _between(tree, h.outputs["Fac"], lo, hi, f"band:{name}",
                 -1650, 400 + 320 * i)
        for i, (name, lo, hi) in enumerate(wales)
    ]
    above = _math(tree, "GREATER_THAN", h.outputs["Fac"], 0.0, "band:blue_above", -1650, 200)
    blue_f = _math(tree, "MULTIPLY", inb.outputs["Fac"], above.outputs[0],
                   "band:blue_trim", -1450, 200)
    cap_f = _math(tree, "GREATER_THAN", h.outputs["Fac"],
                  p.bulwark_h - palette.CAP_BAND, "band:cap_band", -1650, 40)
    b_lo, b_hi = palette.BOOT_TOP
    boot_f = _between(tree, z.outputs["Fac"], b_lo, b_hi, "band:boot_top", -1650, -140)
    bottom_f = _math(tree, "LESS_THAN", z.outputs["Fac"], b_lo, "band:bottom", -1650, -340)

    c = _mix_rgb(tree, wale_fs[0].outputs[0], _col(palette.OCHRE_STRAKE),
                 _col(palette.BLACK_WALE), f"mix:{wales[0][0]}", -1150, 400)
    for i, ((name, _lo, _hi), wf) in enumerate(zip(wales, wale_fs)):
        if i:
            c = _mix_rgb(tree, wf.outputs[0], c.outputs[2],
                         _col(palette.BLACK_WALE), f"mix:{name}",
                         -1150, 400 + 320 * i)
    c = _mix_rgb(tree, blue_f.outputs[0], c.outputs[2],
                 _col(palette.BLUE_TRIM), "mix:blue_trim", -1000, 400)
    c = _mix_rgb(tree, cap_f.outputs[0], c.outputs[2],
                 _col(palette.BLACK_WALE), "mix:cap_band", -850, 400)
    c = _mix_rgb(tree, boot_f.outputs[0], c.outputs[2],
                 _col(palette.BLACK_WALE), "mix:boot_top", -700, 400)
    c = _mix_rgb(tree, bottom_f.outputs[0], c.outputs[2],
                 _col(palette.BOTTOM), "mix:bottom", -550, 400)

    # Planking: a wave along the ship's length, so the seams run fore and aft
    # the way strakes do, broken up so they are not a drawn ruler.
    coords = tree.nodes.new("ShaderNodeTexCoord")
    coords.location = (-1900, -600)
    plank = tree.nodes.new("ShaderNodeTexWave")
    _set_enum(plank, "wave_type", "BANDS")
    _set_enum(plank, "bands_direction", "Z")
    _set_enum(plank, "wave_profile", "SAW")
    plank.inputs["Scale"].default_value = 2.2
    plank.inputs["Distortion"].default_value = 3.0
    plank.inputs["Detail"].default_value = 3.0
    plank.label = "grain:planking"
    plank.location = (-1650, -600)
    tree.links.new(coords.outputs[3], plank.inputs["Vector"])
    grain = _math(tree, "MULTIPLY", plank.outputs["Fac"], 0.18, "grain:amount", -1450, -600)
    c = _mix_rgb(tree, grain.outputs[0], c.outputs[2],
                 _col(palette.BLACK_WALE), "mix:grain", -400, 400)

    spar_f = _look_is(tree, look, "spar", -1450, -240)
    carv_f = _look_is(tree, look, "carving", -1450, -440)
    c = _mix_rgb(tree, spar_f.outputs[0], c.outputs[2],
                 _col(palette.SPAR_TIMBER), "mix:spar", -250, 400)
    c = _mix_rgb(tree, carv_f.outputs[0], c.outputs[2],
                 _col(palette.CARVING_GILT), "mix:carving", -100, 400)
    # The gallery glazing. It is geometry that exists and shades as nothing
    # without this, so it bakes as nothing too; a dark, glossy, opaque pane is
    # the treatment that SURVIVES a bake, where transmission does not.
    c = _mix_rgb(tree, glz.outputs["Fac"], c.outputs[2],
                 _col(palette.GLAZING), "mix:glazing", 50, 400)

    glass_rough = _math(tree, "MULTIPLY", glz.outputs["Fac"],
                        palette.GLAZING_ROUGHNESS - palette.ROUGHNESS[palette.HULL_TIMBER][1],
                        "rough:glazing", -1450, -1000)
    _weather(tree, c.outputs[2], palette.HULL_TIMBER, bsdf,
             extra_rough=glass_rough.outputs[0])
    return mat


def build_deck_planking(p: FrigateParams):
    """Holystoned oak with pitched seams, and the darker timber of the fittings."""
    mat, tree, bsdf = _new_material(palette.material_names(p)[palette.DECK_PLANKING],
                                    palette.DECK_PLANKING)
    look = _attr(tree, palette.LOOK_ATTRIBUTE, -1900, -240)
    coords = tree.nodes.new("ShaderNodeTexCoord")
    coords.location = (-1900, 300)

    seam = tree.nodes.new("ShaderNodeTexWave")
    _set_enum(seam, "wave_type", "BANDS")
    _set_enum(seam, "bands_direction", "X")   # planks run fore and aft, seams across X
    _set_enum(seam, "wave_profile", "TRI")
    seam.inputs["Scale"].default_value = 3.4
    seam.inputs["Distortion"].default_value = 0.6
    seam.label = "deck:seams"
    seam.location = (-1650, 300)
    tree.links.new(coords.outputs[3], seam.inputs["Vector"])
    # A seam is a thin dark line, not a half-and-half stripe, so the triangle
    # wave is pushed to its ends before it is used as a mask.
    tight = _math(tree, "POWER", seam.outputs["Fac"], 8.0, "deck:seam_tight", -1450, 300)

    c = _mix_rgb(tree, tight.outputs[0], _col(palette.DECK_PLANK),
                 _col(palette.DECK_SEAM), "mix:seam", -1150, 300)
    fit_f = _look_is(tree, look, "fitting", -1450, -240)
    c = _mix_rgb(tree, fit_f.outputs[0], c.outputs[2],
                 _col(palette.FITTING_TIMBER), "mix:fitting", -900, 300)

    _weather(tree, c.outputs[2], palette.DECK_PLANKING, bsdf)
    # The seams are cut into the planking, so they belong in the normal bake.
    bump = _one_of_type(tree, "BUMP")
    seam_bump = _math(tree, "MULTIPLY", tight.outputs[0], 0.6, "deck:seam_depth", -700, -950)
    mixed = _math(tree, "ADD", seam_bump.outputs[0], None, "deck:height", -520, -950)
    tree.links.new(_of_type(tree, "TEX_NOISE")[1].outputs["Fac"], mixed.inputs[1])
    tree.links.new(mixed.outputs[0], bump.inputs["Height"])
    return mat


def build_canvas(p: FrigateParams):
    """Flax weave, salt staining, older patches, and a black flag.

    Single-sided geometry: nine sails, 14 patches and the colours are one-layer
    grids. `use_backface_culling` is off so the exporter writes `doubleSided`,
    and the Backfacing output is used to keep the far side of a sail from
    shading like a hole.
    """
    mat, tree, bsdf = _new_material(palette.material_names(p)[palette.CANVAS],
                                    palette.CANVAS)
    look = _attr(tree, palette.LOOK_ATTRIBUTE, -1900, -240)
    coords = tree.nodes.new("ShaderNodeTexCoord")
    coords.location = (-1900, 300)

    warp = tree.nodes.new("ShaderNodeTexWave")
    _set_enum(warp, "wave_type", "BANDS")
    _set_enum(warp, "bands_direction", "X")
    warp.inputs["Scale"].default_value = 110.0
    warp.label = "canvas:warp"
    warp.location = (-1650, 420)
    weft = tree.nodes.new("ShaderNodeTexWave")
    _set_enum(weft, "wave_type", "BANDS")
    _set_enum(weft, "bands_direction", "Z")
    weft.inputs["Scale"].default_value = 110.0
    weft.label = "canvas:weft"
    weft.location = (-1650, 180)
    for n in (warp, weft):
        tree.links.new(coords.outputs[3], n.inputs["Vector"])
    weave = _math(tree, "MULTIPLY", warp.outputs["Fac"], weft.outputs["Fac"],
                  "canvas:weave", -1400, 300)
    weave = _math(tree, "MULTIPLY", weave.outputs[0], 0.22, "canvas:weave_amount", -1220, 300)

    c = _mix_rgb(tree, weave.outputs[0], _col(palette.CANVAS_CLOTH),
                 _col(palette.WEATHERED_GREY), "mix:weave", -1000, 300)
    patch_f = _look_is(tree, look, "patch", -1450, -240)
    flag_f = _look_is(tree, look, "colours", -1450, -440)
    c = _mix_rgb(tree, patch_f.outputs[0], c.outputs[2],
                 _col(palette.CANVAS_PATCH), "mix:patch", -760, 300)
    c = _mix_rgb(tree, flag_f.outputs[0], c.outputs[2],
                 _col(palette.CANVAS_BLACK), "mix:colours", -600, 300)

    _weather(tree, c.outputs[2], palette.CANVAS, bsdf)
    return mat


def build_rope_iron(p: FrigateParams):
    """Hemp and blackened iron, and the alpha cut that makes a ribbon into rope.

    The 741 rigging ribbons are flat 2-triangle quads. The cut is taken across
    the ribbon's width in the `rope_width` UV layer, and a circular profile is
    bumped across what is left so the flat quad reads round. The cut is gated on
    the hemp look, because the ironwork carries no such UV layer and an ungated
    cut would make 24 cannons disappear.
    """
    mat, tree, bsdf = _new_material(palette.material_names(p)[palette.ROPE_IRON],
                                    palette.ROPE_IRON)
    look = _attr(tree, palette.LOOK_ATTRIBUTE, -1900, -240)
    iron_f = _look_is(tree, look, "iron", -1700, -240)

    c = _mix_rgb(tree, iron_f.outputs[0], _col(palette.HEMP_ROPE),
                 _col(palette.BLACK_IRON), "mix:iron", -1000, 300)
    metal = _math(tree, "MULTIPLY", iron_f.outputs[0], palette.IRON_METALLIC,
                  "out:metallic", -1000, 100)
    tree.links.new(metal.outputs[0], bsdf.inputs[1])   # Metallic

    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = palette.ROPE_UV
    uv.label = "rope:width_uv"
    uv.location = (-1900, 600)
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-1700, 600)
    tree.links.new(uv.outputs[0], sep.inputs[0])
    cut = _between(tree, sep.outputs[0], palette.ROPE_ALPHA_CUT,
                   1.0 - palette.ROPE_ALPHA_CUT, "rope:alpha_cut", -1500, 600)
    alpha = _math(tree, "MAXIMUM", cut.outputs[0], iron_f.outputs[0], "out:alpha", -1150, 700)
    tree.links.new(alpha.outputs[0], bsdf.inputs[4])   # Alpha

    # Round the rope: a cosine hump across what the cut leaves, so the ribbon
    # has a cylindrical normal rather than a flat one.
    hump = _math(tree, "MULTIPLY", sep.outputs[0], 6.2831853, "rope:phase", -1500, 380)
    hump = _math(tree, "COSINE", hump.outputs[0], None, "rope:round", -1320, 380)
    hump = _math(tree, "MULTIPLY", hump.outputs[0], -0.5, "rope:round_amount", -1140, 380)
    hemp_only = _math(tree, "SUBTRACT", 1.0, iron_f.outputs[0], "rope:hemp_only", -1140, 180)
    hump = _math(tree, "MULTIPLY", hump.outputs[0], hemp_only.outputs[0],
                 "rope:round_gated", -960, 380)

    _weather(tree, c.outputs[2], palette.ROPE_IRON, bsdf)
    bump = _one_of_type(tree, "BUMP")
    total = _math(tree, "ADD", hump.outputs[0], None, "rope:height", -520, -950)
    tree.links.new(_of_type(tree, "TEX_NOISE")[1].outputs["Fac"], total.inputs[1])
    tree.links.new(total.outputs[0], bump.inputs["Height"])
    return mat


def build_grating(p: FrigateParams):
    """The beakhead deck's gratings: deck oak, with the holes CUT by alpha.

    The maintainer's ruling: the grating is a card, not modelled bars. The mask is
    `palette.grating_alpha` drawn off the card's own position in metres
    (object space; the ship's objects stand at the origin), so a bar is
    GRATING_BAR wide at a GRATING_PITCH pitch whatever the card's size,
    and the bake writes it into this family's albedo alpha exactly as it
    writes the rope's (`bake.family_carries_alpha` finds `out:alpha`).
    """
    mat, tree, bsdf = _new_material(palette.material_names(p)[palette.GRATING],
                                    palette.GRATING)
    coords = tree.nodes.new("ShaderNodeTexCoord")
    coords.location = (-1900, 600)
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-1700, 600)
    tree.links.new(coords.outputs["Object"], sep.inputs[0])
    bars = []
    for k, axis in enumerate(("x", "y")):
        y = 700 - 200 * k
        per = _math(tree, "DIVIDE", sep.outputs[k], palette.GRATING_PITCH,
                    f"grating:{axis}_pitches", -1500, y)
        frac = _math(tree, "FRACT", per.outputs[0], None,
                     f"grating:{axis}_phase", -1320, y)
        bars.append(_math(tree, "LESS_THAN", frac.outputs[0],
                          palette.GRATING_BAR / palette.GRATING_PITCH,
                          f"grating:{axis}_bar", -1140, y))
    alpha = _math(tree, "MAXIMUM", bars[0].outputs[0], bars[1].outputs[0],
                  "out:alpha", -960, 600)
    tree.links.new(alpha.outputs[0], bsdf.inputs[4])   # Alpha
    _weather(tree, _col(palette.DECK_PLANK), palette.GRATING, bsdf)
    return mat


BUILDERS = {
    palette.GRATING: build_grating,
    palette.HULL_TIMBER: build_hull_timber,
    palette.DECK_PLANKING: build_deck_planking,
    palette.CANVAS: build_canvas,
    palette.ROPE_IRON: build_rope_iron,
}


def build_materials(p: FrigateParams) -> dict:
    """Spec section 6 step 15, part one. Returns {object: material name}."""
    p.validate()
    write_coordinates(p)
    write_rope_width_uv()
    mats = {family: BUILDERS[family](p) for family in palette.families(p)}
    assigned = {}
    for obj in bpy.data.collections[env.collection_name(p)].objects:
        if obj.type != "MESH":
            continue
        mat = mats[palette.family_of(obj.name)]
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        assigned[obj.name] = mat.name
    return assigned
