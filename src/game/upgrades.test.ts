import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean } from "./Game";
import type { CaribbeanState } from "./Game";
import type { Captain, MapCell, ShipClass } from "./types";
import { hex } from "./hex";
import { createShipState } from "./economy";
import { SHIP_SPECS, UPGRADES, REPAIR_COST_PER_POINT } from "./constants";
import type { MapSizeId } from "./mapConfig";

const TEST_MARKET = {
  prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
};

const CAPTAIN_A: Captain = {
  id: "test-eng",
  name: "Test English",
  nation: "England",
  ability: "Test ability A",
};
const CAPTAIN_B: Captain = {
  id: "test-spa",
  name: "Test Spanish",
  nation: "Spain",
  ability: "Test ability B",
};

function makeCells(): MapCell[] {
  return [
    {
      hex: hex(0, 0),
      terrain: "island",
      hasPort: true,
      nation: "England",
      market: TEST_MARKET,
    },
    { hex: hex(1, 0), terrain: "water", hasPort: false },
    { hex: hex(2, 0), terrain: "water", hasPort: false },
    { hex: hex(3, 0), terrain: "water", hasPort: false },
    { hex: hex(0, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    {
      hex: hex(0, 3),
      terrain: "island",
      hasPort: true,
      nation: "Spain",
      market: TEST_MARKET,
    },
    { hex: hex(0, 2), terrain: "water", hasPort: false },
    { hex: hex(1, 2), terrain: "water", hasPort: false },
  ];
}

function setupMainPhase(p0Class: ShipClass = "Sloop", p1Class: ShipClass = "Flute") {
  const DraftGame: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells: makeCells(),
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(0, 0)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {
        "0": [CAPTAIN_A],
        "1": [CAPTAIN_B],
      },
    }),
  };
  const client = Client<CaribbeanState>({ game: DraftGame, numPlayers: 2 });
  client.start();
  // Draft: P0 picks captain + ship class
  client.moves.pickCaptain(0, p0Class);
  // P1 picks
  client.moves.pickCaptain(0, p1Class);
  expect(client.getState()!.ctx.phase).toBe("main");
  expect(client.getState()!.ctx.currentPlayer).toBe("0");
  return client;
}

/** Setup at port without draft phase — for quick tests */
function setupAtPortNoDraft() {
  const ship0 = createShipState(hex(0, 0), "Sloop");
  ship0.stats = structuredClone(SHIP_SPECS.Sloop);
  const cells: MapCell[] = [
    { hex: hex(0, 0), terrain: "island", hasPort: true, market: TEST_MARKET },
    { hex: hex(1, 0), terrain: "water", hasPort: false },
    { hex: hex(0, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 0), terrain: "water", hasPort: false },
    { hex: hex(0, -1), terrain: "water", hasPort: false },
    { hex: hex(1, -1), terrain: "water", hasPort: false },
  ];
  const TestGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": ship0,
        "1": createShipState(hex(1, -1), "Flute"),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
    }),
  };
  const client = Client<CaribbeanState>({ game: TestGame });
  client.start();
  return client;
}

describe("buyUpgrade move", () => {
  it("installs upgrade, deducts gold, modifies stat", () => {
    const client = setupAtPortNoDraft();
    const goldBefore = client.getState()!.G.ships["0"].gold;
    client.moves.buyUpgrade("long_guns");
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).toContain("long_guns");
    expect(G.ships["0"].gold).toBe(goldBefore - UPGRADES.long_guns.cost);
    expect(G.ships["0"].stats!.scouting).toBe(
      SHIP_SPECS.Sloop.scouting + 1,
    );
  });

  it("rejects when not at port", () => {
    const client = setupAtPortNoDraft();
    // Move to water first
    client.moves.moveShip(1, 0);
    client.moves.buyUpgrade("chain_shot");
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).not.toContain("chain_shot");
  });

  it("rejects duplicate upgrade", () => {
    const client = setupAtPortNoDraft();
    client.moves.buyUpgrade("chain_shot");
    client.moves.buyUpgrade("chain_shot"); // duplicate
    const { G } = client.getState()!;
    expect(
      G.ships["0"].upgrades.filter((u) => u === "chain_shot").length,
    ).toBe(1);
  });

  it("rejects when cannot afford", () => {
    const client = setupAtPortNoDraft();
    // Hull reinforcement costs 20. Set gold low by buying spice first
    client.moves.trade("Spice", 1, "BUY"); // costs 45, leaves 5
    client.moves.buyUpgrade("hull_reinforcement"); // costs 20 — too much
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).not.toContain("hull_reinforcement");
  });

  it("hull_reinforcement increases stats.hull.max", () => {
    const client = setupAtPortNoDraft();
    const hullMaxBefore = client.getState()!.G.ships["0"].stats!.hull.max;
    client.moves.buyUpgrade("hull_reinforcement");
    const { G } = client.getState()!;
    expect(G.ships["0"].stats!.hull.max).toBe(hullMaxBefore + 1);
  });

  it("hammocks increases stats.crew.max and .current", () => {
    const client = setupAtPortNoDraft();
    const crewBefore = client.getState()!.G.ships["0"].stats!.crew;
    client.moves.buyUpgrade("hammocks");
    const { G } = client.getState()!;
    expect(G.ships["0"].stats!.crew.max).toBe(crewBefore.max + 1);
    expect(G.ships["0"].stats!.crew.current).toBe(crewBefore.current + 1);
  });

  it("long_guns increases stats.scouting", () => {
    const client = setupAtPortNoDraft();
    const scoutingBefore = client.getState()!.G.ships["0"].stats!.scouting;
    client.moves.buyUpgrade("long_guns");
    const { G } = client.getState()!;
    expect(G.ships["0"].stats!.scouting).toBe(scoutingBefore + 1);
  });

  it("chain_shot stored but no stat change", () => {
    const client = setupAtPortNoDraft();
    const statsBefore = structuredClone(client.getState()!.G.ships["0"].stats!);
    client.moves.buyUpgrade("chain_shot");
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).toContain("chain_shot");
    expect(G.ships["0"].stats!.maneuverability).toBe(statsBefore.maneuverability);
    expect(G.ships["0"].stats!.scouting).toBe(statsBefore.scouting);
    expect(G.ships["0"].stats!.cannons).toBe(statsBefore.cannons);
  });

  it("grape_shot stored but no stat change", () => {
    const client = setupAtPortNoDraft();
    const statsBefore = structuredClone(client.getState()!.G.ships["0"].stats!);
    client.moves.buyUpgrade("grape_shot");
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).toContain("grape_shot");
    expect(G.ships["0"].stats!.cannons).toBe(statsBefore.cannons);
  });

  it("counts toward moves per turn", () => {
    const client = setupAtPortNoDraft();
    client.moves.buyUpgrade("chain_shot");   // move 1
    client.moves.buyUpgrade("grape_shot");   // move 2
    client.moves.buyUpgrade("long_guns");    // move 3 → auto-end
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("1");
  });
});

describe("repair move", () => {
  function setupDamaged() {
    const ship0 = createShipState(hex(0, 0), "Sloop");
    ship0.stats = structuredClone(SHIP_SPECS.Sloop);
    ship0.stats.hull.current = 1;
    ship0.damage = { hull: 1, crew: 0, masts: 0 };
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "island", hasPort: true, market: TEST_MARKET },
      { hex: hex(1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, -1), terrain: "water", hasPort: false },
      { hex: hex(1, -1), terrain: "water", hasPort: false },
    ];
    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": createShipState(hex(1, -1), "Flute"),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame });
    client.start();
    return client;
  }

  it("repairs hull damage: deducts gold, reduces damage, increases stats.hull.current", () => {
    const client = setupDamaged();
    const goldBefore = client.getState()!.G.ships["0"].gold;
    client.moves.repair("hull", 1);
    const { G } = client.getState()!;
    expect(G.ships["0"].damage.hull).toBe(0);
    expect(G.ships["0"].stats!.hull.current).toBe(SHIP_SPECS.Sloop.hull.max);
    expect(G.ships["0"].gold).toBe(goldBefore - REPAIR_COST_PER_POINT);
  });

  it("rejects when not at port", () => {
    const client = setupDamaged();
    client.moves.moveShip(1, 0); // move to water
    client.moves.repair("hull", 1);
    const { G } = client.getState()!;
    expect(G.ships["0"].damage.hull).toBe(1); // still damaged
  });

  it("rejects when no damage", () => {
    const client = setupAtPortNoDraft(); // no damage
    const goldBefore = client.getState()!.G.ships["0"].gold;
    client.moves.repair("hull", 1);
    const { G } = client.getState()!;
    expect(G.ships["0"].gold).toBe(goldBefore); // no change
  });

  it("rejects when insufficient gold", () => {
    const client = setupDamaged();
    // Spend gold down
    client.moves.trade("Spice", 1, "BUY"); // -45 → 5 gold
    client.moves.repair("hull", 1); // costs 5 — exactly enough
    const { G: G1 } = client.getState()!;
    expect(G1.ships["0"].damage.hull).toBe(0); // should work at 5 gold
  });

  it("clamps to available damage", () => {
    const client = setupDamaged();
    const goldBefore = client.getState()!.G.ships["0"].gold;
    client.moves.repair("hull", 10); // only 1 hull damage
    const { G } = client.getState()!;
    expect(G.ships["0"].damage.hull).toBe(0);
    expect(G.ships["0"].gold).toBe(goldBefore - REPAIR_COST_PER_POINT); // charged for 1
  });

  it("counts toward moves per turn", () => {
    // Set up a ship with multi-point damage
    const ship0 = createShipState(hex(0, 0), "Sloop");
    ship0.stats = structuredClone(SHIP_SPECS.Sloop);
    ship0.stats.hull.current = 0;
    ship0.stats.crew.current = 0;
    ship0.damage = { hull: 2, crew: 2, masts: 2 };
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "island", hasPort: true, market: TEST_MARKET },
      { hex: hex(1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 1), terrain: "water", hasPort: false },
      { hex: hex(-1, 0), terrain: "water", hasPort: false },
      { hex: hex(0, -1), terrain: "water", hasPort: false },
      { hex: hex(1, -1), terrain: "water", hasPort: false },
    ];
    const TestGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": ship0,
          "1": createShipState(hex(1, -1), "Flute"),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
      }),
    };
    const client = Client<CaribbeanState>({ game: TestGame });
    client.start();

    client.moves.repair("hull", 1);  // move 1
    client.moves.repair("crew", 1);  // move 2
    client.moves.repair("masts", 1); // move 3 → auto-end
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("1");
  });
});

describe("buyUpgrade via full draft flow", () => {
  it("P0 at port can buy upgrade after draft", () => {
    const client = setupMainPhase("Sloop", "Flute");
    // P0 should be at England port hex(0,0)
    const goldBefore = client.getState()!.G.ships["0"].gold;
    client.moves.buyUpgrade("chain_shot");
    const { G } = client.getState()!;
    expect(G.ships["0"].upgrades).toContain("chain_shot");
    expect(G.ships["0"].gold).toBe(goldBefore - UPGRADES.chain_shot.cost);
  });
});
