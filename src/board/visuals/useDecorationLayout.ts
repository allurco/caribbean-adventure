/** Where every decoration stands, worked out once per map and shared by every world copy (#36). */
import { useMemo } from "react";
import { perMapCache } from "./perMapCache";
import type { Biome, MapCell, Decoration } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { terrainSeedFromCells } from "./terrainHeightField";
import { placeOnGround, type GroundPlacementOptions, type GroundSpot } from "./groundPlacement";
import { usePalmTrees, type PalmTreesResources } from "./usePalmTrees";
import { ROCK_UNIT_RADIUS } from "./rockGeometry";
import { placeRock } from "./rockPlacement";
import { smallStones } from "./smallStones";
import { pierOrigin } from "./pierPlacement";
import { portBuildings, type PortBuilding } from "./portSettlement";
import { portQuays, type QuayPlacement } from "./quayPlacement";
import { landSurface } from "./landMesh";
import { placeShrubs } from "./shrubPlacement";
import { useShrubs, type ShrubsResources } from "./useShrubs";
import { useSwayClock } from "./useSwayClock";
import { shoreBoulders, type ShoreBoulder } from "./shoreBoulders";

/** Rock radius at scale 1 (the rock mesh's unit radius). */
export const ROCK_RADIUS = ROCK_UNIT_RADIUS;

// Ground fit at scale 1. The footprint covers the trunk base plus its lean.
const TREE_PLACEMENT: GroundPlacementOptions = { footprintRadius: 0.06, sink: 0.03, maxSlope: 0.9 };

export interface DecorationData {
  type: Decoration["type"];
  worldX: number;
  worldY: number;
  worldZ: number;
  rotation: number;
  scale: number;
  /** Biome of the decoration's cell (rocks size themselves by it). */
  biome?: Biome;
}

/** Where every decoration stands, worked out once per map and shared by every world copy. */
export interface DecorationLayout {
  trees: DecorationData[];
  /** The generator's rocks: outcrops sized by their cell's biome. */
  rocks: DecorationData[];
  /** Derived small stones, one per sand or grass cell without a rock (#49). */
  stones: DecorationData[];
  /** Derived boulders along the waterline, emergent and submerged (#49). */
  shoreBoulders: ShoreBoulder[];
  /** Piers, with the origin at the land end where the beach meets the water (#49). */
  piers: DecorationData[];
  /** Derived stone quays, one at each pier's root (#59). */
  quays: QuayPlacement[];
  /** Derived port buildings and watchtowers, from the port flag and the `pier`/`fort` decorations (#49). */
  buildings: PortBuilding[];
  palms: PalmTreesResources;
  /** Derived bushes and dry tufts on sand and grass cells (#49). */
  shrubs: ShrubsResources;
}

/** Where each decoration stands, worked out once per map and wrap (`perMapCache`). */
const decorationsOf = perMapCache((cells, wrap) => {
    const trees: DecorationData[] = [];
    const rocks: DecorationData[] = [];
    const piers: DecorationData[] = [];
    const field = sharedTerrainField(cells, wrap);

    for (const cell of cells) {
      if (!cell.decorations || cell.decorations.length === 0) continue;

      const [hexX, , hexZ] = hexToWorld(cell.hex);
      const anchor = { x: hexX, z: hexZ };

      for (const deco of cell.decorations) {
        const scale = deco.scale ?? 1;
        const spot = { x: hexX + deco.position[0], z: hexZ + deco.position[2] };

        // Trees and rocks stand on the height field: nudged off water and
        // cliffs towards the cell centre, or dropped if nowhere fits.
        const standing = (ground: GroundSpot | null): DecorationData | null =>
          ground && {
            type: deco.type,
            worldX: ground.x,
            worldY: ground.y + deco.position[1],
            worldZ: ground.z,
            rotation: deco.rotation,
            scale,
            biome: cell.biome,
          };

        switch (deco.type) {
          case "tree": {
            // A trunk rests on the lowest ground under its base so it never floats.
            const tree = standing(
              placeOnGround(field, spot, anchor, { ...TREE_PLACEMENT, footprintRadius: TREE_PLACEMENT.footprintRadius * scale })
            );
            if (tree) trees.push(tree);
            break;
          }
          case "rock": {
            // Rocks stand on the centre height, probed out to their drawn radius (#53).
            const rock = standing(placeRock(field, spot, anchor, { scale, rotation: deco.rotation, biome: cell.biome }));
            if (rock) rocks.push(rock);
            break;
          }
          // The fort becomes a watchtower among the port buildings (`portBuildings`, below).
          case "pier": {
            // Piers sit at water level; the land end starts where the beach meets the water.
            const origin = pierOrigin(field, spot, deco.rotation);
            piers.push({
              type: deco.type,
              worldX: origin.x,
              worldY: 0,
              worldZ: origin.z,
              rotation: deco.rotation,
              scale,
            });
            break;
          }
        }
      }
    }

    const seed = terrainSeedFromCells(cells);
    const stones = smallStones(cells, field, seed);
    const shrubs = placeShrubs(cells, field, seed, { trees, rocks, stones, piers });
    const boulders = shoreBoulders(cells, field, wrap, seed);
    // The settlement and its quays stand on the ground as the land mesh draws
    // it (the lattice surface, up to a few hundredths off the smooth field
    // between lattice points), so a wall is never cut into by the drawn sand.
    const drawn = landSurface(field);
    const buildings = portBuildings(cells, drawn, seed);
    const quays = portQuays(cells, drawn, seed);

    return { trees, rocks, stones, shoreBoulders: boulders, piers, shrubs, quays, buildings };
});

/** Places every decoration on the height field once per map (and wrap). */
export function useDecorationLayout(cells: MapCell[], wrap: MapWrap): DecorationLayout {
  // Collect all decorations with their world positions
  const decorationsByType = decorationsOf(cells, wrap);
  // One clock for everything that sways, so reduced motion stops palms and shrubs together.
  const sway = useSwayClock();
  const palms = usePalmTrees(decorationsByType.trees, sway);
  const shrubs = useShrubs(decorationsByType.shrubs, sway);
  return useMemo(() => ({ ...decorationsByType, palms, shrubs }), [decorationsByType, palms, shrubs]);
}
