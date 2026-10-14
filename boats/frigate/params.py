"""Ship parameters. Pure data — imports no bpy, so it is testable off-Blender.

`ShipParams` is the ship SYSTEM's parameter object: the hull's principal
dimensions, plus the four things that differ most between a frigate, a
galleon, a schooner and a man-o-war and that used to be module constants —
the battery (`gun_decks`, PLURAL), the walking surfaces (`deck_tiers`,
plural), the rig (`rig`, a `shiptype.RigPlan`) and the stern castle
(`gallery_windows`).

`FrigateParams` is the first ship type expressed in it, and its numbers are
frozen: they are measured off the reference painting and verified by
twenty-two in-Blender checks. A second hull is a second subclass, never an
edit to this one.
"""

from dataclasses import dataclass, field, replace

from . import shiptype as st
from .budget import (FLUTE_BUDGET, FRIGATE_BUDGET, GALLEON_BUDGET,
                     SLOOP_BUDGET, Budget)


@dataclass
class ShipParams:
    """Principal dimensions and the ship-type plan. All lengths in metres."""

    loa: float = 38.0          # length overall, hull only, excludes bowsprit
    lwl: float = 32.0          # length at waterline
    beam: float = 10.2         # maximum beam
    draft: float = 4.5         # keel below waterline
    deck_z: float = 2.7        # main deck edge above waterline, amidships
    bow_rise: float = 1.2      # sheer rise at the stem, above deck_z
    stern_rise: float = 0.9    # sheer rise at the transom, above deck_z
    max_beam_t: float = 0.42   # station of maximum beam, measured from the stem

    keel_half: float = 0.18    # half-width of the keel timber
    n_stations: int = 24       # transverse sections along the length
    pts_per_half: int = 14     # ring points from keel to sheer, one side
    bulwark_h: float = 1.6       # rail top above the deck edge at that station
    bulwark_thick: float = 0.18  # bulwark timber thickness, outer face to inner
    deck_camber: float = 0.22    # deck crown at the centreline, in metres
    plank_thick: float = 0.12    # deck plank thickness

    # --- the ship-type plan -------------------------------------------------
    #
    # Every field below was a module constant somewhere before the system
    # existed. They are declared here with no default a ship could inherit by
    # accident: a subclass states its own battery, decks and rig or it gets
    # the frigate's, which would be a silent wrong answer rather than a loud
    # missing one. `ShipParams` itself is never instantiated for a build.

    gun_decks: tuple[st.GunDeck, ...] = ()
    deck_tiers: tuple[st.DeckTier, ...] = ()
    rig: st.RigPlan | None = None
    hull_form: st.HullForm = field(default_factory=st.HullForm)
    head_form: st.HeadForm = field(default_factory=st.HeadForm)
    stern_form: st.SternForm = field(default_factory=st.SternForm)
    rail_form: st.RailForm = field(default_factory=st.RailForm)
    # WHERE HER FITTINGS STAND and HOW HER SCARS KEEP OFF HER PORTS. Both
    # default to the frigate's, verbatim (`profiles.FURNITURE` and the
    # 1.4 m port-column band), and a ship measured otherwise states hers.
    furniture_plan: st.FurniturePlan = field(
        default_factory=st.FurniturePlan)
    damage_form: st.DamageForm = field(default_factory=st.DamageForm)
    # WHERE HER WALES ARE PAINTED. The frigate's one band by default.
    livery_form: st.LiveryForm = field(default_factory=st.LiveryForm)
    # WHERE HER HULL STRIPE, in her owner's colour, runs (`frigate.owner`).
    # The frigate's main wale by default.
    stripe_form: st.StripeForm = field(default_factory=st.StripeForm)

    # WHICH CARVING STANDS ON THE STEM HEAD. Not cosmetic and not a material:
    # the head rails die into the figure's own bounding box, so the carving
    # is a structural landmark of the head. `frigate.carving` dispatches on
    # this name and raises on one it does not know, rather than silently
    # giving a galleon a Roman goddess.
    figurehead: str = "minerva"
    # The national colours she wears until the player earns the black. A SHIP
    # PROPERTY, because which flag a hull flew is a fact about that hull's
    # navy and century and not about flags; see `shiptype.EnsignKind`.
    # None is NO national colours: her flag has the one state, the device,
    # and no switchable second state (`colours.states_of`).
    ensign: st.EnsignKind | None = st.EnsignKind.RED_ENSIGN

    chase_ports: int = 2         # stern chasers, cut in the transom
    # CARRIAGE FLOOR to BARREL AXIS, for every gun: the cannon is ONE shared
    # mesh, so this is one figure per ship. The frigate's 0.83 is
    # `profiles.GUN_TRUNNION_H`, verbatim, and puts her barrels within
    # 0.06 m of their port centres; a ship whose sills stand higher over
    # her decks states her own (tests/test_galleon_battery.py).
    gun_trunnion_h: float = 0.83
    gallery_windows: int = 5     # glazed panes across the stern gallery
    # HOW MUCH OF THE CANVAS ATLAS her canvas is packed into, from its
    # corner. 1.0 is the whole square, the frigate's and the galleon's, and
    # leaves the bake to find room for the ensign's second state in what the
    # pack left over. A ship whose canvas packs the square full states less,
    # and the strip left over takes the ensign: see `bake.unwrap_all`.
    canvas_pack: float = 1.0

    # The Blender collection this hull is built into, and how far down the
    # pipeline it is built. `passes` of None means "every pass that exists",
    # which is what a finished ship wants; a hull still being proportioned
    # names the passes it HAS, so a half-built ship is a stated fact rather
    # than a pipeline that quietly fell over partway.
    collection: str = "Ship"
    passes: tuple[str, ...] | None = None

    # HER OWN TRIANGLE BUDGET: lines, target and ceiling. No default a ship
    # could inherit by accident, on the same argument as the plan above: a
    # hull judged against another hull's lines is a silent wrong answer, and
    # `budget.budget_of` refuses a ship that declares none.
    budget: Budget | None = None

    # --- derived ------------------------------------------------------------

    @property
    def asset_stem(self) -> str:
        """The ship's own name, as a file and material stem: `frigate`.

        EVERY ASSET THIS SHIP WRITES IS NAMED OFF THIS, and the reason is a
        defect that would have destroyed a deliverable. `bake._save` wrote
        `build/textures/frigate_{family}_{kind}` and `export` wrote
        `build/frigate.glb`, whatever ship was in the scene — so baking the
        galleon would have overwritten the frozen frigate's four shipped
        atlases and her `.glb` with the galleon's. The collection name is the
        one name a ship already has to have, and lower-casing it reproduces
        the frigate's existing file names to the letter.
        """
        return self.collection.lower()

    @property
    def half_beam(self) -> float:
        return self.beam / 2.0

    @property
    def half_loa(self) -> float:
        return self.loa / 2.0

    def tier(self, name: str) -> st.DeckTier:
        for t in self.deck_tiers:
            if t.name == name:
                return t
        raise KeyError(
            f"no deck tier named {name!r}; this ship has "
            f"{tuple(t.name for t in self.deck_tiers)}"
        )

    def raised_tiers(self) -> tuple[st.DeckTier, ...]:
        """Every platform standing above the gun deck, forward to aft.

        A frigate has two — forecastle and quarterdeck. A galleon adds a poop.
        Nothing downstream may assume the count.
        """
        return tuple(sorted((t for t in self.deck_tiers if t.rise > 0.0),
                            key=lambda t: t.t0))

    # Every one of the four hulls has a forecastle and a quarterdeck, so these
    # two stations keep a name of their own. The GENERALISATION is
    # `deck_tiers`: a ship with a poop declares a third tier and the deck pass,
    # the rail pass and the furniture layout all pick it up without a new
    # field here. These are shorthand for two tiers that happen to be
    # universal, not the fixed pair they replaced.
    @property
    def fcastle_t(self) -> float:
        return self.tier("Deck_Forecastle").t1

    @property
    def fcastle_rise(self) -> float:
        return self.tier("Deck_Forecastle").rise

    @property
    def quarter_t(self) -> float:
        return self.tier("Deck_Quarter").t0

    @property
    def quarter_rise(self) -> float:
        return self.tier("Deck_Quarter").rise

    def builds(self, label: str) -> bool:
        """Does this ship run the build pass called `label`?

        `passes` of None means every pass that exists, which is what a
        finished ship wants. A hull still being proportioned names the passes
        it HAS, and a later pass that needs an earlier one's output asks this
        rather than discovering the absence as a KeyError four frames down.
        """
        return self.passes is None or label in self.passes

    def with_(self, **kwargs) -> "ShipParams":
        """A copy with fields replaced, keeping the ship type."""
        return replace(self, **kwargs)

    # --- validation ---------------------------------------------------------

    def validate(self) -> None:
        """Raise ValueError on parameters that would emit NaN or inverted geometry."""
        for name in ("loa", "lwl", "beam", "draft"):
            value = getattr(self, name)
            if value <= 0:
                raise ValueError(f"{name} must be positive, got {value}")
        if not 0.0 < self.max_beam_t < 1.0:
            raise ValueError(f"max_beam_t must lie strictly inside (0, 1), got {self.max_beam_t}")
        if self.n_stations < 4:
            raise ValueError(f"n_stations must be at least 4, got {self.n_stations}")
        if self.pts_per_half < 3:
            raise ValueError(f"pts_per_half must be at least 3, got {self.pts_per_half}")
        if self.bulwark_h <= 0:
            raise ValueError(f"bulwark_h must be positive, got {self.bulwark_h}")
        if not 0.0 < self.bulwark_thick < self.half_beam:
            raise ValueError(
                f"bulwark_thick must lie in (0, half_beam), got {self.bulwark_thick}"
            )
        if self.deck_camber < 0:
            raise ValueError(f"deck_camber must not be negative, got {self.deck_camber}")
        if self.keel_half <= 0 or self.keel_half >= self.half_beam:
            raise ValueError(f"keel_half must lie in (0, half_beam), got {self.keel_half}")
        self._validate_tiers()
        self._validate_battery()
        if self.rig is None:
            raise ValueError("a ship needs a rig plan; got None")
        self.rig.validate()
        self.hull_form.validate()
        self.head_form.validate()
        self.stern_form.validate()
        self.rail_form.validate()
        self.furniture_plan.validate()
        self.damage_form.validate()
        self.livery_form.validate()
        self.stripe_form.validate()
        self._validate_plan_fields()
        if self.ensign is not None and \
                not isinstance(self.ensign, st.EnsignKind):
            raise ValueError(
                f"ensign is a shiptype.EnsignKind or None (no national "
                f"colours), got {self.ensign!r}")
        if self.chase_ports not in (0, 2):
            raise ValueError(
                f"chase_ports is 0 or 2 (a pair cut either side of the "
                f"transom's centreline), got {self.chase_ports}")
        if self.gallery_windows < 0:
            raise ValueError(
                f"gallery_windows must not be negative, got {self.gallery_windows}"
            )

    def _validate_plan_fields(self) -> None:
        """The third ruling's cross-field plan data, refused here by name
        rather than at draw time (final review 3, M-6). Every default is
        the frigate's and passes untouched."""
        tiers = {t.name: t for t in self.deck_tiers}
        seen: set[str] = set()
        for mast, tier, drop in self.rail_form.castle_channels:
            if mast not in self.rig.mast_names():
                raise ValueError(
                    f"castle channel on mast {mast!r}, which this ship does "
                    f"not have; it has {self.rig.mast_names()}")
            if mast in seen:
                raise ValueError(
                    f"castle channel for mast {mast!r} declared twice")
            seen.add(mast)
            if tier not in tiers:
                raise ValueError(
                    f"castle channel for {mast!r} on tier {tier!r}, which "
                    f"this ship does not have; it has {sorted(tiers)}")
            if not tiers[tier].stands_above_the_main_rail():
                raise ValueError(
                    f"castle channel for {mast!r} on {tier!r}, which stands "
                    "inside the main bulwark and has no castle wall")
            if not drop > 0.0:
                raise ValueError(
                    f"castle channel for {mast!r}: CHANNEL EDGE to STRAP "
                    f"FOOT drop must be positive, got {drop}")
        row = self.damage_form.between_ports
        if row is not None:
            rows = {d.name: d for d in self.gun_decks}
            if row not in rows:
                raise ValueError(
                    f"damage_form.between_ports names row {row!r}, which "
                    f"this ship does not have; her rows are {sorted(rows)}")
            if rows[row].host != "hull":
                raise ValueError(
                    f"damage_form.between_ports names row {row!r}, cut in "
                    f"the {rows[row].host}; the band between its ports must "
                    "be hull timber")
        if self.livery_form.wales_between_rows:
            hosts = {d.host for d in self.gun_decks}
            if not {"hull", "bulwark"} <= hosts:
                raise ValueError(
                    "livery_form.wales_between_rows needs a row in the hull "
                    "and one in the bulwark above it; this ship's rows are "
                    f"in {sorted(hosts)}")
        if self.stern_form.chase_platform is not None \
                and not self.chase_ports:
            raise ValueError(
                "a chase platform carries the stern chasers, and this ship "
                "has no stern chasers (chase_ports 0)")

    def _validate_tiers(self) -> None:
        names: set[str] = set()
        for t in self.deck_tiers:
            t.validate()
            if t.name in names:
                raise ValueError(f"deck tier {t.name!r} declared twice")
            names.add(t.name)
            # A platform that fits under the main rail must stay under it. One
            # that does NOT is a castle deck, and a castle deck is legal —
            # that is what a towering stern castle IS — but only if it carries
            # a rail of its own, because otherwise the ship has a deck people
            # walk on with nothing round the edge of it.
            if t.rise + self.deck_camber >= self.bulwark_h \
                    and not t.stands_above_the_main_rail():
                raise ValueError(
                    f"{t.name} rise plus deck_camber ({t.rise + self.deck_camber}) "
                    f"must stay below bulwark_h ({self.bulwark_h}), or the "
                    "platform pokes through the rail — a tier meant to stand "
                    "above the main rail declares its own bulwark_h"
                )
        # Two tiers AT THE SAME HEIGHT must not overlap fore and aft; one
        # standing above another is a castle on a deck, which is the whole
        # point of a galleon's stern. The frigate's gun deck already ran under
        # both its platforms for exactly this reason.
        raised = self.raised_tiers()
        for i, lower in enumerate(raised):
            for upper in raised[i + 1:]:
                if abs(lower.rise - upper.rise) > 1e-9:
                    continue
                if lower.t0 < upper.t1 and upper.t0 < lower.t1:
                    raise ValueError(
                        f"deck tiers {lower.name!r} and {upper.name!r} stand at "
                        f"the same rise ({lower.rise}) and overlap fore and aft: "
                        f"{lower.t0}..{lower.t1} against {upper.t0}..{upper.t1}"
                    )

    def _validate_battery(self) -> None:
        st.validate_gun_decks(self.gun_decks)
        names = {t.name for t in self.deck_tiers}
        for deck in self.gun_decks:
            if deck.served_by not in names:
                raise ValueError(
                    f"gun deck {deck.name!r} is served by {deck.served_by!r}, "
                    f"which this ship does not have; it has {sorted(names)}")
            tier = self.tier(deck.served_by)
            if deck.host == "hull":
                self._validate_hull_row(deck, tier)
            else:
                self._validate_bulwark_row(deck, tier)
            self._validate_sill_band(deck)
        self._validate_chase_sill()
        # Rows on different decks, compared where they can be: above the
        # sheer, each lifted by its own deck's rise.
        spans = sorted((self.tier(d.served_by).rise + d.sill,
                        self.tier(d.served_by).rise + d.head, d.name)
                       for d in self.gun_decks)
        for (_lo, head, low), (sill, _hi, up) in zip(spans, spans[1:]):
            if head > sill:
                raise ValueError(
                    f"gun decks {low!r} and {up!r} overlap vertically: "
                    f"{low} head stands {head:.3f} m from the sheer and "
                    f"{up} sill {sill:.3f} m")

    def _validate_chase_sill(self) -> None:
        """A chase sill measured above the deck at the gun is judged by its
        own row's band, as every other sill is."""
        sf = self.stern_form
        if sf.chase_sill_datum != "deck_at_gun" or not self.chase_ports:
            return
        from . import profiles

        deck = profiles.gun_deck(self, profiles.chase_deck_index(self))
        if deck.sill_band is None:
            return
        lo, hi = deck.sill_band
        if not lo <= sf.chase_sill <= hi:
            raise ValueError(
                f"the chase sill stands {sf.chase_sill} m over the deck at "
                f"the gun, outside its row {deck.name!r}'s band {lo}..{hi} m")

    def _validate_sill_band(self, deck) -> None:
        """The maintainer's band, judged where it was ruled: above the serving deck's
        SURFACE `sill_inboard` m inboard of its edge, at EVERY port."""
        if deck.sill_band is None:
            return
        from . import profiles

        lo, hi = deck.sill_band
        index = self.gun_decks.index(deck)
        for t in profiles.gunport_ts(self, index):
            reading = profiles.sill_reading(self, index, t)
            if not lo <= reading <= hi:
                raise ValueError(
                    f"gun deck {deck.name!r} sill stands {reading:.4f} m over "
                    f"{deck.served_by} {deck.sill_inboard} m inboard of its "
                    f"edge at t {t:.4f}, outside its band {lo}..{hi} m — the "
                    "gun behind it cannot depress and recoil")

    def _validate_hull_row(self, deck, tier) -> None:
        if not tier.inside_hull:
            raise ValueError(
                f"gun deck {deck.name!r} is cut in the hull, so the deck that "
                f"serves it must lie inside the hull; {tier.name} does not")
        if deck.sill <= 0:
            raise ValueError(
                f"gun deck {deck.name!r} sill must stand above {tier.name}'s "
                f"edge, got {deck.sill}")
        if tier.rise + deck.head >= -self.plank_thick:
            raise ValueError(
                f"gun deck {deck.name!r} head stands "
                f"{tier.rise + deck.head:.3f} m from the sheer; it must stay "
                f"under the gun deck's planking, {self.plank_thick} m thick")

    def _validate_bulwark_row(self, deck, tier) -> None:
        if tier.rise != 0.0 or tier.inside_hull:
            raise ValueError(
                f"gun deck {deck.name!r} is cut in the bulwark, so the deck "
                f"that serves it is the one at the sheer; {tier.name} "
                f"stands {tier.rise} m off it")
        if deck.sill <= 0:
            raise ValueError(
                f"gun deck {deck.name!r} sits in the bulwark, so its sill "
                f"must stand above the sheer, got {deck.sill}"
            )
        if deck.head >= self.bulwark_h:
            raise ValueError(
                f"gun deck {deck.name!r} head ({deck.head}) must stay below "
                f"bulwark_h ({self.bulwark_h}), or the aperture breaks the "
                "rail"
            )


FRIGATE_GUN_DECKS = (
    # One row. The man-o-war's three are the reason this is a tuple: the model
    # never knew a count of one as anything but N == 1.
    st.GunDeck(name="upper", n_ports=11, t0=0.22, t1=0.84,
               width=0.90, height=0.75, sill=0.55),
)

FRIGATE_DECK_TIERS = (
    # The gun deck runs nearly the whole length UNDER the two platforms: the
    # aftmost gunports sit beneath the quarterdeck and still need deck.
    st.DeckTier("Deck_Main", 0.04, 0.96, 20, 0.0),
    st.DeckTier("Deck_Forecastle", 0.0, 0.20, 8, 1.0),
    st.DeckTier("Deck_Quarter", 0.60, 1.0, 10, 1.2),
)


@dataclass
class FrigateParams(ShipParams):
    """The frigate, per spec section 2.1 — the hull that shipped.

    Heights are set by what a side view shows: the waterline-to-RAIL band,
    which is deck_z + bulwark_h, not deck_z alone. Measured off La Penelope
    scaled to this hull's 38 m: rail 4.31 m above water (11.3% of length),
    sheer rise ~0.3 m at the bow. deck_z 2.7 + bulwark_h 1.6 reproduces the
    4.31 m exactly; the sheer is deliberately left richer than the reference,
    which is a late near-flush-decked frigate, so the ship keeps a rakish line.

    These numbers are FROZEN. Twenty-two in-Blender checks and the pytest
    suite assert them against the reference.
    """

    gun_decks: tuple[st.GunDeck, ...] = FRIGATE_GUN_DECKS
    deck_tiers: tuple[st.DeckTier, ...] = FRIGATE_DECK_TIERS
    rig: st.RigPlan = field(default=st.FRIGATE_RIG)
    hull_form: st.HullForm = field(default=st.FRIGATE_HULL)
    head_form: st.HeadForm = field(default=st.FRIGATE_HEAD)
    stern_form: st.SternForm = field(default=st.FRIGATE_STERN)
    rail_form: st.RailForm = field(default=st.FRIGATE_RAILS)
    figurehead: str = "minerva"
    ensign: st.EnsignKind = st.EnsignKind.RED_ENSIGN
    chase_ports: int = 2
    gallery_windows: int = 5
    collection: str = "Frigate"
    passes: tuple[str, ...] | None = None
    budget: Budget = FRIGATE_BUDGET


# --- the galleon ------------------------------------------------------------
#
# WHERE THE NUMBERS COME FROM, with both endpoints of every measurement named.
# The reference images in ~/Downloads are a FRIGATE reference — `La-penelope`
# is a late, near-flush-decked French frigate — and they do not serve here:
# they show a long low hull with no castle at all, which is the single feature
# that most defines this ship. The galleon is measured against:
#
#   1. Galeon Andalucia (2010), a sailing replica built to Spanish galleon
#      lines by the Fundacion Nao Victoria: HULL LENGTH 38 m, 51 m overall
#      with the bowsprit, BEAM 10.12 m, DRAFT 3.40 m.
#   2. Vasa (1628), the surviving high-charged galleon: 47.5 m between
#      perpendiculars, 11.7 m beam, 4.8 m draft, TWO gun decks, three masts
#      with a lateen mizzen.
#   3. The textbook proportion for the type, 3 : 1 and sometimes 4 : 1, with
#      the Manila galleons' "unusual breadth of beam" described as what
#      offsets the topheaviness of ends standing so high out of the water.
#
# AND THE FINDING THAT CAME OUT OF MEASURING INSTEAD OF ASSUMING: the one real
# galleon hull with both figures published, the Andalucia, is 3.76 : 1, and
# this project's frigate is 3.73 : 1. They are the SAME plan proportion. So
# "short and beamy" is not carried by length over beam, and a galleon built by
# shortening and widening alone would not read as one. It is carried by the
# SECTION — a bluff entry where the frigate has a fine one, and twice the
# tumblehome — and by the HEIGHT of the ends. This hull does take the plan to
# 3.09 : 1, which is the textbook figure, but the work is in the other two.

GALLEON_HULL = st.HullForm(
    entry_exp=0.80,       # BLUFF. The frigate's 1.35 is a fine entry; <1 is apple-cheeked
    run_exp=2.40,         # the width is carried far aft before the run takes it off
    run_loss=0.42,        # transom half-beam is 58% of the maximum (frigate 62%)
    stem_fraction=0.14,   # real width right up to the stem (frigate 0.08)
    sheer_exp=2.60,       # a flat waist with the sweep thrown into the ends
    tumble_at_deck=0.22,  # TWICE the frigate's 0.11 — the galleon's signature section
    tumble_exp=1.10,      # and it takes hold lower down (frigate 1.25)
    bulwark_tumble=0.10,  # the waist bulwark leans in harder still (frigate 0.06)
    # It binds nowhere below 4.80 m over the sheer, so the waist bulwark, both
    # gunport rows, the forecastle and the quarterdeck castle are untouched by
    # it; what it catches is the top 1.20 m of the POOP. TRANSOM-WIDTH-AT-THE-
    # TAFFRAIL goes from 1.99 m to 2.59 m, against TRANSOM-WIDTH-AT-THE-STERN-
    # SHEER of 4.98 m. Vasa's taffrail is about 0.21 of her own 11.7 m beam;
    # 2.59 m on this 11.0 m beam is 0.235.
    tumble_floor=0.52,
    forefoot_span=0.22,   # keel-underside-at-the-stem is -0.30 m, as the frigate's is
    forefoot_rise=5.00,   # draft 5.30 less the 0.30 the stem foot stands under the water
    tuck_span=0.26,       # a high round tuck under a square transom
    tuck_rise=2.34,       # frigate 1.30; 1.90 on the 4.30 m draft, scaled with it
    bilge_root=2.60,      # a fuller, boxier midship section
    bilge_slope=0.90,
)

# TWO ROWS ON TWO DECKS. The maintainer's ruling (2026-10-05): a TRUE lower gun deck
# inside the hull, no dummy ports, the upper battery kept, sills banded per
# row. The "main" row (12 a side) is cut in the HULL skin and served by
# `Deck_Lower`, 2.00 m below the gun deck at the same station; the "waist"
# row (9 a side, aligned over it) stays in the bulwark, served by
# `Deck_Main`. A deck inside the hull lies BELOW the weather deck and cannot
# serve a row 1.73 m above it, so this is the only arrangement in which both
# rows' guns stand on a deck.
#
# THE SILLS ARE RULED: 0.60-0.75 m above the serving deck's SURFACE measured
# 1.0 m INBOARD of its edge, where the carriage trucks stand on the camber,
# at every port of the row. Each `sill` stays ONE figure above its deck's
# EDGE (the cut is made on it) and is the largest, to the centimetre, whose
# inboard reading at every port is <= 0.75:
#
#   main  on Deck_Lower: camber lift 1.0 m inboard 0.0882..0.1309 over its
#         12 ports -> sill 0.83, DECK_LOWER-1.0-M-INBOARD to SILL
#         0.6991..0.7418. (It was 0.42 over the sheer, in the bulwark.)
#   waist on Deck_Main:  camber lift 0.1036..0.1194 over its 9 ports ->
#         sill 0.85, DECK_MAIN-1.0-M-INBOARD to SILL 0.7306..0.7464. (It was
#         1.40 over the sheer, stacked on the lower row.)
#
# waist-bulwark height is DERIVED from the one row it still holds:
#     0.85 waist sill, MAIN-DECK EDGE to WAIST SILL
#   + 0.62 waist aperture          -> waist head 1.47
#   + 0.43 timber to the rail cap
#   = 1.90 m, MAIN-DECK EDGE to WAIST RAIL CAP (was 2.45 with both rows in
#     the bulwark: the lower battery left it, so the cap dropped 0.55 m).
#
# The lower row's head stands 0.83 + 0.70 - 2.00 = -0.47 m, i.e. 0.47 m
# below the MAIN-DECK EDGE and 0.35 m under the gun deck's planking.
GALLEON_GUN_DECKS = (
    st.GunDeck("main", 12, 0.20, 0.84, 0.86, 0.70, 0.83, host="hull",
               served_by="Deck_Lower", sill_band=(0.60, 0.75),
               sill_inboard=1.0),
    # ALIGNED to the main row: the upper ports stand directly over the lower.
    # Spaced on its own pitch — 9 over t 0.26..0.78 against 12 over 0.20..0.84
    # — the two rows drift half a pitch out of step amidships and between them
    # blocked the ship's side almost continuously: over the main channel's
    # 8.60 m of side there were 0.23 m and 0.35 m of clear planking left, and
    # six chainplates would not fit on it. Ships stand their rows in the same
    # columns, and this is what happens when they do not.
    st.GunDeck("waist", 9, 0.26, 0.78, 0.78, 0.62, 0.85, align="main",
               sill_band=(0.60, 0.75), sill_inboard=1.0),
)

# THE CASTLES. A galleon's profile is a flight of steps: a modest raised
# forecastle forward, and aft a quarterdeck and a poop, each standing clear
# above the waist rail rather than tucked under it. Every rise below is
# measured from the MAIN DECK EDGE at the same station, and every one of these
# three is greater than the 1.90 m waist bulwark, which is what makes it a
# step you can see instead of a platform inside a wall.
#
# Fore and aft the castles divide the length as 21% forecastle, 33% open
# waist, 27% quarterdeck and 19% poop — the waist is the longest single run,
# which is what both references show and what a forecastle as long as the
# waist would have got wrong.
#
#   waist rail cap at the taffrail  5.80 + 1.90 =  7.70 m above the waterline
#     (8.25 on the 2.45 m bulwark; the castles did NOT move when it dropped)
#   quarterdeck   at the taffrail   5.80 + 3.40 =  9.20, its rail cap 10.20
#   poop          at the taffrail   5.80 + 5.00 = 10.80, its rail cap 11.80
#
# 11.80 m is 34.7% of stem-to-taffrail. The frigate's topmost rail at its own
# taffrail is 5.20 m, 13.7% of its own 38 m. That ratio is the galleon.
GALLEON_DECK_TIERS = (
    # The gun deck runs the length UNDER everything, as the frigate's does.
    st.DeckTier("Deck_Main", 0.04, 0.96, 20, 0.0),
    # A galleon's forecastle is lower than a carrack's, but still a castle:
    # at the stem it stands 7.45 m above the water with its rail at 8.30,
    # 1.00 m clear of the waist rail cap beside it (0.45 before that cap
    # dropped with the lower battery).
    st.DeckTier("Deck_Forecastle", 0.0, 0.21, 8, 2.90, bulwark_h=0.85),
    st.DeckTier("Deck_Quarter", 0.54, 1.0, 12, 3.40, bulwark_h=1.00),
    st.DeckTier("Deck_Poop", 0.81, 1.0, 7, 5.00, bulwark_h=1.00),
    # THE LOWER GUN DECK, inside the hull, 2.00 m below the gun deck at the
    # same station (a real two-decker's rows stand about 2 m apart). It runs
    # the main row's extent, t 0.20..0.84 port centre to port centre, plus
    # HALF A PORT PITCH at each end: (0.84 - 0.20) / 11 / 2 = 0.0291, so
    # 0.1709..0.8691, taken out to 0.17..0.87. The end guns then have the
    # same working room fore and aft as every gun between them, and the
    # end carriages (0.445 m half-breadth, wheel to wheel, `cannons`) stand
    # 0.575 m inside the deck's ends, in metres along the ship: END-PORT
    # CENTRE to DECK END is (0.20 - 0.17) x 34 = 1.02, less the 0.445 from
    # the carriage's centre to its outer wheel face. Its edge meets
    # the hull skin's inside at its own height (`tier_half_beam`).
    st.DeckTier("Deck_Lower", 0.17, 0.87, 16, -2.00, inside_hull=True),
)


# HER DECK PLAN, measured on HER decks (the maintainer's ruling, Task 8b; controller
# ruling R8). y is metres forward of amidships, y = 17.0 - 34.0 t. Her masts
# stand at fore t 0.20 (inside the forecastle), main t 0.52 (y -0.68, radius
# 0.48 at the deck) and mizzen t 0.80 (y -10.20, radius 0.469); her waist is
# open from the FORECASTLE BREAK t 0.21 (y 9.86) to the QUARTERDECK BREAK
# t 0.54 (y -1.36); the poop breaks at t 0.81 (y -10.54).
GALLEON_FURNITURE = st.FurniturePlan(
    stations=(
        # The helmsman on the QUARTERDECK, forward of the POOP BREAK and of
        # the mizzen: y -8.84. WHEEL DRUM'S AFT END (0.52 abaft) to the
        # MIZZEN'S FORE FACE 0.37 m; wheel station to mizzen foot 1.36 m.
        ("wheel",      0.760, 0.00, 0.0),
        # THE WAIST, FORWARD TO AFT: capstan, launch, and the three hatches
        # under the launch's skids. The launch is LEVEL and her sheer FALLS
        # AFT through the waist, so a launch whose aft end stands over the
        # flat of the waist (sheer 3.10-3.12 from y 3.5 aft) keeps its
        # gunwale under the WAIST RAIL CAP along its whole length; with the
        # capstan aft of it (it was at y 1.598, the launch at y 3.256-
        # 9.256) its aft end stood on the steep fore part and its gunwale
        # was 0.068 m OVER the cap there.
        #
        # The capstan, between fore and main, forward of the launch: y
        # 8.194. A BAR'S END shipped fore and aft (1.45 m) to the FORECASTLE
        # BREAK (y 9.86) 0.216 m; the BARS' AFT SWEEP (y 6.744) to the
        # LAUNCH'S STEM 0.143 m.
        ("capstan",    0.259, 0.00, 0.0),
        # Three hatches under the launch's skids (y 1.20..6.00), coaming to
        # coaming 0.15 m: y 4.502, 2.802, 1.102. SKID UNDERSIDE (3.8656) to
        # each COAMING TOP, 0.26 over the deck AT ITS OWN STATION: 0.220 m
        # at hatch_fore (deck 3.3858), 0.252 at hatch_main (3.3533), 0.265
        # at hatch_aft (3.3412), against the launch's 0.20 m rule.
        # HATCH_AFT'S AFT COAMING (y 0.327) to the MAIN MAST'S FORE FACE
        # (y -0.20) 0.527 m.
        ("hatch_fore", 0.3964, 0.00, 0.0),
        ("hatch_main", 0.4369, 0.00, 0.0),
        ("hatch_aft",  0.4774, 0.00, 0.0),
        # The launch over the waist, y 0.601..6.601: her STEM to the
        # FORECASTLE BREAK 3.26 m, her TRANSOM to the MAIN MAST'S FORE FACE
        # 0.801 m.
        ("boat",       0.4179, 0.00, 0.0),
        # Barrels in HER PORT-COLUMN GAPS (both rows share columns, 0.0582
        # apart from t 0.20): the four gaps in the waist, mid-way between
        # columns 1|2, 2|3, 3|4, 4|5. The gap at 0.5200 is the main mast's
        # station and is left empty. Each stands 0.20 m clear of the waist
        # row's carriages either side of it, and at 0.72 of her deck
        # half-width its staves stand 0.42-0.60 m off the waist bulwark's
        # inner face (the frigate's stand 0.36-0.62).
        ("barrel",     0.2873, -0.72, 0.0),
        ("barrel",     0.2873, 0.72,  0.0),
        ("barrel",     0.3455, -0.72, 0.0),
        ("barrel",     0.3455, 0.72,  0.0),
        ("barrel",     0.4036, -0.72, 0.0),
        ("barrel",     0.4036, 0.72,  0.0),
        ("barrel",     0.4618, -0.72, 0.0),
        ("barrel",     0.4618, 0.72,  0.0),
    ),
    # MIDWAY between her two bow obstructions: the FORE CHANNEL'S FORWARD
    # END (y 11.19) and the HEAD RAILS' AFTMOST POINT (y 15.802). With the
    # anchor's 0.85 m reach each way, t 0.103 (y 13.498) leaves 1.458 m aft
    # and 1.454 m forward. The frigate's 0.112 was set by HER channel.
    anchor_t=0.103,
    # The frigate's three, at her 0.62 of the half-width -- measured at HER
    # TAFFRAIL, the poop cap 11.80 m up where the transom is 2.59 m across:
    # outer lanterns at x 0.802, their roofs 0.29 m inside its edge.
    lanterns=3,
    lantern_spread=0.62,
    # DECK AT THE BOAT STATION (centreline, 3.3656) to the LAUNCH'S
    # GUNWALE 1.61, not the frigate's 1.35: GUNWALE 4.9756 to WAIST RAIL CAP
    # 0.148 m under it at the launch's FORE end (cap 5.1239) and 0.025 m
    # under it at its AFT end (cap 5.0002), the low one; and its SKID
    # UNDERSIDE (1.61 - 0.85 deep - `BOAT_SKID_DROP` 0.26) clears every
    # hatch coaming by at least 0.220 m (see the hatches above).
    boat_on_skids=1.59,
)

# Her hull row stands INSIDE the band the frigate's scar rule keeps clear of,
# so her scars are judged against every aperture's own box; the 0.05 m is
# the open hull lid's hinge leaf, which lies along each head. The leaf is
# also judged as its OWN box (`damage.lid_leaf_boxes`, Task 11): the lid is
# 0.16 m wider than her 0.86 m hull port, so it overhangs each port edge.
#
# HER SECOND BAND (the maintainer's third ruling, A''): shot scars on the timber
# BETWEEN her hull row's ports. That row fills her topside band amidships,
# so the first band alone puts most of her scars at her ends; every gap in
# it is 1.118 m PORT EDGE to PORT EDGE against the 1.10 m a crater and its
# reach need, so the band is drawn there (`damage.scar_strips`).
GALLEON_DAMAGE = st.DamageForm(scar_clear="aperture", scar_margin=0.05,
                               between_ports="main")


@dataclass
class GalleonParams(ShipParams):
    """A high-charged galleon: short, beamy, bluff-bowed, with a stern castle.

    Built as far as its gunports. Its rig, stern gallery, materials and bake
    are later passes, and `passes` says so rather than letting a half-run
    pipeline look like a finished ship.

    LENGTHENED AND BULKED (the maintainer's ruling, 2026-10): she must
    clearly exceed the frigate's 38 m on the board, so her HULL is drawn at
    42 m with her beam and draft carried in proportion (34 / 11.0 / 4.3
    before), rather than the asset scaled as a class. Everything that is a
    man's size stays true size: her deck heights, castles, rails, ports and
    their sills, guns, fittings and her head. Her deck crown is carried
    with her beam (0.24 to 0.29), which keeps her sills' reading 1.0 m
    inboard in their band. Figures quoted below and in her tests that name
    the 34 m hull are history; the tests pin the 42 m ones.
    """

    loa: float = 42.0          # stem at rail level to taffrail
    lwl: float = 32.6          # forward waterline ending to after waterline ending
    beam: float = 13.6         # maximum, at the wales, amidships
    draft: float = 5.3         # keel underside to waterline
    deck_z: float = 3.10       # waterline to main (gun) deck EDGE, amidships
    bow_rise: float = 1.45     # deck edge at the stem, above the deck edge amidships
    stern_rise: float = 2.70   # deck edge at the transom, above the deck edge amidships
    max_beam_t: float = 0.38   # station of maximum beam, from the stem

    keel_half: float = 0.22
    n_stations: int = 24
    pts_per_half: int = 14
    bulwark_h: float = 1.90       # main deck edge to waist rail cap; see above
    bulwark_thick: float = 0.22
    deck_camber: float = 0.29     # 0.24 on the 34 m hull, carried with her beam
    plank_thick: float = 0.12

    gun_decks: tuple[st.GunDeck, ...] = GALLEON_GUN_DECKS
    deck_tiers: tuple[st.DeckTier, ...] = GALLEON_DECK_TIERS
    rig: st.RigPlan = field(default=st.GALLEON_RIG)
    hull_form: st.HullForm = field(default=GALLEON_HULL)
    head_form: st.HeadForm = field(default=st.GALLEON_HEAD)
    stern_form: st.SternForm = field(default=st.GALLEON_STERN)
    rail_form: st.RailForm = field(default=st.GALLEON_RAILS)
    furniture_plan: st.FurniturePlan = field(default=GALLEON_FURNITURE)
    damage_form: st.DamageForm = field(default=GALLEON_DAMAGE)
    # Her wales between her two rows of ports (the maintainer's third ruling, C).
    livery_form: st.LiveryForm = field(default=st.GALLEON_LIVERY)
    # HER STRIPE ON HER LOWER WALE, under her hull row: her main wale stands
    # between the rows, across the sheer and half on her bulwark, where her
    # chainplate feet and her hull lids' sweep come down.
    stripe_form: st.StripeForm = field(
        default=st.StripeForm(wale="lower_wale"))
    # A CROWNED LION RAMPANT, not a goddess. See `frigate.lion` for why.
    figurehead: str = "lion"
    # THE CROSS OF BURGUNDY, not the 1785 bicolour. See `shiptype.EnsignKind`:
    # a galleon predates the bicolour by two centuries, and the Red Ensign's
    # own fourth reason refuses an anachronism that size.
    ensign: st.EnsignKind = st.EnsignKind.CROSS_OF_BURGUNDY
    chase_ports: int = 2
    # CARRIAGE FLOOR to BARREL AXIS 0.94, not the frigate's 0.83. Her sills
    # are ruled 0.60-0.75 m over the serving deck 1.0 m inboard, and on 0.83
    # every barrel's underside cut its sill by 0.018-0.042 m (`Bulwarks x
    # Cannon_` 208 face pairs, `Cannon_ x Ceiling_Lower` 164). Centring the
    # barrel in its port (1.07) drove the waist row's muzzles 0.050 m into
    # their own open lids, which a 0.62 m port swung 68 deg leaves little
    # room under. 0.94 is the height, to the centimetre, that leaves the
    # most room on the TIGHTER side at every one of her 42 broadside ports
    # (`profiles.barrel_clearances`): BARREL UNDERSIDE to SILL 0.068-0.092
    # and OPEN LID to BARREL TOP 0.069-0.306, against the frigate's own
    # 0.227-0.281 and 0.025-0.055.
    # 0.93 on the 42 m hull, by the same rule (0.94 at 34 m).
    gun_trunnion_h: float = 0.93
    # NINE lights in her great cabin's band: across the 42 m hull's wider
    # transom her 34 m seven stood 0.714 m wide over 1.170 tall, no longer
    # tall and narrow; nine stand 0.531 wide, as the seven stood 0.541.
    gallery_windows: int = 9
    collection: str = "Galleon"
    # IT SETS CANVAS AND IT IS RIGGED. `sails` and `rigging` were out of this
    # tuple because the lateen mizzen needed four running-rigging families
    # nobody had written, and `ropes.unbuildable_families` named them rather
    # than letting a half-rigged ship look finished. All four are written now.
    # SHE IS MATERIALED AND UNWRAPPED. `materials` and `bake` are in now that
    # `palette.family_of` knows her five own objects, her four materials are
    # named for HER, and her atlases cannot overwrite the frigate's. `bake`
    # here is `bake.unwrap_all` — the UVs. `bake.bake_all` is not a build
    # pass on any ship: it is the second half of spec step 15 and runs once,
    # after the rebuild.
    #
    # SHE IS STEERED AND ARMED (the maintainer's ruling, Task 8a): `rudder`, hung on
    # her sternpost under her gallery's dentils, and `cannons`, guns on BOTH
    # tiers -- the hull row on `Deck_Lower`, the bulwark row on `Deck_Main`
    # -- and her two stern chasers.
    #
    # SHE IS FURNISHED AND DAMAGED (the maintainer's ruling, Task 8b): `furniture`
    # on her own deck plan, `GALLEON_FURNITURE`, and `damage` with her scars
    # held off both rows' apertures by `GALLEON_DAMAGE`. Every pass that
    # exists now runs on her.
    # `budget` was never a pass: it is a ship-wide check and `check_all` runs
    # it on her whatever this tuple says, against HER OWN `GALLEON_BUDGET`
    # (ledger open item 7, settled by the maintainer's 20-35% ruling). With every
    # pass in, no line of hers is STARVED by this tuple.
    budget: Budget = GALLEON_BUDGET
    passes: tuple[str, ...] | None = ("hull", "bulwarks", "decks", "gunports",
                                      "stern", "rudder", "rails", "headworks",
                                      "masts", "sails", "rigging", "cannons",
                                      "furniture", "dressing", "damage",
                                      "materials", "bake")


# --- the flute (fluyt) -------------------------------------------------------
#
# A Dutch cargo carrier of the seventeenth century, taken and converted. Her
# figures, with both endpoints of each named, against the references the type
# is known by: the fluyt ran 4 : 1 to 6 : 1 length to beam between
# perpendiculars, carried her maximum breadth low at the bilge and drew her
# topsides in hard above it (the Sound toll was levied on DECK width, so the
# deck was kept narrow over a wide hold), and finished aft in a ROUND tuck
# under a narrow, high, flat upper stern.
FLUTE_HULL = st.HullForm(
    # a full, round bow: wider than the galleon's apple cheeks reach
    entry_exp=0.60,
    # the width is carried far aft -- the long flat run of a cargo hull --
    # and then taken off hard into the narrow stern
    run_exp=2.60,
    # TAFFRAIL HALF-BEAM over MAXIMUM HALF-BEAM 0.32 (galleon 0.58, frigate
    # 0.62): the fluyt's narrow stern
    run_loss=0.68,
    stem_fraction=0.15,
    sheer_exp=2.40,
    # DECK-EDGE HALF-WIDTH over WATERLINE HALF-WIDTH amidships 0.70
    # (galleon 0.78, frigate 0.89): the pear-shaped section
    tumble_at_deck=0.30,
    tumble_exp=1.00,
    bulwark_tumble=0.10,
    tumble_floor=0.45,
    forefoot_span=0.18,
    forefoot_rise=2.60,
    # the round tuck: the keel sweeps up into it over the last quarter
    tuck_span=0.26,
    tuck_rise=1.60,
    # a flat-floored, boxy hold
    bilge_root=3.00,
    bilge_slope=0.80,
)

# One row of light guns in the waist, FOUR a side, where the deck is widest:
# BREECH to CENTRELINE is 0.42 m at the foremost (t 0.34) and 0.65 m
# amidships, so the two sides' carriages stand clear across her narrow deck.
# A converted merchantman carries what her deck will take between the
# hatches, and a fifth pair at t 0.30 stood its breeches 0.21 m off the
# centreline, under the launch and inside the fore hatch's coaming.
FLUTE_GUN_DECKS = (
    st.GunDeck("upper", 4, 0.34, 0.64, 0.80, 0.75, 0.35),
)

# A flush main deck with a short open forecastle, and the stern built up in
# two CASTLES, each with a rail of its own: the quarterdeck over the main
# rail and the poop over that. On a stern 0.32 of her beam wide, that is what
# makes it read narrow and high. TAFFRAIL RAIL CAP over the WAIST RAIL CAP
# amidships: 7.70 - 3.50 = 4.20 m.
FLUTE_DECK_TIERS = (
    st.DeckTier("Deck_Main", 0.04, 0.96, 18, 0.0),
    st.DeckTier("Deck_Forecastle", 0.0, 0.16, 6, 0.90),
    st.DeckTier("Deck_Quarter", 0.70, 1.0, 10, 1.40, bulwark_h=0.90),
    st.DeckTier("Deck_Poop", 0.86, 1.0, 6, 2.60, bulwark_h=0.90),
)

# THE CHANNEL AND THE CHAINPLATE, against her one row. CHANNEL UNDERSIDE to
# PORT HEAD: 1.35 - 0.08 - 0.12 = 1.15 over the sheer against a head at
# 0.35 + 0.75 = 1.10, 0.05 m clear (the frigate's 0.04). STRAP FOOT to
# LOWEST SILL: the foot at 1.35 - 0.08 - 1.00 = 0.27 over the sheer, 0.08 m
# under the 0.35 sill, landing on the bulwark as the frigate's do.
#
# `strap_clear` 0.22, not the frigate's 0.04: her lids are 1.02 m wide over
# a 0.80 m port, so a strap kept 0.04 off the PORT still crossed the LID's
# sweep (Chainplates x PortLid_, 32 face pairs a side at the main). At 0.22
# every main strap stands at least 0.113 m off every lid's swept overhang,
# shut through open (`profiles.strap_lid_clearance`).
#
# THE MIZZEN CHANNEL IS ON THE QUARTERDECK CASTLE, as the galleon's is: her
# mizzen stands at t 0.80, inside the castle (t 0.70 on), so a channel under
# the waist cap would hang inside the castle wall. CHANNEL EDGE to STRAP
# FOOT 1.95 m lands the foot on the waist bulwark, 0.27 m over the sheer
# like the others: castle wall head 1.40 + 0.90, less the 0.08 drop.
FLUTE_RAILS = st.RailForm(
    channel_thick=0.12,
    channel_drop=0.08,
    castle_channels=(("mizzen", "Deck_Quarter", 1.95),),
    chainplate_drop=1.00,
    strap_clear=0.22,
)

# Her stern: no chase ports (see `test_no_chasers`), and the carving drawn in
# from the transom's edge as the galleon's is, because the narrow transom
# tumbles hard.
FLUTE_STERN = st.SternForm(carving_edge=0.95)

# Her deck plan, measured on HER decks. Guns at t 0.34, 0.44, 0.54, 0.64;
# masts at 0.18, 0.49, 0.80; the quarterdeck castle from 0.70. Hatches and
# barrels stand in the gaps between the guns; the capstan forward of the
# battery, clear of the foremast by 2.1 m against bars 1.45 m long; the
# launch on its skids between the fore and main masts.
FLUTE_FURNITURE = st.FurniturePlan(
    stations=(
        ("wheel",      0.760, 0.00, 0.0),
        ("capstan",    0.250, 0.00, 0.0),
        ("hatch_fore", 0.390, 0.00, 0.0),
        ("hatch_main", 0.590, 0.00, 0.0),
        ("hatch_aft",  0.680, 0.00, 0.0),
        ("boat",       0.360, 0.00, 0.0),
        ("barrel",     0.390, -0.66, 0.0),
        ("barrel",     0.390, 0.66,  0.0),
        ("barrel",     0.590, -0.66, 0.0),
        ("barrel",     0.590, 0.66,  0.0),
    ),
    anchor_t=0.100,
    # ONE stern lantern: three across a taffrail 0.32 of her beam wide
    # stood inside one another
    lanterns=1,
    lantern_spread=0.0,
    # the launch rides high enough on its skids that the breeches of the
    # guns either side run in under its bilge
    boat_on_skids=1.95,
)

# HER SCARS, 0.70 of the frigate's: a crater 0.20-0.35 m in the radius on a
# hull 0.79 of the frigate's length. Her deck edge stands 2.20 m over the
# water, so the band runs 0.90 m over it to 0.40 m under the sheer, and the
# largest crater's top stays 0.05 m under the sheer.
FLUTE_DAMAGE = st.DamageForm(scar_scale=0.70, band_floor=0.90,
                             band_head=0.40)


@dataclass
class FluteParams(ShipParams):
    """A fluyt: long, narrow-decked, pear-sectioned, with a high narrow stern.

    LENGTH: stem at the rail to taffrail 30.00 m, inside the issue's 25-35 m
    class; over her 7.40 m maximum beam that is 4.05 : 1, longer for her beam
    than the frigate (3.73) or the galleon (3.09).
    HEIGHT: waterline to waist rail cap amidships 3.55 m (deck edge 2.20 +
    bulwark 1.35), 11.8% of her length; the frigate's 4.31 m is 11.3%.
    """

    loa: float = 30.0
    lwl: float = 26.0
    beam: float = 7.4
    draft: float = 3.0
    deck_z: float = 2.2
    bow_rise: float = 1.0
    stern_rise: float = 2.0
    max_beam_t: float = 0.40

    keel_half: float = 0.16
    n_stations: int = 24
    pts_per_half: int = 14
    bulwark_h: float = 1.35
    bulwark_thick: float = 0.16
    deck_camber: float = 0.18
    plank_thick: float = 0.10

    gun_decks: tuple[st.GunDeck, ...] = FLUTE_GUN_DECKS
    deck_tiers: tuple[st.DeckTier, ...] = FLUTE_DECK_TIERS
    rig: st.RigPlan = field(default=st.FLUTE_RIG)
    hull_form: st.HullForm = field(default=FLUTE_HULL)
    stern_form: st.SternForm = field(default=FLUTE_STERN)
    rail_form: st.RailForm = field(default=FLUTE_RAILS)
    furniture_plan: st.FurniturePlan = field(default=FLUTE_FURNITURE)
    damage_form: st.DamageForm = field(default=FLUTE_DAMAGE)
    figurehead: str = "lion"
    # NO NATIONAL ENSIGN (the maintainer's ruling): a ship's flags are her
    # OWNER's colours and nothing else, so she flies no false Dutch colours
    # and not the Red Ensign she was first built with. Her flag keeps its
    # one state, the device, with no parked ensign island and no TEXCOORD_1.
    ensign: st.EnsignKind | None = None
    chase_ports: int = 0
    # CARRIAGE FLOOR to BARREL AXIS. 0.58 stands her barrels' underside
    # 0.199 m over the 0.35 sill and their tops 0.08 m under the open lid
    # (`profiles.barrel_clearances`); the frigate's 0.83 puts the barrel
    # through the lid on a port 0.75 m tall.
    gun_trunnion_h: float = 0.58
    gallery_windows: int = 3
    collection: str = "Flute"
    budget: Budget = FLUTE_BUDGET
    passes: tuple[str, ...] | None = ("hull", "bulwarks", "decks", "gunports",
                                      "stern", "rudder", "rails", "headworks",
                                      "masts", "sails", "rigging", "cannons",
                                      "furniture", "dressing", "damage",
                                      "materials", "bake")


# --- the sloop --------------------------------------------------------------
#
# The Jamaica sloop of the 1710s-20s, the ship most of the Caribbean's pirates
# actually sailed: small, beamy for her length, deep-heeled and sharp in the
# floor for windward work, with a broad transom, ONE tall raking mast and a
# long bowsprit, and a low flush deck carrying a handful of light guns.
SLOOP_HULL = st.HullForm(
    entry_exp=1.25,       # a fine entry, nearly the frigate's 1.35
    run_exp=1.90,
    # TAFFRAIL HALF-BEAM over MAXIMUM HALF-BEAM 0.60: the broad, flat
    # transom of a sloop (frigate 0.62, flute 0.32)
    run_loss=0.40,
    # STEM HALF-BEAM 0.45 m: the figure's shoulders and the trailboards
    # stand inside it; at 0.06 (0.17 m) they stood 0.20 m proud of the bow
    stem_fraction=0.16,
    sheer_exp=2.20,
    # nearly wall-sided: DECK-EDGE over WATERLINE HALF-WIDTH 0.95
    tumble_at_deck=0.05,
    tumble_exp=1.20,
    bulwark_tumble=0.03,
    forefoot_span=0.16,
    forefoot_rise=1.50,
    # she DRAGS: deeper aft than forward, the keel rising only 0.20 m into a
    # shallow tuck, which is also what gives her rudder its blade (see
    # SLOOP_STERN)
    tuck_span=0.22,
    tuck_rise=0.20,
    # a SHARP floor, rising straight from a deep keel: the V-section that
    # made the Jamaica sloop weatherly
    bilge_root=1.40,
    bilge_slope=0.80,
)

# Four light guns a side in the bulwark, between the mast and the helm:
# t 0.40 to 0.76. BREECH to CENTRELINE 0.72 m at the foremost; at t 0.30 it
# was 0.02 m, the two sides' breeches touching across her narrow bow.
SLOOP_GUN_DECKS = (
    st.GunDeck("upper", 4, 0.40, 0.76, 0.55, 0.58, 0.22),
)

# A low flush deck, with a step of 0.25 m forward and 0.30 m aft: the
# platforms a sloop's windlass and tiller stood on, under her one rail.
SLOOP_DECK_TIERS = (
    st.DeckTier("Deck_Main", 0.04, 0.96, 16, 0.0),
    st.DeckTier("Deck_Forecastle", 0.0, 0.08, 4, 0.25),
    st.DeckTier("Deck_Quarter", 0.80, 1.0, 6, 0.30),
)

# HER HEAD, the frigate's own form taken down to a hull 0.47 of the
# frigate's length and 0.45 of her height at the stem: RAIL CAP AT THE STEM
# 2.50 m over the water against the frigate's 5.50.
SLOOP_HEAD = st.HeadForm(
    board_aft_abaft_stem=0.45,
    board_aft_below_cap=0.55,
    board_fwd_fwd_of_stem=0.18,
    board_fwd_below_cap=0.90,
    board_proud=0.035,
    board_thick=0.045,
    board_depth=(0.16, 0.11),
    upper_thick=0.05,
    upper_heel_thick=0.07,
    upper_depth=0.10,
    timber_thick=0.05,
    timber_fore_aft=0.06,
    timber_sink=0.02,
    knee_half=0.08,
    knee_into_stem=0.06,
    beakhead_thick=0.08,
    beakhead_into_side=0.04,
    beakhead_sink=0.05,
    beakhead_cap_t=0.07,
    beakhead_cap_out=0.03,
)

# HER STERN: the broad transom of a sloop with her cabin's lights in one
# low band under the stern sheer. STERN SHEER 1.40 m over the water, so the
# band runs 0.85 to 1.30 m over it (0.55 and 0.10 below the sheer), and its
# dentils hang 0.26 under that, to 0.59, level with the quarter badges'
# feet. The RUDDER HEAD stands `rudder.GALLERY_CLEAR` 0.18 under them, at
# 0.41, over a heel at the keel 2.40 m under the water: a rudder 2.81 m deep
# whose blade reaches over the 1.00 m abaft the sternpost `check_rudder`
# asks of a blade (at 2.61 m deep it reached 0.96).
SLOOP_STERN = st.SternForm(
    gallery_drop=0.55,
    gallery_head=0.10,
    gallery_margin=0.12,
    gallery_depth=0.15,
    window_mullion=0.08,
    window_inset_z=0.08,
    window_recess=0.10,
    # the frigate's 0.26: the quarter badges' feet hang 0.24 under the band,
    # and `check_rudder` measures the head's clearance off the lowest timber
    dentil_drop=0.26,
    badge_facets=5,
    badge_bulge=0.22,
    badge_mould=0.04,
    badge_lights=2,
    badge_hood=0.10,
    pilaster_w=0.07,
    pilaster_proud=0.05,
    muntin=0.03,
    muntin_proud=0.03,
    window_band_h=0.05,
    modillions=9,
    dentils=11,
    moulding_depth=0.08,
    moulding_h=0.08,
    moulding_overhang=0.10,
    # the carving's own blocks are cut 0.10 deep and its bosses 0.11
    carving_proud=0.14,
    carving_edge=0.95,
    carving_dentils=15,
    carving_panels=5,
    name_board_bosses=5,
)

# THE CHANNEL AND THE CHAINPLATE, against her one low row. CHANNEL
# UNDERSIDE to PORT HEAD: 1.00 - 0.05 - 0.10 = 0.85 over the sheer against a
# head at 0.22 + 0.58 = 0.80, 0.05 m clear. STRAP FOOT to LOWEST SILL: the
# foot at 1.00 - 0.05 - 0.80 = 0.15 over the sheer, 0.07 m under the sill.
# `strap_clear` 0.25: her lids are 1.02 m wide over a 0.55 m port.
SLOOP_RAILS = st.RailForm(
    stanchion_w=0.07,
    guard_h=0.90,
    min_proud=0.25,
    spacing=1.10,
    rail_w=0.08,
    rail_t=0.07,
    midrail_w=0.065,
    midrail_t=0.05,
    channel_projection=0.45,
    channel_thick=0.10,
    channel_drop=0.05,
    chainplate_drop=0.80,
    chainplate_rake=0.10,
    chainplate_margin=0.12,
    strap_half_w=0.04,
    strap_clear=0.25,
    strap_min_gap=0.14,
    strap_w=0.08,
    strap_thick=0.03,
)

# Her deck plan, on HER decks. Guns at t 0.40, 0.52, 0.64, 0.76; the mast at
# 0.36; the bowsprit's heel at y 7.00 (t 0.11); the quarterdeck step at
# 0.80. The capstan (her windlass) between the bowsprit's heel and the mast,
# its bars 1.45 m clear of both; the hatches and barrels in the gaps between
# the guns; the launch on its skids between the mast and the quarterdeck.
# The capstan at t 0.30 is turned 22.5 degrees so no bar points dead aft:
# its after bars pass the mast 0.34 m off the centreline against a mast
# 0.26 m in the radius. At 0.24, where her bow is 1.45 m in the half-width,
# its athwartships bars stood through the bulwark.
SLOOP_FURNITURE = st.FurniturePlan(
    stations=(
        ("wheel",      0.900, 0.00, 0.0),
        ("capstan",    0.300, 0.00, 22.5),
        ("hatch_fore", 0.460, 0.00, 0.0),
        ("hatch_main", 0.580, 0.00, 0.0),
        ("hatch_aft",  0.700, 0.00, 0.0),
        ("boat",       0.578, 0.00, 0.0),
        ("barrel",     0.460, -0.66, 0.0),
        ("barrel",     0.460, 0.66,  0.0),
        ("barrel",     0.700, -0.66, 0.0),
        ("barrel",     0.700, 0.66,  0.0),
    ),
    # abaft the bowsprit shrouds' and jib guys' feet at the bow (y 7.00):
    # the anchor's stock reaches 0.85 m either way of its station
    anchor_t=0.180,
    # NO taffrail lantern: her boom overhangs the taffrail, and a lantern
    # there stood in its sweep (Boom_Main x Lantern_, 12 face pairs)
    lanterns=0,
    lantern_spread=0.0,
    boat_on_skids=1.60,
)


@dataclass
class SloopParams(ShipParams):
    """A Jamaica sloop: the smallest and fastest ship of the fleet.

    LENGTH: stem at the rail to taffrail 18.00 m, inside the issue's 15-20 m;
    over her 5.60 m beam that is 3.21 : 1, beamy for her length as the type
    was. HEIGHT: waterline to waist rail cap amidships 2.00 m (deck edge 1.00
    + bulwark 1.00), 11.1% of her length.
    """

    loa: float = 18.0
    lwl: float = 15.6
    beam: float = 5.6
    draft: float = 2.6
    deck_z: float = 1.0
    bow_rise: float = 0.55
    stern_rise: float = 0.40
    max_beam_t: float = 0.42

    keel_half: float = 0.12
    n_stations: int = 20
    pts_per_half: int = 12
    bulwark_h: float = 1.00
    bulwark_thick: float = 0.12
    deck_camber: float = 0.12
    plank_thick: float = 0.08

    gun_decks: tuple[st.GunDeck, ...] = SLOOP_GUN_DECKS
    deck_tiers: tuple[st.DeckTier, ...] = SLOOP_DECK_TIERS
    rig: st.RigPlan = field(default=st.SLOOP_RIG)
    hull_form: st.HullForm = field(default=SLOOP_HULL)
    head_form: st.HeadForm = field(default=SLOOP_HEAD)
    stern_form: st.SternForm = field(default=SLOOP_STERN)
    rail_form: st.RailForm = field(default=SLOOP_RAILS)
    furniture_plan: st.FurniturePlan = field(default=SLOOP_FURNITURE)
    # HER SCARS, 0.45 of the frigate's: a crater 0.13-0.23 m in the radius,
    # drawn with its centre 0.35 m over the water to 0.55 m under her sheer,
    # so the largest one's top stays 0.33 m under a deck edge 1.00 m over
    # the water, under her stripe (`stripe_form`), and its foot 0.12 m over
    # the water.
    damage_form: st.DamageForm = field(
        default=st.DamageForm(scar_clear="aperture", scar_margin=0.05,
                              scar_scale=0.45, band_floor=0.35,
                              band_head=0.55))
    # HER STRIPE: 0.32 to 0.07 m under her sheer, high on a topside 1.00 m
    # over the water amidships, over her scars' band; aft of her anchor,
    # catted at t 0.18 with 0.85 m of stock abaft it.
    stripe_form: st.StripeForm = field(
        default=st.StripeForm(band=(-0.32, -0.07), span=(0.25, 0.86)))
    figurehead: str = "minerva"
    ensign: st.EnsignKind = st.EnsignKind.RED_ENSIGN
    chase_ports: int = 0
    # CARRIAGE FLOOR to BARREL AXIS: her barrels' underside ~0.09 m over the
    # 0.22 sill and their tops ~0.04 m under the open lid
    # (`profiles.barrel_clearances`)
    gun_trunnion_h: float = 0.38
    gallery_windows: int = 3
    # her few sails pack the canvas atlas full, leaving the ensign nowhere
    # to park (`bake.place_alt_island`); 0.85 leaves a strip 153 texels wide
    canvas_pack: float = 0.85
    collection: str = "Sloop"
    budget: Budget = SLOOP_BUDGET
    # NO HEADWORKS, and that is the type, not a shortcut. A sloop has a
    # plain stem with no beakhead and no head rails: her bowsprit runs out
    # over the stem head, and the frigate's rails put under it stood in its
    # way. She IS damaged, on scars sized to her (`damage_form` above): at
    # the frigate's 0.28-0.50 m, drawn 1.20 m over the water, the scars
    # stood in her bulwark.
    passes: tuple[str, ...] | None = ("hull", "bulwarks", "decks", "gunports",
                                      "stern", "rudder", "rails", "masts",
                                      "sails", "rigging", "cannons",
                                      "furniture", "dressing", "damage",
                                      "materials", "bake")
