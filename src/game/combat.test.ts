import { describe, it, expect } from "vitest";
import { hex, createWrap, offsetToHex, NO_WRAP } from "./hex";
import type { ShipState } from "./types";
import { VOLLEY_AIMS } from "./types";
import { createShipState } from "./economy";
import {
  BASE_ATTACK_RANGE,
  LONG_GUNS_BONUS_RANGE,
  CANNON_HIT_MIN,
  getShipAttackRange,
  canAttack,
  canReturnFire,
  resolveSeamanship,
  countCannonHits,
  aimedDamage,
  MAST_FLEE_PENALTY,
  applyDamage,
  isSunk,
  isDerelict,
  createLootFromShip,
  getValidAttackTargets,
  getValidNPCAttackTargets,
  resolveFleeAttempt,
  shouldNPCFlee,
  getEffectiveCannons,
} from "./combat";
import { createNPCShip } from "./npcManager";

function createShipWithStats(
  position: { q: number; r: number },
  overrides: Partial<ShipState> = {}
): ShipState {
  const ship = createShipState(hex(position.q, position.r), "Sloop");
  return { ...ship, ...overrides };
}

describe("combat constants", () => {
  it("BASE_ATTACK_RANGE is 1", () => {
    expect(BASE_ATTACK_RANGE).toBe(1);
  });

  it("LONG_GUNS_BONUS_RANGE is 1", () => {
    expect(LONG_GUNS_BONUS_RANGE).toBe(1);
  });

  it("CANNON_HIT_MIN is 5 (hits on 5-6)", () => {
    expect(CANNON_HIT_MIN).toBe(5);
  });
});

describe("getShipAttackRange", () => {
  it("returns 1 without long_guns upgrade", () => {
    const ship = createShipWithStats({ q: 0, r: 0 }, { upgrades: [] });
    expect(getShipAttackRange(ship)).toBe(1);
  });

  it("returns 2 with long_guns upgrade", () => {
    const ship = createShipWithStats({ q: 0, r: 0 }, { upgrades: ["long_guns"] });
    expect(getShipAttackRange(ship)).toBe(2);
  });

  it("returns 1 with other upgrades but not long_guns", () => {
    const ship = createShipWithStats({ q: 0, r: 0 }, { upgrades: ["chain_shot", "grape_shot"] });
    expect(getShipAttackRange(ship)).toBe(1);
  });
});

describe("canAttack", () => {
  it("returns true when within range", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const defender = createShipWithStats({ q: 1, r: 0 });
    expect(canAttack(attacker, defender, 1)).toBe(true);
  });

  it("returns false when beyond range", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const defender = createShipWithStats({ q: 2, r: 0 });
    expect(canAttack(attacker, defender, 2)).toBe(false);
  });

  it("returns true at range 2 with long_guns", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 }, { upgrades: ["long_guns"] });
    const defender = createShipWithStats({ q: 2, r: 0 });
    expect(canAttack(attacker, defender, 2)).toBe(true);
  });

  it("returns false when target is derelict", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const defender = createShipWithStats({ q: 1, r: 0 }, { isDerelict: true });
    expect(canAttack(attacker, defender, 1)).toBe(false);
  });

  it("returns false when attacker has 0 crew", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    attacker.stats!.crew.current = 0;
    const defender = createShipWithStats({ q: 1, r: 0 });
    expect(canAttack(attacker, defender, 1)).toBe(false);
  });

  it("returns false at distance 0", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const defender = createShipWithStats({ q: 0, r: 0 });
    expect(canAttack(attacker, defender, 0)).toBe(false);
  });
});

describe("canReturnFire", () => {
  it("returns true when attacker within defender range", () => {
    const defender = createShipWithStats({ q: 0, r: 0 });
    expect(canReturnFire(defender, 1)).toBe(true);
  });

  it("returns false at range 2 without long_guns", () => {
    const defender = createShipWithStats({ q: 0, r: 0 });
    expect(canReturnFire(defender, 2)).toBe(false);
  });

  it("returns true at range 2 with long_guns", () => {
    const defender = createShipWithStats({ q: 0, r: 0 }, { upgrades: ["long_guns"] });
    expect(canReturnFire(defender, 2)).toBe(true);
  });

  it("returns false when defender is derelict", () => {
    const defender = createShipWithStats({ q: 0, r: 0 }, { isDerelict: true });
    expect(canReturnFire(defender, 1)).toBe(false);
  });

  it("returns false when defender has 0 crew", () => {
    const defender = createShipWithStats({ q: 0, r: 0 });
    defender.stats!.crew.current = 0;
    expect(canReturnFire(defender, 1)).toBe(false);
  });

  it("returns false when the defender is sunk (#346: a ship the first volley sank never answers)", () => {
    const defender = createShipWithStats({ q: 0, r: 0 });
    defender.stats!.hull.current = 0;
    expect(canReturnFire(defender, 1)).toBe(false);
  });

  it("returns false when the defender has no guns (#346)", () => {
    const defender = createShipWithStats({ q: 0, r: 0 });
    defender.stats!.cannons = 0;
    expect(canReturnFire(defender, 1)).toBe(false);
  });
});

describe("resolveSeamanship", () => {
  it("higher total wins", () => {
    // attacker: maneuverability 3 + roll 4 = 7
    // defender: maneuverability 2 + roll 3 = 5
    expect(resolveSeamanship(3, 4, 2, 3)).toBe("attacker");
  });

  it("defender wins with higher total", () => {
    // attacker: 2 + 1 = 3
    // defender: 4 + 5 = 9
    expect(resolveSeamanship(2, 1, 4, 5)).toBe("defender");
  });

  it("defender wins ties (#347)", () => {
    // Both have same total: 3 + 3 = 4 + 2
    expect(resolveSeamanship(3, 3, 4, 2)).toBe("defender");
  });

  it("over every roll and manoeuvrability, the attacker wins only on a strictly higher total (#347)", () => {
    for (let attackerManeuv = 1; attackerManeuv <= 4; attackerManeuv++) {
      for (let defenderManeuv = 1; defenderManeuv <= 4; defenderManeuv++) {
        for (let attackerRoll = 1; attackerRoll <= 6; attackerRoll++) {
          for (let defenderRoll = 1; defenderRoll <= 6; defenderRoll++) {
            const winner = resolveSeamanship(attackerManeuv, attackerRoll, defenderManeuv, defenderRoll);
            const attackerAhead = attackerManeuv + attackerRoll > defenderManeuv + defenderRoll;
            expect(winner).toBe(attackerAhead ? "attacker" : "defender");
          }
        }
      }
    }
  });
});

describe("countCannonHits", () => {
  it("counts 5s and 6s as hits", () => {
    expect(countCannonHits([5, 6])).toBe(2);
  });

  it("returns 0 for all misses", () => {
    expect(countCannonHits([1, 2, 3, 4])).toBe(0);
  });

  it("counts mixed rolls correctly", () => {
    expect(countCannonHits([1, 5, 3, 6, 2, 5])).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(countCannonHits([])).toBe(0);
  });
});

describe("aimedDamage", () => {
  it("puts every hit on the hull when aimed at the hull, as before aiming", () => {
    expect(aimedDamage(3, "hull", [])).toEqual({ hull: 3, crew: 0, masts: 0 });
  });

  it("puts every hit on the masts when aimed at the masts", () => {
    expect(aimedDamage(2, "masts", [])).toEqual({ hull: 0, crew: 0, masts: 2 });
  });

  it("puts every hit on the crew when aimed at the crew", () => {
    expect(aimedDamage(4, "crew", [])).toEqual({ hull: 0, crew: 4, masts: 0 });
  });

  it("chain shot adds one hit only when aimed at the masts", () => {
    expect(aimedDamage(2, "masts", ["chain_shot"])).toEqual({ hull: 0, crew: 0, masts: 3 });
    expect(aimedDamage(2, "hull", ["chain_shot"])).toEqual({ hull: 2, crew: 0, masts: 0 });
    expect(aimedDamage(2, "crew", ["chain_shot"])).toEqual({ hull: 0, crew: 2, masts: 0 });
  });

  it("grape shot adds one hit only when aimed at the crew", () => {
    expect(aimedDamage(2, "crew", ["grape_shot"])).toEqual({ hull: 0, crew: 3, masts: 0 });
    expect(aimedDamage(2, "hull", ["grape_shot"])).toEqual({ hull: 2, crew: 0, masts: 0 });
    expect(aimedDamage(2, "masts", ["grape_shot"])).toEqual({ hull: 0, crew: 0, masts: 2 });
  });

  it("a volley with no hits does no damage, shot upgrades or not", () => {
    for (const aim of VOLLEY_AIMS) {
      expect(aimedDamage(0, aim, ["chain_shot", "grape_shot"])).toEqual({ hull: 0, crew: 0, masts: 0 });
    }
  });

  it("over every volley a broadside can roll, damages only what it was aimed at", () => {
    const loadouts = [[], ["chain_shot"], ["grape_shot"], ["chain_shot", "grape_shot"], ["long_guns"]];
    for (let hits = 0; hits <= 20; hits++) {
      for (const aim of VOLLEY_AIMS) {
        for (const upgrades of loadouts) {
          const damage = aimedDamage(hits, aim, upgrades);
          for (const other of VOLLEY_AIMS.filter((a) => a !== aim)) expect(damage[other]).toBe(0);
          expect(damage[aim]).toBeGreaterThanOrEqual(hits);
          expect(damage[aim]).toBeLessThanOrEqual(hits === 0 ? 0 : hits + 1);
        }
      }
    }
  });
});

describe("applyDamage", () => {
  it("reduces stats.hull.current", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    const initialHull = ship.stats!.hull.current;
    applyDamage(ship, { hull: 1, crew: 0, masts: 0 });
    expect(ship.stats!.hull.current).toBe(initialHull - 1);
  });

  it("reduces stats.crew.current", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    const initialCrew = ship.stats!.crew.current;
    applyDamage(ship, { hull: 0, crew: 1, masts: 0 });
    expect(ship.stats!.crew.current).toBe(initialCrew - 1);
  });

  it("increases damage counters", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    applyDamage(ship, { hull: 2, crew: 1, masts: 1 });
    expect(ship.damage.hull).toBe(2);
    expect(ship.damage.crew).toBe(1);
    expect(ship.damage.masts).toBe(1);
  });

  it("clamps hull to 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    applyDamage(ship, { hull: 100, crew: 0, masts: 0 });
    expect(ship.stats!.hull.current).toBe(0);
  });

  it("clamps crew to 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    applyDamage(ship, { hull: 0, crew: 100, masts: 0 });
    expect(ship.stats!.crew.current).toBe(0);
  });

  it("accumulates damage counters across multiple applications", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    applyDamage(ship, { hull: 1, crew: 0, masts: 0 });
    applyDamage(ship, { hull: 1, crew: 1, masts: 1 });
    expect(ship.damage.hull).toBe(2);
    expect(ship.damage.crew).toBe(1);
    expect(ship.damage.masts).toBe(1);
  });
});

describe("isSunk", () => {
  it("returns true when hull <= 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.stats!.hull.current = 0;
    expect(isSunk(ship)).toBe(true);
  });

  it("returns false when hull > 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    expect(isSunk(ship)).toBe(false);
  });
});

describe("isDerelict", () => {
  it("returns true when crew <= 0 and hull > 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.stats!.crew.current = 0;
    expect(isDerelict(ship)).toBe(true);
  });

  it("returns false when crew > 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    expect(isDerelict(ship)).toBe(false);
  });

  it("returns false when hull <= 0 (sunk, not derelict)", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.stats!.crew.current = 0;
    ship.stats!.hull.current = 0;
    expect(isDerelict(ship)).toBe(false);
  });
});

describe("createLootFromShip", () => {
  it("copies cargo", () => {
    const ship = createShipWithStats({ q: 2, r: 3 });
    ship.cargo = { Wood: 1, Sugar: 2, Rum: 0, Spice: 3 };
    const loot = createLootFromShip(ship, "loot-1");
    expect(loot.cargo).toEqual({ Wood: 1, Sugar: 2, Rum: 0, Spice: 3 });
  });

  it("halves gold (rounded down)", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.gold = 51;
    const loot = createLootFromShip(ship, "loot-1");
    expect(loot.gold).toBe(25);
  });

  it("has ship's hex position", () => {
    const ship = createShipWithStats({ q: 4, r: -2 });
    const loot = createLootFromShip(ship, "loot-1");
    expect(loot.hex.q).toBe(4);
    expect(loot.hex.r).toBe(-2);
  });

  it("is named by the id it is given (the game's counter, #320)", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    expect(createLootFromShip(ship, "loot-7").id).toBe("loot-7");
  });
});

describe("getValidAttackTargets", () => {
  it("returns enemies within range", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 1, r: 0 }), // distance 1
      "2": createShipWithStats({ q: 2, r: 0 }), // distance 2
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).toContain("1");
    expect(targets).not.toContain("2");
  });

  it("includes range 2 targets with long_guns", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 }, { upgrades: ["long_guns"] });
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 1, r: 0 }),
      "2": createShipWithStats({ q: 2, r: 0 }),
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).toContain("1");
    expect(targets).toContain("2");
  });

  it("excludes self", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 1, r: 0 }),
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).not.toContain("0");
  });

  it("excludes derelicts", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 1, r: 0 }, { isDerelict: true }),
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).not.toContain("1");
  });

  it("excludes ships beyond max range", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 3, r: 0 }), // distance 3
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).toHaveLength(0);
  });

  it("returns empty when attacker has no crew", () => {
    const attacker = createShipWithStats({ q: 0, r: 0 });
    attacker.stats!.crew.current = 0;
    const ships: Record<string, ShipState> = {
      "0": attacker,
      "1": createShipWithStats({ q: 1, r: 0 }),
    };
    const targets = getValidAttackTargets(attacker, ships, "0", NO_WRAP);
    expect(targets).toHaveLength(0);
  });
});

describe("attack targets across the east–west seam", () => {
  const wrap = createWrap(8);
  const at = (col: number, row: number, upgrades: string[] = []) =>
    createShipWithStats(offsetToHex(col, row), { upgrades });

  it("finds a player ship just across the seam", () => {
    const attacker = at(7, 2);
    const ships: Record<string, ShipState> = { "0": attacker, "1": at(0, 2) };
    expect(getValidAttackTargets(attacker, ships, "0", wrap)).toEqual(["1"]);
    expect(getValidAttackTargets(attacker, ships, "0", NO_WRAP)).toEqual([]);
  });

  it("finds an NPC two hexes across the seam with long guns", () => {
    const attacker = at(6, 2, ["long_guns"]);
    const npc = createNPCShip("npc-1", offsetToHex(0, 2), offsetToHex(4, 0), "Spain", "Flute", () => 0.5);
    expect(getValidNPCAttackTargets(attacker, { "npc-1": npc }, wrap)).toEqual(["npc-1"]);
  });
});

describe("resolveFleeAttempt", () => {
  it("each point of the fleeing ship's mast damage counts against its flight", () => {
    expect(MAST_FLEE_PENALTY).toBe(1);
    // Pursuer 2 + 3 = 5; fleeer 4 + 4 = 8 would escape by 3, but 2 mast damage brings it to 6: caught
    expect(resolveFleeAttempt(2, 3, 4, 4)).toBe("escaped");
    expect(resolveFleeAttempt(2, 3, 4, 4, 1)).toBe("escaped");
    expect(resolveFleeAttempt(2, 3, 4, 4, 2)).toBe("caught");
  });

  it("returns 'escaped' when fleeer wins by 2+ (clean escape)", () => {
    // Fleeer has high maneuverability + good roll
    // Pursuer: maneuv 2, roll 3 = 5
    // Fleeer: maneuv 4, roll 4 = 8 (wins by 3)
    const result = resolveFleeAttempt(2, 3, 4, 4);
    expect(result).toBe("escaped");
  });

  it("returns 'escaped' when fleeer wins by exactly 2", () => {
    // Pursuer: maneuv 2, roll 3 = 5
    // Fleeer: maneuv 4, roll 3 = 7 (wins by 2)
    const result = resolveFleeAttempt(2, 3, 4, 3);
    expect(result).toBe("escaped");
  });

  it("returns 'caught' when fleeer wins by only 1", () => {
    // Pursuer: maneuv 2, roll 3 = 5
    // Fleeer: maneuv 3, roll 3 = 6 (wins by 1)
    const result = resolveFleeAttempt(2, 3, 3, 3);
    expect(result).toBe("caught");
  });

  it("returns 'caught' when fleeer ties", () => {
    // Pursuer: maneuv 3, roll 3 = 6
    // Fleeer: maneuv 3, roll 3 = 6 (tie)
    const result = resolveFleeAttempt(3, 3, 3, 3);
    expect(result).toBe("caught");
  });

  it("returns 'caught' when fleeer loses", () => {
    // Pursuer: maneuv 4, roll 5 = 9
    // Fleeer: maneuv 2, roll 3 = 5 (loses)
    const result = resolveFleeAttempt(4, 5, 2, 3);
    expect(result).toBe("caught");
  });

  it("high maneuverability ship can flee easily", () => {
    // Sloop (maneuv 4) fleeing from Galleon (maneuv 1)
    // With equal rolls, Sloop should escape: 4+3=7 vs 1+3=4, wins by 3
    const result = resolveFleeAttempt(1, 3, 4, 3);
    expect(result).toBe("escaped");
  });
});

describe("shouldNPCFlee", () => {
  it("returns true when NPC hull < 2", () => {
    const npcCannons = 4;
    const npcHull = 1;
    const enemyCannons = 2;
    expect(shouldNPCFlee(npcHull, npcCannons, enemyCannons)).toBe(true);
  });

  it("returns true when NPC cannons < enemy cannons", () => {
    const npcCannons = 2;
    const npcHull = 5;
    const enemyCannons = 4;
    expect(shouldNPCFlee(npcHull, npcCannons, enemyCannons)).toBe(true);
  });

  it("returns false when NPC is healthy and has equal/more cannons", () => {
    const npcCannons = 4;
    const npcHull = 5;
    const enemyCannons = 3;
    expect(shouldNPCFlee(npcHull, npcCannons, enemyCannons)).toBe(false);
  });

  it("returns false when NPC hull = 2 and cannons equal", () => {
    const npcCannons = 3;
    const npcHull = 2;
    const enemyCannons = 3;
    expect(shouldNPCFlee(npcHull, npcCannons, enemyCannons)).toBe(false);
  });
});

describe("getEffectiveCannons", () => {
  it("returns full cannons when crew >= cannons", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    // Sloop has 2 cannons and 2 crew
    expect(getEffectiveCannons(ship)).toBe(2);
  });

  it("returns current crew when crew < cannons", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    // Sloop has 2 cannons but reduce crew to 1
    ship.stats!.crew.current = 1;
    expect(getEffectiveCannons(ship)).toBe(1);
  });

  it("returns 0 when crew is 0", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.stats!.crew.current = 0;
    expect(getEffectiveCannons(ship)).toBe(0);
  });

  it("returns 0 when ship has no stats", () => {
    const ship = createShipWithStats({ q: 0, r: 0 });
    ship.stats = undefined;
    expect(getEffectiveCannons(ship)).toBe(0);
  });

  it("limits Frigate cannons (4) to current crew when reduced", () => {
    // Frigate has 4 cannons and 4 crew
    const ship = createShipState(hex(0, 0), "Frigate");
    expect(getEffectiveCannons(ship)).toBe(4);

    // Reduce crew to 2 - now only 2 effective cannons
    ship.stats!.crew.current = 2;
    expect(getEffectiveCannons(ship)).toBe(2);
  });
});
