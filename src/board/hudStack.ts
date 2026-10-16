import type { CaribbeanState } from "../game/types";
import { choosingCaptain } from "./seat";

/** The match's state the board reads from boardgame.io's `ctx`. */
export interface HudStackCtx {
  phase: string;
  currentPlayer: string;
  gameover?: unknown;
}

/**
 * Whether the harbour link of the online shell may sit beside the HUD's
 * top-left stack (the sound control, Save & leave, the glory panel) on a
 * phone (#125): only while the board is in plain play. Not while a captain
 * is picked (the draft, or a new captain for a lost ship, #265), not in a
 * fight, not once the match is over, and only while the current seat has a
 * ship. Parts of the stack may still be drawn then (in a fight the sound
 * control and Save & leave stay); the link takes the empty top-right corner
 * instead. Pure, no React.
 */
export function hudStackShows(G: Pick<CaribbeanState, "ships" | "lostShips" | "combat">, ctx: HudStackCtx): boolean {
  const inCombat = ctx.phase === "combat" && Boolean(G.combat);
  return (
    !choosingCaptain(G, ctx.phase, ctx.currentPlayer) &&
    !inCombat &&
    !ctx.gameover &&
    G.ships[ctx.currentPlayer] !== undefined
  );
}
