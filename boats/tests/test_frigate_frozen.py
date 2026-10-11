"""The frigate is frozen. A generalisation that changes it is a regression.

Every ship after the frigate is built by widening code the frigate already
runs through, and the obvious way for that to go wrong is quietly: a formula
re-derived "equivalently" that is equal in algebra and not in floating point,
a list rebuilt in a different order, a default that used to be a constant.
Nothing in the twenty-two in-Blender checks would catch a sail moving three
millimetres, and nothing in the pytest suite would catch a rope's two ends
swapping.

So this hashes the frigate's WHOLE pure-math plan — every station ring, every
aperture, every spar, every sail node, every rope — bit for bit, at full
float precision, and pins the digest. It runs off-Blender in milliseconds.

If this fails, the frigate has moved. Do not update the digest to make it
pass: find what moved and why, and only then, if the move was intended and
the maintainer agreed to it, record the new figure WITH the reason.
"""

import hashlib

from frigate import head, profiles, rig, ropes, sailplan, wind
from frigate.params import FrigateParams

P = FrigateParams()

# SHA-1 over `plan_digest_source(FrigateParams())`, taken at the commit that
# turned FrigateParams into the ship-type model, against a build proved
# vertex-for-vertex identical to the shipped frigate inside Blender (96 meshes,
# 35,926 triangles, every mesh's world-space vertex hash unchanged).
FRIGATE_PLAN_SHA1 = "26362f38739aaa594281477327b74c7fd119ed58"


def _f(x) -> str:
    """Full precision, no rounding: a digest that rounds is a digest that lies."""
    if isinstance(x, float):
        return x.hex()
    if isinstance(x, (list, tuple)):
        return "(" + ",".join(_f(v) for v in x) + ")"
    if isinstance(x, dict):
        return "{" + ",".join(f"{k}:{_f(v)}" for k, v in sorted(x.items())) + "}"
    return repr(x)


def plan_digest_source(p) -> list[str]:
    """Every number the frigate's geometry is built from, in emission order."""
    lines: list[str] = []

    def add(label, value):
        lines.append(f"{label}={_f(value)}")

    # hull
    add("station_ts", profiles.station_ts(p))
    add("stations", profiles.all_stations(p))
    add("bulwark_ts", profiles.bulwark_ts(p))
    add("bulwark_row_offsets", profiles.bulwark_row_offsets(p))

    # battery, every row
    add("gunport_rows", profiles.gunport_rows(p))
    add("chase_row", profiles.chase_row(p))
    for d in range(len(p.gun_decks)):
        add(f"gunport_ts[{d}]", profiles.gunport_ts(p, d))
        add(f"gunport_bands[{d}]", profiles.gunport_bands(p, d))
        add(f"gunport_boxes[{d}]", profiles.gunport_boxes(p, d))
    add("chase_u_edges", profiles.chase_u_edges(p))
    add("transom_us", profiles.transom_us(p))
    add("transom_bands", profiles.transom_bands(p))
    add("gallery_window_rects", profiles.gallery_window_rects(p))
    add("gun_placements", profiles.gun_placements(p))
    add("lid_placements", profiles.lid_placements(p))

    # decks
    for tier in p.deck_tiers:
        add(f"tier[{tier.name}]", (tier.t0, tier.t1, tier.n_long, tier.rise))

    # rig
    add("mast_names", profiles.mast_names(p))
    for name in profiles.mast_names(p):
        add(f"mast[{name}].truck_z", profiles.mast_truck_z(p, name))
        add(f"mast[{name}].foot", profiles.mast_foot(p, name))
        add(f"mast[{name}].segments", profiles.mast_segments(p, name))
        add(f"mast[{name}].top", profiles.top_platform(p, name))
        add(f"mast[{name}].crosstrees", profiles.crosstrees(p, name))
        add(f"mast[{name}].outline0", profiles.top_outline(p, name, 0))
        add(f"mast[{name}].outline1", profiles.top_outline(p, name, 1))
        add(f"mast[{name}].yards", profiles.yard_specs(p, name))
        add(f"mast[{name}].channel", profiles.channel_span(p, name))
        add(f"mast[{name}].chainplates", profiles.chainplate_segments(p, name))
    add("bowsprit", profiles.bowsprit_segment(p))
    add("rail_runs", profiles.rail_runs(p))
    add("platform_runs", profiles.platform_runs(p))

    # canvas
    add("sail_list", [(m, s.kind.value, s.tier) for m, s in sailplan.all_sails(p)])
    for mast, sail in sailplan.all_sails(p):
        add(f"sail[{mast},{sail.tier}]",
            sailplan.sail_grid(p, mast, sail, profiles.SAIL_NU, profiles.SAIL_NV))
    add("flag", wind.flag_grid(p, profiles.FLAG_NU, profiles.FLAG_NV))
    add("patches", wind.sail_patches(p))

    # rigging
    add("ropes", ropes.all_ropes(p))

    # dressing and fittings
    add("figurehead", profiles.figure_all_points(p))
    add("trailboard_port", profiles.trailboard_rings(p, -1.0))
    add("trailboard_stbd", profiles.trailboard_rings(p, 1.0))
    add("furniture", profiles.furniture_placements(p))
    add("anchor_surface", profiles.anchor_surface())
    for sign in (-1.0, 1.0):
        add(f"head.lower[{sign}]", head.lower_rail_rings(p, sign))
        add(f"head.upper[{sign}]", head.upper_rail_rings(p, sign))
        add(f"head.timbers[{sign}]", head.head_timber_boxes(p, sign))
    add("head.knee", head.knee_rings(p))
    add("head.beakhead", head.beakhead_wall(p))

    # the animation rig: every pivot, its origin and the axis it turns about
    def pv(x):
        return (x.part, x.point, x.axis, x.local_axis, x.kind, x.range_deg)
    add("rig.lids", [pv(x) for x in rig.lid_pivots(p)])
    add("rig.yards", [pv(x) for x in rig.yard_pivots(p)])
    add("rig.rudder", pv(rig.rudder_pivot(p)))
    add("rig.wheel_origin", rig.wheel_origin(p))
    add("rig.merged", sorted(rig.MERGED_ON_PURPOSE))
    return lines


def plan_digest(p) -> str:
    return hashlib.sha1("\n".join(plan_digest_source(p)).encode()).hexdigest()


def test_the_frigates_whole_geometric_plan_is_unchanged():
    assert plan_digest(P) == FRIGATE_PLAN_SHA1, (
        "The frigate's geometry has moved. This is the regression guard for "
        "every generalisation pass: find WHAT moved before touching this "
        "digest. `plan_digest_source` returns the labelled lines, so diffing "
        "two runs names the thing that changed."
    )


def test_the_digest_actually_covers_something():
    """A digest over an empty list would pass forever. This is the mutation
    test on the guard itself."""
    lines = plan_digest_source(P)
    assert len(lines) > 60
    assert sum(len(line) for line in lines) > 350_000


def test_the_digest_notices_a_millimetre():
    moved = FrigateParams()
    moved.deck_z = P.deck_z + 0.001
    assert plan_digest(moved) != FRIGATE_PLAN_SHA1


def test_the_digest_notices_a_reordered_battery():
    swapped = FrigateParams()
    deck = swapped.gun_decks[0]
    swapped.gun_decks = (deck.__class__(deck.name, deck.n_ports, deck.t1 - 1e-9,
                                        deck.t1, deck.width, deck.height,
                                        deck.sill),)
    assert plan_digest(swapped) != FRIGATE_PLAN_SHA1
