/**
 * Which way a ship's bow points: Ship's atan2(dx, dz) of its last move, so
 * the bow is along (sin h, cos h). Pure; `Ship.tsx` turns to it and the board
 * keeps each ship's last one, so a sinking ship goes down facing the way it
 * last sailed (#142).
 */
import { hexToWorld, type Hex } from "../game/hex";
import { seamAwareStart } from "./wrapView";

/** Moves shorter than this (world units) keep the heading the ship had. */
const MIN_MOVE = 0.001;

/**
 * The heading of a move from world (x, z) `from` to `to`, the short way round
 * a map `wrapWidth` wide (Infinity if it does not wrap); null if it does not move.
 */
export function moveHeading(
  from: readonly [number, number],
  to: readonly [number, number],
  wrapWidth: number
): number | null {
  const dx = to[0] - seamAwareStart(from[0], to[0], wrapWidth);
  const dz = to[1] - from[1];
  return Math.hypot(dx, dz) > MIN_MOVE ? Math.atan2(dx, dz) : null;
}

const worldXZ = (position: Hex): [number, number] => {
  const [x, , z] = hexToWorld(position);
  return [x, z];
};

/**
 * Each ship's last heading after the ships went from `before` to `after`: a
 * ship that moved takes the heading of its move; every other keeps the one
 * it had, gone ships included.
 */
export function trackShipHeadings(
  headings: Readonly<Record<string, number>>,
  before: Readonly<Record<string, { position: Hex }>>,
  after: Readonly<Record<string, { position: Hex }>>,
  wrapWidth: number
): Record<string, number> {
  const next = { ...headings };
  for (const [id, ship] of Object.entries(after)) {
    const was = before[id];
    if (!was) continue;
    const heading = moveHeading(worldXZ(was.position), worldXZ(ship.position), wrapWidth);
    if (heading !== null) next[id] = heading;
  }
  return next;
}
