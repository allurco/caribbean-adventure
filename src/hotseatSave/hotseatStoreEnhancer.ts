import type { Client } from "boardgame.io/client";
import type { MatchState } from "./hotseatSave";

/** The Redux store enhancer boardgame.io's client takes (its `enhancer` option). */
type StoreEnhancer = NonNullable<Parameters<typeof Client>[0]["enhancer"]>;

interface HotseatStoreOptions {
  /** The state to start the match in (a restored save), instead of the game's `setup()`. */
  start?: MatchState;
  /** Called with the whole state after every action, and once with the state the store starts in. */
  onState: (state: MatchState) => void;
}

/**
 * A Redux store enhancer for boardgame.io's local client (its `enhancer`
 * option): it starts the store in `start` when given, the preloaded state
 * otherwise, and hands every state the store reaches to `onState`. The
 * client keeps its own reducer, middleware and flow; only where the store
 * starts changes, so a restored match plays on as boardgame.io would.
 */
export function hotseatStoreEnhancer({ start, onState }: HotseatStoreOptions): StoreEnhancer {
  return (createStore) => (reducer, preloaded) => {
    const store = createStore(reducer, (start ?? preloaded) as typeof preloaded);
    store.subscribe(() => onState(store.getState() as unknown as MatchState));
    onState(store.getState() as unknown as MatchState);
    return store;
  };
}
