/**
 * When the board shows a fight's end (#380), pure: the round that ended it
 * arrives in `G.lastRound` with the move that fired its last volley, and the
 * board shows it once, as it arrives, never for a game loaded after.
 */
import type { SettledRound } from "../game/types";
import type { FightResultHold } from "./turnHandoff";

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
  /**
   * The round that ended a fight, waiting for the board to finish playing
   * it (the volleys, the sinking): the panel opens on it only then, or null.
   */
  readonly waiting: SettledRound | null;
  /**
   * The wait's own key, new with every round that comes to wait (from
   * `arrivals`), never its content: a later fight ending on a byte-identical
   * round waits for its own beats. "" when nothing waits.
   */
  readonly waitKey: string;
  /** How many ended rounds have come to wait: the source of `waitKey`. */
  readonly arrivals: number;
  /** The round the panel shows, or null when it is closed. */
  readonly shown: SettledRound | null;
  /** What the fight called its NPC ("Merchant"), kept for its end: an NPC sunk is gone from G. */
  readonly npcLabel: string | null;
}

/** What the board sees as it renders. */
export interface FightOverSignals {
  readonly lastRound: SettledRound | undefined;
  /** A fight is on (the combat phase, with a fight in G). */
  readonly inCombat: boolean;
  /** The kind of the NPC in the fight on now, if one is. */
  readonly npcInFight: string | null;
  /**
   * The `waitKey` of the last wait the board has finished playing out: its
   * effects were seen done on a frame after the round arrived (the combat
   * director no longer `holding`), or "" for none yet.
   */
  readonly playedKey: string;
}

/** The panel as the board opens: closed, every round stored by then already seen. */
export function initialFightOver(lastRound: SettledRound | undefined): FightOverView {
  return { seenKey: settledKey(lastRound), waiting: null, waitKey: "", arrivals: 0, shown: null, npcLabel: null };
}

/**
 * The panel after a render (#380). A round that ended its fight waits as
 * it arrives, and the panel opens on it once the board has played it out,
 * never while its volleys fly or its ship sinks. It stays until Close, or
 * until a new fight is on; in hotseat the next captain's turn waits on it
 * (`fightResultHold`). It keeps the label of the NPC fought. The same object back when nothing changed, so
 * the board sets it only then.
 */
export function nextFightOver(view: FightOverView, s: FightOverSignals): FightOverView {
  const seenKey = settledKey(s.lastRound);
  let { waiting, waitKey, arrivals, shown } = view;
  const arrived = seenKey !== view.seenKey ? newlyEnded(view.seenKey, s.lastRound) : null;
  if (arrived) {
    waiting = arrived;
    arrivals += 1;
    waitKey = `wait-${arrivals}`;
  }
  if (waiting && waitKey === s.playedKey) {
    shown = waiting;
    waiting = null;
  }
  if (s.inCombat) {
    waiting = null;
    shown = null;
  }
  const npcLabel = s.npcInFight ?? view.npcLabel;
  if (!waiting) waitKey = "";
  if (seenKey === view.seenKey && waiting === view.waiting && waitKey === view.waitKey && shown === view.shown && npcLabel === view.npcLabel) return view;
  return { seenKey, waiting, waitKey, arrivals, shown, npcLabel };
}

/**
 * What the fight's end holds the hand-off on (#380): in hotseat, where the
 * next captain takes the same screen, the turn is announced only once the
 * panel is closed ("open"), or the round still waits to open ("waiting");
 * solo and a seat's own board hold nothing ("none").
 */
export function fightResultHold(view: Pick<FightOverView, "waiting" | "shown">, hotseat: boolean): FightResultHold {
  if (!hotseat) return "none";
  return view.shown ? "open" : view.waiting ? "waiting" : "none";
}

/** The panel closed by its Close button. */
export function closeFightOver(view: FightOverView): FightOverView {
  return view.shown ? { ...view, shown: null } : view;
}
