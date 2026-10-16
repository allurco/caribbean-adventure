/**
 * What the harbour backdrop behind the online shell shows (#122), and from
 * where, pure. The live scene and the captured still both come from here, so
 * they line up:
 *
 * - one fixed map (`HARBOUR_MAP`) and one fixed camera, the board's own
 *   (due north at its pitch, ADR 0002), looking at the harbour of the port
 *   nearest the map's middle;
 * - the still is captured at `STILL_WIDTH` × `STILL_HEIGHT`, wider than any
 *   desktop or phone held sideways, and shown with CSS `background-size:
 *   cover` centred. Up to the still's aspect the live camera keeps the
 *   board's vertical field of view and cover fits the still to the height;
 *   past it the camera keeps the still's horizontal field and cover fits the
 *   width. Either way the two agree pixel for pixel (harbourView.test.ts).
 *
 * Change the map, the camera or the still's size and the still must be
 * captured again (docs/harbour-still.md); harbourStillImage.test.ts holds the
 * captured still to this view.
 */
import type { MapRequest } from "../../game/mapRequest";
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { CAMERA_DIRECTION, CAMERA_FOV, cameraNearFor } from "../cameraBounds";

export type Vec3 = [number, number, number];

/** The map the harbour is built from: generated like any game's, from its size and seed. */
export const HARBOUR_MAP: MapRequest = { mapSize: "small", mapSeed: 20260 };

/** Camera to target, world units: a ship zoom, the town and its anchorage filling the view. */
export const HARBOUR_CAMERA_DISTANCE = 6.5;

/** From the port to the camera's target, world x and z: the port sits up and to the left of the middle, clear of the shell's sheet. */
export const HARBOUR_TARGET_OFFSET: readonly [number, number] = [1.2, 0.6];

/** The captured still's size, px: 2.4 : 1, wider than a 21:9 monitor or a phone held sideways. */
export const STILL_WIDTH = 2400;
export const STILL_HEIGHT = 1000;
const STILL_ASPECT = STILL_WIDTH / STILL_HEIGHT;

export interface HarbourCamera {
  position: Vec3;
  target: Vec3;
  near: number;
}

/** The camera's target: the harbour of the port nearest the middle of the map, on the sea plane. */
export function harbourTarget(cells: readonly MapCell[]): Vec3 {
  const points = cells.map((cell) => hexToWorld(cell.hex));
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[2]);
  const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const ports = cells.filter((cell) => cell.hasPort).map((cell) => hexToWorld(cell.hex));
  const distance = (p: readonly number[]) => Math.hypot(p[0] - middle[0], p[2] - middle[1]);
  const port = ports.reduce((best, p) => (distance(p) < distance(best) ? p : best), ports[0] ?? [middle[0], 0, middle[1]]);
  return [port[0] + HARBOUR_TARGET_OFFSET[0], 0, port[2] + HARBOUR_TARGET_OFFSET[1]];
}

/** The fixed camera on `target`: the board's direction and pitch, `HARBOUR_CAMERA_DISTANCE` away. */
export function harbourCamera(target: Vec3): HarbourCamera {
  const d = HARBOUR_CAMERA_DISTANCE;
  return {
    position: [target[0] + CAMERA_DIRECTION[0] * d, target[1] + CAMERA_DIRECTION[1] * d, target[2] + CAMERA_DIRECTION[2] * d],
    target,
    near: cameraNearFor(d),
  };
}

/** Everything a captured still depends on but the look: recorded with the still (harbourStillImage.ts) when it is captured. */
export interface HarbourViewRecord {
  map: MapRequest;
  distance: number;
  targetOffset: readonly [number, number];
  fov: number;
  width: number;
  height: number;
}

export function harbourViewRecord(): HarbourViewRecord {
  return {
    map: HARBOUR_MAP,
    distance: HARBOUR_CAMERA_DISTANCE,
    targetOffset: HARBOUR_TARGET_OFFSET,
    fov: CAMERA_FOV,
    width: STILL_WIDTH,
    height: STILL_HEIGHT,
  };
}

/** The vertical field of view, degrees, at a viewport `aspect` (width / height). */
export function harbourFov(aspect: number): number {
  if (aspect <= STILL_ASPECT) return CAMERA_FOV;
  const halfTan = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180) * (STILL_ASPECT / aspect);
  return (2 * Math.atan(halfTan) * 180) / Math.PI;
}
