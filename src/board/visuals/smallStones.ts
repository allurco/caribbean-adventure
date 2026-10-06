/**
 * Small scattered stones (issue #49). Pure, no Three.js.
 *
 * The map generator only emits rocks on some cells, so beaches and grassland
 * read as bare. This derives one small stone per SAND or GRASS cell that has
 * no rock of its own (and is not a port), placed from a per-cell hash of the
 * cell's coordinates and the map's terrain seed, so nothing is stored in G
 * and every client draws the same stones. Each stone is placed once from its
 * canonical cell; the world copies redraw the same instances.
 */
import { hexToWorld } from "../../game/hex";
import type { Biome, MapCell } from "../../game/types";
import type { GroundField } from "./groundPlacement";
import { placeRock } from "./rockPlacement";
import type { DecorationData } from "./useDecorationLayout";
import { lerpRange, seedOf, stream } from "./variationStream";

/** Stones per cell, by biome: ROCK cells already have outcrops and get none. */
export const STONES_PER_SAND_CELL = 1;
export const STONES_PER_GRASS_CELL = 1;
/** Farthest a stone sits from its cell centre (world units; a hex is 1 unit in radius). */
export const STONE_SPREAD = 0.55;
/**
 * Decoration scale of a stone (the rock mesh is ROCK_UNIT_RADIUS in radius at
 * 1, and stones take the small size class on top). Knee-to-waist-high rocks;
 * the earlier [0.3, 0.5] pebbles vanished into the beach at ship zoom.
 */
export const STONE_SCALE_RANGE: readonly [number, number] = [0.6, 1];

/** A stone sinks a little less than an outcrop. */
const STONE_SINK = 0.01;
const STONE_SALT = 0x5d7a3c91;
const TAU = Math.PI * 2;

const STONES_PER_CELL: Readonly<Record<Biome, number>> = {
  SAND: STONES_PER_SAND_CELL,
  GRASS: STONES_PER_GRASS_CELL,
  ROCK: 0,
};

const hasRock = (cell: MapCell): boolean => (cell.decorations ?? []).some((d) => d.type === "rock");

/** The stones for every eligible cell, on the ground; `seed` is the map's terrain seed. */
export function smallStones(cells: readonly MapCell[], field: GroundField, seed: number): DecorationData[] {
  const stones: DecorationData[] = [];
  for (const cell of cells) {
    if (cell.terrain !== "island" || cell.hasPort || !cell.biome || hasRock(cell)) continue;
    const count = STONES_PER_CELL[cell.biome];
    if (count === 0) continue;

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const anchor = { x: hexX, z: hexZ };
    // The seed goes in through the salt: seedOf quantises its values by 4096 (a
    // 12-bit shift into int32), which would drop a 32-bit seed's top 12 bits.
    const next = stream(seedOf([cell.hex.q, cell.hex.r], STONE_SALT ^ seed));

    for (let i = 0; i < count; i++) {
      const angle = next() * TAU;
      const distance = Math.sqrt(next()) * STONE_SPREAD;
      const rotation = next() * TAU;
      const scale = lerpRange(STONE_SCALE_RANGE, next());
      const spot = { x: hexX + Math.cos(angle) * distance, z: hexZ + Math.sin(angle) * distance };
      // Stands on the centre height, probed out to the stone's drawn radius (#53).
      const ground = placeRock(field, spot, anchor, { scale, rotation, biome: cell.biome, sink: STONE_SINK });
      if (!ground) continue;
      stones.push({
        type: "rock",
        worldX: ground.x,
        worldY: ground.y,
        worldZ: ground.z,
        rotation,
        scale,
        biome: cell.biome,
      });
    }
  }
  return stones;
}
