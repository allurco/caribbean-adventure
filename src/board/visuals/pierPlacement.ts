/**
 * Where a port's pier meets the beach (issue #49). Pure, no Three.js.
 *
 * The generator puts the `pier` decoration at the port hex's centre, rotated
 * towards the docking hex. The old box was pushed a fixed 0.7 units that way,
 * which left it buried in the beach wherever the coast noise pulled the
 * shoreline out (the shore sits anywhere from ~0.6 to ~1.1 units from the
 * centre along that line). The deck now starts where the height field drops
 * to the shore, a little inland so the planks rest on sand, and runs out
 * over the water from there: on a wide, gentle beach a little longer than
 * its authored deck (`pierStretch`, #176), so its sea end stands in water,
 * never so far that it meets a ship docked in the hex it faces.
 */
import type { GroundField } from "./groundPlacement";
import { SEA_LEVEL } from "./terrainHeightField";
import { TOWN_PIECE_SCALE } from "./worldScale";
import { PIER_LENGTH } from "./pierGeometry";
import { SHIP_HULL_BOXES } from "../shipHull";

/** The shoreline is looked for between these distances from the hex centre. */
export const PIER_SHORE_MIN = 0.5;
export const PIER_SHORE_MAX = 0.85;
/** How far inland of the shoreline the deck starts (it follows the pier, `TOWN_PIECE_SCALE`). */
export const PIER_LAND_OVERLAP = 0.12 * TOWN_PIECE_SCALE;
/** Ground at or under this height counts as the shore. */
export const PIER_SHORE_HEIGHT = SEA_LEVEL + 0.02;
const SEARCH_STEP = 0.025;

/** Farthest from its hex centre a pier's sea end reaches: short of a Galleon docked in the hex it faces (√3 away, its hull half its length back). */
export const PIER_MAX_REACH = Math.sqrt(3) - SHIP_HULL_BOXES.Galleon[2] / 2;
/** How deep under the sea a pier's sea end stands, where its reach allows: out past the beach, over water (#176). */
export const PIER_END_DEPTH = 0.002;
/** The steps a pier is stretched in. */
const STRETCH_STEP = 0.05;

/**
 * How much longer than its authored deck (`PIER_LENGTH` at `scale`) a pier
 * from `origin`, its land end, is drawn (#176): 1 where that deck ends over
 * water `PIER_END_DEPTH` deep, else the least stretch, in steps, that does,
 * and never past `PIER_MAX_REACH` from the hex `centre`.
 */
export function pierStretch(field: GroundField, centre: { x: number; z: number }, origin: { x: number; z: number }, rotation: number, scale: number): number {
  const dir = { x: Math.sin(rotation), z: Math.cos(rotation) };
  const deck = PIER_LENGTH * scale;
  const most = Math.max(1, (PIER_MAX_REACH - Math.hypot(origin.x - centre.x, origin.z - centre.z)) / deck);
  for (let stretch = 1; stretch < most; stretch += STRETCH_STEP) {
    if (field.sampleHeight(origin.x + dir.x * deck * stretch, origin.z + dir.z * deck * stretch) < SEA_LEVEL - PIER_END_DEPTH) return stretch;
  }
  return most;
}

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
