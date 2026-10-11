"""The build pipeline, in spec section 6 order.

`rebuild(p)` wipes the `Frigate` collection and replays every pass that exists.
Phase 1 (tasks 2-8) is parametric and idempotent; Phase 2 (tasks 9+) is ordered
and destructive, which is why it runs from the same single entry point rather
than being poked at by hand — replaying by hand is how a pass gets skipped.

Importing a pass is deliberately lazy: a task that has not been written yet is
simply absent from `PASSES`, so this module always runs to the end of what is
built so far.
"""

import bpy

from . import checklist, env
from .params import FrigateParams


def _passes():
    """(label, callable) for every build pass, in spec section 6 order."""
    from . import decks, gunports, hull, stern

    out = [
        ("hull", hull.build_hull),
        ("bulwarks", decks.build_bulwarks),
        ("decks", decks.build_decks),
        ("gunports", gunports.cut_gunports),
        ("stern", stern.build_stern),
    ]
    for name, attr in (
        ("rudder", "build_rudder"),
        ("rails", "build_rails"),
        ("headworks", "build_head"),
        ("masts", "build_masts"),
        ("sails", "build_sails"),
        ("rigging", "build_rigging"),
        ("cannons", "build_battery"),
        ("furniture", "build_furniture"),
        ("dressing", "build_dressing"),
        ("damage", "apply_damage"),
        ("materials", "build_materials"),
        ("bake", "unwrap_all"),
    ):
        try:
            module = __import__(f"frigate.{name}", fromlist=[attr])
        except ImportError:
            continue
        out.append((name, getattr(module, attr)))
    return out


def rebuild(p: FrigateParams | None = None) -> dict:
    """Clear and rebuild ONE ship. Returns per-object triangle counts.

    Which passes run is `p.passes`: None means every pass that exists, which is
    what a finished ship wants. A hull still being proportioned names the
    passes it has, so stopping after the gunports is a stated property of that
    ship type rather than a pipeline that fell over quietly partway down.
    """
    from . import checks

    p = p or FrigateParams()
    p.validate()
    env.setup_scene(p)
    env.set_active(p)
    env.clear_build(p)
    env.clear_other_ships(p)
    wanted = None if p.passes is None else set(p.passes)
    ran = []
    for label, fn in _passes():
        if wanted is not None and label not in wanted:
            continue
        fn(p)
        ran.append(label)
    if wanted is not None and set(ran) != wanted:
        raise ValueError(
            f"{p.collection} asked for passes {sorted(wanted)} and only "
            f"{sorted(ran)} exist"
        )
    env.assert_no_renamed_objects(p)
    coll = bpy.data.collections[p.collection]
    return {o.name: checks.tri_count(o.name) for o in coll.objects}


def check_all(p: FrigateParams | None = None) -> str:
    """Run every check that exists, and report the triangle total against budget."""
    from . import budget, checks

    p = p or FrigateParams()
    env.set_active(p)
    lines = []
    # Per-pass checks follow her `passes`; the ship-wide ones always run.
    # See `frigate.checklist`.
    labels = checklist.labels_for(p)
    for label in labels:
        fn = getattr(checks, f"check_{label}", None)
        if fn is None:
            continue
        lines.append(checks.report(label, fn(p), echo=False))
    coll = bpy.data.collections[p.collection]
    tris = {o.name: checks.tri_count(o.name) for o in coll.objects}
    lines.append(budget.tris_summary(p, sum(tris.values())))
    lines.append("  " + "  ".join(f"{k}={v}" for k, v in sorted(tris.items())))
    return "\n".join(lines)
