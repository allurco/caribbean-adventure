import type { CaribbeanState, Nation, PirateCause, PortNation, ShipState } from "./types";
import { NATIONS } from "./types";

/**
 * Bounty threshold at which a nation will spawn a flotilla to hunt the player.
 */
export const BOUNTY_THRESHOLD = 50;

/**
 * Types of actions that can increase bounty with a nation.
 */
export type BountyAction = "attack_merchant" | "sink_merchant" | "board_merchant";

/**
 * Calculate the bounty gained from a specific action against an NPC.
 * @param action - The type of action taken
 * @param npcBountyValue - The bounty value of the NPC (from NPCShip.bounty)
 * @returns The bounty to add to the player's record
 */
export function getBountyForAction(action: BountyAction, npcBountyValue: number): number {
  switch (action) {
    case "attack_merchant":
      // Attacking earns the NPC's bounty value
      return npcBountyValue;
    case "sink_merchant":
      // Sinking earns half bounty (destruction is less "profitable" for pirates)
      return Math.floor(npcBountyValue / 2);
    case "board_merchant":
      // Boarding/capturing earns full bounty (most pirate-like action)
      return npcBountyValue;
    default:
      return 0;
  }
}

/**
 * Add bounty to a player's bounty record for a specific nation.
 * @param bounties - The player's current bounty record
 * @param nation - The nation to add bounty with
 * @param amount - The amount of bounty to add
 */
export function addBounty(
  bounties: Record<Nation, number>,
  nation: Nation,
  amount: number
): void {
  bounties[nation] += amount;
}

/**
 * Get the player's current bounty with a specific nation.
 * @param bounties - The player's bounty record
 * @param nation - The nation to check
 * @returns The bounty amount
 */
export function getPlayerBountyWithNation(
  bounties: Record<Nation, number>,
  nation: Nation
): number {
  return bounties[nation];
}

/**
 * Check if a nation should spawn a flotilla to hunt the player.
 * @param bounties - The player's bounty record
 * @param nation - The nation to check
 * @returns True if the player's bounty with this nation meets or exceeds the threshold
 */
export function shouldSpawnFlotilla(
  bounties: Record<Nation, number>,
  nation: Nation
): boolean {
  return bounties[nation] >= BOUNTY_THRESHOLD;
}

/**
 * Calculate the total bounty across all nations.
 * @param bounties - The player's bounty record
 * @returns The sum of all bounties
 */
export function getTotalBounty(bounties: Record<Nation, number>): number {
  return NATIONS.reduce((sum, nation) => sum + bounties[nation], 0);
}

/**
 * Check if a player has any bounty with any nation. This is not the same as
 * being a pirate: attacking a merchant earns a bounty without turning the
 * player pirate (see `isPlayerPirate`).
 * @param bounties - The player's bounty record
 * @returns True if the player has any bounty with any nation
 */
export function hasBounty(bounties: Record<Nation, number>): boolean {
  return getTotalBounty(bounties) > 0;
}

/**
 * How an action against a merchant turns the player pirate: sinking or
 * boarding does, merely attacking does not (#201).
 */
export function pirateCauseFor(action: BountyAction): PirateCause | null {
  if (action === "sink_merchant") return "sink";
  if (action === "board_merchant") return "board";
  return null;
}

/**
 * Whether a player has turned pirate (sunk or boarded an NPC merchant). The
 * one question the rules, the HUD and the board ask: a pirate's ship flies
 * the Jolly Roger instead of their captain's flag (#134). Status belongs to
 * the player, so it holds even when their ship is gone.
 */
export function isPlayerPirate(G: CaribbeanState, playerId: string): boolean {
  return G.pirates?.[playerId] !== undefined;
}

/**
 * Turn a player pirate. Permanent: a player already a pirate keeps the turn
 * and cause they first turned pirate with.
 */
export function turnPirate(
  G: CaribbeanState,
  playerId: string,
  cause: PirateCause,
  turn: number
): void {
  if (isPlayerPirate(G, playerId)) return;
  G.pirates ??= {};
  G.pirates[playerId] = { turn, cause };
}

/**
 * Apply an action by a player against an NPC merchant: add the bounty it
 * earns with the merchant's nation, and turn the player pirate if the action
 * sinks or boards it.
 */
export function applyMerchantAction(
  G: CaribbeanState,
  playerId: string,
  action: BountyAction,
  nation: Nation,
  npcBountyValue: number,
  turn: number
): void {
  addBounty(G.ships[playerId].bounties, nation, getBountyForAction(action, npcBountyValue));
  const cause = pirateCauseFor(action);
  if (cause) turnPirate(G, playerId, cause, turn);
}

/**
 * Check if a player is banned from a port based on their bounties.
 * Pirates are never banned from Pirate ports.
 * Players are banned from a nation's port if they have bounty with that nation.
 *
 * @param ship - The player's ship state
 * @param portNation - The nation that controls the port
 * @returns True if the player is banned from this port
 */
export function isBannedAtPort(
  ship: ShipState,
  portNation: PortNation | undefined
): boolean {
  if (!portNation) return false;

  // Pirate ports never ban anyone
  if (portNation === "Pirate") return false;

  // Check if player has bounty with this nation
  return ship.bounties[portNation] > 0;
}

/**
 * Get a list of nations the player is wanted by.
 * @param bounties - The player's bounty record
 * @returns Array of nations where the player has bounty > 0
 */
export function getWantedNations(bounties: Record<Nation, number>): Nation[] {
  return NATIONS.filter((nation) => bounties[nation] > 0);
}
