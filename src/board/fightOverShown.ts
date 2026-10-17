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

/** The Fight over panel's state on the board. */
export interface FightOverView {
  /** The last settled round seen (its key): a round arriving after it is new. */
  readonly seenKey: string;
  /** The round the panel shows, or null when it is closed. */
  readonly shown: SettledRound | null;
  /** What the fight called its NPC ("Merchant"), kept for its end: an NPC sunk is gone from G. */
  readonly npcLabel: string | null;
  /** Whether the next turn was announced as last seen: a new announcement closes the panel in hotseat. */
  readonly announced: boolean;
}

/** What the board sees as it renders. */
export interface FightOverSignals {
  readonly lastRound: SettledRound | undefined;
  /** A fight is on (the combat phase, with a fight in G). */
  readonly inCombat: boolean;
  /** The kind of the NPC in the fight on now, if one is. */
  readonly npcInFight: string | null;
  /** The hand-off has announced the next turn (#216). */
  readonly announced: boolean;
  /** The seatless hotseat board, where every captain plays at one screen. */
  readonly hotseat: boolean;
}

/** The panel as the board opens: closed, every round stored by then already seen. */
export function initialFightOver(lastRound: SettledRound | undefined): FightOverView {
  return { seenKey: settledKey(lastRound), shown: null, npcLabel: null, announced: false };
}

/**
 * The panel after a render (#380): it opens on a round that ended its fight
 * as that round arrives, closes once a new fight is on and, in hotseat, once
 * the hand-off announces the next captain's turn, whose board it is then;
 * and it keeps the label of the NPC fought. The same object back when
 * nothing changed, so the board sets it only then.
 */
export function nextFightOver(view: FightOverView, s: FightOverSignals): FightOverView {
  const seenKey = settledKey(s.lastRound);
  let shown = view.shown;
  if (seenKey !== view.seenKey) shown = newlyEnded(view.seenKey, s.lastRound) ?? shown;
  if (s.inCombat) shown = null;
  if (s.hotseat && s.announced && !view.announced && shown === view.shown) shown = null;
  const npcLabel = s.npcInFight ?? view.npcLabel;
  if (seenKey === view.seenKey && shown === view.shown && npcLabel === view.npcLabel && s.announced === view.announced) return view;
  return { seenKey, shown, npcLabel, announced: s.announced };
}

/** The panel closed by its Close button. */
export function closeFightOver(view: FightOverView): FightOverView {
  return view.shown ? { ...view, shown: null } : view;
}
