import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";
import { hex, hexEquals, hexGrid } from "./hex";
import type { Hex } from "./hex";
import type { CaribbeanState, MapCell, PortMarket, ShipClass, ShipState } from "./types";
import type { MapSizeId } from "./mapConfig";
import { movesLeft } from "./turnMoves";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// These tests send refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

const MARKET: PortMarket = {
  prices: {
    Wood: { buy: 8, sell: 6 },
    Sugar: { buy: 20, sell: 15 },
    Rum: { buy: 30, sell: 23 },
    Spice: { buy: 45, sell: 35 },
  },
  inDemandGood: null,
};

/** The port's island; ships reach it from its docking hex, the origin. */
const PORT_HEX = hex(1, -1);
const DOCK = hex(0, 0);

/** Open water round the origin, with one port island docked from the origin. */
function cells(): MapCell[] {
  return hexGrid(5).map((h): MapCell =>
    hexEquals(h, PORT_HEX)
      ? {
          hex: h,
          terrain: "island",
          elevation: 2,
          hasPort: true,
          hasShipyard: true,
          market: MARKET,
          portName: "Test Port",
          nation: "England",
          dockingHex: DOCK,
        }
      : { hex: h, terrain: "water", elevation: 0, hasPort: false },
  );
}

/**
 * A game in its main phase with player 0's `shipClass` at `at` (the port's
 * docking hex unless given) and player 1's Frigate at `p1At`, out of the way.
 */
function mainPhase(
  shipClass: ShipClass,
  at: Hex = DOCK,
  change: (ship: ShipState) => void = () => {},
  p1At: Hex = hex(-4, 0),
) {
  const phases = Caribbean.phases!;
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => {
      const ship = createShipState(at, shipClass);
      ship.homePortHex = PORT_HEX;
      ship.homeDockingHex = DOCK;
      change(ship);
      return {
        cells: cells(),
        ships: { "0": ship, "1": createShipState(p1At, "Frigate") },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {},
        npcIdCounter: 0,
        wrap: null,
        pirates: {},
        bountyClaims: [],
        movesUsed: 0,
      };
    },
    phases: { ...phases, draft: { ...phases.draft, start: false }, main: { ...phases.main, start: true } },
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

/** Whether `value` is plain JSON data: nothing a JSON round trip would drop or change, bar the sign of zero. */
function isJsonData(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonData);
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((v) => v === undefined || isJsonData(v));
}

const state = (client: ReturnType<typeof mainPhase>) => client.getState()!;

describe("free port actions (#227)", () => {
  it("lets a Galleon trade, then still sail its one hex", () => {
    const client = mainPhase("Galleon");
    client.moves.trade("Wood", 1, "BUY");
    client.moves.trade("Wood", 1, "BUY");
    client.moves.trade("Wood", 1, "SELL");
    let { G, ctx } = state(client);
    expect(G.ships["0"].cargo.Wood).toBe(1);
    expect(ctx.currentPlayer).toBe("0");
    expect(movesLeft(G, "0")).toBe(1);

    client.moves.moveShip(-1, 0);
    ({ G, ctx } = state(client));
    expect(hexEquals(G.ships["0"].position, hex(-1, 0))).toBe(true);
    // Its one move sailed away from the port: the turn passes on
    expect(ctx.currentPlayer).toBe("1");
  });

  it("never ends a turn by trading, however often", () => {
    const client = mainPhase("Sloop");
    for (let i = 0; i < 8; i++) client.moves.trade("Wood", 1, i % 2 === 0 ? "BUY" : "SELL");
    const { G, ctx } = state(client);
    expect(ctx.currentPlayer).toBe("0");
    expect(movesLeft(G, "0")).toBe(4);
  });

  it("leaves the moves alone for the other port and ship-management actions", () => {
    const client = mainPhase("Flute", DOCK, (ship) => {
      ship.damage.hull = 1;
      ship.gold = 500;
    });
    client.moves.repair("hull", 1);
    client.moves.buyUpgrade("hammocks");
    client.moves.stashGold(10);
    client.moves.listenForRumors();
    client.moves.abandonMission();
    client.moves.buyShip("Sloop");
    const { G, ctx } = state(client);
    expect(ctx.currentPlayer).toBe("0");
    expect(G.movesUsed ?? 0).toBe(0);
    // Each one did what it does
    expect(G.ships["0"].damage.hull).toBe(0);
    expect(G.ships["0"].stashedGold).toBe(10);
    expect(G.ships["0"].shipClass).toBe("Sloop");
  });

  it("still limits sailing to the class's moves", () => {
    const moves: Record<ShipClass, number> = { Sloop: 4, Frigate: 3, Flute: 2, Galleon: 1 };
    for (const [shipClass, allowed] of Object.entries(moves) as [ShipClass, number][]) {
      const client = mainPhase(shipClass, hex(0, 1));
      for (let i = 1; i < allowed; i++) client.moves.moveShip(0, 1 + i);
      expect(state(client).ctx.currentPlayer, shipClass).toBe("0");
      client.moves.moveShip(0, 1 + allowed);
      expect(state(client).ctx.currentPlayer, shipClass).toBe("1");
      expect(hexEquals(state(client).G.ships["0"].position, hex(0, 1 + allowed)), shipClass).toBe(true);
    }
  });

  it("takes a move off for each point of mast damage", () => {
    const client = mainPhase("Frigate", hex(0, 1), (ship) => {
      ship.damage.masts = 1;
    });
    expect(movesLeft(state(client).G, "0")).toBe(2);
    client.moves.moveShip(0, 2);
    client.moves.moveShip(0, 3);
    expect(state(client).ctx.currentPlayer).toBe("1");
  });

  it("gives every turn its own moves", () => {
    const client = mainPhase("Flute", hex(0, 1));
    client.moves.moveShip(0, 2);
    client.moves.moveShip(0, 3);
    expect(state(client).ctx.currentPlayer).toBe("1");
    client.moves.moveShip(-4, 1);
    client.events.endTurn!();
    const { G, ctx } = state(client);
    expect(ctx.currentPlayer).toBe("0");
    expect(movesLeft(G, "0")).toBe(2);
  });

  it("keeps the turn open when the last move docks at a port, until End Turn", () => {
    const client = mainPhase("Galleon", hex(-1, 0));
    client.moves.moveShip(DOCK.q, DOCK.r);
    let { G, ctx } = state(client);
    expect(hexEquals(G.ships["0"].position, DOCK)).toBe(true);
    expect(ctx.currentPlayer).toBe("0");
    expect(movesLeft(G, "0")).toBe(0);

    // Free to trade there, but not to sail on
    client.moves.trade("Wood", 2, "BUY");
    client.moves.moveShip(0, 1);
    ({ G, ctx } = state(client));
    expect(G.ships["0"].cargo.Wood).toBe(2);
    expect(hexEquals(G.ships["0"].position, DOCK)).toBe(true);
    expect(ctx.currentPlayer).toBe("0");

    client.events.endTurn!();
    expect(state(client).ctx.currentPlayer).toBe("1");
  });

  it("still spends a move to scout with the spyglass", () => {
    const client = mainPhase("Flute", hex(-3, 0));
    client.moves.spyglass("1", false);
    const { G, ctx } = state(client);
    expect(G.ships["0"].scoutedShips).toContain("1");
    expect(movesLeft(G, "0")).toBe(1);
    expect(ctx.currentPlayer).toBe("0");
  });

  it("refuses the spyglass once the moves are used", () => {
    const client = mainPhase("Galleon", hex(-1, 0), () => {}, hex(-2, 0));
    client.moves.moveShip(DOCK.q, DOCK.r);
    client.moves.spyglass("1", false);
    const { G, ctx } = state(client);
    expect(G.ships["0"].scoutedShips).not.toContain("1");
    expect(ctx.currentPlayer).toBe("0");
  });

  it("keeps G JSON-serialisable", () => {
    const client = mainPhase("Flute");
    client.moves.trade("Wood", 1, "BUY");
    client.moves.moveShip(0, 1);
    const { G } = state(client);
    expect(G.movesUsed).toBe(1);
    expect(isJsonData(G)).toBe(true);
  });
});
