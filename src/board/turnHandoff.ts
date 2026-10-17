/**
 * The hand-off between turns, on the board only (#216). boardgame.io passes
 * the turn the moment the last move is made; the board then plays it out in
 * order: a fight that ended the turn finishes playing on the board (`fight`:
 * the round settles itself with its last volley, #380, so the volley, a
 * sinking, are still to play), the outgoing ship sails on to where it was sent (`sailing`), a short
 * "turn ends" beat (`turnEnded`), the NPCs moved at the turn's end sail
 * (`npcs`), then the camera flies to the next player and their turn is
 * announced (`nextTurn`), and only then are their controls live (`idle`).
 * Every phase has a time limit, and the whole hand-off has one, so a stuck
 * animation can never hold the game up. Nothing here touches `G`. Pure.
 */

import type { NPCShip } from "../game/types";

export type HandoffPhase = "fight" | "sailing" | "turnEnded" | "npcs" | "nextTurn" | "idle";

export interface Handoff {
  readonly phase: HandoffPhase;
  /** The player whose turn ended, and the player whose turn it is now. */
  readonly from: string;
  readonly to: string;
  /** When the hand-off and its current phase began (ms, any steady clock); null until its first step. */
  readonly startedAt: number | null;
  readonly phaseStartedAt: number;
  readonly reducedMotion: boolean;
}

/** What the board sees each frame. */
export interface HandoffSignals {
  readonly now: number;
  /** The board still plays a fight's beats (the combat director holds the ships, #380). */
  readonly fightPlaying: boolean;
  /**
   * The fight's end on a hotseat board (#380): its panel is open, or its round
   * still waits to open; the next captain's turn waits until it is closed.
   */
  readonly fightResult: FightResultHold;
  /** The outgoing player's ship has come to rest (or is gone). */
  readonly shipAtRest: boolean;
  /** Every NPC ship has come to rest. */
  readonly npcsAtRest: boolean;
  /** The next player's turn announcement has finished. */
  readonly turnShown: boolean;
}

/**
 * What a fight's end holds the hand-off on (`fightResultHold`): nothing, its
 * round still waiting to open on the board, or its panel open until Close.
 */
export type FightResultHold = "none" | "waiting" | "open";

/** How long each phase may last, and the least it lasts, in ms. */
export const HANDOFF_TIMING = {
  /**
   * A fight's last beats (a volley, a sinking, the ships released) may play
   * this long, and a fight's end on a hotseat board may take this long to
   * open; the rest of the hand-off's limits count from their end. An open
   * fight's end holds it until Close.
   */
  fightMax: 20000,
  /** A ship reports it is under way within a frame or two of its new hex: wait at least this long. */
  sailingMin: 120,
  // A reversal mid-move slows into its turn and can take over 2 s to settle (#219): wait well past that
  sailingMax: 6000,
  turnEnded: 1100,
  turnEndedReduced: 500,
  /** NPCs get their new hexes as the phase starts and report they are under way a frame later. */
  npcsMin: 250,
  npcsMax: 4000,
  nextTurnMax: 4000,
  /** Nothing holds the game longer than this, once the fight has played. */
  total: 12000,
} as const;

/** A turn as the board shows it: whose it is, and boardgame.io's turn number. */
export interface ShownTurn {
  readonly player: string;
  readonly turn: number;
}

/**
 * Whether turns are being played, so a new one hands off: in the main phase
 * or a fight, not the draft, and not once the game is over. A fight that wins
 * the game leaves the phase gone and the turn number moved on (#284).
 */
export const turnsInPlay = ({ phase, gameover }: { phase: string | null; gameover?: unknown }): boolean =>
  phase !== "draft" && gameover === undefined;

/**
 * Whether a new turn has begun since the board last showed `shown`: the turn
 * number moved on. Not the player alone: solo (#278) every turn is the same
 * seat's, and its turns still end and hand off. Not while `now` is a `fight`:
 * boardgame.io counts the combat phase as a turn of its own, but the fight is
 * played within the attacker's turn, and ending it hands off (#284).
 */
export const turnPassed = (shown: ShownTurn | null, now: ShownTurn & { readonly fight?: boolean }): boolean =>
  shown !== null && !now.fight && shown.turn !== now.turn;

/**
 * A hand-off from `from` to `to`, a fight that ended the turn still playing
 * (none, and its first step moves on to the sailing). Started `now`, or,
 * given null, at its first step (the board starts it while rendering, where
 * it does not read the clock).
 */
export const startHandoff = (from: string, to: string, now: number | null, reducedMotion: boolean): Handoff => ({
  phase: "fight",
  from,
  to,
  startedAt: now,
  phaseStartedAt: now ?? 0,
  reducedMotion,
});

const enter = (h: Handoff, phase: HandoffPhase, now: number): Handoff => ({ ...h, phase, phaseStartedAt: now });

/** The hand-off a moment on: the same object when its phase does not change. */
export function stepHandoff(h: Handoff, s: HandoffSignals): Handoff {
  if (h.phase === "idle") return h;
  if (h.startedAt === null) return { ...h, startedAt: s.now, phaseStartedAt: s.now };
  if (h.phase !== "fight" && s.now - h.startedAt >= HANDOFF_TIMING.total) return enter(h, "idle", s.now);
  const elapsed = s.now - h.phaseStartedAt;
  switch (h.phase) {
    case "fight":
      // The rest of the hand-off is timed from the fight's end, read and closed in hotseat (#380)
      return fightHolds(s, elapsed) ? h : { ...h, phase: "sailing", startedAt: s.now, phaseStartedAt: s.now };
    case "sailing":
      return (s.shipAtRest && elapsed >= HANDOFF_TIMING.sailingMin) || elapsed >= HANDOFF_TIMING.sailingMax
        ? enter(h, "turnEnded", s.now)
        : h;
    case "turnEnded":
      return elapsed >= (h.reducedMotion ? HANDOFF_TIMING.turnEndedReduced : HANDOFF_TIMING.turnEnded) ? enter(h, "npcs", s.now) : h;
    case "npcs":
      return (s.npcsAtRest && elapsed >= HANDOFF_TIMING.npcsMin) || elapsed >= HANDOFF_TIMING.npcsMax ? enter(h, "nextTurn", s.now) : h;
    case "nextTurn":
      return s.turnShown || elapsed >= HANDOFF_TIMING.nextTurnMax ? enter(h, "idle", s.now) : h;
  }
}

/**
 * Whether a fight that ended the turn still holds the hand-off: its beats
 * still playing, its end (hotseat) still to open, both up to `fightMax`, or
 * its end open, until Close.
 */
function fightHolds(s: HandoffSignals, elapsed: number): boolean {
  if (s.fightResult === "open") return true;
  return (s.fightPlaying || s.fightResult === "waiting") && elapsed < HANDOFF_TIMING.fightMax;
}

/** Whether the board still shows the NPCs where they were before the turn ended. */
export const holdsNpcs = (h: Handoff | null): boolean => h !== null && (h.phase === "fight" || h.phase === "sailing" || h.phase === "turnEnded");

/**
 * Whether the turn the board showed (`from`) ended in a fight, now that
 * `to` has come. A fight is a turn of its own in boardgame.io: the attack
 * starts the combat phase's turn and the fight's end starts main's next, so
 * the turn number jumps by two or more. Read from the turn numbers, not from
 * whether the board drew the fight: online, the attack and its outcome can
 * arrive in one update (#288). A seat out of the game, whose turn passes at
 * once, jumps it too; holding fewer NPCs then costs nothing worse than a
 * merchant leaving port a beat early.
 */
export const endedInFight = (from: ShownTurn, to: ShownTurn): boolean => to.turn - from.turn >= 2;

/**
 * The NPCs a hand-off holds while the turn `from` plays out into `to`: as
 * the board last showed them (`before`), not yet where the turn's NPC step
 * sent them (`after`). After a fight, every NPC gone from `after` is left
 * out: the one sunk or captured in the fight, never to reappear (#288), and
 * also any merchant the step after the fight sent home to port, which so
 * leaves a beat early. After any other turn the NPCs are held as they stood,
 * and a merchant home in port goes when the NPCs sail.
 */
export function heldNpcsFor(
  before: Record<string, NPCShip>,
  after: Record<string, NPCShip>,
  from: ShownTurn,
  to: ShownTurn,
): Record<string, NPCShip> {
  if (!endedInFight(from, to)) return before;
  return Object.fromEntries(Object.entries(before).filter(([id]) => id in after));
}

/** Whether the next player's controls wait. */
export const controlsLocked = (h: Handoff | null): boolean => h !== null && h.phase !== "idle";

/**
 * Whether the board holds the NPCs, and with them the events of the turn
 * that just ended (#246), in this render: from the very render a new turn
 * arrives in, decided from the incoming turn as the hand-off decides to
 * start (`turnPassed`), before the hand-off state has caught up; then for as
 * long as the hand-off holds them (`holdsNpcs`).
 */
export const npcsHeldNow = ({
  handoff,
  active,
  shown,
  now,
}: {
  handoff: Handoff | null;
  active: boolean;
  shown: ShownTurn | null;
  now: ShownTurn & { readonly fight?: boolean };
}): boolean => (active && turnPassed(shown, now)) || holdsNpcs(handoff);
