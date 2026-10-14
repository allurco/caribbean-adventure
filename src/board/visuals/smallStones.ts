/**
 * Small scattered stones (issue #49). Pure, no Three.js.
 *
 * The map generator only emits rocks on some cells, so beaches and grassland
 * read as bare. This derives one small stone per SAND or GRASS cell that has
 * no rock of its own (and is not a port), placed from the cell's own sub-seed of
 * the world seed (`G.mapSeed`, ADR 0007), so nothing is stored in G
 * and every client draws the same stones. Each stone is placed once from its
 * canonical cell; the world copies redraw the same instances.
 */
import { hexToWorld } from "../../game/hex";
import type { Biome, MapCell } from "../../game/types";
import type { GroundField } from "./groundPlacement";
import { placeRock } from "./rockPlacement";
import type { DecorationData } from "./useDecorationLayout";
import { mapCellId } from "./islands";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";
import { lerpRange } from "./variationStream";
import { PROP_DENSITY, PROP_SCALE } from "./worldScale";

/** Stones per cell, by biome (`PROP_DENSITY` times the authored one): ROCK cells already have outcrops and get none. */
export const STONES_PER_SAND_CELL = 1 * PROP_DENSITY;
export const STONES_PER_GRASS_CELL = 1 * PROP_DENSITY;
/** Farthest a stone sits from its cell centre (world units; a hex is 1 unit in radius). */
export const STONE_SPREAD = 0.55;
/**
 * Decoration scale of a stone (the rock mesh is ROCK_UNIT_RADIUS in radius at
 * 1, and stones take the small size class on top). Knee-to-waist-high rocks;
 * the earlier [0.3, 0.5] pebbles vanished into the beach at ship zoom. At
 * `PROP_SCALE`.
 */
export const STONE_SCALE_RANGE: readonly [number, number] = [0.6 * PROP_SCALE, 1 * PROP_SCALE];

/** A stone sinks a little less than an outcrop. */
const STONE_SINK = 0.01 * PROP_SCALE;
const TAU = Math.PI * 2;

const STONES_PER_CELL: Readonly<Record<Biome, number>> = {
  SAND: STONES_PER_SAND_CELL,
  GRASS: STONES_PER_GRASS_CELL,
  ROCK: 0,
};

const hasRock = (cell: MapCell): boolean => (cell.decorations ?? []).some((d) => d.type === "rock");

/** The stones for every eligible cell, on the ground; `worldSeed` is `G.mapSeed`. */
export function smallStones(cells: readonly MapCell[], field: GroundField, worldSeed: number): DecorationData[] {
  const stones: DecorationData[] = [];
  for (const cell of cells) {
    if (cell.terrain !== "island" || cell.hasPort || !cell.biome || hasRock(cell)) continue;
    const count = STONES_PER_CELL[cell.biome];
    if (count === 0) continue;

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const anchor = { x: hexX, z: hexZ };
    const id = mapCellId(cell);
    const next = stream(subSeed(worldSeed, SEED_FEATURES.smallStones, id));

    for (let i = 0; i < count; i++) {
      const look = subSeed(worldSeed, SEED_FEATURES.stoneLook, id, i);
      const angle = next() * TAU;
      const distance = Math.sqrt(next()) * STONE_SPREAD;
      const rotation = next() * TAU;
      const scale = lerpRange(STONE_SCALE_RANGE, next());
      const spot = { x: hexX + Math.cos(angle) * distance, z: hexZ + Math.sin(angle) * distance };
      // Stands on the centre height, probed out to the stone's drawn radius (#53):
      // the small class Rocks.tsx draws it at, not the biome's.
      const ground = placeRock(field, spot, anchor, {
        scale,
        rotation,
        biome: cell.biome,
        sink: STONE_SINK,
        sizeClass: "small",
        seed: look,
      });
      if (!ground) continue;
      stones.push({
        type: "rock",
        worldX: ground.x,
        worldY: ground.y,
        worldZ: ground.z,
        rotation,
        scale,
        biome: cell.biome,
        seed: look,
      });
    }
  }
  return stones;
}
