/**
 * The hand-off between turns, on the board only (#216). boardgame.io passes
 * the turn the moment the last move is made; the board then plays it out in
 * order: the outgoing ship sails on to where it was sent (`sailing`), a short
 * "turn ends" beat (`turnEnded`), the NPCs moved at the turn's end sail
 * (`npcs`), then the camera flies to the next player and their turn is
 * announced (`nextTurn`), and only then are their controls live (`idle`).
 * Every phase has a time limit, and the whole hand-off has one, so a stuck
 * animation can never hold the game up. Nothing here touches `G`. Pure.
 */

import type { NPCShip } from "../game/types";

export type HandoffPhase = "sailing" | "turnEnded" | "npcs" | "nextTurn" | "idle";

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
  /** The outgoing player's ship has come to rest (or is gone). */
  readonly shipAtRest: boolean;
  /** Every NPC ship has come to rest. */
  readonly npcsAtRest: boolean;
  /** The next player's turn announcement has finished. */
  readonly turnShown: boolean;
}

/** How long each phase may last, and the least it lasts, in ms. */
export const HANDOFF_TIMING = {
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
  /** Nothing holds the game longer than this. */
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
 * A hand-off from `from` to `to`, the outgoing ship still sailing. Started
 * `now`, or, given null, at its first step (the board starts it while
 * rendering, where it does not read the clock).
 */
export const startHandoff = (from: string, to: string, now: number | null, reducedMotion: boolean): Handoff => ({
  phase: "sailing",
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
  if (s.now - h.startedAt >= HANDOFF_TIMING.total) return enter(h, "idle", s.now);
  const elapsed = s.now - h.phaseStartedAt;
  switch (h.phase) {
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

/** Whether the board still shows the NPCs where they were before the turn ended. */
export const holdsNpcs = (h: Handoff | null): boolean => h !== null && (h.phase === "sailing" || h.phase === "turnEnded");

/**
 * The NPCs a hand-off holds while the outgoing turn plays out: as the board
 * last showed them (`before`), not yet where the turn's NPC step sent them
 * (`after`). After a fight, `before` is the fight's last picture, so an NPC
 * sunk or captured in it, gone from `after`, is left out, never to reappear
 * (#288). After any other turn the NPCs are held as they stood: a merchant
 * the step took home to port goes when the NPCs sail.
 */
export function heldNpcsFor(
  before: Record<string, NPCShip>,
  after: Record<string, NPCShip>,
  afterFight: boolean,
): Record<string, NPCShip> {
  if (!afterFight) return before;
  return Object.fromEntries(Object.entries(before).filter(([id]) => id in after));
}

/** Whether the next player's controls wait. */
export const controlsLocked = (h: Handoff | null): boolean => h !== null && h.phase !== "idle";
