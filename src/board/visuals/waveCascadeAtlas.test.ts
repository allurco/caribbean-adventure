import { describe, expect, it } from "vitest";
import { atlasBlockCount, displacementBlockColumn, packCascadeAtlas } from "./waveCascadeAtlas";

describe("the working atlas layout (#38 step 8)", () => {
  it("holds one block per cascade and one more per displaced cascade", () => {
    expect(atlasBlockCount(3, [0, 1])).toBe(5);
    expect(atlasBlockCount(3, [])).toBe(3);
  });

  it("puts displaced cascade d's block after every cascade's own", () => {
    expect(displacementBlockColumn(3, 0, 256)).toBe(3 * 256);
    expect(displacementBlockColumn(3, 1, 256)).toBe(4 * 256);
  });
});

/** A 2×2 RGBA grid whose texel (x, z) holds (tag, x, z, 0). */
const grid = (tag: number) => {
  const data = new Float32Array(2 * 2 * 4);
  for (let z = 0; z < 2; z++) {
    for (let x = 0; x < 2; x++) data.set([tag, x, z, 0], (z * 2 + x) * 4);
  }
  return data;
};

describe("packCascadeAtlas", () => {
  it("lays the grids side by side: cascade c's texel (x, z) lands at atlas texel (c·size + x, z)", () => {
    const atlas = packCascadeAtlas([grid(7), grid(8), grid(9)], 2);
    expect(atlas).toHaveLength(6 * 2 * 4);
    const texel = (x: number, z: number) => Array.from(atlas.subarray((z * 6 + x) * 4, (z * 6 + x) * 4 + 4));
    expect(texel(0, 0)).toEqual([7, 0, 0, 0]);
    expect(texel(1, 1)).toEqual([7, 1, 1, 0]);
    expect(texel(2, 0)).toEqual([8, 0, 0, 0]);
    expect(texel(5, 1)).toEqual([9, 1, 1, 0]);
  });

  it("refuses a grid of the wrong size", () => {
    expect(() => packCascadeAtlas([grid(1), new Float32Array(4)], 2)).toThrow();
  });
});
