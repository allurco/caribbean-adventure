/**
 * The server's side of a match's realtime channel (#114): after a move is
 * accepted, `/api` tells the match's seats that it changed, and each fetches
 * its own view. The signal carries the new state's version alone
 * (`changedSignal`, `src/online/matchChannel.ts`), never game state.
 *
 * Sent through Supabase Realtime's REST broadcast endpoint with the
 * service-role (secret) key, which only the server holds: clients may join
 * the channel and track presence, but row-level security on
 * `realtime.messages` refuses them a broadcast, so no client can send
 * `changed`. A port, so the route tests, the in-memory store and the e2e
 * backend run without Realtime.
 */
import { changedSignal, MATCH_CHANGED_EVENT, matchTopic } from "../src/online/matchChannel";

export interface MatchSignals {
  /** Tells the match's seats it is now at `stateId`. Rejects when the signal could not be sent. */
  changed(matchId: string, stateId: number): Promise<void>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** How long a move's response waits on the signal before giving up on it (clients still poll). */
export const SIGNAL_TIMEOUT_MS = 1500;

interface RealtimeSignalsOptions {
  /** The project's URL (`SUPABASE_URL`). */
  url: string;
  /** The secret (service-role) key. */
  key: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

/** A legacy service-role key is a JWT; a new secret key (`sb_secret_…`) is not, and goes on `apikey` only. */
const isJwt = (key: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key);

export function realtimeSignals({ url, key, fetch = globalThis.fetch, timeoutMs = SIGNAL_TIMEOUT_MS }: RealtimeSignalsOptions): MatchSignals {
  const endpoint = `${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`;
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  if (isJwt(key)) headers.authorization = `Bearer ${key}`;
  return {
    async changed(matchId, stateId) {
      const body = JSON.stringify({
        messages: [{ topic: matchTopic(matchId), event: MATCH_CHANGED_EVENT, payload: changedSignal(stateId), private: true }],
      });
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`the realtime signal timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      });
      try {
        const response = await Promise.race([fetch(endpoint, { method: "POST", headers, body, signal: controller.signal }), timeout]);
        if (!response.ok) throw new Error(`the realtime signal was refused: ${response.status}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
