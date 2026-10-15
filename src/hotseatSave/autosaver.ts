import type { SaveWriteResult } from "./saveStorage";

interface AutosaverOptions<S> {
  /** How long the state must stay unchanged before it is written, in ms. */
  delayMs: number;
  /** Writes a state; it must not throw. */
  write: (state: S) => SaveWriteResult;
  /** Told the outcome of every write. */
  onResult?: (result: SaveWriteResult) => void;
}

export interface Autosaver<S> {
  /** A new state to save, once changes settle. */
  offer(state: S): void;
  /** Writes the pending state now (leaving the page, Save & leave); `{ ok: true }` when nothing is pending. */
  flush(): SaveWriteResult;
  /** Drops the pending state and writes nothing more. */
  stop(): void;
}

/**
 * Saves the latest of a stream of states, debounced: a burst of actions (a
 * ship sailing several hexes, a turn's end) becomes one write.
 */
export function createAutosaver<S>({ delayMs, write, onResult }: AutosaverOptions<S>): Autosaver<S> {
  let pending: { state: S } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const flush = (): SaveWriteResult => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return { ok: true };
    const { state } = pending;
    pending = null;
    const result = write(state);
    onResult?.(result);
    return result;
  };

  return {
    offer(state) {
      if (stopped) return;
      pending = { state };
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    stop() {
      stopped = true;
      pending = null;
      clearTimeout(timer);
    },
  };
}
