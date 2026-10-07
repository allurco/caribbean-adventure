---
status: accepted
---

# Picture scale: a hex is about 350 m, the water stays at 65 m per unit

The picture's scale was set by the galleon model: 0.8 world units for a ship about 50 m long, so one unit is about 65 m (`worldScale.ts`) and a hex reads as about 115 m across. At that scale a port of three houses fills its hex, and an island of 3 to 10 hexes reads as a village-sized sandbank, not an island with a town on it. The #84 experiment drew every authored prop and ship at `115 / N` of its size for a hex of N metres (115, 350, 600, 1000), leaving the terrain, the grid and the water alone, and compared them at map, mid, ship and town zoom. We decided that **a hex stands for about 350 m in the picture**: the props shrink, the land does not, and the water keeps its 65 m unit.

## Decision

- **Props are drawn at 115/350 ≈ 0.329 of their former size.** The terrain height field (ADR 0001), the hex grid and the camera keep their world units. Derived props (palms, shrubs, rocks, stones) are placed more densely to make up for their smaller size, up to the inverse square of the factor, capped.
- **Ships are drawn at twice true scale** (about 0.66 of their former size), so a ship still reads at ship zoom against the town and the island.
- **Buildings are drawn at 1.125 × true scale** on top of the prop factor, so houses do not read as sheds.
- **The water keeps 65 m per unit.** Wave spectra, dispersion, absorption and the seabed shelf stay as they are. Scaling them with the hex washes out the turquoise shallows; the water is a deliberate scale cheat.
- **A port is a village, not a packed town.** About 30 houses (cottages, stone houses, merchant's houses, lean-tos and warehouses) stand around a paved square and a main street with back lanes, on terraces the height field levels round the port square. The streets, terrace risers and square are carved into the field (ADR 0002: ground features are terrain), with dry-stone retaining walls and kerbs; small clutter (barrels, crates, carts, stalls, boats, net racks, gardens, palms) dresses it. The village, its walls and its clutter are merged into one draw.
- **Important ports get a fort.** A bastioned sixteenth-century fort at true size (about 100 m across) stands on its own levelled pad on the high ground above the town, in place of the watchtower; other ports keep the tower. Until ports have a rank (#85), "important" means a port with a shipyard.
- **Game distance stays abstract.** How far a move travels in the game's fiction is not tied to the picture's scale.

## Considered options

- **Keep 115 m.** Rejected: the props pin the scene to village scale; the houses look tiny on the screen without the island looking any bigger.
- **600 m or 1000 m.** Rejected: the ships and the landmarks are lost at ship and map zoom.
- **Scale the water with the hex** (`METRES_PER_UNIT` following the hex). Rejected: it kills the turquoise shallows.
- **A packed town of about 190 houses per port.** Rejected for its frame cost (about 75 to 53 fps in the experiment); the village keeps the cost to a few draw calls.
- **Houses at true scale without the enlargement.** Rejected: next to the tower and the fort they read as sheds.
- **Rock massifs in the height field (#83) at the old scale.** Not adopted: at the beach ring the generator produces, massifs barely changed the islands. The island profile is reconsidered at this scale on its own issue.

## Consequences

- `METRES_PER_UNIT` no longer converts prop sizes: the water and the props use different scales, and the prop, ship and building factors become named constants next to it in `worldScale.ts`, whose doc comment states both.
- The town's terraces, streets and fort pad are terms in the one height field, so the land mesh, the ocean, shadows and placement all see them; the land mesh is refined round each town so the carving shows.
- A port is still hard to read at mid and map zoom: the town is a cluster of red roofs and the fort a pale fleck. The map-zoom landmark (ADR 0002) remains open work.
- The town-zoom views used to judge the village are closer than the game's zoom floor allows; whether players can zoom that close is a separate decision.
