import { describe, expect, it } from "vitest";
import type { GeneratedMap } from "../../game/mapRequest";
import type { MapCell } from "../../game/types";
import { buildHarbourWorld } from "./harbourWorld";

const CELLS: MapCell[] = [
  { hex: { q: 0, r: 0, s: 0 }, terrain: "water", hasPort: false, elevation: 0 },
  { hex: { q: 1, r: 0, s: -1 }, terrain: "island", hasPort: true, elevation: 1 },
];
const MAP: GeneratedMap = { mapSize: "small", mapSeed: 7, cells: CELLS, regions: [] };

describe("buildHarbourWorld", () => {
  it("generates the map, then runs each per-map build in order with the page let in before each", async () => {
    const log: string[] = [];
    const build = (name: string) => (cells: MapCell[], _wrap: unknown, seed: number) => {
      log.push(`${name}(${cells.length} cells, seed ${seed})`);
    };
    const world = await buildHarbourWorld({
      generateMap: async () => {
        log.push("map");
        return MAP;
      },
      builds: [build("field"), build("bake"), build("land"), build("decorations")],
      yieldToPage: async () => {
        log.push("yield");
      },
    });
    expect(log).toEqual([
      "map",
      "yield",
      "field(2 cells, seed 7)",
      "yield",
      "bake(2 cells, seed 7)",
      "yield",
      "land(2 cells, seed 7)",
      "yield",
      "decorations(2 cells, seed 7)",
    ]);
    expect(world.cells).toBe(CELLS);
    expect(world.seed).toBe(7);
  });
});
