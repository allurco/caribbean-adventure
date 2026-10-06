import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import {
  createWrap,
  hex,
  hexEquals,
  hexGrid,
  hexRect,
  hexToWorld,
  nearestImage,
  neighbors,
  offsetToHex,
  worldToHex,
  wrapWorldWidth,
} from "../../game/hex";
import { createReefMask, createReefOutward, REEF_EDGE_SOFTNESS } from "./reefMask";

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

  describe("on a map that wraps east–west (#36)", () => {
    const columns = 8;
    const wrap = createWrap(columns);
    const width = wrapWorldWidth(wrap);
    // Reefs in the last column and the first, either side of the seam.
    const east = offsetToHex(columns - 1, 2);
    const west = offsetToHex(0, 2);
    const cells: MapCell[] = hexRect(columns, 5).map((h) => {
      const reef = hexEquals(h, east) || hexEquals(h, west);
      return { hex: h, terrain: reef ? "reef" : "water", hasPort: false, elevation: 0 };
    });

    it("has no rim where a reef meets a reef across the seam", () => {
      const mask = createReefMask(cells, wrap);
      const a = hexToWorld(east);
      const b = hexToWorld(nearestImage(east, west, wrap));
      for (let t = 0; t <= 1; t += 0.02) {
        const [x, z] = between(a, b, t);
        expect(mask(x, z)).toBe(1);
      }
    });

    it("repeats every wrap width", () => {
      const mask = createReefMask(cells, wrap);
      for (let x = -3; x <= 3; x += 0.1) {
        for (let z = 2; z <= 6; z += 0.2) expect(mask(x + width, z)).toBeCloseTo(mask(x, z), 9);
      }
    });
  });

  it("is 0 everywhere on a map with no reefs", () => {
    const mask = createReefMask(mapWith([]));
    for (let x = -6; x <= 6; x += 0.25) {
      for (let z = -6; z <= 6; z += 0.25) expect(mask(x, z)).toBe(0);
    }
  });
});

describe("createReefOutward (#38 step 7)", () => {
  it("points from a reef hex out across its nearest rim edge", () => {
    const outward = createReefOutward(mapWith(["0,0"]));
    const centre = hexToWorld(hex(0, 0));
    for (const n of neighbors(hex(0, 0))) {
      const other = hexToWorld(n);
      const [x, z] = between(centre, other, 0.4);
      const [ox, oz] = outward(x, z);
      const expected = [(other[0] - centre[0]) / Math.sqrt(3), (other[2] - centre[2]) / Math.sqrt(3)];
      expect(ox).toBeCloseTo(expected[0], 9);
      expect(oz).toBeCloseTo(expected[1], 9);
    }
  });

  it("is a unit vector everywhere on a reef with a rim", () => {
    const outward = createReefOutward(mapWith(["0,0", "1,0"]));
    for (let x = -1.5; x <= 3; x += 0.1) {
      for (let z = -1; z <= 1; z += 0.1) {
        const h = worldToHex(x, z);
        if (!((h.q === 0 && h.r === 0) || (h.q === 1 && h.r === 0))) continue;
        const [ox, oz] = outward(x, z);
        expect(Math.hypot(ox, oz)).toBeCloseTo(1, 9);
      }
    }
  });

  it("ignores edges shared by two reef hexes: between them it looks across the outer rim", () => {
    const outward = createReefOutward(mapWith(["0,0", "1,0"]));
    const a = hexToWorld(hex(0, 0));
    const b = hexToWorld(hex(1, 0));
    const [x, z] = between(a, b, 0.5);
    const [ox] = outward(x, z);
    // The shared edge runs across x; its own normal would be (±1, 0). The
    // nearest outer edges run obliquely, so the outward normal is not along x.
    expect(Math.abs(ox)).toBeLessThan(0.99);
  });

  it("is zero off the reef", () => {
    const outward = createReefOutward(mapWith(["0,0"]));
    const [x, , z] = hexToWorld(hex(2, 0));
    expect(outward(x, z)).toEqual([0, 0]);
    expect(createReefOutward(mapWith([]))(0, 0)).toEqual([0, 0]);
  });

  it("repeats every wrap width", () => {
    const columns = 8;
    const wrap = createWrap(columns);
    const width = wrapWorldWidth(wrap);
    const reef = offsetToHex(columns - 1, 2);
    const cells: MapCell[] = hexRect(columns, 5).map((h) => ({
      hex: h,
      terrain: hexEquals(h, reef) ? "reef" : "water",
      hasPort: false,
      elevation: 0,
    }));
    const outward = createReefOutward(cells, wrap);
    const [cx, , cz] = hexToWorld(reef);
    for (let dx = -0.8; dx <= 0.8; dx += 0.1) {
      const here = outward(cx + dx, cz + 0.3);
      const there = outward(cx + dx + width, cz + 0.3);
      expect(there[0]).toBeCloseTo(here[0], 9);
      expect(there[1]).toBeCloseTo(here[1], 9);
    }
  });
});
