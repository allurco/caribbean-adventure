"""Which checks `build.check_all` runs on a ship. Pure — imports no bpy.

A ship built only as far as its gunports is checked only as far as its
gunports: the per-pass checks follow the ship's own `passes` when she declares
them, so a half-built hull cannot silently skip a check that WOULD have
applied.

THE SHIP-WIDE CHECKS ARE NOT PASSES, AND RUN WHATEVER `passes` SAYS. `budget`,
`pivots`, `shading` and `export` judge the whole ship, not one pass's output.
Filtering them by `passes` -- which no ship can list them in, because they are
not build passes -- meant none of them had ever run on the galleon inside
`check_all`. Each one now reads the ship's passes itself, to know what she is
EXPECTED to have, and says by name what it is not judging and why.
"""

# Every check `check_all` knows, in the order it reports them. The frigate's
# output is pinned against this order.
LABELS = ("hull", "decks", "gunports", "stern", "rudder", "rails", "head",
          "masts", "sails", "rigging", "cannons", "furniture", "dressing",
          "damage", "intersections", "directions", "pivots", "budget",
          "shading", "materials", "bake", "export")

SHIP_WIDE = ("intersections", "directions", "pivots", "budget", "shading",
             "export")

# A build pass and the check that judges it do not always share a name.
CHECK_FOR_PASS = {"headworks": "head"}


def labels_for(p) -> tuple:
    """The checks this ship is judged by, in `LABELS` order."""
    if p.passes is None:
        return LABELS
    allowed = set(p.passes) | set(SHIP_WIDE)
    # Two checks are named for the THING and the pass for the EMITTER.
    # `headworks` emits the head and `check_head` judges it; a ship that
    # names its passes would otherwise skip the check that applies to it,
    # silently, which is the opposite of what naming them is for.
    for pass_label, check_label in CHECK_FOR_PASS.items():
        if pass_label in allowed:
            allowed.add(check_label)
    return tuple(label for label in LABELS if label in allowed)


def aperture_key(p, n_bulwark: int, n_hull: int) -> str:
    """`check_gunports`' aperture key. The frigate's reads exactly as it
    shipped, "all 22 apertures are open"; only a ship with a hull row adds
    how her apertures split between the bulwark and the hull, the way
    `check_hull` adds its rim edges only when there are some."""
    key = f"all {n_bulwark + n_hull} apertures are open"
    if n_hull:
        key += f", {n_bulwark} in the bulwark and {n_hull} in the hull"
    return key


def _battery_split(p) -> tuple:
    """(hull-row stations, bulwark-row stations, chase ports), each a
    count of ONE side's apertures times the sides it is cut in."""
    from . import profiles

    hull = bulwark = 0
    for d, _t in profiles.all_gunport_ts(p):
        if profiles.gun_deck(p, d).host == "hull":
            hull += 2
        else:
            bulwark += 2
    return hull, bulwark, len(profiles.chase_u_edges(p))


def battery_key(p) -> str:
    """`check_cannons`' count key, read off the ship's own rows. The
    frigate's reads exactly as it shipped, "24 guns and 24 lids"; only a
    ship with a hull row adds how the battery splits, the way
    `aperture_key` does."""
    from . import profiles

    n_guns = len(profiles.gun_placements(p))
    n_lids = len(profiles.lid_placements(p))
    key = f"{n_guns} guns and {n_lids} lids"
    hull, bulwark, chase = _battery_split(p)
    if hull:
        key += (f": {hull} in the hull row, {bulwark} in the bulwark row "
                f"and {chase} at the chase ports")
    return key


def lid_swing_key(p) -> str:
    """`check_cannons`' lid key. A lid hung on a plumb bulwark swings out
    AND DOWN; one hung on a hull skin that leans out under the sheer shuts
    leaning and swings `LID_OPEN_DEG` from there, which can leave it above
    the horizontal. The frigate's key reads exactly as it shipped."""
    from . import profiles

    hull, _bulwark, _chase = _battery_split(p)
    if not hull:
        return "every lid swings outboard and down from its hinge"
    return (f"every lid swings outboard, {profiles.LID_OPEN_DEG:.0f} deg "
            f"from where it hangs shut ({hull} hull lids shut leaning out "
            f"with the skin)")


def alpha_mask_results(p, alpha_families, alpha_modes: dict) -> dict:
    """`check_export`'s MASK keys: one for the rope family, read as it
    shipped, and one more for every OTHER family whose albedo carries an
    alpha cut (`bake.family_carries_alpha`, asked of the graph by the
    caller). An OPAQUE alpha family is a solid card in the file.

    `alpha_modes` is {material name: alphaMode} read off the `.glb`."""
    from . import palette

    names = palette.material_names(p)
    out = {}
    for family in (palette.ROPE_IRON,) + tuple(
            f for f in alpha_families if f != palette.ROPE_IRON):
        mode = alpha_modes.get(names[family])
        what = ("the rigging's" if family == palette.ROPE_IRON
                else f"the {family} family's")
        out[f"{what} hard alpha cut exports as MASK, not BLEND "
            f"({mode})"] = mode == "MASK"
    return out


def joints_summary_key(n_pairs: int, n_deviations: int) -> str:
    """`check_intersections`' summary key. The frigate has no capped
    deviation, so hers reads exactly as it shipped; a ship that has some
    says how many of the pairs counted are deviations, not joints."""
    key = (f"all {n_pairs} intersecting object pairs are ruled joints "
           f"in frigate.joints")
    if n_deviations:
        key += f", and {n_deviations} of them capped deviations"
    return key


def grating_cut_result(p, cut: int, covered: int, margin: int) -> tuple:
    """(key, verdict) for `check_bake`'s grating key, read AFTER a bake.

    `cut` is how many of the grating albedo's `covered` (non-background)
    texels the bake cut to alpha 0, `margin` the bake margin in texels.
    The covered texels are the cards' islands and the margin's ring round
    each. The islands are cut at the cards' own open fraction, give or
    take one texel at every bar edge; the ring takes whatever its edge
    gives it, anything from 0 to 1. So the fraction must lie in
      [(f - q)(C - M) / C, ((f + q)(C - M) + M) / C],
    f the cards' area-weighted open fraction (`head`), M the most texels
    the ring can hold (`margin` texels out from every card's perimeter
    and its four corners, at the most texels a metre the islands can
    have, sqrt(C / card area)), and q every bar-edge texel wrong, 4 /
    (pitch x the fewest texels a metre they can have). A blank cut (an
    OPAQUE card) or an inverted one (bars cut, holes kept) falls out."""
    import math

    from . import head, palette

    cards = head.beakhead_grating_open_fractions(p)
    area = sum(a for a, _p, _f in cards)
    f = sum(a * fr for a, _p, fr in cards) / area
    d_hi = math.sqrt(covered / area)
    ring = min(covered, sum(margin * d_hi * per + 4 * margin * margin
                            for _a, per, _f in cards))
    d_lo = math.sqrt(max(covered - ring, 1) / area)
    q = 4.0 / (palette.GRATING_PITCH * d_lo)
    inner = (covered - ring) / covered
    lo = max(0.0, (f - q) * inner)
    hi = min(1.0, (f + q) * inner + ring / covered)
    frac = cut / covered if covered else 0.0
    key = (f"the grating albedo cuts {cut} of {covered} covered texels "
           f"({frac:.3f}), inside {lo:.3f}..{hi:.3f} round its cards' own "
           f"open fraction {f:.3f} (hole^2 "
           f"{(1 - palette.GRATING_BAR / palette.GRATING_PITCH) ** 2:.2f})")
    return key, cut > 0 and lo <= frac <= hi
