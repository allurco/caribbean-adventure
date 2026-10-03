import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid, hexToWorld, worldToHex } from "../../game/hex";
import { createReefMask } from "./reefMask";
import { createTerrainHeightField, type TerrainHeightField } from "./terrainHeightField";
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
  HEIGHT_ENCODE_MIN,
  HEIGHT_ENCODE_MAX,
  COAST_ENCODE_RANGE,
  TERRAIN_TEXELS_PER_UNIT,
  TERRAIN_TEXTURE_MAX_SIZE,
  TERRAIN_FIELD_GLSL,
  type BakedTerrainField,
} from "./terrainFieldTexture";

/** One 8-bit step of each encoding, in world units. */
const HEIGHT_STEP = (HEIGHT_ENCODE_MAX - HEIGHT_ENCODE_MIN) / 255;
const COAST_STEP = (2 * COAST_ENCODE_RANGE) / 255;

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
    bounds,
  };
}

function texel(baked: BakedTerrainField, i: number, j: number): [number, number, number, number] {
  const k = (j * baked.width + i) * 4;
  return [baked.data[k], baked.data[k + 1], baked.data[k + 2], baked.data[k + 3]];
}

describe("terrainFieldTexture", () => {
  describe("encoding", () => {
    it("represents sea level exactly", () => {
      expect(decodeHeight(encodeHeight(0))).toBe(0);
    });

    it("round-trips heights within one 8-bit step and clamps out-of-range values", () => {
      for (let h = HEIGHT_ENCODE_MIN; h <= HEIGHT_ENCODE_MAX; h += 0.013) {
        expect(Math.abs(decodeHeight(encodeHeight(h)) - h)).toBeLessThanOrEqual(HEIGHT_STEP / 2 + 1e-9);
      }
      expect(encodeHeight(5)).toBe(255);
      expect(encodeHeight(-5)).toBe(0);
    });

    it("round-trips coast distance within one 8-bit step", () => {
      for (let d = -COAST_ENCODE_RANGE; d <= COAST_ENCODE_RANGE; d += 0.017) {
        expect(Math.abs(decodeCoastDistance(encodeCoastDistance(d)) - d)).toBeLessThanOrEqual(COAST_STEP / 2 + 1e-9);
      }
    });

    it("keeps the land/water sign of the coast distance through the round trip", () => {
      // The surf draws foam only where the decoded distance is negative, so a
      // point on land must never decode as water (and vice versa).
      for (let d = 0.01; d <= COAST_ENCODE_RANGE; d += 0.01) {
        expect(decodeCoastDistance(encodeCoastDistance(d))).toBeGreaterThan(0);
        expect(decodeCoastDistance(encodeCoastDistance(-d))).toBeLessThan(0);
      }
      // The waterline itself lands on the land side, so it carries no foam.
      expect(decodeCoastDistance(encodeCoastDistance(0))).toBeGreaterThanOrEqual(0);
    });

    it("encodes the reef mask as 0 … 255 and clamps it", () => {
      expect(encodeReef(0)).toBe(0);
      expect(encodeReef(1)).toBe(255);
      expect(encodeReef(-0.5)).toBe(0);
      expect(encodeReef(2)).toBe(255);
      for (let m = 0; m <= 1; m += 0.01) {
        expect(Math.abs(decodeReef(encodeReef(m)) - m)).toBeLessThanOrEqual(0.5 / 255 + 1e-9);
      }
      // Open water must decode as exactly no reef.
      expect(decodeReef(encodeReef(0))).toBe(0);
    });

    it("decodes the reef mask in GLSL straight from the normalised B channel", () => {
      expect(TERRAIN_FIELD_GLSL).toContain("float terrainFieldReef(vec4 texel)");
      expect(TERRAIN_FIELD_GLSL).toContain("return texel.b;");
    });

    it("decodes coast distance in GLSL with the same formula as TypeScript", () => {
      // GLSL reads the byte as code / 255; the shader decoder is (g·2 − 1)·range.
      expect(TERRAIN_FIELD_GLSL).toContain("float terrainFieldCoastDistance(vec4 texel)");
      expect(TERRAIN_FIELD_GLSL).toContain(`(texel.g * 2.0 - 1.0) * ${COAST_ENCODE_RANGE.toFixed(4)}`);
      for (let code = 0; code <= 255; code++) {
        const glsl = ((code / 255) * 2 - 1) * Number(COAST_ENCODE_RANGE.toFixed(4));
        expect(decodeCoastDistance(code)).toBeCloseTo(glsl, 9);
      }
    });
  });

  describe("layout", () => {
    it("sizes the texture from the bounds at the texel density", () => {
      const field = rampField();
      const baked = bakeTerrainField(field, { texelsPerUnit: 4 });
      expect(baked.width).toBe(40);
      expect(baked.height).toBe(20);
      expect(baked.data).toBeInstanceOf(Uint8Array);
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

    it("leaves B clear (no reefs) and A opaque when no reef mask is given", () => {
      const baked = bakeTerrainField(rampField(), { texelsPerUnit: 4 });
      for (let k = 0; k < baked.data.length; k += 4) {
        expect(baked.data[k + 2]).toBe(0);
        expect(baked.data[k + 3]).toBe(255);
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

    it("matches sampleHeight at every texel within quantisation", () => {
      for (let j = 0; j < baked.height; j++) {
        for (let i = 0; i < baked.width; i++) {
          const [x, z] = texelCenter(baked, i, j);
          const expected = Math.min(HEIGHT_ENCODE_MAX, Math.max(HEIGHT_ENCODE_MIN, field.sampleHeight(x, z)));
          expect(Math.abs(decodeHeight(texel(baked, i, j)[0]) - expected)).toBeLessThanOrEqual(HEIGHT_STEP / 2 + 1e-9);
        }
      }
    });

    it("is negative (water) far from land", () => {
      const [r] = texel(baked, 0, 0);
      expect(decodeHeight(r)).toBeLessThan(-0.5);
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
        expect(texel(baked, i, j)[2]).toBe(255);
      }
    });

    it("never marks a texel that sits in a non-reef hex", () => {
      let reefTexels = 0;
      for (let j = 0; j < baked.height; j++) {
        for (let i = 0; i < baked.width; i++) {
          const [x, z] = texelCenter(baked, i, j);
          const h = worldToHex(x, z);
          const b = texel(baked, i, j)[2];
          if (!reefKeys.includes(`${h.q},${h.r}`)) expect(b).toBe(0);
          else if (b > 0) reefTexels++;
        }
      }
      expect(reefTexels).toBeGreaterThan(0);
    });

    it("leaves the height and coast distance channels as they were without reefs", () => {
      const plain = bakeTerrainField(field);
      for (let k = 0; k < baked.data.length; k += 4) {
        expect(baked.data[k]).toBe(plain.data[k]);
        expect(baked.data[k + 1]).toBe(plain.data[k + 1]);
        expect(baked.data[k + 3]).toBe(255);
      }
    });
  });

  it("defaults to a few texels per world unit with a sane cap", () => {
    expect(TERRAIN_TEXELS_PER_UNIT).toBeGreaterThanOrEqual(1 / LAND_MESH_SPACING);
    expect(TERRAIN_TEXTURE_MAX_SIZE).toBeLessThanOrEqual(2048);
  });
});
