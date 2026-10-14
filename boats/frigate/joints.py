"""Which two objects are ALLOWED to occupy the same space, and why. Pure.

Thirteen checks verify each component against the hull's parameters in
isolation. Not one of them asked whether two components stand in the same
place, and that blind spot is how shrouds buried in the bulwark timber and
canvas sliced by its own patches reached the user's eyes.

`checks.check_intersections` measures the overlaps with BVH trees. The ruling
on each pair is policy, not arithmetic, so it lives here where plain pytest can
read it.

Three kinds of entry:

- **JOINTS** — interpenetration is the correct modelling of a real fastening.
  A bulwark seats ON the sheer; a yard is bound TO its mast; a shroud is set up
  TO a chainplate. Trimming these apart would open seams a game asset must not
  have. Unbounded: a joint may grow as the parts around it are detailed.
- **DEVIATIONS** — known wrong, deliberately not fixed here, each with a
  face-pair CAP so it cannot quietly get worse. Every one of these is written
  up in the ledger and carried to the user as an open question.
- Everything else is a DEFECT. A pair that nobody has ruled on fails, which is
  the point: new geometry must be judged, not waved through.
"""

import re
from dataclasses import dataclass

_FAMILY = re.compile(r"^([A-Za-z_]+_)\d+$")


def family(name: str) -> str:
    """`Cannon_07` and `Cannon_11` are one family: 24 instances of one mesh.

    An intersection between two members of one family is a layout question
    about that family alone, and between a family and something else the
    ruling is the same for every member, so the table is keyed by family.
    """
    hit = _FAMILY.match(name)
    return hit.group(1) if hit else name


def pair(a: str, b: str) -> tuple:
    """A pair key that reads the same whichever way round it is asked."""
    return tuple(sorted((family(a), family(b))))


def _j(a: str, b: str, why: str) -> tuple:
    return (pair(a, b), why)


JOINTS = dict([
    # --- the ship's own structure, fastened together -----------------------
    _j("Hull", "Bulwarks",
       "the bulwark seats ON the hull sheer; a gap there would be a seam"),
    _j("Hull", "Deck_Main",
       "the gun deck is cut to the BULWARK's inner face at the sheer, which is "
       "hull CAGE math, and the subsurf pulls the rendered skin in under it. "
       "The deck edge therefore lies in the void between the hull's limit "
       "surface and the bulwark's inner skin -- measured 0.162 m outboard of "
       "the limit surface at the fore and aft tips and 0.096 m amidships -- "
       "and the bulwark's outer skin stands outboard of all of it, so none of "
       "it shows. This entry used to read 'let INTO the hull planking', which "
       "the geometry contradicts; the deck is let into the BULWARK and merely "
       "crosses the hull cage. See the Deck_Main-to-Bulwarks direction rule"),
    _j("Bulwarks", "Deck_Main",
       "the deck edge is let into the bulwark's inboard face"),

    # --- a TWO-DECKER: the lower gun deck and the ceiling over it ----------
    #
    # The maintainer's ruling (2026-10-05): a true lower gun deck inside the hull. All
    # measured on the galleon rebuilt with it, with `checks._bvh`.
    _j("Hull", "Deck_Lower",
       "the same family as Hull x Deck_Main: the lower gun deck is cut to "
       "the CEILING's inner face, `bulwark_thick` inboard of the hull cage "
       "at the deck's own height (`tier_half_beam`), so its edge stands in "
       "the side timber and never reaches the skin. Measured: 0 face "
       "pairs. A joint passes at ANY count, so this entry does NOT judge a "
       "deck that reached the skin: it would wave such pairs through"),
    _j("Ceiling_Lower", "Hull",
       "the ceiling is the inner planking of the side, and each lower port's "
       "lining is bridged from the ceiling's rim OUT to the hull skin's own "
       "rim points, where it is fastened; the ceiling's top edge and its two "
       "end bulkheads also meet the hull loft's closing face at the sheer. "
       "Measured: 73 face pairs, x -4.78 to 4.78, y -12.58 to 11.22, "
       "z 1.59 to 4.57"),
    _j("Bulwarks", "Ceiling_Lower",
       "the ceiling is the bulwark's inner skin carried DOWN: the two meet at "
       "the sheer at the same half-width. Measured: 4 face pairs, y 0.74 to "
       "6.65, z 2.63 to 3.23"),
    _j("Ceiling_Lower", "Deck_Lower",
       "the lower gun deck's edge is let into the ceiling's inboard face, "
       "exactly as the gun deck's is let into the bulwark's, and the two end "
       "bulkheads stand ON it. Measured: 192 face pairs, x -4.93 to 4.93, "
       "y -12.58 to 11.22, z 0.98 to 3.16"),
    _j("Ceiling_Lower", "Deck_Main",
       "the ceiling runs up to the gun deck's edge at the sheer and the two "
       "end bulkheads are closed against the gun deck's surface, so the "
       "space between the decks has no gap to the sky. Measured: 144 face "
       "pairs, x -4.27 to 4.27, y -12.58 to 11.22, z 1.59 to 4.57"),
    # --- a CHASE PLATFORM under the stern chasers --------------------------
    #
    # The maintainer's third ruling, A' (Task 11): a level planked platform at
    # Deck_Main's level at the chasers' station (5.331 m), from Deck_Main's
    # end (y -15.64) aft to the hull's end cap less `skin_clearance`
    # (y -16.96, final review 3). Measured on the galleon rebuilt with it,
    # with `checks._bvh`. There is NO `Chase_Platform x Hull` entry (final
    # review 3, M-2; ruling 3870): below the sheer the planking stops
    # `skin_clearance` short of the skin and the end cap and touches
    # nothing of the Hull, so any pair there is a defect and FAILS.
    _j("Chase_Platform", "Deck_Main",
       "the platform's fore end face and its fore beam's fore face stand "
       "in Deck_Main's end plane (y -15.64), and the level platform and the "
       "deck's cambered end overlap there -- DECK_MAIN'S SURFACE at her end "
       "to PLATFORM TOP +0.183 m on the centreline, -0.057 m at her edge; "
       "the riser under her end (y -15.68 to -15.64) reaches her underside "
       "as her grid lays it, 0.003-0.006 m above her built underside. "
       "Measured: 53 face pairs, the platform's planking, fore beam and "
       "riser x -2.535 to 2.535, y -15.92 to -15.64, z 4.971 to 5.394, "
       "against Deck_Main x -2.825 to 2.825, y -15.678 to -13.994, "
       "z 4.613 to 5.454"),
    _j("Bulwarks", "Chase_Platform",
       "over its fore end the platform stands above the sheer (PLATFORM "
       "TOP 5.331 against the SHEER 5.274 at Deck_Main's end), and there "
       "its planking edge and the bulwark's inner skin overlap "
       "athwartships: PLATFORM EDGE to BULWARK INNER FACE at PLATFORM TOP "
       "0.016 m at Deck_Main's end, 0 at the sheer crossing (y -15.797). "
       "Measured: 4 face pairs, the platform's top and fore end faces "
       "x +/-2.535, y -15.797 to -15.64, z 5.211 to 5.331, against the "
       "bulwark's inner skin x +/-2.557, y -16.261 to -15.522, z 5.231 to "
       "6.355"),
    _j("Bulwarks", "Deck_Forecastle",
       "the forecastle platform is let into the bulwark's inboard face"),
    _j("Bulwarks", "Deck_Quarter",
       "the quarterdeck platform is let into the bulwark's inboard face"),

    # --- the castles ------------------------------------------------------
    #
    # A galleon's stern is a flight of steps and every step is a twin-skin
    # wall standing on the rail below it, with its own deck let into its
    # inboard face. The frigate declares no castle tier and so emits none of
    # these objects; the rulings stand whether or not the ship being checked
    # has them, which is what `check_directions` skipping an ABSENT member
    # means and does not mean.
    _j("Bulwarks", "Castle_Forecastle",
       "the forecastle castle's wall is stepped ON the waist rail cap, which "
       "is a seat, not an overlap: a gap there would be a hole in the ship's "
       "side between two decks"),
    _j("Bulwarks", "Castle_Quarter",
       "the quarterdeck castle's wall is stepped ON the waist rail cap, the "
       "same seat the forecastle's takes at the other end of the ship"),
    _j("Castle_Poop", "Castle_Quarter",
       "the poop's wall is stepped ON the QUARTERDECK's rail cap, not on the "
       "waist rail two decks below it; `profiles.castle_foot_z` is what puts "
       "it there and a wall run down to the waist would pass straight through "
       "the deck it is supposed to be standing on"),
    _j("Castle_Forecastle", "Deck_Forecastle",
       "the forecastle deck edge is let INTO the castle wall's inboard face, "
       "exactly as the gun deck is let into the bulwark's"),
    _j("Castle_Quarter", "Deck_Quarter",
       "the quarterdeck edge is let INTO its own castle wall's inboard face"),
    _j("Castle_Poop", "Deck_Poop",
       "the poop deck edge is let INTO its own castle wall's inboard face"),
    _j("Bulwarks", "Rails",
       "the rail stanchions stand ON the bulwark cap they are stepped into"),
    _j("Bulwarks", "Transom",
       "the transom closes the after end of the bulwark and is scarphed to it"),
    _j("Hull", "Transom",
       "the transom closes the after end of the hull planking"),
    _j("Hull", "Rudder",
       "the rudder is HUNG ON the sternpost: its leading edge is let 0.060 m "
       "into the transom and each of the three pintle straps 0.030 m further "
       "still, which is what a pintle-and-gudgeon hanging IS -- the straps "
       "are let into both timbers and the pintle turns in the gudgeon they "
       "make between them. Trimming them apart would leave the rudder "
       "hanging in open water behind a ship it is not attached to"),
    _j("Hull", "Stern_Gallery",
       "the gallery is built out FROM the hull transom and keyed back into it"),
    _j("Transom", "Stern_Carving",
       "the carving is applied TO the transom face it is fastened to"),
    _j("Deck_Quarter", "Stern_Carving",
       "the carving runs down past the quarterdeck it is built off"),
    _j("Deck_Quarter", "Transom",
       "the transom closes the after end of the quarterdeck"),

    # --- a CASTLE ship's stern, which is several of the above stacked -------
    # Every one of these is the joint immediately above it, one deck higher.
    # `decks._castle_wall` closes a castle forward at its break and leaves it
    # open aft, so on a galleon the transom has to close the quarterdeck and
    # the poop as well as the waist, and the gallery and the carving have to
    # meet each of those panels in turn.
    _j("Castle_Quarter", "Transom",
       "the transom panel closes the after end of the quarterdeck castle's "
       "wall and is scarphed to it, exactly as it is to the waist bulwark"),
    _j("Castle_Poop", "Transom",
       "and the panel above it closes the poop's"),
    _j("Deck_Poop", "Transom",
       "the transom closes the after end of the poop deck"),
    _j("Castle_Quarter", "Stern_Carving",
       "the carved panel on the quarterdeck's transom is applied TO the "
       "castle wall it closes, and laps its after edge"),
    _j("Castle_Poop", "Stern_Carving",
       "and the taffrail cap is applied to the poop's"),
    _j("Deck_Poop", "Stern_Carving",
       "the poop's own carved transom runs down past the deck it is built "
       "off, as the frigate's runs down past her quarterdeck"),
    _j("Bulwarks", "Stern_Carving",
       "the waist panel's frieze runs down onto the bulwark at the stern "
       "sheer, which is the timber it is fastened to there"),
    _j("Bulwarks", "Stern_Gallery",
       "the gallery's cornice is keyed back into the bulwark above it"),
    _j("Castle_Quarter", "Stern_Gallery",
       "the COACH's lights are cut in the quarterdeck castle's own transom: "
       "the band stands out FROM that wall and is keyed back into it, which "
       "is the same joint the great cabin's lights make with the hull "
       "transom one deck below"),
    _j("Deck_Quarter", "Stern_Gallery",
       "the coach's gallery is keyed back into the quarterdeck it opens off"),
    _j("Stern_Gallery", "Transom",
       "a gallery standing in a CASTLE's transom panel is keyed back into "
       "that panel, which is the same joint the frigate's gallery makes with "
       "the hull transom below her own sheer -- there the transom object does "
       "not reach, so the pair never arose"),
    _j("Stern_Carving", "Stern_Gallery",
       "the carved transom and the window band meet where one stops and the "
       "other starts: the gallery's cornice runs under the carving's lowest "
       "frieze and the two lap at that seam"),

    # --- fittings fastened to that structure --------------------------------
    _j("Bulwarks", "Channels",
       "a channel is bolted flat against the bulwark's outer face"),
    _j("Chainplates", "Hull",
       "a chainplate's FOOT is bolted to the hull planking below the wale, "
       "which is where a chainplate lands on any ship whose lowest row of "
       "ports is high enough to leave planking under it. The frigate's one "
       "row leaves her strap feet 0.25 m ABOVE her sheer, on the bulwark; "
       "the galleon's feet fall 2.20 m from a waist channel's edge (4.62 "
       "from her mizzen's, on the quarterdeck castle) and land 0.40-0.44 m "
       "below the sheer, on the hull, just over her hull row's port heads"),
    _j("Channels", "Chainplates",
       "the chainplate is bolted THROUGH the channel it passes down from"),
    _j("Bulwarks", "PortLid_",
       "a port lid is hinged IN the aperture cut through the bulwark"),
    _j("Hull", "PortLid_",
       "a HULL-row port lid is hinged IN the aperture cut through the hull "
       "skin, as a bulwark-row lid is in the bulwark's: hinged at the port "
       "head ON the outer skin and shut leaning out with it. Measured on "
       "the galleon (Task 8a): 180 face pairs on all 24 hull lids. Two "
       "measurements, not one: 58 lid vertices lie inboard of the hull "
       "cage, the deepest 0.154 m from the HULL CAGE's inner face to the "
       "LID VERTEX; and every one of them lies within LID_THICK 0.070 m "
       "from its own HINGE LINE down to the LID VERTEX, which is the hinge "
       "edge and nothing else"),
    _j("Ceiling_Lower", "PortLid_",
       "the same hinge seen from inboard: each hull port's lining is "
       "bridged from the ceiling's rim out to the hull skin's, so a lid "
       "hinged at the port head lies against the lining's head. Measured "
       "on the galleon (Task 8a): 118 face pairs on all 24 hull lids, "
       "from WATERLINE to the LOWEST contact 2.56 m and WATERLINE to the "
       "HIGHEST 3.62 m, every one within LID_THICK from its HINGE LINE"),
    _j("Transom", "PortLid_",
       "the chase port lids are hinged in the transom"),
    _j("Stern_Carving", "PortLid_",
       "the chase lids swing out past the carving around their own ports"),
    _j("Transom", "Lantern_",
       "the three taffrail lanterns are mounted ON the transom rail"),
    _j("Bulwarks", "Figurehead",
       "the figurehead and its trailboards are bolted to the stem and fair "
       "into the bulwark at the bow"),
    _j("Hull", "Figurehead",
       "Minerva's lower drapery is let INTO the stem it is bolted to -- that "
       "is what truncates the carving below, exactly as the reference figure "
       "is truncated where it meets its own stem board -- and each trailboard "
       "is fastened flat against the bow planking, standing 0.055 m proud of "
       "it and let 0.015 m into it. Trimming either apart would open a seam "
       "down the one part of the ship a viewer looks at first"),

    # --- the head: everything in it is bolted to something else -------------
    _j("Headrails", "Hull",
       "the knee of the head is let INTO the stem it is bolted to by its own "
       "stated depth -- `head_form.knee_into_stem`, 0.10 m on the frigate "
       "and 0.12 m on the galleon -- "
       "which is the whole of how a cutwater is fastened, and the lower head "
       "rail runs down the bow planking it is bolted flat against. Trimming "
       "either apart would open a seam along the stem"),
    _j("Headrails", "Bulwarks",
       "the lower head rail springs off the bulwark cap and its moulding is "
       "let into the bulwark's outer face, exactly as the trailboard forward "
       "of it is"),
    _j("Headrails", "Figurehead",
       "the head rails DIE INTO the carving: the lower rail's forward section "
       "is the same four points as the trailboard's aft section, so the two "
       "share an end rather than meet at one, and the upper rail is let into "
       "Minerva's hip where it lands. The head timbers stand on the trailboard "
       "between them. On the galleon the knee of the head (part of "
       "Headrails) falls with the rail and enters the lion through its "
       "rump: at the heel's y its KNEE TOP 3.2802 stands inside the RUMP "
       "RING 3.1234 .. 3.4767, and it crosses the tail's aft bend; the pair "
       "count is read at the bake"),
    _j("Headrails", "Rails",
       "the upper head rail's heel is SCARPHED into the forward end of the "
       "forecastle rail it springs from, lapping it by 31 mm; butted instead, "
       "the two left a 4 mm seam at the one place the eye follows the sweep "
       "from the ship onto the head"),
    _j("Beakhead", "Bulwarks",
       "the beakhead bulkhead is let into each bulwark's inboard face by its "
       "own stated depth, which is what closing the forecastle forward means. "
       "That is the WAIST bulwark on a flush-decked ship like the frigate, "
       "whose forecastle tucks under the main rail"),
    _j("Beakhead", "Castle_Forecastle",
       "on a ship whose forecastle is a CASTLE standing clear above the waist "
       "rail, the wall the bulkhead is let into is the castle's own, not the "
       "waist bulwark two decks below it. Same joint, different timber, "
       "because the galleon's forecastle deck stands 0.69 m ABOVE the waist "
       "rail cap and a bulkhead between them would have been inside out"),
    _j("Castle_Forecastle", "Headrails",
       "the upper head rail's HEEL is let into the forecastle castle's wall "
       "at the castle's own rail cap, which is where that rail springs from "
       "on a castle ship -- the same joint the frigate makes against her open "
       "`Rails`, against the timber that stands in its place here"),
    _j("Beakhead", "Deck_Forecastle",
       "the bulkhead is stepped DOWN INTO the forecastle platform it stands on"),
    _j("Beakhead", "Bowsprit",
       "the bowsprit is housed THROUGH the beakhead bulkhead. That is why the "
       "bulkhead stands at the bowsprit heel's own station and not at one "
       "chosen by eye: on a real ship the spar is stepped against this wall"),

    # --- the rig: spars bear on each other and on the hull ------------------
    _j("Masts", "Tops",
       "a top is a platform built AROUND its own lower masthead"),
    _j("Masts", "Yard_",
       "a yard is slung on its own mast and cannot float clear of it"),
    _j("Lateen_Mizzen", "Masts",
       "a LATEEN yard crosses its own mast once, at the slings, and is "
       "parrelled to it there -- the same joint a square yard makes, on a "
       "spar that lies fore and aft instead of athwartships"),
    _j("Masts", "Deck_Main",
       "a mast is stepped THROUGH the gun deck down to the keelson"),
    _j("Masts", "Deck_Forecastle",
       "the foremast passes up through the forecastle platform"),
    _j("Masts", "Deck_Quarter",
       "the mizzen passes up through the quarterdeck platform"),
    _j("Bowsprit", "Bulwarks",
       "the bowsprit heel is housed THROUGH the bow bulwark"),
    _j("Bowsprit", "Castle_Forecastle",
       "on a ship whose forecastle is a CASTLE, the bowsprit is housed "
       "through that castle's own wall on its way out, exactly as it is "
       "housed through the waist bulwark of a ship whose forecastle is not"),
    _j("Castle_Poop", "Masts",
       "the mizzen passes up THROUGH the poop castle's wall, which is what "
       "a mast stepped on the keelson does to every deck and every wall "
       "between it and the open air"),
    _j("Deck_Poop", "Masts",
       "and up through the poop platform itself"),
    _j("Bowsprit", "Deck_Forecastle",
       "the bowsprit heel passes down through the forecastle to its step"),
    _j("Bowsprit", "Rails",
       "the bowsprit crosses over the head rail on its way out"),

    # --- rigging, which exists to be made fast to things --------------------
    _j("Rigging", "Masts",
       "every shroud and stay is set up AT the masthead it supports"),
    _j("Rigging", "Yard_",
       "a brace is bent to the yard arm it hauls, a lift to the arm it holds "
       "level, and every footrope and stirrup is seized to the yard it hangs "
       "under -- running rigging is fast to its own spar by definition"),
    _j("Rigging", "Tops",
       "the futtock shrouds land on the rim of their own top"),
    _j("Rigging", "Bowsprit",
       "the two headstays are set up to the bowsprit, and the bobstays, "
       "bowsprit shrouds and jib guys are all set up FROM it -- that spar is "
       "the anchor point for the whole of the head rigging"),
    _j("Rigging", "Headrails",
       "the two bobstays set up to the KNEE OF THE HEAD, which is what a "
       "bobstay is for: it holds the bowsprit down, and the knee is the only "
       "timber forward of the stem strong enough to take that pull. Both "
       "pass UNDER the figurehead on their way to it"),
    _j("Rigging", "Chainplates",
       "a shroud's foot IS the chainplate head it is turned in at"),
    _j("Rigging", "Channels",
       "the shrouds bear down on the channel that spreads them"),
    _j("Masts", "Jolly_Roger",
       "the colours are bent to the mizzen truck they are hoisted on"),
    _j("Masts", "Pennant",
       "the owner's pennant is bent to the truck it is hoisted on "
       "(`owner.pennant_staff`): its luff stands on the mast's own axis"),

    # --- things that stand on, or are stowed against, the ship --------------
    _j("Cannon_", "Deck_Main",
       "the carriage trucks stand ON the deck and bed slightly into it"),
    _j("Cannon_", "Deck_Lower",
       "a HULL-row gun's carriage trucks stand ON the lower gun deck that "
       "serves the row and bed slightly into it, exactly as the bulwark "
       "row's do on Deck_Main. Measured on the galleon (Task 8a): 256 face "
       "pairs, all 24 hull-row guns, every hit in the trucks and bed, "
       "CARRIAGE FLOOR to hit 0.02-0.20 m"),
    _j("Barrel_", "Deck_Main",
       "a barrel stands ON the deck it is stowed on"),
    _j("Barrel_", "Deck_Quarter",
       "a barrel stands ON the quarterdeck it is stowed on"),
    _j("Deck_Furniture", "Deck_Main",
       "every coaming, bitt and skid is stepped INTO the deck it stands on"),
    _j("Deck_Furniture", "Deck_Quarter",
       "the wheel and its pedestal are stepped into the quarterdeck"),
    _j("Deck_Furniture", "Wheel",
       "the wheel turns BETWEEN its own two standards, and the standards stay "
       "in the deck furniture because they do not turn. The rim and the lower "
       "spokes pass inside the heads of those standards: that overlap IS the "
       "bearing the spindle runs in, and trimming it apart would leave a "
       "wheel hanging clear of the pedestal it is mounted on"),
    _j("Deck_Furniture", "Gratings",
       "a grating sits DOWN IN the hatch coaming that carries it"),
    _j("Deck_Furniture", "Masts",
       "the fife rail is built around the mast it belays to"),
    _j("Anchor_", "Bulwarks",
       "the bower anchor is catted against the ship's side"),
    _j("Anchor_", "Hull",
       "its fluke lies against the bow planking it is stowed on"),
    _j("Anchor_", "Rails",
       "its stock is lashed to the rail it hangs from"),

    # --- the damage pass, which is destructive on purpose -------------------
    _j("Damage", "Hull",
       "a shot scar is cut INTO the hull skin it scars"),
    _j("Damage", "Bulwarks",
       "the splinters stand where the rail and bulwark were shot away"),

    # --- a LATEEN mizzen: the joints a square rig does not have ------------
    #
    # Every one measured on the galleon, both endpoints named, and every one a
    # consequence of a rule this pass now ASSERTS rather than an accident.
    _j("Lateen_Mizzen", "Sails",
       "THE CANVAS IS BENT TO THIS SPAR. `sailplan.spar_segments` returns the "
       "lateen yard as the sail's own tack-to-peak and `check_sails` asserts "
       "that the canvas HEAD is that spar to 1e-6, so the two share their "
       "whole length by construction: measured over y -17.54 to -7.59 and "
       "z 7.38 to 20.13, which is the yard end to end. The pass this joint "
       "comes from exists because the two were once 3.5 m APART"),
    _j("Lateen_Mizzen", "Rigging",
       "the halyard is bent to the SLINGS, the tack to the HEEL and the two "
       "vangs to the PEAK, so three of the four lateen families touch this "
       "spar by definition; the fourth rope here is the mizzen STAY, which "
       "leaves the mast axis and must cross a spar that lies fore and aft. "
       "Measured over y -17.54 to -7.59, z 7.38 to 20.13"),
    _j("Masts", "Sails",
       "A LATEEN CROSSES ITS OWN MAST. `check_sails` asserts that every "
       "lateen lies in the ship's fore-and-aft plane, and the mast stands in "
       "that plane too, so the canvas meets it where the yard does -- at the "
       "SLINGS. Measured on the galleon's mizzen at z 11.06 to 11.08 against "
       "slings at z 11.206: five face pairs, and nowhere else on the ship. A "
       "SQUARE sail has no such joint -- it is set `wind.sail_fwd` forward of "
       "its own mast's SKIN and `check_sails` asserts that separately"),

    # --- a CASTLE ship: a channel on a castle wall ---------------------------
    #
    # `Castle_Quarter x Rigging` and `Deck_Poop x Rigging` WERE joints here,
    # for mizzen shrouds led from a channel on the waist bulwark up through
    # the quarterdeck's wall and the poop platform. Task 9 (the maintainer's third
    # ruling, B) put that channel on the quarterdeck castle's side: Blender
    # measures Castle_Quarter x Rigging 0 face pairs, so its joint is gone
    # (no ship has that contact), and the shrouds now cross the POOP's side
    # instead, which is a defect, capped in DEVIATIONS -- not a joint.
    # `Deck_Poop x Rigging` stays the joint it always was (re-measured,
    # Task 9 fix round 1): the shrouds still go down through the poop deck
    # beside the mast from hounds just over it.
    _j("Deck_Poop", "Rigging",
       "the mizzen is stepped on the keelson and its shrouds gather at its "
       "own hounds, z 9.186, just over the poop deck, so both go THROUGH "
       "the poop platform beside the mast -- the same joint `Masts x "
       "Deck_Poop` already rules for the mast. Measured as crossing points "
       "(Task 9, channel on the quarterdeck castle): the aft three shrouds "
       "a side, x -1.00 to -0.36 and 0.36 to 1.00 at y -11.24 to -10.55, "
       "z 9.02 to 9.20"),
    _j("Castle_Quarter", "Channels",
       "a channel on a castle (`RailForm.castle_channels`) is bolted flat "
       "against the castle wall's outer face, as one on the waist is "
       "against the bulwark's. Measured: the galleon's mizzen channel, 48 "
       "face pairs"),
    _j("Figurehead", "Rigging",
       "a BOBSTAY is set up to the KNEE of the head -- `ropes.BOBSTAY_KNEE` "
       "takes it to 0.50-0.70 of forefoot-to-stem-head -- and a galleon's "
       "carving is cut ON that knee, where a frigate's goddess stands clear "
       "above it. Measured: bobstays only, x -0.04 to 0.04 at y 18.68 to "
       "19.61 and z 3.17 to 4.19, five face pairs in the lion's rump"),
])


DEVIATIONS = {
    # `Cannon_ x Hull` (was capped at 44, question A') is RETIRED. Each
    # stern chaser's carriage bed, after cheeks and after wheels lay INSIDE
    # the hull's top surface abaft Deck_Main's end, y -15.89 to -16.63, z
    # 5.37 to 5.65, 0.260 m deep at the deepest (22 face pairs on each of
    # Cannon_42 and 43): her Deck_Main ends 1.36 m short of her transom and
    # her sheer climbs 0.664 m over that run. The maintainer's third ruling (A')
    # stood the chasers ON a Chase_Platform at Deck_Main's level carried aft
    # to the transom, and the hull's closing face is left out over it;
    # Blender measured 0 pairs (Task 11). The pair is UNRULED again: any
    # contact FAILS.
    #
    # `Chainplates x PortLid_` (was capped at 32, question A) is RETIRED.
    # The straps of hull ports 6 and 11 a side ran 0.040 m from the port
    # edge, inside the lid's 0.08 m overhang, with the STRAP FOOT at z 2.481
    # under the PORT HEAD at z 2.636 (8 face pairs on each of PortLid_12,
    # 13, 22, 23). The maintainer's third ruling (A) shortened the drop to 2.20,
    # derived (R11) as the largest to the cm whose every foot beside the
    # hull row stops `strap_clear` 0.04 over its port head and whose every
    # strap clears every hull lid's sweep by as much; Blender measured 0
    # pairs (Task 9). The pair is UNRULED again: any contact FAILS.
    #
    # `Deck_Quarter x Rigging` (was capped at 18, question B) is RETIRED.
    # The aftmost mizzen shroud each side and a ratline end passed through
    # Deck_Quarter's planking under the poop at x +/-1.95 to 2.17, y -11.84,
    # z ~7.69, from a mizzen channel under the waist cap. The maintainer's third
    # ruling (B) moved that channel onto the quarterdeck castle's side,
    # QUARTERDECK EDGE to CHANNEL TOP 0.88 m, and Blender measured 0 pairs
    # (Task 9). The pair is UNRULED again: any contact FAILS.
    #
    # Task 9, measured on the galleon with the mizzen channel on the
    # quarterdeck castle: the aft three mizzen shrouds a side cross the
    # poop's side and its deck edge. Capped at what she draws.
    pair("Castle_Poop", "Rigging"): (
        14,
        "known defect, question B' for the maintainer: the aft three mizzen shrouds "
        "a side, set up to deadeyes abaft the poop break (t 0.81) on the "
        "quarterdeck castle's channel, cross the POOP's walls. Crossing "
        "points (ray casts along each hit ribbon): x +/-0.57 to 1.86, y "
        "-12.12 to -10.54, z 8.73 to 9.15 -- the shroud to the y -12.10 "
        "deadeye through the poop's forward bulkhead and side, the two "
        "abaft it through the side at x +/-1.57 to 1.84, 0.29-0.33 m above "
        "the QUARTERDECK CAP the poop wall stands on. Cause: the mizzen's "
        "hounds, where its shrouds gather, stand at z 9.186, under the "
        "poop cap (1.27-1.31 m), so a shroud from any deadeye abaft the "
        "break must pass the poop's walls whatever wall the channel is on. "
        "Higher hounds or a channel on the poop are the maintainer's call, not this "
        "table's",
    ),
    # Measured on the 42 m galleon (the maintainer's ruling to lengthen her):
    # two of her scars drawn between her hull ports stand on a side the
    # rendered skin has drawn in under, and their 0.20 m craters reach the
    # CEILING, her side's inner planking, behind them. Capped at what she
    # draws; not seen from outboard.
    pair("Ceiling_Lower", "Damage"): (
        18,
        "known defect, for the maintainer: on the 42 m galleon two shot scars "
        "between her hull ports (y 6.40, z 2.62 and y 3.90, z 2.17) are "
        "driven 0.20 m in where the rendered skin stands within 0.20 m of "
        "the ceiling 0.22 m inboard of the cage, so each crater's bottom "
        "pierces the ceiling: a shot through the side, seen only from her "
        "lower deck. Shallower craters on her, or a scar rule that reads "
        "the side's thickness, are the maintainer's call",
    ),
    # Ratified by the user as part of the "gunports stay in the bulwark"
    # deviation: the quarterdeck floor crosses the four aftmost ports a side.
    # Recorded in the ledger from Task 4 on, explicitly not to be reopened.
    pair("Deck_Quarter", "PortLid_"): (
        120,
        "ratified deviation: gunports sit high in the bulwark, so the "
        "quarterdeck floor crosses the four aftmost ports a side and their "
        "lids with it. Moving the battery down into the hull is the fix and "
        "it is the user's call, not this task's",
    ),
    # --- CANVAS THROUGH A CASTLE WALL: two RECORDED DEFECTS, both FIXED and
    # both REMOVED from this table, as the Tops pairs below were. Their pairs
    # are UNRULED again, so any face pair at all on either now FAILS.
    #
    # A. `Castle_Forecastle x Sails` (was capped at 10). The fore course's foot
    #    was 0.3000 m inside the forecastle's own wall head (foot z 6.9342
    #    against wall head z 7.2342 at t 0.2000) because every course was
    #    floored on the WAIST cap. 0c3d3c7 floored the galleon's courses on
    #    RAIL_TOP (foot z 8.2342, 1.0000 m over the wall head; the frigate
    #    kept WAIST_CAP).
    # B. `Castle_Poop x Sails` (was capped at 15). The lateen's foot chord was
    #    0.6000 m inside the poop's cap at the break (t 0.8100, y -10.5400,
    #    cap 9.8791) on the default spar. 3e40ee8 set the ruled LateenSpar on
    #    GALLEON_RIG (foot chord 1.2244 m over the poop cap at the break,
    #    1.2000 over the rail cap at the clew).
    # Blender, on the galleon rebuilt at 8c21587 and measured with
    # `checks._bvh`: Castle_Forecastle x Sails 0, Castle_Poop x Sails 0 and
    # Castle_Quarter x Sails 0 face pairs.
    # `Sails x Tops` (95 face pairs) and `Sail_Patches x Tops` (15) WERE listed
    # here, capped at 110 and 20. They are gone, not merely smaller: the lower
    # tops are now cut away forward of their masts — a half ellipse abaft the
    # mast closed by a straight fore edge, mast-axis-to-top-fore-edge 0.40 of
    # mast-axis-to-top-after-edge — so no part of a top stands in the canvas.
    # Both pairs are now UNRULED, which means any face pair at all FAILS. That
    # is deliberate: the deviation was a symmetric platform, and the check must
    # bite the moment one comes back.
}


# A rope kind that may legitimately touch canvas.
#
# A STAY: every SQUARE sail is set `wind.sail_fwd` forward of its own mast and
# every stay leaves the mast AXIS, so a centreline stay must cross the canvas
# plane of some sail on its way forward; the main topmast stay crosses the main
# topgallant's foot by 0.07 m.
#
# A LATEEN HALYARD: and this one is stronger, not weaker. A LATEEN'S CANVAS
# LIES IN THE SHIP'S OWN CENTRE PLANE — `check_sails` asserts it, every corner
# on x = 0 and the plane normal athwartships — and the halyard is rove on that
# same centreline, from the slings up to a block at the masthead. Two things in
# one plane meet. It is also the same joint twice over: the halyard is bent to
# the SLINGS, and the sail's own HEAD is the spar those slings are on, so
# `Lateen_Mizzen x Rigging` and `Lateen_Mizzen x Sails` already rule the pair
# of them at that point.
#
# A LATEEN VANG: a CORNER contact, not a crossing. The vangs are bent to the
# lateen's PEAK, and the peak is a corner of the canvas as well as the end of
# the yard, so each vang starts AT a point of the sail. Measured in Blender on
# the galleon rebuilt at 8c21587: the two vangs (x +-1.64) touch one sail face
# at y -17.71..-16.98, z 18.90..20.04 — the peak, (0, -17.7113, 20.0370). It
# is the same joint twice over, as the halyard's is: `Lateen_Mizzen x
# Rigging` and `Lateen_Mizzen x Sails` already rule the pair at that point.
#
# Shrouds, ratlines, braces and BACKSTAYS have no such excuse and must pass
# clear. A backstay crossing a lateen's belly is a real crossing, and the fix
# is the lee pair cast off (`shiptype.cast_off_to_lee`), not an excuse here.
CANVAS_CONTACT_KINDS = ("stay", "lateen_halyard", "vang")


# A CORNER contact is excused AT ITS CORNER and nowhere else. The vang's
# ruling above is "it starts at a point of the sail", which bounds it: every
# sail face a vang touches must have a vertex within the vang's own ribbon
# width of the corner it is bent to. A vang driven through the belly abaft
# the slings is a crossing, and `check_intersections` fails it naming the
# face's nearest vertex, the corner, and the distance between them.
# (`stay` and `lateen_halyard` are not bounded this way; they predate it.)
CANVAS_CORNER_KINDS = {"vang": "peak"}


def canvas_corners(p, kind: str) -> list:
    """The corner each sail worked by rope family `kind` has at
    `CANVAS_CORNER_KINDS[kind]`, for every sail this ship sets whose kind
    has that family. Read from `sailplan.corners`, the sail's own geometry."""
    from . import sailplan
    from . import shiptype as st

    corner = CANVAS_CORNER_KINDS[kind]
    out = []
    for mast in p.rig.masts:
        for sail in sorted(mast.sails, key=lambda s: s.tier):
            if kind in st.rope_families(sail.kind):
                out.append(getattr(sailplan.corners(p, mast.name, sail),
                                   corner))
    for sail in sorted(p.rig.headsails, key=lambda s: s.tier):
        if kind in st.rope_families(sail.kind):
            out.append(getattr(sailplan.corners(p, None, sail), corner))
    return out


def off_corner(faces, corners, width: float) -> list:
    """Every face with NO vertex within `width` of any of `corners`, as
    (the face's vertex nearest a corner, that corner, the distance between
    them). Empty when every face touches a corner — and when there are no
    corners at all, nothing can be at one, so every face is returned."""
    import math

    strays = []
    for face in faces:
        best = None
        for v in face:
            for c in corners:
                d = math.dist(v, c)
                if best is None or d < best[2]:
                    best = (tuple(v), tuple(c), d)
        if best is None:
            best = (tuple(face[0]), None, math.inf)
        if best[2] > width:
            strays.append(best)
    return strays


def off_corner_text(kind: str, stray, width: float) -> str:
    """One stray contact, both endpoints named."""
    v, c, d = stray

    def pt(q):
        return "(" + ", ".join(f"{x:.4f}" for x in q) + ")"

    corner = CANVAS_CORNER_KINDS[kind]
    where = f"its {corner} {pt(c)}" if c is not None else f"no {corner}"
    return (f"{kind} touches canvas away from its {corner}: {d:.4f} m "
            f"between the touched face's nearest vertex {pt(v)} and "
            f"{where}, more than the {kind}'s ribbon width {width:.3f} m")


@dataclass(frozen=True)
class Verdict:
    """One ruling, naming BOTH objects and what was measured between them."""

    a: str
    b: str
    face_pairs: int
    ok: bool
    allowed_by: str          # "joint", "deviation", or "" for a defect
    why: str

    def __str__(self) -> str:
        head = f"{self.a} x {self.b}: {self.face_pairs} intersecting face pairs"
        if not self.allowed_by:
            return f"{head} — UNRULED, no entry in frigate.joints"
        return f"{head} — {self.allowed_by}: {self.why}"


def verdict(a: str, b: str, face_pairs: int) -> Verdict:
    """Rule on `face_pairs` overlaps measured between objects `a` and `b`."""
    key = pair(a, b)
    fa, fb = key
    if key in JOINTS:
        return Verdict(fa, fb, face_pairs, True, "joint", JOINTS[key])
    if key in DEVIATIONS:
        cap, why = DEVIATIONS[key]
        return Verdict(fa, fb, face_pairs, face_pairs <= cap, "deviation",
                       f"{why} (cap {cap} face pairs)")
    return Verdict(fa, fb, face_pairs, False, "", "no ruling recorded")


def validate_rules() -> None:
    """No pair may be both a joint and a deviation, and every reason must say why."""
    both = set(JOINTS) & set(DEVIATIONS)
    if both:
        raise ValueError(f"{sorted(both)} is listed as both a joint and a deviation")
    for key, why in JOINTS.items():
        if len(why) <= 20:
            raise ValueError(f"joint {key} has no reason worth the name")
    for key, (cap, why) in DEVIATIONS.items():
        if cap <= 0 or len(why) <= 20:
            raise ValueError(f"deviation {key} needs a positive cap and a reason")


# --- WHICH WAY the overlap must go -----------------------------------------
#
# `verdict` above answers "may these two share space at all". It cannot tell a
# shot scar CUT INTO the planking from one BULGING OUT of it: both are the same
# count of intersecting face pairs. That blind spot shipped a hexagonal boss
# standing 0.151 m proud of the hull topside, under a joint whose own sentence
# says "a shot scar is cut INTO the hull skin it scars".
#
# A direction entry names the MEMBER (whose vertices are measured), the HOST
# (whose surface they are measured against), and which way round the two must
# sit. `checks.check_directions` does the measuring; the policy is here, where
# plain pytest can read it.

INTO = "INTO"   # the member is let in: it may not stand proud of the host
ON = "ON"       # the member is seated: it must touch, and may not sink in deep


@dataclass(frozen=True)
class Direction:
    """One directional ruling, naming BOTH endpoints of the measurement.

    `tol` is a DEPTH in metres and its meaning follows `mode`:

    - `INTO` — no vertex of the member may stand more than `tol` OUTBOARD of
      the host surface. Burial is unbounded: being let in is the point.
    - `ON` — no vertex of the member may sink more than `tol` BELOW the host
      surface. Standing proud is unbounded: a barrel is mostly above its deck.

    Both modes require CONTACT: at least one member vertex at or inside the
    host surface. A member that merely crosses the host without touching it is
    neither let into it nor seated on it, whatever the face count says.

    `tol` may be a NUMBER or the NAME of a measurement on the ship. "a deck
    edge let in deeper than the timber it is let into has come out of the
    ship's side" is the rule; 0.180 was only the frigate's instance of it, and
    a galleon whose bulwark is 0.22 m thick needs the rule, not the number.
    `TOL_FROM_SHIP` is the register of names.

    `tier_inside` makes a ruling conditional on what KIND of deck tier the
    member is. The frigate's forecastle is let into the waist bulwark; a
    galleon's is a castle deck let into its own castle wall, and the two are
    different joints that happen to share a member name.
    """

    member: str
    host: str
    mode: str
    tol: float | str
    why: str
    tier_inside: bool | None = None
    # Which tier `tier_inside` is about, when it is not the member itself.
    tier_name: str | None = None
    # A named condition from `CONDITIONS` that must hold on this ship for the
    # ruling to have anything to say. `tier_inside` answers "what KIND of deck
    # is this"; `when` answers questions the deck tiers cannot, such as
    # whether a chainplate's foot reaches the hull at all.
    when: str | None = None

    @property
    def key(self) -> tuple:
        return pair(self.member, self.host)


# Tolerances that are a measurement on the ship rather than a constant.
TOL_FROM_SHIP = {
    "bulwark_thick": lambda p: p.bulwark_thick,
    # The sentence states the depth, so the depth is the tolerance, with 5 mm
    # of slack for sampling a subdivided surface. The DEPTH is the ship's own
    # -- 0.10 m of knee into the frigate's stem resolves to the identical
    # 0.105 m this used to be written as, and the galleon's 0.12 m knee gets
    # 0.125. Reading the figure off the sentence is not widening it.
    "knee_into_stem": lambda p: p.head_form.knee_into_stem + 0.005,
    "beakhead_into_side": lambda p: p.head_form.beakhead_into_side + 0.005,
    # The bite a FLAT plate necessarily takes out of a CURVED side. It is
    # computed, not chosen: `rails.build_channels` takes the plate's inner
    # edge at the plate's TOP at each station and the bulwark goes on
    # widening below that, so the bottom inner corner is inside the timber by
    # the bulwark's own tumble over the plate's own thickness. 0.0429 m on
    # the frigate, which measures 0.0405 and so is TIGHTER than the flat
    # 0.050 this replaces; 0.0853 m on the galleon, which measures 0.078 on
    # a side that tumbles half as hard again under a plate a quarter thicker.
    # NO SLACK IS ADDED: the subsurf shrink moves the rendered bulwark INBOARD
    # of its cage, which makes the burial smaller rather than larger, and both
    # ships measure inside the figure with room to spare.
    "channel_bite": lambda p: __import__(
        "frigate.profiles", fromlist=["channel_bite"]).channel_bite(p),
    "strap_thick": lambda p: p.rail_form.strap_thick + 0.005,
}


# Conditions a ruling may be made conditional on. Each is a measurement on
# the ship, not a ship-type flag: "does this ship's chainplate foot reach the
# hull" is answered by the arithmetic that places the foot, so a ship that
# changes its channel drop changes its own answer without anyone editing this.
def _rail_shot_away(p) -> bool:
    """Does the damage plan shoot any rail bay away? Only then do splinters
    stand on a bulwark cap. A ship whose raised decks are all castles has
    no open rail, `damage.rail_gaps` is empty, and nothing is footed there."""
    from . import damage

    return bool(damage.rail_gaps(p))


def _barrel_on_the_quarterdeck(p) -> bool:
    """Does the ship's own deck plan stow a barrel on Deck_Quarter? The
    frigate's stows four abaft her quarterdeck break; the galleon's stows
    all eight in her waist."""
    from . import profiles

    rise = p.tier("Deck_Quarter").rise
    return any(
        item["kind"] == "barrel"
        and profiles.deck_rise_at(
            p, profiles.t_of_y(p, item["origin"][1])) == rise
        for item in profiles.furniture_placements(p))


CONDITIONS = {
    "chainplate_foot_on_the_hull": lambda p: (
        p.bulwark_h - p.rail_form.channel_drop - p.rail_form.chainplate_drop
    ) < 0.0,
    "rail_shot_away": _rail_shot_away,
    "barrel_on_the_quarterdeck": _barrel_on_the_quarterdeck,
}


def resolve_tol(rule: Direction, p) -> float:
    """This rule's tolerance on THIS ship, in metres."""
    if isinstance(rule.tol, str):
        return TOL_FROM_SHIP[rule.tol](p)
    return rule.tol


def applies_to(rule: Direction, p) -> bool:
    """Whether this ruling has anything to say about this ship.

    Only the deck-tier condition lives here. Whether the PARTS exist is
    `check_directions`' business, because that is a fact about what was built
    and this is a fact about what the ship IS.

    The tier the condition is ABOUT is usually the member -- a Deck_Quarter
    rule asks about the quarterdeck. It is not always: the beakhead bulkhead
    is let into the waist bulwark or into the forecastle castle's wall
    according to what the FORECASTLE is, and the member is called Beakhead.
    `tier_name` says which tier to ask about when it is not the member.
    """
    if rule.when is not None and not CONDITIONS[rule.when](p):
        return False
    if rule.tier_inside is None:
        return True
    try:
        tier = p.tier(rule.tier_name or rule.member)
    except KeyError:
        return True
    return tier.stands_above_the_main_rail() is not rule.tier_inside


def _d(member: str, host: str, mode: str, tol, why: str,
       tier_inside: bool | None = None, tier_name: str | None = None,
       when: str | None = None) -> Direction:
    return Direction(family(member), family(host), mode, tol, why, tier_inside,
                     tier_name, when)


# Every joint whose prose already claims a direction and whose claim can be
# MEASURED as written. A joint is ruled here only when the member lies wholly
# on one side of the host surface, so that "outside the host" and "proud of the
# face the sentence names" are the same thing. The ones deliberately left out
# are listed in UNRULED_DIRECTIONS below, each with the reason.
DIRECTIONS = (
    _d("Damage", "Hull", INTO, 0.010,
       "'a shot scar is cut INTO the hull skin it scars'. A crater has no "
       "material outboard of the skin at all; the 10 mm is the slack in "
       "sampling a subdivided surface, not a design allowance. This is the "
       "rule that was missing: the scars stood 0.151 m PROUD and every other "
       "check was green"),
    _d("Damage", "Bulwarks", ON, 0.020,
       "'the splinters stand where the rail and bulwark were shot away'. "
       "Splinters standing proud of a shot-away rail is the correct reading "
       "of that sentence, so proud is unbounded here -- they reach 0.415 m, "
       "which is SPLINTER_LEN. What must hold is that they are FOOTED on the "
       "bulwark cap rather than driven down through it. It applies only to "
       "a ship that has a rail bay shot away: the galleon's raised decks "
       "are castles, she has no open rail, and no splinter stands anywhere",
       when="rail_shot_away"),
    _d("Rudder", "Hull", ON, 0.095,
       "'its leading edge is let 0.060 m into the transom and each of the "
       "three pintle straps 0.030 m further still'. The sentence states both "
       "depths, so the DEEPER of them is the tolerance: 0.060 + 0.030 = "
       "0.090, with 5 mm of sampling slack on a subdivided surface. ON and "
       "not INTO because the blade is mostly ABAFT the hull -- 1.84 m of it "
       "at the heel -- and standing proud of the sternpost is the whole of "
       "what a rudder does"),
    _d("Bulwarks", "Hull", ON, 0.010,
       "'the bulwark seats ON the hull sheer'. `bulwark_half_width` returns "
       "exactly the hull top-ring x at the sheer, so the two meet flush: "
       "anything more than a millimetre of burial means the bulwark has "
       "started sinking into the planking instead of standing on it"),
    _d("Rails", "Bulwarks", ON, 0.010,
       "'the rail stanchions stand ON the bulwark cap they are stepped into'. "
       "The stanchion feet are laid on the cap plane, so burial is float "
       "noise; the rail reaching 0.51 m proud is the stanchions and the rail "
       "above the cap, which is what a rail is"),
    _d("Chainplates", "Hull", ON, "strap_thick",
       "'a chainplate's foot is bolted to the hull planking'. The strap lies "
       "ON that planking with its own thickness standing proud of it, and "
       "`profiles.chainplate_segments` pins every foot corner to "
       "`hull_half_width` at that corner's own station and height, so the "
       "only burial there can be is the strap's own thickness plus the "
       "subsurf shrink of the skin it lies against. It applies only to a "
       "ship whose foot actually reaches the hull: the frigate's lands "
       "0.25 m ABOVE her sheer, on the bulwark, so her straps cross the hull "
       "object without touching it and there is no joint here to rule on",
       when="chainplate_foot_on_the_hull"),
    _d("Channels", "Castle_Quarter", ON, "channel_bite",
       "'a channel on a castle is bolted flat against the castle wall's "
       "outer face'. The wall is the topsides carried up, so the bite a "
       "flat plate takes out of it is `profiles.channel_bite`'s, which "
       "walks every channel whichever wall it hangs on"),
    _d("Channels", "Bulwarks", ON, "channel_bite",
       "'a channel is bolted flat against the bulwark's outer face'. Bolted "
       "flat means seated on that face with the fastenings let in, not a "
       "timber driven through the bulwark into the gun deck. The tolerance "
       "is the bite a FLAT plate necessarily takes out of a CURVED side, "
       "COMPUTED by `profiles.channel_bite` rather than chosen: the plate's "
       "inner edge is taken at its top and the bulwark widens below that"),
    _d("Cannon_", "Deck_Main", ON, 0.080,
       "'the carriage trucks stand ON the deck and bed slightly into it'. "
       "SLIGHTLY is the word under test. The deck camber runs 0.08-0.18 m "
       "across the battery and a carriage is placed from the camber at its "
       "own station, so the residual bed-in is the camber change over one "
       "carriage; 0.08 m is one whole camber at its shallowest station and "
       "nothing honest can need more"),
    _d("Cannon_", "Deck_Lower", ON, 0.080,
       "the Cannon_-on-Deck_Main reading, on the deck that serves the hull "
       "row: 'the carriage trucks stand ON the deck and bed slightly into "
       "it', and the same 0.08 m, one whole camber at its shallowest "
       "station. Deck_Lower takes the same parabola over its own half-width "
       "(`tier_camber_z`), so the residual bed-in is the same kind of "
       "figure"),
    _d("Barrel_", "Deck_Main", ON, 0.050,
       "'a barrel stands ON the deck it is stowed on'. A barrel that is 50 mm "
       "into the planking is no longer standing on it"),
    _d("Barrel_", "Deck_Quarter", ON, 0.050,
       "'a barrel stands ON the quarterdeck it is stowed on' -- same reading "
       "as the gun deck, same 50 mm. Only on a ship whose plan stows one "
       "there: the galleon's eight are all in her waist",
       when="barrel_on_the_quarterdeck"),
    _d("Deck_Furniture", "Deck_Main", ON, 0.050,
       "'every coaming, bitt and skid is stepped INTO the deck it stands on'. "
       "STANDS ON is the half that can be measured against a deck: the pieces "
       "are mostly above it, so proud is unbounded, and a step of 50 mm is "
       "the depth of a step rather than a piece sunk in the planking"),
    _d("Deck_Furniture", "Deck_Quarter", ON, 0.050,
       "'the wheel and its pedestal are stepped into the quarterdeck' -- same "
       "reading, same 50 mm step"),
    _d("Anchor_", "Hull", ON, 0.085,
       "'its fluke lies against the bow planking it is stowed on'. LIES "
       "AGAINST is a bearing surface, not a bite. The tolerance is HALF THE "
       "ANCHOR'S OWN THICKNESS: bedded that far into the planking it still "
       "shows, and a bow that flares 0.33 m across the anchor's 2.2 m by "
       "1.5 m footprint gives a rigid anchor nowhere flat to lie. It used to "
       "measure 0.226 m -- the fluke inside the planking and the whole after "
       "arm swallowed, which no intersection count could see because a part "
       "wholly inside its host crosses nothing"),
    _d("Lantern_", "Transom", ON, 0.010,
       "'the three taffrail lanterns are mounted ON the transom rail'. The "
       "lantern bases are laid on the rail plane, so any burial at all is "
       "float noise"),
    _d("Stern_Carving", "Transom", ON, 0.010,
       "'the carving is applied TO the transom face it is fastened to'. "
       "Applied to a face means laid on it: the carving stands 0.14 m proud, "
       "which is its own relief, and goes nowhere into the transom"),
    _d("Headrails", "Hull", ON, "knee_into_stem",
       "'the knee of the head is let INTO the stem it is bolted to by its "
       "own stated depth'. The sentence states the depth, so the depth is "
       "the tolerance, with 5 mm of sampling slack: 0.105 m on the frigate, "
       "0.125 m on the galleon, and it is the SENTENCE that rules rather "
       "than either number. The lower rail standing proud of the bow "
       "planking it is bolted flat against is the same sentence's other half "
       "and is why this is ON and not INTO"),
    _d("Beakhead", "Bulwarks", ON, "beakhead_into_side",
       "'the beakhead bulkhead is let into each bulwark's inboard face by "
       "its own stated depth'. Stated depth again, plus 5 mm. Let in 0.06 m "
       "of an 0.18 m bulwark is let in; 0.18 m would be straight through it. "
       "This is the ruling for a forecastle that tucks UNDER the waist rail, "
       "which the frigate's does",
       tier_inside=True, tier_name="Deck_Forecastle"),
    _d("Beakhead", "Castle_Forecastle", ON, "beakhead_into_side",
       "same sentence, same stated depth, against the timber that actually "
       "stands there on a castle ship: the forecastle castle's own wall. "
       "The galleon's bulkhead never reaches her waist bulwark at all -- it "
       "stands two decks above it -- and ruling it against one would have "
       "scored a joint that does not exist",
       tier_inside=False, tier_name="Deck_Forecastle"),
    _d("Deck_Main", "Bulwarks", ON, "bulwark_thick",
       "'the deck edge is let into the bulwark's inboard face'. Let IN, not "
       "THROUGH: a deck edge let in deeper than the timber it is let into has "
       "come out of the ship's side. That is 0.18 m on the frigate and 0.22 m "
       "on the galleon, and it is the TIMBER that rules, not the number"),
    _d("Deck_Forecastle", "Bulwarks", ON, "bulwark_thick",
       "'the forecastle platform is let into the bulwark's inboard face' -- "
       "same reading, same bulwark thickness. This is the ruling for a "
       "forecastle that sits INSIDE the waist bulwark, which the frigate's "
       "does; a galleon's forecastle is a castle deck and is ruled below",
       tier_inside=True),
    _d("Deck_Quarter", "Bulwarks", ON, "bulwark_thick",
       "'the quarterdeck platform is let into the bulwark's inboard face' -- "
       "same reading, same bulwark thickness, and again only for a "
       "quarterdeck that sits inside the waist bulwark",
       tier_inside=True),

    # --- the castles ------------------------------------------------------
    _d("Castle_Forecastle", "Bulwarks", ON, 0.010,
       "the forecastle castle's wall is STEPPED ON the waist rail cap. Its "
       "foot ring is built at that exact height, so the only burial allowed "
       "is the gap Catmull-Clark leaves between the hull cage and its own "
       "limit surface -- the same 0.010 m the bulwark itself is held to"),
    _d("Castle_Quarter", "Bulwarks", ON, 0.010,
       "the quarterdeck castle's wall is stepped ON the waist rail cap, the "
       "same seat on the same timber as the forecastle castle's"),
    _d("Castle_Poop", "Castle_Quarter", ON, 0.010,
       "the poop's wall is stepped ON the quarterdeck's rail cap, and its "
       "foot ring is built at exactly that height by "
       "`profiles.castle_foot_z`, so nothing may sink into it"),
    _d("Deck_Forecastle", "Castle_Forecastle", ON, "bulwark_thick",
       "'the forecastle deck edge is let INTO the castle wall's inboard "
       "face'. Same rule as the gun deck into the bulwark, same timber, and "
       "it applies to a forecastle that IS a castle deck",
       tier_inside=False),
    _d("Deck_Quarter", "Castle_Quarter", ON, "bulwark_thick",
       "'the quarterdeck edge is let INTO its own castle wall's inboard "
       "face' -- same reading, same timber",
       tier_inside=False),
    _d("Deck_Poop", "Castle_Poop", ON, "bulwark_thick",
       "'the poop deck edge is let INTO its own castle wall's inboard face' "
       "-- same reading, same timber",
       tier_inside=False),
)


# Joints whose prose names a direction that CANNOT be measured as written, and
# why. Recording them here is the point: a reader can see that they were
# audited and rejected on a reason, not merely missed.
UNRULED_DIRECTIONS = {
    pair("Hull", "Deck_Main"): (
        "the sentence used to say 'let INTO the hull planking' and the "
        "geometry says 0.162 m proud of it. The PROSE was wrong and has been "
        "rewritten: the deck is cut to the bulwark's inner face at the sheer "
        "on cage math, and the bulwark covers the result. The measurable "
        "claim moved to the Deck_Main-to-Bulwarks rule"),
    pair("Hull", "Figurehead"): (
        "the sentence states 0.055 m proud and 0.015 m into, but those are "
        "the TRAILBOARD's figures and the trailboards share one mesh with "
        "Minerva, who projects 0.50 m forward of the stem exactly as she "
        "should. The claim is true of a part this check cannot address by "
        "object name"),
    pair("Beakhead", "Deck_Forecastle"): (
        "'stepped DOWN INTO the forecastle platform it stands on'. The "
        "platform is a 0.07 m solidified plate, so a bulkhead stepped through "
        "it is OUTSIDE the plate both above and below; burial cannot "
        "distinguish stepped-in from passed-through"),
    pair("Deck_Furniture", "Gratings"): (
        "'a grating sits DOWN IN the hatch coaming that carries it'. Every "
        "one of the 456 contact vertices measures exactly 0.0000: the grating "
        "is built flush in the coaming's own aperture, so there is no signed "
        "distance to rule on"),
    pair("Deck_Furniture", "Wheel"): (
        "'the wheel turns BETWEEN its own two standards'. BETWEEN is neither "
        "into nor on, exactly as THROUGH is not: the rim enters the head of "
        "each standard and comes out the far side, so it is both inside and "
        "outside its host at once and a burial figure cannot rule on it. Same "
        "reading as the chainplate through its channel"),
    pair("Channels", "Chainplates"): (
        "'the chainplate is bolted THROUGH the channel it passes down from'. "
        "THROUGH is neither into nor on -- the member is meant to come out "
        "the far side"),
    pair("Masts", "Deck_Main"): (
        "'a mast is stepped THROUGH the gun deck down to the keelson', and "
        "the same for the forecastle and quarterdeck: THROUGH again"),
    pair("Beakhead", "Bowsprit"): (
        "'the bowsprit is housed THROUGH the beakhead bulkhead': THROUGH"),
    pair("Hull", "Stern_Gallery"): (
        "'the gallery is built out FROM the hull transom and keyed back into "
        "it'. Both directions at once, and the member is mostly outboard"),
    pair("Headrails", "Rails"): (
        "'SCARPHED into the forward end of the forecastle rail, lapping it by "
        "31 mm'. A scarph is a lap, so both timbers are proud of and into "
        "each other by design"),
}


def directions_for(a: str, b: str) -> tuple:
    """Every direction ruling that applies to the pair `a`, `b`."""
    key = pair(a, b)
    return tuple(d for d in DIRECTIONS if d.key == key)


@dataclass(frozen=True)
class DirectionVerdict:
    """One directional ruling, measured. Both endpoints are named, always."""

    rule: Direction
    contact: int        # member vertices at or inside the host surface
    deepest: float      # m, how far the deepest member vertex sank below it
    highest: float      # m, how far the proudest member vertex stood above it
    ok: bool
    complaint: str

    def __str__(self) -> str:
        head = (f"{self.rule.member} is {self.rule.mode} {self.rule.host} "
                f"(contact {self.contact} verts, "
                f"buried {self.deepest:.3f} m, proud {self.highest:.3f} m, "
                f"tol {self.rule.tol:.3f} m)")
        return head if self.ok else f"{head} — {self.complaint}"


def direction_verdict(rule: Direction, contact: int, deepest: float,
                      highest: float, tol: float | None = None) -> DirectionVerdict:
    """Rule on one measurement. `deepest` and `highest` are both >= 0.

    `tol` is the resolved tolerance for the ship being checked; it defaults to
    the rule's own when that is already a number.
    """
    if tol is None:
        if isinstance(rule.tol, str):
            raise ValueError(
                f"{rule.member} x {rule.host} takes its tolerance from the "
                f"ship ({rule.tol!r}); resolve it with `resolve_tol` first")
        tol = rule.tol
    rule = Direction(rule.member, rule.host, rule.mode, tol, rule.why,
                     rule.tier_inside)
    if contact < 1:
        return DirectionVerdict(
            rule, contact, deepest, highest, False,
            f"{rule.member} never reaches the {rule.host} surface: it crosses "
            f"the object without touching it, which is neither {INTO} nor {ON}")
    if rule.mode == INTO:
        ok = highest <= rule.tol
        return DirectionVerdict(
            rule, contact, deepest, highest, ok, "" if ok else
            f"{rule.member} stands {highest:.3f} m PROUD of the {rule.host} "
            f"surface, {highest - rule.tol:.3f} m over its {rule.tol:.3f} m "
            f"tolerance, and the ruling says it is let INTO it")
    if rule.mode == ON:
        ok = deepest <= rule.tol
        return DirectionVerdict(
            rule, contact, deepest, highest, ok, "" if ok else
            f"{rule.member} is BURIED {deepest:.3f} m in the {rule.host} "
            f"surface, {deepest - rule.tol:.3f} m over its {rule.tol:.3f} m "
            f"tolerance, and the ruling says it is seated ON it")
    raise ValueError(f"unknown direction mode {rule.mode!r}")


def validate_directions() -> None:
    """Every direction must name a ruled joint, a known mode and a real reason."""
    seen = set()
    for d in DIRECTIONS:
        if d.mode not in (INTO, ON):
            raise ValueError(f"{d.member} x {d.host}: unknown mode {d.mode!r}")
        if d.key not in JOINTS:
            raise ValueError(
                f"{d.member} x {d.host} has a direction but is not a ruled "
                "joint; a direction without a joint rules on nothing")
        if d.key in UNRULED_DIRECTIONS:
            raise ValueError(
                f"{d.member} x {d.host} is both ruled and listed as unruled")
        if isinstance(d.tol, str):
            if d.tol not in TOL_FROM_SHIP:
                raise ValueError(
                    f"{d.member} x {d.host}: tolerance {d.tol!r} is not a "
                    f"measurement this ship knows; TOL_FROM_SHIP has "
                    f"{sorted(TOL_FROM_SHIP)}")
        elif not 0.0 < d.tol <= 0.20:
            raise ValueError(
                f"{d.member} x {d.host}: tolerance {d.tol} is not a joint "
                "clearance. Nothing here is loose by 0.2 m")
        if len(d.why) <= 40:
            raise ValueError(f"{d.member} x {d.host} has no reason worth the name")
        if (d.member, d.host) in seen:
            raise ValueError(f"{d.member} x {d.host} is ruled twice")
        seen.add((d.member, d.host))
    for key, why in UNRULED_DIRECTIONS.items():
        if key not in JOINTS:
            raise ValueError(f"{key} is excused from a direction it never had")
        if len(why) <= 40:
            raise ValueError(f"{key} has no reason worth the name")
