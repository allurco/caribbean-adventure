"""The ship's COLOURS, and the fact that there are two of them.

A SHIP SYSTEM RULE, NOT A FRIGATE DETAIL. The maintainer's game earns the pirate flag:
a player gains the colours or does not, depending on what they do. So every
hull in the system — this frigate, and the galleon, schooner and man-o-war
that follow — needs a colours node that can be switched between at least two
states at runtime. That requirement lives here, in the bpy-free layer,
parameterised off the params object, so the other three inherit it instead of
each re-implementing it.

HOW THE TWO STATES SHIP, AND WHY THIS ROUTE. One mesh, one material, one
atlas, TWO UV ISLANDS of the same flag, and the engine picks which one the
flag samples:

  TEXCOORD_0  the Jolly Roger — the skull and crossbones, painted into the
              canvas albedo and normal atlases at the flag's own UVs
  TEXCOORD_1  the NATIONAL ENSIGN — a texel-for-texel copy of the SAME baked
              flag, taken BEFORE the device is painted, parked in free space
              in the same atlas, and then dyed into a red ensign

glTF puts `texCoord` on the textureInfo, so an engine switches states by
setting `texCoord: 1` on a material instance for that one node, or by
copying the second UV set over the first on the mesh. Both are one line
engine-side and neither needs a second object, a second material, a second
texture or a second draw call. The whole cost in the file is one vec2 per
flag vertex — 55 vertices, 440 bytes.

WHAT THIS DISSOLVES. The ledger carried "the Jolly Roger is a plain black
flag" as an open item through the texture pass, with the blocker recorded as "a
skull is image work, not a procedural node graph, and nothing in the four
families can produce one". That is true and it is no longer a blocker: the
shot scars are painted into the atlas by exactly this technique. The device
is not worked around, it is drawn.

THE DEVICE IS DEFINED IN FLAG-LOCAL COORDINATES so that it is the same device
on every hull whatever that hull's flag measures: `u` runs 0 at the LUFF (the
hoist, against the staff) to 1 at the FLY, and `v` runs 0 at the FOOT to 1 at
the HEAD. Nothing in here knows how big a flag is.
"""

import math
from dataclasses import dataclass

from . import shiptype as st

# The second UV layer's name. It is created AFTER `UVMap` so that `UVMap`
# stays layer 0 — the glTF exporter writes a texture's `texCoord` from the UV
# layer INDEX, and a bake layer that is not index 0 makes one Blender material
# export as two glTF materials. That trap is recorded in the bake handoff and
# it is why the order is stated here rather than left to chance.
ALT_UV = "colours_alt"

JOLLY_ROGER = "jolly_roger"
ENSIGN = "ensign"


@dataclass(frozen=True)
class ColourState:
    """One state the colours can be in, and where the engine finds it."""

    key: str
    uv_layer: str
    texcoord: int
    device: bool      # does this state carry the painted device?
    why: str


STATES = (
    ColourState(
        JOLLY_ROGER, "UVMap", 0, True,
        "the earned colours. This is TEXCOORD_0 and therefore the state the "
        "asset is in when nothing switches it, because a pirate frigate with "
        "no device on its flag is the odd default, not the other way round",
    ),
    ColourState(
        ENSIGN, ALT_UV, 1, False,
        "the colours of a ship that has not earned the device: the national "
        "ensign she sails under until she runs up the black. The same cloth, "
        "the same weathering, the same baked wrinkles — it is a texel-for-"
        "texel copy of the flag's own island taken BEFORE the device goes on "
        "— and then that copy, and only that copy, is dyed into a red ensign. "
        "A ship that has not earned the colours reads as SOMETHING rather "
        "than as nothing",
    ),
)


def state(key: str) -> ColourState:
    for s in STATES:
        if s.key == key:
            return s
    raise ValueError(f"no colours state called {key!r}")


def device_state() -> ColourState:
    return next(s for s in STATES if s.device)


def ensign_state() -> ColourState:
    return next(s for s in STATES if not s.device)


def switchable_uv_sets(colours_object: str) -> dict:
    """{glTF TEXCOORD name: [the meshes allowed to carry it]}.

    `check_export` refuses any UV set the file carries that no texture
    samples. The ensign state's set is exactly that by construction — nothing
    in the file samples it, because the point is that the ENGINE chooses to.
    So it is declared here, by name and by mesh, rather than the check being
    widened to let any stray coordinate through.
    """
    return {f"TEXCOORD_{s.texcoord}": [colours_object]
            for s in STATES if s.texcoord != 0}


# --- where a point of the flag is, in flag-local coordinates -----------------


def flag_local(nu: int, nv: int, index: int) -> tuple:
    """(u, v) of flag vertex `index`, luff-to-fly and foot-to-head.

    The flag is emitted row by row from the HEAD of the staff downward —
    `wind.flag_grid` builds `for j in range(nv): for i in range(nu)` and
    `dressing._flag` consumes it in that order — so vertex `index` is column
    `index % nu` of row `index // nu`, and row 0 is the head. `v` is flipped
    so that 0 is the foot, which is how anyone describes a flag.
    """
    if not 0 <= index < nu * nv:
        raise IndexError(f"vertex {index} is not on a {nu}x{nv} flag")
    i, j = index % nu, index // nu
    return (i / (nu - 1), 1.0 - j / (nv - 1))


# --- the device --------------------------------------------------------------

# Bone white against black cloth, sRGB. Not pure white: a painted device on a
# flag that has been at sea is chalky and a little yellowed, and pure white
# against `palette.CANVAS_BLACK` reads as a decal rather than as paint.
DEVICE_COLOUR = (233, 228, 214)

# How far the device stands off the cloth, in metres.
#
# IT IS APPLIQUE, NOT PAINT, AND THE ATLAS DECIDED THAT. A painted device has
# no thickness worth a normal map, and at this texture budget that is the
# same as having none: the flag's island runs 36.9 texels to the metre, so a
# texel is 27 mm, and 3 mm of relief tilts the surface 6 degrees — against a
# cloth whose own baked wrinkle grain already tilts it 3.3. Measured, 3 mm
# moved the normal atlas by 0.028 against a grain of 0.029, which is a change
# nobody can see. 8 mm is white cloth sewn on with a rolled hem and a stitch
# line, which is how a real Jolly Roger was made, and it reads.
DEVICE_RELIEF = 0.008

# THE DEVICE IS LAID OUT IN A SQUARE, NOT OVER THE WHOLE FLAG. This frigate's
# colours measure 2.60 m on the fly by 1.55 m on the hoist, an aspect of
# 1.677, so a skull defined straight on the unit square would come out 1.6
# times wider than it is tall. The device therefore lives in its own square
# region `DEVICE_SIZE` of the HOIST on a side — 0.80 x 1.55 m = 1.24 m square
# here, which is 0.477 of the fly — and `device_coverage` maps flag
# coordinates into it using the flag's own aspect. Any hull whose flag is a
# different shape gets the same round skull.
DEVICE_SIZE = 1.02

# The soft edge, in units of the device's own square. The flag's island
# measures about 59 by 103 texels in the 1024 canvas atlas, so a texel is
# roughly 0.017 of the device square: a 0.012 edge is under a texel and reads
# as a clean line rather than a staircase.
SOFT = 0.012

# Everything below is measured in the device's own square, and every vertical
# figure carries `DEVICE_LIFT`: the skull is the top two thirds of the design
# and the bones the bottom third, so the shape drawn from these numbers alone
# sits low. The lift of 0.054 squares that up so it is centred in its own
# square.
#
# MEASURED, in flag coordinates, after the square and the lift are applied:
# the device spans 0.244 to 0.756 of the FLY and 0.137 to 0.863 of the HOIST,
# which on this frigate's 2.60 m by 1.55 m colours is 1.33 m by 1.13 m.
DEVICE_LIFT = 0.054

# The skull: cranium, jaw, and the three holes that make it a skull rather
# than a lump — two eye sockets and a nasal aperture — plus the gaps between
# the teeth.
# Scaled up 1.15 about the cranium's own centre after the first bake: at the
# original size the skull read small against bones that spread the width of
# the device. Everything below moved together, so the sockets stayed where
# they are in the face.
CRANIUM = (0.500, 0.655, 0.1553, 0.1495)    # cu, cv, ru, rv
JAW = (0.500, 0.5113, 0.1070, 0.0782)
EYES = ((0.4448, 0.6665, 0.0483, 0.0541), (0.5552, 0.6665, 0.0483, 0.0541))
NOSE = (0.500, 0.586, 0.0265, 0.0334)
# TWO gaps, and only across the LOWER half of the jaw. Three gaps running the
# jaw's full height cut it into four columns and the skull came out a
# mushroom on a stalk — the ASCII proof of that is in the ledger.
TEETH_US = (0.4735, 0.5265)
TEETH_V = (0.4308, 0.5285)
TEETH_R = 0.00805

# The crossbones, an X under the skull, crossing at (0.500, 0.330). Each bone
# is a capsule with two knuckle lobes at each end, which is what makes a bone
# read as a bone rather than as a stick. They spread wider than the skull is
# tall, which is what carries the design across a flag that is half again as
# long as it is deep.
BONE_A = ((0.125, 0.155), (0.875, 0.505))
BONE_B = ((0.125, 0.505), (0.875, 0.155))
BONE_R = 0.028
KNUCKLE_R = 0.035
KNUCKLE_OFF = 0.036


def _smoothstep(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3.0 - 2.0 * t)


def _ellipse(u: float, v: float, cu: float, cv: float,
             ru: float, rv: float) -> float:
    """Approximate signed distance to an ellipse: positive inside."""
    d = math.sqrt(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2)
    return (1.0 - d) * min(ru, rv)


def _capsule(u: float, v: float, a, b, r: float) -> float:
    """Approximate signed distance to a thick line segment: positive inside."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span <= 0.0 else ((u - ax) * dx + (v - ay) * dy) / span
    t = min(1.0, max(0.0, t))
    return r - math.hypot(u - (ax + dx * t), v - (ay + dy * t))


def _knuckles(a, b):
    """The two lobes at each end of a bone, as (centre, radius) pairs."""
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay) or 1.0
    nx, ny = -(by - ay) / length, (bx - ax) / length
    out = []
    for cx, cy in (a, b):
        for sign in (-1.0, 1.0):
            out.append(((cx + nx * KNUCKLE_OFF * sign,
                         cy + ny * KNUCKLE_OFF * sign), KNUCKLE_R))
    return out


def _solid(u: float, v: float) -> float:
    best = _ellipse(u, v, *CRANIUM)
    best = max(best, _ellipse(u, v, *JAW))
    for a, b in (BONE_A, BONE_B):
        best = max(best, _capsule(u, v, a, b, BONE_R))
        for centre, r in _knuckles(a, b):
            best = max(best, _ellipse(u, v, centre[0], centre[1], r, r))
    return best


def _hole(u: float, v: float) -> float:
    best = max(_ellipse(u, v, *eye) for eye in EYES)
    best = max(best, _ellipse(u, v, *NOSE))
    for cu in TEETH_US:
        best = max(best, _capsule(u, v, (cu, TEETH_V[0]), (cu, TEETH_V[1]),
                                  TEETH_R))
    return best


def flag_aspect(p=None) -> float:
    """The flag's fly divided by its hoist. The number the device is kept
    round by, read off the module that owns the flag rather than typed here."""
    from . import wind

    return wind.FLAG_FLY / wind.FLAG_HOIST


def device_square(u: float, v: float, aspect: float) -> tuple:
    """Flag coordinates to the device's own square. Both centred on the flag."""
    return (0.5 + (u - 0.5) * aspect / DEVICE_SIZE,
            0.5 + (v - 0.5) / DEVICE_SIZE)


def device_coverage(u: float, v: float, aspect: float) -> float:
    """How much of this point of the flag is painted device. 0..1.

    The holes cut the SKULL and the bones alike, which is deliberate: the
    bones pass behind the jaw, so a tooth gap that stopped at the skull's
    edge would show a bone through the skull's mouth.
    """
    s, t = device_square(u, v, aspect)
    t -= DEVICE_LIFT
    solid = _smoothstep(_solid(s, t) / SOFT + 0.5)
    hole = _smoothstep(_hole(s, t) / SOFT + 0.5)
    return solid * (1.0 - hole)


def device_height(u: float, v: float, aspect: float) -> float:
    """Metres the painted device stands off the cloth at this point."""
    return DEVICE_RELIEF * device_coverage(u, v, aspect)


def device_extent(aspect: float, samples: int = 128) -> tuple:
    """((u_lo, v_lo), (u_hi, v_hi)) of everything the device paints."""
    us, vs = [], []
    for i in range(samples):
        for j in range(samples):
            u, v = i / (samples - 1), j / (samples - 1)
            if device_coverage(u, v, aspect) > 0.5:
                us.append(u)
                vs.append(v)
    if not us:
        return ((0.0, 0.0), (0.0, 0.0))
    return ((min(us), min(vs)), (max(us), max(vs)))


def device_area(aspect: float, samples: int = 128) -> float:
    """Fraction of the flag the device covers. A sanity figure, not a target."""
    total = sum(device_coverage(i / (samples - 1), j / (samples - 1), aspect)
                for i in range(samples) for j in range(samples))
    return total / (samples * samples)


# --- the un-earned state: a national ensign ----------------------------------
#
# WHICH SHIP WEARS WHICH, AND WHY THAT IS A SHIP PROPERTY. Everything from
# here to the end of the Red Ensign's section is the FRIGATE'S ensign, and it
# was the only one there was: the four reasons below were argued and then the
# answer was hardcoded, which made the un-earned colours state a frigate
# detail inside a module whose own docstring calls it a ship-system rule.
#
# The argument is untouched. What is new is `shiptype.EnsignKind`, which the
# ship carries as `p.ensign`, and a second section further down for the
# galleon's CROSS OF BURGUNDY argued by these same four tests. The public
# functions at the bottom of the file take the kind and dispatch on it; there
# is NO DEFAULT, because a default here is how a frigate's flag becomes a fact
# about ships.
#
# WHICH ENSIGN, AND WHY THIS ONE. The British RED ENSIGN as it stood between
# the Union of 1707 and the Union of 1801: a plain red field with the first
# Union flag — St George's red cross fimbriated white over St Andrew's white
# saltire on blue — in the canton.
#
#   1. It is the flag this ship would actually have worn. The Red Ensign was
#      the ordinary maritime flag of a British merchantman and of the Red
#      Squadron both, which makes it right for a frigate-built hull whatever
#      she is up to.
#   2. It is the flag a pirate flew RIGHT UP TO THE MOMENT he ran up the
#      black. False colours were the whole method: you closed under a
#      national ensign and hoisted the device at pistol-shot. So "has not
#      earned the colours" maps onto "still wearing the ensign she was born
#      under", which is exactly the state the maintainer wants to read.
#   3. It reads at thumbnail size and from a cable's length. A solid red
#      field is about as far from a black flag as cloth gets, which is what
#      the distinctness measure in the bake wants, and it does not need the
#      player to recognise a device to know which state he is looking at.
#   4. The PRE-1801 union pins the period. No St Patrick's saltire, so no
#      Ireland, so 1707-1800 — the window the rest of this ship is drawn
#      from. The 1801 flag on a golden-age pirate would be an anachronism a
#      lot of people would catch.
#
# It is PAINTED, not procedural, so the four material families constrain
# nothing here: this is image work in the atlas, exactly as the skull is.
#
# Everything below is in FLAG-LOCAL coordinates, like the device: `u` runs 0
# at the luff to 1 at the fly, `v` runs 0 at the foot to 1 at the head. No
# hull's flag dimensions appear.

# The canton: the upper quarter at the HOIST, which is where every ensign in
# the world puts it. Half the hoist deep and half the fly long.
#
# NOT GIVEN THE UNION'S OWN 1:2 PROPORTION, deliberately. A true Union canton
# on this frigate's 2.60 m by 1.55 m colours would measure 1.55 m on the fly
# — 0.596 of the whole flag — and crowd the field out. The canton is the
# flag's own upper quarter instead and the union inside it is drawn to the
# canton's aspect, so the crosses stay square in METRES on any hull's flag.
ENSIGN_CANTON_FLY = 0.5
ENSIGN_CANTON_HOIST = 0.5

# Sea-worn bunting, sRGB, not flag-maker's ink. Madder red and indigo blue
# both fade hard in salt and sun, and a brand-new Pantone red against the
# weathered canvas everywhere else on this ship would read as a decal — the
# same reason `DEVICE_COLOUR` is bone and not white.
ENSIGN_RED = (154, 30, 38)
ENSIGN_BLUE = (28, 42, 84)
# The SAME pot as the skull. One bolt of bleached wool bunting made the
# device and the crosses alike, so there is one white on this ship.
ENSIGN_WHITE = DEVICE_COLOUR

# The union's bars, in fractions of the CANTON's own height. Standard Union
# proportions: St George's arms a fifth of the hoist, fimbriated a fifteenth
# each side, and St Andrew's arms a fifth of the hoist measured vertically at
# the canton's edge, which is how a flag loft specifies a saltire.
ENSIGN_CROSS_ARM = 0.20
ENSIGN_CROSS_FIMB = 1.0 / 15.0
ENSIGN_SALTIRE_ARM = 0.20

# The soft edge, in canton-height units. The flag's island runs 36.9 texels
# to the metre and the canton is half of a 1.55 m hoist, so a texel is
# 1 / (0.775 * 36.9) = 0.035 of the canton's height. This is 1.6 of them:
# still a sewn edge and not a staircase, and wide enough that the SEAM below
# — which lives inside this transition — always lands on a texel centre
# instead of falling between two. At one texel exactly it did not, and the
# normal map's reading came out thin.
ENSIGN_SOFT = 0.055

# HOW THICK THE ENSIGN IS, AND WHERE. The ensign is APPLIQUÉ, exactly as the
# skull is, and for the same reason: `DEVICE_RELIEF`'s ruling is that this
# atlas runs 36.9 texels to the metre, so a texel is 27 mm, and a step of
# 8 mm is as much tilt as it can carry before the slope stops meaning
# anything. Every sewn-on panel is one such step.
#
# TWO STEPS AND NOT THREE. The canton is a panel sewn onto the field; the
# union device — saltire, fimbriation and St George together — is a second
# sewn onto the canton. St George's red on the white backing it is cut
# against is a change of colour and not of thickness, so it is not a third.
# Three would put 24 mm of cloth under the middle of the cross.
#
# MEASURED, AND THIS IS WHY IT IS A STEP AND NOT A RIDGE. The first cut of
# this modelled a strip-sewn flag instead: one thickness throughout with a
# raised hem along each join. It reads 1.58 of the cloth's grain against the
# step's 1.86, and the reason is arithmetic rather than taste — the normal
# map takes a CENTRAL DIFFERENCE across two texels, and a hem narrower than
# that has the same height either side of its own crown, so the slope at the
# crown cancels to nothing. A ridge this atlas can see would have to be
# 60 mm of hem, which is not a hem.
ENSIGN_STEP = 0.008
ENSIGN_LAYERS = 2
# `ENSIGN_RELIEF` was `ENSIGN_STEP * ENSIGN_LAYERS` here. It is now
# `ensign_relief(kind)` at the bottom of the file, because the depth in
# panels is the DESIGN'S and only the step is the cloth's.


def canton_aspect(aspect: float) -> float:
    """The canton's own fly-over-hoist, from the flag's."""
    return aspect * ENSIGN_CANTON_FLY / ENSIGN_CANTON_HOIST


def canton_local(u: float, v: float) -> tuple:
    """Flag coordinates to canton coordinates. Inside the canton is 0..1."""
    return (u / ENSIGN_CANTON_FLY,
            (v - (1.0 - ENSIGN_CANTON_HOIST)) / ENSIGN_CANTON_HOIST)


def _band(x: float, half: float, soft: float) -> float:
    """A soft-edged stripe of half-width `half` centred on x = 0."""
    return _smoothstep((half - abs(x)) / soft + 0.5)


def _ensign_masks(u: float, v: float, aspect: float) -> tuple:
    """(canton, saltire, cross_white, cross_red), each 0..1.

    Every one of them is a mask WITHIN the canton; `canton` is what decides
    whether any of them is on the flag at all.
    """
    cu, cv = canton_local(u, v)
    ca = canton_aspect(aspect)
    # The canton's own outline. Half-widths in canton units are 0.5 each way;
    # the horizontal soft edge is divided by the aspect so the sewn edge is
    # the same width in metres all the way round.
    canton = _band(cu - 0.5, 0.5, ENSIGN_SOFT / ca) \
        * _band(cv - 0.5, 0.5, ENSIGN_SOFT)
    # St Andrew, corner to corner. The arm is specified by its VERTICAL
    # thickness, so the band is taken on `cv - cu`, which is vertical by
    # construction and therefore right on a canton of any aspect.
    half = ENSIGN_SALTIRE_ARM / 2.0
    saltire = max(_band(cv - cu, half, ENSIGN_SOFT),
                  _band(cv - (1.0 - cu), half, ENSIGN_SOFT))
    # St George. The upright's width in `cu` is divided by the canton's
    # aspect, which is the whole reason the cross comes out square in metres
    # rather than square in UV.
    arm = ENSIGN_CROSS_ARM / 2.0
    fimb = arm + ENSIGN_CROSS_FIMB
    cross_red = max(_band(cu - 0.5, arm / ca, ENSIGN_SOFT / ca),
                    _band(cv - 0.5, arm, ENSIGN_SOFT))
    cross_white = max(_band(cu - 0.5, fimb / ca, ENSIGN_SOFT / ca),
                      _band(cv - 0.5, fimb, ENSIGN_SOFT))
    return (canton, saltire, cross_white, cross_red)


def _mix(a, b, t: float) -> tuple:
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _red_ensign_colour(u: float, v: float, aspect: float) -> tuple:
    """The ensign's own colour at this point of the flag, sRGB 0..255.

    Blended in sRGB and not in linear light, because these are swatches of
    dyed bunting lying edge to edge — the soft edge is a sewn seam one texel
    wide, not two lights adding.
    """
    canton, saltire, cross_white, cross_red = _ensign_masks(u, v, aspect)
    out = ENSIGN_RED
    out = _mix(out, ENSIGN_BLUE, canton)
    out = _mix(out, ENSIGN_WHITE, canton * saltire)
    out = _mix(out, ENSIGN_WHITE, canton * cross_white)
    out = _mix(out, ENSIGN_RED, canton * cross_red)
    return out


def _red_ensign_layer(u: float, v: float, aspect: float) -> float:
    """How many panels of bunting are sewn up at this point, 0..ENSIGN_LAYERS.

    0 the bare red field, 1 the canton sewn onto it, 2 the union device —
    saltire, fimbriation and St George alike — sewn onto the canton.
    """
    canton, saltire, cross_white, cross_red = _ensign_masks(u, v, aspect)
    return canton * (1.0 + max(saltire, cross_white, cross_red))


def _ridge(mask: float) -> float:
    """1 in the middle of a soft edge, 0 on either side of it.

    A mask is 0 one side of a join and 1 the other, so it passes through 0.5
    exactly at the join: this turns the crossing into the seam.
    """
    return 4.0 * mask * (1.0 - mask)


def _red_ensign_seam(u: float, v: float, aspect: float) -> float:
    """How much of a sewn join runs through this point, 0..1.

    Every join in the design, and nothing between them: the canton's own
    outline against the field, and the saltire, the fimbriation and St
    George's cross against the canton. The canton's three inner joins are
    multiplied by the canton, because they do not exist out on the field.
    """
    canton, saltire, cross_white, cross_red = _ensign_masks(u, v, aspect)
    return max(_ridge(canton),
               canton * _ridge(saltire),
               canton * _ridge(cross_white),
               canton * _ridge(cross_red))


# --- the galleon's: the CROSS OF BURGUNDY ------------------------------------
#
# WHICH ENSIGN, AND WHY THIS ONE, by the Red Ensign's own four tests. The
# Cruz de Borgoña: a RAGGED red saltire — a pair of crossed, lopped branches —
# on a white field. No canton, no quartering, nothing else on the cloth.
#
#   1. It is the flag this ship would actually have worn. The Burgundy cross
#      came into Spanish service in 1506 with Philip the Handsome and stayed
#      the Spanish fighting flag through the whole Habsburg century and past
#      it. A galleon is a Spanish form of exactly that period.
#   2. It is false colours a pirate would close under for the same reason the
#      Red Ensign is: it is a NATIONAL ensign, not a squadron's, so a hull
#      wearing it is a hull nobody looks at twice.
#   3. It reads at thumbnail size, and harder than the frigate's does. The
#      un-earned state has to be told from a BLACK flag at a cable's length,
#      and a white field is the furthest from black that cloth goes — more
#      contrast than the Red Ensign's red, not less.
#   4. THE PERIOD IS PINNED, AND THIS IS THE REASON THE OTHER CANDIDATE IS
#      REFUSED. The 1785 red-yellow-red bicolour is what most people picture
#      as "the Spanish flag", and it postdates a galleon by about two hundred
#      years. The Red Ensign's own fourth reason refuses the 1801 Union on a
#      golden-age pirate as an anachronism an audience would catch; the
#      bicolour on a galleon is the same mistake an order of magnitude
#      larger.
#
# FLAG-LOCAL, like everything else here: `u` 0 at the luff to 1 at the fly,
# `v` 0 at the foot to 1 at the head, and no hull's flag dimensions appear.
#
# THE ARM'S THICKNESS IS NOT A NEW FIGURE. `ENSIGN_SALTIRE_ARM` is the fifth
# of the hoist a flag loft specifies for St Andrew, stated as a VERTICAL
# thickness so it comes out right on a field of any aspect, and a Burgundy
# saltire is specified the same way by the same trade. So this is that
# figure, named rather than retyped: 0.20 of a 1.55 m hoist is 0.310 m of
# cloth across each arm.
BURGUNDY_ARM = ENSIGN_SALTIRE_ARM

# THE SEWN EDGE, DERIVED FROM THE RED ENSIGN'S AND NOT CHOSEN. `ENSIGN_SOFT`
# 0.055 is in CANTON-height units, and the canton is `ENSIGN_CANTON_HOIST` of
# the flag's hoist, so the same seam measured in FLAG-HOIST units is the
# product of the two: 0.0275, which on a 1.55 m hoist is 42.6 mm — the 1.6
# texels the Red Ensign's note measured and ruled on, to the millimetre.
BURGUNDY_SOFT = ENSIGN_SOFT * ENSIGN_CANTON_HOIST

# HOW RAGGED. A ragged staff is a branch with its limbs lopped off, so each
# arm carries short stubs standing out past its own edge, alternating from
# one side to the other.
#
# HOW DEEP A STUB IS, AND WHY NOT LESS. `DEVICE_RELIEF`'s ruling is that this
# atlas runs 36.9 texels to the metre, so a texel is 27 mm. 0.08 of the hoist
# is 124 mm — 4.6 texels deep, and 2.9 times the sewn edge it has to stand
# clear of. At half that it is one texel past the seam's own shoulder and the
# saltire reads as plain.
BURGUNDY_KNOT = 0.08

# HOW MANY, PER EDGE PER ARM. An INTEGER, so the pattern closes at both
# corners instead of being cut through a stub at the fly end. Six stubs along
# an arm whose own length is sqrt(fly^2 + hoist^2) = 3.03 m puts one every
# 0.50 m, against a stub 0.12 m deep: a lopped branch rather than a comb.
BURGUNDY_KNOTS = 6
BURGUNDY_PITCH = 1.0 / BURGUNDY_KNOTS

# The field and the saltire. THE SAME TWO POTS the frigate's ensign is dyed
# from — one bolt of bleached wool bunting and one of madder red went round
# the fleet — so there is one white and one red on the ship, and the galleon
# brings no new swatch with her.
BURGUNDY_FIELD = ENSIGN_WHITE
BURGUNDY_RED = ENSIGN_RED

# ONE SEWN PANEL, where the Red Ensign has two. The saltire is appliqué on
# the field and nothing is appliqué on the saltire; the Red Ensign's canton
# is sewn on its field and its union device sewn on its canton.
BURGUNDY_LAYERS = 1


def _saw(x: float, soft: float) -> float:
    """A soft-edged square wave of period 1, 1 over the first half of it.

    Soft-edged in the SAME units as `x`, so a caller working along an arm
    hands in a softness already divided by the pitch.
    """
    frac = x - math.floor(x)
    return _band(frac - 0.25, 0.25, soft)


def _burgundy_arm(d: float, s: float, soft_s: float) -> float:
    """One ragged arm, 0..1. `d` is across it and `s` runs 0..1 along it.

    The arm is a band of half-width `BURGUNDY_ARM / 2` either side of `d = 0`,
    and each edge is pushed out by `BURGUNDY_KNOT` wherever a stub stands. The
    two edges are a HALF PITCH apart in phase, which is what lops the branch
    on alternate sides.

    Each edge is a one-sided smoothstep rather than `_band`'s symmetric pair,
    because the two edges are at different distances from the arm's centre
    wherever a stub stands on one of them alone.
    """
    half = BURGUNDY_ARM / 2.0
    head = half + BURGUNDY_KNOT * _saw(s / BURGUNDY_PITCH, soft_s)
    foot = half + BURGUNDY_KNOT * _saw(s / BURGUNDY_PITCH + 0.5, soft_s)
    return _smoothstep((head - d) / BURGUNDY_SOFT + 0.5) \
        * _smoothstep((foot + d) / BURGUNDY_SOFT + 0.5)


def _burgundy_saltire(u: float, v: float, aspect: float) -> float:
    """The whole ragged saltire, corner to corner, 0..1.

    THE ARM'S THICKNESS IS TAKEN VERTICALLY, on `v - u` and `v - (1 - u)`,
    which is how `_ensign_masks` takes St Andrew's and for the same reason: a
    band on that quantity is a band of a fixed VERTICAL thickness whatever
    the flag's aspect, which is what a flag loft specifies.

    The along-arm softness is derived from the sewn edge and the flag's own
    diagonal: `s` runs 0..1 over an arm sqrt(aspect^2 + 1) hoists long, so a
    seam `BURGUNDY_SOFT` of a hoist wide is that over the diagonal in `s`.
    """
    soft_s = BURGUNDY_SOFT / math.sqrt(aspect * aspect + 1.0) / BURGUNDY_PITCH
    return max(_burgundy_arm(v - u, (u + v) / 2.0, soft_s),
               _burgundy_arm(v - (1.0 - u), (u + 1.0 - v) / 2.0, soft_s))


def _burgundy_colour(u: float, v: float, aspect: float) -> tuple:
    return _mix(BURGUNDY_FIELD, BURGUNDY_RED,
                _burgundy_saltire(u, v, aspect))


def _burgundy_layer(u: float, v: float, aspect: float) -> float:
    return _burgundy_saltire(u, v, aspect)


def _burgundy_seam(u: float, v: float, aspect: float) -> float:
    return _ridge(_burgundy_saltire(u, v, aspect))


# --- the ensign, whichever one this ship wears -------------------------------
#
# NO DEFAULT KIND, deliberately. A default here is precisely how a frigate's
# flag became a fact about ships in the first place, and the galleon's three
# unpaintable sail patches and its main courses hanging through its own mast
# both came of a frigate's figure sitting in a shared module as though it
# were general. Every caller names the ship's own ensign.

_ENSIGN_COLOUR = {
    st.EnsignKind.RED_ENSIGN: _red_ensign_colour,
    st.EnsignKind.CROSS_OF_BURGUNDY: _burgundy_colour,
}
_ENSIGN_LAYER = {
    st.EnsignKind.RED_ENSIGN: _red_ensign_layer,
    st.EnsignKind.CROSS_OF_BURGUNDY: _burgundy_layer,
}
_ENSIGN_SEAM = {
    st.EnsignKind.RED_ENSIGN: _red_ensign_seam,
    st.EnsignKind.CROSS_OF_BURGUNDY: _burgundy_seam,
}
_ENSIGN_LAYERS = {
    st.EnsignKind.RED_ENSIGN: ENSIGN_LAYERS,
    st.EnsignKind.CROSS_OF_BURGUNDY: BURGUNDY_LAYERS,
}


def _drawer(table: dict, kind):
    try:
        return table[kind]
    except (KeyError, TypeError):
        raise ValueError(
            f"no ensign called {kind!r}; the ship's own is `p.ensign` and the "
            "kinds are `shiptype.EnsignKind`"
        ) from None


def ensign_kind(p):
    """The ensign THIS ship wears, read off the ship."""
    return p.ensign


def ensign_colour(u: float, v: float, aspect: float, kind) -> tuple:
    """This ensign's colour at this point of the flag, sRGB 0..255."""
    return _drawer(_ENSIGN_COLOUR, kind)(u, v, aspect)


def ensign_layer(u: float, v: float, aspect: float, kind) -> float:
    """How many panels of bunting are sewn up here, 0..`ensign_layers(kind)`."""
    return _drawer(_ENSIGN_LAYER, kind)(u, v, aspect)


def ensign_seam(u: float, v: float, aspect: float, kind) -> float:
    """How much of a sewn join runs through this point, 0..1."""
    return _drawer(_ENSIGN_SEAM, kind)(u, v, aspect)


def ensign_layers(kind) -> int:
    """How many panels deep this ensign is where it is thickest."""
    return _drawer(_ENSIGN_LAYERS, kind)


def ensign_relief(kind) -> float:
    """Metres of sewn bunting standing off the cloth at the thickest point.

    `ENSIGN_STEP` is shared: it is one bolt of bunting with one rolled hem,
    baked into one atlas at one texel density, so the step a panel makes is
    the same whichever design is cut from it. What differs is how many
    panels deep the design goes.
    """
    return ENSIGN_STEP * ensign_layers(kind)


def ensign_height(u: float, v: float, aspect: float, kind) -> float:
    """Metres of sewn bunting standing off the cloth at this point."""
    return ENSIGN_STEP * ensign_layer(u, v, aspect, kind)


# --- finding somewhere to park the second island -----------------------------


def free_rectangle(free, size: int, width: int, height: int) -> tuple:
    """The lowest, leftmost `width` x `height` block of `free` texels, or None.

    `free` is a flat row-major sequence of `size * size` truthy values, one
    per texel, true where nothing is using that texel. On this asset it comes
    straight from the bake's own MAGENTA SENTINEL mask, which is exact: a
    texel still holding the sentinel after the bake is a texel no island and
    no bake margin reached.

    Lowest-then-leftmost rather than best-fit, because the result has to be
    the same on every bake. A packer that chose by size would move the second
    island whenever an unrelated island changed, and the two states would
    stop being a texel-for-texel copy of each other.
    """
    if width <= 0 or height <= 0 or width > size or height > size:
        return None
    # Column runs: how many free texels run UP from each texel. Then a
    # rectangle exists at (x, y) when `width` consecutive columns all run at
    # least `height`. O(size^2) rather than O(size^2 * w * h).
    runs = [0] * (size * size)
    for y in range(size):
        base = y * size
        below = base - size
        for x in range(size):
            if free[base + x]:
                runs[base + x] = 1 + (runs[below + x] if y else 0)
    for y in range(height - 1, size):
        base = y * size
        count = 0
        for x in range(size):
            count = count + 1 if runs[base + x] >= height else 0
            if count >= width:
                return (x - width + 1, y - height + 1)
    return None
