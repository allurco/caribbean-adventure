/**
 * Island archetypes (#177, decision 11 of #158, ADR 0007). Pure, board-side.
 *
 * Every island draws a kind from its own sub-seed of the world seed,
 * `stream(subSeed(G.mapSeed, "archetype", islandId))`, with the decided
 * weights renormalised over the kinds the island qualifies for (a port never
 * stands on a rocky isle). The kind is re-derived from `G.cells` and the seed,
 * never stored in `G`, and it never changes a cell's `terrain` or `elevation`:
 * it only chooses how the board shapes and dresses the island
 * (`islandLook.ts`).
 *
 * The map is then balanced: no kind may hold more than `MAX_ARCHETYPE_SHARE`
 * of the map's islands, and a map shows at least `MIN_ARCHETYPES` kinds where
 * its islands allow. An island the balance moves is the one with the lowest
 * priority (the second number of its stream) among those that can move, so the
 * balance too is a pure function of the seed and the cells.
 */
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { cellId, findIslands, type CellId, type Island, type IslandId } from "./islands";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";

/** The kinds of island, in the order the draw lays out their odds on [0, 1). */
export const ISLAND_ARCHETYPES = ["volcanic", "jungle", "atoll", "mesa", "rocky"] as const;
export type IslandArchetype = (typeof ISLAND_ARCHETYPES)[number];

/** Decision 11's weights: volcanic peak, jungle highland / mangrove, low atoll / sandbar, cliff / mesa, rocky ruins isle. */
export const ARCHETYPE_WEIGHTS: Readonly<Record<IslandArchetype, number>> = {
  volcanic: 0.3,
  jungle: 0.25,
  atoll: 0.2,
  mesa: 0.15,
  rocky: 0.1,
};

/** An atoll is at most this many cells (or low all over). */
export const ATOLL_MAX_CELLS = 3;
/** A mesa is at least this many cells. */
export const MESA_MIN_CELLS = 3;
/** A rocky isle is "small": at most this many cells. */
export const ROCKY_MAX_CELLS = 4;
/** No kind holds more than this share of a map's islands. */
export const MAX_ARCHETYPE_SHARE = 0.6;
/** A map shows at least this many kinds where its islands allow. */
export const MIN_ARCHETYPES = 3;

/** What qualifying needs to know of an island. */
export interface IslandTraits {
  /** How many cells it has. */
  cells: number;
  /** Its highest cell's elevation (1 beach … 3 mountain). */
  maxElevation: number;
  /** The share of its cells at elevation 2 or less. */
  lowShare: number;
  /** Whether a port stands on it. */
  hasPort: boolean;
}

/** Whether an island with `t` may take archetype `a` (decision 11's "Needs" column). */
export function qualifies(a: IslandArchetype, t: IslandTraits): boolean {
  switch (a) {
    case "volcanic":
      return t.maxElevation >= 3;
    case "jungle":
      return t.lowShare > 0.5;
    case "atoll":
      return t.cells <= ATOLL_MAX_CELLS || t.maxElevation <= 1;
    case "mesa":
      return t.cells >= MESA_MIN_CELLS && t.maxElevation >= 2;
    case "rocky":
      return t.cells <= ROCKY_MAX_CELLS && !t.hasPort;
  }
}

/**
 * The archetypes an island qualifies for, in `ISLAND_ARCHETYPES` order. Never
 * empty: an island with a mountain is volcanic, and one without is all at
 * elevation 2 or less, so jungle.
 */
export const qualifyingArchetypes = (t: IslandTraits): IslandArchetype[] => ISLAND_ARCHETYPES.filter((a) => qualifies(a, t));

/** The decided weights renormalised over the archetypes the island qualifies for (0 for the rest). */
export function archetypeOdds(t: IslandTraits): Record<IslandArchetype, number> {
  const ok = qualifyingArchetypes(t);
  const total = ok.reduce((sum, a) => sum + ARCHETYPE_WEIGHTS[a], 0);
  const odds = { volcanic: 0, jungle: 0, atoll: 0, mesa: 0, rocky: 0 };
  for (const a of ok) odds[a] = ARCHETYPE_WEIGHTS[a] / total;
  return odds;
}

/** The archetype whose stretch of [0, 1), laid out by cumulative odds, holds `u`. */
export function pickArchetype(odds: Readonly<Record<IslandArchetype, number>>, u: number): IslandArchetype {
  let last: IslandArchetype | null = null;
  let acc = 0;
  for (const a of ISLAND_ARCHETYPES) {
    if (odds[a] <= 0) continue;
    acc += odds[a];
    last = a;
    if (u < acc) return a;
  }
  if (last === null) throw new Error("pickArchetype: no archetype has any odds");
  return last;
}

/** The map's cells by `cellId`, for `islandTraits`. */
export function cellsById(cells: readonly MapCell[], wrap: MapWrap): Map<CellId, MapCell> {
  return new Map(cells.map((c) => [cellId(c.hex, wrap), c]));
}

/** An island's traits, read off its cells. */
export function islandTraits(island: Island, byId: ReadonlyMap<CellId, MapCell>, wrap: MapWrap = null): IslandTraits {
  let maxElevation = 0;
  let low = 0;
  let hasPort = false;
  for (const h of island.cells) {
    const cell = byId.get(cellId(h, wrap));
    const elevation = cell?.elevation ?? 1;
    maxElevation = Math.max(maxElevation, elevation);
    if (elevation <= 2) low++;
    if (cell?.hasPort) hasPort = true;
  }
  return { cells: island.cells.length, maxElevation, lowShare: low / island.cells.length, hasPort };
}

interface Draw {
  id: IslandId;
  qualifying: readonly IslandArchetype[];
  archetype: IslandArchetype;
  /** Which island moves first when the map is balanced: the lowest. */
  priority: number;
}

/** The archetypes `d` may move to, the heaviest first (ties by `ISLAND_ARCHETYPES` order). */
const alternatives = (d: Draw): IslandArchetype[] =>
  d.qualifying.filter((a) => a !== d.archetype).sort((a, b) => ARCHETYPE_WEIGHTS[b] - ARCHETYPE_WEIGHTS[a]);

/**
 * Moves islands between archetypes until no kind holds more than
 * `MAX_ARCHETYPE_SHARE` of them and `MIN_ARCHETYPES` kinds are shown, as far
 * as the islands' qualifications allow. Each move takes the lowest-priority
 * island that can make it, so it is deterministic; each strictly lowers the
 * excess over the cap or adds a kind, so it ends.
 */
function balance(draws: Draw[]): void {
  const cap = Math.max(1, Math.floor(MAX_ARCHETYPE_SHARE * draws.length));
  const count = (a: IslandArchetype) => draws.filter((d) => d.archetype === a).length;
  const byPriority = [...draws].sort((a, b) => a.priority - b.priority);
  for (let guard = 0; guard < draws.length * ISLAND_ARCHETYPES.length; guard++) {
    const over = ISLAND_ARCHETYPES.find((a) => count(a) > cap);
    if (over) {
      const absent = new Set(ISLAND_ARCHETYPES.filter((a) => count(a) === 0));
      const move = byPriority
        .filter((d) => d.archetype === over)
        .map((d) => {
          const open = alternatives(d).filter((a) => count(a) < cap);
          return { d, to: open.find((a) => absent.has(a)) ?? open[0] };
        })
        .find((m) => m.to !== undefined);
      if (!move) return;
      move.d.archetype = move.to!;
      continue;
    }
    const shown = ISLAND_ARCHETYPES.filter((a) => count(a) > 0);
    if (shown.length >= MIN_ARCHETYPES) return;
    const move = byPriority
      .filter((d) => count(d.archetype) > 1)
      .map((d) => ({ d, to: alternatives(d).find((a) => count(a) === 0) }))
      .find((m) => m.to !== undefined);
    if (!move) return;
    move.d.archetype = move.to!;
  }
}

/** Every island's archetype, by island id, on a map (and wrap) seeded by `worldSeed` (`G.mapSeed`). */
export function islandArchetypes(cells: readonly MapCell[], wrap: MapWrap, worldSeed: number): Map<IslandId, IslandArchetype> {
  const byId = cellsById(cells, wrap);
  const draws: Draw[] = findIslands(cells, wrap).map((island) => {
    const t = islandTraits(island, byId, wrap);
    const next = stream(subSeed(worldSeed, SEED_FEATURES.archetype, island.id));
    const archetype = pickArchetype(archetypeOdds(t), next());
    return { id: island.id, qualifying: qualifyingArchetypes(t), archetype, priority: next() };
  });
  balance(draws);
  return new Map(draws.map((d) => [d.id, d.archetype]));
}
