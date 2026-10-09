import { describe, it, expect } from "vitest";
import { generateMapFor, resolveMapRequest } from "./mapRequest";
import { generateMap } from "./mapGenerator";
import { getMapPreset } from "./mapConfig";
import { createWrap } from "./hex";

/** A stand-in for a random source that returns `values` in turn. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++];
}

describe("resolveMapRequest", () => {
  it("keeps a pinned size and a valid seed without drawing a random number", () => {
    const random = () => {
      throw new Error("no random number should be drawn");
    };
    expect(resolveMapRequest({ mapSize: "large", mapSeed: -7 }, random)).toEqual({ mapSize: "large", mapSeed: -7 });
  });

  it("picks the size from the first random number and the seed from the next", () => {
    expect(resolveMapRequest(undefined, sequence(0.5, 0.25))).toEqual({ mapSize: "medium", mapSeed: 250000 });
    expect(resolveMapRequest(undefined, sequence(0, 0.999999))).toEqual({ mapSize: "small", mapSeed: 999999 });
    expect(resolveMapRequest(undefined, sequence(0.9, 0))).toEqual({ mapSize: "large", mapSeed: 0 });
  });

  it("replaces a seed that does not name exactly one map with a random one (#82)", () => {
    for (const mapSeed of [1.5, 2147483648, Number.NaN]) {
      expect(resolveMapRequest({ mapSize: "small", mapSeed }, sequence(0.5))).toEqual({ mapSize: "small", mapSeed: 500000 });
    }
  });
});

describe("generateMapFor", () => {
  it("generates the size's preset, wrapped east–west, from the seed", () => {
    for (const mapSize of ["small", "medium", "large"] as const) {
      const preset = getMapPreset(mapSize);
      expect(generateMapFor({ mapSize, mapSeed: 31337 })).toEqual(generateMap(preset, 31337, createWrap(preset.columns)));
    }
  });
});
