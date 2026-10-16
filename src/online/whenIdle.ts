/**
 * Runs a callback once the page is idle (#122): the live harbour mounts only
 * after the shell is interactive, in the browser's idle time, so building it
 * never delays the shell's first frames or its first input.
 */

/** The parts of `window` this reads; tests pass a fake. */
export interface IdleHost {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/** The longest the idle callback may wait on a page that is never idle. */
export const IDLE_TIMEOUT_MS = 2000;
/** Where there is no idle callback (Safari), the wait after the shell's first commit instead. */
export const IDLE_FALLBACK_MS = 300;

/** Calls `run` once `host` is idle; returns a cancel. */
export function whenIdle(host: IdleHost, run: () => void): () => void {
  const { requestIdleCallback, cancelIdleCallback } = host;
  if (requestIdleCallback && cancelIdleCallback) {
    const id = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const id = host.setTimeout(run, IDLE_FALLBACK_MS);
  return () => host.clearTimeout(id);
}
