/**
 * The heading a ship lies at when it is first drawn, before it has sailed
 * (#212): toward the open sea, not along +z for every ship. Pure.
 *
 * Each of the six hex directions scores the water hexes that lie along it,
 * the nearest first (`LOOK_AHEAD` of them, stopping at the first that is not
 * water). The ship faces one of the best-scoring directions, picked from
 * its own seeded stream (ADR 0007: the same on every client for a seed,
 * different between ships and seeds), turned off the hex axis by a little
 * seeded jitter so a fleet does not lie in ranks.
 */
import { canonicalHex, hex, hexToWorld, neighbors, type Hex, type MapWrap } from "../game/hex";
import { SEED_FEATURES } from "./visuals/seedFeatures";
import { stream, subSeed } from "./visuals/subSeed";

/** The six hex directions, as (dq, dr). */
const DIRECTIONS: readonly (readonly [number, number])[] = neighbors(hex(0, 0)).map((h) => [h.q, h.r] as const);

/** Hexes looked along each direction for open water. */
export const LOOK_AHEAD = 3;
/** Largest seeded turn off the chosen hex direction, radians (about 15°). */
export const SPAWN_HEADING_JITTER = 0.26;

/**
 * The heading (Ship's atan2(dx, dz)) a ship `id` at `position` lies at
 * before it first sails, in the world `worldSeed`, where `isWater` says which
 * hexes (canonical) are open water.
 */
export function spawnHeading(
  worldSeed: number,
  id: string,
  position: Hex,
  isWater: (h: Hex) => boolean,
  wrap: MapWrap
): number {
  const scores = DIRECTIONS.map(([dq, dr]) => {
    let score = 0;
    for (let k = 1; k <= LOOK_AHEAD; k++) {
      if (!isWater(canonicalHex(hex(position.q + dq * k, position.r + dr * k), wrap))) break;
      score++;
    }
    return score;
  });
  const best = Math.max(...scores);
  const choices = DIRECTIONS.filter((_, i) => scores[i] === best);
  const next = stream(subSeed(worldSeed, SEED_FEATURES.shipSpawnHeading, id));
  const [dq, dr] = choices[Math.min(Math.floor(next() * choices.length), choices.length - 1)];
  const [x, , z] = hexToWorld(hex(dq, dr));
  return Math.atan2(x, z) + (next() * 2 - 1) * SPAWN_HEADING_JITTER;
}
