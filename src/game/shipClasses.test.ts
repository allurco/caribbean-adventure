import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { SHIP_CLASSES, SHIP_SPECS } from "./types";
import type { ShipClass, CaribbeanState, Captain, MapCell } from "./types";
import { Caribbean } from "./Game";
import { createShipState } from "./economy";
import { hex, hexEquals } from "./hex";
import type { MapSizeId } from "./mapConfig";

// ---------------------------------------------------------------------------
// SHIP_SPECS data tests
// ---------------------------------------------------------------------------

describe("SHIP_SPECS data", () => {
  it("has specs for every ship class", () => {
    for (const cls of SHIP_CLASSES) {
      expect(SHIP_SPECS[cls]).toBeDefined();
    }
  });

  it("Sloop is fast with small cargo", () => {
    expect(SHIP_SPECS.Sloop.maneuverability).toBe(4);
    expect(SHIP_SPECS.Sloop.cargo).toBe(2);
    expect(SHIP_SPECS.Sloop.cannons).toBe(2);
    expect(SHIP_SPECS.Sloop.hull.max).toBe(2);
  });

  it("Flute is slow with large cargo", () => {
    expect(SHIP_SPECS.Flute.maneuverability).toBe(2);
    expect(SHIP_SPECS.Flute.cargo).toBe(4);
    expect(SHIP_SPECS.Flute.cannons).toBe(2);
    expect(SHIP_SPECS.Flute.hull.max).toBe(4);
  });

  it("every ship class has positive stats", () => {
    for (const cls of SHIP_CLASSES) {
      const stats = SHIP_SPECS[cls];
      expect(stats.maneuverability).toBeGreaterThan(0);
      expect(stats.cargo).toBeGreaterThan(0);
      expect(stats.cannons).toBeGreaterThan(0);
      expect(stats.hull.max).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// createShipState with ship class
// ---------------------------------------------------------------------------

describe("createShipState with ship class", () => {
  it("defaults to DEFAULT_MAX_CARGO when no class given", () => {
    const ship = createShipState(hex(0, 0));
    expect(ship.maxCargo).toBe(3);
    expect(ship.shipClass).toBeUndefined();
    expect(ship.stats).toBeUndefined();
    expect(ship.upgrades).toEqual([]);
    expect(ship.damage).toEqual({ hull: 0, crew: 0, masts: 0 });
  });

  it("uses Sloop maxCargo when class is Sloop", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    expect(ship.maxCargo).toBe(SHIP_SPECS.Sloop.cargo);
    expect(ship.shipClass).toBe("Sloop");
    expect(ship.stats).toBeDefined();
    expect(ship.stats!.maneuverability).toBe(SHIP_SPECS.Sloop.maneuverability);
    expect(ship.upgrades).toEqual([]);
    expect(ship.damage).toEqual({ hull: 0, crew: 0, masts: 0 });
  });

  it("uses Flute maxCargo when class is Flute", () => {
    const ship = createShipState(hex(0, 0), "Flute");
    expect(ship.maxCargo).toBe(SHIP_SPECS.Flute.cargo);
    expect(ship.shipClass).toBe("Flute");
    expect(ship.stats).toBeDefined();
    expect(ship.stats!.maneuverability).toBe(SHIP_SPECS.Flute.maneuverability);
  });
});

// ---------------------------------------------------------------------------
// Draft with ship class selection — integration tests
// ---------------------------------------------------------------------------

const CAPTAIN_A: Captain = {
  id: "test-eng",
  name: "Test English",
  nation: "England",
  ability: "Test ability A",
};
const CAPTAIN_B: Captain = {
  id: "test-fra",
  name: "Test French",
  nation: "France",
  ability: "Test ability B",
};
const CAPTAIN_C: Captain = {
  id: "test-spa",
  name: "Test Spanish",
  nation: "Spain",
  ability: "Test ability C",
};
const CAPTAIN_D: Captain = {
  id: "test-fra2",
  name: "Test French 2",
  nation: "France",
  ability: "Test ability D",
};

const TEST_MARKET = {
  prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
};

function makeDraftCells(): MapCell[] {
  return [
    // England port at origin — P0 spawns here
    {
      hex: hex(0, 0),
      terrain: "island",
      hasPort: true,
      nation: "England",
      market: TEST_MARKET,
    },
    // Water hexes extending east for movement testing
    { hex: hex(1, 0), terrain: "water", hasPort: false },
    { hex: hex(2, 0), terrain: "water", hasPort: false },
    { hex: hex(3, 0), terrain: "water", hasPort: false },
    { hex: hex(4, 0), terrain: "water", hasPort: false },
    { hex: hex(5, 0), terrain: "water", hasPort: false },
    // Spain port far south — P1 spawns here
    {
      hex: hex(0, 3),
      terrain: "island",
      hasPort: true,
      nation: "Spain",
      market: TEST_MARKET,
    },
    // Water near Spain port
    { hex: hex(1, 3), terrain: "water", hasPort: false },
    { hex: hex(0, 2), terrain: "water", hasPort: false },
    { hex: hex(1, 2), terrain: "water", hasPort: false },
    // Bridge water between north and south
    { hex: hex(0, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    { hex: hex(1, 1), terrain: "water", hasPort: false },
    // France port for fallback
    {
      hex: hex(3, 3),
      terrain: "island",
      hasPort: true,
      nation: "France",
      market: TEST_MARKET,
    },
  ];
}

function setupDraft() {
  const DraftGame: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells: makeDraftCells(),
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(0, 0)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {
        "0": [CAPTAIN_A, CAPTAIN_B],
        "1": [CAPTAIN_C, CAPTAIN_D],
      },
    }),
  };
  const client = Client<CaribbeanState>({ game: DraftGame, numPlayers: 2 });
  client.start();
  return client;
}

describe("pickCaptain with ship class", () => {
  it("sets the ship class on the player's ship", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop");
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop");
  });

  it("sets maxCargo from SHIP_SPECS for Sloop", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop");
    const { G } = client.getState()!;
    expect(G.ships["0"].maxCargo).toBe(SHIP_SPECS.Sloop.cargo);
  });

  it("sets maxCargo from SHIP_SPECS for Flute", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Flute");
    const { G } = client.getState()!;
    expect(G.ships["0"].maxCargo).toBe(SHIP_SPECS.Flute.cargo);
  });

  it("rejects when no ship class is provided", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0);
    const { G } = client.getState()!;
    expect(G.ships["0"].captain).toBeUndefined();
    expect(G.ships["0"].shipClass).toBeUndefined();
  });

  it("rejects an invalid ship class", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Battleship");
    const { G } = client.getState()!;
    expect(G.ships["0"].captain).toBeUndefined();
    expect(G.ships["0"].shipClass).toBeUndefined();
  });

  it("both players can pick different ship classes", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop"); // P0: England + Sloop
    client.moves.pickCaptain(0, "Flute"); // P1: Spain + Flute
    const { G } = client.getState()!;
    expect(G.ships["0"].shipClass).toBe("Sloop");
    expect(G.ships["1"].shipClass).toBe("Flute");
    expect(G.ships["0"].maxCargo).toBe(2);
    expect(G.ships["1"].maxCargo).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Dynamic move limits in main phase (full draft → main flow)
// ---------------------------------------------------------------------------

function setupMainWithClasses(p0Class: ShipClass, p1Class: ShipClass) {
  const client = setupDraft();
  // Draft phase: P0 picks CAPTAIN_A (England) → spawns at hex(0,0)
  client.moves.pickCaptain(0, p0Class);
  // P1 picks CAPTAIN_C (Spain) → spawns at hex(0,3)
  client.moves.pickCaptain(0, p1Class);
  // Should now be in main phase
  expect(client.getState()!.ctx.phase).toBe("main");
  expect(client.getState()!.ctx.currentPlayer).toBe("0");
  return client;
}

describe("ship class move limits", () => {
  it("Sloop gets 4 moves per turn", () => {
    const client = setupMainWithClasses("Sloop", "Flute");
    // P0 (Sloop) at hex(0,0). Move along water: (1,0) → (2,0) → (3,0) → (4,0)
    client.moves.moveShip(1, 0);
    expect(client.getState()!.ctx.currentPlayer).toBe("0");
    client.moves.moveShip(2, 0);
    expect(client.getState()!.ctx.currentPlayer).toBe("0");
    client.moves.moveShip(3, 0);
    expect(client.getState()!.ctx.currentPlayer).toBe("0");
    client.moves.moveShip(4, 0);
    // After 4 moves, turn should auto-end
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
    expect(hexEquals(client.getState()!.G.ships["0"].position, hex(4, 0))).toBe(
      true,
    );
  });

  it("Flute gets 2 moves per turn", () => {
    const client = setupMainWithClasses("Flute", "Sloop");
    // P0 (Flute) at hex(0,0). Move: (1,0) → (2,0)
    client.moves.moveShip(1, 0);
    expect(client.getState()!.ctx.currentPlayer).toBe("0");
    client.moves.moveShip(2, 0);
    // After 2 moves, turn should auto-end
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
    expect(hexEquals(client.getState()!.G.ships["0"].position, hex(2, 0))).toBe(
      true,
    );
  });

  it("Sloop player can still end turn early", () => {
    const client = setupMainWithClasses("Sloop", "Flute");
    client.moves.moveShip(1, 0);
    client.events.endTurn!();
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Cargo limits per ship class
// ---------------------------------------------------------------------------

describe("ship class cargo limits", () => {
  it("Sloop can hold max 2 cargo", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    expect(ship.maxCargo).toBe(2);
  });

  it("Flute can hold max 4 cargo", () => {
    const ship = createShipState(hex(0, 0), "Flute");
    expect(ship.maxCargo).toBe(4);
  });
});
