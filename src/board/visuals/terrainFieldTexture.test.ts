import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid, hexToWorld, worldToHex } from "../../game/hex";
import { createReefMask } from "./reefMask";
import { createTerrainHeightField, terrainSeedFromCells, type TerrainHeightField } from "./terrainHeightField";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { LAND_MESH_SPACING } from "./landMesh";
import {
  bakeTerrainField,
  texelCenter,
  encodeHeight,
  decodeHeight,
  encodeCoastDistance,
  decodeCoastDistance,
  encodeReef,
  decodeReef,
  TERRAIN_TEXELS_PER_UNIT,
  TERRAIN_TEXTURE_MAX_SIZE,
  TERRAIN_FIELD_GLSL,
  type BakedTerrainField,
} from "./terrainFieldTexture";

/** Metres per world unit at the render scale. */
const M = 65;

/** A radius-5 water map with a 7-hex island in the middle. */
function islandMap(): MapCell[] {
  return hexGrid(5).map((h) =>
    Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.s)) <= 1
      ? { hex: h, terrain: "island", hasPort: false, elevation: 2 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
  );
}

/** A stub field whose height and coast distance are known linear ramps. */
function rampField(): TerrainHeightField {
  const bounds = { minX: -4, maxX: 6, minZ: 10, maxZ: 15 };
  return {
    // Height falls with x; coast distance rises with z, so a swapped axis shows up.
    sampleHeight: (x) => -0.1 * (x - bounds.minX),
    sampleCoastDistance: (_x, z) => 0.5 * (z - bounds.minZ) - 1,
    sampleElevation: () => 0,
    isNearLand: () => false,
    isNearSeabed: () => false,
    bounds,
  };
}

function texel(baked: BakedTerrainField, i: number, j: number): [number, number, number, number] {
  const k = (j * baked.width + i) * 4;
  return [baked.data[k], baked.data[k + 1], baked.data[k + 2], baked.data[k + 3]];
}

describe("terrainFieldTexture", () => {
  describe("encoding (half float, #38)", () => {
    it("represents sea level exactly", () => {
      expect(decodeHeight(encodeHeight(0))).toBe(0);
    });

    it("round-trips seabed heights within 0.05 m over the first 10 m of depth", () => {
      let worst = 0;
      for (let metres = 0; metres <= 10; metres += 0.0007) {
        const h = -metres / M;
        worst = Math.max(worst, Math.abs(decodeHeight(encodeHeight(h)) - h) * M);
      }
      expect(worst).toBeLessThanOrEqual(0.05);
      // Half float is far finer than that: under a centimetre.
      expect(worst).toBeLessThan(0.01);
    });

    it("round-trips any terrain height (deep seabed to mountain tops) within 0.1%", () => {
      for (let h = -2.5; h <= 2.5; h += 0.0013) {
        expect(Math.abs(decodeHeight(encodeHeight(h)) - h)).toBeLessThanOrEqual(Math.abs(h) * 1e-3 + 1e-7);
      }
    });

    it("round-trips coast distance within a millimetre-scale step", () => {
      for (let d = -4.5; d <= 4.5; d += 0.017) {
        expect(Math.abs(decodeCoastDistance(encodeCoastDistance(d)) - d)).toBeLessThanOrEqual(Math.abs(d) * 1e-3 + 1e-7);
      }
    });

    it("keeps the land/water sign of the coast distance through the round trip", () => {
      // The surf draws foam only where the decoded distance is negative, so a
      // point on land must never decode as water (and vice versa).
      for (let d = 0.0001; d <= 4.5; d *= 1.3) {
        expect(decodeCoastDistance(encodeCoastDistance(d))).toBeGreaterThan(0);
        expect(decodeCoastDistance(encodeCoastDistance(-d))).toBeLessThan(0);
      }
      // The waterline itself lands on the land side, so it carries no foam.
      expect(decodeCoastDistance(encodeCoastDistance(0))).toBeGreaterThanOrEqual(0);
    });

    it("encodes the reef mask as 0 … 1 exactly at the ends and clamps it", () => {
      expect(decodeReef(encodeReef(0))).toBe(0);
      expect(decodeReef(encodeReef(1))).toBe(1);
      expect(decodeReef(encodeReef(-0.5))).toBe(0);
      expect(decodeReef(encodeReef(2))).toBe(1);
      for (let m = 0; m <= 1; m += 0.01) {
        expect(Math.abs(decodeReef(encodeReef(m)) - m)).toBeLessThanOrEqual(1e-3);
      }
    });

    it("decodes every channel in GLSL straight from the float texel", () => {
      expect(TERRAIN_FIELD_GLSL).toContain("float terrainFieldHeight(vec4 texel) {\n    return texel.r;");
      expect(TERRAIN_FIELD_GLSL).toContain("float terrainFieldCoastDistance(vec4 texel) {\n    return texel.g;");
      expect(TERRAIN_FIELD_GLSL).toContain("float terrainFieldReef(vec4 texel) {\n    return texel.b;");
    });
  });

  describe("layout", () => {
    it("sizes the texture from the bounds at the texel density", () => {
      const field = rampField();
      const baked = bakeTerrainField(field, { texelsPerUnit: 4 });
      expect(baked.width).toBe(40);
      expect(baked.height).toBe(20);
      expect(baked.data).toBeInstanceOf(Uint16Array);
      expect(baked.data.length).toBe(40 * 20 * 4);
      expect(baked.bounds).toEqual(field.bounds);
    });

    it("caps each side at the max size", () => {
      const baked = bakeTerrainField(rampField(), { texelsPerUnit: 100, maxSize: 64 });
      expect(baked.width).toBe(64);
      expect(baked.height).toBeLessThanOrEqual(64);
    });

    it("places texel centres the way GL samples them: x along a row, rows from minZ up", () => {
      const baked = bakeTerrainField(rampField(), { texelsPerUnit: 4 });
      expect(texelCenter(baked, 0, 0)).toEqual([-4 + 0.125, 10 + 0.125]);
      const [x, z] = texelCenter(baked, 39, 19);
      expect(x).toBeCloseTo(6 - 0.125, 9);
      expect(z).toBeCloseTo(15 - 0.125, 9);
    });

    it("stores height in R and coast distance in G at each texel centre", () => {
      const field = rampField();
      const baked = bakeTerrainField(field, { texelsPerUnit: 4 });
      for (const [i, j] of [
        [0, 0],
        [39, 0],
        [0, 19],
        [17, 11],
      ]) {
        const [x, z] = texelCenter(baked, i, j);
        const [r, g] = texel(baked, i, j);
        expect(r).toBe(encodeHeight(field.sampleHeight(x, z)));
        expect(g).toBe(encodeCoastDistance(field.sampleCoastDistance(x, z)));
      }
    });

    it("leaves B clear (no reefs) and A at 1 when no reef mask is given", () => {
      const baked = bakeTerrainField(rampField(), { texelsPerUnit: 4 });
      for (let k = 0; k < baked.data.length; k += 4) {
        expect(decodeReef(baked.data[k + 2])).toBe(0);
        expect(decodeReef(baked.data[k + 3])).toBe(1);
      }
    });

    it("stores the reef mask in B at each texel centre, without touching R, G or A", () => {
      const field = rampField();
      // A known ramp across x, so a swapped axis or offset texel shows up.
      const sampleReef = (x: number) => Math.max(0, Math.min(1, (x - field.bounds.minX) / 10));
      const plain = bakeTerrainField(field, { texelsPerUnit: 4 });
      const withReefs = bakeTerrainField(field, { texelsPerUnit: 4, sampleReef });
      for (let j = 0; j < withReefs.height; j++) {
        for (let i = 0; i < withReefs.width; i++) {
          const [x] = texelCenter(withReefs, i, j);
          const [r, g, b, a] = texel(withReefs, i, j);
          const [r0, g0, , a0] = texel(plain, i, j);
          expect(b).toBe(encodeReef(sampleReef(x)));
          expect([r, g, a]).toEqual([r0, g0, a0]);
        }
      }
    });
  });

  describe("on a real height field", () => {
    const field = createTerrainHeightField(islandMap(), 1234);
    const baked = bakeTerrainField(field);

    it("matches sampleHeight at every texel within half-float precision", () => {
      for (let j = 0; j < baked.height; j++) {
        for (let i = 0; i < baked.width; i++) {
          const [x, z] = texelCenter(baked, i, j);
          const expected = field.sampleHeight(x, z);
          expect(Math.abs(decodeHeight(texel(baked, i, j)[0]) - expected)).toBeLessThanOrEqual(
            Math.abs(expected) * 1e-3 + 1e-7
          );
        }
      }
    });

    it("is deep water far from land", () => {
      const [r] = texel(baked, 0, 0);
      expect(decodeHeight(r) * M).toBeLessThan(-65);
    });

    it("samples at least as finely as the land mesh, so the shallows follow the same coastline", () => {
      const { minX, maxX, minZ, maxZ } = baked.bounds;
      expect((maxX - minX) / baked.width).toBeLessThanOrEqual(LAND_MESH_SPACING);
      expect((maxZ - minZ) / baked.height).toBeLessThanOrEqual(LAND_MESH_SPACING);
    });

    it("puts the waterline on the noisy coast, not the hex outline", () => {
      // Texels whose land/water sign disagrees with the hex they sit in: the
      // noise pushes the coast off the hex edges, so there must be some.
      const hexField = createTerrainHeightField(islandMap(), 1234, { coastNoiseAmplitude: 0 });
      let offOutline = 0;
      for (let j = 0; j < baked.height; j++) {
        for (let i = 0; i < baked.width; i++) {
          const [x, z] = texelCenter(baked, i, j);
          const isLand = decodeHeight(texel(baked, i, j)[0]) > 0;
          if (isLand !== hexField.sampleCoastDistance(x, z) > 0) offOutline++;
        }
      }
      expect(offOutline).toBeGreaterThan(20);
    });
  });

  describe("with reefs on a real map", () => {
    // The 7-hex island plus a ring-2 hex and a pair of adjacent ring-3 hexes as reef.
    const reefKeys = ["2,0", "0,3", "1,2"];
    const cells = islandMap().map((c) =>
      reefKeys.includes(`${c.hex.q},${c.hex.r}`) ? { ...c, terrain: "reef" as const, elevation: 0 as const } : c
    );
    const field = createTerrainHeightField(cells, 1234);
    const baked = bakeTerrainField(field, { sampleReef: createReefMask(cells) });

    it("marks the texel at every reef hex centre as full reef", () => {
      for (const k of reefKeys) {
        const [q, r] = k.split(",").map(Number);
        const [x, , z] = hexToWorld({ q, r, s: -q - r });
        const { minX, maxX, minZ, maxZ } = baked.bounds;
        const i = Math.floor(((x - minX) / (maxX - minX)) * baked.width);
        const j = Math.floor(((z - minZ) / (maxZ - minZ)) * baked.height);
        expect(decodeReef(texel(baked, i, j)[2])).toBe(1);
      }
    });

    it("never marks a texel that sits in a non-reef hex", () => {
      let reefTexels = 0;
      for (let j = 0; j < baked.height; j++) {
        for (let i = 0; i < baked.width; i++) {
          const [x, z] = texelCenter(baked, i, j);
          const h = worldToHex(x, z);
          const b = decodeReef(texel(baked, i, j)[2]);
          if (!reefKeys.includes(`${h.q},${h.r}`)) expect(b).toBe(0);
          else if (b > 0) reefTexels++;
        }
      }
      expect(reefTexels).toBeGreaterThan(0);
    });

    it("leaves the height and coast distance channels as they were without the reef mask", () => {
      const plain = bakeTerrainField(field);
      for (let k = 0; k < baked.data.length; k += 4) {
        expect(baked.data[k]).toBe(plain.data[k]);
        expect(baked.data[k + 1]).toBe(plain.data[k + 1]);
        expect(decodeReef(baked.data[k + 3])).toBe(1);
      }
    });
  });

  it("defaults to a few texels per world unit with a sane cap", () => {
    expect(TERRAIN_TEXELS_PER_UNIT).toBeGreaterThanOrEqual(1 / LAND_MESH_SPACING);
    // WebGL2 guarantees at least 2048 per side.
    expect(TERRAIN_TEXTURE_MAX_SIZE).toBeLessThanOrEqual(2048);
  });

  it("is fine enough (≥ 12 texels per unit) for a smooth surf outline, even on the large map", () => {
    expect(TERRAIN_TEXELS_PER_UNIT).toBeGreaterThanOrEqual(12);
    const cells = generateMap(getMapPreset("large").radius, 31337);
    const { bounds } = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const longSide = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    // The cap must not lower the density on the largest map.
    expect(Math.ceil(longSide * TERRAIN_TEXELS_PER_UNIT)).toBeLessThanOrEqual(TERRAIN_TEXTURE_MAX_SIZE);
  });
});
