/**
 * The game's rules on the server (#112, ADR 0008): the same `Caribbean` game
 * the browser runs, driven through boardgame.io's own reducer, so a match
 * played online follows exactly the rules of the local game.
 */
import { InitializeGame } from "boardgame.io/internal";
import type { State } from "boardgame.io";
import { Caribbean } from "../src/game/Game";
import type { CaribbeanSetupData, CaribbeanState } from "../src/game/types";

export type MatchState = State<CaribbeanState>;

/**
 * A new match's whole state: `numPlayers` seats on the map `setupData` names,
 * its dice and deck seeded with `seed` (`newMatchSeed`, never boardgame.io's
 * clock-based default). The seed stays in the state, which only the server
 * ever reads whole; every view drops it.
 */
export function createMatchState(numPlayers: number, setupData: Required<CaribbeanSetupData>, seed: string): MatchState {
  return InitializeGame({ game: { ...Caribbean, seed }, numPlayers, setupData }) as MatchState;
}
