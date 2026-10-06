/**
 * Where every decoration stands, worked out once per map and shared by
 * every world copy (#36). Pure: the hook in `useDecorationLayout.ts` adds
 * the palm and shrub GPU resources on top of this.
 */
import type { Biome, MapCell, Decoration } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { perMapCache } from "./perMapCache";
import { sharedTerrainField } from "./sharedTerrainField";
import { terrainSeedFromCells } from "./terrainHeightField";
import { placeOnGround, type GroundPlacementOptions, type GroundSpot } from "./groundPlacement";
import { ROCK_UNIT_RADIUS } from "./rockGeometry";
import { placeRock } from "./rockPlacement";
import { smallStones } from "./smallStones";
import { pierOrigin } from "./pierPlacement";
import { portBuildings, type PortBuilding } from "./portSettlement";
import { portQuays, type QuayPlacement } from "./quayPlacement";
import { landSurface } from "./landMesh";
import { placeShrubs } from "./shrubPlacement";
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
export interface DecorationPlacements {
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
  /** Derived bushes and dry tufts on sand and grass cells (#49). */
  shrubs: ReturnType<typeof placeShrubs>;
}

/** Where each decoration stands on a map (and wrap). */
export function decorationLayout(cells: readonly MapCell[], wrap: MapWrap): DecorationPlacements {
  const trees: DecorationData[] = [];
  const rocks: DecorationData[] = [];
  const piers: DecorationData[] = [];
  const field = sharedTerrainField(cells, wrap);
  // The port kit stands on the ground as the land mesh draws it (the lattice
  // surface, up to a few hundredths off the smooth field between lattice
  // points), so a wall is never cut into by the drawn sand, and the pier, its
  // quay and the settlement's reserve round the pier root all find the shore
  // on the same surface (#59).
  const drawn = landSurface(field);

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
          // Piers sit at water level; the land end starts where the drawn beach meets the water.
          const origin = pierOrigin(drawn, spot, deco.rotation);
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
  const buildings = portBuildings(cells, drawn, seed);
  const quays = portQuays(cells, drawn, seed);

  return { trees, rocks, stones, shoreBoulders: boulders, piers, shrubs, quays, buildings };
}

/** `decorationLayout`, once per map and wrap (`perMapCache`). */
export const decorationLayoutOf = perMapCache(decorationLayout);
