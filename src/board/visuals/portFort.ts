/**
 * Which ports get a fort (#84 prototype). The game has no notion of an
 * important city, so the shipyard stands in for one: the generator rolls a
 * shipyard per port, and the pirate haven always has one. One rule, in one
 * place, so it can change without touching the placement or the model.
 */
import type { MapCell } from "../../game/types";

/**
 * The fort's size at scale 1 (65 m a unit; the building scale multiplies
 * it): the bastion tips reach `FORT_REACH` from the centre (about 85 m tip
 * to tip), the curtain walls stand `FORT_WALL_HEIGHT` (9 m) and the flag's
 * staff tops out at `FORT_TOP`.
 */
export const FORT_REACH = 0.65;
export const FORT_WALL_HEIGHT = 0.14;
export const FORT_TOP = 0.5;
/** The keep's parapet top: the highest solid part, which the view line is checked against. */
export const FORT_KEEP_TOP = 0.27;

/** Whether a port cell is important enough for a fort: today, whether it has a shipyard. */
export function portHasFort(cell: Pick<MapCell, "hasPort" | "hasShipyard">): boolean {
  return cell.hasPort === true && cell.hasShipyard === true;
}
