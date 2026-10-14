import { describe, it, expect } from "vitest";
import { pinnedMapUrl, randomMapSeed, seedStepForKey, stepSeed, steppedSeedUrl } from "./seedStepUrl";
import { isValidMapSeed } from "../game/mapSeed";
import { parseDevUrlParams } from "./devUrlParams";

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe("stepSeed", () => {
  it("goes one down for prev and one up for next", () => {
    expect(stepSeed(7, "prev")).toBe(6);
    expect(stepSeed(7, "next")).toBe(8);
    expect(stepSeed(0, "prev")).toBe(-1);
  });

  it("wraps round int32, so every step names a valid seed", () => {
    expect(stepSeed(INT32_MAX, "next")).toBe(INT32_MIN);
    expect(stepSeed(INT32_MIN, "prev")).toBe(INT32_MAX);
  });
});

describe("randomMapSeed", () => {
  it("spans int32 and is always a valid seed", () => {
    expect(randomMapSeed(() => 0)).toBe(INT32_MIN);
    expect(randomMapSeed(() => 0.999999999999)).toBe(INT32_MAX);
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) expect(isValidMapSeed(randomMapSeed(() => r))).toBe(true);
  });
});

describe("seedStepForKey", () => {
  it("maps [ to prev, ] to next and \\ to random", () => {
    expect(seedStepForKey("[")).toBe("prev");
    expect(seedStepForKey("]")).toBe("next");
    expect(seedStepForKey("\\")).toBe("random");
  });

  it("ignores every other key", () => {
    for (const key of ["a", "Enter", "{", "}", "|", " "]) expect(seedStepForKey(key)).toBeNull();
  });
});

describe("pinnedMapUrl", () => {
  it("pins the current map's size and seed, keeping every other parameter", () => {
    const url = pinnedMapUrl("http://localhost:5173/?cx=12&cz=13.9&dist=3.4&stats=1#x", { mapSize: "medium", mapSeed: 42 });
    expect(params(url)).toEqual({ cx: "12", cz: "13.9", dist: "3.4", stats: "1", size: "medium", seed: "42" });
    expect(new URL(url).hash).toBe("#x");
    expect(new URL(url).pathname).toBe("/");
  });

  it("replaces a size and seed already in the URL with the map's own", () => {
    const url = pinnedMapUrl("http://localhost:5173/?size=small&seed=1", { mapSize: "large", mapSeed: 9 });
    expect(params(url)).toEqual({ size: "large", seed: "9" });
  });

  it("reproduces the map it was taken from through the dev URL parser", () => {
    const url = pinnedMapUrl("http://localhost:5173/", { mapSize: "small", mapSeed: -5 });
    expect(parseDevUrlParams(new URL(url).search).setupData).toEqual({ mapSize: "small", mapSeed: -5 });
  });
});

describe("steppedSeedUrl", () => {
  const href = "http://localhost:5173/?size=small&seed=1&cx=12&cz=13.9&dist=3.4";
  const map = { mapSize: "small" as const, mapSeed: 1 };

  it("reloads on seed − 1 and seed + 1 with the same size and camera", () => {
    expect(params(steppedSeedUrl(href, map, "prev", () => 0.5))).toEqual({ size: "small", seed: "0", cx: "12", cz: "13.9", dist: "3.4" });
    expect(params(steppedSeedUrl(href, map, "next", () => 0.5))).toEqual({ size: "small", seed: "2", cx: "12", cz: "13.9", dist: "3.4" });
  });

  it("reloads on a random seed from the given source with the same size and camera", () => {
    const url = steppedSeedUrl(href, map, "random", () => 0.75);
    expect(params(url)).toEqual({ size: "small", seed: String(randomMapSeed(() => 0.75)), cx: "12", cz: "13.9", dist: "3.4" });
  });

  it("pins the size the map was generated at when the URL left it random", () => {
    const url = steppedSeedUrl("http://localhost:5173/?dist=20", { mapSize: "large", mapSeed: 100 }, "next", () => 0);
    expect(params(url)).toEqual({ dist: "20", size: "large", seed: "101" });
  });
});
