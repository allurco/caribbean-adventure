/**
 * Whom the HUD offers to the Attack and Spyglass buttons: the game's own
 * harbour rule (#388, `harbourTargets` in `src/game/safeHarbour.ts`), so the
 * buttons and the moves can't drift apart. A held action shows its button
 * disabled, with `NO_FIGHTING_IN_PORT` as the reason.
 */
import type { CaribbeanState } from "../game/types";
import { harbourTargets, type HarbourTargets } from "../game/safeHarbour";

/** Why the Attack and Spyglass buttons are disabled at port. */
export const NO_FIGHTING_IN_PORT = "No fighting in port";

export function encounterTargets(
  G: Pick<CaribbeanState, "cells" | "wrap" | "ships" | "npcs">,
  seat: string,
): HarbourTargets {
  return harbourTargets(G, seat);
}
