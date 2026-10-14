/**
 * The moves a turn allows (#227). Each ship class sails its own number of
 * hexes a turn (`maneuverability`, less one per point of mast damage, at
 * least one). Only the actions that are the ship's own manoeuvres use one:
 * sailing a hex (`moveShip`), scouting (`spyglass`) and jury-rigging
 * (`juryRig`). Port and ship-management actions (trading, upgrades,
 * repairs, buying a ship, stashing gold, the tavern) are free.
 *
 * The count lives in `G.movesUsed`, reset as each turn begins, rather than in
 * boardgame.io's `ctx.numMoves`, which counts every move made.
 */
import { SHIP_SPECS } from "./constants";
import { findAccessiblePort } from "./moves";
import type { CaribbeanState, ShipClass, ShipStats } from "./types";

/** The moves a ship with no class (a hand-built test ship) gets a turn. */
export const MOVES_PER_TURN = 3;

/** The moves `ship` gets a turn: its class's manoeuvrability less its mast damage, at least one. */
export function getMaxMoves(ship: {
  stats?: ShipStats;
  shipClass?: ShipClass;
  damage?: { masts: number };
}): number {
  let base = MOVES_PER_TURN;
  if (ship.stats) base = ship.stats.maneuverability;
  else if (ship.shipClass) base = SHIP_SPECS[ship.shipClass].maneuverability;

  // Mast damage reduces movement (1 damage = -1 move)
  const mastDamage = ship.damage?.masts ?? 0;
  return Math.max(1, base - mastDamage);
}

/** The moves the current player has used this turn. */
export const movesUsed = (G: Pick<CaribbeanState, "movesUsed">): number => G.movesUsed ?? 0;

/** The moves `player` has left this turn (none when their ship is gone). */
export function movesLeft(G: Pick<CaribbeanState, "ships" | "movesUsed">, player: string): number {
  const ship = G.ships[player];
  if (!ship) return 0;
  return Math.max(0, getMaxMoves(ship) - movesUsed(G));
}

/** Uses one of the current player's moves. Call from inside a move. */
export function spendMove(G: CaribbeanState): void {
  G.movesUsed = movesUsed(G) + 1;
}

/**
 * Whether `player`'s turn ends by itself: their moves are all used and their
 * ship is not at a port's docking hex. A ship docked on its last move stays,
 * so its captain can trade, repair and refit there, then ends the turn.
 */
export function turnRunsOut(
  G: Pick<CaribbeanState, "ships" | "movesUsed" | "cells" | "wrap">,
  player: string,
): boolean {
  const ship = G.ships[player];
  if (!ship) return false;
  if (movesLeft(G, player) > 0) return false;
  return findAccessiblePort(ship.position, G.cells, G.wrap) === undefined;
}
