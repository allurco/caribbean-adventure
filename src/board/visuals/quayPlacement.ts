/**
 * Where each port's stone quay stands (issue #59, port kit slice 3). Pure,
 * no Three.js. `Quays.tsx` draws them.
 *
 * The quay shares the pier's origin and direction (`pierPlacement.ts`): its
 * sea wall stands just seaward of the pier's land end, with the pier's root
 * inside it. The beach at a pier root is anything from the waterline to
 * 0.15 high and higher to either side of the pier line, so the quay is
 * lifted until its deck stands `QUAY_PROUD_OF_SAND` above the highest sand
 * along its sea face, from a lip above the pier deck up to `QUAY_MAX_STEP`
 * above it (past that the back is left buried rather than towering over
 * the pier). Its body reaches as deep as the pier posts, and should the
 * ground still fall away under a corner the whole quay is lowered onto it,
 * so it never floats. Width and depth vary a little per port from a hash
 * of the cell and the whole terrain seed, as the buildings do, and each
 * port is placed once from its canonical cell; the world copies redraw the
 * same instances, so the seam shows nothing.
 *
 * Interface for the settlement (slice 2): `quayTopAt` tells a building
 * standing at a world point whether it is on a placed quay and how high its
 * flat top is there, so it can sit on the deck rather than the sand;
 * `quayTopY` is the same for a cell, placing the quay first.
 */
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import type { GroundField } from "./groundPlacement";
import { PIER_DECK_TOP } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import {
  QUAY_BACK,
  QUAY_BASE,
  QUAY_COPING_PROUD,
  QUAY_COPING_THICKNESS,
  QUAY_SEA_FACE,
  QUAY_STEP_Z,
  QUAY_TOP,
  QUAY_WIDTH,
} from "./quayGeometry";
import { lerpRange, seedOf, stream } from "./variationStream";
import { PROP_SCALE } from "./worldScale";

/** The quay's plan scale; its heights are at `PROP_SCALE`. */
export interface QuaySize {
  /** Scale across the pier (the quay's width). */
  scaleX: number;
  /** Scale along the pier (the quay's depth). */
  scaleZ: number;
}

export interface QuayPlacement extends QuaySize {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Turn about the vertical axis (radians): the pier's rotation, local +z towards the water. */
  yaw: number;
  /** World Y of the flat deck (`worldY + QUAY_TOP`). */
  top: number;
}

/** The deck stands at least this far above the pier deck's landward end. */
export const QUAY_LIP = QUAY_TOP - PIER_DECK_TOP;
/** The deck stands at least this far above the highest sand along the sea face. */
export const QUAY_PROUD_OF_SAND = 0.04;
/** The deck never stands more than this above the pier deck; a higher beach buries the back instead. */
export const QUAY_MAX_STEP = 0.1;
/** Per-port width, as a scale on `QUAY_WIDTH` (2.1–2.75 piers). */
export const QUAY_WIDTH_RANGE: readonly [number, number] = [0.85, 1.1];
/** Per-port depth, as a scale on the quay's length along the pier. */
export const QUAY_DEPTH_RANGE: readonly [number, number] = [0.9, 1.1];

const QUAY_SALT = 0x6a1f3c95;

const pierOf = (cell: MapCell) => (cell.hasPort ? (cell.decorations ?? []).find((d) => d.type === "pier") : undefined);

/** Local (x, z) in the quay's unscaled frame to world, for an origin, yaw and size. */
function toWorld(origin: { x: number; z: number }, yaw: number, size: QuaySize, x: number, z: number): { x: number; z: number } {
  const lx = x * size.scaleX;
  const lz = z * size.scaleZ;
  return { x: origin.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: origin.z - lx * Math.sin(yaw) + lz * Math.cos(yaw) };
}

/** World (x, z) to the quay's unscaled local frame. */
function toLocal(q: QuayPlacement, point: { x: number; z: number }): { x: number; z: number } {
  const dx = point.x - q.worldX;
  const dz = point.z - q.worldZ;
  return { x: (dx * Math.cos(q.yaw) - dz * Math.sin(q.yaw)) / q.scaleX, z: (dx * Math.sin(q.yaw) + dz * Math.cos(q.yaw)) / q.scaleZ };
}

/**
 * The quay for a pier at `centre` (its hex centre) turned by `rotation`,
 * of the given size: at the pier's land end, lifted clear of the sand at
 * its sea face, lowered onto the lowest ground under its footprint.
 */
export function quayAt(field: GroundField, centre: { x: number; z: number }, rotation: number, size: QuaySize): QuayPlacement {
  const origin = pierOrigin(field, centre, rotation);
  const hw = QUAY_WIDTH / 2;
  const sample = (x: number, z: number) => {
    const p = toWorld(origin, rotation, size, x, z);
    return field.sampleHeight(p.x, p.z);
  };
  // The sand along the sea face, out to the coping's edge.
  let seaSand = -Infinity;
  for (const x of [-hw, 0, hw]) for (const z of [QUAY_SEA_FACE, QUAY_SEA_FACE + QUAY_COPING_PROUD]) seaSand = Math.max(seaSand, sample(x, z));
  // Heights are at `PROP_SCALE`, as the pier's are; the plan's scale is in `size`.
  const k = PROP_SCALE;
  const top = Math.min((PIER_DECK_TOP + QUAY_MAX_STEP) * k, Math.max((PIER_DECK_TOP + QUAY_LIP) * k, seaSand + QUAY_PROUD_OF_SAND * k));
  let worldY = top - QUAY_TOP * k;
  // The corners, edge midpoints and centre of the body's plan, the way `placeOnGround` probes a footprint.
  let lowest = Infinity;
  for (const x of [-hw, 0, hw]) for (const z of [QUAY_BACK, (QUAY_BACK + QUAY_SEA_FACE) / 2, QUAY_SEA_FACE]) lowest = Math.min(lowest, sample(x, z));
  if (worldY + QUAY_BASE * k > lowest) worldY = lowest - QUAY_BASE * k;
  return { worldX: origin.x, worldY, worldZ: origin.z, yaw: rotation, top: worldY + QUAY_TOP * k, ...size };
}

/** The quay of a port cell, or null if the cell has no port or no pier; `seed` is the map's terrain seed. */
export function placeQuay(cell: MapCell, field: GroundField, seed: number): QuayPlacement | null {
  const pier = pierOf(cell);
  if (!pier) return null;
  const [hexX, , hexZ] = hexToWorld(cell.hex);
  // The seed goes in through the salt, as the buildings' does (seedOf quantises its values by 4096).
  const next = stream(seedOf([cell.hex.q, cell.hex.r], QUAY_SALT ^ seed));
  const size: QuaySize = {
    scaleX: lerpRange(QUAY_WIDTH_RANGE, next()) * PROP_SCALE,
    scaleZ: lerpRange(QUAY_DEPTH_RANGE, next()) * PROP_SCALE,
  };
  return quayAt(field, { x: hexX, z: hexZ }, pier.rotation, size);
}

/** The quays of every port on the map. */
export function portQuays(cells: readonly MapCell[], field: GroundField, seed: number): QuayPlacement[] {
  const quays: QuayPlacement[] = [];
  for (const cell of cells) {
    const quay = placeQuay(cell, field, seed);
    if (quay) quays.push(quay);
  }
  return quays;
}

/**
 * The height of a placed quay's flat top under a world point, for anything
 * that stands on it (the settlement, slice 2): the deck over the front of
 * the body's plan (the wall line, inside the coping's overhang), the lower
 * rear step behind `QUAY_STEP_Z`, and undefined off the quay. A caller that
 * probes many points places the quay once and asks here.
 */
export function quayTopAt(quay: QuayPlacement, point: { x: number; z: number }): number | undefined {
  const local = toLocal(quay, point);
  if (Math.abs(local.x) > QUAY_WIDTH / 2 || local.z < QUAY_BACK || local.z > QUAY_SEA_FACE) return undefined;
  return local.z < QUAY_STEP_Z ? quay.top - QUAY_COPING_THICKNESS * PROP_SCALE : quay.top;
}

/**
 * `quayTopAt` for a port cell's quay, placing it first: undefined where the
 * cell has none. Same `field` and `seed` as `portQuays`.
 */
export function quayTopY(cell: MapCell, field: GroundField, seed: number, point: { x: number; z: number }): number | undefined {
  const quay = placeQuay(cell, field, seed);
  return quay ? quayTopAt(quay, point) : undefined;
}
