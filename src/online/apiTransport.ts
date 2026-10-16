/**
 * boardgame.io's multiplayer transport for an online match (#113): the
 * client's actions go to `/api` and the seat's view comes back, through
 * `matchSync.ts`, which holds all the logic and its tests. The one class in
 * the online code, because boardgame.io's client takes a `Transport`
 * subclass; it only forwards. With a live link to the match's channel
 * (#114, `matchLive.ts`) it passes the link's signals and health on to the
 * sync.
 */
import { Transport } from "boardgame.io/internal";
import type { State } from "boardgame.io";
import type { MatchLive } from "./matchLive";
import { createMatchSync, type ClientAction, type MatchSync, type MatchSyncApi, type SeatView } from "./matchSync";

type TransportOpts = ConstructorParameters<typeof Transport>[0];

/** The `multiplayer` option of boardgame.io's `Client` for one seat of an online match, starting from `initial`. */
export function apiTransport(api: MatchSyncApi, initial: SeatView, onError: (message: string) => void, live: MatchLive | null = null) {
  return (opts: TransportOpts) => new ApiTransport(opts, api, initial, onError, live);
}

class ApiTransport extends Transport {
  private readonly initial: SeatView;
  private readonly sync: MatchSync;
  private readonly live: MatchLive | null;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: TransportOpts, api: MatchSyncApi, initial: SeatView, onError: (message: string) => void, live: MatchLive | null) {
    super(opts);
    this.initial = initial;
    this.live = live;
    this.sync = createMatchSync({
      api,
      matchId: this.matchID,
      initialStateID: initial._stateID,
      onView: (view) => this.deliver(view),
      onError,
    });
  }

  /** The server's view replaces the client's state: a `sync`, which also undoes any local guess. */
  private deliver(state: SeatView): void {
    this.notifyClient({ type: "sync", args: [this.matchID, { state: state as State, initialState: state as State, log: [], filteredMetadata: [] }] });
  }

  connect(): void {
    this.setConnectionStatus(true);
    this.deliver(this.initial);
    this.sync.start();
    this.unsubscribe ??=
      this.live?.subscribe({ onSignal: (v) => this.sync.signal(v), onLive: (up) => this.sync.setLive(up), onOnline: () => {} }) ?? null;
  }

  disconnect(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.sync.stop();
    this.setConnectionStatus(false);
  }

  sendAction(state: State, action: { type: string; payload?: unknown }): void {
    this.sync.send(state._stateID, action as ClientAction);
  }

  requestSync(): void {
    this.sync.refresh();
  }

  // Match chat comes later (PRD #104 slice 5); a seat's match and player are fixed.
  sendChatMessage(): void {}
  updateMatchID(): void {}
  updatePlayerID(): void {}
  updateCredentials(): void {}
}
