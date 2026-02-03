import type { ShipState, NPCShip } from "./types";
import { WIN_SCORE, GOLD_PER_GLORY } from "./types";
import { hexEquals } from "./hex";

/**
 * Check if a ship is at its home port
 */
export function isAtHomePort(ship: ShipState): boolean {
  if (!ship.homePortHex) return false;
  return hexEquals(ship.position, ship.homePortHex);
}

/**
 * Check if player can stash gold
 */
export function canStashGold(ship: ShipState, amount: number): boolean {
  if (amount <= 0) return false;
  if (ship.gold < amount) return false;
  if (!isAtHomePort(ship)) return false;
  return true;
}

/**
 * Calculate glory points earned from stashing gold
 */
export function calculateGloryFromGold(amount: number): number {
  return Math.floor(amount / GOLD_PER_GLORY);
}

/**
 * Apply stash gold action to a ship
 */
export function applyStashGold(ship: ShipState, amount: number): number {
  const glory = calculateGloryFromGold(amount);
  ship.gold -= amount;
  ship.stashedGold += amount;
  ship.score += glory;
  return glory;
}

/**
 * Check if a target is a "worthy target" for combat glory
 * Worthy targets: Other players, Flotillas (warships)
 * NOT worthy: Merchants (too easy)
 */
export function isWorthyTarget(target: ShipState | NPCShip): boolean {
  // Check if it's an NPC
  if ("role" in target) {
    // Only Flotillas are worthy targets, not merchants
    return target.role === "FLOTILLA";
  }
  // Player ships are always worthy targets
  return true;
}

/**
 * Award glory for sinking a worthy target
 */
export function awardCombatGlory(winner: ShipState, target: ShipState | NPCShip): number {
  if (!isWorthyTarget(target)) return 0;
  winner.score += 1;
  return 1;
}

/**
 * Check if a player has won
 */
export function hasWon(ship: ShipState): boolean {
  return ship.score >= WIN_SCORE;
}

/**
 * Find the winner among all ships, if any
 */
export function findWinner(ships: Record<string, ShipState>): string | null {
  for (const [id, ship] of Object.entries(ships)) {
    if (hasWon(ship)) {
      return id;
    }
  }
  return null;
}
