/**
 * The contract of a match's realtime channel (#114, PRD #104 Realtime
 * channels), shared by the server that signals and the browser that
 * listens: one private Supabase Realtime channel per match, `match:{id}`,
 * that only the match's seated players may join (row-level security on
 * `realtime.messages`, `supabase/migrations/*_match_realtime.sql`).
 *
 * It carries no game state, ever. After an accepted move the server
 * broadcasts `changed` with the new state's version alone, and each seat
 * then fetches its own view through `/api`. Presence says which seats are
 * online: keyed by seat, with an online flag and nothing more.
 */
import { MAX_SEATS } from "../game/seats";

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

/** What a seat tracks on the channel, under its seat as the presence key: that it is online, no more. */
export const SEAT_PRESENCE = { online: true } as const;

/** The seats online, from the channel's presence keys: sorted, each once, anything that is not a seat left out. */
export function onlineSeatsFrom(keys: readonly string[]): string[] {
  const seats = keys.filter((key) => /^[0-9]$/.test(key) && Number(key) < MAX_SEATS);
  return [...new Set(seats)].sort((a, b) => Number(a) - Number(b));
}
