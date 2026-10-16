import type { CaribbeanState } from "./types";

/*
 * Ids the game gives from counters in G (#320), never the clock or module
 * state, so the same moves from the same seed always name things alike, on
 * any machine and across a server's cold starts.
 *
 * A counter is read as 0 when a match stored before it existed lacks it: the
 * ids made then carried a clock reading (`loot-3-1712345678901`), so the
 * counters' ids can never be one of them.
 */

/**
 * The next floating loot's id, `loot-N`. One count for the whole match: loot
 * lies on the board for all to see, and only sinkings, which are public too,
 * make it.
 */
export function nextLootId(G: Pick<CaribbeanState, "lootIdCounter">): string {
  G.lootIdCounter = (G.lootIdCounter ?? 0) + 1;
  return `loot-${G.lootIdCounter}`;
}

/**
 * The next id for a mission `seat` draws, `mission-<seat>-N`. Each seat
 * counts its own, so the id a seat sees on its mission tells nothing of how
 * often other seats used a tavern; `playerViewFor` shows a seat only its own
 * count.
 */
export function nextMissionId(G: Pick<CaribbeanState, "missionIdCounters">, seat: string): string {
  const counters = (G.missionIdCounters ??= {});
  counters[seat] = (counters[seat] ?? 0) + 1;
  return `mission-${seat}-${counters[seat]}`;
}
