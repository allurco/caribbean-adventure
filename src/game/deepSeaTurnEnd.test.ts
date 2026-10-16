import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hexRect, offsetToHex } from "./hex";
import type { MapSizeId } from "./mapConfig";
import type { CaribbeanState, MapCell, ShipClass, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { applyRepair, createShipState } from "./economy";
import { REPAIR_COST_PER_POINT } from "./constants";
import { withMainPhase } from "../testSupport/withMainPhase";

// Open water seven hexes across between two coasts: columns 3 to 5 are deep sea.
const cells: MapCell[] = hexRect(9, 9).map((h) => {
  const land = h.q === 0 || h.q === 8;
  return { hex: h, terrain: land ? "island" : "water", hasPort: false, elevation: land ? 1 : 0 };
});
const at = (col: number, row = 4) => offsetToHex(col, row);

function shipAt(col: number, shipClass: ShipClass, row = 4): ShipState {
  return createShipState(at(col, row), shipClass);
}

/** A two-seat match in its main phase: seat 0's ship and seat 1's, on the strip. */
function match(ship0: ShipState, ship1: ShipState = shipAt(1, "Frigate", 0)) {
  const game: Game<CaribbeanState> = {
    ...withMainPhase(Caribbean),
    seed: "deep-sea",
    setup: () => ({
      cells,
      ships: { "0": ship0, "1": ship1 },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
      movesUsed: 0,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

const G = (client: ReturnType<typeof match>) => client.getState()!.G;

describe("the open sea wears coasters as their turn ends (#340)", () => {
  it("costs a Sloop ending its turn on deep sea one hull point, and says so", () => {
    const client = match(shipAt(4, "Sloop"));
    client.events.endTurn!();
    const ship = G(client).ships["0"];
    expect(ship.stats!.hull.current).toBe(1);
    expect(ship.damage.hull).toBe(1);
    expect(G(client).seaWear).toEqual({ "0": 1 });
  });

  it("costs a Flute ending its turn on deep sea one hull point", () => {
    const client = match(shipAt(4, "Flute"));
    client.events.endTurn!();
    expect(G(client).ships["0"].stats!.hull.current).toBe(3);
  });

  it("costs nothing to a Sloop that only sailed through deep water", () => {
    // Four moves from the coast across the deep columns 3 to 5, ending by the far coast
    const client2 = match(shipAt(2, "Sloop"));
    for (const col of [3, 4, 5, 6]) client2.moves.moveShip(at(col).q, at(col).r);
    expect(client2.getState()!.ctx.currentPlayer).toBe("1");
    expect(G(client2).ships["0"].stats!.hull.current).toBe(2);
    expect(G(client2).seaWear).toBeUndefined();
  });

  it("leaves a Frigate or a Galleon ending its turn on deep sea alone", () => {
    for (const shipClass of ["Frigate", "Galleon"] as const) {
      const client = match(shipAt(4, shipClass));
      client.events.endTurn!();
      expect(G(client).ships["0"].damage.hull).toBe(0);
    }
  });

  it("never takes the last hull point", () => {
    const sloop = shipAt(4, "Sloop");
    sloop.stats!.hull.current = 1;
    sloop.damage.hull = 1;
    const client = match(sloop);
    client.events.endTurn!();
    expect(G(client).ships["0"].stats!.hull.current).toBe(1);
    expect(G(client).ships["0"].damage.hull).toBe(1);
  });

  it("wears only the seat whose turn ends, not the next one", () => {
    const client = match(shipAt(4, "Sloop"), shipAt(5, "Sloop", 0));
    client.events.endTurn!();
    expect(G(client).ships["1"].stats!.hull.current).toBe(2);
  });

  it("keeps each seat's last wear apart, so no seat's line is lost", () => {
    const client = match(shipAt(4, "Flute"), shipAt(5, "Flute", 0));
    client.events.endTurn!();
    client.events.endTurn!();
    expect(G(client).seaWear).toEqual({ "0": 1, "1": 2 });
    client.events.endTurn!();
    expect(G(client).seaWear).toEqual({ "0": 3, "1": 2 });
  });

  it("leaves a ship whose turn ends in a fight alone", () => {
    const client = match(shipAt(4, "Sloop"), shipAt(5, "Frigate"));
    client.moves.attackShip("1");
    expect(client.getState()!.ctx.phase).toBe("combat");
    expect(G(client).ships["0"].damage.hull).toBe(0);
  });

  it("is mended at port at the usual cost", () => {
    const client = match(shipAt(4, "Sloop"));
    client.events.endTurn!();
    const ship = structuredClone(G(client).ships["0"]);
    const gold = ship.gold;
    applyRepair(ship, "hull", 1);
    expect(ship.stats!.hull.current).toBe(2);
    expect(ship.damage.hull).toBe(0);
    expect(ship.gold).toBe(gold - REPAIR_COST_PER_POINT);
  });
});
