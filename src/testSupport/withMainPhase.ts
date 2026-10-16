import type { Game } from "boardgame.io";
import type { CaribbeanState } from "../game/types";

/**
 * `game` starting in its main phase, the draft skipped: for a test whose
 * setup puts every captain in command already. The draft itself never ends
 * early for such a table (`draftOver`, #111), as no real game starts one.
 */
export function withMainPhase(game: Game<CaribbeanState>): Game<CaribbeanState> {
  const phases = game.phases ?? {};
  return {
    ...game,
    phases: {
      ...phases,
      draft: { ...phases.draft, start: false },
      main: { ...phases.main, start: true },
    },
  };
}
