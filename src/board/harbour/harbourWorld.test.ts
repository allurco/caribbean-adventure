import { describe, expect, it } from "vitest";
import { createWrap } from "../../game/hex";
import { getMapPreset } from "../../game/mapConfig";
import type { GeneratedMap } from "../../game/mapRequest";
import type { MapCell } from "../../game/types";
import { buildHarbourWorld } from "./harbourWorld";
import { harbourTarget } from "./harbourView";

const CELLS: MapCell[] = [
  { hex: { q: 0, r: 0, s: 0 }, terrain: "water", hasPort: false, elevation: 0 },
  { hex: { q: 1, r: 0, s: -1 }, terrain: "island", hasPort: true, elevation: 1 },
];
const MAP: GeneratedMap = { mapSize: "small", mapSeed: 7, cells: CELLS, regions: [] };

describe("buildHarbourWorld", () => {
  it("is the generated map, its wrap and seed, and the harbour the camera looks at", async () => {
    const world = await buildHarbourWorld(async () => MAP);
    expect(world.cells).toBe(CELLS);
    expect(world.seed).toBe(7);
    expect(world.wrap).toEqual(createWrap(getMapPreset("small").columns));
    expect(world.target).toEqual(harbourTarget(CELLS));
  });
});
