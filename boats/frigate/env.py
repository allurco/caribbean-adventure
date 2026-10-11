"""Scene lifecycle. Phase 1 is re-runnable, so this must replace, never accumulate."""

import os

import bpy

from .params import FrigateParams

# Kept as the DEFAULT only. The collection a hull is built into is
# `p.collection`, so a galleon can stand in the same blend file as the frigate
# without either clearing the other.
COLLECTION_NAME = "Frigate"

_ACTIVE = COLLECTION_NAME


def collection_name(p=None) -> str:
    """Which collection the pass now running builds into.

    `link()` is called from deep inside every emitter and none of them is
    given the params object, so the ship being built is set once at the top of
    `build.rebuild` rather than threaded through forty call sites. It is read
    back here and nowhere else.
    """
    if p is not None:
        return p.collection
    return _ACTIVE


def set_active(p) -> str:
    """Point every subsequent `link()` at this ship's own collection."""
    global _ACTIVE
    _ACTIVE = p.collection
    return _ACTIVE


def setup_scene(p: FrigateParams) -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    for name in ("Cube",):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


def build_collection(p=None) -> bpy.types.Collection:
    name = collection_name(p)
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def clear_build(p=None) -> int:
    """Remove every object in THIS ship's collection and free its mesh data."""
    coll = bpy.data.collections.get(collection_name(p))
    if coll is None:
        return 0
    removed = 0
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)
    return removed


# Blender object names are GLOBAL to the .blend file, not scoped to a
# collection, so two hulls cannot both own an object called "Bulwarks": the
# second one created becomes "Bulwarks.001". That is not cosmetic. With a
# frigate already in the file, the galleon's bulwark was renamed and the
# gunport cutter went and cut the FRIGATE's — caught only because the cutter
# counts its own faces and refuses a short count.
#
# So: ONE SHIP IN THE FILE AT A TIME, enforced here rather than remembered.
# The real fix is for every emitter to take a per-ship name prefix, which is
# forty call sites and would move the frigate's own node names unless the
# frigate's prefix stayed empty; it is recorded as the upgrade path, not done.
KNOWN_SHIPS = ("Frigate", "Galleon", "Flute", "Sloop", "Schooner", "ManOWar")


def clear_other_ships(p) -> dict:
    """Empty every OTHER known ship collection, and say what was removed."""
    removed = {}
    for name in KNOWN_SHIPS:
        if name == p.collection:
            continue
        coll = bpy.data.collections.get(name)
        if coll is None or not coll.objects:
            continue
        count = 0
        for o in list(coll.objects):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            count += 1
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)
        removed[name] = count
    return removed


def assert_no_renamed_objects(p) -> None:
    """No object in this ship may carry a Blender ".001" collision suffix.

    A munged name means something else in the file already owned the name the
    emitter asked for, and every later lookup of that name would find the
    wrong object. The frigate's own `Stern_Carving.002` is the one deliberate
    exception: it is a real object the stern pass creates alongside
    `Stern_Carving`, and it is named in the glb that shipped.
    """
    allowed = {"Stern_Carving.002"}
    bad = sorted(
        o.name for o in build_collection(p).objects
        if o.name not in allowed
        and len(o.name) > 4 and o.name[-4] == "." and o.name[-3:].isdigit()
    )
    if bad:
        raise ValueError(
            f"{bad} were renamed by Blender because those names were already "
            f"taken in this file. Object names are global; build one ship at a "
            f"time, or give the emitters a per-ship name prefix."
        )


def obj(name: str, p=None) -> bpy.types.Object:
    """Look an object up INSIDE the active ship's collection.

    `bpy.data.objects["Bulwarks"]` is ship-GLOBAL, and that is not a style
    point: with a frigate already in the blend file, the galleon's bulwark was
    created as "Bulwarks.001" and the gunport cutter went and cut the
    FRIGATE's. It was caught because the cutter counts its own faces and
    refuses a short count — "gunport selection found 100 faces, expected 196"
    — which is exactly the check earning its keep, but the next ship should
    not have to rediscover it.

    Raises KeyError naming the collection, rather than falling back to any
    object in the file that happens to share the name.
    """
    coll = bpy.data.collections.get(collection_name(p))
    if coll is not None:
        found = coll.objects.get(name)
        if found is not None:
            return found
    raise KeyError(
        f"no object named {name!r} in the {collection_name(p)!r} collection; "
        f"it has {sorted(o.name for o in coll.objects) if coll else '(no collection)'}"
    )


def find(name: str, p=None):
    """`obj`, but None instead of raising. For 'is this pass built yet'."""
    coll = bpy.data.collections.get(collection_name(p))
    return None if coll is None else coll.objects.get(name)


def link(obj: bpy.types.Object) -> None:
    """Link obj to the active ship's collection — never leave it in the scene root."""
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    build_collection().objects.link(obj)


RENDER_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "renders")

# Orthographic only. A close-range user-perspective viewport once produced a
# confident verdict of "bluff bow, banana bathtub" about a hull that measured
# exactly to spec; the ledger records the correction. Proportions are judged in
# Top or Right Orthographic or they are not judged.
VIEWS = {
    "right": ("VIEW3D", "RIGHT"),
    "left": ("VIEW3D", "LEFT"),
    "top": ("VIEW3D", "TOP"),
    "front": ("VIEW3D", "FRONT"),
    "back": ("VIEW3D", "BACK"),
}


def ortho_shot(name: str, view: str = "right", only: list[str] | None = None,
               p=None) -> str:
    """Frame the active ship's collection in an orthographic view and save a PNG.

    `screenshot_area` sometimes returns a blank image on the frame right after a
    view change, so the view is set, the area tagged for redraw, and the capture
    taken on a later call; re-issue rather than trusting a blank PNG.
    """
    import os

    _area_type, axis = VIEWS[view]
    area = next(a for a in bpy.context.screen.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    space = area.spaces.active
    coll = build_collection(p)
    names = only if only is not None else [o.name for o in coll.objects]

    with bpy.context.temp_override(area=area, region=region, space_data=space):
        bpy.ops.object.select_all(action="DESELECT")
        for n in names:
            obj = bpy.data.objects.get(n)
            if obj is not None:
                obj.select_set(True)
                bpy.context.view_layer.objects.active = obj
        bpy.ops.view3d.view_axis(type=axis)
        space.region_3d.view_perspective = "ORTHO"
        bpy.ops.view3d.view_selected()
        area.tag_redraw()
        os.makedirs(RENDER_DIR, exist_ok=True)
        path = os.path.join(RENDER_DIR, f"{name}.png")
        bpy.ops.screen.screenshot_area(filepath=path)
    return path
