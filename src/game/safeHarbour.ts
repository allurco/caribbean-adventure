/**
 * Ports are safe harbours (#388): a ship on a port's docking hex can't attack
 * or be attacked, and can't use the spyglass or be scouted. "At port" is the
 * same test that opens the port panel, `findAccessiblePort`.
 */
import type { Hex, MapWrap } from "./hex";
import type { MapCell } from "./mapGenerator";
import { findAccessiblePort } from "./moves";

/** The map a harbour check needs: `G` will do. */
export interface HarbourWorld {
  cells: MapCell[];
  wrap: MapWrap;
}

/** Is this position a port's docking hex? */
export function atPort(world: HarbourWorld, position: Hex): boolean {
  return findAccessiblePort(position, world.cells, world.wrap) !== undefined;
}

/** May no fight or spyglass pass between these two ships, because either one is at port? */
export function harbourKeepsApart(world: HarbourWorld, a: Hex, b: Hex): boolean {
  return atPort(world, a) || atPort(world, b);
}
