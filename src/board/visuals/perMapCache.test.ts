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
    expect(landMesh(map, wrap)).toBe(1);
    expect(landMesh(map, wrap)).toBe(1);
    expect(landMesh(map, createWrap(8))).toBe(1);
    expect(builds).toBe(1);
  });

  it("builds again for a new map or a different wrap", () => {
    let builds = 0;
    const landMesh = perMapCache(() => ++builds);
    const map = cells();
    landMesh(map, null);
    landMesh(map, createWrap(8));
    landMesh(cells(), createWrap(8));
    expect(builds).toBe(3);
  });

  it("keeps separate caches apart", () => {
    const a = perMapCache(() => "a");
    const b = perMapCache(() => "b");
    const map = cells();
    expect(a(map, null)).toBe("a");
    expect(b(map, null)).toBe("b");
  });
});
