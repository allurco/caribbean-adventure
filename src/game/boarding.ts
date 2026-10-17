/**
 * Boarding (#350), pure: the crew fight and the plunder. Both sides roll one
 * die per crew at once, and each 5 or 6 kills one enemy crew; the exchanges
 * repeat until a side is down to 1 crew and strikes its colours. If both
 * reach 1 together, the boarder wins. Nobody is killed below 1 crew. The
 * winner then takes the gold and what cargo fits (`plunder`).
 */
import type { CrewExchange, GoodType, NPCShip, ShipState } from "./types";
import { GOOD_TYPES } from "./types";
import { totalCargo } from "./economy";

/** A die that kills one enemy crew (#350): a 5 or a 6, as a cannon hits. */
export const BOARDING_KILL_MIN = 5;

/** The fewest crew a ship may board with (#350): a ship with 1 would strike at once. */
export const MIN_BOARDING_CREW = 2;

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

/** What a ship's hold holds: a captain's ship its `maxCargo`, an NPC its class's. */
function holdOf(ship: ShipState | NPCShip): number {
  return "maxCargo" in ship ? ship.maxCargo : ship.stats.cargo;
}

function noGoods(): Record<GoodType, number> {
  return { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 };
}

/** What the winner of a boarding took: all the gold and the cargo that fitted; and the cargo that did not. */
export interface Plunder {
  gold: number;
  taken: Record<GoodType, number>;
  floated: Record<GoodType, number>;
}

/**
 * The winner of a boarding takes all the gold of the ship that struck, and
 * as much of its cargo as fits in the winner's hold, good by good in the
 * goods' order (`GOOD_TYPES`); the rest is `floated`, for the caller to set
 * afloat as loot. The loser is left with no gold and an empty hold.
 */
export function plunder(winner: ShipState | NPCShip, loser: ShipState | NPCShip): Plunder {
  const taken = noGoods();
  const floated = noGoods();
  let room = Math.max(0, holdOf(winner) - totalCargo(winner.cargo));
  for (const good of GOOD_TYPES) {
    const aboard = Math.min(loser.cargo[good], room);
    room -= aboard;
    taken[good] = aboard;
    floated[good] = loser.cargo[good] - aboard;
    winner.cargo[good] += aboard;
    loser.cargo[good] = 0;
  }
  const gold = loser.gold;
  winner.gold += gold;
  loser.gold = 0;
  return { gold, taken, floated };
}
