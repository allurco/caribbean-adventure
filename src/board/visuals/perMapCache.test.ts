import { describe, expect, it } from "vitest";
import { createWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { perMapCache } from "./perMapCache";

const cells = (): MapCell[] => [];

describe("perMapCache", () => {
  it("builds once per map and wrap, however many times it is asked (remounts, suspended renders, world copies)", () => {
    let builds = 0;
    const landMesh = perMapCache(() => ++builds);
    const map = cells();
    const wrap = createWrap(8);
    expect(landMesh(map, wrap, 1)).toBe(1);
    expect(landMesh(map, wrap, 1)).toBe(1);
    expect(landMesh(map, createWrap(8), 1)).toBe(1);
    expect(builds).toBe(1);
  });

  it("builds again for a new map or a different wrap", () => {
    let builds = 0;
    const landMesh = perMapCache(() => ++builds);
    const map = cells();
    landMesh(map, null, 1);
    landMesh(map, createWrap(8), 1);
    landMesh(cells(), createWrap(8), 1);
    expect(builds).toBe(3);
  });

  it("builds again for a different world seed on the same cells", () => {
    let builds = 0;
    const landMesh = perMapCache((_cells, _wrap, worldSeed) => {
      builds++;
      return worldSeed;
    });
    const map = cells();
    expect(landMesh(map, null, 1)).toBe(1);
    expect(landMesh(map, null, 2)).toBe(2);
    expect(landMesh(map, null, 2)).toBe(2);
    expect(builds).toBe(2);
  });

  it("keeps separate caches apart", () => {
    const a = perMapCache(() => "a");
    const b = perMapCache(() => "b");
    const map = cells();
    expect(a(map, null, 0)).toBe("a");
    expect(b(map, null, 0)).toBe("b");
  });
});
