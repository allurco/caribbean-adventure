import { hexDistance } from "./hex";
import type { ShipState, FloatingLoot, DamageState, NPCShip } from "./types";

export const BASE_ATTACK_RANGE = 1;
export const LONG_GUNS_BONUS_RANGE = 1;
export const CANNON_HIT_MIN = 5;

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
  distance: number
): boolean {
  if (distance <= 0) return false;
  if (defender.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  return distance <= getShipAttackRange(attacker);
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

export function applyDamage(ship: ShipState, damage: DamageState): void {
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
  attackerId: string
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
      targets.push(id);
    }
  }

  return targets;
}

export function canAttackNPC(
  attacker: ShipState,
  npc: NPCShip,
  distance: number
): boolean {
  if (distance <= 0) return false;
  if (npc.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  return distance <= getShipAttackRange(attacker);
}

export function getValidNPCAttackTargets(
  attacker: ShipState,
  npcs: Record<string, NPCShip>
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
