import { describe, it, expect } from "vitest";
import {
  buildBuildingGeometry,
  BUILDING_FOOTING,
  BUILDING_HALF_DIAGONAL,
  BUILDING_HEIGHT,
  BUILDING_KINDS,
  BUILDING_MAX_HEIGHT,
  BUILDING_TRIANGLE_BUDGET,
  BUILDING_WALL_TOP,
  WINDOW_EAVE_MARGIN,
  windowBand,
  type BuildingColors,
  type BuildingGeometryData,
  type BuildingKind,
} from "./buildingGeometry";

const colors: BuildingColors = {
  wall: [0.9, 0.86, 0.78],
  roof: [0.45, 0.12, 0.06],
  timber: [0.12, 0.08, 0.05],
  stone: [0.3, 0.28, 0.25],
};

const built = Object.fromEntries(BUILDING_KINDS.map((k) => [k, buildBuildingGeometry(k, colors)])) as Record<
  BuildingKind,
  BuildingGeometryData
>;

function vertex(g: BuildingGeometryData, i: number): [number, number, number] {
  return [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
}
function color(g: BuildingGeometryData, i: number): [number, number, number] {
  return [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
}
const sameColor = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

describe("buildBuildingGeometry", () => {
  it("offers a warehouse, a tavern, a house and a watchtower", () => {
    expect(BUILDING_KINDS).toEqual(["warehouse", "tavern", "house", "watchtower"]);
  });

  it("builds flat-shaded non-degenerate triangles with unit face normals and a colour per vertex", () => {
    for (const g of Object.values(built)) {
      expect(g.vertexCount % 3).toBe(0);
      expect(g.colors).toHaveLength(g.vertexCount * 3);
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const len = Math.hypot(n[0], n[1], n[2]);
        expect(len).toBeGreaterThan(1e-8);
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k;
          const stored = [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
          expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
          expect((stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]) / len).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("keeps every kind within the triangle budget", () => {
    for (const g of Object.values(built)) {
      expect(g.vertexCount / 3).toBeLessThanOrEqual(BUILDING_TRIANGLE_BUDGET);
      expect(g.vertexCount / 3).toBeGreaterThanOrEqual(20);
    }
  });

  it("stands each kind at its declared height, under the half-unit cap, with the watchtower tallest", () => {
    expect(BUILDING_MAX_HEIGHT).toBe(0.5);
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let maxY = -Infinity;
      for (let i = 0; i < g.vertexCount; i++) maxY = Math.max(maxY, vertex(g, i)[1]);
      expect(maxY).toBeCloseTo(BUILDING_HEIGHT[kind], 6);
      expect(maxY).toBeLessThan(BUILDING_MAX_HEIGHT);
    }
    for (const kind of BUILDING_KINDS) {
      if (kind !== "watchtower") expect(BUILDING_HEIGHT.watchtower).toBeGreaterThan(BUILDING_HEIGHT[kind] + 0.1);
    }
  });

  it("buries a footing below the ground contact so a building on a slope never floats", () => {
    expect(BUILDING_FOOTING).toBeGreaterThanOrEqual(0.05);
    for (const g of Object.values(built)) {
      let minY = Infinity;
      for (let i = 0; i < g.vertexCount; i++) minY = Math.min(minY, vertex(g, i)[1]);
      expect(minY).toBeCloseTo(-BUILDING_FOOTING, 6);
    }
  });

  it("fits each kind's footprint inside its declared half-diagonal", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let reach = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, , z] = vertex(g, i);
        reach = Math.max(reach, Math.hypot(x, z));
      }
      expect(reach).toBeLessThanOrEqual(BUILDING_HALF_DIAGONAL[kind] + 1e-6);
      // Not wastefully generous either.
      expect(reach).toBeGreaterThan(BUILDING_HALF_DIAGONAL[kind] * 0.8);
      expect(BUILDING_HALF_DIAGONAL[kind]).toBeLessThan(0.2);
    }
  });

  it("winds faces outwards: the signed volume of every kind is positive and the tops face up", () => {
    for (const g of Object.values(built)) {
      let volume = 0;
      let maxY = -Infinity;
      for (let i = 0; i < g.vertexCount; i++) maxY = Math.max(maxY, vertex(g, i)[1]);
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        // Any face at the very bottom (the footing) looks down.
        if ([a, b, c].every((p) => Math.abs(p[1] + BUILDING_FOOTING) < 1e-6)) expect(g.normals[t * 9 + 1]).toBeCloseTo(-1, 5);
      }
      expect(volume).toBeGreaterThan(0);
    }
  });

  it("faces every wall and roof facet away from the building's axis", () => {
    for (const g of Object.values(built)) {
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = [g.normals[t * 9], g.normals[t * 9 + 1], g.normals[t * 9 + 2]];
        // Exempt: flat tops, anything facing down (a roof overhang's underside looks
        // down and in) and the timber fixtures, which stand proud of a wall.
        if (n[1] > 0.99 || n[1] < -0.3 || sameColor(color(g, t * 3), colors.timber)) continue;
        let cx = 0;
        let cz = 0;
        for (let k = 0; k < 3; k++) {
          cx += g.positions[(t * 3 + k) * 3] / 3;
          cz += g.positions[(t * 3 + k) * 3 + 2] / 3;
        }
        expect(cx * n[0] + cz * n[2]).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it("paints roofs in the roof colour, walls in wall or stone, and a door in timber on the front", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let roof = 0;
      let wall = 0;
      let timber = 0;
      let doorAtFront = false;
      for (let i = 0; i < g.vertexCount; i++) {
        const c = color(g, i);
        const [, y, z] = vertex(g, i);
        if (sameColor(c, colors.roof)) roof++;
        if (sameColor(c, colors.wall) || sameColor(c, colors.stone)) wall++;
        if (sameColor(c, colors.timber)) {
          timber++;
          if (z > 0 && y > 0 && y < 0.1) doorAtFront = true;
        }
      }
      expect(roof).toBeGreaterThan(0);
      expect(wall).toBeGreaterThan(0);
      expect(timber).toBeGreaterThan(0);
      expect(doorAtFront).toBe(true);
    }
    // The warehouse is timber-walled, the tavern and house whitewashed, the tower stone.
    const walls = (kind: BuildingKind, c: readonly number[]) => {
      const g = built[kind];
      let n = 0;
      for (let i = 0; i < g.vertexCount; i++) if (sameColor(color(g, i), c)) n++;
      return n;
    };
    expect(walls("tavern", colors.wall)).toBeGreaterThan(walls("tavern", colors.stone));
    expect(walls("house", colors.wall)).toBeGreaterThan(walls("house", colors.stone));
    expect(walls("watchtower", colors.stone)).toBeGreaterThan(walls("watchtower", colors.wall));
  });

  it("keeps every window under the eave line, so none cuts up through the roof", () => {
    expect(windowBand(0.17)).toEqual({ bottom: 0.1, top: 0.14 });
    expect(windowBand(0.1).top).toBeCloseTo(0.1 - WINDOW_EAVE_MARGIN, 9);
    expect(windowBand(0.1).top - windowBand(0.1).bottom).toBeCloseTo(0.04, 9);
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let windowTop = -Infinity;
      let windowBottom = Infinity;
      for (let i = 0; i < g.vertexCount; i++) {
        if (!sameColor(color(g, i), colors.timber)) continue;
        const [, y] = vertex(g, i);
        // Anything timber above the door is a window (or the tower's slit).
        if (y > 0.07) {
          windowTop = Math.max(windowTop, y);
          windowBottom = Math.min(windowBottom, y);
        }
      }
      if (kind === "warehouse") expect(windowTop).toBe(-Infinity);
      else {
        expect(windowTop).toBeLessThanOrEqual(BUILDING_WALL_TOP[kind] - WINDOW_EAVE_MARGIN + 1e-9);
        expect(windowBottom).toBeGreaterThan(0.07);
      }
    }
  });

  it("stands the door and windows on the wall plane with an open back, not inside the wall", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let minZ = Infinity;
      let count = 0;
      for (let t = 0; t < g.vertexCount / 3; t++) {
        if (!sameColor(color(g, t * 3), colors.timber)) continue;
        count++;
        // No face looks back into the wall.
        expect(g.normals[t * 9 + 2]).toBeGreaterThan(-1e-9);
        for (let k = 0; k < 3; k++) minZ = Math.min(minZ, vertex(g, t * 3 + k)[2]);
      }
      // Five faces per fixture (four sides and the front), as before.
      expect(count % 10).toBe(0);
      if (kind !== "watchtower") {
        // The fixture's back edge lies on the wall's front face.
        let wallFront = 0;
        for (let i = 0; i < g.vertexCount; i++) if (sameColor(color(g, i), colors.wall)) wallFront = Math.max(wallFront, vertex(g, i)[2]);
        expect(minZ).toBeCloseTo(wallFront, 9);
      }
    }
  });

  it("is deterministic and differs between kinds", () => {
    expect(buildBuildingGeometry("tavern", colors).positions).toEqual(built.tavern.positions);
    const counts = new Set(Object.values(built).map((g) => g.vertexCount));
    expect(counts.size).toBeGreaterThan(1);
  });
});
