import type { Client } from "boardgame.io/client";
import type { MatchState } from "./hotseatSave";

/** The Redux store enhancer boardgame.io's client takes (its `enhancer` option). */
type StoreEnhancer = NonNullable<Parameters<typeof Client>[0]["enhancer"]>;

interface HotseatStoreOptions {
  /** The state to start the match in (a restored save), instead of the game's `setup()`. */
  start?: MatchState;
  /** Called with the whole state after every action; never with `start` unchanged. */
  onState: (state: MatchState) => void;
}

/**
 * A Redux store enhancer for boardgame.io's local client (its `enhancer`
 * option): it starts the store in `start` when given, the preloaded state
 * otherwise, and hands every state the store reaches to `onState`. A new
 * match is first reported after its first action: under React's StrictMode
 * a client is built twice and one never shown, and that one must not
 * overwrite the save. A restored match is first reported once its state
 * moves on from `start` (a new `_stateID`): it is already the save, and
 * writing it again on a bare Continue would stamp it with the time it was
 * opened, not played. The client keeps its own reducer, middleware and
 * flow; only where the store starts changes, so a restored match plays on
 * as boardgame.io would.
 */
export function hotseatStoreEnhancer({ start, onState }: HotseatStoreOptions): StoreEnhancer {
  return (createStore) => (reducer, preloaded) => {
    const store = createStore(reducer, (start ?? preloaded) as typeof preloaded);
    store.subscribe(() => {
      const state = store.getState() as unknown as MatchState;
      if (state._stateID !== start?._stateID) onState(state);
    });
    return store;
  };
}
