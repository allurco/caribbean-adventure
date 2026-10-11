"""The ship-type model: what makes one hull a different ship from another.

Everything in here is DATA plus the rules that data must obey. It imports no
bpy and nothing from the rest of the package, so it is the bottom of the stack
and every other module may read it.

Four ships are planned — frigate, galleon, schooner, man-o-war — and this
module exists because the frigate was built with five of its distinguishing
features welded in as module constants:

    GUNPORTS_PER_SIDE = 11          one number, not a parameter
    gunport_row() -> int            ONE row of ports; a man-o-war has two or three
    MAST_TS = {fore, main, mizzen}  three masts; a schooner has two
    square rig throughout           a schooner is fore-and-aft
    GALLERY_WINDOWS = 5, two tiers  a galleon's stern castle is other massing

The hard one is the rig, and it is hard in a way that only shows up on the
LAST ship. Galleon and man-o-war are both square-rigged, so an abstraction
designed against them would quietly keep assuming a yard across a mast with a
trapezoid of canvas hanging symmetrically under it — and then the schooner
arrives and none of it fits. So the model here is built around a sail as FOUR
NAMED CORNERS and a set of spars, of which the square sail is one case; the
schooner's gaff mainsail and triangular headsails are in `SHIP_RIGS` now,
before any of them is built, as the standing proof that they fit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

# --- what a sail is ---------------------------------------------------------


class SparKind(Enum):
    """A piece of timber a sail is bent to."""

    YARD = "yard"                # athwartships, square sail hangs under it
    GAFF = "gaff"                # abaft the mast, head of a fore-and-aft sail
    BOOM = "boom"                # abaft the mast, foot of a fore-and-aft sail
    LATEEN_YARD = "lateen_yard"  # one long raking spar; the sail's whole luff


class EnsignKind(Enum):
    """The national colours a hull wears until she earns the black.

    THIS IS A SHIP PROPERTY AND IT USED TO BE A MODULE CONSTANT. `colours.py`
    argues the British Red Ensign of 1707-1800 over ninety lines and then
    hardcoded it, which made the un-earned colours state a FRIGATE detail
    inside a module whose own docstring says it is a ship-system rule. The
    argument is unchanged and still lives there; what is new is that it has a
    ship it is about. Every figure the device is drawn from is in flag-local
    coordinates, so a hull whose flag is a different shape gets the same
    ensign — the same discipline `device_coverage` already keeps.

    WHY EACH HULL WEARS THE ONE IT DOES, by the four tests `colours.py` sets:
    the flag she would really have worn; the false colours a pirate flew up to
    pistol-shot; a field that reads at thumbnail size against black; and a
    period pinned with no anachronism an audience would catch. The last one is
    what chooses between the two Spanish candidates, and it is decisive — a
    galleon is a 16th-17th century form, so the 1785 red-yellow-red bicolour
    would be exactly the anachronism the Red Ensign's own note refuses, for
    the same reason the 1801 Union is refused on the frigate.
    """

    RED_ENSIGN = "red_ensign"
    # The Cruz de Borgoña: a RAGGED red saltire on white, the flag Spain
    # fought under from 1506 through the Habsburgs and on into the 18th
    # century. Contemporary with a galleon by two hundred years, where the
    # bicolour misses her by two hundred.
    CROSS_OF_BURGUNDY = "cross_of_burgundy"


class SailKind(Enum):
    """The shapes of canvas this fleet needs.

    A sail is modelled as a quadrilateral with four NAMED corners:

        throat  luff/head    ----  peak   leech/head
          |                            |
        tack    luff/foot    ----  clew  leech/foot

    A triangular sail is that same quad with two corners coincident, and
    `degenerate_corner` says which pair, so nothing downstream has to guess.
    """

    SQUARE = "square"        # head laced to a yard, hangs athwartships
    GAFF = "gaff"            # four-sided fore-and-aft: gaff above, boom below
    LATEEN = "lateen"        # three-sided, on one long raking yard
    STAYSAIL = "staysail"    # three-sided, luff hanked to a stay. Jibs are these.
    # three-sided, set OVER a gaff sail: luff up the topmast, foot along the
    # gaff, the leech free. `sailplan._gaff_topsail_corners` says how its
    # corners are named to put those edges where the belly model wants them.
    GAFF_TOPSAIL = "gaff_topsail"


_FORE_AND_AFT = {
    SailKind.SQUARE: False,
    SailKind.GAFF: True,
    SailKind.LATEEN: True,
    SailKind.STAYSAIL: True,
    SailKind.GAFF_TOPSAIL: True,
}

_SPARS = {
    SailKind.SQUARE: (SparKind.YARD,),
    SailKind.GAFF: (SparKind.GAFF, SparKind.BOOM),
    SailKind.LATEEN: (SparKind.LATEEN_YARD,),
    # A staysail hangs on a STAY. A stay is standing rigging, not a spar, and
    # a model that insisted every sail had a spar could not express a jib.
    SailKind.STAYSAIL: (),
    # set flying on the topmast and the gaff below it: no spar of its own
    SailKind.GAFF_TOPSAIL: (),
}

# Which corner pair is coincident on a three-sided sail.
#   "head" — throat == peak. A staysail runs to a point at the masthead end.
#   "tack" — throat == tack. A lateen's luff IS its yard, running from a low
#            forward tack right up to the peak, so the forward corner is one
#            point and the sail widens aft.
_DEGENERATE = {
    SailKind.SQUARE: None,
    SailKind.GAFF: None,
    SailKind.STAYSAIL: "head",
    SailKind.LATEEN: "tack",
    SailKind.GAFF_TOPSAIL: "tack",
}

# The running rigging a sail of each kind needs in order to be worked. This is
# what makes the rope catalogue plural: `ropes.all_ropes` asks the rig what
# families it needs rather than assuming the square-rig set.
_ROPE_FAMILIES = {
    SailKind.SQUARE: (
        "brace", "lift", "footrope", "stirrup", "clewline", "buntline", "sheet",
    ),
    SailKind.GAFF: (
        "throat_halyard", "peak_halyard", "vang", "boom_sheet", "topping_lift",
    ),
    SailKind.LATEEN: (
        "lateen_halyard", "lateen_tack", "lateen_sheet", "vang",
    ),
    SailKind.STAYSAIL: (
        "staysail_halyard", "staysail_sheet", "downhaul",
    ),
    SailKind.GAFF_TOPSAIL: (
        "topsail_halyard", "topsail_sheet",
    ),
}


# Standing rigging a mast CASTS OFF on its LEE side because of the sail it
# sets. A lateen lies in the ship's centre plane and bellies ACROSS it, to
# leeward, so on the lee side its canvas fills exactly where a backstay from
# the masthead leads down aft to the channel; in practice the lee backstay of
# a lateen mast is let go and set up again on the other tack. Measured on the
# galleon's mizzen, the lee backstays cut the belly just abaft and above the
# slings and the windward pair cleared it by 0.85 m. Keyed on the SAIL KIND,
# never on the ship: a mast setting only square sails casts off nothing, so
# the frigate's rigging cannot move.
_CAST_OFF_TO_LEE = {
    SailKind.SQUARE: (),
    SailKind.GAFF: (),
    SailKind.LATEEN: ("backstay",),
    SailKind.STAYSAIL: (),
    SailKind.GAFF_TOPSAIL: (),
}


def cast_off_to_lee(kind: SailKind) -> tuple[str, ...]:
    """Standing-rigging families a mast setting `kind` does not set up to
    leeward. See `_CAST_OFF_TO_LEE`."""
    return _CAST_OFF_TO_LEE[kind]


def is_fore_and_aft(kind: SailKind) -> bool:
    """True if the sail's plane contains the ship's fore-and-aft axis.

    The one fact that decides almost everything else: a square sail's plane is
    athwartships and it bellies along the wind; a fore-and-aft sail's plane
    runs the length of the ship and it bellies ACROSS it, to leeward.
    """
    return _FORE_AND_AFT[kind]


def spars_for(kind: SailKind) -> tuple[SparKind, ...]:
    return _SPARS[kind]


def degenerate_corner(kind: SailKind) -> str | None:
    """Which corner pair is coincident, or None for a four-sided sail."""
    return _DEGENERATE[kind]


def rope_families(kind: SailKind) -> tuple[str, ...]:
    return _ROPE_FAMILIES[kind]


# --- the battery: rows, plural ----------------------------------------------


# --- the shape of the hull itself -------------------------------------------


@dataclass(frozen=True)
class HullForm:
    """The exponents and fractions that make one hull a different SHAPE.

    These were module constants in `profiles` with a leading underscore, which
    is the same class of blocker as the five named in the module docstring and
    was simply not visible until a second hull wanted a different one of them.
    A frigate has a FINE entry and a long easy run; a galleon has a BLUFF bow,
    a fuller run and far heavier tumblehome, and none of that is expressible by
    changing length, beam and draft alone.

    Defaults are the frigate's, verbatim, so a ship that states nothing here
    gets the hull that shipped.
    """

    entry_exp: float = 1.35       # >1 a fine entry; <1 a bluff, apple-cheeked bow
    run_exp: float = 1.8          # how late the run starts taking width off
    run_loss: float = 0.38        # transom half-beam lost, as a fraction of the max
    stem_fraction: float = 0.08   # half-beam at the stem, over the maximum
    sheer_exp: float = 2.0        # 2.0 is a parabola over the whole length;
                                  # higher keeps the waist flat and throws the
                                  # rise into the ends, which is what both
                                  # galleon references show
    tumble_at_deck: float = 0.11  # topsides drawn in by this much at deck level
    tumble_exp: float = 1.25      # how fast the tumblehome takes hold with height
    bulwark_tumble: float = 0.06  # extra inward lean per metre of bulwark height
    # And how far that lean is ALLOWED to take the topsides in, as a fraction
    # of their width at the sheer. `bulwark_half_width` extrapolates
    # `bulwark_tumble` linearly with height and had no floor, which the
    # frigate never found out because her topsides only stand 1.60 m above
    # her sheer and lose 9.6% doing it. A galleon's stern castle stands 6.00 m
    # above the sheer at the taffrail, so the same formula took the transom in
    # by 60% — and at 10 m it would take it through the centreline and out the
    # other side.
    #
    # 0.0 is NO FLOOR, which is the frigate's and never binds on her. 0.52 is
    # "just over half the width it has at the sheer", and the argument for it
    # is that a side which has drawn in past half its own width at the deck
    # has stopped being tumblehome and become a pyramid.
    tumble_floor: float = 0.0
    forefoot_span: float = 0.18   # stations over which the keel rises into the stem
    forefoot_rise: float = 4.2    # how far it rises there
    tuck_span: float = 0.28       # stations over which it rises into the tuck
    tuck_rise: float = 1.3
    bilge_root: float = 2.2       # turn of bilge at the stem
    bilge_slope: float = 1.2      # and how much harder it gets by the transom

    def validate(self) -> None:
        if self.sheer_exp < 1.0:
            raise ValueError(
                f"sheer_exp below 1 would put a CORNER in the sheer amidships, "
                f"got {self.sheer_exp}")
        for name in ("entry_exp", "run_exp", "tumble_exp", "bilge_root"):
            if getattr(self, name) <= 0:
                raise ValueError(f"HullForm.{name} must be positive")
        if not 0.0 < self.stem_fraction < 1.0:
            raise ValueError(
                f"stem_fraction must lie in (0, 1), got {self.stem_fraction}")
        if not 0.0 <= self.run_loss < 1.0:
            raise ValueError(f"run_loss must lie in [0, 1), got {self.run_loss}")
        if not 0.0 <= self.tumble_at_deck < 1.0:
            raise ValueError(
                f"tumble_at_deck must lie in [0, 1), got {self.tumble_at_deck}")


FRIGATE_HULL = HullForm()


# --- the shape of the ship's HEAD -------------------------------------------


# The frigate's knee of the head, as (height, projection) pairs: height as a
# fraction of forefoot-to-stem-head, projection as a fraction of the knee's
# own reach. A cutwater RAKES — its projection grows with height almost all
# the way up — so the forward edge is a concave sweep from the forefoot to the
# beak and only tucks back where the figure takes over.
FRIGATE_KNEE = (
    (0.00, 0.00),   # the gripe, where the knee meets the forefoot
    (0.15, 0.10),
    (0.35, 0.28),
    (0.55, 0.50),
    (0.75, 0.76),
    (0.90, 1.00),   # the beak
    (1.00, 0.88),   # the stem head, where the figure takes over
)

# The galleon's. A galleon's beak is LONGER and LOWER: the maximum projection
# comes later up the stem and the head does not tuck back at the top, because
# a galleon's beakhead is a structure thrust out ahead of the ship rather than
# a fin let into its stem.
GALLEON_KNEE = (
    (0.00, 0.00),
    (0.12, 0.13),
    (0.30, 0.36),
    (0.50, 0.60),
    (0.68, 0.81),
    (0.86, 1.00),
    (1.00, 0.95),
)


@dataclass(frozen=True)
class HeadForm:
    """How far the ship's head reaches ahead of its stem, and how boldly.

    `frigate.head` used to carry twenty of these as module constants and
    `frigate.profiles` another eight as TRAILBOARD_*. That was the same class
    of blocker as `HullForm`: a galleon's head is not a frigate's head scaled,
    it is a far longer and bolder structure, and none of that is expressible
    by changing length and beam.

    EVERY LENGTH HERE IS STATED AGAINST A NAMED LANDMARK OF THE HULL IT IS
    BUILT ON, never as an absolute ship coordinate. The two landmarks are:

      * THE STEM AT THE RAIL — `profiles.station_y(p, 0.0)`;
      * THE RAIL CAP AT THE STEM — `profiles.sheer(p, 0.0) + p.bulwark_h`.

    On the frigate those are y = 19.00 m and z = 5.50 m above the waterline,
    and the four trailboard offsets below reproduce the frozen literals
    (18.10, 4.30) and (19.35, 3.66) EXACTLY in IEEE double arithmetic — which
    is checked, not hoped for, by `tests/test_frigate_frozen.py`.

    Defaults are the frigate's, verbatim.
    """

    # --- the trailboard, which is also the head rail: ONE fair curve --------
    board_aft_abaft_stem: float = 0.90   # aft end, abaft the stem at the rail
    board_aft_below_cap: float = 1.20    # aft end, below the rail cap at the stem
    board_fwd_fwd_of_stem: float = 0.35  # fwd end, forward of the stem at the rail
    board_fwd_below_cap: float = 1.84    # fwd end, below the rail cap at the stem
    board_exp: float = 2.6               # >1 flattens the curve forward
    board_stations: int = 7
    board_proud: float = 0.055           # outer face, off the bow planking
    board_thick: float = 0.070           # athwartships
    board_tuck: float = 0.50             # the board draws in to this, at the figure
    board_depth: tuple = (0.300, 0.200)  # upper edge to lower edge, aft and fwd

    # --- the two head rails -------------------------------------------------
    headrail_stations: int = 7   # along the lower rail, bulwark cap to trailboard
    upper_stations: int = 9      # along the upper rail, ship's rail to figurehead
    upper_exp: float = 2.0       # >1 flattens the upper rail forward
    upper_thick: float = 0.075   # athwartships, outer face to inner
    upper_heel_thick: float = 0.11   # the heel alone, broadened into a scarph
    upper_depth: float = 0.18    # upper edge to lower edge
    upper_land_fwd_frac: float = 0.37  # where it dies, into the FIGURE's own bbox
    upper_land_z_frac: float = 0.54

    # --- the head timbers between the two rails -----------------------------
    head_timbers: int = 4
    timber_thick: float = 0.075
    timber_fore_aft: float = 0.10
    timber_sink: float = 0.035   # let INTO each rail, so it is framed, not stacked
    timber_first: float = 0.10   # first timber, as a fraction along the rails
    timber_last: float = 0.74

    # --- the knee of the head -----------------------------------------------
    knee_half: float = 0.13          # half its athwartships thickness
    knee_into_stem: float = 0.10     # how far it is let into the stem
    knee_reach_frac: float = 0.20    # max projection / forefoot-to-stem-head
    knee_outline: tuple = FRIGATE_KNEE
    # Where the knee's TOP runs. Off (the frigate's): level at the stem head
    # out to the beak, as `knee_outline`'s top ring lays it. On: it falls
    # with the BUILT upper head rail, `head.knee_rail_offset` under the
    # rail's inboard top edge, so the beakhead flight passes over it
    # unsplit. That offset is the flight's own, so a ship setting this must
    # also plan a beakhead deck.
    knee_under_rail: bool = False

    # --- the beakhead bulkhead ----------------------------------------------
    beakhead_thick: float = 0.14     # fore and aft
    beakhead_into_side: float = 0.06  # let into each bulwark's inboard face
    beakhead_sink: float = 0.09      # let down into the forecastle platform
    beakhead_cap_t: float = 0.12     # the cap timber across its head
    beakhead_cap_out: float = 0.05   # how far that cap overhangs the wall

    # --- the beakhead DECK: a planked platform forward of the stem ----------
    # OFF by default, so a head form that does not ask for one -- the
    # frigate's -- plans and emits nothing new. Every figure below is read
    # only when `beakhead_deck` is True. See `head.beakhead_deck_outline` for
    # what each is measured between.
    # These sizes were set on the galleon's head; a ship that sets the flag
    # should state her own, as `GALLEON_HEAD` does.
    beakhead_deck: bool = False
    # sections the first platform's outline is sampled at, stem to fwd end
    deck_stations: int = 7
    deck_thick: float = 0.070    # platform top to its frame's underside
    # a frame timber's width, ledge face to ledge face (see GALLEON_HEAD)
    deck_ledge: float = 0.035
    # a grating card's edge to the inner face of the ledge around it
    deck_grating_gap: float = 0.003
    # off the knee's top, and off the rails' inboard face
    deck_clear: float = 0.020
    # aft edge, forward of the stem at the rail
    deck_stem_clear: float = 0.030
    # rail's inboard top edge above the deck top, at the platform's fwd end
    deck_rail_rise: float = 0.120

    def validate(self) -> None:
        if self.board_aft_abaft_stem <= 0.0:
            raise ValueError(
                "the trailboard's AFT end must lie abaft the stem at the rail, "
                f"got {self.board_aft_abaft_stem} m abaft it")
        if self.board_fwd_fwd_of_stem <= 0.0:
            raise ValueError(
                "the trailboard's FORWARD end must lie forward of the stem at "
                f"the rail, got {self.board_fwd_fwd_of_stem} m forward of it")
        if self.board_fwd_below_cap <= self.board_aft_below_cap:
            raise ValueError(
                "the head curve must FALL going forward: the aft end stands "
                f"{self.board_aft_below_cap} m below the rail cap at the stem "
                f"and the forward end only {self.board_fwd_below_cap} m, so "
                "the board would rise towards the figure")
        for name in ("board_exp", "upper_exp"):
            if getattr(self, name) < 1.0:
                raise ValueError(
                    f"HeadForm.{name} below 1 puts a CORNER in a rail that has "
                    f"to be fair, got {getattr(self, name)}")
        for name in ("board_stations", "headrail_stations", "upper_stations"):
            if getattr(self, name) < 3:
                raise ValueError(
                    f"HeadForm.{name} must be at least 3, got {getattr(self, name)}")
        if self.head_timbers < 2:
            raise ValueError(
                f"HeadForm.head_timbers must be at least 2, got {self.head_timbers}")
        if not 0.0 < self.board_tuck <= 1.0:
            raise ValueError(f"board_tuck must lie in (0, 1], got {self.board_tuck}")
        if not 0.0 < self.knee_reach_frac < 1.0:
            raise ValueError(
                f"knee_reach_frac must lie in (0, 1), got {self.knee_reach_frac}")
        if not 0.0 <= self.timber_first < self.timber_last <= 1.0:
            raise ValueError(
                "the head timbers must run forward along the rails: got "
                f"first {self.timber_first}, last {self.timber_last}")
        heights = [h for h, _r in self.knee_outline]
        if heights != sorted(heights) or heights[0] != 0.0 or heights[-1] != 1.0:
            raise ValueError(
                "knee_outline must climb from the forefoot (0.0) to the stem "
                f"head (1.0) without going back down, got {heights}")
        if max(r for _h, r in self.knee_outline) != 1.0:
            raise ValueError(
                "knee_outline's widest projection must be 1.0 — it is a "
                "fraction of the knee's own reach, which is what sets the scale")
        if self.knee_under_rail and not self.beakhead_deck:
            raise ValueError(
                "HeadForm.knee_under_rail hangs the knee's top under the "
                "upper head rail by the beakhead flight's own offset, so it "
                "needs beakhead_deck set")
        if self.beakhead_deck:
            if self.deck_stations < 3:
                raise ValueError(
                    "HeadForm.deck_stations must be at least 3, got "
                    f"{self.deck_stations}")
            if not 0.0 < self.deck_stem_clear <= 0.05:
                raise ValueError(
                    "HeadForm.deck_stem_clear is the gap between the "
                    "platform's "
                    "aft edge and the stem, and must lie in (0, 0.05] m; got "
                    f"{self.deck_stem_clear}")
            for name in ("deck_thick", "deck_ledge", "deck_grating_gap",
                         "deck_clear", "deck_rail_rise"):
                if getattr(self, name) <= 0.0:
                    raise ValueError(
                        f"HeadForm.{name} must be positive, got "
                        f"{getattr(self, name)}")


FRIGATE_HEAD = HeadForm()


# --- the stern, which is the galleon's whole postcard ------------------------


@dataclass(frozen=True)
class GalleryTier:
    """One band of stern windows standing out from the transom.

    `foot` and `head` are offsets above THE STERN SHEER — the deck edge at
    station 1.0 — so a negative number is below it. The frigate's one gallery
    hangs below its sheer and is declared by `gallery_drop`/`gallery_head`
    rather than here, because those two names are what its own comments and
    checks have always called it. This list is the EXTRA tiers a castle ship
    carries up its transom, which is the thing a flush-decked hull has no
    room for and a galleon is famous for.
    """

    name: str
    foot: float
    head: float
    windows: int

    def validate(self) -> None:
        if self.head <= self.foot:
            raise ValueError(
                f"gallery tier {self.name!r} has its head at {self.head} and its "
                f"foot at {self.foot}, both above the stern sheer: a band must "
                "stand up, not down")
        if self.windows < 1:
            raise ValueError(
                f"gallery tier {self.name!r} needs at least one light, got "
                f"{self.windows}")


@dataclass(frozen=True)
class ChasePlatform:
    """A heavy timber platform locally off the main deck, under the stern
    chasers' carriages (the maintainer's third ruling, A'). Its figures are not here
    because none of them is chosen: R11 lays it at Deck_Main's LEVEL AT THE
    CHASERS' STATION, from Deck_Main's end aft to the hull's end cap, its
    edges let into the bulwark where it stands over the sheer and carried
    to the hull skin below it, planked `plank_thick` like a deck on beams
    and carlings sized off the deck's plank rule and the carriage's trucks
    (`profiles.chase_platform_*`).

    Two figures are RULES rather than measurements. `footprint_margin`:
    every chaser's CARRIAGE FOOTPRINT (cheek ends fore and aft, the trucks'
    outer faces athwartships) must stand at least this far inside the
    platform's edges; 0.10 m is a truck that runs back off its bed by under
    its own radius (0.14) still bearing on planking. `skin_clearance`: how
    far short of the hull's skin and end cap the planking stops where it
    stands below the sheer.
    """

    footprint_margin: float = 0.10
    # PLATFORM EDGE to HULL SKIN, and PLATFORM AFT EDGE to the HULL'S END
    # CAP, below the sheer, where the side has ONE skin and nothing else to
    # butt (final review 3, I-2; ruling 3869). Also the depth of the riser
    # that closes Deck_Main's end down to PLATFORM TOP. Positive, so the
    # platform never touches the Hull: `Chase_Platform x Hull` is unruled
    # and any pair there fails. 0.04 m, measured in Blender: the RENDERED
    # skin stands within 0.0012 m inboard of the cage
    # (`profiles.hull_half_width`) at PLATFORM TOP from y -15.79 to -16.99,
    # but the Stern_Gallery's quarter badge is let into the side there
    # (its section is centred 0.08 inside the skin) and its hood's facets
    # stand up to 0.026 m inside the cage within the platform's plank
    # depth (at x 2.629, y -16.306, z 5.33). At 0.01 the planking met
    # them (Chase_Platform x Stern_Gallery, 6 face pairs); 0.04 stands it
    # 0.014 m clear of the deepest.
    skin_clearance: float = 0.04

    def validate(self) -> None:
        if self.footprint_margin < 0.0:
            raise ValueError(
                "ChasePlatform.footprint_margin must not be negative, got "
                f"{self.footprint_margin}")
        if self.skin_clearance <= 0.0:
            raise ValueError(
                "ChasePlatform.skin_clearance must be positive (a platform "
                f"at the skin touches the Hull), got {self.skin_clearance}")


@dataclass(frozen=True)
class SternForm:
    """How a ship's stern is dressed. Defaults are the frigate's, verbatim.

    Fourteen of these were module constants in `profiles` and twelve more in
    `stern`. They are here for the same reason `HullForm` and `HeadForm` are:
    a galleon's stern is not a frigate's stern scaled. The frigate's topmost
    rail at her own taffrail stands 5.20 m above the water, 13.7% of her
    length; the galleon's poop rail cap at ITS taffrail stands 11.80 m, 34.7%
    of its own. That is the type, and it is carried by numbers, not by code.
    """

    # the one gallery every ship has, below its own stern sheer
    gallery_drop: float = 1.90      # band FOOT, below the stern sheer
    gallery_head: float = 0.35      # band HEAD, below the stern sheer
    gallery_margin: float = 0.25    # frame timber, wall edge to transom edge
    gallery_depth: float = 0.30     # how far the wall stands aft of the transom
    window_mullion: float = 0.14    # timber between two lights, and at each end
    window_inset_z: float = 0.18    # frame above a head and below a sill
    window_recess: float = 0.22     # glazing set in behind the frame
    dentil_drop: float = 0.26       # the dentil course, below the band's foot

    # the EXTRA tiers, up the transom of a castle ship
    upper_galleries: tuple = ()

    # the quarter badges
    badge_t: float = 0.975          # station, just forward of the transom
    badge_facets: int = 6
    badge_bulge: float = 0.42       # outboard of the hull skin
    badge_mould: float = 0.07       # the wall set in, so flanges read as moulding
    badge_lights: int = 3
    badge_hood: float = 0.18

    # the window band's own joinery
    pilaster_w: float = 0.12
    pilaster_proud: float = 0.10
    muntin: float = 0.045
    muntin_proud: float = 0.05
    window_band_h: float = 0.09
    modillions: int = 13
    dentils: int = 15
    moulding_depth: float = 0.16
    moulding_h: float = 0.16
    moulding_overhang: float = 0.22

    # the carved work above the sheer
    carving_proud: float = 0.14
    # How far out toward the transom's own edge the carved work on the WAIST
    # panel reaches, as a multiple of the frigate's layout. 1.0 is that
    # layout, exactly, so the frigate does not move a float.
    #
    # It exists because the waist panel's blocks are laid out on the
    # transom's width AT THEIR OWN MID HEIGHT, and that is only safe while
    # the transom tumbles gently. The frigate's tumbles 0.06 m per metre of
    # height; the galleon's tumbles 0.10, and its frieze is 1.29 m tall
    # against the frigate's 0.84, so the frieze's TOP corners stood 68 mm
    # outboard of the panel they are carved on. `check_stern` caught it.
    carving_edge: float = 1.0
    carving_dentils: int = 23
    carving_panels: int = 7
    name_board_bosses: int = 9
    # and on each EXTRA transom panel a castle ship carries
    upper_dentils: int = 17
    upper_panels: int = 5

    # WHAT THE STERN CHASE PORTS' SILL IS MEASURED FROM. "sheer" is the
    # frigate's rule, verbatim: the chase row's own sill above the SHEER AT
    # THE TRANSOM, so the chase ports line up with her broadside row. Her
    # chaser clears it by 0.17 m because her sheer barely climbs aft.
    # "deck_at_gun" measures `chase_sill` above the DECK AT THE GUN -- the
    # chasers' own carriage floor at their breech station -- which is how
    # The maintainer's R3 rules every other sill (above the SERVING DECK). A ship
    # whose sheer climbs hard aft needs it: see GALLEON_STERN.
    chase_sill_datum: str = "sheer"
    chase_sill: float | None = None
    # A CHASE PLATFORM under the chasers' carriages, or None. None is the
    # frigate's, verbatim: her chasers stand abaft her deck end in the air
    # by design (her after truck 1.11 m abaft Deck_Main's end), her barrels
    # clear their sills, and her digest holds. A ship whose sheer climbs
    # hard aft over the run from her deck end to her transom needs one:
    # see GALLEON_STERN.
    chase_platform: ChasePlatform | None = None

    def validate(self) -> None:
        if self.chase_sill_datum not in ("sheer", "deck_at_gun"):
            raise ValueError(
                "chase_sill_datum is 'sheer' or 'deck_at_gun', got "
                f"{self.chase_sill_datum!r}")
        if (self.chase_sill_datum == "deck_at_gun") != (
                self.chase_sill is not None):
            raise ValueError(
                "a chase sill measured above the deck at the gun needs its "
                "own `chase_sill`, and only then")
        if self.chase_platform is not None:
            if self.chase_sill_datum != "deck_at_gun":
                raise ValueError(
                    "a chase platform is laid at the deck at the gun, so its "
                    "chase sill must be measured there (chase_sill_datum "
                    "'deck_at_gun'), not on the sheer")
            self.chase_platform.validate()
        for tier in self.upper_galleries:
            tier.validate()
        for a, b in zip(self.upper_galleries, self.upper_galleries[1:]):
            if b.foot < a.head - 1e-9:
                raise ValueError(
                    f"gallery tiers {a.name!r} and {b.name!r} overlap: "
                    f"{a.name} runs to {a.head} and {b.name} starts at {b.foot}")
        if self.gallery_head >= self.gallery_drop:
            raise ValueError(
                "the gallery's HEAD must stand above its FOOT, so measured DOWN "
                f"from the sheer the head's {self.gallery_head} must be the "
                f"smaller of the two, got foot {self.gallery_drop}")
        for name in ("gallery_margin", "gallery_depth", "window_mullion",
                     "window_recess", "badge_bulge", "carving_proud"):
            if getattr(self, name) <= 0.0:
                raise ValueError(f"SternForm.{name} must be positive")
        if self.badge_facets < 3:
            raise ValueError(
                f"a badge needs at least three facets, got {self.badge_facets}")
        if self.badge_lights > self.badge_facets:
            raise ValueError(
                f"{self.badge_lights} lights do not fit in {self.badge_facets} "
                "facets of badge")
        if self.badge_mould >= self.badge_bulge:
            raise ValueError(
                f"badge_mould ({self.badge_mould}) must be less than "
                f"badge_bulge ({self.badge_bulge}), or the moulding is the bay")


FRIGATE_STERN = SternForm()


# --- the rails, the channels and the chainplates -----------------------------


@dataclass(frozen=True)
class RailForm:
    """What runs along the sheer. Defaults are the frigate's, verbatim.

    Twenty of these were module constants in `profiles` and two in `rails`,
    and the ones that matter are the CHANNEL and the CHAINPLATE, because both
    are placed against the BATTERY and the frigate has one row of ports where
    a galleon has two. A channel is bolted on above the uppermost row's head;
    a chainplate foot has to land below the LOWEST row's sill, and on a
    galleon that is 1.93 m further down than on a frigate.
    """

    # the open rail over a platform that has nothing else round its edge
    stanchion_w: float = 0.09     # square section of a stanchion; layout, not trim
    guard_h: float = 1.00         # rail top above the DECK EDGE it guards
    min_proud: float = 0.30       # and never less than this above the bulwark cap
    spacing: float = 1.30         # nominal stanchion pitch; the run divides it
    end_in: float = 0.03          # the rail stops this far short of stem and taffrail
    rail_w: float = 0.11          # top rail, athwartships
    rail_t: float = 0.09          # top rail, vertically
    midrail_w: float = 0.085
    midrail_t: float = 0.065
    # Where the middle rail rides, between the bulwark cap under it and the
    # underside of the top rail over it. BELOW HALF on purpose: the gap a man
    # falls through is the LOWER one, so it is the one that must be smaller.
    mid_frac: float = 0.46

    # the chain-wales
    channel_projection: float = 0.85   # outboard of the bulwark
    channel_thick: float = 0.16
    channel_drop: float = 0.10         # channel TOP below the rail cap
    channel_fwd: float = 0.35          # of its length, forward of its own mast
    # (mast, castle deck tier, CASTLE CHANNEL EDGE to STRAP FOOT) for each
    # channel bolted to a CASTLE wall instead of the waist bulwark; its
    # straps run down that wall to the hull, so they carry a drop of their
    # own. Empty on the frigate, verbatim: all three of her channels are on
    # the bulwark and every strap falls `chainplate_drop`.
    castle_channels: tuple = ()

    # the chainplates
    chainplate_drop: float = 1.25      # channel edge DOWN to the strap's foot
    chainplate_rake: float = 0.12      # aft, per metre of fall
    chainplate_margin: float = 0.18    # end clearance along the channel's edge
    strap_half_w: float = 0.065        # half the strap's fore-and-aft width
    strap_clear: float = 0.04          # margin between a strap edge and a port's
    strap_min_gap: float = 0.22        # closest two straps on one channel may be
    strap_w: float = 0.13              # the emitted strap, fore and aft
    strap_thick: float = 0.045         # the emitted strap, athwartships
    # How far the strap's foot is let INTO the planking it is bolted to.
    # 0.0 on the frigate, verbatim: her feet land on the bulwark. A foot on
    # the HULL below the creased gunwale sits on a Catmull-Clark skin that
    # the subsurf draws up to 1.9 mm inboard of its cage, so a foot laid on
    # the cage floats; it is let in instead.
    strap_bed: float = 0.0

    def validate(self) -> None:
        for name in ("stanchion_w", "guard_h", "spacing", "rail_w", "rail_t",
                     "channel_projection", "channel_thick", "chainplate_drop",
                     "strap_w", "strap_thick"):
            if getattr(self, name) <= 0.0:
                raise ValueError(f"RailForm.{name} must be positive")
        if not 0.0 < self.mid_frac < 1.0:
            raise ValueError(f"mid_frac must lie in (0, 1), got {self.mid_frac}")
        if not 0.0 < self.channel_fwd < 1.0:
            raise ValueError(
                f"channel_fwd must lie in (0, 1), got {self.channel_fwd}")
        if not 0.0 <= self.strap_bed < self.strap_thick:
            raise ValueError(
                f"strap_bed {self.strap_bed} must lie in [0, strap_thick "
                f"{self.strap_thick}): a foot let in deeper than the strap "
                "is thick is buried, not bedded")
        if self.chainplate_rake < 0.0:
            raise ValueError("a chainplate rakes AFT or not at all, never forward")
        if 2.0 * self.strap_half_w > self.strap_min_gap:
            raise ValueError(
                f"two straps {self.strap_min_gap} m apart overlap at "
                f"{2 * self.strap_half_w} m wide")

    def clears_battery(self, p) -> tuple[float, float]:
        """(channel underside above the top port head, strap foot below the
        lowest sill), both in metres above the sheer, for THIS ship's battery.

        Positive is clear. A frigate with one row and a galleon with two ask
        the same question of the same two numbers; only the answers differ.
        """
        rows = [d for d in p.gun_decks if d.host == "bulwark"]
        top_head = max(d.head for d in rows)
        low_sill = min(d.sill for d in rows)
        channel_bottom = p.bulwark_h - self.channel_drop - self.channel_thick
        foot = p.bulwark_h - self.channel_drop - self.chainplate_drop
        return (channel_bottom - top_head, low_sill - foot)


FRIGATE_RAILS = RailForm()


# --- what stands on deck, and what a battle leaves -------------------------

# THE FRIGATE'S DECK PLAN, verbatim. It was `profiles.FURNITURE`, a module
# constant, and every station in it is a measurement on HER decks: the wheel
# at t 0.845 abaft her mizzen on her quarterdeck, barrels in the gaps of HER
# eleven ports. `profiles.FURNITURE` still names this table.
FRIGATE_FURNITURE_STATIONS = (
    # kind,        t,     x as a fraction of the deck half-width, yaw
    ("wheel",      0.845, 0.00,  0.0),
    ("capstan",    0.520, 0.00,  0.0),
    ("hatch_fore", 0.300, 0.00,  0.0),
    ("hatch_main", 0.440, 0.00,  0.0),
    ("hatch_aft",  0.700, 0.00,  0.0),
    ("boat",       0.385, 0.00,  0.0),
    # Every barrel station is the MIDPOINT of a gap between two gunport
    # stations (`gunport_ts`: 0.220, 0.282, 0.344 ... 0.840). Two of them used
    # to stand 0.53 m from a gun and 94 face pairs inside its carriage, which
    # no check could see until `check_intersections`. A gun crew needs its
    # station clear, so the rule is "barrels stow in the gaps", not "barrels
    # stow 0.009 further forward than they did".
    ("barrel",     0.251, -0.66, 0.0),   # between ports 1 and 2
    ("barrel",     0.251, 0.66,  0.0),
    ("barrel",     0.313, -0.70, 0.0),   # between ports 2 and 3
    ("barrel",     0.313, 0.70,  0.0),
    ("barrel",     0.623, -0.66, 0.0),   # between ports 7 and 8
    ("barrel",     0.623, 0.66,  0.0),
    ("barrel",     0.685, -0.70, 0.0),   # between ports 8 and 9
    ("barrel",     0.685, 0.70,  0.0),
)


@dataclass(frozen=True)
class FurniturePlan:
    """Where each loose fitting stands. Defaults are the frigate's, verbatim.

    A station is MEASURED ON ONE SHIP'S DECKS -- her mast stations, her
    castle breaks, her port columns, her fore channel -- so it is data on
    that ship and not a module constant every hull inherits. The shapes of
    the fittings are not here: a barrel is a barrel on any ship.
    """

    stations: tuple = FRIGATE_FURNITURE_STATIONS
    # Station of the catted anchors. The frigate's 0.112 is the station that
    # clears HER fore channel (`test_the_anchor_hangs_clear_of_the_fore_
    # channel`).
    anchor_t: float = 0.112
    lanterns: int = 3             # on the taffrail
    lantern_spread: float = 0.62  # of the transom half-width at the rail
    boat_on_skids: float = 1.35   # deck (centreline) to the launch's gunwale

    def validate(self) -> None:
        kinds = [k for k, *_ in self.stations]
        for need in ("wheel", "capstan", "boat"):
            if kinds.count(need) != 1:
                raise ValueError(f"a deck plan has exactly one {need}, "
                                 f"got {kinds.count(need)}")
        for kind, t, x_frac, _yaw in self.stations:
            if not 0.0 <= t <= 1.0:
                raise ValueError(f"{kind} at t {t} is off the ship")
            if not -1.0 < x_frac < 1.0:
                raise ValueError(f"{kind} at x_frac {x_frac} is off its deck")
        if not 0.0 < self.anchor_t < 1.0:
            raise ValueError(f"anchor_t must lie in (0, 1), got "
                             f"{self.anchor_t}")
        # NONE IS A COUNT: a sloop's boom overhangs her taffrail, where a
        # lantern would stand in its sweep.
        if self.lanterns < 0 or not 0.0 <= self.lantern_spread < 1.0:
            raise ValueError("lanterns must not be negative, spread in [0, 1)")
        if self.boat_on_skids <= 0.0:
            raise ValueError("the launch is stowed ABOVE the deck")


FRIGATE_FURNITURE = FurniturePlan()


@dataclass(frozen=True)
class LiveryForm:
    """Where a ship's black wales are painted. Defaults are the frigate's,
    verbatim: her one wale at `palette.MAIN_WALE`.

    `wales_between_rows` is the galleon's rule (the maintainer's third ruling, C):
    the wales run BETWEEN the port rows, a MAIN WALE centred between the
    hull row's head and the waist row's sill and a LOWER WALE as far under
    the hull row's sill, each the frigate's own wale depth.
    `palette.wale_bands` derives them from the row figures.
    """

    wales_between_rows: bool = False

    def validate(self) -> None:
        if not isinstance(self.wales_between_rows, bool):
            raise ValueError("wales_between_rows must be a bool")


FRIGATE_LIVERY = LiveryForm()
GALLEON_LIVERY = LiveryForm(wales_between_rows=True)


@dataclass(frozen=True)
class DamageForm:
    """How the damage pass keeps its shot scars off the gunports.

    `scar_clear` names the RULE. The frigate's, verbatim, is "port_column":
    a scar within one port width of a port's station must stand more than
    1.4 m under the sheer. Her ports are all in the bulwark, above the
    sheer, so that band keeps every scar off them with room to spare. It
    cannot serve a ship with a row cut in the HULL: the galleon's main-row
    apertures stand SHEER - 1.17 to SHEER - 0.47, inside the very band the
    scars are drawn from, and a scar 1.5 m under her sheer lands on a sill.

    "aperture" judges each scar against every aperture's own box, both rows:
    SCAR CENTRE to the NEAREST POINT of the aperture must exceed the largest
    radius a scar is drawn at plus `scar_margin` (the open lid's hinge leaf
    lies along the head). The same reach is kept from every CHAINPLATE
    STRAP, less its half width: a hull row's ship lands her strap feet on
    the hull, inside the scar band, where a frigate's stop on the bulwark.
    """

    scar_clear: str = "port_column"
    scar_margin: float = 0.0
    # SAME-SIDE SCAR RIM to SCAR RIM, at least: two scars on one side stand
    # their CENTRES at least their RADIUS SUM plus this apart, so no crater
    # is cut across another. ON FOR EVERY SHIP, the frigate included: her
    # nine scars already clear it (her closest same-side pair stands 1.392 m
    # rim to rim) so the rule rejects none of her draws and her seeded
    # placement is untouched, which `FRIGATE_SCARS_SHA1` proves.
    scar_spacing: float = 0.10
    # A SECOND BAND, or None: the NAME of a hull-cut gun deck row whose
    # gaps between ports the damage pass also draws scars in, at the row's
    # own height (sill to head), every one still judged by the rules above.
    # None is the frigate's, verbatim: her ports are all in the bulwark and
    # her nine scars are drawn from one band, `FRIGATE_SCARS_SHA1`. The
    # draws alternate between the bands, the topside first, so a ship with
    # none draws exactly as she always did.
    between_ports: str | None = None

    def validate(self) -> None:
        if self.scar_clear not in ("port_column", "aperture"):
            raise ValueError(f"unknown scar rule {self.scar_clear!r}")
        if self.between_ports is not None and (
                not isinstance(self.between_ports, str)
                or not self.between_ports):
            raise ValueError(
                "between_ports names a gun deck row, got "
                f"{self.between_ports!r}")
        if self.between_ports is not None and self.scar_clear != "aperture":
            raise ValueError(
                "a band between a row's ports is judged by the 'aperture' "
                "rule, port by port")
        if self.scar_margin < 0.0:
            raise ValueError("scar_margin must not be negative")
        if self.scar_spacing < 0.0:
            raise ValueError("scar_spacing must not be negative")

# THE GALLEON'S. Two numbers carry the whole difference and both are forced by
# the battery, with both endpoints of each named.
#
# THE CHANNEL. Its underside must clear the head of the UPPERMOST row. On the
# frigate: bulwark 1.60, channel top 0.10 below the cap, plate 0.16 thick, so
# the underside is 1.34 above the sheer against a port head at 1.30 — 0.04 m
# of clearance, which the ledger records as having been found the hard way.
# On the galleon the bulwark row's head is at 1.47 and the cap at 1.90, so
# the same drop and a thicker 0.20 m plate put the underside at 1.58: 0.11 m
# clear, nearly three times the frigate's margin. (2.02 / 2.45 / 2.13 before
# the lower battery left the bulwark, the maintainer's ruling 2026-10-05; the margin
# did not move, because the cap is derived from the row under it.)
#
# THE CHAINPLATE. Its foot must land BELOW the lowest BULWARK row's sill,
# because a strap that stops above a gunport is a strap bolted to a hole.
# The frigate's lowest sill is 0.55 above the sheer and her 1.25 m drop
# from a channel edge at 1.50 puts the foot at 0.25 — 0.30 m of clearance.
# The galleon's lowest BULWARK sill is the waist row's 0.85 and her channel
# edge is at 1.78, so 2.20 m puts the foot at -0.42, on the hull, 1.27 m
# under that sill. Her lower row is cut in the HULL with its head at -0.47,
# and the foot stops ABOVE it: the maintainer's third ruling (A), derived (R11) as
# the largest drop to the cm whose every foot beside that row stops
# `strap_clear` 0.04 over its PORT HEAD and whose every strap clears every
# hull lid's sweep by as much (`profiles.largest_chainplate_drop`: fore
# 2.21, main 2.20). It was 2.40, with the foot 0.13-0.20 m BELOW that head
# and two lids a side crossing their straps.
GALLEON_RAILS = RailForm(
    stanchion_w=0.10,
    guard_h=1.00,
    rail_w=0.13,
    rail_t=0.10,
    midrail_w=0.10,
    midrail_t=0.075,
    channel_projection=0.95,
    channel_thick=0.20,
    channel_drop=0.12,
    channel_fwd=0.33,
    # THE MIZZEN CHANNEL ON THE QUARTERDECK CASTLE (the maintainer's third ruling,
    # B). It hung under the waist cap, and its aftmost shroud a side ran
    # THROUGH Deck_Quarter's planking under the poop. On the castle wall it
    # is SHEER + 4.28 at its top (QUARTERDECK EDGE 3.40 + castle bulwark
    # 1.00 - channel_drop 0.12), 0.68 above that deck's edge at its
    # underside, and its straps fall 4.62 m from its edge to the hull:
    # A's rule, derived, `profiles.largest_chainplate_drop(p, "mizzen")`.
    castle_channels=(("mizzen", "Deck_Quarter", 4.62),),
    chainplate_drop=2.20,
    # 0.08, not the frigate's 0.12. A strap sweeps `rake * drop` of fore-and-
    # aft while it falls, and that sweep is added to the span of side it may
    # not cross. On a 1.25 m drop the frigate's rake costs 0.15 m; on her
    # 2.20 m drop 0.12 would cost 0.26 m (0.29 at the 2.40 it was), and with
    # a port every 1.98 m there is not that much clear planking to spend.
    chainplate_rake=0.08,
    chainplate_margin=0.20,
    strap_half_w=0.065,
    strap_clear=0.04,
    strap_min_gap=0.22,
    strap_w=0.13,
    strap_thick=0.050,
    # Her feet land 0.40-0.44 m below the sheer (0.60-0.67 at the 2.40
    # drop), under the creased gunwale, where the rendered skin stands a
    # few mm inboard of the cage (measured in Blender at her feet at the
    # 2.40 drop: 0.3-1.9 mm). Let in 5 mm, the foot seats on it and still
    # stands 0.045 m proud.
    strap_bed=0.005,
)

# THE GALLEON'S STERN. The defining feature of the type, and the one place
# where its figures are allowed to dwarf the frigate's.
#
# Both endpoints of every figure named. At the TAFFRAIL — station 1.0 — the
# galleon's own landmarks are the STERN SHEER at z = 5.80 m above the
# waterline and three rail caps stacked above it:
#
#   stern-sheer to waist-rail-cap        1.90 m, cap at  7.70 m above water
#   waist-rail-cap to quarterdeck-rail-cap  2.50 m, cap at 10.20 m
#
# (2.45 / 8.25 / 1.95 until the lower battery left the bulwark, the maintainer's
# ruling 2026-10-05: the waist cap dropped 0.55 m, the quarterdeck did not.)
#   quarterdeck-rail-cap to poop-rail-cap   1.60 m, cap at 11.80 m
#
# so STERN-SHEER to POOP-RAIL-CAP is 6.00 m of transom standing above the
# deck edge, where the frigate's is 1.60 m. 11.80 m is 34.7% of the galleon's
# own 34.00 m length; the frigate's topmost rail at her taffrail is 5.20 m,
# 13.7% of her own 38.00 m.
#
# TWO tiers of windows, which is what the two references show and what a
# single-decked frigate has no transom to carry:
#
#   LOWER (the great cabin's stern lights), 7 lights: STERN-SHEER to BAND-FOOT
#     1.95 m down and to BAND-HEAD 0.50 m down — a band 1.45 m deep. Each
#     light measures 0.541 m wide by 1.170 m tall, which is the tall narrow
#     stern light of the period; the frigate's are 0.874 by 1.190.
#   UPPER (the coach, under the poop), 4 lights: STERN-SHEER to BAND-FOOT
#     2.65 m UP and to BAND-HEAD 3.60 m up, which puts it inside the
#     quarterdeck castle's own transom panel (1.90 m to 4.40 m above the
#     sheer; it began at 2.45 before the waist cap dropped). Each light is
#     0.549 by 0.670, nearly square.
#
# THE COACH'S BAND IS BOUND AT BOTH ENDS AND BOTH BOUNDS WERE MEASURED. Its
# quarter badges stand at station 0.968, not at the transom, and the
# quarterdeck castle's wall at THAT station runs 7.27 m to 9.77 m (7.82 before
# the waist cap it is stepped on dropped 0.55 m) — the wall
# head follows the sheer and the sheer has already fallen 0.42 m by there. The
# badge spans 8.45 to 9.40 and its ogee hood reaches 9.58, so it clears the
# wall it stands against by 0.19 m. A band chosen off the transom alone put
# the hood 0.05 m THROUGH the castle it hangs on.
GALLEON_STERN = SternForm(
    gallery_drop=1.95,
    gallery_head=0.50,
    gallery_margin=0.22,
    gallery_depth=0.38,          # a galleon's gallery stands further out
    window_mullion=0.11,
    window_inset_z=0.14,
    window_recess=0.26,
    dentil_drop=0.30,
    upper_galleries=(
        GalleryTier("coach", 2.65, 3.60, 4),
    ),
    badge_t=0.968,
    badge_facets=7,
    badge_bulge=0.52,            # frigate 0.42, on a hull 0.8 m beamier
    badge_mould=0.09,
    badge_lights=3,
    badge_hood=0.18,
    pilaster_w=0.14,
    pilaster_proud=0.12,
    muntin=0.050,
    muntin_proud=0.06,
    window_band_h=0.11,
    modillions=15,
    dentils=17,
    moulding_depth=0.20,
    moulding_h=0.18,
    moulding_overhang=0.26,
    carving_proud=0.18,
    carving_edge=0.95,
    carving_dentils=25,
    carving_panels=9,
    name_board_bosses=11,
    upper_dentils=19,
    upper_panels=7,
    # HER CHASE SILL IS MEASURED ABOVE THE DECK AT THE GUN (controller
    # ruling, Task 8a fix round 1). On the frigate's rule it stood 0.85
    # over the SHEER AT THE TRANSOM, 5.80 + 0.85 = 6.65 m, while her
    # chasers stand on Deck_Main at their breech, where her sheer is 0.664
    # m lower: BARREL UNDERSIDE was 0.502 m UNDER the CHASE SILL and every
    # chaser ran through the transom planking. 0.75 is her rows' band
    # (0.60-0.75 over the serving deck) taken as her rows take it, the
    # largest to the centimetre; at the gun the reading IS the sill.
    chase_sill_datum="deck_at_gun",
    chase_sill=0.75,
    # HER CHASERS STAND ON A CHASE PLATFORM (the maintainer's third ruling, A'). Her
    # Deck_Main ends at t 0.96 (y -15.64), 1.36 m short of her transom, and
    # her sheer climbs 0.664 m over that run: each chaser's after carriage
    # stood INSIDE the hull's top surface (Cannon_ x Hull, 44 face pairs).
    # The platform is Deck_Main's level at the chasers' station, 5.331 m,
    # carried aft to the transom's inside face.
    chase_platform=ChasePlatform(footprint_margin=0.10),
)

# THE GALLEON'S HEAD. A galleon's is the one on the type's postcard: a long
# low beak thrust out ahead of the stem, carrying the carving almost over the
# water, with the rails sweeping down to it from high on the forecastle.
#
# Both endpoints of every figure named. The galleon's own two landmarks are
# THE STEM AT THE RAIL at y = +17.00 m and THE RAIL CAP AT THE STEM at
# z = 6.45 m above the waterline (sheer 4.55 + waist bulwark 1.90). It was
# 7.00 on the 2.45 m bulwark until the lower battery left the bulwark
# (the maintainer's ruling 2026-10-05); every z here hangs off the cap and is stated
# as the cap now stands, measured off the built head.
#
#   stem-at-the-rail to trailboard-forward-end      1.45 m FORWARD of the stem
#   rail-cap-at-the-stem to trailboard-forward-end  3.30 m below it, z = 3.15
#   stem-at-the-rail to trailboard-aft-end          0.70 m ABAFT the stem
#   rail-cap-at-the-stem to trailboard-aft-end      1.45 m below it, z = 5.00
#
# and the upper head rail, measured at its inboard top edge as Headrails
# builds it, falls from z 5.49 at y 17.05 (just forward of the stem) to
# z 3.77 at y 18.66 where it dies into the lion. The KNEE's top (the stem
# head, z 4.55) used to run level out to y 19.53, over the lion's back, so
# the beakhead flight was split either side of it. The maintainer's third ruling
# (2026-10-06, E) let it fall with the rail (`knee_under_rail`): level at
# the stem head to y 17.27, then the rail's chords 0.545 lower to the
# rail's end, then level at z 3.23 to the cutwater, entering the lion
# through its rump. The flight passes over it unsplit and ends one rail
# station short of the lion's carving, its tail included (F): y 17.86.
#
# so the board alone is 2.15 m fore and aft where the frigate's is 1.25 m, on
# a hull 4 m SHORTER, and it RUNS OUT AT THE LION'S RUMP. The first version
# carried it 2.70 m forward of the stem, which put the board's forward end in
# the lion's chest: in a Right orthographic the carved board ran straight
# through the beast it is supposed to run out into. Both landmarks of the
# board's forward end are now one landmark of the carving's.
#
# The knee reaches 0.55 of keel-underside-at-the-stem to deck-edge-at-the-stem
# where the frigate's reaches 0.20, which is 2.67 m of cutwater against the
# frigate's 0.84 m, and the lion's nose stands 0.93 m forward of it.
GALLEON_HEAD = HeadForm(
    board_aft_abaft_stem=0.70,
    board_aft_below_cap=1.45,
    board_fwd_fwd_of_stem=1.45,
    board_fwd_below_cap=3.30,
    board_exp=2.4,
    board_stations=9,         # a board 2.7x as long needs more than 7 sections
    board_proud=0.075,
    board_thick=0.090,
    board_tuck=0.55,
    board_depth=(0.420, 0.260),   # a heavier carved board than the frigate's
    headrail_stations=8,
    upper_stations=11,
    # 1.8, not the frigate's 2.0. The two rails have to CONVERGE all the way
    # forward and the galleon's start 1.58 m apart at the heel against the
    # frigate's 0.91 m; at 2.2 the upper rail flattened early and the gap went
    # back UP over the last two stations, which is a pair of rails crossing.
    upper_exp=1.8,
    upper_thick=0.090,
    upper_heel_thick=0.130,
    upper_depth=0.220,
    # The lion is a QUADRUPED: its bounding box is long and low where
    # Minerva's is tall, so the same fractions land somewhere else entirely.
    # 0.46 of stem-to-carving-nose puts the rail's forward end at y = 18.66,
    # which is on the lion's RUMP, 0.21 m forward of where the trailboard
    # under it runs out at the same beast. The two rails have to die into the
    # carving within a hand's breadth of each other or the head ends twice.
    upper_land_fwd_frac=0.46,
    upper_land_z_frac=0.42,
    head_timbers=6,             # the gap between the rails is 2.2x the frigate's
    timber_thick=0.090,
    timber_fore_aft=0.120,
    timber_sink=0.040,
    timber_first=0.08,
    timber_last=0.80,
    knee_half=0.160,
    knee_into_stem=0.120,
    knee_reach_frac=0.55,
    knee_outline=GALLEON_KNEE,
    knee_under_rail=True,
    beakhead_thick=0.180,
    beakhead_into_side=0.080,
    beakhead_sink=0.110,
    beakhead_cap_t=0.160,
    beakhead_cap_out=0.070,
    # THE MAINTAINER'S RULING: the galleon's head is a BEAKHEAD, and a beakhead has a
    # deck. Her deck's sizes are stated here, on her own head form; see
    # `HeadForm` for what each is measured between.
    beakhead_deck=True,
    deck_stations=7,
    deck_thick=0.070,
    # The frame a grating card lies in. 0.035 m, a little under one grating
    # bar (`palette.GRATING_BAR`, 0.04), so the ledge reads as the grating's
    # border rather than as a second deck, and so the flight's narrowest
    # half -- the last, at the lion's rump -- still has an opening.
    deck_ledge=0.035,
    deck_grating_gap=0.003,
    deck_clear=0.020,
    deck_stem_clear=0.030,
    deck_rail_rise=0.120,
)


@dataclass(frozen=True)
class GunDeck:
    """ONE ROW of broadside gunports, per side.

    A frigate has one of these. A man-o-war has two or three. One row is the
    special case of N, never the other way round, which is why every consumer
    takes a tuple of these and indexes it rather than taking the numbers loose.

    `sill` is measured above the EDGE of the deck that serves the row, at the
    same station. For a row cut in the bulwark and served by the gun deck
    that is the sheer line; for a row cut in the HULL and served by a deck
    inside it, it is that deck's own edge, `rise` below the sheer.
    """

    name: str
    n_ports: int        # per side
    t0: float           # station of the foremost port of this row
    t1: float           # station of the aftmost port of this row
    width: float        # aperture, fore and aft
    height: float       # aperture, vertically
    sill: float         # aperture foot, above the host surface
    host: str = "bulwark"
    # The name of the row whose COLUMNS this one shares, or None for a row
    # that spaces its own. Two rows at independent pitches drift in and out
    # of step: on this galleon, 12 ports over t 0.20..0.84 and 9 over
    # 0.26..0.78 end up half a pitch apart amidships and between them block
    # the ship's side almost continuously, which leaves a chainplate nowhere
    # to land that is not a gunport. Ships are not built that way — the upper
    # row stands directly over the lower — and the reason they are not is
    # exactly this.
    align: str | None = None
    # THE DECK THE GUNS OF THIS ROW STAND ON, by tier name. A row in the
    # bulwark is served by the gun deck at the sheer, which is the frigate's
    # one row verbatim; a row cut in the hull is served by a deck INSIDE the
    # hull, and its sill is measured above that deck's edge.
    served_by: str = "Deck_Main"
    # THE BAND THE SILL MUST STAND IN, (low, high) in metres above the
    # serving deck's SURFACE, judged `sill_inboard` metres inboard of that
    # deck's edge at every port of the row, or None for no band. the maintainer's
    # ruling (2026-10-05): 0.60-0.75 m measured 1.0 m inboard, where the
    # carriage trucks stand on the camber. None / 0.0 is the frigate
    # verbatim: her shipped 0.55 m edge sill is NOT re-ruled.
    sill_band: tuple[float, float] | None = None
    sill_inboard: float = 0.0

    def validate(self) -> None:
        if self.host not in ("bulwark", "hull"):
            raise ValueError(
                f"gun deck {self.name!r} is cut in the {self.host!r}; a row "
                "is cut in the 'bulwark' or in the 'hull'")
        if self.sill_inboard < 0.0:
            raise ValueError(
                f"gun deck {self.name!r} measures its sill band "
                f"{self.sill_inboard} m OUTBOARD of its deck edge, which "
                "is off the deck")
        if self.sill_band is not None:
            lo, hi = self.sill_band
            if not 0.0 < lo < hi:
                raise ValueError(
                    f"gun deck {self.name!r} has a sill band {lo}..{hi} "
                    "that is empty or not above the deck")
        if self.n_ports < 2:
            raise ValueError(
                f"gun deck {self.name!r} needs at least 2 ports to space them, "
                f"got {self.n_ports}"
            )
        if not 0.0 < self.t0 < self.t1 < 1.0:
            raise ValueError(
                f"gun deck {self.name!r} must satisfy 0 < t0 < t1 < 1, got "
                f"t0={self.t0}, t1={self.t1}"
            )
        if self.width <= 0 or self.height <= 0:
            raise ValueError(
                f"gun deck {self.name!r} needs a positive aperture, got "
                f"{self.width} x {self.height}"
            )

    @property
    def head(self) -> float:
        """Aperture head, above the host surface."""
        return self.sill + self.height

    def ts(self, base: list[float] | None = None) -> list[float]:
        """Station of each port in this row, forward to aft.

        `base` is the row this one is ALIGNED to, if any: this row then takes
        the `n_ports` of that row's columns nearest its own midpoint, so the
        two rows stand in the same vertical lines and the clear side between
        columns runs from the wale to the rail in one piece.
        """
        n = self.n_ports
        if self.align is None:
            return [self.t0 + (self.t1 - self.t0) * i / (n - 1) for i in range(n)]
        if base is None:
            raise ValueError(
                f"gun deck {self.name!r} is aligned to {self.align!r} and was "
                "asked for its stations without it")
        if len(base) < n:
            raise ValueError(
                f"gun deck {self.name!r} wants {n} of {self.align!r}'s columns "
                f"and that row has only {len(base)}")
        mid = 0.5 * (self.t0 + self.t1)
        return sorted(sorted(base, key=lambda t: (abs(t - mid), t))[:n])


def validate_gun_decks(decks: tuple[GunDeck, ...]) -> None:
    """Every row legal on its own, and no two rows cutting into each other."""
    if not decks:
        raise ValueError("a ship with a battery needs at least one gun deck row")
    seen: set[str] = set()
    for deck in decks:
        deck.validate()
        if deck.name in seen:
            raise ValueError(f"gun deck {deck.name!r} declared twice")
        seen.add(deck.name)
    names = {d.name for d in decks}
    for deck in decks:
        if deck.align is None:
            continue
        if deck.align not in names:
            raise ValueError(
                f"gun deck {deck.name!r} is aligned to {deck.align!r}, which "
                f"this ship does not have; it has {sorted(names)}")
        if deck.align == deck.name:
            raise ValueError(f"gun deck {deck.name!r} is aligned to itself")
        base = next(d for d in decks if d.name == deck.align)
        if base.align is not None:
            raise ValueError(
                f"gun deck {deck.name!r} is aligned to {base.name!r}, which is "
                "itself aligned to another row; alignment is one deep")
    # Sills are measured above each row's OWN serving deck, so only rows on
    # the same deck and in the same host can be compared here; rows on
    # different decks are compared above the sheer by
    # `ShipParams._validate_battery`, which knows how far apart the decks are.
    for floor in {(d.host, d.served_by) for d in decks}:
        _no_overlap([d for d in decks if (d.host, d.served_by) == floor])


def _no_overlap(decks: list[GunDeck]) -> None:
    ordered = sorted(decks, key=lambda d: d.sill)
    for lower, upper in zip(ordered, ordered[1:]):
        if lower.head > upper.sill:
            raise ValueError(
                f"gun decks {lower.name!r} and {upper.name!r} overlap "
                f"vertically: {lower.name} head is {lower.head} and "
                f"{upper.name} sill is {upper.sill}"
            )


# --- the decks you walk on --------------------------------------------------


@dataclass(frozen=True)
class DeckTier:
    """One walking surface. `rise` is above the gun deck at the same station.

    `bulwark_h` is this tier's OWN rail, above its own walking surface, and it
    is what lets a tier stand clear ABOVE the main rail instead of having to
    fit under it. A frigate's forecastle and quarterdeck both sit inside the
    one bulwark, so they leave it None; a galleon's stern castle does not, and
    a model that could not say so could not have a stern castle.
    """

    name: str
    t0: float
    t1: float
    n_long: int
    rise: float
    bulwark_h: float | None = None
    # A deck INSIDE THE HULL: an orlop or a lower gun deck, below the gun
    # deck at the sheer. It is the one kind of tier allowed a negative
    # `rise`, and it must say so here rather than sink by accident. Its edge
    # meets the hull skin's inside at its own height, not the bulwark's.
    inside_hull: bool = False

    def stands_above_the_main_rail(self) -> bool:
        return self.bulwark_h is not None

    def validate(self) -> None:
        if not 0.0 <= self.t0 < self.t1 <= 1.0:
            raise ValueError(
                f"deck tier {self.name!r} must satisfy 0 <= t0 < t1 <= 1, got "
                f"t0={self.t0}, t1={self.t1}"
            )
        if self.n_long < 2:
            raise ValueError(
                f"deck tier {self.name!r} needs at least 2 stations, got {self.n_long}"
            )
        if self.inside_hull:
            if self.rise >= 0:
                raise ValueError(
                    f"deck tier {self.name!r} is a deck INSIDE the hull, so "
                    f"it sinks BELOW the gun deck; got rise={self.rise}")
            if self.bulwark_h is not None:
                raise ValueError(
                    f"deck tier {self.name!r} is inside the hull and cannot "
                    "carry a bulwark of its own")
        elif self.rise < 0:
            raise ValueError(
                f"deck tier {self.name!r} must not sink below the gun deck, "
                f"got rise={self.rise}; only a deck INSIDE the hull "
                "(inside_hull=True) lies below it"
            )
        if self.bulwark_h is not None and self.bulwark_h <= 0:
            raise ValueError(
                f"deck tier {self.name!r} declares its own bulwark, so that "
                f"bulwark must have a positive height, got {self.bulwark_h}"
            )


# --- the rig ----------------------------------------------------------------


@dataclass(frozen=True)
class Sail:
    """One piece of canvas: what shape it is and where it sits in its stack.

    `tier` is its position up its own mast, 0 at the bottom. For a headsail it
    is its position along the head rig, 0 nearest the ship.
    """

    kind: SailKind
    tier: int
    name: str = ""

    @property
    def spars(self) -> tuple[SparKind, ...]:
        return spars_for(self.kind)


@dataclass(frozen=True)
class Mast:
    """One mast, and what it carries.

    `top_span` of 0.0 means the mast carries no fighting top — a schooner's
    masts do not, and a model that always built one would put a platform on a
    pole with no yard to work from.
    """

    name: str
    t: float               # station, 0 at the stem
    truck_frac: float      # truck height, as a fraction of the ship's own scale
    rake_deg: float        # lean aft, from vertical
    radius: float          # at the partners
    top_span: float        # fighting top, athwartships, tip to tip; 0 for none
    yard_scale: float      # this mast's yards, relative to the main's
    channel_len: float
    chainplates: int
    sails: tuple[Sail, ...] = ()
    # (LOWER CAP, TOPMAST CAP) as fractions of the truck height, or None for
    # the square rig's 0.45 and 0.75 (`profiles.LOWER_CAP_FRAC`,
    # `TOPMAST_CAP_FRAC`). A gaff mast's lower mast is the long one: its
    # gaff's jaws ride up it to the hounds, which on a square mast's
    # proportions would stand on the topmast.
    caps: tuple[float, float] | None = None

    def validate(self) -> None:
        if not 0.0 < self.t < 1.0:
            raise ValueError(
                f"mast {self.name!r} must stand inside the hull, got t={self.t}"
            )
        if self.radius <= 0:
            raise ValueError(f"mast {self.name!r} needs a positive radius")
        if self.top_span < 0:
            raise ValueError(f"mast {self.name!r} cannot have a negative top span")
        tiers = [s.tier for s in self.sails]
        if len(set(tiers)) != len(tiers):
            raise ValueError(
                f"mast {self.name!r} has two sails claiming the same tier: {tiers}"
            )
        if self.caps is not None and not 0.0 < self.caps[0] \
                < self.caps[1] < 1.0:
            raise ValueError(
                f"mast {self.name!r} caps must climb inside its truck, "
                f"0 < lower < topmast < 1, got {self.caps}")
        kinds = [s.kind for s in sorted(self.sails, key=lambda s: s.tier)]
        if SailKind.GAFF_TOPSAIL in kinds:
            i = kinds.index(SailKind.GAFF_TOPSAIL)
            if i == 0 or kinds[i - 1] is not SailKind.GAFF:
                raise ValueError(
                    f"mast {self.name!r} sets a gaff topsail with no gaff "
                    f"sail under it: {[k.value for k in kinds]}")

    def has_top(self) -> bool:
        return self.top_span > 0.0


@dataclass(frozen=True)
class Bowsprit:
    """The one spar that is not stepped on a deck, and the head's own datum.

    It lives on the rig because it is a spar, but the HEAD reads it: a
    beakhead bulkhead is the wall a bowsprit is stepped against, so the heel
    names the station the bulkhead stands at on every hull.

    Defaults are the frigate's, verbatim — 12.0 m is spec section 2.1's
    figure and the reference confirms it at 215 px / 17.63 px per m = 12.2 m.
    """

    projection: float = 12.0   # stem at the rail to the tip, HORIZONTALLY
    steeve_deg: float = 24.0   # how far the spar rises above the horizontal
    heel_in: float = 3.0       # how far ABAFT the stem the heel is stepped
    radius: tuple = (0.38, 0.11)   # at the heel, at the tip

    def validate(self) -> None:
        if self.projection <= 0.0:
            raise ValueError(
                f"the bowsprit must project forward of the stem at the rail, "
                f"got {self.projection}")
        if not 0.0 <= self.steeve_deg < 90.0:
            raise ValueError(f"steeve_deg must lie in [0, 90), got {self.steeve_deg}")
        if self.heel_in <= 0.0:
            raise ValueError(
                f"the heel is stepped ABAFT the stem, got {self.heel_in}")
        if not self.radius[0] > self.radius[1] > 0.0:
            raise ValueError(f"a spar tapers towards its tip, got {self.radius}")


@dataclass(frozen=True)
class LateenSpar:
    """The ONE long raking yard a lateen sail is bent to.

    A square yard hangs athwartships under its own mast and there are three
    of them up each mast; a lateen yard is a single spar lying in the ship's
    fore-and-aft plane, crossing its mast once, with its HEEL low and forward
    and its PEAK high and aft. It is as long as the mast it crosses, which is
    what makes a lateen mizzen look like a lateen mizzen and not like a bare
    pole with a triangle on it.

    Every figure is a fraction of something the mast already states, so the
    spar scales with whatever mast sets it.
    """

    length_frac: float = 0.95    # of MAST-FOOT to MAST-TRUCK, along the mast
    slings_frac: float = 0.30    # along the yard, HEEL to PEAK, where it crosses
    mast_frac: float = 0.42      # MAST-FOOT to MAST-TRUCK, where it crosses
    rake_deg: float = 52.0       # above the horizontal; heel forward, peak aft
    radius_frac: float = 0.013   # radius at the slings, per metre of length
    tip_taper: float = 0.42      # radius at each end, over the radius at the slings

    def validate(self) -> None:
        for name in ("length_frac", "mast_frac", "radius_frac", "tip_taper"):
            if getattr(self, name) <= 0.0:
                raise ValueError(f"LateenSpar.{name} must be positive")
        if not 0.0 < self.slings_frac < 1.0:
            raise ValueError(
                "a lateen yard crosses its mast somewhere ALONG itself, got "
                f"slings_frac {self.slings_frac}")
        if not 0.0 < self.mast_frac < 1.0:
            raise ValueError(
                f"mast_frac must lie in (0, 1), got {self.mast_frac}")
        if not 0.0 < self.rake_deg < 90.0:
            raise ValueError(
                "a lateen yard RAKES: 0 would lay it flat athwart nothing and "
                f"90 would stand it up the mast, got {self.rake_deg}")
        if self.tip_taper >= 1.0:
            raise ValueError("a spar tapers towards its ends, not away")


class CourseFloor(Enum):
    """Which rail a COURSE (tier-0 square sail) is floored against.

    The clearance is `wind.COURSE_RAIL_CLEAR`, and it spans the FOOT of the
    course to a rail height taken at that course's OWN mast station. The two
    rules differ only in which rail height that is:

    - WAIST_CAP: `sheer + bulwark_h`, the cap of the waist bulwark. The rail a
      frigate's courses are sheeted over, and her verbatim rule: the general
      form below would RAISE her mizzen course 0.6000 m (foot z 5.6262 against
      rail_top_z 5.2262 + 1.00 = 6.2262 at t 0.801), and she is frozen.
    - RAIL_TOP: `profiles.rail_top_z(p, t)`, the rail actually standing at the
      station, castle walls included. A castle ship's forecastle carries a
      bulwark of its own and stands higher than her waist cap: under WAIST_CAP
      the galleon's fore course foot stood at z 6.9342, 0.3000 m INSIDE her
      forecastle wall head 7.2342 at t 0.200, and 1.3000 m short of the
      RAIL_TOP floor there, 8.2342 = rail_top_z 7.2342 (the forecastle wall
      head) + COURSE_RAIL_CLEAR 1.00 — both figures the course FOOT against a
      rail height at the fore mast's own station t 0.200.

    The same shape as `HullForm.tumble_floor` and `wind.sail_fwd`: a rule
    measured on one ship is not a fact about ships, so the ship states it.
    """

    WAIST_CAP = "waist_cap"
    RAIL_TOP = "rail_top"


@dataclass(frozen=True)
class RigPlan:
    """Every sail in the ship: those on masts, and those on the head rig."""

    masts: tuple[Mast, ...]
    headsails: tuple[Sail, ...] = ()
    bowsprit: Bowsprit = field(default_factory=Bowsprit)
    lateen: LateenSpar = field(default_factory=LateenSpar)
    # What a course's foot is floored against; see `CourseFloor`. The default
    # is the frigate's rule verbatim.
    course_floor: CourseFloor = CourseFloor.WAIST_CAP

    def validate(self) -> None:
        if not self.masts:
            raise ValueError("a rig needs at least one mast")
        self.bowsprit.validate()
        self.lateen.validate()
        names, stations = set(), []
        for mast in self.masts:
            mast.validate()
            if mast.name in names:
                raise ValueError(f"mast {mast.name!r} declared twice")
            names.add(mast.name)
            stations.append(mast.t)
        for i, a in enumerate(sorted(stations)):
            for b in sorted(stations)[i + 1:]:
                if abs(a - b) < 1e-9:
                    raise ValueError(f"two masts stand at the same station t={a}")
        tiers = [s.tier for s in self.headsails]
        if len(set(tiers)) != len(tiers):
            raise ValueError(f"two headsails claim the same tier: {tiers}")

    def mast_names(self) -> tuple[str, ...]:
        """Forward to aft, whatever order the masts were declared in."""
        return tuple(m.name for m in sorted(self.masts, key=lambda m: m.t))

    def mast(self, name: str) -> Mast:
        for m in self.masts:
            if m.name == name:
                return m
        raise KeyError(f"no mast named {name!r}; this ship has {self.mast_names()}")

    def all_sails(self) -> tuple[Sail, ...]:
        out: list[Sail] = []
        for name in self.mast_names():
            out.extend(sorted(self.mast(name).sails, key=lambda s: s.tier))
        out.extend(sorted(self.headsails, key=lambda s: s.tier))
        return tuple(out)

    def sail_kinds(self) -> frozenset[SailKind]:
        return frozenset(s.kind for s in self.all_sails())

    def has_square_sails(self) -> bool:
        return SailKind.SQUARE in self.sail_kinds()

    def spar_kinds(self) -> frozenset[SparKind]:
        out: set[SparKind] = set()
        for sail in self.all_sails():
            out.update(sail.spars)
        return frozenset(out)

    def rope_kinds(self) -> frozenset[str]:
        """Every running-rigging family this rig needs, and no other."""
        out: set[str] = set()
        for sail in self.all_sails():
            out.update(rope_families(sail.kind))
        return frozenset(out)

    def tops(self) -> tuple[str, ...]:
        return tuple(n for n in self.mast_names() if self.mast(n).has_top())

    def lateen_masts(self) -> tuple[str, ...]:
        """Every mast setting a lateen sail, forward to aft. None on three
        of the four ships; the galleon's mizzen is the one that does."""
        return tuple(n for n in self.mast_names()
                     if any(s.kind is SailKind.LATEEN
                            for s in self.mast(n).sails))


# --- the registry -----------------------------------------------------------


def _square_stack(n: int = 3) -> tuple[Sail, ...]:
    """Course, topsail, topgallant — the frigate's and the galleon's stack."""
    names = ("course", "topsail", "topgallant", "royal")
    return tuple(Sail(SailKind.SQUARE, i, names[i]) for i in range(n))


# The frigate, verbatim from the ship that shipped. Changing a number here
# changes the built frigate, and `check_masts` and the pytest suite both assert
# these against the hull that was measured off the reference.
FRIGATE_RIG = RigPlan(masts=(
    Mast("fore", 0.184, 0.887, 0.5, 0.39, 4.5, 0.88, 3.2, 5, _square_stack()),
    Mast("main", 0.554, 0.947, 1.5, 0.42, 5.0, 1.00, 3.6, 6, _square_stack()),
    Mast("mizzen", 0.801, 0.742, 2.5, 0.33, 3.8, 0.72, 2.6, 4, _square_stack()),
))

# The galleon. Square forward, LATEEN on the mizzen, which is the single thing
# that most distinguishes its rig from the frigate's and the first real
# customer for a sail kind the frigate never had.
# CHANNEL LENGTHS, which the chainplates settled rather than the eye. A strap
# may not cross a gunport, so a channel must span as many clear gaps between
# port columns as it carries straps. With a port every 1.98 m and 1.26 m of
# each gap spent on the aperture and the strap's own sweep, a gap gives 0.72 m
# of clear side and takes two straps at 0.22 m apart. The fore channel carries
# five and so must reach three gaps: 4.2 m reached one, and 6.2 m reaches
# three. The mizzen carries four and went from 2.4 m to 4.4 m on the same
# arithmetic. The main's 5.2 m already reached two.
GALLEON_RIG = RigPlan(masts=(
    Mast("fore", 0.200, 0.780, 0.0, 0.42, 6.2, 0.92, 3.0, 5, _square_stack(2)),
    Mast("main", 0.520, 0.930, 1.0, 0.48, 5.2, 1.00, 3.4, 6, _square_stack(3)),
    Mast("mizzen", 0.800, 0.620, 3.0, 0.30, 0.0, 0.0, 4.4, 4,
         (Sail(SailKind.LATEEN, 0, "lateen_mizzen"),)),
),
    # The Galeon Andalucia is 38 m of hull and 51 m overall, so her bowsprit
    # projects 13 m forward of a 38 m hull — 0.342 of her own length. On this
    # 34 m hull that is 11.6 m, and 11.6 is what is used. A galleon's bowsprit
    # also STEEVES far more steeply than a frigate's, because it has to clear
    # a beakhead and a forecastle instead of a low rail: 32 degrees above the
    # horizontal against the frigate's 24. Its heel is stepped 4.6 m abaft the
    # stem at the rail — 13.5% of length, where the frigate's is 7.9% — which
    # puts the beakhead bulkhead that far aft with it, clear of the head.
    bowsprit=Bowsprit(projection=11.6, steeve_deg=32.0, heel_in=4.6,
                      radius=(0.44, 0.13)),
    # Ruled by the maintainer 2026-10-05: her courses clear the rail ACTUALLY there,
    # forecastle wall head included. Fore course foot rises 1.3000 m to
    # z 8.2342 (rail_top_z 7.2342 + 1.00 at t 0.200), main 0.3000 m to
    # z 6.8506 (rail_top_z 5.8506 + 1.00 at t 0.520).
    course_floor=CourseFloor.RAIL_TOP,
    # HER LATEEN YARD, SETTLED BY MEASUREMENT, not chosen. On the default
    # spar (0.95 of the span, slings 0.42 up the mast, 52 deg) the foot chord
    # TACK -> CLEW stood 0.6000 m INSIDE the poop's cap at the break
    # (t 0.8100, y -10.5400, cap 9.8791) and the heel 0.4492 m under the rail
    # cap at its own station. A read-only sweep of 14,014 spars found that
    # raising the truck buys nothing (every figure is a fraction of the span)
    # and that every pass SHORTENS the yard; this is the smallest change from
    # as-built that passes. Yard heel->peak 13.9602 (was 16.1734); foot chord
    # over the poop cap at the break 1.2244, over rail_top_z at the clew
    # 1.2000; heel over its own rail cap 2.4986; mizzen truck 21.0800 over
    # the peak 1.0430. Mizzen t 0.800 and truck_frac 0.620 unchanged.
    lateen=LateenSpar(length_frac=0.82, slings_frac=0.30, mast_frac=0.54,
                      rake_deg=44.0),
)

# THE FLUTE (fluyt). Three masts, as the frigate and the galleon, but a
# CARRIER'S rig: course and topsail on the fore and main with SHORT topmasts
# and no topgallants, and a LATEEN mizzen, which the fluyt kept through the
# seventeenth century. Her masts stand lower over the water than the
# frigate's, for a hull 8 m shorter: WATERLINE to MAIN TRUCK is 0.86 of her
# own 30.00 m length, 25.80 m, against the frigate's 0.947 of 38.00 m.
FLUTE_RIG = RigPlan(masts=(
    Mast("fore", 0.180, 0.760, 0.0, 0.32, 3.6, 0.92, 2.4, 4,
         _square_stack(2)),
    Mast("main", 0.490, 0.860, 1.0, 0.36, 4.0, 1.00, 2.8, 5,
         _square_stack(2)),
    Mast("mizzen", 0.800, 0.560, 2.5, 0.24, 0.0, 0.0, 2.0, 3,
         (Sail(SailKind.LATEEN, 0, "lateen_mizzen"),)),
),
    bowsprit=Bowsprit(projection=9.0, steeve_deg=30.0, heel_in=2.6,
                      radius=(0.30, 0.09)),
    course_floor=CourseFloor.RAIL_TOP,
    # HER LATEEN'S HEEL STANDS OVER THE QUARTERDECK CASTLE, so its tack leads
    # to a block on that deck. On the galleon's spar (slings 0.30 along the
    # yard) the heel stood 2.4 m forward of the slings and the tack's block
    # landed on Deck_Main, forward of the castle, and the tack ran down
    # through the castle's front wall and its deck. Slings 0.22 along a yard
    # 0.75 of the mast's span puts the heel 1.66 m forward of the slings,
    # over the castle, and the peak under the truck.
    lateen=LateenSpar(length_frac=0.75, slings_frac=0.22, mast_frac=0.54,
                      rake_deg=44.0),
)

# THE SCHOONER. Built last, sketched here first, on purpose. If the abstraction
# could not hold this it would be the fourth ship that found out, which is the
# most expensive moment possible to discover it.
#
# Two masts, no fighting tops, no yards anywhere, no braces. Each mast sets a
# four-sided gaff mainsail between a gaff above and a boom below, and the ship
# sets two triangular headsails on stays off the bowsprit.
SCHOONER_RIG = RigPlan(
    masts=(
        Mast("fore", 0.330, 0.880, 1.0, 0.30, 0.0, 0.0, 2.4, 4,
             (Sail(SailKind.GAFF, 0, "foresail"),)),
        Mast("main", 0.690, 1.000, 2.0, 0.32, 0.0, 0.0, 2.6, 5,
             (Sail(SailKind.GAFF, 0, "mainsail"),)),
    ),
    headsails=(
        Sail(SailKind.STAYSAIL, 0, "forestaysail"),
        Sail(SailKind.STAYSAIL, 1, "jib"),
    ),
)

# THE SLOOP. One mast, the Jamaica sloop's: a long lower mast raking aft
# with a short topmast over it (`caps`), a GAFF MAINSAIL on a boom that
# overhangs the taffrail, a GAFF TOPSAIL over the gaff, and two headsails on
# a bowsprit nearly as long as the hull is half. WATERLINE to TRUCK is 1.05
# of her 18.00 m length, 18.90 m: a sloop carried a mast taller than her
# hull was long, which is what made her fast.
SLOOP_RIG = RigPlan(
    masts=(
        Mast("main", 0.360, 1.050, 4.0, 0.26, 0.0, 0.0, 2.2, 4,
             (Sail(SailKind.GAFF, 0, "mainsail"),
              Sail(SailKind.GAFF_TOPSAIL, 1, "gaff_topsail")),
             caps=(0.72, 0.93)),
    ),
    headsails=(
        Sail(SailKind.STAYSAIL, 0, "forestaysail"),
        Sail(SailKind.STAYSAIL, 1, "jib"),
    ),
    # STEM-AT-THE-RAIL to TIP 10.8 m, 0.60 of her hull, steeving 20 degrees,
    # flatter than the frigate's 24 and the galleon's 32. Not flatter still:
    # the spar's axis must cross the stem over the rail cap, 2.55 m over
    # the water there; from a heel 2.4 m abaft the stem at 1.78 m a 20
    # degree steeve crosses it at 2.65. At 12 it crossed at 2.37, through
    # the head.
    bowsprit=Bowsprit(projection=10.8, steeve_deg=20.0, heel_in=2.4,
                      radius=(0.22, 0.07)),
)

# A man-o-war: three masts, square, four tiers on the main, and the thing that
# forced the battery to go plural — three rows of ports a side.
MAN_O_WAR_RIG = RigPlan(masts=(
    Mast("fore", 0.190, 0.860, 0.0, 0.52, 5.4, 0.90, 4.0, 7, _square_stack(3)),
    Mast("main", 0.530, 0.960, 1.0, 0.58, 6.2, 1.00, 4.6, 8, _square_stack(4)),
    Mast("mizzen", 0.810, 0.740, 2.5, 0.42, 4.4, 0.74, 3.2, 6, _square_stack(3)),
))

SHIP_RIGS: dict[str, RigPlan] = {
    "frigate": FRIGATE_RIG,
    "galleon": GALLEON_RIG,
    "flute": FLUTE_RIG,
    "sloop": SLOOP_RIG,
    "schooner": SCHOONER_RIG,
    "man_o_war": MAN_O_WAR_RIG,
}

for _name, _rig in SHIP_RIGS.items():
    _rig.validate()
del _name, _rig
