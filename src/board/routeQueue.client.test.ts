import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean } from "../game/Game";
import { createShipState } from "../game/economy";
import { hex, hexEquals, hexGrid } from "../game/hex";
import type { Hex } from "../game/hex";
import type { CaribbeanState, MapCell } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";
import { advanceRoute, routeObservation, startRoute } from "./routeQueue";

/** A game already in its main phase on a disc of water, a Frigate (3 moves) for each player. */
function mainPhase(cells: MapCell[], p1At: Hex = hex(-4, 0)) {
  const phases = Caribbean.phases!;
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells,
      ships: { "0": createShipState(hex(0, 0), "Frigate"), "1": createShipState(p1At, "Frigate") },
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
    }),
    phases: { ...phases, draft: { ...phases.draft, start: false }, main: { ...phases.main, start: true } },
  };
  const client = Client<CaribbeanState>({ game, numPlayers: 2 });
  client.start();
  return client;
}

/** Sails `route` for player 0 the way the board does, one move per applied step. */
function sail(client: ReturnType<typeof mainPhase>, route: Hex[]) {
  let queue = startRoute(route, "0");
  const sent: Hex[] = [];
  for (let i = 0; i < 10; i++) {
    const { G, ctx } = client.getState()!;
    const obs = routeObservation(G, ctx, "0");
    if (!obs) return { sent, reason: "gone" };
    const next = advanceRoute(queue, obs, G.wrap);
    if (next.kind === "done") return { sent, reason: next.reason };
    if (next.kind === "wait") return { sent, reason: "stuck" };
    queue = next.queue;
    sent.push(next.hex);
    client.moves.moveShip(next.hex.q, next.hex.r);
  }
  return { sent, reason: "runaway" };
}

const water = (changes: Record<string, Partial<MapCell>> = {}): MapCell[] =>
  hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0, ...changes[`${h.q},${h.r}`] }));

describe("sailing a route through the game", () => {
  it("sails three hexes with three moves, one moveShip each", () => {
    const client = mainPhase(water());
    const route = [hex(1, 0), hex(2, 0), hex(3, 0)];
    const result = sail(client, route);
    expect(result.sent).toEqual(route);
    const { G, ctx } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, hex(3, 0))).toBe(true);
    // All three moves used: the turn passed on
    expect(ctx.currentPlayer).toBe("1");
  });

  it("stops at a port's docking hex on the way, keeping the moves left", () => {
    const port: Partial<MapCell> = { terrain: "island", hasPort: true, dockingHex: hex(1, 0) };
    const client = mainPhase(water({ "1,-1": port }));
    const result = sail(client, [hex(1, 0), hex(2, 0), hex(3, 0)]);
    expect(result).toEqual({ sent: [hex(1, 0)], reason: "interrupted" });
    const { G, ctx } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, hex(1, 0))).toBe(true);
    expect(G.movesUsed).toBe(1);
    expect(ctx.currentPlayer).toBe("0");
  });

  it("drops the rest when a step is blocked, keeping the moves left", () => {
    const client = mainPhase(water(), hex(2, 0));
    const result = sail(client, [hex(1, 0), hex(2, 0), hex(3, 0)]);
    expect(result).toEqual({ sent: [hex(1, 0)], reason: "rejected" });
    expect(client.getState()!.G.movesUsed).toBe(1);
  });

  it("sails its whole route after trading at the port: trading is free (#227)", () => {
    const market = {
      prices: { Wood: { buy: 8, sell: 6 }, Sugar: { buy: 20, sell: 15 }, Rum: { buy: 30, sell: 23 }, Spice: { buy: 45, sell: 35 } },
      inDemandGood: null,
    };
    const port: Partial<MapCell> = { terrain: "island", hasPort: true, market, dockingHex: hex(0, 0) };
    const client = mainPhase(water({ "1,-1": port }));
    client.moves.trade("Wood", 1, "BUY");
    client.moves.trade("Wood", 1, "SELL");
    const route = [hex(-1, 1), hex(-2, 2), hex(-3, 3)];
    expect(sail(client, route).sent).toEqual(route);
    const { G, ctx } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, hex(-3, 3))).toBe(true);
    expect(ctx.currentPlayer).toBe("1");
  });
});
