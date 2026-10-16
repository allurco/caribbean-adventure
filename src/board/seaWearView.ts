/**
 * What the HUD says about the open sea (#340), from the rule in
 * `src/game/deepSea.ts`: the warning before a coaster ends its turn on deep
 * sea, on End Turn or on a chosen route's end, and the line when the sea
 * has worn a ship. Pure.
 */
import { seaWearsOnDeep, seaWillWear, type SeaState } from "../game/deepSea";
import { hexKey, type Hex } from "../game/hex";
import type { SeaWear, ShipState } from "../game/types";

type Ship = Pick<ShipState, "position" | "stats" | "shipClass">;

const shipName = (ship: Ship): string => ship.shipClass ?? "ship";

/** Beside End Turn: the ship would lose a hull point if its turn ended where it is. */
export function endTurnSeaWarning(state: SeaState, ship: Ship): string | null {
  return seaWillWear(state, ship) ? `Open ocean: your ${shipName(ship)} will lose 1 hull` : null;
}

/** On a chosen route's end: the ship would lose a hull point if its turn ended there. */
export function targetSeaWarning(state: SeaState, ship: Ship, target: Hex): string | null {
  return seaWillWear(state, { ...ship, position: target })
    ? `Open ocean: end your turn there and your ${shipName(ship)} loses 1 hull`
    : null;
}

/** The sea's record now, if it changed since `seen`: a ship has just been worn. */
export function freshSeaWear(seen: SeaWear | undefined, now: SeaWear | undefined): SeaWear | null {
  if (!now) return null;
  return seen && seen.player === now.player && seen.turn === now.turn ? null : now;
}

/** The line when the sea wears a ship: to its own captain (`you`), or naming them. */
export function seaWearNotice({ you, captainName }: { you: boolean; captainName: string }): string {
  return `The open sea strains ${you ? "your" : `${captainName}’s`} hull: −1 hull`;
}

/**
 * The hexes of a reach (`hexes`) where the ship would be worn if its turn
 * ended there, given the map's deep sea (`deep`, by `hexKey`, from
 * `deepSeaHexes`): every deep one for a coaster with a hull point to spare,
 * none for anyone else.
 */
export function deepReach(state: Pick<SeaState, "combat">, ship: Pick<ShipState, "stats">, hexes: readonly Hex[], deep: ReadonlySet<string>): Hex[] {
  return seaWearsOnDeep(state, ship) ? hexes.filter((h) => deep.has(hexKey(h))) : [];
}
