/**
 * boardgame.io's multiplayer transport for an online match (#113): the
 * client's actions go to `/api` and the seat's view comes back, through
 * `matchSync.ts`, which holds all the logic and its tests. The one class in
 * the online code, because boardgame.io's client takes a `Transport`
 * subclass; it only forwards.
 */
import { Transport } from "boardgame.io/internal";
import type { State } from "boardgame.io";
import { createMatchSync, type ClientAction, type MatchSync, type MatchSyncApi, type SeatView } from "./matchSync";

type TransportOpts = ConstructorParameters<typeof Transport>[0];

/** The `multiplayer` option of boardgame.io's `Client` for one seat of an online match, starting from `initial`. */
export function apiTransport(api: MatchSyncApi, initial: SeatView, onError: (message: string) => void) {
  return (opts: TransportOpts) => new ApiTransport(opts, api, initial, onError);
}

class ApiTransport extends Transport {
  private readonly initial: SeatView;
  private readonly sync: MatchSync;

  constructor(opts: TransportOpts, api: MatchSyncApi, initial: SeatView, onError: (message: string) => void) {
    super(opts);
    this.initial = initial;
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
  }

  disconnect(): void {
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
