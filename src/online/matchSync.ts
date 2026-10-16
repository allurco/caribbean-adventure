/**
 * Keeps one seat's board in step with its online match (#113), asynchronous
 * play by polling: the seat's actions go to `/api` one at a time, each with
 * the `stateID` it was made against, and the server's answer (that seat's
 * view) replaces what the board shows. On a refusal (stale, not your turn, a
 * move the game refuses) the whole view is fetched again. Every few seconds
 * it asks whether the match changed, and fetches the view only when it did.
 *
 * Realtime (#114): the match's channel (`matchLive.ts`) passes on each
 * `changed` signal (`signal`), and the view is read when the signal is newer
 * than the board; while the channel is live (`setLive`) polling slows to a
 * rare fallback, and it is back every few seconds whenever the channel is
 * not. Pure apart from the injected API and timers; `apiTransport.ts` plugs
 * it into boardgame.io.
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

/** What a client may send: one of the game's moves, or End Turn (the server allows no more). Shared with `server/matchEngine.ts`. */
export interface MatchAction {
  type: "MAKE_MOVE" | "GAME_EVENT";
  payload: { type: string; args: unknown[] };
}

export interface MatchSyncApi {
  getMatch(matchId: string, since?: number): Promise<MatchGetResult>;
  sendAction(matchId: string, stateID: number, action: MatchAction): Promise<MatchSendResult>;
}

/** How often a seat asks whether its match changed, without a live channel. */
export const MATCH_POLL_MS = 4000;

/** How often it still asks while the channel is live: a fallback for a signal lost on the way. */
export const LIVE_POLL_MS = 30_000;

/** Signals this close together are read once. */
export const SIGNAL_DEBOUNCE_MS = 100;

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
  /**
   * The board may show a move the server never got (the send failed on the
   * way): until a full read succeeds, polls ask for the whole view, not just
   * whether the state id moved, since it did not.
   */
  let needsFullView = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let live = false;
  /** The newest version a `changed` signal announced. */
  let signalled = -1;
  let signalTimer: ReturnType<typeof setTimeout> | undefined;

  /** The server's view replaces the board's, unless it is older than one already shown (a late poll). */
  const show = (view: SeatView) => {
    if (view._stateID < stateID) return;
    stateID = view._stateID;
    onView(view);
  };

  async function refresh(): Promise<void> {
    const result = await api.getMatch(matchId);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    needsFullView = false;
    if (result.changed) show(result.state);
  }

  async function poll(): Promise<void> {
    if (inFlight > 0) return;
    if (needsFullView) return refresh();
    const result = await api.getMatch(matchId, stateID);
    if (inFlight > 0) return;
    if (result.ok && result.changed) show(result.state);
  }

  async function deliver(baseStateID: number, action: ClientAction): Promise<void> {
    const name = action.payload?.type;
    const args = action.payload?.args ?? [];
    if ((action.type !== "MAKE_MOVE" && action.type !== "GAME_EVENT") || typeof name !== "string" || !Array.isArray(args)) {
      onError("That cannot be done in an online match.");
      // As for a refusal: the board may show it until a whole view arrives.
      needsFullView = true;
      return refresh();
    }
    const result = await api.sendAction(matchId, baseStateID, { type: action.type, payload: { type: name, args } });
    if (result.ok) {
      show(result.state);
      return;
    }
    onError(result.error);
    // The board may show the refused move; until a whole view arrives (this
    // refetch may itself be refused, a 429 or a 5xx), polls ask for it.
    needsFullView = true;
    return refresh();
  }

  const offline = () => onError("Could not reach the harbour. Check your connection.");

  /** Reads the view if a signal said the match is past the board, unless an action is on its way (it reads again once that settles). */
  const readSignalled = () => {
    if (signalled > stateID && inFlight === 0) void poll().catch(() => {});
  };

  const startTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = setInterval(() => void poll().catch(() => {}), live ? LIVE_POLL_MS : MATCH_POLL_MS);
  };

  return {
    /** Queues an action made against `baseStateID` (the state the board held when it was made). */
    send(baseStateID: number, action: ClientAction): void {
      inFlight++;
      queue = queue
        .then(() => deliver(baseStateID, action))
        .catch(() => {
          // The action may or may not have arrived: only a full read tells.
          needsFullView = true;
          offline();
          return refresh().catch(() => {});
        })
        .finally(() => {
          inFlight--;
          readSignalled();
        });
    },
    /** Fetches the whole view now. */
    refresh(): void {
      void refresh().catch(offline);
    },
    start(): void {
      if (started) return;
      started = true;
      startTimer();
    },
    stop(): void {
      started = false;
      if (timer !== undefined) clearInterval(timer);
      if (signalTimer !== undefined) clearTimeout(signalTimer);
      timer = signalTimer = undefined;
    },
    /** The channel said the match is now at version `v`: read the view, soon and once, if the board is behind it. */
    signal(v: number): void {
      if (v <= stateID) return;
      signalled = Math.max(signalled, v);
      if (signalTimer !== undefined) return;
      signalTimer = setTimeout(() => {
        signalTimer = undefined;
        readSignalled();
      }, SIGNAL_DEBOUNCE_MS);
    },
    /** Whether the channel is live: polling slows to a fallback while it is, and on going live reads once for anything missed. */
    setLive(next: boolean): void {
      if (next === live) return;
      live = next;
      if (!started) return;
      startTimer();
      if (live) void poll().catch(() => {});
    },
  };
}

export type MatchSync = ReturnType<typeof createMatchSync>;
