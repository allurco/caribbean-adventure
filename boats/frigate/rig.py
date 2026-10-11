"""Which parts of the ship MOVE, where each one turns, and about what. Pure.

A glTF node animates about ITS OWN ORIGIN. Geometry built in world space with
the object left at (0, 0, 0) can only turn about the SHIP's origin, which is
why the instanced parts — the port lids, the cannons — already animate and the
merged ones do not. This module is the ruling on which parts have to become
their own node, where that node's origin goes, and which of its own axes the
animation turns about. It imports no bpy; `frigate.masts`, `frigate.furniture`
and `frigate.rudder` emit against it and `checks.check_pivots` measures it.

IT IS PARAMETERISED OFF `FrigateParams` ON PURPOSE. Three more hulls follow —
galleon, schooner, man-o-war — and a per-part pivot table bolted onto each one
by hand is three chances to put a yard's pivot somewhere other than its own
mast. Everything here is derived from the same profiles the geometry is.

SPLIT ONLY WHAT MOVES. Every node costs a draw call, and the asset already
draws 96 of them. `Rigging`, `Sails`, the rest of `Deck_Furniture`, the decks
and the hull stay merged because nothing about them turns.

THE KNOWN COMPLICATION, RULED BY THE MAINTAINER AND NOT TO BE REOPENED. Braces, lifts
and sheets run from a yard ARM to the ship. Splitting the yards breaks those
ropes at one end: the rope is baked into `Rigging`, which does not move, so
bracing a yard slides its arm out from under the rope that is bent to it. The
ruling is to ACCEPT THE ERROR at modest brace angles. `BRACE_LIMIT_DEG` is
20 degrees, which is a realistic working brace, and `brace_slip` below is the
arithmetic of what that costs at the worst arm on the ship. The rigging is NOT
skinned; skinning it is a later upgrade if large brace angles are ever wanted.
"""

import math
from dataclasses import dataclass

from . import profiles
from .params import FrigateParams

Point = tuple[float, float, float]

HINGE = "hinge"
MAST = "mast"
SPINDLE = "spindle"
STOCK = "stock"

# The maintainer's ruling. The visual mismatch at this angle is small, and this is what
# shipped games do. See `brace_slip` for what it measures.
BRACE_LIMIT_DEG = 20.0

# A LATEEN YARD IS NOT BRACED, IT IS SWUNG. A square yard's limit above is
# about a yardarm sliding out from under a brace that does not move; a lateen
# yard is hauled right round its mast when the ship wears, so its working
# range is the full quarter-turn either way and the figure is its own.
LATEEN_SWING_DEG = 90.0

# What stays merged, and why. Listed rather than left implicit so that a later
# pass splitting one of them has to delete a line that says not to.
MERGED_ON_PURPOSE = {
    "Rigging": "552 ropes, none of which turns about anything. Splitting it "
               "would cost 552 draw calls to animate nothing",
    "Sails": "the canvas is set by `frigate.wind`, which is a field, not a "
             "hinge. A sail that furled would be a different mesh, not a "
             "rotated one",
    "Deck_Furniture": "the capstan, bitts, coamings, skids and the wheel's own "
                      "standards are fixed to the deck. Only the WHEEL turns, "
                      "and only the wheel comes out",
    "Hull": "a hull that rotates is a ship that is sinking",
    "Masts": "the masts are stepped on the keelson. The yards turn about them; "
             "they do not turn themselves",
}


@dataclass(frozen=True)
class Pivot:
    """One animatable part: where its node's origin goes and what it turns about.

    `point` is the world point the origin must sit on. `axis` is the world
    direction it turns about. `local_axis` is which of the NODE's own axes
    that direction has to come out as, so an animator keys one channel
    instead of three — a glTF node can rotate about any axis, but one that
    needs a quaternion with three moving components is one nobody will
    hand-animate correctly.
    """

    part: str
    point: Point
    axis: Point
    local_axis: tuple
    kind: str
    why: str
    range_deg: tuple

    def distance_from(self, point) -> float:
        """How far a point lies off this pivot's own axis, in metres."""
        d = tuple(a - b for a, b in zip(point, self.point))
        along = sum(a * b for a, b in zip(d, self.axis))
        perp = tuple(a - along * b for a, b in zip(d, self.axis))
        return math.sqrt(sum(c * c for c in perp))


def unit(v) -> Point:
    length = math.sqrt(sum(c * c for c in v))
    if length < 1e-12:
        raise ValueError(f"{v} has no direction")
    return tuple(c / length for c in v)


def axis_error_deg(a, b) -> float:
    """The angle between two axes, treating opposite directions as the same.

    OPPOSITE IS THE SAME AXIS. A hinge line has no preferred end, and a node
    whose local Y runs the other way along the same hinge swings the lid
    exactly as well — it just takes the opposite sign of angle. An assertion
    that cared would fail eleven of the twenty-four port lids for being on
    the other side of the ship.
    """
    dot = abs(sum(x * y for x, y in zip(unit(a), unit(b))))
    return math.degrees(math.acos(min(1.0, max(-1.0, dot))))


# --- the port lids: already right, and this is what "right" means ------------


def lid_name(index: int) -> str:
    return f"PortLid_{index:02d}"


def lid_pivots(p: FrigateParams) -> list:
    """One pivot per port lid: the HEAD of its own aperture, running athwart
    the lid.

    The hinge is the head and not the sill, and that was measured rather than
    assumed: on all 22 broadside lids the hinge z IS `sheer(t) + port_sill +
    port_h`, which is a full aperture height — 0.750 m — above its own sill,
    and each lid's free edge hangs 0.322 m BELOW its hinge. A bottom-hinged
    lid swung the same 68 degrees would carry its free edge 0.322 m above the
    hinge and straight across the aperture.
    """
    p.validate()
    out = []
    for index, lid in enumerate(profiles.lid_placements(p)):
        yaw = math.radians(lid["yaw_deg"])
        # The hinge runs along the lid's own width, which the placement yaws.
        axis = unit((math.sin(yaw), math.cos(yaw), 0.0))
        out.append(Pivot(
            part=lid_name(index),
            point=tuple(lid["hinge"]),
            axis=axis,
            local_axis=(0.0, 1.0, 0.0),
            kind=HINGE,
            why="a port lid is hinged at the HEAD of its own aperture and "
                "triced up from there. Shut is a single rotation of "
                f"{lid['open_deg']:.0f} degrees about that one line",
            range_deg=(0.0, lid["open_deg"]),
        ))
    return out


def lid_shut_deg(p: FrigateParams) -> float:
    """How far a lid turns from where it hangs to shut. One number, one axis."""
    return profiles.LID_OPEN_DEG


# --- the yards: nine nodes, each on its own mast ------------------------------

# (mast, tier) of each yard, in the order `masts.build_yards` emits them, which
# is the order the names are numbered in: up each mast, fore to mizzen. HOW
# MANY a mast has is `profiles.yard_specs`, which is one per square sail —
# the frigate's three a mast is a fact about her rig and not about yards.


def yard_order(p: FrigateParams) -> list:
    """(mast, tier) of every yard in the ship, forward mast first.

    ONE ENTRY PER YARD THE MAST ACTUALLY HAS, read off `yard_specs`. It used
    to be `range(YARD_TIERS)` — three a mast, always — which is the frigate's
    nine written as a loop. A galleon sets two square sails on its fore, three
    on its main and a LATEEN on its mizzen, so it has five yards and not nine,
    and a mast with none at all must contribute none rather than three
    IndexErrors.
    """
    return [(name, tier) for name in profiles.mast_names(p)
            for tier in range(len(profiles.yard_specs(p, name)))]


def yard_name(index: int) -> str:
    """`Yard_00` .. `Yard_08`.

    NUMBERED AND NOT NAMED, which is a trade and it is recorded. `Yard_Fore_0`
    would read better in an animation editor, but `joints.family` collapses
    `NAME_<digits>` and nothing else, so named yards would be three families
    needing three copies of every ruling that mentions a yard. The project
    already numbers its repeated parts — `Cannon_00`, `PortLid_00`,
    `Barrel_00` — and `yard_order` is the key.
    """
    return f"Yard_{index:02d}"


def yard_index(p: FrigateParams, mast: str, tier: int) -> int:
    return yard_order(p).index((mast, tier))


def mast_axis(p: FrigateParams, name: str) -> Point:
    """The direction one mast's own axis runs, foot to truck. Rakes aft."""
    foot = profiles.mast_foot(p, name)
    top = profiles.mast_point(p, name, profiles.mast_truck_z(p, name))
    return unit(tuple(b - a for a, b in zip(foot, top)))


def yard_pivots(p: FrigateParams) -> list:
    """One pivot per yard: the SLINGS, which is where the yard crosses its own
    mast, turning about that mast's own raked axis.

    THE MAST AXIS AND NOT THE VERTICAL. The three masts rake aft by 0.5, 1.5
    and 2.5 degrees, so a yard braced about the world vertical would climb or
    dip at its arms — by 2.5 degrees of a 7.4 m half-span at the mizzen,
    which is 0.32 m of yardarm at hard brace. A glTF node rotates about any
    axis it likes, so the node is BUILT with its local Z on the mast and the
    animation stays one channel.
    """
    p.validate()
    out = []
    for index, (name, tier) in enumerate(yard_order(p)):
        z, length, _radius = profiles.yard_specs(p, name)[tier]
        out.append(Pivot(
            part=yard_name(index),
            point=profiles.mast_point(p, name, z),
            axis=mast_axis(p, name),
            local_axis=(0.0, 0.0, 1.0),
            kind=MAST,
            why=f"the {name} {profiles.square_sails_on(p, name)[tier].name} yard "
                f"is slung on its own mast and braces about that mast's own "
                f"raked axis. Its arms are {length / 2:.2f} m either side",
            range_deg=(-BRACE_LIMIT_DEG, BRACE_LIMIT_DEG),
        ))
    return out


def lateen_name(mast: str) -> str:
    """`masts.build_lateen_yards` names its object after its own mast."""
    return f"Lateen_{mast.capitalize()}"


def lateen_pivots(p: FrigateParams) -> list:
    """One pivot per LATEEN yard: the SLINGS, the same joint a square yard makes.

    The lateen yard was a STATIC node, and the only thing it was missing is
    this. A lateen yard swings about its mast exactly as a square yard does —
    `joints.py` already names the joint, "a LATEEN yard crosses its own mast
    once, at the slings, and is parrelled to it there" — and
    `profiles.lateen_spar` already returns the slings as its second element.
    So the point is that slings and the axis is the mast's own raked axis, by
    the same argument `yard_pivots` makes: the mizzen rakes aft, and a spar
    swung about the world vertical would climb at one end and dip at the
    other.

    WHAT IS DIFFERENT, and why this is not simply folded into `yard_pivots`:
    a square yard is braced, and the ruling behind `BRACE_LIMIT_DEG` is about
    a yardarm sliding out from under a brace that does not move. A lateen
    yard is not braced; it is swung right round the mast when the ship wears,
    so it is the one spar whose working range is the full half-turn. The
    range is stated here rather than borrowed.

    Nothing is emitted for a ship that sets no lateen: `lateen_masts` is `()`
    on the frigate and this returns an empty list, so she cannot move.
    """
    p.validate()
    out = []
    for name in profiles.lateen_masts(p):
        _heel, slings, _peak, _radius = profiles.lateen_spar(p, name)
        length = profiles.lateen_length(p, name)
        out.append(Pivot(
            part=lateen_name(name),
            point=slings,
            axis=mast_axis(p, name),
            local_axis=(0.0, 0.0, 1.0),
            kind=MAST,
            why=f"the {name} lateen yard is slung on its own mast at the "
                f"slings and parrelled to it there, and swings about that "
                f"mast's own raked axis. It is {length:.2f} m heel to peak",
            range_deg=(-LATEEN_SWING_DEG, LATEEN_SWING_DEG),
        ))
    return out


# A GAFF AND A BOOM SWING ABOUT THEIR MAST from their jaws, as a lateen yard
# does from its slings, and over as wide a range: a fore-and-aft sail is
# gybed right across the ship.
GAFF_SWING_DEG = 80.0


def gaff_name(mast: str, key: str) -> str:
    """`masts.build_gaffs` names each spar after its kind and its mast."""
    return f"{key.capitalize()}_{mast.capitalize()}"


def gaff_pivots(p: FrigateParams) -> list:
    """One pivot per gaff and per boom: on its own mast's raked axis at the
    height of its jaws, turning about that axis. None on a ship that sets no
    gaff sail, so the square and lateen ships cannot move."""
    from . import sailplan

    p.validate()
    out = []
    for name in profiles.mast_names(p):
        for key, (root, tip, _r0, _r1) in sailplan.gaff_spars(p, name).items():
            length = math.dist(root, tip)
            out.append(Pivot(
                part=gaff_name(name, key),
                point=profiles.mast_point(p, name, root[2]),
                axis=mast_axis(p, name),
                local_axis=(0.0, 0.0, 1.0),
                kind=MAST,
                why=f"the {name} {key}'s jaws embrace its own mast and it "
                    f"swings about that mast's raked axis. It is "
                    f"{length:.2f} m jaws to end",
                range_deg=(-GAFF_SWING_DEG, GAFF_SWING_DEG),
            ))
    return out


def brace_slip(p: FrigateParams, degrees: float = BRACE_LIMIT_DEG) -> float:
    """How far a yardarm moves from the rope bent to it, at `degrees` of brace.

    THE COST OF THE MAINTAINER'S RULING, AS A NUMBER RATHER THAN AS A SHRUG. The
    braces, lifts and sheets live in `Rigging`, which is merged and does not
    move, so a braced yard slides its arm out from under its own rope. This
    returns the chord the WORST arm on the ship travels — the main course
    yardarm, which is the longest — because that is the biggest the mismatch
    can be anywhere.
    """
    p.validate()
    worst = max(length for name in profiles.mast_names(p)
                for _z, length, _r in profiles.yard_specs(p, name))
    return 2.0 * (worst / 2.0) * math.sin(math.radians(abs(degrees)) / 2.0)


# --- the wheel ---------------------------------------------------------------

WHEEL = "Wheel"


def wheel_origin(p: FrigateParams) -> Point:
    """Where the wheel stands on the quarterdeck, from the furniture layout."""
    p.validate()
    for item in profiles.furniture_placements(p):
        if item["kind"] == "wheel":
            return tuple(item["origin"])
    raise ValueError("there is no wheel in the furniture layout")


def wheel_pivot(p: FrigateParams, hub_height: float) -> Pivot:
    """The wheel turns on its spindle, which runs fore and aft through the hub.

    `hub_height` is the hub above the deck the pedestal stands on, which
    `frigate.furniture` owns — the pedestal's height plus the wheel's own
    radius. Passed in rather than imported, because `furniture` imports bpy
    and this module must not.
    """
    ox, oy, oz = wheel_origin(p)
    return Pivot(
        part=WHEEL,
        point=(ox, oy, oz + hub_height),
        axis=(0.0, 1.0, 0.0),
        local_axis=(0.0, 1.0, 0.0),
        kind=SPINDLE,
        why="a ship's wheel turns on a spindle journalled fore and aft "
            "between its two standards. The standards do NOT turn, which is "
            "why only the rim, spokes, hub and barrel come out of "
            "`Deck_Furniture` and the pedestal stays in it",
        range_deg=(-540.0, 540.0),
    )


# --- the rudder --------------------------------------------------------------


def rudder_pivot(p: FrigateParams) -> Pivot:
    """The rudder turns on its stock: the vertical line down its leading edge,
    which is the line the three pintles are strung on."""
    from . import rudder

    point, axis = rudder.stock_axis(p)
    return Pivot(
        part="Rudder",
        point=point,
        axis=axis,
        local_axis=(0.0, 0.0, 1.0),
        kind=STOCK,
        why="the rudder is hung on three pintles down its leading edge and "
            "turns on the line through them, which is its stock",
        range_deg=(-rudder.HARD_OVER_DEG, rudder.HARD_OVER_DEG),
    )


# --- the whole table ---------------------------------------------------------


def pivots(p: FrigateParams, wheel_hub_height: float) -> tuple:
    """Every animatable part of the ship, in a stable order."""
    return tuple(lid_pivots(p) + yard_pivots(p) + lateen_pivots(p)
                 + gaff_pivots(p)
                 + [wheel_pivot(p, wheel_hub_height), rudder_pivot(p)])


# WHICH BUILD PASS EMITS EACH KIND OF ANIMATABLE PART. A ship that names her
# passes and leaves one out does not build its parts, and a check that then
# calls them "missing" is reporting the ship's declared plan as a defect --
# which is how check_pivots and check_export came to fail the galleon on
# exactly her 44 port lids, her wheel and her rudder. Keyed by KIND, so a new
# hinge or a new spar is covered by the pass that emits its kind.
EMITTED_BY = {HINGE: "cannons", MAST: "masts", SPINDLE: "furniture",
              STOCK: "rudder"}

# And the merged objects `MERGED_ON_PURPOSE` names, by the pass that emits
# each one, for the same reason.
MERGED_EMITTED_BY = {"Rigging": "rigging", "Sails": "sails",
                     "Deck_Furniture": "furniture", "Hull": "hull",
                     "Masts": "masts"}


def built_pivots(p: FrigateParams, wheel_hub_height: float) -> tuple:
    """The animatable parts this ship's OWN passes emit, in `pivots` order.

    Every part of a pass she runs is in here, so one of them missing from the
    scene is still a failure. A ship with `passes` of None runs every pass and
    gets every pivot.
    """
    return tuple(piv for piv in pivots(p, wheel_hub_height)
                 if p.builds(EMITTED_BY[piv.kind]))


def unbuilt_pivots(p: FrigateParams, wheel_hub_height: float) -> tuple:
    """((pass label, (part, ...)), ...) for every pass she does NOT run.

    Returned so a check can SAY what it is not judging and why, rather than
    passing over the parts in silence.
    """
    out: dict = {}
    for piv in pivots(p, wheel_hub_height):
        label = EMITTED_BY[piv.kind]
        if not p.builds(label):
            out.setdefault(label, []).append(piv.part)
    return tuple((label, tuple(parts)) for label, parts in out.items())


def merged_expected(p: FrigateParams) -> tuple:
    """The `MERGED_ON_PURPOSE` objects her own passes emit."""
    return tuple(name for name in MERGED_ON_PURPOSE
                 if p.builds(MERGED_EMITTED_BY[name]))


def animatable_parts(p: FrigateParams) -> tuple:
    return tuple(piv.part for piv in pivots(p, 1.0))


def split_plan(p: FrigateParams) -> dict:
    """{the merged object that used to hold it: the nodes it becomes}.

    The port lids and the rudder are not here: the lids were already separate
    nodes at their own ports, and the rudder was built as its own object.
    """
    return {
        "Yards": [yard_name(i) for i in range(len(yard_order(p)))],
        "Deck_Furniture": [WHEEL],
    }
