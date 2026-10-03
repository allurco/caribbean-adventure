import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import {
  totalCargo,
  hasCargoSpace,
  canBuy,
  canSell,
  emptyCargo,
  createShipState,
  generatePortMarket,
  canBuyUpgrade,
  applyUpgrade,
  applyUpgradeEffect,
  canRepair,
  applyRepair,
  getShipBuyCost,
  canBuyShip,
  applyBuyShip,
  canJuryRig,
  applyJuryRig,
  PRICE_RANGES,
  STARTING_GOLD,
  DEFAULT_MAX_CARGO,
} from "./economy";
import { SHIP_SPECS, UPGRADES, REPAIR_COST_PER_POINT } from "./constants";
import { Caribbean } from "./Game";
import type { CaribbeanState } from "./Game";
import { GOOD_TYPES } from "./types";
import type { ShipState, PortMarket, MapCell } from "./types";
import { hex } from "./hex";
import type { MapSizeId } from "./mapConfig";

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    position: hex(0, 0),
    cargo: emptyCargo(),
    gold: STARTING_GOLD,
    maxCargo: DEFAULT_MAX_CARGO,
    upgrades: [],
    damage: { hull: 0, crew: 0, masts: 0 },
    bounties: { England: 0, France: 0, Spain: 0, Netherlands: 0 },
    score: 0,
    stashedGold: 0,
    scoutedShips: [],
    ...overrides,
  };
}

function makeMarket(inDemandGood: "Wood" | "Sugar" | "Rum" | "Spice" | null = null): PortMarket {
  return {
    prices: {
      Wood: { buy: 8, sell: 6 },
      Sugar: { buy: 20, sell: 15 },
      Rum: { buy: 30, sell: 23 },
      Spice: { buy: 45, sell: 35 },
    },
    inDemandGood,
  };
}

describe("emptyCargo", () => {
  it("returns zero for all goods", () => {
    const cargo = emptyCargo();
    for (const good of GOOD_TYPES) {
      expect(cargo[good]).toBe(0);
    }
  });
});

describe("totalCargo", () => {
  it("returns 0 for empty cargo", () => {
    expect(totalCargo(emptyCargo())).toBe(0);
  });

  it("sums all goods", () => {
    const cargo = { Wood: 1, Sugar: 2, Rum: 0, Spice: 1 };
    expect(totalCargo(cargo)).toBe(4);
  });
});

describe("hasCargoSpace", () => {
  it("returns true when under limit", () => {
    const ship = makeShip({ cargo: { Wood: 1, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(hasCargoSpace(ship, 1)).toBe(true);
  });

  it("returns true when exactly at limit after adding", () => {
    const ship = makeShip({ cargo: { Wood: 2, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(hasCargoSpace(ship, 1)).toBe(true);
  });

  it("returns false when over limit", () => {
    const ship = makeShip({ cargo: { Wood: 3, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(hasCargoSpace(ship, 1)).toBe(false);
  });

  it("returns false when adding would exceed limit", () => {
    const ship = makeShip({ cargo: { Wood: 2, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(hasCargoSpace(ship, 2)).toBe(false);
  });
});

describe("canBuy", () => {
  it("returns true for a valid purchase", () => {
    const ship = makeShip();
    const market = makeMarket();
    expect(canBuy(ship, "Wood", 1, market)).toBe(true);
  });

  it("returns false when insufficient gold", () => {
    const ship = makeShip({ gold: 5 });
    const market = makeMarket();
    expect(canBuy(ship, "Spice", 1, market)).toBe(false);
  });

  it("returns false when no cargo space", () => {
    const ship = makeShip({ cargo: { Wood: 3, Sugar: 0, Rum: 0, Spice: 0 } });
    const market = makeMarket();
    expect(canBuy(ship, "Wood", 1, market)).toBe(false);
  });

  it("returns false for amount <= 0", () => {
    const ship = makeShip();
    const market = makeMarket();
    expect(canBuy(ship, "Wood", 0, market)).toBe(false);
    expect(canBuy(ship, "Wood", -1, market)).toBe(false);
  });
});

describe("canSell", () => {
  it("returns true when player has the good", () => {
    const ship = makeShip({ cargo: { Wood: 2, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(canSell(ship, "Wood", 1)).toBe(true);
  });

  it("returns false when player has none of that good", () => {
    const ship = makeShip();
    expect(canSell(ship, "Wood", 1)).toBe(false);
  });

  it("returns false when amount exceeds held", () => {
    const ship = makeShip({ cargo: { Wood: 1, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(canSell(ship, "Wood", 2)).toBe(false);
  });

  it("returns false for amount <= 0", () => {
    const ship = makeShip({ cargo: { Wood: 1, Sugar: 0, Rum: 0, Spice: 0 } });
    expect(canSell(ship, "Wood", 0)).toBe(false);
    expect(canSell(ship, "Wood", -1)).toBe(false);
  });
});

describe("createShipState", () => {
  it("creates a ship at the given position with defaults", () => {
    const ship = createShipState(hex(3, -1));
    expect(ship.position).toEqual(hex(3, -1));
    expect(ship.gold).toBe(STARTING_GOLD);
    expect(ship.maxCargo).toBe(DEFAULT_MAX_CARGO);
    expect(totalCargo(ship.cargo)).toBe(0);
  });
});

describe("createShipState deep clones stats", () => {
  it("mutating ship stats does not change SHIP_SPECS", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    const origManeuverability = SHIP_SPECS.Sloop.maneuverability;
    ship.stats!.maneuverability = 99;
    expect(SHIP_SPECS.Sloop.maneuverability).toBe(origManeuverability);
  });

  it("two ships from same class have independent stats", () => {
    const a = createShipState(hex(0, 0), "Flute");
    const b = createShipState(hex(1, 0), "Flute");
    a.stats!.hull.current = 0;
    expect(b.stats!.hull.current).toBe(SHIP_SPECS.Flute.hull.current);
  });
});

describe("canBuyUpgrade", () => {
  it("returns true when affordable and not owned", () => {
    const ship = makeShip({ gold: 100, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    expect(canBuyUpgrade(ship, "chain_shot")).toBe(true);
  });

  it("returns false when already owned", () => {
    const ship = makeShip({ gold: 100, upgrades: ["chain_shot"], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    expect(canBuyUpgrade(ship, "chain_shot")).toBe(false);
  });

  it("returns false when too poor", () => {
    const ship = makeShip({ gold: 5, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    expect(canBuyUpgrade(ship, "hull_reinforcement")).toBe(false);
  });

  it("returns false for unknown upgrade id", () => {
    const ship = makeShip({ gold: 100, upgrades: [] });
    expect(canBuyUpgrade(ship, "nonexistent")).toBe(false);
  });
});

describe("applyUpgrade", () => {
  it("hull_reinforcement increases hull.max and deducts gold", () => {
    const ship = makeShip({ gold: 100, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    const hullMaxBefore = ship.stats!.hull.max;
    applyUpgrade(ship, "hull_reinforcement");
    expect(ship.stats!.hull.max).toBe(hullMaxBefore + 1);
    expect(ship.gold).toBe(100 - UPGRADES.hull_reinforcement.cost);
    expect(ship.upgrades).toContain("hull_reinforcement");
  });

  it("hammocks increases crew.max and crew.current", () => {
    const ship = makeShip({ gold: 100, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    const crewMaxBefore = ship.stats!.crew.max;
    const crewCurrentBefore = ship.stats!.crew.current;
    applyUpgrade(ship, "hammocks");
    expect(ship.stats!.crew.max).toBe(crewMaxBefore + 1);
    expect(ship.stats!.crew.current).toBe(crewCurrentBefore + 1);
    expect(ship.gold).toBe(100 - UPGRADES.hammocks.cost);
  });

  it("long_guns increases scouting", () => {
    const ship = makeShip({ gold: 100, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    const scoutingBefore = ship.stats!.scouting;
    applyUpgrade(ship, "long_guns");
    expect(ship.stats!.scouting).toBe(scoutingBefore + 1);
  });

  it("chain_shot stored but no stat change", () => {
    const ship = makeShip({ gold: 100, upgrades: [], stats: structuredClone(SHIP_SPECS.Sloop), shipClass: "Sloop" });
    const statsBefore = structuredClone(ship.stats!);
    applyUpgrade(ship, "chain_shot");
    expect(ship.upgrades).toContain("chain_shot");
    // Stats unchanged (only gold and upgrades differ)
    expect(ship.stats!.maneuverability).toBe(statsBefore.maneuverability);
    expect(ship.stats!.scouting).toBe(statsBefore.scouting);
    expect(ship.stats!.cannons).toBe(statsBefore.cannons);
    expect(ship.stats!.hull).toEqual(statsBefore.hull);
    expect(ship.stats!.crew).toEqual(statsBefore.crew);
    expect(ship.stats!.cargo).toBe(statsBefore.cargo);
  });
});

describe("canRepair", () => {
  it("returns false when no damage", () => {
    const ship = makeShip({ gold: 100, damage: { hull: 0, crew: 0, masts: 0 } });
    expect(canRepair(ship, "hull")).toBe(false);
  });

  it("returns true when damaged and has gold", () => {
    const ship = makeShip({ gold: 100, damage: { hull: 1, crew: 0, masts: 0 } });
    expect(canRepair(ship, "hull")).toBe(true);
  });

  it("returns false when too poor", () => {
    const ship = makeShip({ gold: 2, damage: { hull: 1, crew: 0, masts: 0 } });
    expect(canRepair(ship, "hull")).toBe(false);
  });
});

describe("applyRepair", () => {
  it("restores hull stat, deducts gold, reduces damage", () => {
    const ship = makeShip({
      gold: 100,
      stats: { ...structuredClone(SHIP_SPECS.Sloop), hull: { current: 1, max: 2 } },
      damage: { hull: 1, crew: 0, masts: 0 },
    });
    applyRepair(ship, "hull", 1);
    expect(ship.stats!.hull.current).toBe(2);
    expect(ship.damage.hull).toBe(0);
    expect(ship.gold).toBe(100 - REPAIR_COST_PER_POINT);
  });

  it("clamps to available damage", () => {
    const ship = makeShip({
      gold: 100,
      stats: { ...structuredClone(SHIP_SPECS.Sloop), hull: { current: 1, max: 2 } },
      damage: { hull: 1, crew: 0, masts: 0 },
    });
    applyRepair(ship, "hull", 5); // try to repair 5 but only 1 damaged
    expect(ship.damage.hull).toBe(0);
    expect(ship.stats!.hull.current).toBe(2);
    expect(ship.gold).toBe(100 - REPAIR_COST_PER_POINT); // only charged for 1
  });

  it("repairs masts (damage only, no stat)", () => {
    const ship = makeShip({
      gold: 100,
      damage: { hull: 0, crew: 0, masts: 2 },
    });
    applyRepair(ship, "masts", 2);
    expect(ship.damage.masts).toBe(0);
    expect(ship.gold).toBe(100 - 2 * REPAIR_COST_PER_POINT);
  });
});

describe("generatePortMarket", () => {
  /** Deterministic seeded PRNG for testing. */
  function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("includes all 4 goods", () => {
    const market = generatePortMarket(mulberry32(1));
    for (const good of GOOD_TYPES) {
      expect(market.prices[good]).toBeDefined();
    }
  });

  it("buy price is greater than sell price for every good", () => {
    const market = generatePortMarket(mulberry32(1));
    for (const good of GOOD_TYPES) {
      expect(market.prices[good].buy).toBeGreaterThan(market.prices[good].sell);
    }
  });

  it("prices are within configured ranges", () => {
    const market = generatePortMarket(mulberry32(1));
    for (const good of GOOD_TYPES) {
      const range = PRICE_RANGES[good];
      const { buy, sell } = market.prices[good];
      expect(buy).toBeGreaterThanOrEqual(range.minBuy);
      expect(buy).toBeLessThanOrEqual(range.maxBuy);
      expect(sell).toBe(buy - range.spread);
    }
  });

  it("is deterministic with the same seed", () => {
    const a = generatePortMarket(mulberry32(42));
    const b = generatePortMarket(mulberry32(42));
    expect(a).toEqual(b);
  });

  it("produces different markets with different seeds", () => {
    const a = generatePortMarket(mulberry32(1));
    const b = generatePortMarket(mulberry32(999));
    const allSame = GOOD_TYPES.every(
      (g) => a.prices[g].buy === b.prices[g].buy
    );
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getShipBuyCost
// ---------------------------------------------------------------------------

describe("getShipBuyCost", () => {
  it("Sloop→Frigate costs 40 - 10 = 30", () => {
    expect(getShipBuyCost("Sloop", "Frigate")).toBe(30);
  });

  it("Galleon→Sloop costs 20 - 30 = -10 (player gains gold)", () => {
    expect(getShipBuyCost("Galleon", "Sloop")).toBe(-10);
  });

  it("no current class means full price", () => {
    expect(getShipBuyCost(undefined, "Frigate")).toBe(40);
  });

  it("Flute→Galleon costs 60 - 15 = 45", () => {
    expect(getShipBuyCost("Flute", "Galleon")).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// canBuyShip
// ---------------------------------------------------------------------------

describe("canBuyShip", () => {
  it("returns true when affordable and cargo fits", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    expect(canBuyShip(ship, "Frigate")).toBe(true);
  });

  it("returns false for same class", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    expect(canBuyShip(ship, "Sloop")).toBe(false);
  });

  it("returns false when cargo won't fit", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Flute",
      stats: structuredClone(SHIP_SPECS.Flute),
      maxCargo: 4,
      cargo: { Wood: 2, Sugar: 1, Rum: 0, Spice: 0 }, // 3 total, Sloop only holds 2
    });
    expect(canBuyShip(ship, "Sloop")).toBe(false);
  });

  it("returns false when insufficient gold", () => {
    const ship = makeShip({
      gold: 5,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    expect(canBuyShip(ship, "Galleon")).toBe(false);
  });

  it("returns true when downgrading gives gold (cost negative)", () => {
    const ship = makeShip({
      gold: 0,
      shipClass: "Galleon",
      stats: structuredClone(SHIP_SPECS.Galleon),
      maxCargo: 6,
    });
    expect(canBuyShip(ship, "Sloop")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyBuyShip
// ---------------------------------------------------------------------------

describe("applyBuyShip", () => {
  it("changes class and deducts net cost", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    applyBuyShip(ship, "Frigate");
    expect(ship.shipClass).toBe("Frigate");
    expect(ship.gold).toBe(100 - 30); // 40 - floor(20*0.5) = 30
  });

  it("sets fresh stats from new class", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    applyBuyShip(ship, "Frigate");
    expect(ship.stats!.maneuverability).toBe(SHIP_SPECS.Frigate.maneuverability);
    expect(ship.stats!.cannons).toBe(SHIP_SPECS.Frigate.cannons);
    expect(ship.stats!.hull).toEqual(SHIP_SPECS.Frigate.hull);
    expect(ship.stats!.crew).toEqual(SHIP_SPECS.Frigate.crew);
    expect(ship.stats!.cargo).toBe(SHIP_SPECS.Frigate.cargo);
  });

  it("resets damage on purchase", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
      damage: { hull: 1, crew: 1, masts: 1 },
    });
    applyBuyShip(ship, "Frigate");
    expect(ship.damage).toEqual({ hull: 0, crew: 0, masts: 0 });
  });

  it("syncs maxCargo with new class", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
    });
    applyBuyShip(ship, "Galleon");
    expect(ship.maxCargo).toBe(SHIP_SPECS.Galleon.cargo);
  });

  it("re-applies upgrade effects to fresh stats", () => {
    const ship = makeShip({
      gold: 100,
      shipClass: "Sloop",
      stats: structuredClone(SHIP_SPECS.Sloop),
      maxCargo: 2,
      upgrades: ["long_guns", "hull_reinforcement"],
    });
    applyBuyShip(ship, "Frigate");
    // Frigate base scouting = 3, long_guns adds 1
    expect(ship.stats!.scouting).toBe(SHIP_SPECS.Frigate.scouting + 1);
    // Frigate base hull.max = 5, hull_reinforcement adds 1
    expect(ship.stats!.hull.max).toBe(SHIP_SPECS.Frigate.hull.max + 1);
    // Upgrades list should be preserved
    expect(ship.upgrades).toEqual(["long_guns", "hull_reinforcement"]);
  });

  it("allows downgrade with net gold gain", () => {
    const ship = makeShip({
      gold: 10,
      shipClass: "Galleon",
      stats: structuredClone(SHIP_SPECS.Galleon),
      maxCargo: 6,
    });
    applyBuyShip(ship, "Sloop");
    // Cost: 20 - floor(60*0.5) = 20 - 30 = -10 → gold increases by 10
    expect(ship.gold).toBe(10 - (-10));
    expect(ship.shipClass).toBe("Sloop");
  });
});

// ---------------------------------------------------------------------------
// applyUpgradeEffect
// ---------------------------------------------------------------------------

describe("applyUpgradeEffect", () => {
  it("applies scouting bonus without changing gold", () => {
    const ship = makeShip({
      gold: 100,
      stats: structuredClone(SHIP_SPECS.Sloop),
      shipClass: "Sloop",
    });
    applyUpgradeEffect(ship, "long_guns");
    expect(ship.stats!.scouting).toBe(SHIP_SPECS.Sloop.scouting + 1);
    expect(ship.gold).toBe(100); // gold unchanged
  });

  it("applies hull max bonus", () => {
    const ship = makeShip({
      gold: 100,
      stats: structuredClone(SHIP_SPECS.Sloop),
      shipClass: "Sloop",
    });
    applyUpgradeEffect(ship, "hull_reinforcement");
    expect(ship.stats!.hull.max).toBe(SHIP_SPECS.Sloop.hull.max + 1);
  });

  it("does nothing for no-effect upgrades", () => {
    const ship = makeShip({
      gold: 100,
      stats: structuredClone(SHIP_SPECS.Sloop),
      shipClass: "Sloop",
    });
    const statsBefore = structuredClone(ship.stats!);
    applyUpgradeEffect(ship, "chain_shot");
    expect(ship.stats!.maneuverability).toBe(statsBefore.maneuverability);
    expect(ship.stats!.scouting).toBe(statsBefore.scouting);
  });
});

// ---------------------------------------------------------------------------
// Trade move integration tests (boardgame.io Client)
// ---------------------------------------------------------------------------

const TEST_MARKET: PortMarket = {
  prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
  inDemandGood: null,
};

/** Set up a small map where player 0 starts at a port's docking hex. */
function setupAtPort() {
  // Port is at (0,0) island, ships dock at (1,0) water
  const cells: MapCell[] = [
    { hex: hex(0, 0), terrain: "island", elevation: 2, hasPort: true, market: TEST_MARKET, dockingHex: hex(1, 0) },
    { hex: hex(1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(-1, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(-1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, -1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(1, -1), terrain: "water", elevation: 0, hasPort: false },
  ];
  const TradeGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": createShipState(hex(1, 0)), // At docking hex
        "1": createShipState(hex(0, -1)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: TradeGame });
  client.start();
  return client;
}

/** Set up a small all-water map (no ports). */
function setupNoPort() {
  const cells: MapCell[] = [
    { hex: hex(0, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(-1, 1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(-1, 0), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(0, -1), terrain: "water", elevation: 0, hasPort: false },
    { hex: hex(1, -1), terrain: "water", elevation: 0, hasPort: false },
  ];
  const NoPortGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(1, -1)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: NoPortGame });
  client.start();
  return client;
}

describe("trade move", () => {
  describe("buying", () => {
    it("reduces gold by buy price and increases cargo", () => {
      const client = setupAtPort();
      client.moves.trade("Wood", 1, "BUY");
      const { G } = client.getState()!;
      expect(G.ships["0"].gold).toBe(STARTING_GOLD - TEST_MARKET.prices.Wood.buy);
      expect(G.ships["0"].cargo.Wood).toBe(1);
    });

    it("rejects when not at a port", () => {
      const client = setupNoPort();
      const goldBefore = client.getState()!.G.ships["0"].gold;
      client.moves.trade("Wood", 1, "BUY");
      const { G } = client.getState()!;
      expect(G.ships["0"].gold).toBe(goldBefore);
      expect(G.ships["0"].cargo.Wood).toBe(0);
    });

    it("rejects when insufficient gold", () => {
      const client = setupAtPort();
      // Spice costs 45, starting gold is 50. Buy 1, then try to buy another.
      client.moves.trade("Spice", 1, "BUY");
      const goldAfterFirst = client.getState()!.G.ships["0"].gold;
      expect(goldAfterFirst).toBe(STARTING_GOLD - 45); // 5 gold left
      client.moves.trade("Spice", 1, "BUY");
      const { G } = client.getState()!;
      expect(G.ships["0"].cargo.Spice).toBe(1); // second buy rejected
      expect(G.ships["0"].gold).toBe(5);
    });

    it("rejects when cargo is full", () => {
      const client = setupAtPort();
      // Buy 3 Wood (fills cargo to maxCargo=3)
      client.moves.trade("Wood", 1, "BUY");
      client.moves.trade("Wood", 1, "BUY");
      client.moves.trade("Wood", 1, "BUY");
      // Turn auto-ends after 3 moves; end P1's turn to get back to P0
      client.events.endTurn!();
      const { G } = client.getState()!;
      expect(G.ships["0"].cargo.Wood).toBe(3);
      // Now try to buy more — should be rejected
      client.moves.trade("Sugar", 1, "BUY");
      const after = client.getState()!.G;
      expect(after.ships["0"].cargo.Sugar).toBe(0);
    });

    it("rejects when amount is 0 or negative", () => {
      const client = setupAtPort();
      client.moves.trade("Wood", 0, "BUY");
      expect(client.getState()!.G.ships["0"].cargo.Wood).toBe(0);
      client.moves.trade("Wood", -1, "BUY");
      expect(client.getState()!.G.ships["0"].cargo.Wood).toBe(0);
    });
  });

  describe("selling", () => {
    it("increases gold by sell price and decreases cargo", () => {
      const client = setupAtPort();
      // First buy something
      client.moves.trade("Wood", 1, "BUY");
      const goldAfterBuy = client.getState()!.G.ships["0"].gold;
      // Then sell it
      client.moves.trade("Wood", 1, "SELL");
      const { G } = client.getState()!;
      expect(G.ships["0"].gold).toBe(goldAfterBuy + TEST_MARKET.prices.Wood.sell);
      expect(G.ships["0"].cargo.Wood).toBe(0);
    });

    it("rejects when not at a port", () => {
      const client = setupNoPort();
      client.moves.trade("Wood", 1, "SELL");
      const { G } = client.getState()!;
      expect(G.ships["0"].gold).toBe(STARTING_GOLD);
    });

    it("rejects when player has 0 of that good", () => {
      const client = setupAtPort();
      client.moves.trade("Rum", 1, "SELL");
      const { G } = client.getState()!;
      expect(G.ships["0"].gold).toBe(STARTING_GOLD);
    });

    it("rejects when amount exceeds held", () => {
      const client = setupAtPort();
      client.moves.trade("Wood", 1, "BUY");
      client.moves.trade("Wood", 2, "SELL"); // only have 1
      const { G } = client.getState()!;
      expect(G.ships["0"].cargo.Wood).toBe(1); // sell rejected
    });
  });

  describe("move accounting", () => {
    it("trade counts toward MOVES_PER_TURN", () => {
      const client = setupAtPort();
      client.moves.trade("Wood", 1, "BUY");
      client.moves.trade("Wood", 1, "BUY");
      client.moves.trade("Wood", 1, "BUY");
      // 3 trades should auto-end the turn
      const { ctx } = client.getState()!;
      expect(ctx.currentPlayer).toBe("1");
    });

    it("can mix moveShip and trade in same turn", () => {
      const client = setupAtPort();
      // Buy 1 wood (move 1)
      client.moves.trade("Wood", 1, "BUY");
      // Sell it back (move 2)
      client.moves.trade("Wood", 1, "SELL");
      // Move ship to adjacent water hex (move 3) - ship is at (1,0), move to (0,1)
      client.moves.moveShip(0, 1);
      const { G, ctx } = client.getState()!;
      expect(G.ships["0"].position).toEqual(hex(0, 1));
      expect(ctx.currentPlayer).toBe("1"); // turn auto-ended
    });
  });

  describe("in-demand goods Glory bonus", () => {
    function setupWithInDemand(inDemandGood: "Sugar" | "Wood") {
      const dockingHex = hex(1, 0);
      const portCell: MapCell = {
        hex: hex(0, 0),
        terrain: "island", elevation: 2,
        hasPort: true,
        market: makeMarket(inDemandGood),
        nation: "England",
        portName: "Test Port",
        dockingHex: dockingHex, // Ship must be at this hex to access port
      };
      const dockingCell: MapCell = {
        hex: dockingHex,
        terrain: "water", elevation: 0,
        hasPort: false,
      };
      const waterCell: MapCell = {
        hex: hex(0, 1),
        terrain: "water", elevation: 0,
        hasPort: false,
      };

      const testGame: Game<CaribbeanState> = {
        ...Caribbean,
        phases: {}, // Bypass phase system for testing
        setup: () => ({
          cells: [portCell, dockingCell, waterCell],
          ships: {
            "0": {
              ...makeShip({ position: dockingHex }),
              cargo: { Wood: 0, Sugar: 5, Rum: 0, Spice: 0 },
              gold: 100,
              score: 0,
            },
            "1": makeShip({ position: hex(2, 0) }),
          },
          captainDeck: [],
          draftHands: {},
          mapSize: "small" as MapSizeId,
          npcs: {},
          floatingLoot: [],
          npcIdCounter: 0,
          wrap: null,
        }),
      };

      const client = Client({ game: testGame, numPlayers: 2 });
      client.start();
      return client;
    }

    it("selling 2 of in-demand good gives NO Glory", () => {
      const client = setupWithInDemand("Sugar");
      const beforeState = client.getState()!;
      expect(beforeState.G.ships["0"].score).toBe(0);

      client.moves.trade("Sugar", 2, "SELL");

      const afterState = client.getState()!;
      expect(afterState.G.ships["0"].score).toBe(0); // No Glory for 2 units
      expect(afterState.G.ships["0"].cargo.Sugar).toBe(3); // 5 - 2 = 3
    });

    it("selling 3 of in-demand good gives +1 Glory", () => {
      const client = setupWithInDemand("Sugar");
      const beforeState = client.getState()!;
      expect(beforeState.G.ships["0"].score).toBe(0);

      client.moves.trade("Sugar", 3, "SELL");

      const afterState = client.getState()!;
      expect(afterState.G.ships["0"].score).toBe(1); // +1 Glory for 3 units
      expect(afterState.G.ships["0"].cargo.Sugar).toBe(2); // 5 - 3 = 2
    });

    it("selling 3 of NON-in-demand good gives NO Glory", () => {
      // Setup with Wood in demand, but we'll sell Sugar
      const dockingHex = hex(1, 0);
      const portCell: MapCell = {
        hex: hex(0, 0),
        terrain: "island", elevation: 2,
        hasPort: true,
        market: makeMarket("Wood"), // Wood is in demand, not Sugar
        nation: "England",
        portName: "Test Port",
        dockingHex: dockingHex,
      };
      const dockingCell: MapCell = {
        hex: dockingHex,
        terrain: "water", elevation: 0,
        hasPort: false,
      };

      const testGame: Game<CaribbeanState> = {
        ...Caribbean,
        phases: {}, // Bypass phase system for testing
        setup: () => ({
          cells: [portCell, dockingCell],
          ships: {
            "0": {
              ...makeShip({ position: dockingHex }),
              cargo: { Wood: 0, Sugar: 5, Rum: 0, Spice: 0 },
              gold: 100,
              score: 0,
            },
            "1": makeShip({ position: hex(2, 0) }),
          },
          captainDeck: [],
          draftHands: {},
          mapSize: "small" as MapSizeId,
          npcs: {},
          floatingLoot: [],
          npcIdCounter: 0,
          wrap: null,
        }),
      };

      const client = Client({ game: testGame, numPlayers: 2 });
      client.start();

      client.moves.trade("Sugar", 3, "SELL");

      const afterState = client.getState()!;
      expect(afterState.G.ships["0"].score).toBe(0); // No Glory since Sugar isn't in demand
      expect(afterState.G.ships["0"].cargo.Sugar).toBe(2); // 5 - 3 = 2
    });
  });
});

// ---------------------------------------------------------------------------
// Jury Rig (at-sea mast repair)
// ---------------------------------------------------------------------------

describe("canJuryRig", () => {
  it("returns true when ship has mast damage", () => {
    const ship = makeShip({ damage: { hull: 0, crew: 0, masts: 1 } });
    expect(canJuryRig(ship)).toBe(true);
  });

  it("returns true when ship has multiple mast damage", () => {
    const ship = makeShip({ damage: { hull: 0, crew: 0, masts: 3 } });
    expect(canJuryRig(ship)).toBe(true);
  });

  it("returns false when ship has no mast damage", () => {
    const ship = makeShip({ damage: { hull: 0, crew: 0, masts: 0 } });
    expect(canJuryRig(ship)).toBe(false);
  });

  it("returns false when ship has only hull/crew damage", () => {
    const ship = makeShip({ damage: { hull: 2, crew: 1, masts: 0 } });
    expect(canJuryRig(ship)).toBe(false);
  });
});

describe("applyJuryRig", () => {
  it("reduces mast damage by 1", () => {
    const ship = makeShip({ damage: { hull: 0, crew: 0, masts: 3 } });
    applyJuryRig(ship);
    expect(ship.damage.masts).toBe(2);
  });

  it("reduces mast damage from 1 to 0", () => {
    const ship = makeShip({ damage: { hull: 0, crew: 0, masts: 1 } });
    applyJuryRig(ship);
    expect(ship.damage.masts).toBe(0);
  });

  it("does not change other damage types", () => {
    const ship = makeShip({ damage: { hull: 2, crew: 1, masts: 2 } });
    applyJuryRig(ship);
    expect(ship.damage.hull).toBe(2);
    expect(ship.damage.crew).toBe(1);
    expect(ship.damage.masts).toBe(1);
  });

  it("does nothing when mast damage is 0", () => {
    const ship = makeShip({ damage: { hull: 2, crew: 1, masts: 0 } });
    applyJuryRig(ship);
    expect(ship.damage.masts).toBe(0);
  });

  it("is free (does not cost gold)", () => {
    const ship = makeShip({ gold: 10, damage: { hull: 0, crew: 0, masts: 2 } });
    applyJuryRig(ship);
    expect(ship.gold).toBe(10);
  });
});
