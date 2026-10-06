import { describe, it, expect } from "vitest";
import { Color } from "three";
import { PORT_NATIONS } from "../../game/types";
import type { FacetGeometryData, Vec3 } from "./facetBuilder";
import {
  buildNationFlagGeometry,
  FLAG_HEIGHT,
  FLAG_HEX,
  FLAG_RIPPLE,
  FLAG_TRIANGLES,
  FLAG_WIDTH,
  flagRgb,
  NATION_FLAG_CELLS,
} from "./nationFlagGeometry";

const hoist: Vec3 = [0.006, 0.49, 0];
const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];

describe("nation flags", () => {
  it("gives every port nation a 3 × 3 layout in the HUD's bands: a cross, a tricolore, two tribands and a pirate field", () => {
    for (const nation of PORT_NATIONS) expect(NATION_FLAG_CELLS[nation]).toHaveLength(3);
    expect(NATION_FLAG_CELLS.England[1]).toEqual(["red", "red", "red"]);
    expect(NATION_FLAG_CELLS.England[0]).toEqual(["white", "red", "white"]);
    expect(NATION_FLAG_CELLS.France.map((r) => r[0])).toEqual(["frenchBlue", "frenchBlue", "frenchBlue"]);
    expect(NATION_FLAG_CELLS.France[0]).toEqual(["frenchBlue", "white", "red"]);
    expect(NATION_FLAG_CELLS.Spain.map((r) => r[1])).toEqual(["red", "yellow", "red"]);
    expect(NATION_FLAG_CELLS.Netherlands.map((r) => r[1])).toEqual(["orange", "white", "dutchBlue"]);
    expect(NATION_FLAG_CELLS.Pirate[1][1]).toBe("white");
    expect(NATION_FLAG_CELLS.Pirate[0][0]).toBe("black");
  });

  it("converts its sRGB colours to linear exactly as three does", () => {
    for (const name of Object.keys(FLAG_HEX) as (keyof typeof FLAG_HEX)[]) {
      const c = new Color(FLAG_HEX[name]);
      const [r, g, b] = flagRgb(name);
      expect(r).toBeCloseTo(c.r, 5);
      expect(g).toBeCloseTo(c.g, 5);
      expect(b).toBeCloseTo(c.b, 5);
    }
  });

  it("builds a two-sided rippled rectangle hanging from the hoist along +x, 36 triangles", () => {
    for (const nation of PORT_NATIONS) {
      const g = buildNationFlagGeometry(nation, hoist);
      expect(g.vertexCount / 3).toBe(FLAG_TRIANGLES);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let maxZ = 0;
      let front = 0;
      let back = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, Math.abs(z));
        expect(Math.hypot(...normal(g, i))).toBeCloseTo(1, 5);
        if (normal(g, i)[2] > 0) front++;
        else back++;
      }
      expect(minX).toBeCloseTo(hoist[0], 6);
      expect(maxX).toBeCloseTo(hoist[0] + FLAG_WIDTH, 6);
      expect(maxY).toBeCloseTo(hoist[1], 6);
      expect(minY).toBeCloseTo(hoist[1] - FLAG_HEIGHT, 6);
      expect(maxZ).toBeGreaterThan(FLAG_RIPPLE * 0.5);
      expect(maxZ).toBeLessThanOrEqual(FLAG_RIPPLE + 1e-9);
      expect(front).toBe(back);
    }
  });

  it("colours the cells per nation: Spain's middle row yellow, France's hoist column blue", () => {
    const spain = buildNationFlagGeometry("Spain", hoist);
    const france = buildNationFlagGeometry("France", hoist);
    const yellow = flagRgb("yellow");
    const blue = flagRgb("frenchBlue");
    for (let i = 0; i < spain.vertexCount; i++) {
      const [, y] = vertex(spain, i);
      const c = color(spain, i);
      // A vertex strictly inside the middle band in y belongs to a middle-row cell.
      if (y < hoist[1] - FLAG_HEIGHT / 3 - 1e-6 && y > hoist[1] - (2 * FLAG_HEIGHT) / 3 + 1e-6) {
        for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(yellow[k], 5);
      }
    }
    let blueAtHoist = 0;
    for (let i = 0; i < france.vertexCount; i++) {
      const [x] = vertex(france, i);
      const c = color(france, i);
      if (Math.abs(x - hoist[0]) < 1e-6) {
        expect(c[2]).toBeCloseTo(blue[2], 5);
        blueAtHoist++;
      }
    }
    expect(blueAtHoist).toBeGreaterThan(0);
  });
});
