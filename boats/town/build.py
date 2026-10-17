"""The bpy half of a town piece: the pure plan made into meshes, occlusion baked.

`rebuild(p)` clears the piece's collection and lays down one object per part
of `tavern.plan(p)`, every face with its own corners (hard facets, ADR 0002
(d)), one material that reads the vertex colour, and an empty per anchor.

THE OCCLUSION IS BAKED TO THE VERTEX COLOURS, NOT TO A TEXTURE. A town piece
carries no image (amendment (d)), so each corner's `COLOR_0` is its face's
colour, grimed at the foot (`palette.grime`), times the ambient occlusion
measured here: a fixed fan of rays over the corner's hemisphere, cast against
the whole piece and the ground it stands on through Blender's BVH. The fan is
fixed, not sampled, so the same params bake the same colours every run.
"""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import palette, tavern
from .params import TavernParams

COLOUR_ATTRIBUTE = "Col"
TINT_ATTRIBUTE = "_TINT"
MATERIAL = "Town"

AO_RAYS = 48
AO_DISTANCE = 4.0      # metres: the eaves, the jetty and the ground, not the far wall
AO_STRENGTH = 0.8     # a fully enclosed corner keeps this much less light
AO_FLOOR = 0.3
GROUND_HALF = 40.0     # the ground plane the foot is occluded by


def collection_name(p) -> str:
    return f"Town_{p.asset_stem}"


def _fan(count: int) -> list:
    """`count` cosine-weighted directions round +Z, on a golden spiral."""
    out = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(count):
        r = math.sqrt((i + 0.5) / count)
        phi = i * golden
        out.append(Vector((r * math.cos(phi), r * math.sin(phi),
                           math.sqrt(max(0.0, 1.0 - r * r)))))
    return out


def _basis(n: Vector):
    helper = Vector((1.0, 0.0, 0.0)) if abs(n.x) < 0.9 else Vector((0.0, 1.0, 0.0))
    t = n.cross(helper).normalized()
    return t, n.cross(t)


def _occlusion_tree(piece) -> BVHTree:
    verts, polys = [], []
    for part in piece.parts.values():
        for face in part.faces:
            start = len(verts)
            verts.extend(face.points)
            polys.append(tuple(range(start, start + len(face.points))))
    g = GROUND_HALF
    start = len(verts)
    verts.extend(((-g, -g, 0.0), (g, -g, 0.0), (g, g, 0.0), (-g, g, 0.0)))
    polys.append((start, start + 1, start + 2, start + 3))
    return BVHTree.FromPolygons(verts, polys)


def corner_occlusion(tree: BVHTree, point, normal, centre) -> float:
    """How much light reaches one corner, in [AO_FLOOR, 1]."""
    n = Vector(normal).normalized()
    # Nudged off the face and a little towards its middle, so the rays do
    # not start inside the edge they stand on.
    origin = Vector(point).lerp(Vector(centre), 0.04) + n * 0.02
    t, b = _basis(n)
    hits = 0
    for d in _fan(AO_RAYS):
        ray = t * d.x + b * d.y + n * d.z
        if tree.ray_cast(origin, ray, AO_DISTANCE)[0] is not None:
            hits += 1
    return max(AO_FLOOR, 1.0 - AO_STRENGTH * hits / AO_RAYS)


def _material():
    mat = bpy.data.materials.get(MATERIAL) or bpy.data.materials.new(MATERIAL)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) \
        or nodes.new("ShaderNodeVertexColor")
    attr.layer_name = COLOUR_ATTRIBUTE
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    mat.use_backface_culling = True
    return mat


def _clear(name: str):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    return coll


def _mesh(name: str, part, tree, material):
    verts, polys, colours, tints = [], [], [], []
    for face in part.faces:
        start = len(verts)
        normal = face.normal()
        centre = face.centre()
        for pt in face.points:
            verts.append(pt)
            ao = corner_occlusion(tree, pt, normal, centre)
            colours.append(palette.corner_colour(face.colour, pt[2], ao))
            tints.append(face.tint)
        polys.append(tuple(range(start, start + len(face.points))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], polys)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = False
    col = mesh.color_attributes.new(COLOUR_ATTRIBUTE, "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", [c for rgb in colours for c in (*rgb, 1.0)])
    mesh.color_attributes.active_color = col
    mesh.color_attributes.render_color_index = 0
    tint = mesh.attributes.new(TINT_ATTRIBUTE, "FLOAT", "POINT")
    tint.data.foreach_set("value", [float(t) for t in tints])
    mesh.materials.append(material)
    return mesh


def rebuild(p: TavernParams | None = None) -> dict:
    """Clear and rebuild the piece. Returns triangles per part."""
    p = p or TavernParams()
    piece = tavern.plan(p)
    coll = _clear(collection_name(p))
    tree = _occlusion_tree(piece)
    material = _material()
    for name, part in piece.parts.items():
        obj = bpy.data.objects.new(name, _mesh(name, part, tree, material))
        coll.objects.link(obj)
    for name, at in piece.anchors.items():
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.5
        empty.location = at
        coll.objects.link(empty)
    return {name: part.triangles() for name, part in piece.parts.items()}
