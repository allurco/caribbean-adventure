/**
 * The seed sweeps split across files drop no seed: each map size's ranges
 * cover 1 to the sweep's seeds exactly once, and there is one test file per
 * range. Raising a sweep's seeds without adding its files fails here.
 */
import { describe, expect, it } from "vitest";
import { MAP_PRESETS } from "../game/mapConfig";
import { seedRangeGaps } from "./seedBlocks";
import { DRAFT_SWEEP_SIZES } from "./draftPlacementSweep";
import { VILLAGE_SEEDS, VILLAGE_SWEEP_RANGES } from "./villagePlacementSweep";

/** The test files' names, not loaded: only the glob's keys are read. */
const fileNames = (paths: Record<string, unknown>): string[] => Object.keys(paths).map((path) => path.split("/").pop()!).sort();

describe("the split seed sweeps", () => {
  const sizes = MAP_PRESETS.map((preset) => preset.id);

  it("sweep village placement over seeds 1 to VILLAGE_SEEDS exactly once on every map size", () => {
    for (const size of sizes) expect(seedRangeGaps(VILLAGE_SWEEP_RANGES[size], VILLAGE_SEEDS), size).toEqual([]);
  });

  it("have one village placement test file per range", () => {
    const expected = sizes.flatMap((size) => VILLAGE_SWEEP_RANGES[size].map(([first, last]) => `villagePlacement.${size}.${first}-${last}.test.ts`)).sort();
    expect(fileNames(import.meta.glob("../board/visuals/villagePlacement.*.test.ts"))).toEqual(expected);
  });

  it("have one draft placement test file per map size", () => {
    expect([...DRAFT_SWEEP_SIZES].sort()).toEqual([...sizes].sort());
    expect(fileNames(import.meta.glob("../game/draftPlacement.*.test.ts"))).toEqual(sizes.map((size) => `draftPlacement.${size}.test.ts`).sort());
  });
});
