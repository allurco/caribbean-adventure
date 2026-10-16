/**
 * Whether a board's HUD stack (`hudStackShows`) is up, for what sits over
 * the board from outside it: the harbour link of the online shell (#125),
 * which sits beside that stack on a phone only while it is there. Each board
 * showing its stack holds it up (`showHudStack`) until it lets go, so with
 * several boards on one page (`?seats=1`) one unmounting leaves the others'.
 * Readers subscribe, as `useSyncExternalStore` asks. No React.
 */
let holders = 0;
const listeners = new Set<() => void>();

export function hudStackShowing(): boolean {
  return holders > 0;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Holds the stack up; the returned function lets go (once, however often it is called). */
export function showHudStack(): () => void {
  holders += 1;
  if (holders === 1) notify();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holders -= 1;
    if (holders === 0) notify();
  };
}

export function subscribeHudStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
