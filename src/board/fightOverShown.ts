/**
 * When the board shows a fight's end (#380), pure: the round that ended it
 * arrives in `G.lastRound` with the move that fired its last volley, and the
 * board shows it once, as it arrives, never for a game loaded after.
 */
import type { SettledRound } from "../game/types";

/** A settled round's key: what says it is new, since an online update brings G anew, never the same object. */
export function settledKey(settled: SettledRound | undefined): string {
  return settled ? JSON.stringify(settled) : "";
}

/** The round to show as the fight's end: `now`, when it is new since the round seen (`seenKey`) and it ended the fight; else null. */
export function newlyEnded(seenKey: string, now: SettledRound | undefined): SettledRound | null {
  if (!now?.ended || settledKey(now) === seenKey) return null;
  return now;
}
