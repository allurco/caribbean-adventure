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
import { hexKey, wrappedDistance, wrappedEquals, wrappedNeighbors, type Hex, type MapWrap } from "./hex";
import type { CaribbeanState, MapCell, ShipState } from "./types";

/** How far from the nearest island or reef a water hex must lie to be deep sea. */
export const DEEP_SEA_DISTANCE = 3;

/** Whether the cell at `coord` is deep sea: open water at least `DEEP_SEA_DISTANCE` from any island or reef. */
export function isDeepSea(cells: readonly MapCell[], coord: Hex, wrap: MapWrap): boolean {
  const cell = cells.find((c) => wrappedEquals(c.hex, coord, wrap));
  if (!cell || cell.terrain !== "water") return false;
  return !cells.some((c) => c.terrain !== "water" && wrappedDistance(c.hex, coord, wrap) < DEEP_SEA_DISTANCE);
}

/**
 * Every deep sea hex of the map, for the board's warnings: the same hexes as
 * `isDeepSea`, found in one pass outwards from every island and reef.
 */
export function deepSeaHexes(cells: readonly MapCell[], wrap: MapWrap): Hex[] {
  const byKey = new Map(cells.map((c) => [hexKey(c.hex), c]));
  const distance = new Map<string, number>();
  let frontier = cells.filter((c) => c.terrain !== "water").map((c) => c.hex);
  for (const h of frontier) distance.set(hexKey(h), 0);
  for (let d = 1; d < DEEP_SEA_DISTANCE && frontier.length > 0; d++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of wrappedNeighbors(h, wrap)) {
        const key = hexKey(n);
        if (distance.has(key) || !byKey.has(key)) continue;
        distance.set(key, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return cells.filter((c) => c.terrain === "water" && !distance.has(hexKey(c.hex))).map((c) => c.hex);
}

/** What the sea needs to know of the game: the map, its wrap, and whether a fight is on. */
export type SeaState = Pick<CaribbeanState, "cells" | "wrap" | "combat">;

/**
 * Whether `ship` would lose a hull point to the sea if its turn ended where
 * it is: a shallow-draft coaster (Sloop, Flute) on deep sea, with a hull
 * point to spare (the sea never takes the last), and no fight on.
 */
export function seaWillWear(state: SeaState, ship: Pick<ShipState, "position" | "stats">): boolean {
  return seaWearsOnDeep(state, ship) && isDeepSea(state.cells, ship.position, state.wrap);
}

/**
 * Whether deep sea would wear `ship` at all, wherever it is: a shallow-draft
 * coaster with a hull point to spare, and no fight on.
 */
export function seaWearsOnDeep(state: Pick<SeaState, "combat">, ship: Pick<ShipState, "stats">): boolean {
  if (state.combat) return false;
  return Boolean(ship.stats?.shallowDraft) && (ship.stats?.hull.current ?? 0) >= 2;
}

/**
 * The sea's toll as `player`'s turn `turn` ends: one hull point off their
 * ship when `seaWillWear` says so, through the usual damage (repaired at
 * port at the usual cost), recorded by seat in `G.seaWear`. NPCs are never worn.
 * Answers whether it wore the ship.
 */
export function applySeaWear(G: CaribbeanState, player: string, turn: number): boolean {
  const ship = G.ships[player];
  if (!ship || !seaWillWear(G, ship)) return false;
  applyDamage(ship, { hull: 1, crew: 0, masts: 0 });
  G.seaWear = { ...G.seaWear, [player]: turn };
  return true;
}
