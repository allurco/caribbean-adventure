/**
 * Keeps one seat's board in step with its online match (#113), asynchronous
 * play by polling: the seat's actions go to `/api` one at a time, each with
 * the `stateID` it was made against, and the server's answer (that seat's
 * view) replaces what the board shows, unless more of the seat's actions are
 * queued behind it: the board already shows those moves, so it waits for the
 * view that answers the last of them. On a refusal (stale, not your turn, a
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

/** What a client may send: one of the game's moves, or End Turn (the server allows no more). Shared with `server/matchEngine.ts`. */
export interface MatchAction {
  type: "MAKE_MOVE" | "GAME_EVENT";
  payload: { type: string; args: unknown[] };
}

export interface MatchSyncApi {
  getMatch(matchId: string, since?: number): Promise<MatchGetResult>;
  sendAction(matchId: string, stateID: number, action: MatchAction): Promise<MatchSendResult>;
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

/**
 * Who asks the server for a view: one of the queued sends, about its own
 * action, or the board outside them (a poll, a refetch asked for).
 */
type Asker = "queued send" | "board";

export function createMatchSync({ api, matchId, initialStateID, onView, onError }: MatchSyncOptions) {
  let stateID = initialStateID;
  let queue: Promise<void> = Promise.resolve();
  let inFlight = 0;
  /**
   * The board may show a move the server never got (the send failed on the
   * way, or was refused), or a view was held back: until a whole view is
   * shown, polls ask for it, not just whether the state id moved, since it
   * may not have.
   */
  let needsFullView = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  /**
   * Whether any of the seat's actions are queued behind the asker's: the
   * board already shows their moves, since boardgame.io applies each at once,
   * so a view from the server now would take them back (a ship sailing a
   * route would turn round to an earlier hex and sail on again).
   */
  const actionsQueuedBehind = (asker: Asker) => inFlight > (asker === "queued send" ? 1 : 0);

  /**
   * A whole view from the server replaces the board's, unless actions are
   * queued behind the asker's (the view that answers the last of them shows
   * instead) or it is older than one already shown (a late poll). A view held
   * back is not shown, so the state id stays with what the board shows, and
   * the next poll asks for the whole view should the queued actions not bring
   * one: a held view newer than their answers is then never lost.
   */
  const receive = (view: SeatView, asker: Asker) => {
    if (actionsQueuedBehind(asker)) {
      needsFullView = true;
      return;
    }
    if (view._stateID < stateID) return;
    stateID = view._stateID;
    needsFullView = false;
    onView(view);
  };

  async function refresh(asker: Asker): Promise<void> {
    const result = await api.getMatch(matchId);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    // Asked without `since`, the server always sends the whole view.
    if (result.changed) receive(result.state, asker);
  }

  async function poll(): Promise<void> {
    if (inFlight > 0) return;
    if (needsFullView) return refresh("board");
    const result = await api.getMatch(matchId, stateID);
    if (inFlight > 0) return;
    if (result.ok && result.changed) receive(result.state, "board");
  }

  async function deliver(baseStateID: number, action: ClientAction): Promise<void> {
    const name = action.payload?.type;
    const args = action.payload?.args ?? [];
    if ((action.type !== "MAKE_MOVE" && action.type !== "GAME_EVENT") || typeof name !== "string" || !Array.isArray(args)) {
      onError("That cannot be done in an online match.");
      // As for a refusal: the board may show it until a whole view arrives.
      needsFullView = true;
      return refresh("queued send");
    }
    const result = await api.sendAction(matchId, baseStateID, { type: action.type, payload: { type: name, args } });
    if (result.ok) return receive(result.state, "queued send");
    onError(result.error);
    // The board may show the refused move; until a whole view arrives (this
    // refetch may itself be refused, a 429 or a 5xx), polls ask for it.
    needsFullView = true;
    return refresh("queued send");
  }

  const offline = () => onError("Could not reach the harbour. Check your connection.");

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
          return refresh("queued send").catch(() => {});
        })
        .finally(() => {
          inFlight--;
        });
    },
    /** Fetches the whole view now. */
    refresh(): void {
      void refresh("board").catch(offline);
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
