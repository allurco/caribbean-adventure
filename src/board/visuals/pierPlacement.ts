/**
 * Where a port's pier meets the beach (issue #49). Pure, no Three.js.
 *
 * The generator puts the `pier` decoration at the port hex's centre, rotated
 * towards the docking hex. The old box was pushed a fixed 0.7 units that way,
 * which left it buried in the beach wherever the coast noise pulled the
 * shoreline out (the shore sits anywhere from ~0.6 to ~1.1 units from the
 * centre along that line). The deck now starts where the height field drops
 * to the shore, a little inland so the planks rest on sand, and runs out
 * over the water from there.
 */
import type { GroundField } from "./groundPlacement";
import { SEA_LEVEL } from "./terrainHeightField";
import { PROP_SCALE } from "./propScale";

/** The shoreline is looked for between these distances from the hex centre. */
export const PIER_SHORE_MIN = 0.5;
export const PIER_SHORE_MAX = 0.85;
/** How far inland of the shoreline the deck starts. */
export const PIER_LAND_OVERLAP = 0.12 * PROP_SCALE;
/** Ground at or under this height counts as the shore. */
export const PIER_SHORE_HEIGHT = SEA_LEVEL + 0.02;
const SEARCH_STEP = 0.025;

/** The pier's land end: the hex centre moved along the pier's direction to just inland of the shore. */
export function pierOrigin(field: GroundField, centre: { x: number; z: number }, rotation: number): { x: number; z: number } {
  const dir = { x: Math.sin(rotation), z: Math.cos(rotation) };
  let shore = PIER_SHORE_MAX;
  for (let d = PIER_SHORE_MIN; d <= PIER_SHORE_MAX + 1e-9; d += SEARCH_STEP) {
    if (field.sampleHeight(centre.x + dir.x * d, centre.z + dir.z * d) <= PIER_SHORE_HEIGHT) {
      shore = d;
      break;
    }
  }
  const d = shore - PIER_LAND_OVERLAP;
  return { x: centre.x + dir.x * d, z: centre.z + dir.z * d };
}
