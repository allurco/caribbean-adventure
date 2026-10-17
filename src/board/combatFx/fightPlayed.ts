/**
 * When a fight's beats have played out (#380), pure: the board watches the
 * combat director frame by frame, from the frame after the move arrived (the
 * director takes its beats in an effect after that render, so the render
 * itself cannot tell), until it is no longer holding, or the cap has passed.
 */

/** One frame's look at the director. */
export interface FightFrame {
  /** Frames since the watch began: 0 is the render that began it, 1 the frame after. */
  readonly frame: number;
  /** Milliseconds since the watch began. */
  readonly elapsedMs: number;
  /** Whether the director still holds the fight (its beats, its ships). */
  readonly holding: boolean;
  /** The longest the watch waits, in milliseconds; Infinity for no cap. */
  readonly capMs: number;
}

/** Whether the fight has played out by this frame: never on the frame the watch began. */
export function fightPlayedOut({ frame, elapsedMs, holding, capMs }: FightFrame): boolean {
  if (frame < 1) return false;
  return !holding || elapsedMs >= capMs;
}
