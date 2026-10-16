/**
 * The contract of a match's realtime channel (#114, PRD #104 Realtime
 * channels), shared by the server that signals and the browser that
 * listens: one private Supabase Realtime channel per match, `match:{id}`,
 * that only the match's seated players may join (row-level security on
 * `realtime.messages`, `supabase/migrations/*_match_realtime.sql`).
 *
 * It carries no game state, ever. After an accepted move the server
 * broadcasts `changed` with the new state's version alone, and each seat
 * then fetches its own view through `/api`. Clients only listen: they send
 * nothing on it, presence included. Which seats are online the server keeps
 * from each seat's own reads and moves (`server/seatSeen.ts`).
 */

/** The channel of one match, its id in lower case as Postgres writes it (the policies match it so). */
export function matchTopic(matchId: string): string {
  return `match:${matchId.toLowerCase()}`;
}

/** The broadcast event the server sends after every accepted move. */
export const MATCH_CHANGED_EVENT = "changed";

/** The `changed` signal's payload: the new state's version (boardgame.io's `_stateID`), so a client can skip a stale one. */
export interface ChangedSignal {
  v: number;
}

export function changedSignal(stateId: number): ChangedSignal {
  return { v: stateId };
}

/** The version a `changed` payload carries, or null for anything else. */
export function parseChangedSignal(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const v = (payload as { v?: unknown }).v;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
