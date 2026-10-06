import { describe, it, expect } from "vitest";
import type { FacetGeometryData } from "./facetBuilder";
import {
  BUILDING_FOOTING,
  BUILDING_HALF_DIAGONAL,
  BUILDING_HEIGHT,
  BUILDING_MAX_HEIGHT,
  WINDOW_EAVE_MARGIN,
  type BuildingColors,
} from "./buildingGeometry";
import {
  addHouseV2RoofSlab,
  buildHouseGeometryV2,
  HOUSE_V2_EAVE_UNDERSIDE,
  HOUSE_V2_HALF_DIAGONAL,
  HOUSE_V2_HEIGHT,
  HOUSE_V2_RIDGE_BEAM,
  HOUSE_V2_ROOF_OVERHANG,
  HOUSE_V2_ROOF_THICKNESS,
  HOUSE_V2_TRIANGLE_BUDGET,
  HOUSE_V2_TRIANGLES,
} from "./buildingGeometryV2";
import { createFacetBuilder } from "./facetBuilder";

const colors: BuildingColors = {
  wall: [0.9, 0.86, 0.78],
  roof: [0.45, 0.12, 0.06],
  timber: [0.12, 0.08, 0.05],
  stone: [0.3, 0.28, 0.25],
};

const house = buildHouseGeometryV2(colors);

type Vec3 = [number, number, number];
const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
const luminance = (c: readonly [number, number, number]) => (c[0] + c[1] + c[2]) / 3;

/** Which palette entry a (possibly shaded and jittered) vertex colour came from. */
function kindOf(c: Vec3): "wall" | "roof" | "timber" {
  if (luminance(c) > 0.4) return "wall";
  if (c[0] > 2 * c[1]) return "roof";
  return "timber";
}

describe("buildHouseGeometryV2", () => {
  it("records its triangle count under the budget", () => {
    expect(house.vertexCount % 3).toBe(0);
    expect(house.vertexCount / 3).toBe(HOUSE_V2_TRIANGLES);
    expect(HOUSE_V2_TRIANGLES).toBeLessThanOrEqual(HOUSE_V2_TRIANGLE_BUDGET);
    expect(HOUSE_V2_TRIANGLE_BUDGET).toBeLessThanOrEqual(240);
  });

  it("stores unit normals and a colour per vertex, with no degenerate face", () => {
    expect(house.colors).toHaveLength(house.vertexCount * 3);
    for (let i = 0; i < house.vertexCount; i++) expect(Math.hypot(...normal(house, i))).toBeCloseTo(1, 5);
    for (let t = 0; t < house.vertexCount / 3; t++) {
      const [a, b, c] = [vertex(house, t * 3), vertex(house, t * 3 + 1), vertex(house, t * 3 + 2)];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      expect(len).toBeGreaterThan(1e-9);
      // Flat shading throughout: the stored normal is the face normal.
      const stored = normal(house, t * 3);
      expect((stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]) / len).toBeCloseTo(1, 4);
    }
  });

  it("keeps the faceted house's contract: ground contact at the origin, a footing below, under the height cap", () => {
    let minY = Infinity;
    let maxY = -Infinity;
    let reach = 0;
    for (let i = 0; i < house.vertexCount; i++) {
      const [x, y, z] = vertex(house, i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      reach = Math.max(reach, Math.hypot(x, z));
    }
    expect(minY).toBeCloseTo(-BUILDING_FOOTING, 6);
    expect(maxY).toBeCloseTo(HOUSE_V2_HEIGHT, 5);
    expect(maxY).toBeLessThan(BUILDING_MAX_HEIGHT);
    // Same ridge as the faceted house; only the ridge cap stands a little proud.
    expect(HOUSE_V2_HEIGHT).toBeGreaterThanOrEqual(BUILDING_HEIGHT.house);
    expect(HOUSE_V2_HEIGHT).toBeLessThan(BUILDING_HEIGHT.house + 0.02);
    expect(reach).toBeLessThanOrEqual(HOUSE_V2_HALF_DIAGONAL + 1e-6);
    expect(reach).toBeGreaterThan(HOUSE_V2_HALF_DIAGONAL * 0.8);
    // The wider eaves grow the footprint a little past the faceted house's.
    expect(HOUSE_V2_HALF_DIAGONAL).toBeGreaterThan(BUILDING_HALF_DIAGONAL.house);
    expect(HOUSE_V2_HALF_DIAGONAL).toBeLessThan(0.2);
  });

  it("winds its faces outwards (positive signed volume) and faces its footing down", () => {
    let volume = 0;
    for (let t = 0; t < house.vertexCount / 3; t++) {
      const [a, b, c] = [vertex(house, t * 3), vertex(house, t * 3 + 1), vertex(house, t * 3 + 2)];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      if ([a, b, c].every((p) => Math.abs(p[1] + BUILDING_FOOTING) < 1e-6)) expect(normal(house, t * 3)[1]).toBeCloseTo(-1, 5);
    }
    expect(volume).toBeGreaterThan(0);
  });

  it("gives the roof a visible thickness and overhang", () => {
    expect(HOUSE_V2_ROOF_THICKNESS).toBeGreaterThanOrEqual(0.018);
    expect(HOUSE_V2_ROOF_OVERHANG).toBeGreaterThanOrEqual(0.02);
    let roofReachX = 0;
    let wallReachX = 0;
    for (let i = 0; i < house.vertexCount; i++) {
      const kind = kindOf(color(house, i));
      const x = Math.abs(vertex(house, i)[0]);
      if (kind === "roof") roofReachX = Math.max(roofReachX, x);
      if (kind === "wall") wallReachX = Math.max(wallReachX, x);
    }
    // The slab's outermost vertex is its chamfer corner, a bevel's worth short of the nominal eave line.
    expect(roofReachX - wallReachX).toBeGreaterThanOrEqual(HOUSE_V2_ROOF_OVERHANG * 0.8);
  });

  it("bevels the wall corners: wall facets at 45 degrees between two side faces", () => {
    let chamfers = 0;
    for (let i = 0; i < house.vertexCount; i++) {
      const n = normal(house, i);
      if (kindOf(color(house, i)) !== "wall") continue;
      if (Math.abs(Math.abs(n[0]) - Math.SQRT1_2) < 1e-4 && Math.abs(Math.abs(n[2]) - Math.SQRT1_2) < 1e-4 && Math.abs(n[1]) < 1e-6) chamfers++;
    }
    // Four vertical corner strips of two triangles.
    expect(chamfers).toBeGreaterThanOrEqual(4 * 2 * 3);
  });

  it("bevels the door and window: timber facets that are neither axis-aligned nor flat", () => {
    let chamfers = 0;
    let doorAtFront = false;
    for (let i = 0; i < house.vertexCount; i++) {
      if (kindOf(color(house, i)) !== "timber") continue;
      const n = normal(house, i);
      const [, y, z] = vertex(house, i);
      if (z > 0 && y > 0 && y < 0.07) doorAtFront = true;
      if (n.filter((v) => Math.abs(v) > 1e-6).length >= 2) chamfers++;
    }
    expect(doorAtFront).toBe(true);
    expect(chamfers).toBeGreaterThan(0);
  });

  it("bakes occlusion: wall vertices at the footing are darker than at mid-height, and the eave underside is dark", () => {
    let low = 0;
    let lowCount = 0;
    let mid = 0;
    let midCount = 0;
    let underEave = 0;
    let underEaveCount = 0;
    let roofTop = 0;
    let roofTopCount = 0;
    for (let i = 0; i < house.vertexCount; i++) {
      const c = color(house, i);
      const [, y] = vertex(house, i);
      const n = normal(house, i);
      const kind = kindOf(c);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (kind === "wall" && Math.abs(y) < 1e-6 && n[1] > -0.5) {
        low += luminance(c);
        lowCount++;
      }
      // The ring at the top of the ground band, clear of the ground shading (the eave band fades in above 0.04).
      if (kind === "wall" && y > 0.03 && y < 0.04) {
        mid += luminance(c);
        midCount++;
      }
      if (kind === "roof" && n[1] < -0.5) {
        underEave += luminance(c);
        underEaveCount++;
      }
      if (kind === "roof" && n[1] > 0.5) {
        roofTop += luminance(c);
        roofTopCount++;
      }
    }
    expect(lowCount).toBeGreaterThan(0);
    expect(midCount).toBeGreaterThan(0);
    expect(low / lowCount).toBeLessThan((mid / midCount) * 0.9);
    expect(underEaveCount).toBeGreaterThan(0);
    expect(underEave / underEaveCount).toBeLessThan((roofTop / roofTopCount) * 0.9);
  });

  it("jitters the wall colour but leaves the roof and timber flat", () => {
    const walls = new Set<number>();
    const roofs = new Set<number>();
    for (let i = 0; i < house.vertexCount; i++) {
      const c = color(house, i);
      const [x, y] = vertex(house, i);
      const n = normal(house, i);
      // Away from the ground and eave bands, where the occlusion bake varies the colour too.
      if (kindOf(c) === "wall" && y > 0.03 && y < 0.04) walls.add(Math.round(luminance(c) * 1e4));
      // The slab tops at their outer end (pitched, so their normal is at the roof's angle), clear of the ridge beam.
      if (kindOf(c) === "roof" && n[1] > 0.6 && n[1] < 0.8 && Math.abs(x) > 0.05) roofs.add(Math.round(luminance(c) * 1e4));
    }
    expect(walls.size).toBeGreaterThan(3);
    expect([...roofs]).toEqual([Math.round(luminance(colors.roof) * 1e4)]);
  });

  it("stops the walls and gables at the roof's underside instead of running up into the slabs", () => {
    const hw = 0.09;
    for (let i = 0; i < house.vertexCount; i++) {
      if (kindOf(color(house, i)) !== "wall") continue;
      const [x, y] = vertex(house, i);
      // The long walls end at the eave underside; only the gables rise above it, and only inboard.
      if (y > HOUSE_V2_EAVE_UNDERSIDE + 1e-9) expect(Math.abs(x)).toBeLessThan(hw);
      expect(y).toBeLessThanOrEqual(HOUSE_V2_HEIGHT - HOUSE_V2_ROOF_THICKNESS);
    }
  });

  it("seats the ridge beam on the slab tops and hides the slab ends inside it; the slabs meet on the midline", () => {
    const slope = 1;
    const beam = HOUSE_V2_RIDGE_BEAM;
    expect(beam.bottom).toBeCloseTo(0.19 - beam.halfWidth * slope, 9);
    for (const side of [-1, 1] as const) {
      const b = createFacetBuilder();
      addHouseV2RoofSlab(b, side, colors.roof);
      const slab = b.build();
      for (let i = 0; i < slab.vertexCount; i++) {
        const [x, y] = vertex(slab, i);
        // Nothing crosses the midline.
        expect(x * side).toBeGreaterThanOrEqual(-1e-9);
        // Whatever rises above the beam's bottom is within the beam's width.
        if (y > beam.bottom + 1e-9) expect(Math.abs(x)).toBeLessThan(beam.halfWidth);
        expect(y).toBeLessThan(beam.top);
      }
    }
  });

  it("stands the door and window on the wall plane with open backs, the window under the eave", () => {
    let minZ = Infinity;
    let windowTop = -Infinity;
    for (let t = 0; t < house.vertexCount / 3; t++) {
      if (kindOf(color(house, t * 3)) !== "timber") continue;
      expect(normal(house, t * 3)[2]).toBeGreaterThan(-1e-9);
      for (let k = 0; k < 3; k++) {
        const [, y, z] = vertex(house, t * 3 + k);
        minZ = Math.min(minZ, z);
        if (y > 0.07) windowTop = Math.max(windowTop, y);
      }
    }
    expect(minZ).toBeCloseTo(0.07, 9);
    expect(windowTop).toBeLessThanOrEqual(HOUSE_V2_EAVE_UNDERSIDE - WINDOW_EAVE_MARGIN + 1e-9);
  });

  it("is deterministic", () => {
    expect(buildHouseGeometryV2(colors).positions).toEqual(house.positions);
    expect(buildHouseGeometryV2(colors).colors).toEqual(house.colors);
  });
});
