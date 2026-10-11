"""The spec section 5 triangle budget as a measurement. Pure — imports no bpy.

Twelve checks test whether the geometry is CORRECT. None of them tested whether
there is enough of it, and that gap let the stern ship at 266 triangles against
a 3,500 line — 8% of the budget for the region spec section 5 calls the
highest-detail one — with every check green.

A component is judged against its own line in two directions:

- below `STARVED_FLOOR` of the line it is under-built, and will read low-poly;
- above `OVERSPEND_CEILING` of the line it has taken budget off another
  component, and her own ceiling gets closer.

The counts are triangles DRAWN, not unique mesh triangles: spec section 5
budgets 24 cannons at ~250 triangles each for a 6,000 line, so an object that
shares its datablock with eleven siblings still costs twelve objects' worth of
the line. `checks.check_budget` feeds this the per-object counts of the whole
ship's own collection.

EACH SHIP CARRIES HER OWN `Budget`, on her params object, as `p.budget`. The
table below was module-global and written for the frigate, which made it a
frigate's figures stated as a fact about ships -- the twelfth defect of that
one class on this project. A galleon with three castles, an ornate stern and
forty-four guns is not judged against a 3,500-triangle stern line because a
frigate's stern was. Nothing here asks which ship it is: every function takes
the params and reads `p.budget`.
"""

from dataclasses import dataclass

from . import texbudget

STARVED_FLOOR = 0.50
OVERSPEND_CEILING = 1.00


@dataclass(frozen=True)
class Line:
    """One row of the spec section 5 table, with the objects that spend it.

    `floor` is per-line and defaults to `STARVED_FLOOR`. It exists because one
    line's floor turned out to be unreachable by any honest means -- see
    `rigging` below -- and the alternative on offer was to pad that component
    with geometry whose only purpose was to satisfy the check. A budget line
    that can only be met by padding is a wrong line, and the honest repair is
    to correct the line in the open, once, with the reason attached.

    `floor_why` is REQUIRED whenever `floor` differs from the default, and
    `validate_line` refuses the Line without it. A silently lowered floor is
    indistinguishable from the tolerance-widening this project has been caught
    at before; one that has to carry its own argument is not.

    `spec_budget` is the figure spec section 5 printed, and it is set ONLY on
    a line that has since been moved off it. `budget_why` is then REQUIRED, on
    exactly the same argument as `floor_why`: a budget line raised in silence
    is indistinguishable from a ceiling quietly widened to let something
    through, and one that has to carry its own reason is not.
    """

    key: str
    title: str
    budget: int
    names: tuple = ()
    prefixes: tuple = ()
    floor: float = STARVED_FLOOR
    floor_why: str = ""
    spec_budget: int = 0
    budget_why: str = ""

    @property
    def exemplar(self) -> str:
        """A representative object name for this line, for tests and messages."""
        return self.names[0] if self.names else self.prefixes[0] + "00"

    def claims(self, name: str) -> bool:
        return name in self.names or any(name.startswith(p) for p in self.prefixes)


@dataclass(frozen=True)
class Budget:
    """One ship's triangle budget: her lines, their target, and her ceiling.

    `total` is the sum of the lines, stated rather than summed so that a line
    moved without the total moving is a refusal, not a silent new target.
    `ceiling` is the promise the target is planned under; `ceiling_why` says
    where that figure comes from, because a ceiling with no argument is the
    first thing to be quietly raised.

    `glb_ceiling` is what her exported `.glb` must come in under, in bytes,
    and `glb_why` where it comes from, on the same argument. It was one
    module constant, the frigate's 13 MB, judging every ship; a ship with
    more mesh and more atlas sets derives her own with
    `texbudget.glb_ceiling`. `glb_basis` is the phrase `check_export`'s key
    states the ceiling by.
    """

    lines: tuple
    total: int
    ceiling: int
    ceiling_why: str = ""
    # ((line key, (build pass, ...)), ...): which passes emit each line's
    # objects. Read only to SAY why a line is empty or short on a ship that
    # names her passes -- never to excuse a line whose pass she runs.
    fed_by: tuple = ()
    glb_ceiling: int = 0
    glb_why: str = ""
    glb_basis: str = ""

    def line(self, key: str) -> Line:
        for line in self.lines:
            if line.key == key:
                return line
        raise ValueError(f"no budget line called {key!r}")


FRIGATE_LINES = (
    # THE RUDDER SPENDS THE HULL LINE. Spec section 5's stern line is "Stern
    # castle, gallery windows, transom" -- three works ABOVE the counter, and
    # the rudder is none of them. The rudder is backbone: keel, stem,
    # sternpost, rudder, hung where the hull planking closes aft and almost
    # entirely below the waterline. The hull line also had the room, standing
    # at 6,870 of 8,000 before the rudder existed.
    Line("hull", "Hull skin + bulwarks", 8000, ("Hull", "Bulwarks", "Rudder")),
    # Gratings are a decks line in spec section 5 ("Decks, gratings, hatch
    # coamings"), even though `furniture` emits them with the hatches they fill.
    Line("decks", "Decks, gratings, hatch coamings", 3000,
         ("Deck_Main", "Deck_Quarter", "Deck_Forecastle", "Deck_Poop",
          "Gratings")),
    # The CASTLE WALLS spend this line, forward one included. Spec section 5
    # calls it "Stern castle, gallery windows, transom", and a castle wall is
    # castle work whichever end of the ship it stands at: splitting one
    # structure across two lines would mean neither line could be read as
    # "what the castles cost". The frigate declares no castle tier and emits
    # none of them, so its stern line is unchanged at 2,886 of 3,500.
    Line("stern", "Stern castle, gallery windows, transom", 3500,
         ("Transom", "Stern_Gallery", "Stern_Carving",
          "Castle_Forecastle", "Castle_Quarter", "Castle_Poop")),
    # The head spends the RAILS line. Spec section 5 calls that line
    # "Railings, channels, chainplates", and the head rails are railings --
    # two a side, built of the same moulded section as the trailboard they
    # fair into. The beakhead bulkhead goes with them rather than on the hull
    # line because it is what the head rails spring from: splitting one
    # structure across two lines would mean neither line could be read as
    # "what the head cost". The rails line was also the only one with room --
    # it stood at 1,410 of 2,500, nearest its floor of every line but rigging.
    Line("rails", "Railings, channels, chainplates", 2500,
         ("Rails", "Channels", "Chainplates", "Headrails", "Beakhead")),
    # The nine yards are nine objects, not one: a yard braces about its own
    # mast and a glTF node turns about its own origin. They still spend this
    # line, which is what "Masts, yards, tops, bowsprit" has always meant.
    # And a LATEEN yard spends the same line as a square one. It is one
    # object per lateen mast rather than one per mast and tier, because a
    # lateen mast sets exactly one sail on exactly one spar -- which is what
    # makes it a lateen mast.
    Line("masts", "Masts, yards, tops, bowsprit", 4500,
         ("Masts", "Tops", "Bowsprit"), ("Yard_", "Lateen_")),
    Line("sails", "Sails x9 + flag", 5500, ("Sails", "Jolly_Roger")),
    # THE ONE LOWERED FLOOR IN THE TABLE, and the only one the maintainer has
    # authorised. The spec's 4,000-triangle line was written before spec
    # section 5 itself chose the 2-triangle ALPHA-CUT RIBBON for rope. At two
    # triangles a rope, an honest and complete rig -- 552 ropes, every shroud,
    # stay, ratline, lift, footrope, clewline, buntline, sheet and the head
    # rigging, with the footropes hanging in their catenaries and the
    # buntlines following the belly of their sails -- draws 1,482 triangles.
    # That is 37% of the line and it is EVERYTHING THERE IS TO RIG. Reaching
    # 2,000 would mean inventing another 259 ropes that no frigate carried, or
    # tessellating rope that needs no tessellation: geometry whose only purpose
    # is to satisfy a check, which is the one thing a budget check must never
    # buy. The line is wrong, not the rig. 25% of 4,000 is 1,000, which a
    # complete rig clears by 482 and a visibly bare one would not.
    Line("rigging", "Standing + running rigging", 4000, ("Rigging",),
         floor=0.25,
         floor_why=(
             "the 4,000 line predates the 2-triangle ribbon technique spec "
             "section 5 chose for rope; a complete rig of 552 ropes draws "
             "1,482 triangles, so a 50% floor could only be met by inventing "
             "ropes the ship never carried"
         )),
    Line("cannons", "Cannons x24, carriages, port lids", 6000,
         (), ("Cannon_", "PortLid_")),
    # `Deck_Furniture` is matched by name before any prefix rule, so the decks
    # line cannot swallow it on the strength of its first five letters.
    # The WHEEL came out of `Deck_Furniture` so it can turn on its spindle.
    # It is still deck furniture and still spends this line.
    # RAISED FROM 5,000 TO 7,000, ON THE MAINTAINER'S INSTRUCTION, FOR THE ANCHOR.
    # Spec section 5's 5,000 was an estimate made before any of these parts
    # were built. The furniture came in at 4,514 of it — enriched as far as
    # the line allowed and then stopped there — and the thing that stopped was
    # the anchor, at 320 triangles a side, which reads low-res at the range an
    # anchor on a pirate ship's bow is actually looked at. A proper
    # admiralty-pattern anchor — shank, stock with its iron hoops, two swept
    # arms, flukes with real bills, and the ring — costs about 1,050, and it
    # is paid ONCE because the two anchors share one mesh.
    #
    # The 2,000 comes out of the ship's own surplus, not off another line:
    # 34,206 drawn against a 44,000 target left 9,794 unspent, and the 50,000
    # hard ceiling is untouched. No other line moves.
    Line("furniture", "Deck furniture", 7000,
         ("Deck_Furniture", "Wheel"), ("Barrel_", "Lantern_", "Anchor_"),
         spec_budget=5000,
         budget_why=(
             "spec section 5's 5,000 was estimated before the parts existed; "
             "the anchor is a conspicuous close-range object on a pirate "
             "ship and 320 triangles of it reads low-res, and the 2,000 comes "
             "out of the 9,794 the whole ship had unspent against its target, "
             "so the 50,000 hard ceiling does not move"
         )),
    Line("dressing", "Figurehead + damage detail", 2000,
         ("Figurehead", "Sail_Patches", "Damage")),
)


# WHICH BUILD PASSES EMIT EACH LINE'S OBJECTS. A pipeline fact, not a ship
# fact: the castle walls come out of `bulwarks` whichever ship has castles,
# and `Gratings` out of `furniture`. A ship that runs every pass never reads
# it. One that names her passes and leaves some out gets each affected line
# SAID, on its own key, rather than judged silently or hidden.
FED_BY = (
    ("hull", ("hull", "bulwarks", "rudder")),
    ("decks", ("decks", "furniture")),
    ("stern", ("stern", "bulwarks")),
    ("rails", ("rails", "headworks")),
    ("masts", ("masts",)),
    ("sails", ("sails", "dressing")),
    ("rigging", ("rigging",)),
    ("cannons", ("cannons",)),
    ("furniture", ("furniture",)),
    ("dressing", ("dressing", "damage")),
)


# The frigate's target is the sum of her ten lines. It was 44,000 — spec
# section 5's own total — until the maintainer raised the furniture line by 2,000 for
# the anchor (see that Line). The raise comes out of the GLOBAL SURPLUS the
# ship already had: 34,206 drawn against a 44,000 target left 9,794 unspent, so
# 2,000 of it is spent here and the 50,000 HARD CEILING does not move an inch.
# A target is a plan; the ceiling is the promise, and only the plan changed.
FRIGATE_BUDGET = Budget(
    lines=FRIGATE_LINES,
    total=46000,
    ceiling=50000,
    ceiling_why=(
        "spec section 5's hard ceiling for the frigate: 50,000 over a planned "
        "44,000, which the anchor raise moved to 46,000 out of the ship's own "
        "surplus without moving the ceiling"
    ),
    fed_by=FED_BY,
    glb_ceiling=texbudget.MAX_GLB_BYTES,
    glb_why=(
        "her 2048 pass's 2.19 MB of mesh plus a quarter of its 44.9 MB of "
        "texture, 13.4 MB, rounded DOWN to 13,000,000 (texbudget."
        "MAX_GLB_BYTES, verbatim); her shipped 1024 file measures "
        "12,002,512 bytes, which rounded up to the MB is the same figure"
    ),
    glb_basis="a quarter-area atlas set has to beat (was 47.4 MB)",
)


# --- the galleon ------------------------------------------------------------
#
# THE MAINTAINER'S RULING: her own budget, 20-35% over the frigate's 46,000, for the
# ornate stern galleries, the tumblehome hull and the beakhead. DERIVED LINE BY
# LINE, not scaled: each line is what she ACTUALLY DRAWS (the ledger's
# per-object TRIANGLE counts for her build at e3fc7ea, 30 objects, 30,592
# triangles -- not the faces file, which counts base-mesh faces and runs 5-8x
# under on the subdivided hull and decks) plus what is still absent, plus
# headroom, and every line says so. `spec_budget` is the figure spec section 5
# printed for the frigate's line of the same name, set wherever hers departs
# from it, so `validate_line` will not let the departure go unargued.
GALLEON_LINES = (
    Line("hull", "Hull skin + bulwarks + ceiling + rudder", 19000,
         ("Hull", "Bulwarks", "Ceiling_Lower", "Rudder"),
         spec_budget=8000,
         budget_why=(
             "RE-DERIVED for her lower gun deck (the maintainer's ruling 2026-10-05: "
             "a true lower deck, the main row cut in the hull). She draws "
             "Hull 14,176 + Bulwarks 2,150 + Ceiling_Lower 728 = 17,054: "
             "the hull loft gains a station at each of the hull row's port "
             "edges and a ring point at its sill and head (it drew 9,520), "
             "the bulwark loses the lower row (it drew 3,830), and the "
             "ceiling inboard of the hull row is new. With her rudder hung "
             "(Task 8a) she draws Rudder 144 (rudder.triangle_count, read "
             "off the rebuilt scene) on top, so 17,198 is 91% of 19,000. "
             "The 15,000 it replaces is crossed at 114%. The maintainer's third "
             "ruling (A', Task 11) opened the hull's closing face over the "
             "chase platform, two quads, 16 subdivided triangles: Hull "
             "14,160, so she draws 17,182, 90%"
         )),
    Line("decks", "Decks, gratings, hatch coamings", 3100,
         ("Deck_Main", "Deck_Quarter", "Deck_Forecastle", "Deck_Poop",
          "Deck_Lower", "Gratings", "Chase_Platform"),
         spec_budget=3000,
         budget_why=(
             "the frigate's line until Task 11: her five decks draw 2,248 -- "
             "Deck_Main 716, Deck_Forecastle 284, Deck_Quarter 428, "
             "Deck_Poop 248 and the lower gun deck Deck_Lower 572 -- and "
             "with her furniture pass in (Task 8b) her three hatches' "
             "Gratings draw 684, read off the rebuilt scene: 2,932. "
             "RE-DERIVED for the chase platform under her stern chasers "
             "(the maintainer's third ruling, A', Task 11): Chase_Platform 92 -- "
             "its planked slab 20 and six timbers at 12 apiece, "
             "profiles.chase_platform_triangles, read off the rebuilt "
             "scene -- brings her decks to 3,024, over the 3,000 line, so "
             "3,100 is that spend rounded up to the hundred. Final review "
             "3 (I-2) carried the planking to the hull skin and end cap "
             "below the sheer and closed Deck_Main's end with a riser: "
             "Chase_Platform 148 -- the slab over the sheer 12, the slab "
             "below it 20, six timbers at 12 and the riser 44 -- and her "
             "decks draw 3,080, inside 3,100, 99%"
         )),
    Line("stern", "Stern castle, gallery windows, transom, castle walls", 8000,
         ("Transom", "Stern_Gallery", "Stern_Carving",
          "Castle_Forecastle", "Castle_Quarter", "Castle_Poop"),
         spec_budget=3500,
         budget_why=(
             "the ornate stern the maintainer ruled for: Transom 188 + Stern_Gallery "
             "3,304 + Stern_Carving 2,732 + three castle walls 972 = 7,196, "
             "already twice the frigate's 3,500, so 8,000 is that spend at "
             "90% with nothing absent from it (it drew 7,092 until the waist "
             "cap dropped 0.55 m with the lower battery: the castle walls "
             "stepped on it grew and the transom panel under it shrank)"
         )),
    Line("rails", "Channels, chainplates, head rails, beakhead", 1300,
         ("Channels", "Chainplates", "Headrails", "Beakhead",
          "Beakhead_Deck", "Beakhead_Grating"),
         spec_budget=2500,
         budget_why=(
             "she builds no open `Rails` object -- all three raised decks "
             "are castles with bulwarks of their own -- so the line is what "
             "she draws, re-derived when the maintainer's third ruling (2026-10-06, "
             "E and F) let the knee's top fall with the upper head rail and "
             "the beakhead flight pass over it unsplit, one rail station "
             "short of the lion's carving: Channels 168 + Chainplates 360 + "
             "Headrails 532 (the knee now 13 athwartships rings, 100, where "
             "the level-topped fin was 52; head.headrail_triangles) + "
             "Beakhead 24 + Beakhead_Deck 144 (its 12 frame timbers, 12 "
             "apiece, head.beakhead_deck_triangles) + Beakhead_Grating 6 "
             "(its 3 alpha-masked grating cards, 2 apiece, "
             "head.beakhead_grating_triangles) = 1,234, so 1,300 is that "
             "spend rounded up to the hundred, 95%. It was 1,500 at 1,486 "
             "drawn on the split flight to the rump (Headrails 484, "
             "Beakhead_Deck 432, Beakhead_Grating 18), and 2,000 at 1,400 "
             "when the deck was a 364-triangle planked stub"
         )),
    Line("masts", "Masts, yards, tops, bowsprit, lateen", 4000,
         ("Masts", "Tops", "Bowsprit"), ("Yard_", "Lateen_"),
         spec_budget=4500,
         budget_why=(
             "five square yards and one lateen against the frigate's nine "
             "yards: Masts 684 + Tops 1,080 + five yards 680 + Lateen_Mizzen "
             "112 + Bowsprit 108 = 2,664, 67% of 4,000; the frigate's 4,500 "
             "would put her at 59% for a smaller rig"
         )),
    Line("sails", "Sails x6 + flag", 4500, ("Sails", "Jolly_Roger"),
         spec_budget=5500,
         budget_why=(
             "six sails, not nine: five square and the lateen at 432 "
             "triangles each on the fixed canvas grid, 2,592, plus the flag "
             "80 = 2,672. Against the frigate's 5,500 that is 49% and under "
             "the floor for a rig that is complete; 4,500 puts it at 59%. "
             "Her damage pass (Task 8b) tears 7 quads out, 14 triangles: "
             "Sails 2,578 + Jolly_Roger 80 = 2,658, still 59%"
         )),
    Line("rigging", "Standing + running rigging", 1500, ("Rigging",),
         spec_budget=4000,
         budget_why=(
             "sized off her complete rig rather than lowered at the floor: "
             "340 ropes at two triangles a segment draw 890 "
             "(ropes.all_ropes, every family buildable, the lateen mizzen's "
             "lee backstays cast off), read off the rebuilt scene, 59% of "
             "1,500 at the ordinary 50% floor. It drew 906 on 348 ropes "
             "until the mizzen channel went up onto the quarterdeck castle "
             "(the maintainer's third ruling, B): her MIZZEN lower shrouds, DEADEYE "
             "to HOUNDS (z 9.186), now rise 1.06 m from the forward deadeye "
             "to 0.48 m from the aftmost, where from the waist channel they "
             "rose 3.61 to 2.98, and carry eight fewer ratlines. The "
             "frigate's 4,000 predates the ribbon and would leave her at "
             "22%"
         )),
    Line("cannons", "Cannons x44, carriages, port lids", 10800,
         (), ("Cannon_", "PortLid_"),
         spec_budget=6000,
         budget_why=(
             "RE-DERIVED from what she draws (the maintainer's ruling, Task 8a), "
             "read off the rebuilt scene: 42 broadside guns -- 24 in the "
             "hull row on Deck_Lower, 18 in the bulwark row on Deck_Main, "
             "her two rows' port counts -- plus her 2 stern chasers, every "
             "one the ONE shared 232-triangle cannon mesh, and a lid for "
             "each, the ONE shared 12-triangle box: 44 x 232 + 44 x 12 = "
             "10,736, so 10,800 is that spend rounded up to the hundred, "
             "99%, the rule every re-derived line keeps. Drawn triangles "
             "stay the unit (controller ruling R5): sharing the mesh lowers "
             "file size, not the count. It was 11,000, 98%, carried from "
             "the estimate of spec section 5's ~250 a station before the "
             "pass ran, until the controller's ruling of fix wave 2"
         )),
    Line("furniture", "Deck furniture", 5600,
         ("Deck_Furniture", "Wheel"), ("Barrel_", "Lantern_", "Anchor_"),
         spec_budget=5000,
         budget_why=(
             "RE-DERIVED from what she draws (the maintainer's ruling, Task 8b), "
             "read off the rebuilt scene on her own deck plan: "
             "Deck_Furniture 866 (capstan, three hatch coamings, the launch, "
             "the wheel's standards) + Wheel 488 + 8 x Barrel_ 156 = 1,248 + "
             "2 x Anchor_ 1,180 = 2,360 + 3 x Lantern_ 196 = 588 = 5,550, so "
             "5,600 is that spend rounded up to the hundred, 99%, with "
             "nothing absent. It was the frigate's 7,000 carried across as "
             "an estimate while her furniture pass did not run"
         )),
    Line("dressing", "Figurehead + damage detail", 1400,
         ("Figurehead", "Sail_Patches", "Damage"),
         spec_budget=2000,
         budget_why=(
             "RE-DERIVED from what she draws with her damage pass in "
             "(Task 8b), read off the rebuilt scene: Figurehead 960 (the "
             "lion) + Sail_Patches 252 + Damage 162 (nine shot scars at 18 "
             "apiece; her castles leave no open rail, so no splinters) = "
             "1,374, so 1,400 is that spend rounded up to the hundred, 98%. "
             "It was the frigate's 2,000 while her damage pass did not run"
         )),
)

# The copies of a shared mesh she draws, which the `.glb` stores ONCE: every
# shared mesh drawn n times is n - 1 repeats. 43 x 232 (Cannon_) + 43 x 12
# (PortLid_) + 7 x 156 (Barrel_) + 1 x 1,180 (Anchor_) + 2 x 196
# (Lantern_) = 13,156, read off her rebuilt scene (test_galleon_budget's
# table). Her ceiling is her 59,200 target less them, and her 5 families'
# atlas sets; a test holds both figures to her Budget and her palette.
GALLEON_SHARED_REPEATS = 43 * 232 + 43 * 12 + 7 * 156 + 1180 + 2 * 196
GALLEON_GLB_CEILING = texbudget.glb_ceiling(59200 - GALLEON_SHARED_REPEATS,
                                            5)

GALLEON_BUDGET = Budget(
    lines=GALLEON_LINES,
    total=59200,
    ceiling=63000,
    ceiling_why=(
        "the frigate's 50,000 ceiling stands 8.7% over her 46,000 target; "
        "the same proportion over the galleon's first 58,000 is 63,043, "
        "rounded DOWN to 63,000 so her margin is no wider than the "
        "frigate's. The lower gun deck raised the hull line by 4,000 and "
        "the target to 62,000 (34.8% over the frigate's, inside the maintainer's "
        "20-35%) out of her own surplus, and the ceiling did not move, as "
        "the frigate's did not for her anchor. The split beakhead flight "
        "re-derived the rails line from 2,000 to 1,500 (what it draws), "
        "and the target followed it to 61,500 (33.7% over the frigate's). "
        "Her furniture and damage passes (Task 8b) re-derived the "
        "furniture line from 7,000 to 5,600 and the dressing line from "
        "2,000 to 1,400 (what they draw), and the target followed them to "
        "59,500 (29.3% over the frigate's); the ceiling did not move. The "
        "cannons line rounded up to the hundred over what it draws, "
        "11,000 to 10,800, and the target followed it to 59,300 (28.9% "
        "over the frigate's). The unsplit beakhead flight over a knee "
        "falling with the rail (the maintainer's third ruling, E and F) re-derived "
        "the rails line from 1,500 to 1,300, and the target followed it "
        "to 59,100 (28.5% over the frigate's). The chase platform under "
        "her stern chasers (the maintainer's third ruling, A') re-derived the decks "
        "line from 3,000 to 3,100, and the target followed it to 59,200 "
        "(28.7% over the frigate's)"
    ),
    fed_by=FED_BY,
    glb_ceiling=GALLEON_GLB_CEILING,
    glb_why=(
        "derived the way the frigate's was, from her budget and her "
        "families: her 59,200 drawn target less the triangles she "
        "draws again off a mesh the file stores once (43 x 232 cannons, "
        "43 x 12 lids, 7 x 156 barrels, 1 x 1,180 anchor, 2 x 196 "
        "lanterns), 13,156, is 46,044 stored, at the frigate's measured "
        "82.37 bytes a triangle, plus 5 atlas sets (her five families) at the "
        "frigate's measured 2,431,234 bytes a set at 1024: 15,948,814, "
        "rounded up to the MB, 16,000,000. Not a widening of the "
        "frigate's 13,000,000, which her own rates give back"
    ),
    glb_basis="her mesh and 5 atlas sets come to at the frigate's rates",
)


# THE FLUTE'S. Every line is what she DRAWS, read off her built scene
# (`tests/test_flute_budget.py`'s table, 30,686 in 57 objects), rounded up to
# the hundred: the rule every re-derived galleon line follows. Her lines are
# the frigate's ten, so every object she builds lands on one, and none of
# them is the frigate's spec figure carried across as an estimate.
FLUTE_LINES = (
    Line("hull", "Hull skin + bulwarks + rudder", 9600,
         ("Hull", "Bulwarks", "Rudder")),
    Line("decks", "Decks, gratings, hatch coamings", 2200,
         ("Deck_Main", "Deck_Quarter", "Deck_Forecastle", "Deck_Poop",
          "Gratings")),
    Line("stern", "Stern castle, gallery windows, transom", 4700,
         ("Transom", "Stern_Gallery", "Stern_Carving",
          "Castle_Forecastle", "Castle_Quarter", "Castle_Poop")),
    Line("rails", "Railings, channels, chainplates", 1000,
         ("Rails", "Channels", "Chainplates", "Headrails", "Beakhead")),
    Line("masts", "Masts, yards, tops, bowsprit", 2600,
         ("Masts", "Tops", "Bowsprit"), ("Yard_", "Lateen_")),
    Line("sails", "Sails x5 + flag", 2300, ("Sails", "Jolly_Roger")),
    Line("rigging", "Standing + running rigging", 800, ("Rigging",)),
    Line("cannons", "Cannons x8, carriages, port lids", 2000,
         (), ("Cannon_", "PortLid_")),
    Line("furniture", "Deck furniture", 4600,
         ("Deck_Furniture", "Wheel"), ("Barrel_", "Lantern_", "Anchor_")),
    Line("dressing", "Figurehead + damage detail", 1500,
         ("Figurehead", "Sail_Patches", "Damage")),
)

# The copies of a shared mesh she draws, which the `.glb` stores ONCE:
# 7 x 232 (Cannon_) + 7 x 12 (PortLid_) + 3 x 156 (Barrel_) + 1 x 1,180
# (Anchor_); her one lantern repeats nothing.
FLUTE_SHARED_REPEATS = 7 * 232 + 7 * 12 + 3 * 156 + 1180
FLUTE_GLB_CEILING = texbudget.glb_ceiling(31300 - FLUTE_SHARED_REPEATS, 4)

FLUTE_BUDGET = Budget(
    lines=FLUTE_LINES,
    total=31300,
    ceiling=34000,
    ceiling_why=(
        "the frigate's 50,000 ceiling stands 8.7% over her 46,000 target; "
        "the same proportion over the flute's 31,300 is 34,022, rounded "
        "DOWN to 34,000 so her margin is no wider than the frigate's"
    ),
    fed_by=FED_BY,
    glb_ceiling=FLUTE_GLB_CEILING,
    glb_why=(
        "derived the way the frigate's was: her 31,300 drawn target less "
        "the triangles she draws again off a mesh the file stores once "
        "(7 x 232 cannons, 7 x 12 lids, 3 x 156 barrels, 1 x 1,180 "
        "anchor), 3,356, at the frigate's measured 82.37 bytes a "
        "triangle, plus her 4 atlas sets at the frigate's 2,431,234 bytes "
        "a set at 1024, rounded up to the MB"
    ),
    glb_basis="her mesh and 4 atlas sets come to at the frigate's rates",
)


# THE SLOOP'S. Every line is what she DRAWS, read off her built scene
# (`tests/test_sloop_budget.py`'s table, 19,286 in 47 objects), rounded up to
# the hundred, as the flute's are. Her gaff and boom spend the masts line, as
# every spar does; her rails line carries no head rails, because she runs no
# `headworks` pass (a sloop has a plain stem).
SLOOP_LINES = (
    Line("hull", "Hull skin + bulwarks + rudder", 5000,
         ("Hull", "Bulwarks", "Rudder")),
    Line("decks", "Decks, gratings, hatch coamings", 1700,
         ("Deck_Main", "Deck_Quarter", "Deck_Forecastle", "Gratings")),
    Line("stern", "Stern, gallery windows, transom", 2100,
         ("Transom", "Stern_Gallery", "Stern_Carving")),
    Line("rails", "Railings, channels, chainplates", 500,
         ("Rails", "Channels", "Chainplates", "Headrails", "Beakhead")),
    Line("masts", "Mast, gaff, boom, bowsprit", 600,
         ("Masts", "Tops", "Bowsprit"), ("Gaff_", "Boom_")),
    Line("sails", "Sails x4 + flag", 1900, ("Sails", "Jolly_Roger")),
    Line("rigging", "Standing + running rigging", 200, ("Rigging",)),
    Line("cannons", "Cannons x8, carriages, port lids", 2000,
         (), ("Cannon_", "PortLid_")),
    Line("furniture", "Deck furniture", 4400,
         ("Deck_Furniture", "Wheel"), ("Barrel_", "Lantern_", "Anchor_")),
    Line("dressing", "Figurehead + patches", 1500,
         ("Figurehead", "Sail_Patches", "Damage")),
)

# 7 x 232 (Cannon_) + 7 x 12 (PortLid_) + 3 x 156 (Barrel_) + 1 x 1,180
# (Anchor_): the copies of a shared mesh the `.glb` stores once.
SLOOP_SHARED_REPEATS = 7 * 232 + 7 * 12 + 3 * 156 + 1180
SLOOP_GLB_CEILING = texbudget.glb_ceiling(19900 - SLOOP_SHARED_REPEATS, 4)

SLOOP_BUDGET = Budget(
    lines=SLOOP_LINES,
    total=19900,
    ceiling=21600,
    ceiling_why=(
        "the frigate's 50,000 ceiling stands 8.7% over her 46,000 target; "
        "the same proportion over the sloop's 19,900 is 21,630, rounded "
        "DOWN to the hundred so her margin is no wider than the frigate's"
    ),
    fed_by=FED_BY,
    glb_ceiling=SLOOP_GLB_CEILING,
    glb_why=(
        "derived the way the frigate's was: her 19,900 drawn target less "
        "the triangles she draws again off a mesh the file stores once "
        "(7 x 232 cannons, 7 x 12 lids, 3 x 156 barrels, 1 x 1,180 "
        "anchor), 3,356, at the frigate's measured 82.37 bytes a "
        "triangle, plus her 4 atlas sets at the frigate's 2,431,234 bytes "
        "a set at 1024, rounded up to the MB"
    ),
    glb_basis="her mesh and 4 atlas sets come to at the frigate's rates",
)


def budget_of(p) -> Budget:
    """The ship's own budget. A ship that declares none is refused, loudly.

    There is no default to fall back on, deliberately: falling back on the
    frigate's table is exactly the defect `Budget` exists to remove.
    """
    b = getattr(p, "budget", None)
    if b is None:
        raise ValueError(
            f"{getattr(p, 'collection', p)!r} declares no triangle budget; "
            "give its params a `budget` rather than judging it against "
            "another ship's lines"
        )
    return b


def line_of(p, key: str) -> Line:
    return budget_of(p).line(key)


def exemplar_of(p, key: str) -> str:
    return line_of(p, key).exemplar


def band(p, key: str) -> tuple:
    """(floor, ceiling) in triangles for one component's line, its OWN floor."""
    return _band(line_of(p, key))


def _band(line: Line) -> tuple:
    return (line.floor * line.budget, OVERSPEND_CEILING * line.budget)


def validate_line(line: Line) -> None:
    """Everything one line must satisfy on its own, floor included."""
    if not line.names and not line.prefixes:
        raise ValueError(f"budget line {line.key!r} claims no objects")
    if line.budget <= 0:
        raise ValueError(f"budget line {line.key!r} has no triangles to spend")
    if not 0.0 < line.floor <= OVERSPEND_CEILING:
        raise ValueError(
            f"budget line {line.key!r} has a floor of {line.floor}, which must "
            f"lie in (0, {OVERSPEND_CEILING}]"
        )
    if line.floor != STARVED_FLOOR and len(line.floor_why) <= 60:
        raise ValueError(
            f"budget line {line.key!r} departs from the {STARVED_FLOOR} floor "
            "without saying why. A lowered floor that carries no argument is "
            "how a tolerance gets widened; set `floor_why` to the reason"
        )
    if line.spec_budget and line.spec_budget != line.budget \
            and len(line.budget_why) <= 60:
        raise ValueError(
            f"budget line {line.key!r} has been moved off its spec section 5 "
            f"figure of {line.spec_budget} to {line.budget} without saying "
            "why. A line raised in silence is how a ceiling gets widened; set "
            "`budget_why` to the reason"
        )


def validate_budget(b: Budget) -> None:
    """Every line valid, no name claimed twice, and the stated figures true.

    The target must BE the sum of the lines, and the ceiling must stand at or
    above it: a target over its own ceiling is a plan that breaks its promise
    before anything is built.
    """
    keys = [line.key for line in b.lines]
    if len(set(keys)) != len(keys):
        raise ValueError(f"budget line keys repeat: {keys}")
    if sum(line.budget for line in b.lines) != b.total:
        raise ValueError(
            f"the lines sum to {sum(line.budget for line in b.lines)} and the "
            f"budget states a target of {b.total}"
        )
    if b.ceiling < b.total:
        raise ValueError(
            f"a ceiling of {b.ceiling} under a target of {b.total}"
        )
    if set(dict(b.fed_by)) != set(keys) or len(b.fed_by) != len(keys):
        raise ValueError(
            f"`fed_by` must name the passes of every line exactly once; it "
            f"covers {[k for k, _ in b.fed_by]} against lines {keys}"
        )
    empty = [k for k, passes in b.fed_by if not passes]
    if empty:
        raise ValueError(
            f"`fed_by` gives lines {empty} no pass; a line fed by nothing "
            "would print STARVED naming no pass"
        )
    if b.glb_ceiling <= 0:
        raise ValueError(
            "a budget with no glb ceiling; set `glb_ceiling` rather than "
            "judging her file against another ship's"
        )
    if len(b.glb_why) <= 60 or not b.glb_basis:
        raise ValueError(
            f"a glb ceiling of {b.glb_ceiling} that does not say where it "
            "comes from; set `glb_why` and `glb_basis`"
        )
    if len(b.ceiling_why) <= 60:
        raise ValueError(
            f"a ceiling of {b.ceiling} that does not say where it comes from; "
            "set `ceiling_why`"
        )
    lines = b.lines
    for i, line in enumerate(lines):
        validate_line(line)
        for other in lines[i + 1:]:
            both = set(line.names) & set(other.names)
            if both:
                raise ValueError(
                    f"{sorted(both)} is claimed by both {line.key!r} and {other.key!r}"
                )
            for name in line.names:
                if any(name.startswith(p) for p in other.prefixes):
                    raise ValueError(
                        f"{name!r} is claimed by {line.key!r} and by "
                        f"{other.key!r}'s prefix rule"
                    )
            for name in other.names:
                if any(name.startswith(p) for p in line.prefixes):
                    raise ValueError(
                        f"{name!r} is claimed by {other.key!r} and by "
                        f"{line.key!r}'s prefix rule"
                    )


def validate_rules(p) -> None:
    """No object name may be claimed by two of THIS SHIP's lines, and none
    empty."""
    validate_budget(budget_of(p))


def component_of(p, name: str) -> str:
    """Which spec section 5 line an object spends. Raises on anything unclaimed.

    Unclassified geometry is not free geometry — it is a component quietly
    growing outside its own line, which is the defect this module exists to
    catch. A new object must be given a line here before it can be built.
    """
    lines = budget_of(p).lines
    for line in lines:
        if name in line.names:
            return line.key
    for line in lines:
        if line.claims(name):
            return line.key
    raise ValueError(
        f"object {name!r} belongs to no line of {p.collection}'s triangle "
        "budget; give it a line on her `Budget` rather than letting it spend "
        "no budget"
    )


def totals(p, counts: dict) -> dict:
    """Drawn triangles per component, from per-object counts. Zero if absent."""
    out = {line.key: 0 for line in budget_of(p).lines}
    for name, tris in counts.items():
        out[component_of(p, name)] += tris
    return out


def audit(p, counts: dict) -> dict:
    """One check-style result per component, keyed by the whole measurement.

    The key names BOTH ends of what is being compared — the drawn triangles of
    this component's own objects, and this component's own spec line — because
    this project has three times produced a wrong figure from a measurement
    whose endpoints were left unnamed.
    """
    validate_rules(p)
    measured = totals(p, counts)
    fed_by = dict(budget_of(p).fed_by)
    out = {}
    for line in budget_of(p).lines:
        got = measured[line.key]
        fed = fed_by[line.key]
        off = [label for label in fed if not p.builds(label)]
        # STARVED BY HER OWN PLAN, NOT BY A DEFECT. Every pass that feeds the
        # line is one she does not run, so there is nothing to judge -- and
        # that is SAID, on a key of its own, rather than left out. Whether
        # the pass should run is the maintainer's question; this check answers only
        # spend against budget. A line one of whose passes she DOES run is
        # judged below like any other, and empty it fails.
        if got == 0 and len(off) == len(fed):
            out[
                f"{line.key}: STARVED — {_passes_phrase(off)} "
                f"not in p.passes (0 of {line.budget})"
            ] = True
            continue
        floor, ceiling = _band(line)
        pct = 100.0 * got / line.budget
        note = "" if line.floor == STARVED_FLOOR else f" [floor {line.floor:.0%}]"
        if off:
            note += f" [{_passes_phrase(off)} not in p.passes]"
        out[
            f"{line.key} drew {got} tris of its {line.budget} line ({pct:.0f}%), "
            f"band {int(floor)}-{int(ceiling)}{note}"
        ] = floor <= got <= ceiling
    return out


def _passes_phrase(labels) -> str:
    quoted = ", ".join(repr(label) for label in labels)
    return f"pass {quoted}" if len(labels) == 1 else f"passes {quoted}"


def ceiling_result(p, total: int) -> tuple:
    """(key, verdict) for the whole ship against HER OWN ceiling."""
    ceiling = budget_of(p).ceiling
    return (f"the whole ship drew {total} tris of the {ceiling} ceiling",
            total <= ceiling)


def glb_result(p, nbytes: int) -> tuple:
    """(key, verdict) for her exported file against HER OWN glb ceiling."""
    b = budget_of(p)
    return (f"the glb is {nbytes / 1e6:.1f} MB, under the "
            f"{b.glb_ceiling / 1e6:.0f} MB {b.glb_basis}",
            nbytes <= b.glb_ceiling)


def tris_summary(p, total: int) -> str:
    """The `check_all` footer: drawn, against her own target and ceiling."""
    b = budget_of(p)
    return f"TRIS {total} of {b.total} target / {b.ceiling} ceiling"
