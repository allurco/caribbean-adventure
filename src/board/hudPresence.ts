/**
 * Whether a part of a board's HUD is up, for what sits over the board from
 * outside it: the harbour link of the online shell (#125), which on a phone
 * sits beside the HUD stack (`hudStackShows`) only while it is there, and
 * keeps clear of the port panel while it is open. Each board showing the
 * part holds it up (`show`) until it lets go, so with several boards on one
 * page (`?seats=1`) one unmounting leaves the others'. Readers subscribe, as
 * `useSyncExternalStore` asks. No React.
 */
export interface PresenceFlag {
  showing: () => boolean;
  /** Holds the part up; the returned function lets go (once, however often it is called). */
  show: () => () => void;
  subscribe: (listener: () => void) => () => void;
}

export function presenceFlag(): PresenceFlag {
  let holders = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    showing: () => holders > 0,
    show: () => {
      holders += 1;
      if (holders === 1) notify();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holders -= 1;
        if (holders === 0) notify();
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The top-left stack: the sound control, Save & leave, the glory panel. */
export const hudStackPresence = presenceFlag();
/** The port panel, open while the current ship is docked. */
export const portPanelPresence = presenceFlag();
