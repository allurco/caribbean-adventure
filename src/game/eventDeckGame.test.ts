import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid, type Hex } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, EventCardKind, NPCShip, ShipState } from "./types";
import { STARTER_SHIP_CLASSES } from "./types";
import { Caribbean, withGeneratedMap, withHotseatView } from "./Game";
import { createNPCShip } from "./npcManager";
import { createShipState } from "./economy";
import { generateMapFor } from "./mapRequest";
import { EVENT_DECK_SIZE } from "./eventDeck";

/**
 * The event deck in a real Caribbean client (#246): a card drawn as every
 * main-phase turn ends, the same cards for the same seed, the Merchant
 * convoy putting merchants to sea, and merchants sailing once a round.
 */

const PORT_ROYAL = hex(-4, 0);
const HAVANA = hex(4, 0);

/** Open water with an English port to the west (region 0) and a Spanish one to the east (region 1). */
const cells: MapCell[] = hexGrid(5).map((h) =>
  hexEquals(h, PORT_ROYAL)
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: hex(-3, 0), elevation: 1, region: 0 }
    : hexEquals(h, HAVANA)
      ? { hex: h, terrain: "island", hasPort: true, nation: "Spain", portName: "Havana", dockingHex: hex(3, 0), elevation: 1, region: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0, region: h.q < 0 ? 0 : 1 }
);

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** A seat's ship, captained, out of everyone's way along the north edge. */
function ship(seat: number): ShipState {
  const s = createShipState(hex(seat - 2, -3), "Sloop");
  s.captain = captain(`captain-${seat}`);
  return s;
}

/** A merchant at `at`, sailing one hex a round toward Havana's dock. */
function merchant(at: Hex): NPCShip {
  const npc = createNPCShip("witness", at, hex(3, 0), "England", "Flute", () => 0);
  return { ...npc, stats: { ...npc.stats, maneuverability: 1 } };
}

/** A match in the main phase on `cells`, `seats` seats, with the draw pile `drawPile` (top card last). */
function startGame(seats: number, drawPile: EventCardKind[], npcs: Record<string, NPCShip> = {}) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "event-deck-246",
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships: Object.fromEntries(Array.from({ length: seats }, (_, i) => [String(i), ship(i)])),
      mapSize: "small",
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs,
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
      eventDeck: { drawPile, log: [], drawn: 0 },
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: seats });
  client.start();
  return client;
}

const calm = (n: number): EventCardKind[] => Array.from({ length: n }, () => "calmSeas");

describe("the event deck in play (#246)", () => {
  it("a Merchant convoy drawn as the turn ends puts merchants to sea, and the log records it", () => {
    const client = startGame(2, ["merchantConvoy"]);
    client.events.endTurn!();
    const { G } = client.getState()!;
    const merchants = Object.values(G.npcs);
    expect(merchants.length).toBeGreaterThanOrEqual(1);
    expect(merchants.length).toBeLessThanOrEqual(2);
    expect(merchants.every((m) => m.role === "MERCHANT")).toBe(true);
    const [port] = merchants.map((m) => m.spawnPortHex);
    expect(merchants.every((m) => hexEquals(m.spawnPortHex, port) && !hexEquals(m.destinationPortHex, port))).toBe(true);
    expect(G.eventDeck!.log).toEqual([
      {
        id: 1,
        seat: "0",
        turn: 1,
        kind: "merchantConvoy",
        region: hexEquals(port, PORT_ROYAL) ? 0 : 1,
        port: hexEquals(port, PORT_ROYAL) ? "Port Royal" : "Havana",
        merchants: merchants.length,
        bound: merchants.map(() => (hexEquals(port, PORT_ROYAL) ? "Havana" : "Port Royal")),
      },
    ]);
  });

  it("draws one card each turn, and reshuffles a whole deck when the pile runs out", () => {
    const client = startGame(2, calm(2));
    client.events.endTurn!();
    client.events.endTurn!();
    expect(client.getState()!.G.eventDeck!.drawPile).toEqual([]);
    client.events.endTurn!();
    const deck = client.getState()!.G.eventDeck!;
    expect(deck.drawn).toBe(3);
    expect(deck.drawPile).toHaveLength(EVENT_DECK_SIZE - 1);
    expect(deck.log.map((e) => [e.seat, e.turn])).toEqual([["0", 1], ["1", 2], ["0", 3]]);
  });

  it.each([2, 4])("with %i seats, merchants sail once a round, as the last seat's turn ends", (seats) => {
    const start = hex(-2, 1);
    const client = startGame(seats, calm(2 * seats), { witness: merchant(start) });
    const sailed = () => client.getState()!.G.npcs.witness.position;
    for (let turn = 1; turn < seats; turn++) {
      client.events.endTurn!();
      expect(sailed()).toEqual(start);
    }
    client.events.endTurn!();
    const afterOneRound = sailed();
    expect(afterOneRound).not.toEqual(start);
    for (let turn = 1; turn < seats; turn++) client.events.endTurn!();
    expect(sailed()).toEqual(afterOneRound);
  });
});

describe("the event deck from setup (#246)", () => {
  const request = { mapSize: "small", mapSeed: 7 } as const;
  const map = { ...request, ...generateMapFor(request) };
  const game = { ...withHotseatView(withGeneratedMap(Caribbean, map)), seed: "event-deck-setup-246" };

  function playedDeck() {
    const client = Client<CaribbeanState>({ game, numPlayers: 2 });
    expect(client.getState()!.G.eventDeck).toEqual({ drawPile: expect.any(Array), log: [], drawn: 0 });
    expect(client.getState()!.G.eventDeck!.drawPile).toHaveLength(EVENT_DECK_SIZE);
    client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[0]);
    client.moves.pickCaptain(1, STARTER_SHIP_CLASSES[1]);
    // The draft draws nothing
    expect(client.getState()!.G.eventDeck!.drawn).toBe(0);
    for (let i = 0; i < 6; i++) client.events.endTurn!();
    return client.getState()!.G.eventDeck!;
  }

  it("shuffles a whole deck at setup, draws only in the main phase, and the same seed draws the same cards", () => {
    const first = playedDeck();
    expect(first.drawn).toBe(6);
    expect(playedDeck()).toEqual(first);
  });
});
