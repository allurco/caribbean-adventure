/**
 * What the HUD says about the open sea (#340), from the rule in
 * `src/game/deepSea.ts`: the warning before a coaster ends its turn on deep
 * sea, on End Turn or on a chosen route's end, the deep hexes marked in its
 * reach, and the line when the sea has worn a ship. Each reads the map's deep
 * sea as a set of `hexKey`s (`deepSeaHexes`, found once per map). Pure.
 */
import { seaWearsOnDeep, type SeaState } from "../game/deepSea";
import { hexKey, type Hex } from "../game/hex";
import type { CaribbeanState, ShipState } from "../game/types";
import type { ShellLayout } from "../online/shellLayout";
import { hudToastTop } from "./hudLayout";
import { seatName } from "./seat";

type Ship = Pick<ShipState, "position" | "stats" | "shipClass">;
type Fight = Pick<SeaState, "combat">;
/** The map's deep sea, by `hexKey`. */
type DeepSea = ReadonlySet<string>;

const shipName = (ship: Ship): string => ship.shipClass ?? "ship";

const wornAt = (state: Fight, ship: Pick<ShipState, "stats">, at: Hex, deep: DeepSea): boolean =>
  seaWearsOnDeep(state, ship) && deep.has(hexKey(at));

/** Beside End Turn: the ship would lose a hull point if its turn ended where it is. */
export function endTurnSeaWarning(state: Fight, ship: Ship, deep: DeepSea): string | null {
  return wornAt(state, ship, ship.position, deep) ? `Open ocean: your ${shipName(ship)} will lose 1 hull` : null;
}

/** On a chosen route's end: the ship would lose a hull point if its turn ended there. */
export function targetSeaWarning(state: Fight, ship: Ship, target: Hex, deep: DeepSea): string | null {
  return wornAt(state, ship, target, deep) ? `Open ocean: end your turn there and your ${shipName(ship)} loses 1 hull` : null;
}

/**
 * The hexes of a reach (`hexes`) where the ship would be worn if its turn
 * ended there: every deep one for a coaster with a hull point to spare, none
 * for anyone else.
 */
export function deepReach(state: Fight, ship: Pick<ShipState, "stats">, hexes: readonly Hex[], deep: DeepSea): Hex[] {
  return seaWearsOnDeep(state, ship) ? hexes.filter((h) => deep.has(hexKey(h))) : [];
}

/** The seats the sea has worn since the board last looked (`seen`, `G.seaWear` then), in seat order. */
export function freshSeaWears(seen: CaribbeanState["seaWear"], now: CaribbeanState["seaWear"]): string[] {
  return Object.entries(now ?? {})
    .filter(([player, turn]) => seen?.[player] !== turn)
    .map(([player]) => player)
    .sort((a, b) => Number(a) - Number(b));
}

/**
 * The line for each worn seat: to its own captain ("your hull"), else naming
 * them. A client's own seat is its `playerID` online; with no seat it is
 * the solo captain's, and in hotseat every captain is named, since the turn
 * has already passed to the next.
 */
export function seaWearNotices(
  players: readonly string[],
  { playerID, numPlayers, ships }: { playerID: string | null | undefined; numPlayers: number; ships: CaribbeanState["ships"] },
): string[] {
  return players.map((player) => {
    const you = playerID != null ? playerID === player : numPlayers === 1;
    return `The open sea strains ${you ? "your" : `${seatName({ ships }, player)}’s`} hull: −1 hull`;
  });
}

/** How far below the mission toast the sea's line drops when both are up. */
const UNDER_MISSION_TOAST = 104;

/** Where the sea's line sits: the toast band, or under the mission toast when that is up too. */
export function seaWearToastTop(layout: ShellLayout, missionToastShown: boolean): number {
  return hudToastTop(layout) + (missionToastShown ? UNDER_MISSION_TOAST : 0);
}
