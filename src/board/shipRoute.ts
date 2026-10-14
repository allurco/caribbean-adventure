/**
 * The sea route a ship's animation follows when it moves more than one hex
 * at once (#212): an NPC's turn can carry it several hexes, and `G` keeps
 * only where it ended. The route is the hex path between the two hexes over
 * open water (npcManager's `findPath`, ignoring the other ships), so the
 * ship sails round the land rather than over it. Pure; `Ship.tsx` passes the
 * hex centres to `setCourse` (shipMotion.ts).
 */
import { hexToWorld, worldToHex, wrappedDistance, type MapWrap } from "../game/hex";
import { findPath } from "../game/npcManager";
import type { MapCell } from "../game/types";
import type { Point } from "./shipMotion";

/** Moves longer than this many hexes are not routed (a ship placed anew): they sail straight. */
export const MAX_ROUTED_HEXES = 12;

const NO_SHIPS = {};

/**
 * The waypoints (world xz) from world `from` to world `to`: the centre of
 * each hex after the first on a water route between their hexes, ending
 * exactly on `to`. Just `[to]` for a move of one hex, a route not found, or
 * one too long to route.
 */
export function seaRoute(from: Point, to: Point, cells: readonly MapCell[], wrap: MapWrap): Point[] {
  const start = worldToHex(from[0], from[1]);
  const end = worldToHex(to[0], to[1]);
  const hexes = wrappedDistance(start, end, wrap);
  if (hexes <= 1 || hexes > MAX_ROUTED_HEXES) return [to];
  const path = findPath(start, end, cells as MapCell[], NO_SHIPS, NO_SHIPS, wrap);
  if (path.length < 2) return [to];
  const between = path.slice(1, -1).map((h): Point => {
    const [x, , z] = hexToWorld(h);
    return [x, z];
  });
  return [...between, to];
}
