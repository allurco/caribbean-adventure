import { describe, it, expect } from "vitest";
import { hex, hexEquals, hexGrid, type Hex } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { CaribbeanState, CombatState, NPCShip } from "./types";
import { npcTurnEndStep } from "./npcTurnStep";
import { createFlotillaShip, createNPCShip } from "./npcManager";
import { SHIP_SPECS } from "./constants";

/** Open water with two ports, so a merchant has somewhere to sail from and to. */
const cells: MapCell[] = hexGrid(4).map((h) =>
  hexEquals(h, hex(-3, 0))
    ? { hex: h, terrain: "island", hasPort: true, nation: "England", portName: "Port Royal", dockingHex: hex(-2, 0), elevation: 1 }
    : hexEquals(h, hex(3, 0))
      ? { hex: h, terrain: "island", hasPort: true, nation: "Spain", portName: "Havana", dockingHex: hex(2, 0), elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
);

const state = (combat?: CombatState): CaribbeanState =>
  ({ cells, ships: {}, npcs: {}, npcIdCounter: 0, wrap: null, combat }) as unknown as CaribbeanState;

/** A random source that always returns `value`. */
const always = (value: number) => () => value;

/** A Spanish merchant at `at`, making for Port Royal's dock, and an English flotilla hunting seat 0, each one hex a step. */
const merchant = (at: Hex): NPCShip => ({ ...createNPCShip("m", at, hex(-2, 0), "Spain", "Flute", always(0)), stats: { ...SHIP_SPECS.Flute, maneuverability: 1 } });
const flotilla = (at: Hex): NPCShip => ({ ...createFlotillaShip("f", at, "England", "Frigate", "0"), stats: { ...SHIP_SPECS.Frigate, maneuverability: 1 } });

const midRound = { seat: "0", turn: 1, endsRound: false };
const roundEnd = { seat: "1", turn: 2, endsRound: true };

describe("the world's step as a turn ends (#288, #246)", () => {
  it("draws an event card each turn, logged with the seat and turn that ended", () => {
    const G = state();
    G.eventDeck = { drawPile: ["calmSeas", "calmSeas"], log: [], drawn: 0 };
    npcTurnEndStep(G, always(0), midRound);
    npcTurnEndStep(G, always(0), roundEnd);
    expect(G.eventDeck.log).toEqual([
      { id: 1, seat: "0", turn: 1, kind: "calmSeas" },
      { id: 2, seat: "1", turn: 2, kind: "calmSeas" },
    ]);
  });

  it("no longer spawns merchants by chance: only a convoy card brings them", () => {
    const G = state();
    G.eventDeck = { drawPile: ["calmSeas"], log: [], drawn: 0 };
    npcTurnEndStep(G, always(0), roundEnd);
    expect(G.npcs).toEqual({});
  });

  it("merchants sail only as the round ends, flotillas every turn", () => {
    const G = state();
    G.eventDeck = { drawPile: ["calmSeas", "calmSeas"], log: [], drawn: 0 };
    G.ships = { "0": { position: hex(-3, 0) } } as unknown as CaribbeanState["ships"];
    G.npcs = { m: merchant(hex(2, -2)), f: flotilla(hex(0, -3)) };
    npcTurnEndStep(G, always(0), midRound);
    expect(G.npcs.m.position).toEqual(hex(2, -2));
    expect(G.npcs.f.position).not.toEqual(hex(0, -3));
    npcTurnEndStep(G, always(0), roundEnd);
    expect(G.npcs.m.position).not.toEqual(hex(2, -2));
  });

  it("draws no card for a seat out of the game, and still sails the merchants as the round ends", () => {
    const G = state();
    G.eventDeck = { drawPile: ["calmSeas"], log: [], drawn: 0 };
    G.lostShips = { "1": { cause: "sunk", score: 0, stashedGold: 0, eliminated: true } };
    G.npcs = { m: merchant(hex(2, -2)) };
    npcTurnEndStep(G, always(0), roundEnd);
    expect(G.eventDeck.log).toEqual([]);
    expect(G.npcs.m.position).not.toEqual(hex(2, -2));
  });

  it("does nothing while a fight is under way: nothing sails and no card is drawn", () => {
    const G = state({ attackerId: "0", defenderId: "1" } as CombatState);
    G.eventDeck = { drawPile: ["merchantConvoy"], log: [], drawn: 0 };
    G.npcs = { m: merchant(hex(2, -2)) };
    npcTurnEndStep(G, always(0), roundEnd);
    expect(G.npcs.m.position).toEqual(hex(2, -2));
    expect(G.eventDeck.drawPile).toEqual(["merchantConvoy"]);
  });
});
