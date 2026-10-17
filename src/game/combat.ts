import { hexDistance, canonicalHex, nearestImage, wrappedDistance } from "./hex";
import type { Hex, MapWrap } from "./hex";
import type { ShipState, FloatingLoot, DamageState, NPCShip, MapCell, VolleyAim } from "./types";

export const BASE_ATTACK_RANGE = 1;
export const LONG_GUNS_BONUS_RANGE = 1;
export const CANNON_HIT_MIN = 5;
export const MOUNTAIN_ELEVATION = 3; // Elevation that blocks LOS
/** What each point of mast damage takes off a fleeing ship's roll (#348). */
export const MAST_FLEE_PENALTY = 1;
/**
 * The most mast damage a ship takes (#348, as #257 had it): a hit aimed at
 * the masts past it goes to the hull. So the flee penalty is at most
 * `MAX_MAST_DAMAGE × MAST_FLEE_PENALTY`, and the moves a turn at most this
 * many fewer (`getMaxMoves`, never under 1).
 */
export const MAX_MAST_DAMAGE = 2;

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
 * On a wrapped map the line goes the short way round the seam, and every hex
 * in it is canonical.
 */
export function getHexLine(a: Hex, b: Hex, wrap: MapWrap): Hex[] {
  const end = nearestImage(a, b, wrap);
  const N = hexDistance(a, end);
  if (N === 0) return [a];

  const results: Hex[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Interpolate in cube coordinates
    const q = lerp(a.q, end.q, t);
    const r = lerp(a.r, end.r, t);
    const s = lerp(a.s, end.s, t);
    results.push(canonicalHex(cubeRound(q, r, s), wrap));
  }
  return results;
}

/** The map a line-of-sight check needs: its cells and its wrap. */
export interface LineOfSightMap {
  cells: MapCell[];
  wrap: MapWrap;
}

/**
 * Check if there's a clear line of sight between two hexes.
 * Mountains (elevation 3) block line of sight.
 * @returns true if line of sight is clear, false if blocked by a mountain
 */
export function checkLineOfSight(a: Hex, b: Hex, cells: MapCell[], wrap: MapWrap): boolean {
  const line = getHexLine(a, b, wrap);

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
  map: LineOfSightMap
): boolean {
  return checkLineOfSight(attacker.position, defender.position, map.cells, map.wrap);
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
  losMap?: LineOfSightMap
): boolean {
  if (distance <= 0) return false;
  if (defender.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  if (distance > getShipAttackRange(attacker)) return false;

  // Check line of sight if the map is provided
  if (losMap && !hasLineOfSight(attacker, defender, losMap)) {
    return false;
  }

  return true;
}

/** Do this ship's guns reach a ship `distance` hexes off (#356)? Range only: no crew or guns check. */
export function isInGunRange(ship: ShipState | NPCShip, distance: number): boolean {
  return distance <= getShipAttackRange(ship);
}

/**
 * May this ship answer a volley (#346)? Not when sunk or derelict, with no
 * crew or no gun it can man, or out of its guns' range.
 */
export function canReturnFire(defender: ShipState | NPCShip, distance: number): boolean {
  if (defender.isDerelict) return false;
  // NPCs always have stats, player ships might not
  const stats = defender.stats;
  if (!stats || stats.hull.current <= 0 || getEffectiveCannons(defender) < 1) return false;
  return isInGunRange(defender, distance);
}

/** The draw (#347): who wins it, each die plus its ship's manoeuvrability, a tie to the defender. */
export function resolveSeamanship(
  attackerManeuv: number,
  attackerRoll: number,
  defenderManeuv: number,
  defenderRoll: number
): "attacker" | "defender" {
  const attackerTotal = attackerManeuv + attackerRoll;
  const defenderTotal = defenderManeuv + defenderRoll;
  // The defender wins ties (#347): the attacker already had the ambush
  return attackerTotal > defenderTotal ? "attacker" : "defender";
}

export function countCannonHits(rolls: number[]): number {
  return rolls.filter((r) => r >= CANNON_HIT_MIN).length;
}

/**
 * A volley's damage (#348): every hit goes where it was aimed. Chain shot
 * adds a hit aimed at the masts, grape shot one aimed at the crew, each only
 * to a volley that hits at all. The masts take hits only up to
 * `MAX_MAST_DAMAGE` (the target has `targetMastDamage` already); the rest
 * go to the hull.
 */
export function aimedDamage(hits: number, aim: VolleyAim, shooterUpgrades: readonly string[], targetMastDamage = 0): DamageState {
  const damage: DamageState = { hull: 0, crew: 0, masts: 0 };
  if (hits === 0) return damage;
  const landed = hits + (shotBonus(hits, aim, shooterUpgrades) ? 1 : 0);
  if (aim !== "masts") {
    damage[aim] = landed;
    return damage;
  }
  damage.masts = Math.min(landed, Math.max(0, MAX_MAST_DAMAGE - targetMastDamage));
  damage.hull = landed - damage.masts;
  return damage;
}

/** The shot that added a hit to a volley (#348): chain shot at the masts, grape shot at the crew, only when it hits; else null. */
export function shotBonus(hits: number, aim: VolleyAim, shooterUpgrades: readonly string[]): "chain_shot" | "grape_shot" | null {
  const shot = SHOT_FOR_AIM[aim];
  return hits > 0 && shot && shooterUpgrades.includes(shot) ? shot : null;
}

/** What a fleeing ship's mast damage takes off its roll (#348): `MAST_FLEE_PENALTY` a point, up to `MAX_MAST_DAMAGE` points. */
export function fleePenalty(mastDamage: number): number {
  return Math.min(mastDamage, MAX_MAST_DAMAGE) * MAST_FLEE_PENALTY;
}

/**
 * Where an NPC aims its volley (#348): the hull, for now. The full NPC aim
 * rule (the guns when the player is better armed) is #351's.
 */
export function npcAim(): VolleyAim {
  return "hull";
}

/** The shot that adds a hit to a volley with this aim. */
const SHOT_FOR_AIM: Record<VolleyAim, "chain_shot" | "grape_shot" | null> = { hull: null, masts: "chain_shot", crew: "grape_shot" };

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

/** The loot a sunk player ship leaves, named `id` (`nextLootId(G)`). */
export function createLootFromShip(ship: ShipState, id: string): FloatingLoot {
  return {
    id,
    hex: { ...ship.position },
    cargo: { ...ship.cargo },
    gold: Math.floor(ship.gold / 2),
  };
}

export function getValidAttackTargets(
  attacker: ShipState,
  ships: Record<string, ShipState>,
  attackerId: string,
  wrap: MapWrap,
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

    const distance = wrappedDistance(attacker.position, ship.position, wrap);
    if (distance > 0 && distance <= range) {
      // Check line of sight if cells are provided
      if (cells && !hasLineOfSight(attacker, ship, { cells, wrap })) {
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
  losMap?: LineOfSightMap
): boolean {
  if (distance <= 0) return false;
  if (npc.isDerelict) return false;
  if (!attacker.stats || attacker.stats.crew.current <= 0) return false;
  if (distance > getShipAttackRange(attacker)) return false;

  // Check line of sight if the map is provided
  if (losMap && !hasLineOfSight(attacker, npc, losMap)) {
    return false;
  }

  return true;
}

export function getValidNPCAttackTargets(
  attacker: ShipState,
  npcs: Record<string, NPCShip>,
  wrap: MapWrap,
  cells?: MapCell[]
): string[] {
  if (!attacker.stats || attacker.stats.crew.current <= 0) {
    return [];
  }

  const range = getShipAttackRange(attacker);
  const targets: string[] = [];

  for (const [id, npc] of Object.entries(npcs)) {
    if (npc.isDerelict) continue;

    const distance = wrappedDistance(attacker.position, npc.position, wrap);
    if (distance > 0 && distance <= range) {
      // Check line of sight if cells are provided
      if (cells && !hasLineOfSight(attacker, npc, { cells, wrap })) {
        continue;
      }
      targets.push(id);
    }
  }

  return targets;
}

/** The loot a sunk NPC leaves, named `id` (`nextLootId(G)`). */
export function createLootFromNPC(npc: NPCShip, id: string): FloatingLoot {
  return {
    id,
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
 * @param fleeerMastDamage - Fleeing ship's mast damage, `MAST_FLEE_PENALTY` off its total per point (#348)
 * @returns "escaped" if fleeer wins by 2+, "caught" otherwise
 */
export function resolveFleeAttempt(
  pursuerManeuv: number,
  pursuerRoll: number,
  fleeerManeuv: number,
  fleeerRoll: number,
  fleeerMastDamage = 0
): "escaped" | "caught" {
  const pursuerTotal = pursuerManeuv + pursuerRoll;
  // Mast damage from before the cap (#348) counts only up to it
  const fleeerTotal = fleeerManeuv + fleeerRoll - fleePenalty(fleeerMastDamage);
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
