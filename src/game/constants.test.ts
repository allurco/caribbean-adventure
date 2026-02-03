import { describe, it, expect } from "vitest";
import { SHIP_SPECS, UPGRADES, REPAIR_COST_PER_POINT, SHIP_COSTS } from "./constants";
import { SHIP_CLASSES, STARTER_SHIP_CLASSES } from "./types";

describe("SHIP_SPECS", () => {
  it("has an entry for every ship class", () => {
    for (const cls of SHIP_CLASSES) {
      expect(SHIP_SPECS[cls]).toBeDefined();
    }
  });

  it("Sloop stats match spec", () => {
    const s = SHIP_SPECS.Sloop;
    expect(s.maneuverability).toBe(4);
    expect(s.scouting).toBe(3);
    expect(s.cannons).toBe(2);
    expect(s.crew).toEqual({ current: 2, max: 2 });
    expect(s.hull).toEqual({ current: 2, max: 2 });
    expect(s.cargo).toBe(2);
  });

  it("Flute stats match spec", () => {
    const f = SHIP_SPECS.Flute;
    expect(f.maneuverability).toBe(2);
    expect(f.scouting).toBe(2);
    expect(f.cannons).toBe(2);
    expect(f.crew).toEqual({ current: 3, max: 3 });
    expect(f.hull).toEqual({ current: 4, max: 4 });
    expect(f.cargo).toBe(4);
  });

  it("Frigate stats match spec", () => {
    const fr = SHIP_SPECS.Frigate;
    expect(fr.maneuverability).toBe(3);
    expect(fr.scouting).toBe(3);
    expect(fr.cannons).toBe(4);
    expect(fr.crew).toEqual({ current: 4, max: 4 });
    expect(fr.hull).toEqual({ current: 5, max: 5 });
    expect(fr.cargo).toBe(3);
  });

  it("Galleon stats match spec", () => {
    const g = SHIP_SPECS.Galleon;
    expect(g.maneuverability).toBe(1);
    expect(g.scouting).toBe(2);
    expect(g.cannons).toBe(3);
    expect(g.crew).toEqual({ current: 5, max: 5 });
    expect(g.hull).toEqual({ current: 7, max: 7 });
    expect(g.cargo).toBe(6);
  });

  it("every spec has current === max for crew and hull", () => {
    for (const cls of SHIP_CLASSES) {
      const spec = SHIP_SPECS[cls];
      expect(spec.crew.current).toBe(spec.crew.max);
      expect(spec.hull.current).toBe(spec.hull.max);
    }
  });

  it("every spec has positive values", () => {
    for (const cls of SHIP_CLASSES) {
      const spec = SHIP_SPECS[cls];
      expect(spec.maneuverability).toBeGreaterThan(0);
      expect(spec.scouting).toBeGreaterThan(0);
      expect(spec.cannons).toBeGreaterThan(0);
      expect(spec.crew.max).toBeGreaterThan(0);
      expect(spec.hull.max).toBeGreaterThan(0);
      expect(spec.cargo).toBeGreaterThan(0);
    }
  });
});

describe("UPGRADES", () => {
  it("every entry has id matching its key", () => {
    for (const [key, upgrade] of Object.entries(UPGRADES)) {
      expect(upgrade.id).toBe(key);
    }
  });

  it("every entry has name, cost > 0, and description", () => {
    for (const upgrade of Object.values(UPGRADES)) {
      expect(upgrade.name).toBeTruthy();
      expect(upgrade.cost).toBeGreaterThan(0);
      expect(upgrade.description).toBeTruthy();
    }
  });

  it("hull_reinforcement costs 20 with hullMax effect", () => {
    expect(UPGRADES.hull_reinforcement.cost).toBe(20);
    expect(UPGRADES.hull_reinforcement.effect.hullMax).toBe(1);
  });

  it("hammocks costs 10 with crewMax effect", () => {
    expect(UPGRADES.hammocks.cost).toBe(10);
    expect(UPGRADES.hammocks.effect.crewMax).toBe(1);
  });

  it("long_guns costs 15 with scouting effect", () => {
    expect(UPGRADES.long_guns.cost).toBe(15);
    expect(UPGRADES.long_guns.effect.scouting).toBe(1);
  });

  it("chain_shot and grape_shot have empty effects", () => {
    expect(UPGRADES.chain_shot.effect).toEqual({});
    expect(UPGRADES.grape_shot.effect).toEqual({});
  });
});

describe("REPAIR_COST_PER_POINT", () => {
  it("equals 5", () => {
    expect(REPAIR_COST_PER_POINT).toBe(5);
  });
});

describe("SHIP_COSTS", () => {
  it("has an entry for every ship class", () => {
    for (const cls of SHIP_CLASSES) {
      expect(SHIP_COSTS[cls]).toBeDefined();
    }
  });

  it("Sloop costs 20", () => {
    expect(SHIP_COSTS.Sloop).toBe(20);
  });

  it("Flute costs 30", () => {
    expect(SHIP_COSTS.Flute).toBe(30);
  });

  it("Frigate costs 40", () => {
    expect(SHIP_COSTS.Frigate).toBe(40);
  });

  it("Galleon costs 60", () => {
    expect(SHIP_COSTS.Galleon).toBe(60);
  });
});

describe("STARTER_SHIP_CLASSES", () => {
  it("is a subset of SHIP_CLASSES", () => {
    for (const cls of STARTER_SHIP_CLASSES) {
      expect((SHIP_CLASSES as readonly string[]).includes(cls)).toBe(true);
    }
  });

  it("contains only Sloop and Flute", () => {
    expect(STARTER_SHIP_CLASSES).toEqual(["Sloop", "Flute"]);
  });
});
