import { describe, it, expect } from "vitest";
import { createFacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import {
  addAgedRoof,
  AGED_ROOF_OVERHANG,
  agedRoofTriangles,
  MOSS_TINT,
  RIDGE_CAP_RISE,
  RIDGE_SAG,
  roofEaveUnderside,
  roofGableApex,
  roofReachU,
  roofTop,
  SUN_TINT,
  TILE_OVERSHOOT,
  tileStripCount,
  type AgedRoofSpec,
} from "./agedRoof";

const roof: [number, number, number] = [0.4, 0.14, 0.08];
const house: AgedRoofSpec = { halfU: 0.09, halfV: 0.07, eave: 0.1, ridge: 0.19, ridgeAlong: "z" };
const tavern: AgedRoofSpec = { halfU: 0.09, halfV: 0.11, eave: 0.17, ridge: 0.27, ridgeAlong: "x" };

const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];

function build(spec: AgedRoofSpec, seed = 1) {
  const b = createFacetBuilder();
  const range = addAgedRoof(b, spec, roof, seed);
  return { g: b.build(), range };
}

function triangleNormal(g: FacetGeometryData, t: number): Vec3 {
  const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

describe("addAgedRoof", () => {
  it("records its triangle count, flat-shaded with unit normals and no degenerate face", () => {
    for (const spec of [house, tavern]) {
      const { g, range } = build(spec);
      expect(range.from).toBe(0);
      expect(range.to).toBe(g.vertexCount);
      expect(g.vertexCount / 3).toBe(agedRoofTriangles(spec));
      expect(agedRoofTriangles(spec)).toBeLessThan(400);
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = triangleNormal(g, t);
        expect(Number.isFinite(n[0])).toBe(true);
        for (let k = 0; k < 3; k++) {
          const stored = normal(g, t * 3 + k);
          expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
          expect(stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("lays raised strips in rows along the ridge, unequal in length so the eave is uneven, a couple slipped down the slope", () => {
    const { g } = build(house);
    const count = tileStripCount(house);
    expect(count).toBeGreaterThanOrEqual(8);
    // Strip tops: faces looking up and out at the roof's pitch, above the slab's top plane.
    const rows = new Set<number>();
    const eaveReach: number[] = [];
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const n = normal(g, t * 3);
      if (n[1] < 0.6 || n[1] > 0.8) continue;
      const corners = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
      // The strip tops lie above the slab top: at |x| = 0.05 the slab top is at ridge − 0.05 × slope.
      const raised = corners.some((p) => p[1] > house.ridge - Math.abs(p[0]) * 1 + 0.003);
      if (!raised) continue;
      rows.add(Math.round(((corners[0][2] + corners[1][2] + corners[2][2]) / 3) * 1e3));
      eaveReach.push(Math.max(...corners.map((p) => Math.abs(p[0]))));
    }
    // Two slopes × count strips, each top in its own row (two triangles share a row).
    expect(rows.size).toBeGreaterThanOrEqual(count);
    const reaches = new Set(eaveReach.map((r) => Math.round(r * 1e4)));
    expect(reaches.size).toBeGreaterThan(count);
    const outermost = Math.max(...eaveReach);
    const nominal = house.halfU + AGED_ROOF_OVERHANG;
    expect(outermost).toBeGreaterThan(nominal + TILE_OVERSHOOT * 0.5);
    expect(outermost).toBeLessThanOrEqual(roofReachU(house) + 1e-6);
  });

  it("sags the ridge cap in the middle and keeps the roof's top at its declared height", () => {
    const { g } = build(house);
    let crestEnd = -Infinity;
    let crestMid = -Infinity;
    let top = -Infinity;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      top = Math.max(top, y);
      if (Math.abs(x) > 1e-6) continue;
      if (Math.abs(Math.abs(z) - (house.halfV + AGED_ROOF_OVERHANG)) < 1e-6) crestEnd = Math.max(crestEnd, y);
      if (Math.abs(z) < 1e-6) crestMid = Math.max(crestMid, y);
    }
    expect(crestEnd).toBeCloseTo(roofTop(house), 6);
    expect(crestEnd - crestMid).toBeCloseTo(RIDGE_SAG, 6);
    expect(top).toBeCloseTo(house.ridge + RIDGE_CAP_RISE, 6);
  });

  it("stops the slab undersides at the eave underside and meets the slabs at the gable apex", () => {
    const { g } = build(house);
    let undersides = 0;
    let apexFound = false;
    const slope = (house.ridge - house.eave) / house.halfU;
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const corners = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
      const n = normal(g, t * 3);
      const cx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
      // The slab undersides (looking down and back under the roof; the eave end faces look down and out):
      // their plane passes through the eave underside at the wall line.
      // The strips' closed bottoms lie on the slab's top plane, not under it.
      const onTop = corners.every(([x, y]) => Math.abs(y + Math.abs(x) * slope - house.ridge) < 1e-6);
      if (n[1] < -0.5 && n[0] * Math.sign(cx) < 0 && !onTop) {
        for (const [x, y] of corners) expect(y + Math.abs(x) * slope).toBeCloseTo(roofEaveUnderside(house) + house.halfU * slope, 6);
        undersides++;
      }
      for (const [x, y, z] of corners) {
        if (Math.abs(x) < 1e-9 && Math.abs(y - roofGableApex(house)) < 1e-6 && Math.abs(z) > house.halfV) apexFound = true;
      }
    }
    expect(undersides).toBe(2 * 2);
    expect(apexFound).toBe(true);
  });

  it("closes every strip underneath, so a strip hanging past the eave shows no hollow end from below (#91)", () => {
    for (const spec of [house, tavern]) {
      const { g } = build({ ...spec, ridgeAlong: "z" });
      const slope = (spec.ridge - spec.eave) / spec.halfU;
      let closed = 0;
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = normal(g, t * 3);
        if (n[1] > -0.5) continue;
        // On the slab's top plane: a strip's underside, not the slab's.
        const corners = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        if (corners.every(([x, y]) => Math.abs(y + Math.abs(x) * slope - spec.ridge) < 1e-6)) closed++;
      }
      expect(closed).toBe(2 * tileStripCount(spec) * 2);
    }
  });

  it("makes one slope mossy and the other pale", () => {
    const { g } = build(house);
    let moss = 0;
    let sun = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x] = vertex(g, i);
      const c = color(g, i);
      if (x < -0.01 && c[1] / c[0] > (roof[1] / roof[0]) * ((MOSS_TINT[1] / MOSS_TINT[0]) * 0.999)) moss++;
      if (x > 0.01 && c[0] / c[2] < (roof[0] / roof[2]) * (SUN_TINT[0] / SUN_TINT[2]) * 1.001) sun++;
    }
    expect(moss).toBeGreaterThan(100);
    expect(sun).toBeGreaterThan(100);
  });

  it("turns a ridge-along-x roof so the eaves run along x and the cap along x", () => {
    const { g } = build(tavern);
    let capReachX = 0;
    let maxZ = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      maxZ = Math.max(maxZ, Math.abs(z));
      if (y > tavern.ridge) capReachX = Math.max(capReachX, Math.abs(x));
    }
    expect(capReachX).toBeCloseTo(tavern.halfV + AGED_ROOF_OVERHANG, 6);
    expect(maxZ).toBeLessThanOrEqual(roofReachU(tavern) + 1e-6);
  });

  it("is deterministic and differs by seed", () => {
    expect(build(house, 3).g.positions).toEqual(build(house, 3).g.positions);
    expect(build(house, 3).g.positions).not.toEqual(build(house, 4).g.positions);
  });
});
