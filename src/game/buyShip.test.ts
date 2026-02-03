import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean } from "./Game";
import type { CaribbeanState } from "./Game";
import { createShipState } from "./economy";
import { SHIP_SPECS } from "./constants";
import type { MapCell, PortMarket } from "./types";
import { hex } from "./hex";
import type { MapSizeId } from "./mapConfig";

const TEST_MARKET: PortMarket = {
  prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
};

function setupAtShipyard(overrides?: {
  gold?: number;
  shipClass?: "Sloop" | "Flute" | "Frigate" | "Galleon";
  cargo?: Record<string, number>;
  upgrades?: string[];
  damage?: { hull: number; crew: number; masts: number };
}) {
  const shipClass = overrides?.shipClass ?? "Sloop";
  const ship = createShipState(hex(0, 0), shipClass);
  if (overrides?.gold !== undefined) ship.gold = overrides.gold;
  if (overrides?.cargo) {
    ship.cargo = overrides.cargo as Record<"Wood" | "Sugar" | "Rum" | "Spice", number>;
  }
  if (overrides?.upgrades) ship.upgrades = overrides.upgrades;
  if (overrides?.damage) ship.damage = overrides.damage;

  const cells: MapCell[] = [
    {
      hex: hex(0, 0),
      terrain: "island",
      hasPort: true,
      hasShipyard: true,
      market: TEST_MARKET,
      nation: "England",
    },
    { hex: hex(1, 0), terrain: "water", hasPort: false },
    {
      hex: hex(0, 1),
      terrain: "island",
      hasPort: true,
      hasShipyard: false,
      market: TEST_MARKET,
      nation: "France",
    },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 0), terrain: "water", hasPort: false },
    { hex: hex(0, -1), terrain: "water", hasPort: false },
    { hex: hex(1, -1), terrain: "water", hasPort: false },
  ];

  const BuyShipGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": ship,
        "1": createShipState(hex(1, -1), "Flute"),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
    }),
  };

  const client = Client<CaribbeanState>({ game: BuyShipGame });
  client.start();
  return client;
}

describe("buyShip move", () => {
  it("buys Frigate: changes class and deducts net cost", () => {
    const client = setupAtShipyard({ gold: 100 });
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    const ship = G.ships["0"];
    expect(ship.shipClass).toBe("Frigate");
    // Net cost: 40 - floor(20 * 0.5) = 30
    expect(ship.gold).toBe(100 - 30);
  });

  it("buys Galleon: changes class and deducts net cost", () => {
    const client = setupAtShipyard({ gold: 100 });
    client.moves.buyShip("Galleon");
    const { G } = client.getState()!;
    const ship = G.ships["0"];
    expect(ship.shipClass).toBe("Galleon");
    // Net cost: 60 - floor(20 * 0.5) = 50
    expect(ship.gold).toBe(100 - 50);
  });

  it("sets fresh stats from new class", () => {
    const client = setupAtShipyard({ gold: 100 });
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    const stats = G.ships["0"].stats!;
    expect(stats.maneuverability).toBe(SHIP_SPECS.Frigate.maneuverability);
    expect(stats.cannons).toBe(SHIP_SPECS.Frigate.cannons);
    expect(stats.hull).toEqual(SHIP_SPECS.Frigate.hull);
  });

  it("rejects at regular port (no shipyard)", () => {
    // Player at hex(0,1) which has port but no shipyard
    const cells: MapCell[] = [
      {
        hex: hex(0, 1),
        terrain: "island",
        hasPort: true,
        hasShipyard: false,
        market: TEST_MARKET,
        nation: "France",
      },
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 1), terrain: "water", hasPort: false },
      { hex: hex(0, 2), terrain: "water", hasPort: false },
      { hex: hex(-1, 2), terrain: "water", hasPort: false },
    ];
    const ship = createShipState(hex(0, 1), "Sloop");
    ship.gold = 100;
    const NoShipyardGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": ship,
          "1": createShipState(hex(0, 0), "Flute"),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      }),
    };
    const client = Client<CaribbeanState>({ game: NoShipyardGame });
    client.start();
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop"); // unchanged
  });

  it("rejects at water (no port)", () => {
    // Player starts at water hex
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", hasPort: false },
      { hex: hex(1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, -1), terrain: "water", hasPort: false },
      { hex: hex(1, -1), terrain: "water", hasPort: false },
    ];
    const ship = createShipState(hex(0, 0), "Sloop");
    ship.gold = 100;
    const WaterGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": ship,
          "1": createShipState(hex(1, -1), "Flute"),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      }),
    };
    const client = Client<CaribbeanState>({ game: WaterGame });
    client.start();
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop"); // unchanged
  });

  it("rejects same ship class", () => {
    const client = setupAtShipyard({ gold: 100 });
    client.moves.buyShip("Sloop");
    const { G } = client.getState()!;
    expect(G.ships["0"].gold).toBe(100); // unchanged
  });

  it("rejects when cargo won't fit", () => {
    const client = setupAtShipyard({
      gold: 100,
      shipClass: "Flute",
      cargo: { Wood: 2, Sugar: 1, Rum: 0, Spice: 0 }, // 3 total > Sloop's 2
    });
    client.moves.buyShip("Sloop");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Flute"); // unchanged
  });

  it("rejects when insufficient gold", () => {
    const client = setupAtShipyard({ gold: 5 });
    client.moves.buyShip("Galleon");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop"); // unchanged
    expect(G.ships["0"].gold).toBe(5);
  });

  it("transfers upgrades and re-applies effects", () => {
    const client = setupAtShipyard({
      gold: 100,
      upgrades: ["long_guns", "hull_reinforcement"],
    });
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    const ship = G.ships["0"];
    expect(ship.upgrades).toEqual(["long_guns", "hull_reinforcement"]);
    // Frigate base scouting = 3, long_guns adds 1
    expect(ship.stats!.scouting).toBe(SHIP_SPECS.Frigate.scouting + 1);
    // Frigate base hull.max = 5, hull_reinforcement adds 1
    expect(ship.stats!.hull.max).toBe(SHIP_SPECS.Frigate.hull.max + 1);
  });

  it("resets damage on purchase", () => {
    const client = setupAtShipyard({
      gold: 100,
      damage: { hull: 1, crew: 1, masts: 1 },
    });
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    expect(G.ships["0"].damage).toEqual({ hull: 0, crew: 0, masts: 0 });
  });

  it("transfers cargo (cargo values preserved)", () => {
    const client = setupAtShipyard({
      gold: 100,
      cargo: { Wood: 1, Sugar: 1, Rum: 0, Spice: 0 }, // 2 total, fits in Frigate (3)
    });
    client.moves.buyShip("Frigate");
    const { G } = client.getState()!;
    expect(G.ships["0"].cargo).toEqual({ Wood: 1, Sugar: 1, Rum: 0, Spice: 0 });
  });

  it("allows downgrade (Frigate→Sloop with net gain)", () => {
    const client = setupAtShipyard({
      gold: 10,
      shipClass: "Frigate",
    });
    client.moves.buyShip("Sloop");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop");
    // Net cost: 20 - floor(40 * 0.5) = 20 - 20 = 0
    expect(G.ships["0"].gold).toBe(10);
  });

  it("counts toward moves per turn", () => {
    const client = setupAtShipyard({ gold: 200 });
    // Buy a ship (uses 1 move), then do 2 more trades to fill the 3-move turn
    client.moves.buyShip("Frigate");
    client.moves.trade("Wood", 1, "BUY");
    client.moves.trade("Wood", 1, "BUY");
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("1"); // turn auto-ended after 3 moves
  });

  it("rejects invalid ship class string", () => {
    const client = setupAtShipyard({ gold: 100 });
    client.moves.buyShip("Battleship");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop"); // unchanged
  });
});
