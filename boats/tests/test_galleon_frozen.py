"""The galleon is frozen too, now that a third and fourth hull are coming.

`test_frigate_frozen` pins the frigate's whole pure-math plan. The galleon had
no such digest: her own tests pin her proportions and her rulings one figure
at a time, which would not see a sail move three millimetres when the sloop
and the flute widen the code she runs through. This hashes her plan the same
way, bit for bit, taken at the commit before either new hull was added.

Her plan cannot be read through `plan_digest_source` as it stands, because
that reads `gunport_boxes` for every row and her main row is cut in the HULL,
which `gunport_boxes` refuses by name. So a hull row reads its hull boxes.

If this fails, the galleon has moved. Do not update the digest to make it
pass: find what moved and why.
"""

import hashlib

from frigate import head, profiles, rig, ropes, sailplan, wind
from frigate.params import GalleonParams
from test_frigate_frozen import _f

P = GalleonParams()

# SHA-1 over `galleon_digest_source(GalleonParams())`.
#
# MOVED ON PURPOSE, ONCE: the maintainer's ruling (2026-10) lengthens and
# bulks her in the generator, 34 m to 42 m with her beam, draft and deck
# crown carried in proportion, her bowsprit, gallery lights, mizzen
# channel drop, upper head rail, launch and hatches re-laid for it, and
# her shot scars recorded by band. Re-taken on that hull, which was built,
# checked, baked and exported clean in Blender. It was
# 8449eb43331e213b3b1aab15471ee413fb72b385 at boats 4dc3899 (the 34 m
# galleon, build/galleon.glb 14,722,508 B).
GALLEON_PLAN_SHA1 = "6ff22fe3df1c26c58a34ab41b724737e2ba521b6"


def galleon_digest_source(p) -> list[str]:
    lines: list[str] = []

    def add(label, value):
        lines.append(f"{label}={_f(value)}")

    add("station_ts", profiles.station_ts(p))
    add("stations", profiles.all_stations(p))
    add("bulwark_ts", profiles.bulwark_ts(p))
    for d in range(len(p.gun_decks)):
        add(f"gunport_ts[{d}]", profiles.gunport_ts(p, d))
        if profiles.gun_deck(p, d).host == "hull":
            add(f"hull_boxes[{d}]", profiles.hull_gunport_boxes(p, d))
        else:
            add(f"gunport_boxes[{d}]", profiles.gunport_boxes(p, d))
    add("chase_u_edges", profiles.chase_u_edges(p))
    add("transom_us", profiles.transom_us(p))
    add("gallery", profiles.all_gallery_window_rects(p))
    add("gun_placements", profiles.gun_placements(p))
    add("lid_placements", profiles.lid_placements(p))
    for tier in p.deck_tiers:
        add(f"tier[{tier.name}]", (tier.t0, tier.t1, tier.n_long, tier.rise))
    for name in profiles.mast_names(p):
        add(f"mast[{name}].segments", profiles.mast_segments(p, name))
        add(f"mast[{name}].yards", profiles.yard_specs(p, name))
        add(f"mast[{name}].channel", profiles.channel_span(p, name))
        add(f"mast[{name}].chainplates",
            profiles.chainplate_segments(p, name))
    for name in profiles.lateen_masts(p):
        add(f"lateen[{name}]", profiles.lateen_spar(p, name))
    add("bowsprit", profiles.bowsprit_segment(p))
    add("rail_runs", profiles.rail_runs(p))
    add("platform_runs", profiles.platform_runs(p))
    for mast, sail in sailplan.all_sails(p):
        add(f"sail[{mast},{sail.tier}]",
            sailplan.sail_grid(p, mast, sail, profiles.SAIL_NU,
                               profiles.SAIL_NV))
    add("flag", wind.flag_grid(p, profiles.FLAG_NU, profiles.FLAG_NV))
    add("patches", wind.sail_patches(p))
    add("ropes", ropes.all_ropes(p))
    add("furniture", profiles.furniture_placements(p))
    for sign in (-1.0, 1.0):
        add(f"head.upper[{sign}]", head.upper_rail_rings(p, sign))
    add("head.knee", head.knee_rings(p))

    def pv(x):
        return (x.part, x.point, x.axis, x.local_axis, x.kind, x.range_deg)
    add("rig.yards", [pv(x) for x in rig.yard_pivots(p)])
    add("rig.lateen", [pv(x) for x in rig.lateen_pivots(p)])
    add("rig.rudder", pv(rig.rudder_pivot(p)))
    return lines


def galleon_digest(p) -> str:
    return hashlib.sha1(
        "\n".join(galleon_digest_source(p)).encode()).hexdigest()


def test_the_galleons_whole_geometric_plan_is_unchanged():
    assert galleon_digest(P) == GALLEON_PLAN_SHA1, (
        "The galleon's geometry has moved. Find WHAT moved before touching "
        "this digest.")
