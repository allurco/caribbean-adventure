import type { CaribbeanState } from "./types";

/** The things the game names with an id of its own: missions and floating loot. */
export type IdKind = "mission" | "loot";

/** The counter in G behind each kind of id. */
const COUNTER = { mission: "missionIdCounter", loot: "lootIdCounter" } as const satisfies Record<IdKind, keyof CaribbeanState>;

/**
 * The next id for a `kind` of thing, from that kind's own counter in G (#320),
 * so the same moves from the same seed always name things alike, on any
 * machine and across a server's cold starts. Each kind counts apart: loot lies
 * on the board for all to see, and its ids must not tell rivals how often a
 * seat drew a mission (the mission count is hidden, `playerViewFor`).
 *
 * A counter is read as 0 when a match stored before it existed lacks it: the
 * ids made then carried a clock reading (`loot-3-1712345678901`), so `loot-1`
 * can never be one of them.
 */
export function nextId(G: Pick<CaribbeanState, "missionIdCounter" | "lootIdCounter">, kind: IdKind): string {
  const counter = COUNTER[kind];
  const n = (G[counter] ?? 0) + 1;
  G[counter] = n;
  return `${kind}-${n}`;
}
