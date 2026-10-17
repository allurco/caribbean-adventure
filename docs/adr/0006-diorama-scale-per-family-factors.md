---
status: accepted
---

# Diorama scale: per-family picture factors

ADR 0003 made a hex stand for about 350 m and drew every prop, ship and building at a factor derived from that distance. At the opening ship view the result reads as a grey rock with a small ship and a cluster of tiny roofs. The target picture the maintainer chose for #158 reads as a **diorama**: a hero ship and a port town big enough to be the subject. No single metres-per-hex gets there: a distance that makes the ships read shrinks the town, and the reverse. We decided that **the hex is a board space, not a distance**, and that each family of things on it carries its own picture factor, the one that makes it read.

## Decision

- **The hex is a board space.** Nothing in the picture is derived from a metres-per-hex any more. Each family has a named factor in `src/board/visuals/worldScale.ts`, and every module draws, places and measures that family through it, never through a literal.
- **The families and their factors**, from the #158 prototype's measurements on small seed 1 (the mockup is not geometrically consistent, so each number carries about ±20 %):
  - **Ships: ×2.3 on ADR 0003's twice true scale** (`SHIP_SCALE` ≈ 1.511, `SHIP_ENLARGEMENT` = 2.3). The Frigate's 38 m hull is then 0.88 units, **0.44 of a hex vertex to vertex**, about half a hex at the opening view. ×2.5 still reads well if a later review wants more; about ×2.75 is where the Frigate's bowsprit reaches the hex inradius.
  - **Buildings: ×2.5** on ADR 0003's 1.125 × true scale (`BUILDING_SCALE` ≈ 0.924, `BUILDING_ENLARGEMENT` = 2.5, #176): a house is about 0.08 of a hex across, and a port stands 20 to 30 buildings, about 24 of them the village's (`VILLAGE_HOUSES`) and the rest the port kit.
  - **Landmarks** (the watchtower, the church; the fort when #88 lands): ×1.6, on `LANDMARK_SCALE` (≈ 0.591, `LANDMARK_ENLARGEMENT`). At ×1.6 against the houses' ×2.5 ADR 0003's tower stood under the town's roofs, so its model gained a limewashed shaft over its stone base: the tower stands 1.1 to 1.5 times the town's tallest roof (`TOWER_OVER_TOWN`), the church among the roofs. The band is pinned from the measures and is to be confirmed on screen.
  - **Vegetation** (palms, shrubs, town palms): ×1.25, on `VEGETATION_SCALE`, with density per biome. The town's palms are on it from the village slice; the factor itself flips with the island-look slice.
  - **Town pieces** (piers, quays, the town's clutter): on `TOWN_PIECE_SCALE`, the buildings' factor. The pier's authored deck is shortened to 0.5 so at that factor it stops short of a Galleon docked in the hex it faces, and it is stretched a little where a wide beach would leave its end on sand (`pierStretch`). The harbour's furniture (#181: the further piers, the dock cranes and the quay's flag) is on it too; the market hall is a building, on `BUILDING_SCALE`.
  - **Rocks and stones: unchanged**, on `PROP_SCALE` (115 / 350), the base the other families start from.
  - Each slice of #158 flips its own family; `LANDMARK_SCALE`, `VEGETATION_SCALE` and `TOWN_PIECE_SCALE` existed from the ship slice on at their old values, so a flip is a one-line change with its own tests. The village slice (#176) flipped the buildings, the landmarks and the town pieces.
- **The water keeps 65 m per unit.** Wave spectra, dispersion, absorption and the seabed shelf are physical; ADR 0003's reasoning stands. Anything set in water metres stays there whatever the family factors do: the hull foam's lace is sized in water metres (`HULL_FOAM_NOISE_METRES`), no longer through `SHIP_SCALE`.
- **A hull fits its hex.** Every class's hull box at `SHIP_SCALE`, at every heading, stays inside the hex inradius (√3/2) less `HULL_FIT_MARGIN` (0.25 units), the room left for the bowsprit, the hull foam and a neighbour. At ×2.3 the footprint radii are Sloop 0.22, Flute 0.36, Frigate 0.46 and the 42 m Galleon 0.51 units, against a limit of 0.62. With the bowsprit the Galleon reaches 0.83 units forward of its centre, just inside the inradius; a longer hull or a bigger factor must be weighed against that.
- **Ships keep off one another.** No two ships are drawn on one hex centre at setup (a 200-seed sweep per map size drafts six players through the real move). Ships keep off land at every heading on water cells next to land: the coast pulls back at docking hexes (its own slice).
- **What follows the ships' size:** the hover box reaches from the hull to the masthead (`mastheadMetres` in the ship catalogue, checked against each model file), and the ship tooltip stands just above the masthead. The ship view comes in to 3.4 units (about 2.2 hexes framed top to bottom) and looks 0.6 units east of the ship, so the ship sits left of the port panel; the zoom floor rises to 1.0 so the camera stays clear of the taller rigs.
- **The town grows with its buildings.** The town plateau (terraces, streets, the square) scales with `BUILDING_SCALE`, and a village may spill onto neighbouring land cells of its own island (#170). ADR 0003's one-hex, ~30-house village gives way to that. At ×2.5 the plateau's axis may turn up to 120° towards a spill cell along the coast, its far-shore check looks along the axis and a quarter of its half width, and it lifts low ground only as a bank (`BANK_LIFT`), never a cliff; the land mesh refines the town 4 times per lattice edge, not 10, so the streets and risers span as many cuts as before and the refined ground keeps about its triangle count. The port's hover reaches the tallest building any port stands (`PORT_MAX_BUILDING_HEIGHT`, derived from the models and their family factors), and the port label clears the village's houses as well as the kit.
- **Game distance stays abstract.** As in ADR 0003, how far a move travels in the game's fiction is not tied to any of these factors.

## Considered options

- **Keep one metres-per-hex and move it** (ADR 0003's approach at another N). Rejected: every N trades the ships against the town; the #84 sweep (115, 350, 600, 1000 m) found none where both read.
- **Ships ×2.5 or ×2.75.** Not adopted for now: ×2.3 reads as the subject at the opening view and leaves the Galleon's bowsprit inside the inradius; ×2.75 is about the limit.
- **Scale the hull foam with the ship.** Rejected: the lace would coarsen against waves that keep their size, and read as a different water.

## Consequences

- ADR 0003's lines on ships at twice true scale, buildings at 1.125 × true scale and the ~30-house one-hex village are superseded; its water and game-distance decisions stand.
- Longer hulls average more of the swell, so the bigger ships heave and pitch less on the same sea (recorded in ADR 0004, pinned by the wave pose tests).
- Bigger ships crowd small maps at map zoom, and the grid reads less as a board when a ship covers half a hex; the frame budget is reported in every slice's PR through the dev `stats=1` overlay.
- #130's ship models are sized by this ADR's ship factor.
