import { describe, expect, it } from "vitest";
import { createSeaSurface, fieldSeabed } from "./seaSurface";
import { WAVE_CASCADES } from "./oceanWaves";
import { cascadeWavenumber, evolvedDisplacementSpectrum, inCascadeBand, initialSpectrum, nyquistWavenumber } from "./waveCascade";
import { inverseFft2d } from "./fftButterfly";
import { WAVE_LOOP_SECONDS } from "./waveClock";
import { METRES_PER_UNIT } from "./worldScale";
import { DISPLACEMENT_DEEP_METRES, DISPLACEMENT_FULL_DEPTH_METRES } from "./waveDisplacement";

const SWELL = WAVE_CASCADES[0];
const SWELL_INITIAL = initialSpectrum(SWELL);
const OPEN_SEA = () => -10; // seabed 650 m down: full displacement
const TILE_UNITS = SWELL.tileMetres / METRES_PER_UNIT;

/**
 * The world (x, z) where the GPU draws the full-size swell texel (i, j): its
 * centre, uv = (i + ½, j + ½) / size, turned from the tile's axes into the
 * world's by the cascade's rotation (cascadeTileUv, inverted).
 */
function worldAtTexel(i: number, j: number): [number, number] {
  const u = (i + 0.5) / SWELL.size;
  const v = (j + 0.5) / SWELL.size;
  const c = Math.cos(SWELL.rotation);
  const s = Math.sin(SWELL.rotation);
  return [(c * u - s * v) * TILE_UNITS, (s * u + c * v) * TILE_UNITS];
}

/** The GPU pipeline's swell height, metres, mirrored on the CPU at full size: row-major (j · size + i). */
function mirroredSwellHeights(seconds: number): Float64Array {
  const { heightAndX } = evolvedDisplacementSpectrum(SWELL_INITIAL, SWELL, seconds, WAVE_LOOP_SECONDS, 0);
  return inverseFft2d(heightAndX.re, heightAndX.im, SWELL.size).re;
}

function directSum(spectrum: { re: Float64Array; im: Float64Array }, x: number, z: number): number {
  const c = Math.cos(SWELL.rotation);
  const s = Math.sin(SWELL.rotation);
  const texelMetres = SWELL.tileMetres / SWELL.size;
  // Tile-axis position, metres, of the point a texel-centred read lands on.
  const px = (c * x + s * z) * METRES_PER_UNIT - texelMetres / 2;
  const pz = (-s * x + c * z) * METRES_PER_UNIT - texelMetres / 2;
  let h = 0;
  for (let j = 0; j < SWELL.size; j++) {
    for (let i = 0; i < SWELL.size; i++) {
      const a = spectrum.re[j * SWELL.size + i];
      const b = spectrum.im[j * SWELL.size + i];
      if (a === 0 && b === 0) continue;
      const kx = cascadeWavenumber(i, SWELL.size, SWELL.tileMetres);
      const kz = cascadeWavenumber(j, SWELL.size, SWELL.tileMetres);
      const phase = kx * px + kz * pz;
      h += a * Math.cos(phase) - b * Math.sin(phase);
    }
  }
  return h;
}

/** Points over a hull of 25 × 7 m centred on (x, z), long side along `heading`, world units. */
function hullFootprint(x: number, z: number, heading: number): [number, number][] {
  const points: [number, number][] = [];
  const along = [Math.cos(heading), Math.sin(heading)];
  for (let a = -2; a <= 2; a++) {
    for (let b = -1; b <= 1; b++) {
      const u = (a * 12.5) / 2 / METRES_PER_UNIT;
      const v = (b * 3.5) / METRES_PER_UNIT;
      points.push([x + along[0] * u - along[1] * v, z + along[1] * u + along[0] * v]);
    }
  }
  return points;
}

describe("createSeaSurface", () => {
  it("averaged over a 25 × 7 m hull, is within 5 cm RMS of the exact sum of the swell's modes", () => {
    const seconds = 40;
    const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
    const { heightAndX } = evolvedDisplacementSpectrum(SWELL_INITIAL, SWELL, seconds, WAVE_LOOP_SECONDS, 0);
    let squaredError = 0;
    const hulls = 24;
    for (let n = 0; n < hulls; n++) {
      // Spread over the tile and its neighbours, off the lattice.
      const x = (n * 7.31) % 45 - 20;
      const z = (n * 4.77) % 37 - 15;
      const footprint = hullFootprint(x, z, n * 0.9);
      const mean = (f: (p: [number, number]) => number) => footprint.reduce((sum, p) => sum + f(p), 0) / footprint.length;
      const cpu = mean(([px, pz]) => sea.heightAt(px, pz, seconds, [px, 1, pz]) * METRES_PER_UNIT);
      const exact = mean(([px, pz]) => directSum(heightAndX, px, pz));
      squaredError += (cpu - exact) ** 2;
    }
    expect(Math.sqrt(squaredError / hulls)).toBeLessThan(0.05);
  });

  it("at the half-size lattice points, is the full-size swell the GPU draws, to 1e-6 m", () => {
    const seconds = 12;
    const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
    const mirror = mirroredSwellHeights(seconds);
    for (const [i, j] of [
      [0, 0],
      [2, 0],
      [0, 2],
      [64, 130],
      [254, 254],
      [100, 36],
    ]) {
      const [x, z] = worldAtTexel(i, j);
      const camera: [number, number, number] = [x, 1, z];
      const metres = sea.heightAt(x, z, seconds, camera) * METRES_PER_UNIT;
      expect(Math.abs(metres - mirror[j * SWELL.size + i])).toBeLessThan(1e-6);
    }
  });

  describe("damping and fade, as the water's vertex stage", () => {
    const seconds = 12;
    const [x, z] = worldAtTexel(64, 130);
    const near: [number, number, number] = [x, 1, z];
    const open = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true }).heightAt(x, z, seconds, near);
    const seabedAt = (metresDown: number) => createSeaSurface({ seabedHeightAt: () => -metresDown / METRES_PER_UNIT, enabled: true });

    it("is measured at a point the swell lifts by more than 5 cm", () => {
      expect(Math.abs(open * METRES_PER_UNIT)).toBeGreaterThan(0.05);
    });

    it("is flat on land and at the waterline", () => {
      expect(seabedAt(-3).heightAt(x, z, seconds, near)).toBe(0);
      expect(seabedAt(0).heightAt(x, z, seconds, near)).toBe(0);
    });

    it("is full past the full-displacement depth and half at half that depth", () => {
      expect(seabedAt(DISPLACEMENT_FULL_DEPTH_METRES + 0.5).heightAt(x, z, seconds, near)).toBeCloseTo(open, 12);
      expect(seabedAt(DISPLACEMENT_FULL_DEPTH_METRES / 2).heightAt(x, z, seconds, near)).toBeCloseTo(open / 2, 12);
    });

    it("fades with camera distance: full to 45 units, half at 67.5, flat from 90", () => {
      const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
      const seenFrom = (distance: number): [number, number, number] => [x + distance * 0.6, 0, z + distance * 0.8];
      expect(sea.heightAt(x, z, seconds, seenFrom(44))).toBeCloseTo(open, 12);
      expect(sea.heightAt(x, z, seconds, seenFrom(67.5))).toBeCloseTo(open / 2, 12);
      expect(sea.heightAt(x, z, seconds, seenFrom(95))).toBe(0);
    });
  });

  it("is flat everywhere where the GPU cannot run the cascades", () => {
    const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: false });
    for (const [i, j] of [[64, 130], [10, 200], [31, 7]]) {
      const [x, z] = worldAtTexel(i, j);
      expect(sea.heightAt(x, z, 12, [x, 1, z])).toBe(0);
    }
  });

  describe("between key times of the wave clock, 0.1 s apart", () => {
    const lattice = [
      [64, 130],
      [10, 200],
      [130, 12],
      [200, 90],
      [32, 32],
      [150, 250],
    ].map(([i, j]) => ({ i, j, at: worldAtTexel(i, j) }));

    it("is interpolated linearly from the two key times around it", () => {
      const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
      for (const { at: [x, z] } of lattice) {
        const camera: [number, number, number] = [x, 1, z];
        const before = sea.heightAt(x, z, 21.2, camera);
        const after = sea.heightAt(x, z, 21.3, camera);
        expect(sea.heightAt(x, z, 21.225, camera)).toBeCloseTo(0.75 * before + 0.25 * after, 12);
        expect(sea.heightAt(x, z, 21.29, camera)).toBeCloseTo(0.1 * before + 0.9 * after, 12);
      }
    });

    it("stays within 1% of the exact field, across the loop's wrap too", () => {
      const sea = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
      for (const seconds of [3.05, 77.749, WAVE_LOOP_SECONDS - 0.04]) {
        const exact = mirroredSwellHeights(seconds);
        let error = 0;
        let power = 0;
        for (const { i, j, at: [x, z] } of lattice) {
          const h = exact[j * SWELL.size + i];
          error += (sea.heightAt(x, z, seconds, [x, 1, z]) * METRES_PER_UNIT - h) ** 2;
          power += h * h;
        }
        expect(Math.sqrt(error / power)).toBeLessThan(0.01);
      }
    });
  });

  describe("the swell band fits a grid of half the cascade's size", () => {
    it("every in-band mode's index is under a quarter of the cascade's size", () => {
      const signed = (i: number) => (i < SWELL.size / 2 ? i : i - SWELL.size);
      let inBand = 0;
      for (let j = 0; j < SWELL.size; j++) {
        for (let i = 0; i < SWELL.size; i++) {
          const k = Math.hypot(cascadeWavenumber(i, SWELL.size, SWELL.tileMetres), cascadeWavenumber(j, SWELL.size, SWELL.tileMetres));
          if (!inCascadeBand(k, SWELL)) continue;
          inBand++;
          expect(Math.abs(signed(i))).toBeLessThan(SWELL.size / 4);
          expect(Math.abs(signed(j))).toBeLessThan(SWELL.size / 4);
        }
      }
      expect(inBand).toBeGreaterThan(10_000);
    });

    it("refuses a cascade whose band reaches past it", () => {
      const wide = { ...SWELL, kMax: 0.75 * nyquistWavenumber(SWELL.size, SWELL.tileMetres) };
      expect(() => createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true, cascade: wide })).toThrow(RangeError);
    });
  });
});

describe("fieldSeabed", () => {
  const bounds = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 };
  const sampleHeight = (x: number, z: number) => -0.01 * (x + z);

  it("is the terrain field's height on the field, its edges included", () => {
    const seabed = fieldSeabed({ sampleHeight, bounds, periodX: null });
    expect(seabed(3, 2)).toBe(-0.05);
    expect(seabed(10, -5)).toBe(-0.05);
  });

  it("is open sea DISPLACEMENT_DEEP_METRES deep off the field, as the water's vertex stage reads it", () => {
    const seabed = fieldSeabed({ sampleHeight, bounds, periodX: null });
    const deep = -DISPLACEMENT_DEEP_METRES / METRES_PER_UNIT;
    expect(seabed(10.5, 0)).toBe(deep);
    expect(seabed(0, -6)).toBe(deep);
  });

  it("on a wrapping field, is off it only north and south", () => {
    const seabed = fieldSeabed({ sampleHeight, bounds, periodX: 20 });
    expect(seabed(43, 2)).toBe(-0.45);
    expect(seabed(43, 6)).toBe(-DISPLACEMENT_DEEP_METRES / METRES_PER_UNIT);
  });
});
