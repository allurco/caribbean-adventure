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
  sailingMax: 4000,
  turnEnded: 1100,
  turnEndedReduced: 500,
  /** NPCs get their new hexes as the phase starts and report they are under way a frame later. */
  npcsMin: 250,
  npcsMax: 4000,
  nextTurnMax: 4000,
  /** Nothing holds the game longer than this. */
  total: 12000,
} as const;

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

/** Whether the next player's controls wait. */
export const controlsLocked = (h: Handoff | null): boolean => h !== null && h.phase !== "idle";
