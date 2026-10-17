/**
 * Boarding (#350): a crew fight, pure. Both sides roll one die per crew at
 * once, and each 5 or 6 kills one enemy crew; the exchanges repeat until a
 * side is down to 1 crew and strikes its colours. If both reach 1 together,
 * the boarder wins. Nobody is killed below 1 crew.
 */

/** A die that kills one enemy crew (#350): a 5 or a 6, as a cannon hits. */
export const BOARDING_KILL_MIN = 5;

/** The fewest crew a ship may board with (#350): a ship with 1 would strike at once. */
export const MIN_BOARDING_CREW = 2;

/** One exchange of a crew fight: each side's dice, and each side's crew after it. */
export interface CrewExchange {
  boarderDice: number[];
  defenderDice: number[];
  boarderCrew: number;
  defenderCrew: number;
}

/** A crew fight fought out: its exchanges, who won, and each side's crew at the end. */
export interface CrewFight {
  exchanges: CrewExchange[];
  winner: "boarder" | "defender";
  boarderCrew: number;
  defenderCrew: number;
}

function rollDice(count: number, d6: () => number): number[] {
  return Array.from({ length: count }, () => d6());
}

function kills(dice: readonly number[]): number {
  return dice.filter((die) => die >= BOARDING_KILL_MIN).length;
}

/**
 * The crew fight between a boarder with `boarderCrew` and a defender with
 * `defenderCrew`, the dice from `d6` (boardgame.io's, the boarder's dice of
 * each exchange first). A defender already at 1 crew strikes at once, no
 * die rolled. Ends with probability 1: every exchange rolls at least two dice.
 */
export function crewFight(boarderCrew: number, defenderCrew: number, d6: () => number): CrewFight {
  const exchanges: CrewExchange[] = [];
  let boarder = boarderCrew;
  let defender = defenderCrew;
  while (boarder > 1 && defender > 1) {
    const boarderDice = rollDice(boarder, d6);
    const defenderDice = rollDice(defender, d6);
    defender = Math.max(1, defender - kills(boarderDice));
    boarder = Math.max(1, boarder - kills(defenderDice));
    exchanges.push({ boarderDice, defenderDice, boarderCrew: boarder, defenderCrew: defender });
  }
  return { exchanges, winner: defender <= 1 ? "boarder" : "defender", boarderCrew: boarder, defenderCrew: defender };
}
