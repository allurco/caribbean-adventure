import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import {
  buildLandMesh,
  landFaceColor,
  LAND_MESH_SKIRT_DEPTH,
  VISIBLE_SEABED_DEPTH,
  LAND_MESH_SPACING,
  type LandMeshColors,
  type LandMeshData,
} from "./landMesh";

/**
 * The mesh as one unindexed triangle soup, land first then the (indexed)
 * seabed expanded, so geometry checks see every triangle the same way.
 */
function soup(mesh: LandMeshData) {
  const { land, seabed, triangleCount, aboveWaterTriangleCount } = mesh;
  const positions = new Float32Array(triangleCount * 9);
  const colors = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  positions.set(land.positions);
  colors.set(land.colors);
  normals.set(land.normals);
  const base = aboveWaterTriangleCount * 9;
  for (let k = 0; k < seabed.index.length; k++) {
    const v = seabed.index[k];
    for (let i = 0; i < 3; i++) {
      positions[base + k * 3 + i] = seabed.positions[v * 3 + i];
      colors[base + k * 3 + i] = seabed.colors[v * 3 + i];
      normals[base + k * 3 + i] = seabed.normals[v * 3 + i];
    }
  }
  return { positions, colors, normals, triangleCount, aboveWaterTriangleCount };
}

const buildSoup = (...args: Parameters<typeof buildLandMesh>) => soup(buildLandMesh(...args));

function singleIsland(): MapCell[] {
  return hexGrid(4).map((h) =>
    h.q === 0 && h.r === 0
      ? { hex: h, terrain: "island", hasPort: false, elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
  );
}

/** Island by hex distance from the centre: elevation per ring, water beyond. */
function ringIsland(elevations: readonly MapCell["elevation"][]): MapCell[] {
  return hexGrid(elevations.length + 2).map((h): MapCell => {
    const ring = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.s));
    return ring < elevations.length
      ? { hex: h, terrain: "island", hasPort: false, elevation: elevations[ring] }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 };
  });
}

/** Mountain peak, jungle ring, beach ring. */
const mountainIsland = () => ringIsland([3, 2, 1]);
/** A jungle hollow inside a ring of mountains. */
const hollowIsland = () => ringIsland([2, 3, 1]);

/**
 * Test palette that keeps the bands apart by channel: rock alone has blue,
 * dry sand has r = g, jungle g only, highland r > g, wet sand r only.
 */
const CHANNEL_COLORS: LandMeshColors = {
  wetSand: [1, 0, 0],
  drySand: [1, 1, 0],
  jungle: [0, 1, 0],
  highland: [1, 0.5, 0],
  rock: [0, 0, 1],
  // Underwater: greys, told apart by brightness.
  seabedSand: [0.8, 0.8, 0.8],
  coral: [0.1, 0.1, 0.1],
  deepSeabed: [0.4, 0.4, 0.4],
};

/** Metres to world units at the render scale. */
const m = (metres: number) => metres / 65;

function faceRgb(colors: Float32Array, t: number): [number, number, number] {
  return [colors[t * 9], colors[t * 9 + 1], colors[t * 9 + 2]];
}

/** Centroid, mean height and the y of the unit face normal. */
function faceGeometry(p: Float32Array, t: number) {
  const o = t * 9;
  const ux = p[o + 3] - p[o];
  const uy = p[o + 4] - p[o + 1];
  const uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o];
  const vy = p[o + 7] - p[o + 1];
  const vz = p[o + 8] - p[o + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return {
    x: (p[o] + p[o + 3] + p[o + 6]) / 3,
    z: (p[o + 2] + p[o + 5] + p[o + 8]) / 3,
    height: (p[o + 1] + p[o + 4] + p[o + 7]) / 3,
    normalY: ny / Math.hypot(nx, ny, nz),
  };
}

describe("landFaceColor", () => {
  const flat = { height: 0.3, normalY: 1, noise: 0, cavity: 0, coral: 0 };

  describe("under water (#38)", () => {
    it("is clean seabed sand on the shallow shelf", () => {
      expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-3) })).toEqual([0.8, 0.8, 0.8]);
      expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-8) })).toEqual([0.8, 0.8, 0.8]);
    });

    it("turns to the deep seabed colour down the drop-off", () => {
      expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-50) })).toEqual([0.4, 0.4, 0.4]);
      const mid = landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-20) })[0];
      expect(mid).toBeGreaterThan(0.4);
      expect(mid).toBeLessThan(0.8);
    });

    it("is coral where the face is covered by coral", () => {
      for (const c of landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-2), coral: 1 })) expect(c).toBeCloseTo(0.1, 9);
      const half = landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-2), coral: 0.5 })[0];
      expect(half).toBeCloseTo(0.45, 6);
    });

    it("never turns steep underwater faces to rock", () => {
      const [, , b] = landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-30), normalY: 0.3 });
      expect(b).toBeCloseTo(landFaceColor(CHANNEL_COLORS, { ...flat, height: m(-30) })[2], 9);
    });
  });

  it("is wet sand at the waterline", () => {
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.0001 })[1]).toBeLessThan(0.01);
  });

  it("dries gradually up the swash zone, with no flat wet band (#38)", () => {
    // Dry share is the green channel (dry sand (1,1,0) vs wet sand (1,0,0)).
    const dry = (h: number) => landFaceColor(CHANNEL_COLORS, { ...flat, height: h })[1];
    expect(dry(0.005)).toBeGreaterThan(0.05);
    expect(dry(0.005)).toBeLessThan(0.5);
    expect(dry(0.0125)).toBeGreaterThan(0.3);
    expect(dry(0.0125)).toBeLessThan(0.8);
    expect(dry(0.03)).toBe(1);
    let prev = dry(0.0001);
    for (let h = 0.001; h <= 0.03; h += 0.001) {
      expect(dry(h)).toBeGreaterThanOrEqual(prev);
      prev = dry(h);
    }
  });

  it("blends beach to jungle to highland by height", () => {
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.3 })).toEqual([1, 1, 0]);
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75 })).toEqual([0, 1, 0]);
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 1.6 })).toEqual([1, 0.5, 0]);
  });

  it("is rock on steep faces whatever the height", () => {
    for (const height of [0.3, 0.75, 1.6]) {
      expect(landFaceColor(CHANNEL_COLORS, { ...flat, height, normalY: 0.3 })).toEqual([0, 0, 1]);
    }
  });

  it("moves band boundaries with the noise", () => {
    const low = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.48, noise: -1 });
    const high = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.48, noise: 1 });
    expect(low[0]).toBeGreaterThan(high[0] + 0.5);
  });

  it("darkens hollows but not crests", () => {
    const open = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75 });
    const hollow = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75, cavity: 0.2 });
    const crest = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75, cavity: -0.2 });
    expect(hollow[1]).toBeLessThan(open[1] * 0.95);
    expect(hollow[1]).toBeGreaterThan(open[1] * 0.5);
    expect(crest).toEqual(open);
  });
});

describe("buildLandMesh", () => {
  it("places every vertex on the height field", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildSoup(field);
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeCloseTo(field.sampleHeight(positions[i], positions[i + 2]), 5);
    }
  });

  it("emits the land as whole flat triangles and the seabed as indexed triangles", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { land, seabed, triangleCount, aboveWaterTriangleCount } = buildLandMesh(field);
    expect(land.positions.length).toBe(aboveWaterTriangleCount * 9);
    expect(land.colors.length).toBe(land.positions.length);
    expect(land.normals.length).toBe(land.positions.length);
    expect(seabed.index.length).toBe((triangleCount - aboveWaterTriangleCount) * 3);
    expect(seabed.colors.length).toBe(seabed.positions.length);
    expect(seabed.normals.length).toBe(seabed.positions.length);
  });

  it("shares seabed vertices: every index is valid, every vertex used, and far fewer vertices than corners (#38)", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { seabed } = buildLandMesh(field);
    const vertexCount = seabed.positions.length / 3;
    const used = new Uint8Array(vertexCount);
    for (const v of seabed.index) {
      expect(v).toBeLessThan(vertexCount);
      used[v] = 1;
    }
    expect(used.every((u) => u === 1)).toBe(true);
    // A triangular lattice shares each vertex between ~6 triangles.
    expect(vertexCount).toBeLessThan(seabed.index.length / 4);
  });

  it("colours a lone beach island with wet and dry sand only", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS });
    let wet = 0;
    let dry = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height } = faceGeometry(positions, t);
      if (height <= 0) continue; // seabed
      const [r, g, b] = faceRgb(colors, t);
      // At most a trace of rock (b) on the steepest shore faces, and no jungle
      // (g without r).
      expect(b / (r + g + b)).toBeLessThan(0.05);
      expect(r).toBeGreaterThanOrEqual(g - 1e-6);
      if (g < r * 0.5 && b === 0) wet++;
      if (g > 0 && b === 0 && Math.abs(r - g) < 1e-6) dry++;
    }
    expect(wet).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(0);
  });

  it("puts mostly wet sand on faces just above the waterline", () => {
    const field = createTerrainHeightField(mountainIsland(), 11);
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      if (height <= 0 || height > 0.004 || normalY < 0.85) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(g).toBeLessThan(r * 0.4);
      expect(b).toBe(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("puts rock on steep faces even at mid height", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      // Steeper than ~63°.
      if (height < 0.3 || height > 1 || normalY > 0.45) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(b / (r + g + b)).toBeGreaterThan(0.95);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("does not paint flat high ground as rock", () => {
    const field = createTerrainHeightField(mountainIsland(), 11);
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      // Wide enough a band not to hinge on where the lattice lands on the narrow summit.
      if (height < 1.3 || normalY < 0.9) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(b).toBe(0);
      // Highland (r = 2g), not jungle (r = 0).
      expect(r).toBeGreaterThan(g);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("breaks the beach/jungle boundary with noise instead of a height contour", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS });
    // Flat faces at (almost) the same height: a contour would give them the
    // same sand/jungle mix; noise spreads it.
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      if (height < 0.48 || height > 0.49 || normalY < 0.95) continue;
      const [r, g] = faceRgb(colors, t);
      const sand = r / g; // drySand (1,1,0) vs jungle (0,1,0)
      lo = Math.min(lo, sand);
      hi = Math.max(hi, sand);
    }
    expect(hi - lo).toBeGreaterThan(0.4);
  });

  it("darkens faces in a hollow", () => {
    const field = createTerrainHeightField(hollowIsland(), 3, { reliefScale: 0 });
    const lit = buildSoup(field, { colors: CHANNEL_COLORS, occlusion: 0 });
    const shaded = buildSoup(field, { colors: CHANNEL_COLORS });
    expect(shaded.positions).toEqual(lit.positions);
    // The face nearest the middle of the ring of mountains.
    let best = -1;
    let bestDist = Infinity;
    for (let t = 0; t < lit.triangleCount; t++) {
      const { x, z } = faceGeometry(lit.positions, t);
      const d = Math.hypot(x, z);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    const before = faceRgb(lit.colors, best);
    const after = faceRgb(shaded.colors, best);
    expect(after[1]).toBeLessThan(before[1] * 0.95);
  });

  it("winds every triangle to face up", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildSoup(field);
    for (let i = 0; i < positions.length; i += 9) {
      const ux = positions[i + 3] - positions[i];
      const uz = positions[i + 5] - positions[i + 2];
      const vx = positions[i + 6] - positions[i];
      const vz = positions[i + 8] - positions[i + 2];
      // y of cross(u, v), ignoring height: positive means counter-clockwise from above.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  it("only covers land and the seabed above the cut-off around it", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildSoup(field);
    for (let i = 0; i < positions.length; i += 9) {
      const top = Math.max(positions[i + 1], positions[i + 4], positions[i + 7]);
      expect(top).toBeGreaterThan(-LAND_MESH_SKIRT_DEPTH);
    }
    // A single hex island: the seabed reaches the cut-off ~230 m (3.5 units) out.
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 2])).toBeLessThan(5.5);
    }
  });

  it("covers the seabed down to the depth where the water hides it (#38)", () => {
    expect(LAND_MESH_SKIRT_DEPTH).toBeCloseTo(m(VISIBLE_SEABED_DEPTH), 9);
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildSoup(field);
    let deepest = 0;
    for (let i = 1; i < positions.length; i += 3) deepest = Math.min(deepest, positions[i]);
    expect(deepest).toBeLessThan(m(-VISIBLE_SEABED_DEPTH));
  });

  it("puts the triangles above the waterline first, then the seabed", () => {
    const field = createTerrainHeightField(mountainIsland(), 11);
    const { positions, triangleCount, aboveWaterTriangleCount } = buildSoup(field);
    expect(aboveWaterTriangleCount).toBeGreaterThan(0);
    expect(aboveWaterTriangleCount).toBeLessThan(triangleCount);
    for (let t = 0; t < triangleCount; t++) {
      const o = t * 9;
      const top = Math.max(positions[o + 1], positions[o + 4], positions[o + 7]);
      if (t < aboveWaterTriangleCount) expect(top).toBeGreaterThan(0);
      else expect(top).toBeLessThanOrEqual(0);
    }
  });

  describe("smooth seabed (#38)", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const mesh = buildSoup(field);
    const seabedTriangles = () => {
      const out: number[] = [];
      for (let t = mesh.aboveWaterTriangleCount; t < mesh.triangleCount; t++) out.push(t);
      return out;
    };
    const key = (p: Float32Array, v: number) => `${p[v * 3].toFixed(5)},${p[v * 3 + 2].toFixed(5)}`;

    it("gives seabed vertices the field's own smooth normal, shared by every triangle that meets there", () => {
      const { positions, normals } = mesh;
      const seen = new Map<string, [number, number, number]>();
      let shared = 0;
      for (const t of seabedTriangles()) {
        for (let k = 0; k < 3; k++) {
          const v = t * 3 + k;
          const n: [number, number, number] = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
          expect(Math.hypot(...n)).toBeCloseTo(1, 4);
          expect(n[1]).toBeGreaterThan(0);
          const prev = seen.get(key(positions, v));
          if (prev) {
            shared++;
            for (let i = 0; i < 3; i++) expect(n[i]).toBeCloseTo(prev[i], 6);
          } else seen.set(key(positions, v), n);
        }
      }
      expect(shared).toBeGreaterThan(1000);
    });

    it("blends seabed colours smoothly: a vertex has the same colour in every triangle", () => {
      const { positions, colors } = mesh;
      const seen = new Map<string, number>();
      for (const t of seabedTriangles()) {
        for (let k = 0; k < 3; k++) {
          const v = t * 3 + k;
          const prev = seen.get(key(positions, v));
          if (prev === undefined) seen.set(key(positions, v), colors[v * 3]);
          else expect(colors[v * 3]).toBeCloseTo(prev, 6);
        }
      }
    });


    it("has no cracks: no triangle corner sits at the middle of another triangle's edge", () => {
      const { positions, triangleCount } = mesh;
      const corners = new Set<string>();
      for (let v = 0; v < triangleCount * 3; v++) corners.add(key(positions, v));
      const mid = (a: number, b: number) =>
        `${((positions[a * 3] + positions[b * 3]) / 2).toFixed(5)},${((positions[a * 3 + 2] + positions[b * 3 + 2]) / 2).toFixed(5)}`;
      for (let t = 0; t < triangleCount; t++) {
        const v = t * 3;
        for (const [a, b] of [[v, v + 1], [v + 1, v + 2], [v + 2, v]]) expect(corners.has(mid(a, b))).toBe(false);
      }
    });

    it("keeps the land above water faceted: one normal and colour per face", () => {
      const { normals, colors } = mesh;
      for (let t = 0; t < mesh.aboveWaterTriangleCount; t++) {
        const o = t * 9;
        for (let i = 0; i < 3; i++) {
          expect(normals[o + 3 + i]).toBe(normals[o + i]);
          expect(colors[o + 6 + i]).toBe(colors[o + i]);
        }
      }
    });
  });

  describe("on a generated map with reefs and drop-offs (#38)", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, triangleCount } = buildSoup(field);

    it("has no cracks: no triangle corner lies at the ¼, ½ or ¾ point of another triangle's edge", () => {
      // Positions quantised to 1e-4 units (lattice points are ≥ 0.0375 apart).
      const key = (x: number, z: number) => (Math.round(x * 1e4) + 1e6) * 4e6 + (Math.round(z * 1e4) + 1e6);
      const corners = new Set<number>();
      for (let v = 0; v < triangleCount * 3; v++) corners.add(key(positions[v * 3], positions[v * 3 + 2]));
      let cracks = 0;
      for (let t = 0; t < triangleCount; t++) {
        const o = t * 9;
        for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
          for (const f of [0.25, 0.5, 0.75]) {
            const x = positions[o + a] + (positions[o + b] - positions[o + a]) * f;
            const z = positions[o + a + 2] + (positions[o + b + 2] - positions[o + a + 2]) * f;
            if (corners.has(key(x, z))) cracks++;
          }
        }
      }
      expect(cracks).toBe(0);
    }, 30000);
  });

  it("covers reef seabed with coral", () => {
    const cells = singleIsland().map((c): MapCell => (c.hex.q === 3 && c.hex.r === 0 ? { ...c, terrain: "reef" } : c));
    const field = createTerrainHeightField(cells, 5);
    // Reef everywhere within one unit of the reef hex centre (x = 4.5, z ≈ 2.6).
    const sampleReef = (x: number, z: number) => (Math.hypot(x - 4.5, z - Math.sqrt(3) * 1.5) < 0.6 ? 1 : 0);
    const { positions, colors, triangleCount } = buildSoup(field, { colors: CHANNEL_COLORS, sampleReef });
    let reefFaces = 0;
    let darkest = Infinity;
    for (let t = 0; t < triangleCount; t++) {
      const { x, z } = faceGeometry(positions, t);
      if (sampleReef(x, z) === 0) continue;
      reefFaces++;
      darkest = Math.min(darkest, faceRgb(colors, t)[0]);
    }
    expect(reefFaces).toBeGreaterThan(10);
    // Some faces are mostly coral (0.1), well below clean sand (0.8).
    expect(darkest).toBeLessThan(0.3);
  });

  it("produces nothing for an all-water map", () => {
    const cells: MapCell[] = hexGrid(3).map((h) => ({
      hex: h,
      terrain: "water",
      hasPort: false,
      elevation: 0,
    }));
    const { triangleCount } = buildSoup(createTerrainHeightField(cells, 1));
    expect(triangleCount).toBe(0);
  });

  it("samples finely enough to resolve interior relief", () => {
    expect(LAND_MESH_SPACING).toBeLessThanOrEqual(0.15);
  });

  // Builds the whole lattice without skipping open water: ~2 s locally, ~3x that on CI runners.
  it("skipping open water yields exactly the full-lattice mesh", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const fast = buildSoup(field);
    const full = buildSoup(field, { skipOpenWater: false });
    expect(fast.triangleCount).toBeGreaterThan(0);
    expect(fast.triangleCount).toBe(full.triangleCount);
    expect(fast.positions).toEqual(full.positions);
    expect(fast.colors).toEqual(full.colors);
  }, 20000);

  it("benchmark: builds the land mesh for the largest map quickly", () => {
    const { radius } = getMapPreset("large");
    const cells = generateMap(radius, 31337);
    // Best of three, so JIT warm-up and a stray GC pause don't count against the build.
    let best = Infinity;
    let mesh: ReturnType<typeof buildLandMesh> | undefined;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      mesh = buildLandMesh(field);
      best = Math.min(best, performance.now() - start);
    }
    const { triangleCount, aboveWaterTriangleCount } = mesh!;
    console.log(
      `Land mesh, large map (radius ${radius}): ${triangleCount} triangles ` +
        `(${aboveWaterTriangleCount} above water), best of 3 in ${best.toFixed(1)}ms`
    );
    expect(triangleCount).toBeGreaterThan(0);
    // One-time build; ~150-170 ms locally with the seabed in metres (#38), and a
    // single cold build took ~530 ms on a GitHub runner. The limit only guards
    // against gross regressions.
    expect(best).toBeLessThan(500);
  }, 20000);
});
