import { describe, it, expect } from "vitest";
import { hex, hexEquals, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { CaribbeanState, CombatState } from "./types";
import { MERCHANT_SPAWN_CHANCE, npcTurnEndStep } from "./npcTurnStep";

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

describe("the NPCs' step as a turn ends (#288)", () => {
  it("spawns a merchant on a roll under the spawn chance", () => {
    const G = state();
    npcTurnEndStep(G, always(MERCHANT_SPAWN_CHANCE - 0.01));
    expect(Object.values(G.npcs).map((n) => n.role)).toEqual(["MERCHANT"]);
  });

  it("spawns none on a roll at the spawn chance or over", () => {
    const G = state();
    npcTurnEndStep(G, always(MERCHANT_SPAWN_CHANCE));
    expect(G.npcs).toEqual({});
  });

  it("does nothing while a fight is under way: neither sails nor spawns", () => {
    const G = state({ attackerId: "0", defenderId: "1" } as CombatState);
    npcTurnEndStep(G, always(0));
    expect(G.npcs).toEqual({});
  });
});
