"""The ship's paint scheme and the four material families. No bpy.

Which colour a strake is, which family an object belongs to, and where a wale
band starts and stops are facts about the SHIP. They are decided here under
plain pytest; `frigate.materials` only emits them into a node graph.

COLOUR REFERENCE, with both ends of every reading named
-------------------------------------------------------
Robert Gardiner, *The Heavy Frigate: Eighteen-Pounder Frigates Vol I*, jacket
plate (`914EOJpi6YL._AC_UF1000,1000_QL80_.jpg`, 996 x 1000 px). Three profile
draughts: Flora (top), Alcmene (middle), Lively (bottom). Every figure below is
a pixel reading off that file, named by panel and by the span it was taken
across. The monochrome `La-penelope.webp` is the weaker colour authority and
was not used for colour at all.

- OCHRE STRAKE: Lively, amidships at x=470 px, down the band from the rail cap
  (y=730 px) to the main wale (y=750 px): (235,199,113) at the top, (227,187,89)
  at the bottom. Adopted (231,193,101).
- BLACK WALE: Lively, amidships at x=430 px, across the wale from y=736 to
  y=746 px: darkest pixel (89,69,18). Panel-wide dark cluster over all three
  draughts is (72,72,60)..(84,72,24). ADOPTED DARKER, (34,28,18), and the
  reason is on the record: the reading is off a GLOSSY PRINTED JACKET
  photographed under a broad light, which lifts blacks everywhere — the same
  photograph puts the paper white at (255,244,228) rather than (255,255,255).
  A wale is painted black. This is the one adopted colour that is not the
  measurement, and it is darker than the measurement, not lighter.
- BLUE TRIM: Alcmene, at x=500 px, across the inboard bulwark band from y=536
  to y=544 px: (94,134,146); panel-wide blue cluster (72,108,144)..(60,96,132).
  Adopted (66,102,140).
- BOTTOM (below the boot top): Lively, amidships at x=470 px, from the boot top
  (y=766 px) down to the garboard (y=830 px): (213,175,139) at the top,
  (208,148,114) at the bottom. Adopted (205,150,110).

The draughts are hull profiles and say nothing about canvas, cordage, deck or
ironwork. Those four are the project's own judgement and are marked as such.
"""

Rgb = tuple[float, float, float]

# --- measured, in 8-bit sRGB exactly as read off the plate -------------------
OCHRE_STRAKE = (231, 193, 101)
BLACK_WALE = (34, 28, 18)
BLUE_TRIM = (66, 102, 140)
BOTTOM = (205, 150, 110)

# --- not in the reference: the project's own judgement -----------------------
SPAR_TIMBER = (186, 152, 104)     # scraped and oiled pine, masts and yards
CARVING_GILT = (206, 170, 92)     # figurehead and stern carving, picked out
DECK_PLANK = (178, 160, 131)      # holystoned oak, pale and dry
DECK_SEAM = (46, 42, 38)          # oakum and pitch in the seam
FITTING_TIMBER = (139, 112, 79)   # capstan, bitts, barrels: darker, oiled
CANVAS_CLOTH = (196, 186, 162)    # weathered flax
CANVAS_PATCH = (150, 139, 118)    # a patch is older cloth than the sail it is on
CANVAS_BLACK = (28, 26, 26)       # the Jolly Roger
HEMP_ROPE = (124, 100, 66)
BLACK_IRON = (46, 46, 48)
GLAZING = (24, 31, 31)            # stern gallery glass, dark and glossy

# Weathering is authored procedurally in the node graph; this is only the colour
# it drifts TOWARDS. Salt, sun and rain grey timber and canvas alike.
WEATHERED_GREY = (122, 118, 110)


def srgb_to_linear(c: tuple[int, int, int]) -> Rgb:
    """8-bit sRGB to linear scene-referred, which is what a shader socket wants.

    Setting a measured sRGB triple straight onto a Base Color socket is the
    commonest way a reference-matched palette comes out washed out: 0.906 as a
    linear value is not the ochre that 231/255 names.
    """
    out = []
    for v in c:
        if not 0 <= v <= 255:
            raise ValueError(f"sRGB channel out of range: {c}")
        s = v / 255.0
        out.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2])


# --- the four families -------------------------------------------------------
#
# Spec section 8 asks for four and four is what the frigate ships: one
# texture set each. A family for the glazing would be an atlas for the sake
# of five faces of glass, so the stern gallery glazing is shaded INSIDE the
# hull timber graph, switched by a face attribute, and baked into the hull
# timber atlas. A ship with a beakhead deck carries a fifth, `GRATING`
# below, because its holes are an alpha cut no other family should carry.

HULL_TIMBER = "hull_timber"
DECK_PLANKING = "deck_planking"
CANVAS = "canvas"
ROPE_IRON = "rope_iron"
FAMILIES = (HULL_TIMBER, DECK_PLANKING, CANVAS, ROPE_IRON)

# A FIFTH FAMILY, AND ONLY ON A SHIP THAT HAS A BEAKHEAD DECK. The maintainer ruled
# the beakhead deck's floor a GRATING drawn as an alpha-masked card
# (2026-10-05), and the controller's R6 gives the cards a family of their
# own: an alpha cut put into the deck planking's graph would carry its
# albedo atlas to PNG for the sake of a square metre of grating. The frigate
# has no beakhead deck, so `families` hands her the four above verbatim and
# her material count, atlas count and check_all keys do not move.
GRATING = "grating"
ALL_FAMILIES = FAMILIES + (GRATING,)


def families(p) -> tuple:
    """The material families THIS ship builds, bakes and exports."""
    if p.head_form.beakhead_deck:
        return FAMILIES + (GRATING,)
    return FAMILIES

# The family's half of a material's name. THE SHIP'S OWN NAME IS THE OTHER
# HALF, and it used to be the word "Frigate" typed here — which is the same
# defect class as `wind.SAIL_FWD = 0.45`: a frigate's name written down as a
# fact about ships. Blender's `bpy.data.materials` is keyed by name and global
# to the .blend, so one name for two ships is not merely mislabelled, it is
# ONE MATERIAL: building the galleon's canvas would have rewritten the
# frigate's node graph under her.
_MATERIAL_SUFFIX = {
    HULL_TIMBER: "HullTimber",
    DECK_PLANKING: "DeckPlanking",
    CANVAS: "Canvas",
    ROPE_IRON: "RopeIron",
    GRATING: "Grating",
}


def material_names(p) -> dict:
    """{family: the material name THIS ship's objects carry}.

    `Frigate_Canvas` for the frigate, to the letter, because that name is in a
    `.blend` and a `.glb` that have shipped; `Galleon_Canvas` for the galleon.
    """
    return {family: f"{p.collection}_{_MATERIAL_SUFFIX[family]}"
            for family in families(p)}


def atlas_stem(p, family: str, kind: str) -> str:
    """The file-name stem of one baked atlas, with no directory and no suffix.

    `frigate_canvas_albedo`, `galleon_canvas_albedo`. Every ship's atlases
    live in the same `build/textures/`, so the ship's own name has to be in
    the file name or the second ship baked overwrites the first.
    """
    if family not in _MATERIAL_SUFFIX:
        raise KeyError(f"no material family called {family!r}")
    return f"{p.asset_stem}_{family}_{kind}"

_EXACT = {
    # hull timber: everything the shipwright built out of oak and pine
    "Hull": HULL_TIMBER, "Bulwarks": HULL_TIMBER, "Transom": HULL_TIMBER,
    "Stern_Gallery": HULL_TIMBER, "Stern_Carving": HULL_TIMBER,
    "Rails": HULL_TIMBER, "Channels": HULL_TIMBER, "Headrails": HULL_TIMBER,
    "Rudder": HULL_TIMBER,
    "Beakhead": HULL_TIMBER, "Figurehead": HULL_TIMBER, "Damage": HULL_TIMBER,
    "Masts": HULL_TIMBER, "Bowsprit": HULL_TIMBER,
    "Tops": HULL_TIMBER,
    # A CASTLE SHIP'S TIERS. A galleon's castles are the frigate's bulwark
    # carried up in steps: each one a twin-skin oak wall standing on the rail
    # below it. `Bulwarks` is hull timber wearing the painted livery, so the
    # three tiers standing on it are the same timber wearing the same paint.
    # The frigate declares no castle tier and emits none of these.
    "Castle_Forecastle": HULL_TIMBER, "Castle_Quarter": HULL_TIMBER,
    "Castle_Poop": HULL_TIMBER,
    # A TWO-DECKER'S CEILING: the inner planking of the side between her
    # lower gun deck and the gun deck over it, pierced for the lower row.
    # The bulwark's inner skin carried down, so the same timber and paint.
    "Ceiling_Lower": HULL_TIMBER,
    # A LATEEN YARD. It is a yard, scraped and oiled like every other spar.
    # It is named for its mast rather than `Yard_nn` because there is exactly
    # one of it, which is the only reason the `Yard_` prefix below did not
    # already catch it.
    "Lateen_Mizzen": HULL_TIMBER,
    # A GAFF AND A BOOM, spars like the rest and named for their mast for the
    # lateen yard's reason. The sloop's one mast is her main; a schooner's
    # foremast sets a gaff too.
    "Gaff_Main": HULL_TIMBER, "Boom_Main": HULL_TIMBER,
    "Gaff_Fore": HULL_TIMBER, "Boom_Fore": HULL_TIMBER,
    # deck planking: what is walked on, and the fittings standing on it
    "Deck_Main": DECK_PLANKING, "Deck_Forecastle": DECK_PLANKING,
    "Deck_Quarter": DECK_PLANKING, "Deck_Poop": DECK_PLANKING,
    # the lower gun deck, inside the hull
    "Deck_Lower": DECK_PLANKING,
    # the chase platform under a galleon's stern chasers: planked like a deck
    "Chase_Platform": DECK_PLANKING,
    "Gratings": DECK_PLANKING,
    # The galleon's beakhead deck: its frame timbers, the oak of the decks.
    "Beakhead_Deck": DECK_PLANKING,
    # Its floor: the alpha-masked grating cards, a family of their own.
    "Beakhead_Grating": GRATING,
    "Deck_Furniture": DECK_PLANKING, "Wheel": DECK_PLANKING,
    # canvas
    "Sails": CANVAS, "Sail_Patches": CANVAS, "Jolly_Roger": CANVAS,
    # rope and ironwork
    "Rigging": ROPE_IRON, "Chainplates": ROPE_IRON,
}

_PREFIX = {
    "PortLid_": HULL_TIMBER,
    "Yard_": HULL_TIMBER,
    "Barrel_": DECK_PLANKING,
    "Cannon_": ROPE_IRON,
    "Anchor_": ROPE_IRON,
    "Lantern_": ROPE_IRON,
}


# --- the owner's colours: plain, white, and each a material of its own --------
#
# The pennant, the hull stripe and the sail band (`frigate.owner`) belong to
# NO baked family.
# The game tints a part by multiplying its material's base colour after it has
# merged the file by material, so each wears a plain white material nothing
# else shares, with no atlas: white times the owner's colour is that colour.

TINT_BASE = (255, 255, 255)
_TINTED_SUFFIX = {"Pennant": "Pennant", "Hull_Stripe": "HullStripe",
                  "Sail_Band": "SailBand"}


def is_tinted(name: str) -> bool:
    """Is this object one of the owner's tinted parts, with no family?"""
    return name in _TINTED_SUFFIX


def tinted_material_names(p) -> dict:
    """{tinted part: the material name THIS ship's part carries}."""
    return {part: f"{p.collection}_{suffix}"
            for part, suffix in _TINTED_SUFFIX.items()}


def material_of(p, name: str) -> str:
    """The material name an object of this ship wears: its family's, or
    its own if it is a tinted part."""
    if is_tinted(name):
        return tinted_material_names(p)[name]
    return material_names(p)[family_of(name)]


def family_of(name: str) -> str:
    """Which material family an object belongs to. Raises on anything unknown.

    Deliberately total and deliberately loud. A silent default would hand an
    unrecognised object the hull's material and ship it, and an object with no
    material at all bakes as nothing — which is the exact failure the project's
    Review Focus names.
    """
    if name in _EXACT:
        return _EXACT[name]
    for prefix, family in _PREFIX.items():
        if name.startswith(prefix) and name[len(prefix):].isdigit():
            return family
    raise KeyError(
        f"no material family for object {name!r}; add it to frigate.palette "
        "rather than letting it bake untextured"
    )


# --- the sub-look within a family -------------------------------------------
#
# One material per family, so the variation inside a family is carried by a
# per-vertex float attribute the graph switches on. The numbers are the
# attribute values and the graph compares against these same constants.

LOOK_ATTRIBUTE = "look"

LOOK = {
    # hull timber
    "livery": 0.0,    # painted: ochre strakes, black wales, blue inboard
    "spar": 1.0,      # scraped timber: masts, yards, bowsprit, tops
    "carving": 2.0,   # picked out: figurehead
    # deck planking
    "deck": 0.0,
    "fitting": 1.0,
    # canvas
    "sail": 0.0,
    "patch": 1.0,
    "colours": 2.0,   # the Jolly Roger, which is black
    # rope and ironwork
    "hemp": 0.0,
    "iron": 1.0,
    # gratings
    "grating": 0.0,
}

_LOOK_OF = {
    "Masts": "spar", "Bowsprit": "spar", "Tops": "spar",
    "Lateen_Mizzen": "spar",
    "Figurehead": "carving", "Stern_Carving": "carving",
    "Gratings": "fitting", "Deck_Furniture": "fitting", "Wheel": "fitting",
    "Sail_Patches": "patch", "Jolly_Roger": "colours",
    "Chainplates": "iron",
}
_LOOK_PREFIX = {
    "Yard_": "spar",
    "Barrel_": "fitting", "Cannon_": "iron", "Anchor_": "iron",
    "Lantern_": "iron",
}
_FAMILY_DEFAULT_LOOK = {
    HULL_TIMBER: "livery", DECK_PLANKING: "deck",
    CANVAS: "sail", ROPE_IRON: "hemp", GRATING: "grating",
}


def look_of(name: str) -> str:
    """The sub-look an object wears inside its family, by name."""
    family_of(name)   # raises on an unknown object before anything else
    if name in _LOOK_OF:
        return _LOOK_OF[name]
    for prefix, look in _LOOK_PREFIX.items():
        if name.startswith(prefix) and name[len(prefix):].isdigit():
            return look
    return _FAMILY_DEFAULT_LOOK[family_of(name)]


def look_value(name: str) -> float:
    return LOOK[look_of(name)]


def wears_livery(name: str) -> bool:
    """Does this object carry the painted hull scheme?

    Only the planking does. A mast banded black at the height a wale happens to
    cross it is how a height-driven paint scheme goes wrong, and it is why the
    livery is switched on by object rather than applied to everything in the
    family.
    """
    return family_of(name) == HULL_TIMBER and look_of(name) == "livery"


# --- where the bands are -----------------------------------------------------
#
# The wales follow the SHEER: they are strakes, and a strake runs parallel to
# the deck edge, rising at bow and stern with it. So they are placed in
# SHEER-RELATIVE height h = z - sheer(y), with h = 0 at the deck edge.
#
# The boot top does NOT follow the sheer. It follows the WATERLINE, which is
# flat, so it is placed in absolute z. Two coordinates, because the ship has
# two different horizontals and a scheme driven off one of them alone puts the
# boot top up the stem.

CAP_BAND = 0.22        # m of bulwark below the cap, painted black with the rail
MAIN_WALE = (-0.80, -0.20)   # m of h: the wale the channels bolt to
BOOT_TOP = (-0.25, 0.35)     # m of absolute z: the black band at the waterline

BANDS = ("bottom", "boot_top", "cap_band", "blue_trim", "main_wale",
         "lower_wale", "ochre_strake")

BAND_COLOUR = {
    "bottom": BOTTOM,
    "boot_top": BLACK_WALE,
    "cap_band": BLACK_WALE,
    "blue_trim": BLUE_TRIM,
    "main_wale": BLACK_WALE,
    "lower_wale": BLACK_WALE,
    "ochre_strake": OCHRE_STRAKE,
}


def _row_lines(p) -> tuple[float, float, float]:
    """(HULL-ROW SILL, HULL-ROW HEAD, lowest BULWARK-ROW SILL), each in m
    of h, SHEER-relative: the serving deck's rise plus the row's own
    figure, which is how the cut and the bands both follow the sheer."""
    hull = [d for d in p.gun_decks if d.host == "hull"]
    wall = [d for d in p.gun_decks if d.host == "bulwark"]
    if not hull or not wall:
        raise ValueError(
            "wales between the rows need a row in the hull and one in the "
            "bulwark above it")
    sill = min(p.tier(d.served_by).rise + d.sill for d in hull)
    head = max(p.tier(d.served_by).rise + d.head for d in hull)
    w_sill = min(p.tier(d.served_by).rise + d.sill for d in wall)
    return sill, head, w_sill


def wale_clearance(p) -> float:
    """HULL-ROW HEAD to MAIN WALE BOTTOM, which is also MAIN WALE TOP to
    WAIST-ROW SILL and LOWER WALE TOP to HULL-ROW SILL: the side between
    the rows less one wale depth (the frigate's, MAIN_WALE's), halved."""
    _sill, head, w_sill = _row_lines(p)
    depth = MAIN_WALE[1] - MAIN_WALE[0]
    clear = (w_sill - head - depth) / 2.0
    if clear <= 0.0:
        raise ValueError(
            f"HULL-ROW HEAD {head:.2f} to WAIST-ROW SILL {w_sill:.2f} is "
            f"too little side for a {depth:.2f} m wale between them")
    return clear


def wale_bands(p) -> tuple:
    """(name, lo, hi) per black wale, m of h (SHEER-relative).

    The frigate's one band, `MAIN_WALE`, verbatim, unless the ship's
    `livery_form` puts her wales BETWEEN her rows (the maintainer's third ruling,
    C): then a MAIN WALE centred between the hull row's head and the
    waist row's sill, and a LOWER WALE the same `wale_clearance` under
    the hull row's sill, each the frigate's wale depth.
    """
    if not p.livery_form.wales_between_rows:
        return (("main_wale",) + MAIN_WALE,)
    sill, head, _w_sill = _row_lines(p)
    depth = MAIN_WALE[1] - MAIN_WALE[0]
    clear = wale_clearance(p)
    lo = head + clear
    return (("main_wale", lo, lo + depth),
            ("lower_wale", sill - clear - depth, sill - clear))


def livery_band(h: float, z: float, bulwark_h: float, inboard: bool,
                wales: tuple | None = None) -> str:
    """Which band of the paint scheme a point is in.

    `h` is height above the deck edge (sheer-relative), `z` is absolute height
    above the waterline, `inboard` is whether the surface faces the centreline.
    `wales` is the ship's `wale_bands`; None is the frigate's one band.
    The order of the tests IS the scheme and the node graph mixes in exactly the
    reverse of it, so that the later a band is tested here the later it is mixed
    there and the two agree by construction.
    """
    if bulwark_h <= CAP_BAND:
        raise ValueError(
            f"a {bulwark_h} m bulwark cannot carry a {CAP_BAND} m cap band"
        )
    if z < BOOT_TOP[0]:
        return "bottom"
    if z <= BOOT_TOP[1]:
        return "boot_top"
    if h >= bulwark_h - CAP_BAND:
        return "cap_band"
    if inboard and h > 0.0:
        return "blue_trim"
    for name, lo, hi in (wales or (("main_wale",) + MAIN_WALE,)):
        if lo <= h <= hi:
            return name
    return "ochre_strake"


# --- surface response --------------------------------------------------------
#
# Roughness per family, (clean, worn): the graph drives between the two with the
# same noise that drives the albedo weathering, so a patch of surface that has
# gone grey has also gone rough. Metallic is 0 everywhere but the ironwork.

ROUGHNESS = {
    HULL_TIMBER: (0.55, 0.88),
    DECK_PLANKING: (0.68, 0.94),
    CANVAS: (0.82, 0.96),
    ROPE_IRON: (0.45, 0.85),
    GRATING: (0.68, 0.94),       # the deck planking's: the same oak, walked on
}
GLAZING_ROUGHNESS = 0.08
IRON_METALLIC = 0.85

# The canvas and the rigging ribbons are single-sided sheets. Two-sidedness is
# not a shading nicety here: nine sails and 741 rope ribbons DISAPPEAR from one
# side without it, and the glTF exporter writes `doubleSided` from exactly this
# flag being off.
DOUBLE_SIDED = (CANVAS, ROPE_IRON, HULL_TIMBER, DECK_PLANKING, GRATING)

# The rigging ribbons are 2-triangle flat quads standing in for rope. Without an
# alpha cut they read as flat tape. BAKE_UV must be layer 0 on every mesh and
# ROPE_UV layer 1: the glTF exporter writes a texture's `texCoord` from the UV
# layer INDEX, so with the rope layer first the rigging's textures came out
# pointing at TEXCOORD_1 and the same Blender material exported as TWO glTF
# materials — correct, and one more material than the ship has. The cut is taken across the ribbon's WIDTH,
# in the second UV layer `rigging.py`'s vertex order makes it possible to write.
BAKE_UV = "UVMap"
ROPE_UV = "rope_width"
ROPE_ALPHA_CUT = 0.22   # fraction of the ribbon's half-width cut away each side


def rope_alpha(u: float) -> float:
    """Alpha across a rigging ribbon, u running 0..1 across its width.

    Hard edges, not a gradient: a baked alpha ramp on a 45 mm ribbon is two
    texels wide and reads as a smear. A cut reads as rope.
    """
    return 0.0 if u < ROPE_ALPHA_CUT or u > 1.0 - ROPE_ALPHA_CUT else 1.0


def rope_round_offset(u: float) -> float:
    """How far a point across the ribbon stands proud, as a fraction of width.

    A flat quad with a circular normal profile baked into it reads as a round
    rope from any angle a game camera will use. Zero at the cut edges, one at
    the centre line.
    """
    span = 1.0 - 2.0 * ROPE_ALPHA_CUT
    if span <= 0.0:
        raise ValueError("the alpha cut has eaten the whole ribbon")
    t = (u - ROPE_ALPHA_CUT) / span
    if t <= 0.0 or t >= 1.0:
        return 0.0
    return (1.0 - (2.0 * t - 1.0) ** 2) ** 0.5


# --- the grating's mask ------------------------------------------------------
#
# A grating is a square lattice of bars with square holes between. BOTH
# ENDPOINTS: GRATING_PITCH runs from one bar's near edge to the next bar's
# near edge, GRATING_BAR from one bar's near edge to its own far edge, both
# along the card in metres, the same both ways.
#
# 0.10 m pitch, 0.04 m bar, so a 0.06 m hole. The reason: a ship's grating
# is laid so a heel cannot go through it -- holes of two to three inches
# between bars of about an inch and a half -- and at the 1024 atlas the
# beakhead's cards are baked into, a 0.04 m bar is several texels wide
# rather than one, which is what keeps it from shimmering out at distance.
GRATING_PITCH = 0.10
GRATING_BAR = 0.04


def grating_alpha(a: float, b: float) -> float:
    """Alpha at (a, b) metres along the card's two axes: 1 on a bar, 0 in a
    hole. Hard edges, as `rope_alpha`, for the same reason."""
    on_a = (a % GRATING_PITCH) < GRATING_BAR
    on_b = (b % GRATING_PITCH) < GRATING_BAR
    return 1.0 if on_a or on_b else 0.0
