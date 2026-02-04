import { hexDistance } from "./hex";
import type { Hex } from "./hex";
import type { ShipState, FloatingLoot, DamageState, NPCShip, MapCell } from "./types";

export const BASE_ATTACK_RANGE = 1;
export const LONG_GUNS_BONUS_RANGE = 1;
export const CANNON_HIT_MIN = 5;
export const MOUNTAIN_ELEVATION = 3; // Elevation that blocks LOS

/**
 * Linear interpolation between two numbers.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Round cube coordinates to nearest hex.
 */
function cubeRound(q: number, r: number, s: number): Hex {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq, r: rr, s: rs };
}

/**
 * Get all hexes along the line from a to b (inclusive of endpoints).
 * Uses cube coordinate interpolation for accurate hex line drawing.
 */
export function getHexLine(a: Hex, b: Hex): Hex[] {
  const N = hexDistance(a, b);
  if (N === 0) return [a];

  const results: Hex[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Interpolate in cube coordinates
    const q = lerp(a.q, b.q, t);
    const r = lerp(a.r, b.r, t);
    const s = lerp(a.s, b.s, t);
    results.push(cubeRound(q, r, s));
  }
  return results;
}

/**
 * Check if there's a clear line of sight between two hexes.
 * Mountains (elevation 3) block line of sight.
 * @returns true if line of sight is clear, false if blocked by a mountain
 */
export function checkLineOfSight(a: Hex, b: Hex, cells: MapCell[]): boolean {
  const line = getHexLine(a, b);

  // Create a map for quick cell lookup
  const cellMap = new Map<string, MapCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.hex.q},${cell.hex.r}`, cell);
  }

  // Check each hex in the line (excluding start and end points)
  for (let i = 1; i < line.length - 1; i++) {
    const h = line[i];
    const cell = cellMap.get(`${h.q},${h.r}`);
    if (cell && cell.elevation === MOUNTAIN_ELEVATION) {
      return false; // Mountain blocks LOS
    }
  }

  return true; // No obstructions
}

/**
 * Check if combat is possible considering line of sight.
 * Mountains block cannons and long-range attacks.
 */
export function hasLineOfSight(
  attacker: { position: Hex },
  defender: { position: Hex },
  cells: MapCell[]
): boolean {
  return checkLineOfSight(attacker.position, defender.position, cells);
}

/**
 * Get effective cannons for a ship, limited by current crew.
 * Each cannon requires 1 crew to operate, so effective cannons = min(cannons, current crew).
 */
export function getEffectiveCannons(ship: ShipState | NPCShip): number {
  if (!ship.stats) return 0;
  const baseCannons = ship.stats.cannons;
  const currentCrew = ship.stats.crew.current;
  return Math.min(baseCannons, currentCrew);
}

let lootIdCounter = 0;

export function getShipAttackRange(ship: ShipState | NPCShip): number {
  // NPCs don't have upgrades array
  const upgrades = 'upgrades' in ship ? ship.upgrades : [];
  if (upgrades.includes("long_guns")) {
    return BASE_ATTACK_RANGE + LONG_GUNS_BONUS_RANGE;
  }
  return BASE_ATTACK_RANGE;
}

export function canAttack(
  attacker: ShipState,
  defender: ShipState,
  distance: number,
  cells?: MapCell[]
): boolean {
  if (distance <= 0) return false;
  if (defender.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  if (distance > getShipAttackRange(attacker)) return false;

  // Check line of sight if cells are provided
  if (cells && !hasLineOfSight(attacker, defender, cells)) {
    return false;
  }

  return true;
}

export function canReturnFire(defender: ShipState | NPCShip, distance: number): boolean {
  if (defender.isDerelict) return false;
  // NPCs always have stats, player ships might not
  const stats = defender.stats;
  if (!stats || stats.crew.current <= 0) return false;
  return distance <= getShipAttackRange(defender);
}

export function resolveSeamanship(
  attackerManeuv: number,
  attackerRoll: number,
  defenderManeuv: number,
  defenderRoll: number
): "attacker" | "defender" {
  const attackerTotal = attackerManeuv + attackerRoll;
  const defenderTotal = defenderManeuv + defenderRoll;
  // Attacker wins ties
  return attackerTotal >= defenderTotal ? "attacker" : "defender";
}

export function countCannonHits(rolls: number[]): number {
  return rolls.filter((r) => r >= CANNON_HIT_MIN).length;
}

export function calculateDamage(
  hits: number,
  attackerUpgrades: string[]
): DamageState {
  if (hits === 0) {
    return { hull: 0, crew: 0, masts: 0 };
  }

  const damage: DamageState = {
    hull: hits,
    crew: 0,
    masts: 0,
  };

  if (attackerUpgrades.includes("chain_shot")) {
    damage.masts = 1;
  }

  if (attackerUpgrades.includes("grape_shot")) {
    damage.crew = 1;
  }

  return damage;
}

export function applyDamage(ship: ShipState | NPCShip, damage: DamageState): void {
  ship.damage.hull += damage.hull;
  ship.damage.crew += damage.crew;
  ship.damage.masts += damage.masts;

  if (ship.stats) {
    ship.stats.hull.current = Math.max(0, ship.stats.hull.current - damage.hull);
    ship.stats.crew.current = Math.max(0, ship.stats.crew.current - damage.crew);
  }
}

export function isSunk(ship: ShipState): boolean {
  return ship.stats !== undefined && ship.stats.hull.current <= 0;
}

export function isDerelict(ship: ShipState): boolean {
  if (!ship.stats) return false;
  return ship.stats.crew.current <= 0 && ship.stats.hull.current > 0;
}

export function createLootFromShip(ship: ShipState): FloatingLoot {
  lootIdCounter++;
  return {
    id: `loot-${lootIdCounter}-${Date.now()}`,
    hex: { ...ship.position },
    cargo: { ...ship.cargo },
    gold: Math.floor(ship.gold / 2),
  };
}

export function getValidAttackTargets(
  attacker: ShipState,
  ships: Record<string, ShipState>,
  attackerId: string,
  cells?: MapCell[]
): string[] {
  if (!attacker.stats || attacker.stats.crew.current <= 0) {
    return [];
  }

  const range = getShipAttackRange(attacker);
  const targets: string[] = [];

  for (const [id, ship] of Object.entries(ships)) {
    if (id === attackerId) continue;
    if (ship.isDerelict) continue;

    const distance = hexDistance(attacker.position, ship.position);
    if (distance > 0 && distance <= range) {
      // Check line of sight if cells are provided
      if (cells && !hasLineOfSight(attacker, ship, cells)) {
        continue;
      }
      targets.push(id);
    }
  }

  return targets;
}

export function canAttackNPC(
  attacker: ShipState,
  npc: NPCShip,
  distance: number,
  cells?: MapCell[]
): boolean {
  if (distance <= 0) return false;
  if (npc.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  if (distance > getShipAttackRange(attacker)) return false;

  // Check line of sight if cells are provided
  if (cells && !hasLineOfSight(attacker, npc, cells)) {
    return false;
  }

  return true;
}

export function getValidNPCAttackTargets(
  attacker: ShipState,
  npcs: Record<string, NPCShip>,
  cells?: MapCell[]
): string[] {
  if (!attacker.stats || attacker.stats.crew.current <= 0) {
    return [];
  }

  const range = getShipAttackRange(attacker);
  const targets: string[] = [];

  for (const [id, npc] of Object.entries(npcs)) {
    if (npc.isDerelict) continue;

    const distance = hexDistance(attacker.position, npc.position);
    if (distance > 0 && distance <= range) {
      // Check line of sight if cells are provided
      if (cells && !hasLineOfSight(attacker, npc, cells)) {
        continue;
      }
      targets.push(id);
    }
  }

  return targets;
}

export function createLootFromNPC(npc: NPCShip): FloatingLoot {
  lootIdCounter++;
  return {
    id: `loot-${lootIdCounter}-${Date.now()}`,
    hex: { ...npc.position },
    cargo: { ...npc.cargo },
    gold: Math.floor(npc.gold / 2),
  };
}

/**
 * Resolve a flee attempt using seamanship rolls.
 * @param pursuerManeuv - Pursuer's maneuverability
 * @param pursuerRoll - Pursuer's D6 roll
 * @param fleeerManeuv - Fleeing ship's maneuverability
 * @param fleeerRoll - Fleeing ship's D6 roll
 * @returns "escaped" if fleeer wins by 2+, "caught" otherwise
 */
export function resolveFleeAttempt(
  pursuerManeuv: number,
  pursuerRoll: number,
  fleeerManeuv: number,
  fleeerRoll: number
): "escaped" | "caught" {
  const pursuerTotal = pursuerManeuv + pursuerRoll;
  const fleeerTotal = fleeerManeuv + fleeerRoll;
  const difference = fleeerTotal - pursuerTotal;

  // Clean escape requires winning by 2 or more
  if (difference >= 2) {
    return "escaped";
  }

  // Caught: wins by 0-1, ties, or loses
  return "caught";
}

/**
 * Determine if an NPC should attempt to flee based on combat conditions.
 * NPCs flee when: hull < 2 OR cannons < enemy cannons
 */
export function shouldNPCFlee(
  npcHull: number,
  npcCannons: number,
  enemyCannons: number
): boolean {
  if (npcHull < 2) return true;
  if (npcCannons < enemyCannons) return true;
  return false;
}
