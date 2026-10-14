"""Read a `.glb` back. No bpy — this is how the axis claim gets PROVED.

Spec section 2.2 asserts that the exporter maps Blender `(x, y, z)` to glTF
`(x, z, -y)`, so the bow at Blender +Y becomes glTF -Z, which is glTF's forward
axis. The spec also says, in section 9 and in the project's global constraints,
that this is "verified in step 16, never assumed".

Asking Blender what it exported is not verification: it is asking the thing
under test to mark its own paper. So the `.glb` is opened as BYTES, its JSON
chunk is parsed, its vertex positions are decoded out of its binary chunk, each
node's world transform is walked down from the scene root, and the resulting
points are compared with the Blender coordinates they came from. Nothing in
this module imports bpy and nothing in it trusts the exporter.

GLB container: a 12-byte header (magic `glTF`, version, total length) followed
by chunks, each a 4-byte length, a 4-byte type and that many bytes of payload.
Chunk type `JSON` carries the glTF document; chunk type `BIN\\0` carries the
buffer the accessors index into.
"""

import json
import struct

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

# glTF componentType -> (struct code, bytes)
COMPONENT = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
              "MAT2": 4, "MAT3": 9, "MAT4": 16}

IDENTITY = (1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0)


def parse_glb(data: bytes) -> tuple[dict, bytes]:
    """(document, binary chunk) from the bytes of a `.glb`."""
    if len(data) < 12:
        raise ValueError("not a glb: shorter than its own header")
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError(f"not a glb: magic is {magic:#x}, not {GLB_MAGIC:#x}")
    if version != 2:
        raise ValueError(f"glb version {version}, expected 2")
    if length != len(data):
        raise ValueError(
            f"glb header declares {length} bytes, the file holds {len(data)}"
        )
    doc, binary, offset = None, b"", 12
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8:offset + 8 + size]
        if len(payload) != size:
            raise ValueError("glb chunk runs off the end of the file")
        if kind == CHUNK_JSON:
            doc = json.loads(payload.decode("utf-8"))
        elif kind == CHUNK_BIN:
            binary = payload
        offset += 8 + size
    if doc is None:
        raise ValueError("glb has no JSON chunk")
    return doc, binary


def accessor(doc: dict, binary: bytes, index: int) -> list[tuple]:
    """Decode one accessor into a list of tuples, honouring its byte stride."""
    acc = doc["accessors"][index]
    code, size = COMPONENT[acc["componentType"]]
    n = TYPE_COUNT[acc["type"]]
    count = acc["count"]
    if "bufferView" not in acc:
        return [tuple([0.0] * n) for _ in range(count)]
    view = doc["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or n * size
    out = []
    for i in range(count):
        at = base + i * stride
        out.append(struct.unpack_from("<" + code * n, binary, at))
    return out


def _matrix(node: dict) -> tuple:
    """A node's local matrix, row-major, from `matrix` or from TRS."""
    if "matrix" in node:
        m = node["matrix"]   # glTF stores column-major
        return tuple(m[c * 4 + r] for r in range(4) for c in range(4))
    t = node.get("translation", (0.0, 0.0, 0.0))
    r = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    s = node.get("scale", (1.0, 1.0, 1.0))
    x, y, z, w = r
    rot = (
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    )
    return (
        rot[0] * s[0], rot[1] * s[1], rot[2] * s[2], t[0],
        rot[3] * s[0], rot[4] * s[1], rot[5] * s[2], t[1],
        rot[6] * s[0], rot[7] * s[1], rot[8] * s[2], t[2],
        0.0, 0.0, 0.0, 1.0,
    )


def multiply(a: tuple, b: tuple) -> tuple:
    return tuple(
        sum(a[row * 4 + k] * b[k * 4 + col] for k in range(4))
        for row in range(4) for col in range(4)
    )


def apply(m: tuple, pt) -> tuple:
    x, y, z = pt
    return tuple(
        m[r * 4 + 0] * x + m[r * 4 + 1] * y + m[r * 4 + 2] * z + m[r * 4 + 3]
        for r in range(3)
    )


def world_matrices(doc: dict) -> dict:
    """{node index: world matrix}, walked down from every scene root.

    The Blender exporter may put the Z-up to Y-up conversion on the root nodes
    rather than in the vertex data, so a node's own matrix is not the whole
    story and the chain has to be walked.
    """
    nodes = doc.get("nodes", [])
    scenes = doc.get("scenes", [])
    roots = []
    for scene in scenes:
        roots.extend(scene.get("nodes", []))
    if not roots:
        child = {c for n in nodes for c in n.get("children", [])}
        roots = [i for i in range(len(nodes)) if i not in child]
    out = {}
    stack = [(i, IDENTITY) for i in roots]
    while stack:
        index, parent = stack.pop()
        if index in out:
            continue
        world = multiply(parent, _matrix(nodes[index]))
        out[index] = world
        for child in nodes[index].get("children", []):
            stack.append((child, world))
    return out


def node_index(doc: dict, name: str):
    """The index of the node with this name, or None. `world_matrices` is keyed
    by index, because glTF node names are not required to be unique."""
    for i, node in enumerate(doc.get("nodes", [])):
        if node.get("name") == name:
            return i
    return None


def node_pivot(doc: dict, name: str, local_axis) -> tuple:
    """(where a node's ORIGIN is, which way one of its own axes points), in glTF.

    This is what an animation actually turns about: a glTF node rotates about
    its own origin, and a one-channel rotation turns about one of its own
    axes. Both are read out of the node's own transform chain, in the file,
    so this says what the EXPORTED asset will do rather than what Blender
    was showing.
    """
    index = node_index(doc, name)
    if index is None:
        raise KeyError(f"{name} is not a node in this file")
    m = world_matrices(doc)[index]
    origin = apply(m, (0.0, 0.0, 0.0))
    tip = apply(m, local_axis)
    direction = tuple(b - a for a, b in zip(origin, tip))
    length = sum(c * c for c in direction) ** 0.5
    if length < 1e-9:
        raise ValueError(f"{name}'s {local_axis} axis has no length in the file")
    return origin, tuple(c / length for c in direction)


def axis_angle_deg(a, b) -> float:
    """The angle between two axes, treating opposite directions as the same."""
    import math

    def unit(v):
        length = sum(c * c for c in v) ** 0.5
        return tuple(c / length for c in v)

    dot = abs(sum(x * y for x, y in zip(unit(a), unit(b))))
    return math.degrees(math.acos(min(1.0, max(-1.0, dot))))


def pivot_faults(doc: dict, wanted, tol: float = 2e-3,
                 axis_tol: float = 0.2) -> list[str]:
    """Every animatable part the FILE does not carry as its own node, turning
    about the axis it is supposed to.

    `wanted` is [(node name, local axis, pivot point, pivot axis)] with the
    points and axes already in glTF coordinates. Checked in the file because
    a node that exports with its transform baked into its mesh looks
    identical in Blender and can only ever rotate about the ship's origin —
    which is the whole failure this pass exists to fix.
    """
    import math

    out = []
    for name, local_axis, point, axis in wanted:
        if node_index(doc, name) is None:
            out.append(f"{name} is not a node in the file at all")
            continue
        origin, direction = node_pivot(doc, name, local_axis)
        # ON the axis, not AT the point: anywhere along the line turns the
        # part identically.
        delta = tuple(a - b for a, b in zip(origin, point))
        along = sum(a * b for a, b in zip(delta, axis))
        gap = math.sqrt(max(0.0, sum(c * c for c in delta) - along * along))
        if gap > tol:
            out.append(f"{name}'s node origin lies {gap:.4f} m off the axis it "
                       f"turns about, which is more than the {tol:g} m allowed")
        lean = axis_angle_deg(direction, axis)
        if lean > axis_tol:
            out.append(f"{name}'s own {local_axis} axis leans {lean:.3f} deg off "
                       f"the axis it turns about, so no single channel animates it")
    return out


def object_points(doc: dict, binary: bytes, name: str) -> list[tuple]:
    """Every POSITION of the node called `name`, in glTF world space.

    Matched on the node name, which the Blender exporter writes from the object
    name. A node with no mesh, or a name that is not there, returns nothing and
    the caller is expected to treat that as a failure rather than as an empty
    pass.
    """
    nodes = doc.get("nodes", [])
    worlds = world_matrices(doc)
    out = []
    for i, node in enumerate(nodes):
        if node.get("name") != name or "mesh" not in node:
            continue
        world = worlds.get(i, IDENTITY)
        for prim in doc["meshes"][node["mesh"]].get("primitives", []):
            pos = prim.get("attributes", {}).get("POSITION")
            if pos is None:
                continue
            out.extend(apply(world, pt) for pt in accessor(doc, binary, pos))
    return out


def bounds(points) -> tuple:
    pts = list(points)
    if not pts:
        raise ValueError("no points to bound")
    return (tuple(min(p[i] for p in pts) for i in range(3)),
            tuple(max(p[i] for p in pts) for i in range(3)))


# --- the axis claim ----------------------------------------------------------

def blender_to_gltf(pt) -> tuple:
    """The mapping spec section 2.2 claims: Blender (x, y, z) -> glTF (x, z, -y).

    Written here, in the module that will go on to CONTRADICT it if the file
    says otherwise, so the claim and its test are never the same statement
    twice.
    """
    x, y, z = pt
    return (x, z, -y)


AXIS_NAMES = ("X", "Y", "Z")


def axis_faults(blender_bounds, gltf_bounds, tol: float = 1e-3) -> list[str]:
    """Every way the exported bounds disagree with the claimed mapping.

    Compares BOXES, not points, because the mapping is a signed axis permutation
    and such a map takes an axis-aligned box exactly onto an axis-aligned box —
    so there is nothing approximate about the comparison beyond float noise.
    """
    lo, hi = blender_bounds
    want_lo = blender_to_gltf(lo)
    want_hi = blender_to_gltf(hi)
    # The -Y flip swaps which end of that axis is the minimum.
    want = (tuple(min(a, b) for a, b in zip(want_lo, want_hi)),
            tuple(max(a, b) for a, b in zip(want_lo, want_hi)))
    out = []
    for end, label in ((0, "min"), (1, "max")):
        for i in range(3):
            got = gltf_bounds[end][i]
            expect = want[end][i]
            if abs(got - expect) > tol:
                out.append(
                    f"glTF {label} {AXIS_NAMES[i]} is {got:.4f}, "
                    f"but Blender's box maps to {expect:.4f}"
                )
    return out


def origin_faults(hull_bounds, asset_bounds, draft: float, loa: float,
                  tol: float = 0.05) -> list[str]:
    """Is glTF (0, 0, 0) the waterline, amidships, on the centreline?

    THE SPAN IS THE HULL'S, AND THIS ASSERTION WAS REWRITTEN TO SAY SO. The
    first form measured the WHOLE ASSET bow to stern and condemned a correct
    export: the bowsprit stands 12 m forward of the stem, so the asset runs
    from glTF Z -31.04 to +19.80 and is nowhere near symmetric — correctly.
    Spec section 2.2 says "amidships", and amidships is a station of the HULL,
    between the stem and the transom. Measuring the asset measured the wrong
    thing, and the way it was wrong would have been fixed by widening a
    tolerance until a displaced hull could hide inside the bowsprit's overhang.

    Three separate statements, each naming the two things it spans, because
    "the origin is right" is three different facts and one assertion would pass
    on two of them. The CENTRELINE is checked on both boxes: the hull must
    straddle it and so must the yards, which are the widest thing aboard and
    the first to show a mirrored rig.
    """
    out = []
    for label, box in (("hull", hull_bounds), ("whole asset", asset_bounds)):
        lo, hi = box
        if abs(lo[0] + hi[0]) > tol:
            out.append(
                f"not on the CENTRELINE: the {label}'s port {lo[0]:.3f} and "
                f"starboard {hi[0]:.3f} do not straddle 0 "
                f"(off by {lo[0] + hi[0]:.3f} m)"
            )
    lo, hi = hull_bounds
    if abs(lo[1] + draft) > tol:
        out.append(
            f"not at the WATERLINE: the hull's keel is at glTF Y {lo[1]:.3f}, "
            f"and the declared draft puts it at {-draft:.3f}"
        )
    span = hi[2] - lo[2]
    if abs(lo[2] + hi[2]) > tol:
        out.append(
            f"not AMIDSHIPS: the hull's bow {lo[2]:.3f} and stern {hi[2]:.3f} "
            f"do not straddle 0 (off by {lo[2] + hi[2]:.3f} m)"
        )
    if abs(span - loa) > loa * 0.02:
        out.append(
            f"the exported hull is {span:.2f} m stem to transom, against a "
            f"length overall of {loa:.2f} m — something was left out"
        )
    return out


def texture_faults(doc: dict, plain: tuple = ()) -> list[str]:
    """Does the document actually carry its textures, or just name them?

    The failure named in the project's Review Focus has a second half: even with
    a good bake on disk, a `.glb` can be written whose materials reference
    nothing. This reads the exported document rather than the Blender scene.

    `plain` names the materials that must carry NO texture and a WHITE base
    colour: the owner's tinted parts, which the game tints by multiplying
    that base colour (`frigate.owner`). Either way round is a fault.
    """
    out = []
    materials = doc.get("materials", [])
    if not materials:
        return ["the glb has no materials at all"]
    images = doc.get("images", [])
    if not images:
        out.append("the glb has no images at all")
    for i, mat in enumerate(materials):
        name = mat.get("name", f"#{i}")
        pbr = mat.get("pbrMetallicRoughness", {})
        if name in plain:
            textures = [k for k in ("baseColorTexture",
                                    "metallicRoughnessTexture") if k in pbr]
            textures += [k for k in ("normalTexture", "emissiveTexture",
                                     "occlusionTexture") if k in mat]
            if textures:
                out.append(f"tinted material {name} carries {textures}")
            base = pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0])
            if any(abs(c - 1.0) > 1e-6 for c in base[:3]):
                out.append(f"tinted material {name} is not white: {base}")
            continue
        if "baseColorTexture" not in pbr:
            out.append(f"material {name} has no base colour texture")
        if "metallicRoughnessTexture" not in pbr:
            out.append(f"material {name} has no metallic-roughness texture")
        if "normalTexture" not in mat:
            out.append(f"material {name} has no normal texture")
    for i, img in enumerate(images):
        if "bufferView" not in img and "uri" not in img:
            out.append(f"image #{i} has no data and no uri")
    return out


def triangle_count(doc: dict) -> int:
    """Triangles in the exported document, counted off the accessors.

    The number the ASSET has, not the number Blender was holding. Only
    triangle-mode primitives are counted, which is all this exporter writes.
    """
    total = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if prim.get("mode", 4) != 4:
                continue
            if "indices" in prim:
                total += doc["accessors"][prim["indices"]]["count"] // 3
            else:
                pos = prim.get("attributes", {}).get("POSITION")
                if pos is not None:
                    total += doc["accessors"][pos]["count"] // 3
    return total


def rendered_triangle_count(doc: dict) -> int:
    """Triangles the asset DRAWS, counting every node that instances a mesh.

    `triangle_count` counts unique mesh data, which is what the file stores and
    what its size is driven by. This counts what a renderer submits, which is
    what spec section 5's budget is written in. On this ship they differ by
    7,416 — 24 cannons, 24 port lids, 8 barrels, 2 anchors and 3 lanterns all
    share one mesh each — and quoting either number as "the triangle count"
    without the other is how an asset gets certified under a budget it misses.
    """
    per_mesh = {}
    for i, mesh in enumerate(doc.get("meshes", [])):
        total = 0
        for prim in mesh.get("primitives", []):
            if prim.get("mode", 4) != 4:
                continue
            if "indices" in prim:
                total += doc["accessors"][prim["indices"]]["count"] // 3
            else:
                pos = prim.get("attributes", {}).get("POSITION")
                if pos is not None:
                    total += doc["accessors"][pos]["count"] // 3
        per_mesh[i] = total
    return sum(per_mesh.get(n["mesh"], 0)
               for n in doc.get("nodes", []) if "mesh" in n)


# --- what format the images actually came out in -----------------------------
#
# Read off the FILE, for the same reason the axis is. The exporter picks a
# format per image from the Blender datablock, and a normal map that came out
# JPEG is not a smaller normal map, it is shading error — a rung DCT puts the
# surface normal somewhere it does not point, right at the edges the detail is
# made of. Nothing in Blender shows it, because Blender never reads the glb
# back.

PNG_MIME = "image/png"
JPEG_MIME = "image/jpeg"

# role -> the mime types it may ship as. The PNG allowances are not leniency;
# each is something JPEG cannot do. See `mime_faults`.
#
# METALLIC-ROUGHNESS IS THE ONE THAT IS NOT OURS TO CHOOSE, and it was worth
# finding out why rather than assuming the budget had been applied. glTF's
# metallicRoughness texture is G=roughness, B=metallic, so it is a COMPOSED
# image, and Blender 5.2's exporter composes it unconditionally: in
# `__get_image_data_mapping` it fills G from the roughness image and then,
# "since metal/roughness are always used together", calls `fill_white(B)`.
# That `FillWhite` is not a `FillImage`, so the exporter leaves its happy path,
# builds a new image, and under AUTO a newly built image is always PNG. No
# datablock setting reaches it.
#
# The one way back onto the happy path is to drive Metallic from the SAME
# image's blue channel, which means packing metallic into B of the roughness
# atlas. MEASURED, and rejected: a JPEG carrying roughness in R and G and a
# different value in B is no longer greyscale, so it gets chroma-subsampled,
# and at quality 95 the roughness came back with a mean error of 0.041 and a
# 99th percentile of 0.086 — 1.3x and 2.7x the ochre's own grain, on a map
# whose whole job is to be a number. Shipping 1.6 MB smaller is not worth
# putting that much error into the roughness and the metallic both.
#
# So the four metallic-roughness maps ship PNG, and this is recorded as a
# limitation of the exporter rather than a choice. `frigate.texbudget` governs
# the atlases the bake writes, which ARE JPEG.
ROLE_MIME = {
    "baseColor": (JPEG_MIME,),
    "metallicRoughness": (PNG_MIME,),
    "normal": (PNG_MIME,),
    "emissive": (JPEG_MIME,),
    "occlusion": (JPEG_MIME,),
}

# Roles glTF builds by combining channels from more than one source, so the
# image in the file is not one the bake wrote and cannot be compared with one.
COMPOSED_ROLES = ("metallicRoughness",)


def _source(doc: dict, texinfo) -> int | None:
    if not isinstance(texinfo, dict) or "index" not in texinfo:
        return None
    textures = doc.get("textures", [])
    if texinfo["index"] >= len(textures):
        return None
    return textures[texinfo["index"]].get("source")


def _material_textures(mat: dict):
    """(role, textureInfo) for every texture one material references."""
    pbr = mat.get("pbrMetallicRoughness", {})
    for role, info in (
        ("baseColor", pbr.get("baseColorTexture")),
        ("metallicRoughness", pbr.get("metallicRoughnessTexture")),
        ("normal", mat.get("normalTexture")),
        ("emissive", mat.get("emissiveTexture")),
        ("occlusion", mat.get("occlusionTexture")),
    ):
        if info is not None:
            yield role, info


def image_roles(doc: dict) -> dict:
    """{image index: the set of roles it is used in}."""
    out = {}
    for mat in doc.get("materials", []):
        for role, info in _material_textures(mat):
            src = _source(doc, info)
            if src is None:
                continue
            out.setdefault(src, set()).add(role)
    return out


def mime_faults(doc: dict) -> list[str]:
    """Every image shipped in a format its role cannot afford.

    NORMALS MUST BE PNG. See the section comment above.

    BASE COLOUR AND METALLIC-ROUGHNESS MUST BE JPEG — unless the material is
    transparent, in which case its base colour carries the alpha cut in its
    fourth channel and JPEG has no fourth channel. That one atlas pays for
    itself in PNG; shipping it as JPEG would not make a worse rope, it would
    make 741 flat tapes. The exception is stated as a fault in BOTH directions,
    so a transparent material whose albedo went to JPEG is caught too.
    """
    out = []
    roles = image_roles(doc)
    images = doc.get("images", [])
    transparent = set()
    for mat in doc.get("materials", []):
        if mat.get("alphaMode", "OPAQUE") == "OPAQUE":
            continue
        src = _source(doc, mat.get("pbrMetallicRoughness", {}).get("baseColorTexture"))
        if src is not None:
            transparent.add(src)
    for index, played in sorted(roles.items()):
        if index >= len(images):
            out.append(f"image #{index} is referenced but not in the file")
            continue
        img = images[index]
        name = img.get("name", f"#{index}")
        mime = img.get("mimeType")
        if mime is None:
            out.append(f"{name} declares no mime type, so nothing can be said "
                       f"about the format it shipped in")
            continue
        for role in sorted(played):
            if role == "baseColor" and index in transparent:
                if mime != PNG_MIME:
                    out.append(
                        f"{name} is the baseColor of a material with an alpha "
                        f"cut and shipped as {mime}, which has no alpha channel"
                    )
                continue
            allowed = ROLE_MIME.get(role)
            if allowed and mime not in allowed:
                out.append(
                    f"{name} plays {role} and shipped as {mime}, "
                    f"not {' or '.join(allowed)}"
                )
    return out


def image_bytes(doc: dict) -> int:
    """Bytes of the binary chunk the images occupy. The thing that got big."""
    total = 0
    views = doc.get("bufferViews", [])
    for img in doc.get("images", []):
        view = img.get("bufferView")
        if view is None or view >= len(views):
            continue
        total += views[view].get("byteLength", 0)
    return total


def image_sizes(doc: dict) -> list:
    """(name, mime, bytes, sorted roles) per image, for a size breakdown."""
    roles = image_roles(doc)
    views = doc.get("bufferViews", [])
    out = []
    for i, img in enumerate(doc.get("images", [])):
        view = img.get("bufferView")
        size = views[view].get("byteLength", 0) if view is not None and view < len(views) else 0
        out.append((img.get("name", f"#{i}"), img.get("mimeType"), size,
                    sorted(roles.get(i, ()))))
    return out


def picture_size(data: bytes) -> tuple[int, int]:
    """(width, height) of a PNG or a JPEG, read off its own header.

    The image's PIXEL size is a fact of its bytes and nowhere else in the
    file: glTF does not record it. So a texture ceiling is judged here, off
    the bytes the engine will decode, not off the Blender datablock they
    were written from.
    """
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 4 <= len(data):
            if data[i] != 0xFF:
                raise ValueError(f"a JPEG marker was expected at byte {i}")
            marker = data[i + 1]
            length = struct.unpack(">H", data[i + 2:i + 4])[0]
            # SOF0..SOF15, less DHT (C4), JPG (C8) and DAC (CC)
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return (w, h)
            i += 2 + length
        raise ValueError("a JPEG with no frame header")
    raise ValueError("neither a PNG nor a JPEG")


def image_dimensions(doc: dict, binary: bytes) -> list:
    """(name, width, height) of every image the document embeds."""
    views = doc.get("bufferViews", [])
    out = []
    for i, img in enumerate(doc.get("images", [])):
        view = views[img["bufferView"]]
        start = view.get("byteOffset", 0)
        data = binary[start:start + view["byteLength"]]
        out.append((img.get("name", f"#{i}"), *picture_size(data)))
    return out


def mesh_of_node(doc: dict) -> dict:
    """{node name: its mesh index}, for every node that draws something."""
    out = {}
    for node in doc.get("nodes", []):
        if "mesh" in node and node.get("name"):
            out[node["name"]] = node["mesh"]
    return out


def uv_set_faults(doc: dict, switchable: dict) -> list[str]:
    """Every UV set the file carries that is neither sampled nor declared.

    `switchable` is {TEXCOORD name: [node names allowed to carry it]} — the
    sets an ENGINE picks rather than a texture. The ship's colours are a
    two-state node: TEXCOORD_1 is the national ensign and nothing in the file
    samples it, because the point is that the engine switches to it. Declared
    by name and by node, so an accidental set on some other mesh is still a
    fault and the check has not been widened to nothing.
    """
    stray = [s for s in unused_uv_sets(doc) if s not in switchable]
    out = [f"{s} is exported and nothing samples it" for s in stray]
    meshes = mesh_of_node(doc)
    all_meshes = doc.get("meshes", [])
    for key, nodes in switchable.items():
        wanted = set(nodes)
        carrying = set()
        for name, index in meshes.items():
            if index >= len(all_meshes):
                continue
            if any(key in prim.get("attributes", {})
                   for prim in all_meshes[index].get("primitives", [])):
                carrying.add(name)
        for name in sorted(wanted - carrying):
            out.append(f"{name} was meant to carry {key} as a switchable UV "
                       f"set and the file has none on it")
        for name in sorted(carrying - wanted):
            out.append(f"{name} carries {key}, which is only declared "
                       f"switchable on {sorted(wanted)}")
    return out


def unused_uv_sets(doc: dict) -> list[str]:
    """TEXCOORD_n sets present on the meshes that no texture ever samples.

    `rope_width` was the UV layer the rigging's alpha cut was baked FROM. The
    bake made it redundant, but it still exported on every mesh, costing two
    floats a vertex for a coordinate nothing reads.
    """
    sampled = set()
    for mat in doc.get("materials", []):
        for _role, info in _material_textures(mat):
            sampled.add(f"TEXCOORD_{info.get('texCoord', 0)}")
    present = {
        key
        for mesh in doc.get("meshes", [])
        for prim in mesh.get("primitives", [])
        for key in prim.get("attributes", {})
        if key.startswith("TEXCOORD_")
    }
    return sorted(present - sampled)
