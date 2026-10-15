import type { GeneratedMap } from "../game/mapRequest";
import { createAutosaver } from "./autosaver";
import type { HotseatSave, MatchState } from "./hotseatSave";
import { persistHotseatState, type SaveStorage, type SaveWriteResult } from "./saveStorage";

interface HotseatSessionOptions {
  /** Where the save goes; null where browser storage cannot be used. */
  storage: SaveStorage | null;
  /** The time a save is stamped with, in ms since the epoch. */
  now: () => number;
  /** How long the match must rest before it is autosaved, in ms. */
  delayMs: number;
  /** Told the outcome of every write. */
  onSaveResult?: (result: SaveWriteResult) => void;
}

/**
 * One hotseat game's saving (#300): what the client is given to report its
 * states (`persistence`), and the autosaver behind it, flushed when the page
 * is left or the player saves and leaves.
 */
export function startHotseatSession({ storage, now, delayMs, onSaveResult }: HotseatSessionOptions) {
  const saver = createAutosaver<{ state: MatchState; map: GeneratedMap }>({
    delayMs,
    write: ({ state, map }) => persistHotseatState(storage, state, map, now()),
    onResult: onSaveResult,
  });
  return {
    /** The client's `persistence`: continuing `restore` when given. */
    persistence: (restore?: HotseatSave) => ({
      restore,
      onState: (state: MatchState, map: GeneratedMap) => saver.offer({ state, map }),
    }),
    flush: saver.flush,
    stop: saver.stop,
  };
}

export type HotseatSession = ReturnType<typeof startHotseatSession>;
