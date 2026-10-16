import type { CaribbeanState } from "./types";

/** The things the game names with an id of its own: missions and floating loot. */
export type IdKind = "mission" | "loot";

/**
 * The next id for a `kind` of thing, from the counter kept in G (#320), so the
 * same moves from the same seed always name things alike, on any machine and
 * across a server's cold starts. Counts up `G.idCounter`, which is read as 0
 * when a match stored before the counter existed lacks it: the ids made then
 * carried a clock reading (`loot-3-1712345678901`), so `loot-1` can never be
 * one of them.
 */
export function nextId(G: Pick<CaribbeanState, "idCounter">, kind: IdKind): string {
  G.idCounter = (G.idCounter ?? 0) + 1;
  return `${kind}-${G.idCounter}`;
}
