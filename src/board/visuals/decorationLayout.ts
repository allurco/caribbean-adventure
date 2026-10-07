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
import { lerpRange, seedOf, stream } from "./variationStream";
import { PROP_DENSITY, PROP_SCALE } from "./worldScale";

/** Rock radius at scale 1 (the rock mesh's unit radius). */
export const ROCK_RADIUS = ROCK_UNIT_RADIUS;

// Ground fit at scale 1 (the sink at `PROP_SCALE`; the footprint is scaled per tree). The footprint covers the trunk base plus its lean.
const TREE_PLACEMENT: GroundPlacementOptions = { footprintRadius: 0.06, sink: 0.03 * PROP_SCALE, maxSlope: 0.9 };

/**
 * The generator's trees and rocks are drawn at `PROP_SCALE`, so each on a
 * non-port cell gets `PROP_DENSITY - 1` companions spread over its cell (out
 * to this radius from the centre), and the land is as covered as it was with
 * props that much bigger. The companions are hashed from the cell, the
 * decoration's index and the terrain seed.
 */
export const COMPANION_SPREAD = 0.75;
/** A companion's scale, as a share of its decoration's. */
export const COMPANION_SCALE_RANGE: readonly [number, number] = [0.8, 1.2];
const COMPANION_SALT = 0x51c3a7e9;

interface PropSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

/** The decoration's own spot and scale, then its companions' (none on a port cell). */
function withCompanions(cell: MapCell, index: number, seed: number, own: PropSpot): PropSpot[] {
  const out = [own];
  if (PROP_DENSITY <= 1 || cell.hasPort) return out;
  const [hexX, , hexZ] = hexToWorld(cell.hex);
  const next = stream(seedOf([cell.hex.q, cell.hex.r, index], COMPANION_SALT ^ seed));
  for (let j = 1; j < PROP_DENSITY; j++) {
    const angle = next() * Math.PI * 2;
    const distance = Math.sqrt(next()) * COMPANION_SPREAD;
    out.push({
      x: hexX + Math.cos(angle) * distance,
      z: hexZ + Math.sin(angle) * distance,
      scale: own.scale * lerpRange(COMPANION_SCALE_RANGE, next()),
      rotation: next() * Math.PI * 2,
    });
  }
  return out;
}

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
  /** Derived small stones, `PROP_DENSITY` per sand or grass cell without a rock (#49). */
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

  const seed = terrainSeedFromCells(cells);
  for (const cell of cells) {
    if (!cell.decorations || cell.decorations.length === 0) continue;

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const anchor = { x: hexX, z: hexZ };

    cell.decorations.forEach((deco, index) => {
      const scale = (deco.scale ?? 1) * PROP_SCALE;
      const own: PropSpot = { x: hexX + deco.position[0], z: hexZ + deco.position[2], scale, rotation: deco.rotation };

      // Trees and rocks stand on the height field: nudged off water and
      // cliffs towards the cell centre, or dropped if nowhere fits.
      const standing = (ground: GroundSpot | null, p: PropSpot): DecorationData | null =>
        ground && {
          type: deco.type,
          worldX: ground.x,
          worldY: ground.y + deco.position[1] * PROP_SCALE,
          worldZ: ground.z,
          rotation: p.rotation,
          scale: p.scale,
          biome: cell.biome,
        };

      switch (deco.type) {
        case "tree": {
          for (const p of withCompanions(cell, index, seed, own)) {
            // A trunk rests on the lowest ground under its base so it never floats.
            const tree = standing(
              placeOnGround(field, p, anchor, { ...TREE_PLACEMENT, footprintRadius: TREE_PLACEMENT.footprintRadius * p.scale }),
              p
            );
            if (tree) trees.push(tree);
          }
          break;
        }
        case "rock": {
          for (const p of withCompanions(cell, index, seed, own)) {
            // Rocks stand on the centre height, probed out to their drawn radius (#53).
            const rock = standing(placeRock(field, p, anchor, { scale: p.scale, rotation: p.rotation, biome: cell.biome }), p);
            if (rock) rocks.push(rock);
          }
          break;
        }
        // The fort becomes a watchtower among the port buildings (`portBuildings`, below).
        case "pier": {
          // Piers sit at water level; the land end starts where the drawn beach meets the water.
          const origin = pierOrigin(drawn, own, deco.rotation);
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
    });
  }

  const stones = smallStones(cells, field, seed);
  const buildings = portBuildings(cells, drawn, seed);
  const quays = portQuays(cells, drawn, seed);
  // The port kit is placed first so the shrubs keep off it.
  const shrubs = placeShrubs(cells, field, seed, { trees, rocks, stones, piers, quays, buildings });
  const boulders = shoreBoulders(cells, field, wrap, seed);

  return { trees, rocks, stones, shoreBoulders: boulders, piers, shrubs, quays, buildings };
}

/** `decorationLayout`, once per map and wrap (`perMapCache`). */
export const decorationLayoutOf = perMapCache(decorationLayout);
