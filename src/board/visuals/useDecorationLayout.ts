/** Where every decoration stands, worked out once per map and shared by every world copy (#36). */
import { useMemo } from "react";
import { perMapCache } from "./perMapCache";
import type { Biome, MapCell, Decoration } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { terrainSeedFromCells } from "./terrainHeightField";
import { placeOnGround, type GroundPlacementOptions } from "./groundPlacement";
import { usePalmTrees, type PalmTreesResources } from "./usePalmTrees";
import { ROCK_UNIT_RADIUS } from "./rockGeometry";
import { ROCK_SIZE_CLASS_SCALE, rockSizeClass } from "./rockVariation";
import { smallStones } from "./smallStones";
import { useSwayClock } from "./useSwayClock";

/** Rock radius at scale 1 (the rock mesh's unit radius). */
export const ROCK_RADIUS = ROCK_UNIT_RADIUS;

// Ground fit at scale 1. The footprint covers the trunk base plus its lean.
const TREE_PLACEMENT: GroundPlacementOptions = { footprintRadius: 0.06, sink: 0.03, maxSlope: 0.9 };
const ROCK_PLACEMENT: GroundPlacementOptions = { footprintRadius: ROCK_RADIUS, sink: 0.02, maxSlope: 1.6 };

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
  piers: DecorationData[];
  palms: PalmTreesResources;
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
        const onGround = (placement: GroundPlacementOptions, footprintScale: number): DecorationData | null => {
          const ground = placeOnGround(field, spot, anchor, {
            ...placement,
            footprintRadius: placement.footprintRadius * footprintScale,
          });
          if (!ground) return null;
          return {
            type: deco.type,
            worldX: ground.x,
            worldY: ground.y + deco.position[1],
            worldZ: ground.z,
            rotation: deco.rotation,
            scale,
            biome: cell.biome,
          };
        };

        switch (deco.type) {
          case "tree": {
            const tree = onGround(TREE_PLACEMENT, scale);
            if (tree) trees.push(tree);
            break;
          }
          case "rock": {
            // The footprint covers the rock at its biome's size class.
            const rock = onGround(ROCK_PLACEMENT, scale * ROCK_SIZE_CLASS_SCALE[rockSizeClass(cell.biome)]);
            if (rock) rocks.push(rock);
            break;
          }
          // Fort disabled - port marker (octagon) in HexGrid serves this purpose
          case "pier":
            // Piers sit at water level, so only their XZ matters
            piers.push({
              type: deco.type,
              worldX: spot.x,
              worldY: 0,
              worldZ: spot.z,
              rotation: deco.rotation,
              scale,
            });
            break;
        }
      }
    }

    const stones = smallStones(cells, field, terrainSeedFromCells(cells));

    return { trees, rocks, stones, piers };
});

/** Places every decoration on the height field once per map (and wrap). */
export function useDecorationLayout(cells: MapCell[], wrap: MapWrap): DecorationLayout {
  // Collect all decorations with their world positions
  const decorationsByType = decorationsOf(cells, wrap);
  // One clock for everything that sways, so reduced motion stops palms and shrubs together.
  const sway = useSwayClock();
  const palms = usePalmTrees(decorationsByType.trees, sway);
  return useMemo(() => ({ ...decorationsByType, palms }), [decorationsByType, palms]);
}
