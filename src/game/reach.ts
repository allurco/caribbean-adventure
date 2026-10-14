/**
 * A ship's reach for the rest of its turn (#213): every hex it can sail to
 * with the moves it has left, what each costs, and the shortest route to
 * any of them. A breadth-first search capped at the moves left whose step is
 * `validMoveTargets`, so it follows exactly the rules `moveShip` checks one
 * hex at a time: reefs only for shallow-draft ships, never onto an island or
 * an occupied hex, and over the seam on a wrapping map. Pure.
 *
 * (npcManager's `findPath` is the NPCs' route: it keeps off reefs and lets a
 * port be the end, so it is not the player's rules and is not reused here.)
 */
import type { Hex, MapWrap } from "./hex";
import { canonicalHex, hexEquals } from "./hex";
import type { MapCell } from "./mapGenerator";
import { validMoveTargets } from "./moves";

/** One hex in reach and the moves it takes to get there. */
export interface ReachStep {
  readonly hex: Hex;
  readonly cost: number;
}

export interface Reach {
  /** Where the ship is (canonical). */
  readonly start: Hex;
  /** Every hex in reach, nearest first, without the start. Canonical hexes. */
  readonly hexes: readonly ReachStep[];
  /** For each hex in reach (by `hexKey`), the hex it is sailed to from. */
  readonly cameFrom: ReadonlyMap<string, Hex>;
  readonly wrap: MapWrap;
}

export interface ReachOptions {
  /** Hexes ships are in: never entered. */
  readonly occupied?: readonly Hex[];
  /** Whether the ship may cross reefs (the default, as in `validMoveTargets`). */
  readonly shallowDraft?: boolean;
  /**
   * Hexes a route ends at if it enters them, such as a port's docking hex
   * (arriving there interrupts a route): in reach, but not sailed through.
   * The start is left freely even if it is one.
   */
  readonly stops?: readonly Hex[];
}

const hexKey = (h: Hex): string => `${h.q},${h.r}`;

/** The hexes the ship at `start` can reach with `movesLeft` moves on `cells`. */
export function turnReach(
  start: Hex,
  movesLeft: number,
  cells: MapCell[],
  wrap: MapWrap,
  { occupied = [], shallowDraft = true, stops = [] }: ReachOptions = {},
): Reach {
  const origin = canonicalHex(start, wrap);
  const stopKeys = new Set(stops.map((h) => hexKey(canonicalHex(h, wrap))));
  const cameFrom = new Map<string, Hex>();
  const costs = new Map<string, number>([[hexKey(origin), 0]]);
  const hexes: ReachStep[] = [];
  let frontier: Hex[] = [origin];
  for (let cost = 1; cost <= movesLeft && frontier.length > 0; cost++) {
    const next: Hex[] = [];
    for (const from of frontier) {
      // A stop is an end: nothing is sailed on from it (except from the start)
      if (cost > 1 && stopKeys.has(hexKey(from))) continue;
      for (const to of validMoveTargets(from, cells, wrap, [...occupied], shallowDraft)) {
        const k = hexKey(to);
        if (costs.has(k)) continue;
        costs.set(k, cost);
        cameFrom.set(k, from);
        hexes.push({ hex: to, cost });
        next.push(to);
      }
    }
    frontier = next;
  }
  return { start: origin, hexes, cameFrom, wrap };
}

/** What sailing to `target` costs, or undefined when it is out of reach (or the start). */
export function reachCost(reach: Reach, target: Hex): number | undefined {
  const t = canonicalHex(target, reach.wrap);
  return reach.hexes.find((s) => hexEquals(s.hex, t))?.cost;
}

/**
 * The shortest route to `target`: the hexes after the start, in order,
 * ending on the target, each one move from the one before. Empty when the
 * target is out of reach or is the start.
 */
export function routeTo(reach: Reach, target: Hex): Hex[] {
  let at = canonicalHex(target, reach.wrap);
  if (!reach.cameFrom.has(hexKey(at))) return [];
  const route: Hex[] = [];
  while (!hexEquals(at, reach.start)) {
    route.push(at);
    const from = reach.cameFrom.get(hexKey(at));
    if (!from) return [];
    at = from;
  }
  return route.reverse();
}
