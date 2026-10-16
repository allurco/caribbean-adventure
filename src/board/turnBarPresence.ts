/**
 * Whether the board's HUD turn bar is up (the draft and a fight take it
 * down), for what sits over the board from outside it: the harbour link of
 * the online shell (#125), which joins the HUD's top-left stack on a phone
 * only while that stack is there. The board sets it; readers subscribe, as
 * `useSyncExternalStore` asks. No React.
 */
let showing = false;
const listeners = new Set<() => void>();

export function turnBarShowing(): boolean {
  return showing;
}

export function setTurnBarShowing(next: boolean): void {
  if (next === showing) return;
  showing = next;
  for (const listener of listeners) listener();
}

export function subscribeTurnBar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
