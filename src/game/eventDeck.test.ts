import { describe, it, expect } from "vitest";
import { hex, hexEquals, hexGrid, type Hex } from "./hex";
import type { CaribbeanState, MapCell } from "./types";
import {
  EVENT_DECK_MIX,
  EVENT_DECK_SIZE,
  EVENT_LOG_LENGTH,
  buildEventDeck,
  drawEvent,
  shuffleEventDeck,
  type EventCardKind,
} from "./eventDeck";

describe("the event deck's mix (#246)", () => {
  it("holds 40 cards: 33 Calm seas, standing in for the cards still to come, and 7 Merchant convoys", () => {
    expect(EVENT_DECK_MIX).toEqual({ calmSeas: 33, merchantConvoy: 7 });
    expect(EVENT_DECK_SIZE).toBe(40);
  });

  it("builds the deck from the mix, one card per count", () => {
    const deck = buildEventDeck();
    expect(deck).toHaveLength(40);
    expect(deck.filter((card) => card === "calmSeas")).toHaveLength(33);
    expect(deck.filter((card) => card === "merchantConvoy")).toHaveLength(7);
  });
});

/** Open water with three ports: an English one in region 0, a Spanish one in region 1 and a pirate haven in region 4. */
const PORT_ROYAL = hex(-3, 0);
const HAVANA = hex(3, 0);
const TORTUGA = hex(0, 3);
const portCell = (at: Hex, nation: MapCell["nation"], portName: string, dock: Hex, region: number): MapCell => ({
  hex: at, terrain: "island", hasPort: true, nation, portName, dockingHex: dock, elevation: 1, region,
});
const cells: MapCell[] = hexGrid(4).map((h) =>
  hexEquals(h, PORT_ROYAL)
    ? portCell(h, "England", "Port Royal", hex(-2, 0), 0)
    : hexEquals(h, HAVANA)
      ? portCell(h, "Spain", "Havana", hex(2, 0), 1)
      : hexEquals(h, TORTUGA)
        ? portCell(h, "Pirate", "Tortuga", hex(0, 2), 4)
        : { hex: h, terrain: "water", hasPort: false, elevation: 0, region: h.q < 0 ? 0 : 1 }
);

/** A hand-built match on `cells` with the draw pile `drawPile` (top card last) and nothing at sea. */
const state = (drawPile: EventCardKind[], onCells: MapCell[] = cells): CaribbeanState =>
  ({ cells: onCells, ships: {}, npcs: {}, npcIdCounter: 0, wrap: null, eventDeck: { drawPile, log: [], drawn: 0 } }) as unknown as CaribbeanState;

/** A random source that returns `values` in turn, then the last one again and again. */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const at = { seat: "0", turn: 3 };

describe("drawing an event card (#246)", () => {
  it("draws the top card of the pile and logs it", () => {
    const G = state(["merchantConvoy", "calmSeas"]);
    const entry = drawEvent(G, rolls(0), at);
    expect(entry).toEqual({ id: 1, seat: "0", turn: 3, kind: "calmSeas" });
    expect(G.eventDeck!.drawPile).toEqual(["merchantConvoy"]);
    expect(G.eventDeck!.log).toEqual([entry]);
  });

  it("reshuffles a whole deck when the pile is empty, and the draws go on", () => {
    const G = state([]);
    drawEvent(G, rolls(0.5), at);
    expect(G.eventDeck!.drawPile).toHaveLength(EVENT_DECK_SIZE - 1);
    expect(G.eventDeck!.log).toHaveLength(1);
  });

  it("starts a deck, shuffled, for a match stored before the deck existed", () => {
    const G = { ...state([]), eventDeck: undefined } as CaribbeanState;
    drawEvent(G, rolls(0.5), at);
    expect(G.eventDeck!.drawPile).toHaveLength(EVENT_DECK_SIZE - 1);
    expect(G.eventDeck!.log.map((e) => e.id)).toEqual([1]);
  });

  it("keeps only the last few events in the log, newest last", () => {
    const G = state(Array.from({ length: EVENT_LOG_LENGTH + 3 }, () => "calmSeas" as const));
    for (let turn = 1; turn <= EVENT_LOG_LENGTH + 3; turn++) drawEvent(G, rolls(0), { seat: "0", turn });
    expect(G.eventDeck!.log).toHaveLength(EVENT_LOG_LENGTH);
    expect(G.eventDeck!.log.at(-1)).toMatchObject({ id: EVENT_LOG_LENGTH + 3, turn: EVENT_LOG_LENGTH + 3 });
    expect(G.eventDeck!.log[0]).toMatchObject({ id: 4 });
  });

  it("keeps the deck plain JSON", () => {
    const G = state(["merchantConvoy"]);
    drawEvent(G, rolls(0), at);
    expect(JSON.parse(JSON.stringify(G.eventDeck))).toEqual(G.eventDeck);
  });
});

describe("shuffling the event deck (#246)", () => {
  it("is a reordering of the whole deck", () => {
    expect([...shuffleEventDeck(rolls(0.3, 0.9, 0.1, 0.6))].sort()).toEqual([...buildEventDeck()].sort());
  });

  it("gives the same order from the same rolls, and another from others", () => {
    const seeded = (seed: number) => {
      let x = seed;
      return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    };
    expect(shuffleEventDeck(seeded(1))).toEqual(shuffleEventDeck(seeded(1)));
    expect(shuffleEventDeck(seeded(1))).not.toEqual(shuffleEventDeck(seeded(2)));
  });
});

describe("Merchant convoy (#246)", () => {
  it("one merchant on a low roll: it sails from a random port, bound for another", () => {
    // Rolls: the port (0: Port Royal, the first of the two trading ports), how many (0: one), then the merchant's own
    const G = state(["merchantConvoy"]);
    const entry = drawEvent(G, rolls(0, 0, 0.99), at);
    const merchants = Object.values(G.npcs);
    expect(merchants).toHaveLength(1);
    expect(merchants[0]).toMatchObject({ role: "MERCHANT", nation: "England", spawnPortHex: PORT_ROYAL, destinationPortHex: HAVANA });
    expect(entry).toEqual({ id: 1, seat: "0", turn: 3, kind: "merchantConvoy", region: 0, port: "Port Royal", merchants: 1, bound: ["Havana"] });
  });

  it("two merchants on a high roll, both from the one port, side by side on the water", () => {
    const G = state(["merchantConvoy"]);
    const entry = drawEvent(G, rolls(0.99, 0.99, 0.5), at);
    const merchants = Object.values(G.npcs);
    expect(merchants).toHaveLength(2);
    expect(merchants.every((m) => hexEquals(m.spawnPortHex, HAVANA))).toBe(true);
    expect(hexEquals(merchants[0].position, merchants[1].position)).toBe(false);
    expect(entry).toMatchObject({ kind: "merchantConvoy", region: 1, port: "Havana", merchants: 2, bound: ["Port Royal", "Port Royal"] });
  });

  it("a merchant may be bound for a port in another region", () => {
    const G = state(["merchantConvoy"]);
    drawEvent(G, rolls(0, 0, 0.5), at);
    const [merchant] = Object.values(G.npcs);
    const region = (h: Hex) => cells.find((c) => hexEquals(c.hex, h))!.region;
    expect(region(merchant.destinationPortHex)).not.toBe(region(merchant.spawnPortHex));
  });

  it("becomes Calm seas when no merchant can sail: no two trading ports", () => {
    const onePort = cells.map((c) => (hexEquals(c.hex, HAVANA) ? { hex: c.hex, terrain: "water" as const, hasPort: false, elevation: 0 as const } : c));
    const G = state(["merchantConvoy"], onePort);
    const entry = drawEvent(G, rolls(0), at);
    expect(G.npcs).toEqual({});
    expect(entry).toEqual({ id: 1, seat: "0", turn: 3, kind: "calmSeas" });
  });
});
