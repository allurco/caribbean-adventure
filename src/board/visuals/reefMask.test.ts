import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hex, hexGrid, hexToWorld, neighbors, worldToHex } from "../../game/hex";
import { createReefMask, REEF_EDGE_SOFTNESS } from "./reefMask";

const INRADIUS = Math.sqrt(3) / 2;

/** A radius-4 water map with the given hexes (axial "q,r") as reefs and one island hex. */
function mapWith(reefs: readonly string[]): MapCell[] {
  return hexGrid(4).map((h) => {
    const key = `${h.q},${h.r}`;
    const terrain: MapCell["terrain"] = reefs.includes(key) ? "reef" : key === "-3,0" ? "island" : "water";
    return { hex: h, terrain, hasPort: false, elevation: terrain === "island" ? 1 : 0 };
  });
}

/** World (x, z) a fraction `t` of the way from hex a's centre to hex b's. */
function between(a: [number, number, number], b: [number, number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
}

describe("reefMask", () => {
  it("is 1 at the centre of a reef hex", () => {
    const mask = createReefMask(mapWith(["0,0"]));
    const [x, , z] = hexToWorld(hex(0, 0));
    expect(mask(x, z)).toBe(1);
  });

  it("is 0 everywhere inside water, island and off-map hexes", () => {
    const cells = mapWith(["0,0", "1,0"]);
    const mask = createReefMask(cells);
    for (let x = -8; x <= 8; x += 0.07) {
      for (let z = -8; z <= 8; z += 0.07) {
        const h = worldToHex(x, z);
        const isReef = (h.q === 0 && h.r === 0) || (h.q === 1 && h.r === 0);
        if (!isReef) expect(mask(x, z)).toBe(0);
      }
    }
  });

  it("stays within [0, 1]", () => {
    const mask = createReefMask(mapWith(["0,0", "1,0", "0,1"]));
    for (let x = -4; x <= 4; x += 0.05) {
      for (let z = -4; z <= 4; z += 0.05) {
        const m = mask(x, z);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
  });

  it("fades to 0 at an edge shared with a non-reef hex, over REEF_EDGE_SOFTNESS", () => {
    const mask = createReefMask(mapWith(["0,0"]));
    const centre = hexToWorld(hex(0, 0));
    for (const n of neighbors(hex(0, 0))) {
      const other = hexToWorld(n);
      // The shared edge is halfway between the centres (√3 apart), at the inradius.
      const [ex, ez] = between(centre, other, 0.5 - 1e-6);
      expect(mask(ex, ez)).toBeLessThan(0.01);
      const [hx, hz] = between(centre, other, 0.5 - REEF_EDGE_SOFTNESS / 2 / Math.sqrt(3));
      expect(mask(hx, hz)).toBeGreaterThan(0.2);
      expect(mask(hx, hz)).toBeLessThan(0.8);
      const [fx, fz] = between(centre, other, 0.5 - (REEF_EDGE_SOFTNESS + 0.01) / Math.sqrt(3));
      expect(mask(fx, fz)).toBe(1);
    }
  });

  it("rises monotonically from the edge to the centre", () => {
    const mask = createReefMask(mapWith(["0,0"]));
    const centre = hexToWorld(hex(0, 0));
    const other = hexToWorld(hex(1, 0));
    let previous = -1;
    for (let t = 0.5; t >= 0; t -= 0.01) {
      const [x, z] = between(centre, other, t);
      const m = mask(x, z);
      expect(m).toBeGreaterThanOrEqual(previous);
      previous = m;
    }
  });

  it("has no seam between two adjacent reef hexes", () => {
    const mask = createReefMask(mapWith(["0,0", "1,0"]));
    const a = hexToWorld(hex(0, 0));
    const b = hexToWorld(hex(1, 0));
    for (let t = 0; t <= 1; t += 0.02) {
      const [x, z] = between(a, b, t);
      expect(mask(x, z)).toBe(1);
    }
  });

  it("keeps the soft rim narrow enough that the reef interior stays fully masked", () => {
    expect(REEF_EDGE_SOFTNESS).toBeGreaterThan(0);
    expect(REEF_EDGE_SOFTNESS).toBeLessThan(INRADIUS / 2);
  });

  it("is 0 everywhere on a map with no reefs", () => {
    const mask = createReefMask(mapWith([]));
    for (let x = -6; x <= 6; x += 0.25) {
      for (let z = -6; z <= 6; z += 0.25) expect(mask(x, z)).toBe(0);
    }
  });
});
