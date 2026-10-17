"""Export a town piece's board `.glb`, then PROVE it by reading the bytes back.

`export_piece(p)` rebuilds the piece (`build.rebuild`), writes the `.glb`
the game loads (`public/town/<stem>.glb`) and the `.blend` it came from
(`boats/build/town_<stem>.blend`), and then opens the written file as BYTES
through the ships' own reader, `frigate.gltf`, which imports no bpy: the
triangles it draws, its size, its images, each primitive's attributes, the
tint values, its parts and anchors, and its bounds against the plan's,
mapped Blender (x, y, z) -> glTF (x, z, -y). Any fault raises, so a file
over budget or out of shape is never left looking finished.

Run inside Blender: `Blender -b --factory-startup --python boats/town/run.py`.
"""

import os

import bpy

from frigate import gltf

from . import board, build, tavern
from .params import TavernParams

BOATS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD_DIR = os.path.join(BOATS_DIR, "build")
PUBLIC_DIR = os.path.join(os.path.dirname(BOATS_DIR), "public", "town")

# Bounds and anchors must come back where the plan put them, to a millimetre.
TOLERANCE = 1e-3


def glb_path(p) -> str:
    return os.path.join(PUBLIC_DIR, f"{p.asset_stem}.glb")


def blend_path(p) -> str:
    return os.path.join(BUILD_DIR, f"town_{p.asset_stem}.blend")


def _write(path: str, coll) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in coll.objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in coll.objects if o.type == "MESH")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        # No UVs: nothing samples a texture.
        export_texcoords=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        # `_TINT` goes out as a custom attribute: the exporter writes those
        # whose name starts with an underscore.
        export_attributes=True,
    )


def _all_points(doc, binary) -> list:
    pts = []
    for node in doc.get("nodes", []):
        if "mesh" in node:
            pts.extend(gltf.object_points(doc, binary, node["name"]))
    return pts


def _anchor_positions(doc) -> dict:
    worlds = gltf.world_matrices(doc)
    return {n["name"]: gltf.apply(worlds.get(i, gltf.IDENTITY), (0.0, 0.0, 0.0))
            for i, n in enumerate(doc.get("nodes", [])) if "mesh" not in n}


def _tint_values(doc, binary) -> set:
    out = set()
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            index = prim.get("attributes", {}).get(build.TINT_ATTRIBUTE)
            if index is not None:
                out.update(round(v[0]) for v in gltf.accessor(doc, binary, index))
    return out


def _near(a, b) -> bool:
    return all(abs(x - y) <= TOLERANCE for x, y in zip(a, b))


def _gltf_box(box):
    lo, hi = box
    a, b = gltf.blender_to_gltf(lo), gltf.blender_to_gltf(hi)
    return (tuple(min(x, y) for x, y in zip(a, b)), tuple(max(x, y) for x, y in zip(a, b)))


def verify_piece(p, path: str | None = None) -> dict:
    """Read the written `.glb` back as bytes and measure it against the plan."""
    path = path or glb_path(p)
    with open(path, "rb") as handle:
        doc, binary = gltf.parse_glb(handle.read())
    piece = tavern.plan(p)
    names = [n.get("name") for n in doc.get("nodes", [])]
    attributes = [set(prim.get("attributes", {}))
                  for mesh in doc.get("meshes", []) for prim in mesh.get("primitives", [])]
    nbytes = os.path.getsize(path)
    tris = gltf.rendered_triangle_count(doc)
    tints = _tint_values(doc, binary)
    whole = gltf.bounds(_all_points(doc, binary))
    walls = gltf.bounds(gltf.object_points(doc, binary, board.FOOTPRINT_PART))
    anchors = _anchor_positions(doc)
    faults = board.contract_faults(p.kind, nbytes, tris, len(doc.get("images", [])),
                                   attributes, tints, names)
    if tris != piece.triangles():
        faults.append(f"it draws {tris} triangles, the plan has {piece.triangles()}")
    for label, got, want in (("the piece", whole, _gltf_box(piece.bounds())),
                             ("the walls", walls, _gltf_box(piece.part_bounds("Walls")))):
        if not (_near(got[0], want[0]) and _near(got[1], want[1])):
            faults.append(f"{label} spans {got}, the plan says {want}")
    for name, at in piece.anchors.items():
        got = anchors.get(name)
        if got is None or not _near(got, gltf.blender_to_gltf(at)):
            faults.append(f"anchor {name} is at {got}, the plan says {gltf.blender_to_gltf(at)}")
    return {
        "path": path,
        "bytes": nbytes,
        "triangles": tris,
        "bounds": whole,
        "walls": walls,
        "anchors": anchors,
        "tints": sorted(tints),
        "images": len(doc.get("images", [])),
        "faults": faults,
    }


def write_blend(p) -> str:
    path = blend_path(p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    return path


def export_piece(p: TavernParams | None = None) -> dict:
    """Build, write and verify one town piece. Raises on any fault."""
    p = p or TavernParams()
    p.validate()
    build.rebuild(p)
    coll = bpy.data.collections[build.collection_name(p)]
    path = glb_path(p)
    _write(path, coll)
    found = verify_piece(p, path)
    found["blend"] = write_blend(p)
    if found["faults"]:
        raise RuntimeError("the exported piece breaks its contract: " + "; ".join(found["faults"]))
    return found
