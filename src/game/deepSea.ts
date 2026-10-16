/**
 * The open ocean wears coasters down (#340). Deep sea is any water hex at
 * least `DEEP_SEA_DISTANCE` hexes from the nearest island or reef, measured
 * round the east–west seam on a wrapping map. It is derived from the cells,
 * never stored in G.
 *
 * Regions are parted by channels of open water (`REGION_CHANNEL`); in a
 * channel three hexes wide the middle is only two from land, so deep sea
 * appears only where open water runs five or more hexes across.
 */
import { applyDamage } from "./combat";
import { wrappedDistance, wrappedEquals, type Hex, type MapWrap } from "./hex";
import type { CaribbeanState, MapCell, ShipState } from "./types";

/** How far from the nearest island or reef a water hex must lie to be deep sea. */
export const DEEP_SEA_DISTANCE = 3;

/** Whether the cell at `coord` is deep sea: open water at least `DEEP_SEA_DISTANCE` from any island or reef. */
export function isDeepSea(cells: readonly MapCell[], coord: Hex, wrap: MapWrap): boolean {
  const cell = cells.find((c) => wrappedEquals(c.hex, coord, wrap));
  if (!cell || cell.terrain !== "water") return false;
  return !cells.some((c) => c.terrain !== "water" && wrappedDistance(c.hex, coord, wrap) < DEEP_SEA_DISTANCE);
}

/** What the sea needs to know of the game: the map, its wrap, and whether a fight is on. */
export type SeaState = Pick<CaribbeanState, "cells" | "wrap" | "combat">;

/**
 * Whether `ship` would lose a hull point to the sea if its turn ended where
 * it is: a shallow-draft coaster (Sloop, Flute) on deep sea, with a hull
 * point to spare (the sea never takes the last), and no fight on.
 */
export function seaWillWear(state: SeaState, ship: Pick<ShipState, "position" | "stats">): boolean {
  if (state.combat) return false;
  if (!ship.stats?.shallowDraft || ship.stats.hull.current < 2) return false;
  return isDeepSea(state.cells, ship.position, state.wrap);
}

/**
 * The sea's toll as `player`'s turn `turn` ends: one hull point off their
 * ship when `seaWillWear` says so, through the usual damage (repaired at
 * port at the usual cost), recorded in `G.seaWear`. NPCs are never worn.
 * Answers whether it wore the ship.
 */
export function applySeaWear(G: CaribbeanState, player: string, turn: number): boolean {
  const ship = G.ships[player];
  if (!ship || !seaWillWear(G, ship)) return false;
  applyDamage(ship, { hull: 1, crew: 0, masts: 0 });
  G.seaWear = { player, turn };
  return true;
}
