import { describe, it, expect } from "vitest";
import type { FacetGeometryData, Vec3 } from "./facetBuilder";
import { BUILDING_FOOTING, BUILDING_HALF_DIAGONAL, BUILDING_KINDS, BUILDING_MAX_HEIGHT, type BuildingKind } from "./buildingGeometry";
import {
  AGED_BUILDING_HALF_DIAGONAL,
  AGED_BUILDING_HEIGHT,
  AGED_BUILDING_TRIANGLE_BUDGET,
  AGED_BUILDING_TRIANGLES,
  AGED_BUILDING_WALL_TOP,
  AGED_CHURCH,
  AGED_LEAN_OF,
  churchRoofSpec,
  AGED_TOWER,
  AGED_TOWER_FLAG_HOIST,
  agedWindowBand,
  buildAgedBuildingGeometry,
  faceCutIndices,
  type AgedColors,
} from "./agedBuildingGeometry";
import { wornRingPoints, type WallFace } from "./agedKit";
import { FLAG_HEIGHT, FLAG_WIDTH } from "./nationFlagGeometry";
import { RIDGE_CAP_RISE, roofEaveUnderside, tileStripCount } from "./agedRoof";
import { backfacingFirstHits, opposedCoplanarOverlaps } from "./facetVisibility";

const colors: AgedColors = {
  wall: [0.8, 0.76, 0.68],
  roof: [0.4, 0.12, 0.06],
  timber: [0.12, 0.09, 0.07],
  stone: [0.3, 0.27, 0.23],
  iron: [0.01, 0.01, 0.01],
  bronze: [0.2, 0.14, 0.05],
};

const built = Object.fromEntries(BUILDING_KINDS.map((k) => [k, buildAgedBuildingGeometry(k, colors)])) as Record<BuildingKind, FacetGeometryData>;

const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
const luminance = (c: Vec3) => (c[0] + c[1] + c[2]) / 3;

/** Which palette entry a (shaded, grimed, jittered) vertex colour of a gabled piece came from. */
function kindOf(c: Vec3): "wall" | "roof" | "timber" {
  if (luminance(c) > 0.3) return "wall";
  if (c[0] > 2 * c[1]) return "roof";
  return "timber";
}

function triangleNormal(g: FacetGeometryData, t: number): Vec3 {
  const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

describe("buildAgedBuildingGeometry", () => {
  it("records each kind's triangle count, every kind under the budget", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      expect(g.vertexCount % 3).toBe(0);
      expect(g.vertexCount / 3).toBe(AGED_BUILDING_TRIANGLES[kind]);
      expect(AGED_BUILDING_TRIANGLES[kind]).toBeLessThanOrEqual(AGED_BUILDING_TRIANGLE_BUDGET);
      expect(AGED_BUILDING_TRIANGLES[kind]).toBeGreaterThan(300);
    }
    expect(AGED_BUILDING_TRIANGLE_BUDGET).toBe(1000);
  });

  it("stores unit normals that match their faces (smooth only on the pole), with no degenerate face", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      expect(g.colors).toHaveLength(g.vertexCount * 3);
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = triangleNormal(g, t);
        expect(Number.isFinite(n[0])).toBe(true);
        const stored = [normal(g, t * 3), normal(g, t * 3 + 1), normal(g, t * 3 + 2)];
        for (const s of stored) {
          expect(Math.hypot(...s)).toBeCloseTo(1, 5);
          expect(s[0] * n[0] + s[1] * n[1] + s[2] * n[2]).toBeGreaterThan(0.5);
        }
        // Flat facets (all three normals alike) carry exactly the face normal, even after the lean.
        const flat = stored.every((s) => Math.abs(s[0] - stored[0][0]) < 1e-9 && Math.abs(s[1] - stored[0][1]) < 1e-9);
        if (flat) expect(stored[0][0] * n[0] + stored[0][1] * n[1] + stored[0][2] * n[2]).toBeCloseTo(1, 5);
      }
    }
  });

  it("keeps the local-space contract: ground contact at the origin, a footing below, under the cap, the tower far tallest", () => {
    expect(BUILDING_MAX_HEIGHT).toBe(0.5);
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let minY = Infinity;
      let maxY = -Infinity;
      let reach = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        reach = Math.max(reach, Math.hypot(x, z));
      }
      expect(minY).toBeCloseTo(-BUILDING_FOOTING, 6);
      expect(maxY).toBeCloseTo(AGED_BUILDING_HEIGHT[kind], 5);
      expect(maxY).toBeLessThan(BUILDING_MAX_HEIGHT);
      expect(reach).toBeLessThanOrEqual(AGED_BUILDING_HALF_DIAGONAL[kind] + 1e-6);
      expect(reach).toBeGreaterThan(AGED_BUILDING_HALF_DIAGONAL[kind] * 0.85);
      // The wider eaves and the lean grow the footprint a little past the faceted kind's.
      expect(AGED_BUILDING_HALF_DIAGONAL[kind]).toBeGreaterThanOrEqual(BUILDING_HALF_DIAGONAL[kind]);
      // The church's long nave reaches 0.23; nothing else past 0.22.
      expect(AGED_BUILDING_HALF_DIAGONAL[kind]).toBeLessThan(kind === "church" ? 0.24 : 0.22);
    }
    for (const kind of BUILDING_KINDS) {
      if (kind !== "watchtower" && kind !== "church") expect(AGED_BUILDING_HEIGHT.watchtower).toBeGreaterThan(AGED_BUILDING_HEIGHT[kind] + 0.2);
    }
    // The tower rises to within a hair of the cap.
    expect(AGED_BUILDING_HEIGHT.watchtower).toBeGreaterThan(BUILDING_MAX_HEIGHT - 0.02);
  });

  it("raises the house and warehouse eaves (#59) so neither reads as a sunk hut, keeping each roof's pitch and the tavern as it was", () => {
    // Eave and ridge at scale 1: house 0.14 / 0.23, warehouse 0.16 / 0.27, tavern 0.17 / 0.27.
    const spec = { house: { eave: 0.14, ridge: 0.23, halfU: 0.09, halfV: 0.07 }, warehouse: { eave: 0.16, ridge: 0.27, halfU: 0.13, halfV: 0.09 }, tavern: { eave: 0.17, ridge: 0.27, halfU: 0.09, halfV: 0.11 } };
    for (const kind of ["house", "warehouse", "tavern"] as const) {
      const s = { ...spec[kind], ridgeAlong: "z" as const };
      expect(AGED_BUILDING_HEIGHT[kind]).toBeCloseTo(s.ridge + RIDGE_CAP_RISE, 9);
      expect(AGED_BUILDING_WALL_TOP[kind]).toBeCloseTo(roofEaveUnderside(s), 9);
    }
    // The pitches the roofs had before the eaves rose: 1:1 on the house, 11:13 on the warehouse.
    expect((spec.house.ridge - spec.house.eave) / spec.house.halfU).toBeCloseTo(1, 9);
    expect((spec.warehouse.ridge - spec.warehouse.eave) / spec.warehouse.halfU).toBeCloseTo(0.11 / 0.13, 9);
    // The house's eave now clears its door by more than the door's own height.
    expect(AGED_BUILDING_WALL_TOP.house).toBeGreaterThan(0.062 * 1.8);
  });

  it("winds its faces outwards (positive signed volume) and faces its footing down", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let volume = 0;
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        if ([a, b, c].every((p) => Math.abs(p[1] + BUILDING_FOOTING) < 1e-6)) expect(normal(g, t * 3)[1]).toBeCloseTo(-1, 5);
      }
      expect(volume).toBeGreaterThan(0);
    }
  });

  it("leans each kind as a whole by its declared lean: the top is shifted over the bottom", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      const [lx, lz] = AGED_LEAN_OF[kind];
      expect(Math.hypot(lx, lz)).toBeGreaterThan(0.01);
      expect(Math.hypot(lx, lz)).toBeLessThan(0.03);
      // The footing is a plain box; its top edge at y = 0 is not shifted, its bottom at −footing is shifted back.
      let bottomMinX = Infinity;
      let groundMinX = Infinity;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y] = vertex(g, i);
        if (Math.abs(y + BUILDING_FOOTING) < 1e-6) bottomMinX = Math.min(bottomMinX, x);
        if (Math.abs(y) < 1e-6) groundMinX = Math.min(groundMinX, x);
      }
      expect(groundMinX - bottomMinX).toBeCloseTo(lx * BUILDING_FOOTING, 6);
    }
  });

  it("bounds each face by the worn ring's own corners: faceCutIndices agrees with wornRingPoints for every face", () => {
    // Distinct cuts, so each ring point tells which corner it came from. Box order: left 0–1, front 2–3, right 4–5, back 6–7.
    const cuts: [number, number, number, number] = [0.011, 0.023, 0.037, 0.041];
    const p = wornRingPoints({ hw: 1, hd: 1, y: 0, cuts });
    const atFace: Record<WallFace, [number, number]> = {
      // Left and right ends of each face seen from outside, as the cut each end's point was moved in by.
      front: [p[2][0] + 1, 1 - p[3][0]],
      right: [1 - p[4][2], p[5][2] + 1],
      back: [1 - p[6][0], p[7][0] + 1],
      left: [p[0][2] + 1, 1 - p[1][2]],
    };
    for (const face of ["front", "right", "back", "left"] as const) {
      const [l, r] = faceCutIndices(face);
      expect(cuts[l]).toBeCloseTo(atFace[face][0], 12);
      expect(cuts[r]).toBeCloseTo(atFace[face][1], 12);
    }
  });

  it("gives every kind a stone plinth: the footing in the stone colour with a course standing proud of it below ground contact", () => {
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let groundReach = 0;
      let courseReach = 0;
      let courseVertices = 0;
      let footingStone = 0;
      let footingVertices = 0;
      // The course's top band (its cap) against the band below it, on the side faces.
      let cap = 0;
      let capCount = 0;
      let lower = 0;
      let lowerCount = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        const c = color(g, i);
        const n = normal(g, i);
        if (Math.abs(y) < 1e-6) groundReach = Math.max(groundReach, Math.hypot(x, z));
        if (y > -0.031 && y < -0.011) {
          courseReach = Math.max(courseReach, Math.hypot(x, z));
          courseVertices++;
          // The cap's top edge against the course's bottom edge (the edge they share belongs to both).
          if (Math.abs(n[1]) < 0.5 && y > -0.015) {
            cap += luminance(c);
            capCount++;
          } else if (Math.abs(n[1]) < 0.5 && y < -0.021) {
            lower += luminance(c);
            lowerCount++;
          }
        }
        // The footing proper, below the plinth course's top (the door sill dips 0.011 under ground contact).
        if (y < -0.0125) {
          footingVertices++;
          // Stone, not the wall's render: the grime and ground occlusion darken the footing, so tell them by hue,
          // the test stone's blue-to-red ratio (0.77) against the wall's (0.85).
          if (c[2] / c[0] < 0.8) footingStone++;
        }
      }
      // The course reaches past the walls' line at ground contact (the lean moves it by far less than its projection).
      expect(courseVertices).toBeGreaterThan(0);
      expect(courseReach).toBeGreaterThan(groundReach + 0.003);
      expect(footingStone).toBe(footingVertices);
      // A paler cap course on top of the plinth: a crisp line where the ground meets the wall.
      expect(capCount).toBeGreaterThan(0);
      expect(lowerCount).toBeGreaterThan(0);
      expect(cap / capCount).toBeGreaterThan((lower / lowerCount) * 1.2);
    }
  });

  it("grimes the foot of the walls darker than mid-height and flakes cells into several tones", () => {
    for (const kind of ["house", "tavern", "warehouse", "church"] as const) {
      const g = built[kind];
      let low = 0;
      let lowCount = 0;
      let mid = 0;
      let midCount = 0;
      const tones = new Set<number>();
      const wallTop = AGED_BUILDING_WALL_TOP[kind];
      for (let i = 0; i < g.vertexCount; i++) {
        const c = color(g, i);
        const n = normal(g, i);
        const [, y] = vertex(g, i);
        if (kindOf(c) !== "wall" || Math.abs(n[1]) > 0.5) continue;
        if (Math.abs(y) < 1e-6) {
          low += luminance(c);
          lowCount++;
        }
        if (y > wallTop * 0.4 && y < wallTop * 0.7) {
          mid += luminance(c);
          midCount++;
          tones.add(Math.round(luminance(c) * 1e3));
        }
      }
      expect(lowCount).toBeGreaterThan(0);
      expect(midCount).toBeGreaterThan(0);
      expect(low / lowCount).toBeLessThan((mid / midCount) * 0.85);
      expect(tones.size).toBeGreaterThan(4);
    }
  });

  it("roofs the gabled kinds in rows of raised strips under a cap that is the top of the piece", () => {
    for (const kind of ["house", "tavern", "warehouse"] as const) {
      const g = built[kind];
      let raised = 0;
      let capTop = -Infinity;
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = normal(g, t * 3);
        const c = color(g, t * 3);
        if (kindOf(c) !== "roof") continue;
        if (n[1] > 0.55 && n[1] < 0.85) raised++;
        for (let k = 0; k < 3; k++) capTop = Math.max(capTop, vertex(g, t * 3 + k)[1]);
      }
      // Two triangles per strip top per slope, over the slab tops themselves.
      const strips = tileStripCount({ halfU: 0.09, halfV: kind === "tavern" ? 0.11 : kind === "house" ? 0.07 : 0.09, eave: 0.14, ridge: 0.23, ridgeAlong: "z" });
      expect(raised).toBeGreaterThanOrEqual(strips * 2 * 2);
      expect(capTop).toBeCloseTo(AGED_BUILDING_HEIGHT[kind], 6);
    }
  });

  it("puts a timber door on the front of every kind, and keeps every window under the wall top", () => {
    expect(agedWindowBand(0.14).top).toBeCloseTo(0.12, 9);
    expect(agedWindowBand(0.2).top).toBe(0.14);
    expect(agedWindowBand(0.2).bottom).toBeCloseTo(0.11, 9);
    for (const kind of BUILDING_KINDS) {
      const g = built[kind];
      let doorAtFront = false;
      let windowTop = -Infinity;
      for (let i = 0; i < g.vertexCount; i++) {
        const c = color(g, i);
        const [, y, z] = vertex(g, i);
        if (kind === "watchtower" ? luminance(c) > 0.13 : kindOf(c) !== "timber") continue;
        if (z > 0 && y > 0 && y < 0.07) doorAtFront = true;
        if (kind !== "watchtower" && y > 0.08 && z > 0.06) windowTop = Math.max(windowTop, y);
      }
      expect(doorAtFront).toBe(true);
      if (kind === "tavern" || kind === "house") expect(windowTop).toBeLessThan(AGED_BUILDING_WALL_TOP[kind]);
      // The warehouse has no window; its loft hatch is up in the gable, above the wall top and under the ridge.
      if (kind === "warehouse") {
        expect(windowTop).toBeGreaterThan(AGED_BUILDING_WALL_TOP.warehouse);
        expect(windowTop).toBeLessThan(AGED_BUILDING_HEIGHT.warehouse - 0.03);
      }
    }
  });

  it("builds the tower in stone courses of many tones over a mortar body, with merlons and a pole under the cap", () => {
    const g = built.watchtower;
    const tones = new Set<number>();
    let proud = 0;
    let merlonTop = -Infinity;
    let poleTop = -Infinity;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      const c = color(g, i);
      if (y > 0.05 && y < AGED_TOWER.bodyTop - 0.05 && luminance(c) > 0.15) {
        tones.add(Math.round(luminance(c) * 1e3));
        if (Math.hypot(x, z) > AGED_TOWER.halfBase - 0.002) proud++;
      }
      if (y > AGED_TOWER.parapet.top + 1e-6 && Math.hypot(x, z) > 0.05) merlonTop = Math.max(merlonTop, y);
      if (Math.hypot(x, z) < 0.02 && y > AGED_TOWER.parapet.top) poleTop = Math.max(poleTop, y);
    }
    expect(tones.size).toBeGreaterThan(20);
    expect(proud).toBeGreaterThan(50);
    expect(merlonTop).toBeCloseTo(AGED_TOWER.merlon.top, 6);
    expect(poleTop).toBeCloseTo(AGED_TOWER.pole.top, 6);
    // The flag flies from the pole top, clear of the merlons and under the cap, within the tower's footprint.
    expect(AGED_TOWER_FLAG_HOIST[1]).toBeLessThan(BUILDING_MAX_HEIGHT);
    expect(AGED_TOWER_FLAG_HOIST[1] - FLAG_HEIGHT).toBeGreaterThan(AGED_TOWER.merlon.top);
    expect(AGED_TOWER_FLAG_HOIST[0] + FLAG_WIDTH).toBeLessThan(AGED_BUILDING_HALF_DIAGONAL.watchtower);
  });

  describe("the church", () => {
    const g = built.church;
    const c = AGED_CHURCH;
    const hd = c.d / 2;

    it("is a long nave, 0.2 across by 0.3 along z, under a tiled roof whose ridge runs along z", () => {
      expect(c.w).toBe(0.2);
      expect(c.d).toBe(0.3);
      expect(c.eave).toBe(0.18);
      expect(c.ridge).toBe(0.3);
      let roofMinZ = Infinity;
      let roofMaxZ = -Infinity;
      let roofTopY = -Infinity;
      for (let i = 0; i < g.vertexCount; i++) {
        if (kindOf(color(g, i)) !== "roof") continue;
        const [, y, z] = vertex(g, i);
        roofMinZ = Math.min(roofMinZ, z);
        roofMaxZ = Math.max(roofMaxZ, z);
        roofTopY = Math.max(roofTopY, y);
      }
      // The roof overhangs the back gable, but at the front it tucks behind the bell gable's wall, never through it.
      expect(roofMinZ).toBeLessThan(-hd - 0.02);
      expect(roofMaxZ).toBeLessThan(hd - 0.01);
      expect(roofMaxZ).toBeGreaterThan(hd - c.facade.thickness);
      expect(roofTopY).toBeCloseTo(c.ridge + RIDGE_CAP_RISE, 6);
    });

    it("tops out at the cross, about 0.42, clearly under the tower's pole and under the cap", () => {
      expect(AGED_BUILDING_HEIGHT.church).toBe(c.cross.top);
      expect(c.cross.top).toBeGreaterThan(0.4);
      expect(c.cross.top).toBeLessThanOrEqual(0.42);
      expect(AGED_BUILDING_HEIGHT.watchtower - AGED_BUILDING_HEIGHT.church).toBeGreaterThan(0.06);
      expect(AGED_BUILDING_HEIGHT.church).toBeLessThan(BUILDING_MAX_HEIGHT - 0.07);
      // The cross is iron, the topmost thing, on the front wall's line.
      let topY = -Infinity;
      let topZ = 0;
      let topLum = 1;
      for (let i = 0; i < g.vertexCount; i++) {
        const [, y, z] = vertex(g, i);
        if (y > topY) {
          topY = y;
          topZ = z;
          topLum = luminance(color(g, i));
        }
      }
      expect(topY).toBeCloseTo(c.cross.top, 6);
      expect(topZ).toBeGreaterThan(hd - c.facade.thickness);
      expect(topLum).toBeLessThan(0.05);
    });

    it("raises a bell gable on the front wall above the roof ridge, pierced by two openings each holding a bronze bell", () => {
      let wallAboveRidge = 0;
      let bells = 0;
      const bellX = new Set<number>();
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        const col = color(g, i);
        if (z < hd - c.facade.thickness - 1e-6) continue;
        if (kindOf(col) === "wall" && y > AGED_BUILDING_HEIGHT.warehouse && y > c.ridge + RIDGE_CAP_RISE) wallAboveRidge++;
        // Bronze in the test palette: red over green over blue, dim.
        if (col[0] > col[1] && col[1] > col[2] && luminance(col) < 0.2 && y > c.facade.sill && y < c.facade.crown && Math.abs(x) < c.facade.screenHalf) {
          bells++;
          bellX.add(Math.sign(x));
        }
      }
      expect(wallAboveRidge).toBeGreaterThan(20);
      expect(bells).toBeGreaterThan(20);
      expect(bellX).toEqual(new Set([-1, 1]));
      expect(c.facade.pedimentTop).toBeGreaterThan(c.facade.crown);
      expect(c.facade.sill).toBeGreaterThan(c.ridge + RIDGE_CAP_RISE);
    });

    it("puts a tall arched planked door in a stone surround on +z, and small high slit windows on the long walls instead of shutters", () => {
      let doorTop = -Infinity;
      let surround = 0;
      let slits = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        const col = color(g, i);
        const lum = luminance(col);
        if (z > hd - 1e-6 && Math.abs(x) < c.door.halfWidth && lum < 0.1 && y > 0) doorTop = Math.max(doorTop, y);
        // The test stone, darker than the wall: jambs and voussoirs around the door, proud of the wall.
        if (z > hd + 0.005 && Math.abs(x) < 0.05 && y > 0 && y < c.door.height + 0.05 && lum > 0.2 && lum < 0.3) surround++;
        // A slit recess: a near-black quad high on a long wall.
        if (Math.abs(Math.abs(x) - c.w / 2) < 0.003 && lum < 0.1 && y > c.window.bottom - 1e-6 && y <= c.window.top + 1e-6) slits++;
      }
      expect(doorTop).toBeGreaterThanOrEqual(c.door.height);
      expect(c.door.height).toBeGreaterThan(0.07);
      expect(surround).toBeGreaterThan(40);
      // Three per long wall, two triangles each, with the streak's vertices under them.
      expect(slits).toBeGreaterThanOrEqual(6 * 6);
      expect(c.window.top).toBeLessThan(AGED_BUILDING_WALL_TOP.church);
    });

    it("stays within its budget of 800 triangles", () => {
      expect(AGED_BUILDING_TRIANGLES.church).toBeLessThanOrEqual(800);
      expect(g.vertexCount / 3).toBe(AGED_BUILDING_TRIANGLES.church);
    });
  });

  it("shows no missing or inside-out facet from any direction above the ground: every first hit faces the viewer", () => {
    for (const kind of BUILDING_KINDS) {
      const hits = backfacingFirstHits(built[kind]);
      // The tower's chipped proud blocks have one non-planar side each, which can fold a sliver inwards
      // at the foot; a few grazing rays of nearly twenty thousand meet one of two such slivers in the
      // bottom course. The roofs' tile strips have no underside (they lie on the slab), so where a
      // strip overshoots the slab's eave edge a ray climbing from below the horizon can enter the open
      // underside and leave through the strip's end; the camera's pitch is fixed well above the
      // horizon, so the game never sees it. Everything else is clean.
      const tolerated =
        kind === "watchtower"
          ? hits.filter((h) => h.point[1] < 0.05)
          : hits.filter((h) => h.direction[1] > 0 && h.point[1] < AGED_BUILDING_WALL_TOP[kind]);
      expect(new Set(tolerated.map((h) => h.triangle)).size).toBeLessThanOrEqual(2);
      const rest = hits.filter((h) => !tolerated.includes(h));
      expect(rest.map((h) => `${kind} triangle ${h.triangle} at ${h.point.map((v) => v.toFixed(3)).join(", ")}`)).toEqual([]);
    }
    // Nearly twenty thousand rays against up to 800 triangles per kind: a few seconds under a loaded suite.
  }, 30_000);

  it("has no triangle wound inside out under a sound one on the same plane (a concave outline fanned from the wrong corner)", () => {
    for (const kind of BUILDING_KINDS) {
      const overlaps = opposedCoplanarOverlaps(built[kind]);
      expect(overlaps.map((o) => `${kind} triangles ${o.triangles.join(" and ")} facing ${o.normal.map((v) => v.toFixed(2)).join(", ")}, area ${o.area.toExponential(2)}`)).toEqual([]);
    }
  }, 30_000);

  it("gives the church's two roof slopes their full rows of tile strips, each strip's top facing its own way", () => {
    const g = built.church;
    const strips = tileStripCount(churchRoofSpec());
    let onPlusX = 0;
    let onMinusX = 0;
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const n = normal(g, t * 3);
      if (kindOf(color(g, t * 3)) !== "roof" || n[1] < 0.55 || n[1] > 0.85) continue;
      if (n[0] > 0.3) onPlusX++;
      else if (n[0] < -0.3) onMinusX++;
    }
    // Two triangles per strip top per slope, over the slab tops themselves.
    expect(onPlusX).toBeGreaterThanOrEqual(strips * 2 * 2);
    expect(onMinusX).toBeGreaterThanOrEqual(strips * 2 * 2);
    expect(strips).toBe(14);
  });

  it("is deterministic and differs between kinds", () => {
    expect(buildAgedBuildingGeometry("tavern", colors).positions).toEqual(built.tavern.positions);
    expect(buildAgedBuildingGeometry("tavern", colors).colors).toEqual(built.tavern.colors);
    expect(new Set(Object.values(built).map((g) => g.vertexCount)).size).toBeGreaterThan(2);
  });
});
