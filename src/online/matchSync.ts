/**
 * Keeps one seat's board in step with its online match (#113), asynchronous
 * play by polling: the seat's actions go to `/api` one at a time, each with
 * the `stateID` it was made against, and the server's answer (that seat's
 * view) replaces what the board shows. On a refusal (stale, not your turn, a
 * move the game refuses) the whole view is fetched again. Every few seconds
 * it asks whether the match changed, and fetches the view only when it did.
 * Realtime replaces the polling later (#114). Pure apart from the injected
 * API and timers; `apiTransport.ts` plugs it into boardgame.io.
 */
import type { State } from "boardgame.io";
import type { CaribbeanState } from "../game/types";

/** A seat's view of the match: the state the server sends (`viewFor`). */
export type SeatView = State<CaribbeanState>;

export type Refusal = { ok: false; status: number; code: string; error: string };
export type MatchGetResult =
  | { ok: true; changed: true; seat: string; state: SeatView }
  | { ok: true; changed: false; seat: string; stateID: number }
  | Refusal;
export type MatchSendResult = { ok: true; state: SeatView } | Refusal;

/** What a client may send: one of the game's moves, or End Turn (the server allows no more). */
export interface SentAction {
  type: "MAKE_MOVE" | "GAME_EVENT";
  payload: { type: string; args: unknown[] };
}

export interface MatchSyncApi {
  getMatch(matchId: string, since?: number): Promise<MatchGetResult>;
  sendAction(matchId: string, stateID: number, action: SentAction): Promise<MatchSendResult>;
}

/** How often a seat asks whether its match changed. */
export const MATCH_POLL_MS = 4000;

interface MatchSyncOptions {
  api: MatchSyncApi;
  matchId: string;
  /** The stateID of the view the board starts from. */
  initialStateID: number;
  /** Replace the board's state with the server's view. */
  onView: (view: SeatView) => void;
  /** Say why an action was refused, or why the match could not be read. */
  onError: (message: string) => void;
}

/** boardgame.io's client action, as its transport receives it. */
export interface ClientAction {
  type: string;
  /** boardgame.io adds `playerID` and `credentials`; they are not sent on (the server knows the seat). */
  payload?: { type?: unknown; args?: unknown; [field: string]: unknown } | null;
}

export function createMatchSync({ api, matchId, initialStateID, onView, onError }: MatchSyncOptions) {
  let stateID = initialStateID;
  let queue: Promise<void> = Promise.resolve();
  let inFlight = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const show = (view: SeatView) => {
    stateID = view._stateID;
    onView(view);
  };

  async function refresh(): Promise<void> {
    const result = await api.getMatch(matchId);
    if (!result.ok) onError(result.error);
    else if (result.changed) show(result.state);
  }

  async function poll(): Promise<void> {
    if (inFlight > 0) return;
    const result = await api.getMatch(matchId, stateID);
    if (inFlight > 0) return;
    if (result.ok && result.changed) show(result.state);
  }

  async function deliver(baseStateID: number, action: ClientAction): Promise<void> {
    const name = action.payload?.type;
    const args = action.payload?.args ?? [];
    if ((action.type !== "MAKE_MOVE" && action.type !== "GAME_EVENT") || typeof name !== "string" || !Array.isArray(args)) {
      onError("That cannot be done in an online match.");
      return refresh();
    }
    const result = await api.sendAction(matchId, baseStateID, { type: action.type, payload: { type: name, args } });
    if (result.ok) {
      show(result.state);
      return;
    }
    onError(result.error);
    return refresh();
  }

  return {
    /** Queues an action made against `baseStateID` (the state the board held when it was made). */
    send(baseStateID: number, action: ClientAction): void {
      inFlight++;
      queue = queue
        .then(() => deliver(baseStateID, action))
        .catch(() => onError("Could not reach the harbour. Check your connection."))
        .finally(() => {
          inFlight--;
        });
    },
    /** Fetches the whole view now. */
    refresh(): void {
      void refresh().catch(() => onError("Could not reach the harbour. Check your connection."));
    },
    start(): void {
      timer ??= setInterval(() => void poll().catch(() => {}), MATCH_POLL_MS);
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type MatchSync = ReturnType<typeof createMatchSync>;
