import { describe, expect, it } from "vitest";
import { seedRangeGaps } from "./seedBlocks";

describe("seedRangeGaps: do a sweep's seed ranges cover 1 to seeds exactly once", () => {
  it("finds nothing wrong with ranges that tile 1 to seeds", () => {
    expect(seedRangeGaps([[1, 100], [101, 200]], 200)).toEqual([]);
    expect(seedRangeGaps([[101, 200], [1, 100]], 200)).toEqual([]);
  });

  it("names the seeds no range covers", () => {
    expect(seedRangeGaps([[1, 100], [101, 200]], 300)).toEqual(["seeds 201 to 300 are not swept"]);
    expect(seedRangeGaps([[1, 10], [21, 30]], 30)).toEqual(["seeds 11 to 20 are not swept"]);
  });

  it("names the seeds swept twice and those past the end", () => {
    expect(seedRangeGaps([[1, 60], [51, 100]], 100)).toEqual(["seeds 51 to 60 are swept twice"]);
    expect(seedRangeGaps([[1, 100], [101, 120]], 100)).toEqual(["seeds 101 to 120 are past the last seed, 100"]);
  });
});
