import { wrappedDistance } from "./hex";
import type { Hex, MapWrap } from "./hex";
import type { ShipState, NPCShip, GoodType } from "./types";
import { GOOD_TYPES } from "./types";

/**
 * Base scouting range - ships can scout targets within this many hexes
 * multiplied by their scouting stat
 */
export const BASE_SCOUT_RANGE = 1;

/**
 * Get the scouting range for a ship based on its scouting stat
 */
export function getScoutingRange(ship: ShipState): number {
  const scouting = ship.stats?.scouting ?? 1;
  return BASE_SCOUT_RANGE * scouting;
}

/**
 * Check if a target is within scouting range
 */
export function isInScoutingRange(
  scout: ShipState,
  targetPosition: Hex,
  wrap: MapWrap
): boolean {
  const range = getScoutingRange(scout);
  const distance = wrappedDistance(scout.position, targetPosition, wrap);
  return distance > 0 && distance <= range;
}

/**
 * Check if the scout can use spyglass on a target NPC
 */
export function canScoutNPC(
  scout: ShipState,
  npc: NPCShip,
  wrap: MapWrap
): boolean {
  if (npc.isIdentified) return false; // Already identified
  return isInScoutingRange(scout, npc.position, wrap);
}

/**
 * Check if the scout can use spyglass on another player's ship
 */
export function canScoutPlayer(
  scout: ShipState,
  target: ShipState,
  targetId: string,
  wrap: MapWrap
): boolean {
  if (scout.scoutedShips.includes(targetId)) return false; // Already scouted
  return isInScoutingRange(scout, target.position, wrap);
}

/**
 * Get valid scout targets (NPCs and players) within range
 */
export function getValidScoutTargets(
  scout: ShipState,
  scoutId: string,
  ships: Record<string, ShipState>,
  npcs: Record<string, NPCShip>,
  wrap: MapWrap
): { players: string[]; npcs: string[] } {
  const players: string[] = [];
  const npcTargets: string[] = [];

  // Check player ships
  for (const [id, ship] of Object.entries(ships)) {
    if (id === scoutId) continue;
    if (canScoutPlayer(scout, ship, id, wrap)) {
      players.push(id);
    }
  }

  // Check NPCs
  for (const [id, npc] of Object.entries(npcs)) {
    if (canScoutNPC(scout, npc, wrap)) {
      npcTargets.push(id);
    }
  }

  return { players, npcs: npcTargets };
}

/**
 * Estimate cargo based on scouting accuracy.
 * Higher scouting stat = more accurate estimate.
 * Returns an estimate that may be off by some amount.
 */
export function estimateCargo(
  actualCargo: Record<GoodType, number>,
  scoutingStat: number,
  rng: () => number
): Record<GoodType, number> {
  const estimate: Record<GoodType, number> = { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 };

  // Higher scouting = more accurate (less variance)
  // Scouting 1: +/- 2, Scouting 2: +/- 1, Scouting 3+: exact
  const maxError = Math.max(0, 3 - scoutingStat);

  for (const good of GOOD_TYPES) {
    const actual = actualCargo[good];
    if (maxError === 0) {
      estimate[good] = actual;
    } else {
      // Random error between -maxError and +maxError
      const error = Math.floor(rng() * (maxError * 2 + 1)) - maxError;
      estimate[good] = Math.max(0, actual + error);
    }
  }

  return estimate;
}

/**
 * Estimate gold based on scouting accuracy
 */
export function estimateGold(
  actualGold: number,
  scoutingStat: number,
  rng: () => number
): number {
  // Higher scouting = more accurate
  // Scouting 1: +/- 30%, Scouting 2: +/- 15%, Scouting 3+: +/- 5%
  const errorPercent = scoutingStat >= 3 ? 0.05 : scoutingStat === 2 ? 0.15 : 0.30;

  const maxError = Math.floor(actualGold * errorPercent);
  const error = Math.floor(rng() * (maxError * 2 + 1)) - maxError;

  return Math.max(0, actualGold + error);
}

/**
 * Scout result containing estimated cargo and gold
 */
export interface ScoutResult {
  cargo: Record<GoodType, number>;
  gold: number;
  shipClass?: string;
  nation?: string;
  role?: string;
}

/**
 * Generate a scout result for an NPC
 */
export function scoutNPC(
  npc: NPCShip,
  scoutingStat: number,
  rng: () => number
): ScoutResult {
  return {
    cargo: estimateCargo(npc.cargo, scoutingStat, rng),
    gold: estimateGold(npc.gold, scoutingStat, rng),
    shipClass: npc.shipClass,
    nation: npc.nation,
    role: npc.role,
  };
}

/**
 * Generate a scout result for a player ship
 */
export function scoutPlayer(
  target: ShipState,
  scoutingStat: number,
  rng: () => number
): ScoutResult {
  return {
    cargo: estimateCargo(target.cargo, scoutingStat, rng),
    gold: estimateGold(target.gold, scoutingStat, rng),
    shipClass: target.shipClass,
  };
}
