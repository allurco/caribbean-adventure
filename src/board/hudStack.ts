import type { CaribbeanState } from "../game/types";
import { choosingCaptain } from "./seat";

/** The match's state the board reads from boardgame.io's `ctx`. */
export interface HudStackCtx {
  phase: string;
  currentPlayer: string;
  gameover?: unknown;
}

/**
 * Whether the HUD's top-left stack (the sound control, Save & leave, the
 * glory panel) is on the board: not while a captain is picked (the draft, or
 * a new captain for a lost ship, #265), not in a fight, not once the match is
 * over, and only while the current seat has a ship. The harbour link sits
 * beside the stack on a phone while it shows (#125). Pure, no React.
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
