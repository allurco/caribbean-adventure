/**
 * Boarding on the board, pure (#350): why Board is off at the choice, the
 * boarding step's line, the crew fight's exchanges in words, and how it
 * ended (who struck, what the winner took, what floated free).
 */
import { BOARDING_KILL_MIN, MIN_BOARDING_CREW } from "../game/boarding";
import type { BoardingRecord, CombatState, CrewExchange, GoodType, NPCShip, ShipState } from "../game/types";
import { GOOD_TYPES } from "../game/types";

/** Why the draw's winner may not board, `distance` hexes off with `boarderCrew` aboard; null when it may. */
export function boardRefusal(distance: number, boarderCrew: number): string | null {
  if (distance > 1) return "Boarding requires adjacent ships";
  if (boarderCrew < MIN_BOARDING_CREW) return `Too few crew to board: it takes ${MIN_BOARDING_CREW}`;
  return null;
}

/** Why the draw's winner may not board in the fight on (`boardRefusal`, its crew read from G); null when it may, or with no fight on. */
export function boardRefusalIn(G: {
  ships: Record<string, Pick<ShipState, "stats">>;
  npcs: Record<string, Pick<NPCShip, "stats">>;
  combat?: Pick<CombatState, "attackerId" | "seamanshipWinner" | "distance">;
}): string | null {
  const combat = G.combat;
  if (!combat) return null;
  const boarderId = combat.seamanshipWinner ?? combat.attackerId;
  const boarder = G.ships[boarderId] ?? G.npcs[boarderId];
  return boardRefusal(combat.distance, boarder?.stats?.crew.current ?? 0);
}

/** The line over the boarding's button: who boards whom, and how the crew fight goes. */
export function boardingIntro(boarder: string, boarded: string): string {
  return `${boarder} boards ${boarded}! Each hand rolls a die, and each ${BOARDING_KILL_MIN} or 6 kills one of the other crew. The first side down to 1 strikes its colours.`;
}

function killsIn(dice: readonly number[]): string {
  const kills = dice.filter((die) => die >= BOARDING_KILL_MIN).length;
  return kills === 0 ? "no kills" : `${kills} kill${kills === 1 ? "" : "s"}`;
}

/** One exchange of the crew fight (`index` from 0): each side's dice and kills, and the crews after it. */
export function crewExchangeLine(exchange: CrewExchange, index: number, boarder: string, defender: string): string {
  const side = (who: string, dice: readonly number[]) => `${who} rolls ${dice.join(" ")}, ${killsIn(dice)}`;
  return `Exchange ${index + 1}: ${side(boarder, exchange.boarderDice)}; ${side(defender, exchange.defenderDice)}. Crew ${exchange.boarderCrew} to ${exchange.defenderCrew}`;
}

/** Goods in words, in the goods' order ("2 Sugar, 1 Rum"), those of none left out. */
function goodsLine(goods: Record<GoodType, number>): string {
  return GOOD_TYPES.filter((good) => goods[good] > 0)
    .map((good) => `${goods[good]} ${good}`)
    .join(", ");
}

/**
 * How a boarding ended: the ship that struck its colours, what the winner
 * took (its gold and the goods that fitted), and the goods that floated
 * free. `nameOf` names a ship by its id.
 */
export function boardingOutcomeLines(boarding: BoardingRecord, nameOf: (id: string) => string): string[] {
  const loserId = boarding.winnerId === boarding.boarderId ? boarding.boardedId : boarding.boarderId;
  const winner = nameOf(boarding.winnerId);
  const taken = [boarding.gold > 0 ? `${boarding.gold} gold` : "", goodsLine(boarding.taken)].filter(Boolean);
  const floated = boarding.floated ? goodsLine(boarding.floated) : "";
  return [
    `${nameOf(loserId)} strikes its colours`,
    taken.length > 0 ? `${winner} takes ${taken.join(" and ")}` : `${winner} takes nothing: no gold or cargo aboard`,
    ...(floated ? [`${floated} float free: no room in the hold`] : []),
  ];
}
