"""The town's board contract. Pure -- imports no bpy.

The game merges or instances every town piece into the village's one
material (ADR 0002 amendment (d)), so a town `.glb` carries no images at all:
its colour is the vertex colour `COLOR_0`, ambient occlusion baked in, and its
`_TINT` channel marks the surfaces a nation palette will colour later
(PRD #392). Each kind has its own triangle budget, from the PRD's piece
table, and names the anchors the board reads off it.

`contract_faults` is fed what `export.verify_piece` read off the written file,
never what Blender says it wrote.
"""

# Triangles DRAWN, per kind (PRD #392, "Piece list and budgets").
MAX_TRIS = {"tavern": 1_800}

# Per file. The whole kit adds at most 3 MB (PRD #392, G4).
MAX_BYTES = 250_000

# The `_TINT` channel, one value per vertex (PRD #392, "No baking to textures").
TINTS = {"none": 0, "wall": 1, "roof": 2, "trim": 3, "shutter": 4, "glass": 5}

# The part whose plan bounds are the footprint the layout plans with.
FOOTPRINT_PART = "Walls"

# Anchors by name, and families of anchors by prefix (at least one each).
ANCHORS = {"tavern": ("Chimney_00",)}
ANCHOR_FAMILIES = {"tavern": ("Window_",)}

REQUIRED_ATTRIBUTES = ("POSITION", "NORMAL", "COLOR_0", "_TINT")


def contract_faults(kind: str, nbytes: int, tris: int, images: int,
                    attributes, tints, node_names) -> list:
    """Every way a written town `.glb` breaks the contract: its kind, size in
    bytes, triangles drawn, embedded images, each primitive's attribute names,
    the tint values it holds and the names of all its nodes."""
    out = []
    budget = MAX_TRIS.get(kind)
    if budget is None:
        return [f"{kind!r} has no budget in MAX_TRIS"]
    if tris > budget:
        out.append(f"it draws {tris:,} triangles, over the {kind}'s {budget:,}")
    if nbytes > MAX_BYTES:
        out.append(f"the file is {nbytes:,} bytes, over {MAX_BYTES:,}")
    if images:
        out.append(f"it carries {images} image(s); a town piece carries none")
    for i, names in enumerate(attributes):
        for attr in REQUIRED_ATTRIBUTES:
            if attr not in names:
                out.append(f"primitive {i} has no {attr}")
    allowed = set(TINTS.values())
    for value in sorted(set(tints) - allowed):
        out.append(f"tint {value} is not one of the channels {sorted(allowed)}")
    names = set(node_names)
    if FOOTPRINT_PART not in names:
        out.append(f"no part named {FOOTPRINT_PART}")
    for anchor in ANCHORS.get(kind, ()):
        if anchor not in names:
            out.append(f"no anchor named {anchor}")
    for prefix in ANCHOR_FAMILIES.get(kind, ()):
        if not any(n.startswith(prefix) for n in names):
            out.append(f"no anchor named {prefix}*")
    return out
