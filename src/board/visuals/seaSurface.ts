/**
 * The sea surface on the CPU (#141, ADR 0004): how high the drawn swell is at
 * a world point, so what floats can ride it.
 *
 * The sea's definition is its spectrum and its wave clock. The GPU evaluates
 * them to draw the water (useWaveCascades.ts); this module evaluates the
 * swell cascade's band from the same `initialSpectrum`, evolved by
 * `evolvedAmplitude` to the same time. A band ends at half its grid's Nyquist
 * (BAND_NYQUIST_SHARE), so every swell mode has a signed index under a
 * quarter of the cascade's size and the band fits exactly on a grid of half
 * that size: a 128² inverse FFT gives the 256² swell's height at every other
 * lattice point. The grid is sampled bilinearly where the GPU draws it,
 * through the tile's rotation and repeat and the texel-centre offset of a
 * texture read.
 *
 * The field is rebuilt on key times of the wave clock, SEA_KEY_SECONDS
 * apart, and interpolated linearly between the two around the current time:
 * the FFT runs ten times a second of wave time, and not at all while the
 * clock is frozen. The swell's waves last 5 s and more, so the interpolated
 * height stays well within 1% of the exact one.
 *
 * Like the water's displacement (waveDisplacement.ts) the height is damped
 * by the seabed's depth (`shallowDisplacementDamping`) and faded with
 * distance from the camera (`waveDetailFade`), and it is flat where the GPU
 * cannot run the cascades. Same spectrum, clock and damping, but not the
 * same read: this samples the full-resolution heights (LOD 0) with no
 * choppy (Dx, Dz) shift, where the vertex stage reads a mip level (about
 * 0.68 at the inner ring) and moves each vertex sideways, so the two differ
 * by a few centimetres.
 */
import { inverseFft2d } from "./fftButterfly";
import { WAVE_CASCADES } from "./oceanWaves";
import { cascadeWavenumber, evolvedAmplitude, initialSpectrum, type WaveCascade } from "./waveCascade";
import { WAVE_LOOP_SECONDS } from "./waveClock";
import { DISPLACEMENT_DEEP_METRES, WAVE_HEIGHT_GAIN, shallowDisplacementDamping } from "./waveDisplacement";
import { waveDetailFade } from "./waveNormalFilter";
import type { TerrainHeightField } from "./terrainHeightField";
import { METRES_PER_UNIT } from "./worldScale";

/** Wave time between rebuilds of the CPU field, s. */
export const SEA_KEY_SECONDS = 0.1;
const KEYS_PER_LOOP = Math.round(WAVE_LOOP_SECONDS / SEA_KEY_SECONDS);

/**
 * The seabed height the sea surface damps by, from the terrain field: its
 * `sampleHeight` on the field, and open sea DISPLACEMENT_DEEP_METRES deep off
 * it, where the water's vertex stage stops reading the baked field (on a
 * wrapping map, only north and south of it). Past the field `sampleHeight`
 * itself levels out about 115 m down, deep enough for full displacement too,
 * but this keeps the CPU reading what the GPU reads.
 */
export function fieldSeabed(
  field: Pick<TerrainHeightField, "sampleHeight" | "bounds" | "periodX">
): (x: number, z: number) => number {
  const { sampleHeight, bounds, periodX } = field;
  const deep = -DISPLACEMENT_DEEP_METRES / METRES_PER_UNIT;
  return (x, z) => {
    const insideX = periodX !== null || (x >= bounds.minX && x <= bounds.maxX);
    return insideX && z >= bounds.minZ && z <= bounds.maxZ ? sampleHeight(x, z) : deep;
  };
}

export interface SeaSurfaceOptions {
  /** Terrain height (world Y) at world (x, z): the shared terrain field's `sampleHeight`. */
  seabedHeightAt: (x: number, z: number) => number;
  /** False where the GPU cannot run the cascades and draws a flat sea. */
  enabled: boolean;
  /** The cascade evaluated; the swell. */
  cascade?: WaveCascade;
}

export interface SeaSurface {
  /** Height of the drawn surface above sea level, world units, at world (x, z) at wave time `seconds`, seen from `camera`. */
  heightAt: (x: number, z: number, seconds: number, camera: readonly [number, number, number]) => number;
}

interface Mode {
  /** Index into the half-size grid. */
  cell: number;
  k: number;
  texel: Float32Array;
}

/** The cascade's modes on a grid of half its size; throws if its band does not fit there. */
function halfGridModes(cascade: WaveCascade): Mode[] {
  const { size, tileMetres } = cascade;
  const half = size / 2;
  const initial = initialSpectrum(cascade);
  const modes: Mode[] = [];
  for (let zi = 0; zi < size; zi++) {
    for (let xi = 0; xi < size; xi++) {
      const t = (zi * size + xi) * 4;
      const texel = initial.subarray(t, t + 4);
      if (texel.every((v) => v === 0)) continue;
      const nx = xi < half ? xi : xi - size;
      const nz = zi < half ? zi : zi - size;
      if (Math.abs(nx) >= half / 2 || Math.abs(nz) >= half / 2) {
        throw new RangeError(`Mode (${nx}, ${nz}) of the ${tileMetres} m tile does not fit a ${half}² grid.`);
      }
      const k = Math.hypot(cascadeWavenumber(xi, size, tileMetres), cascadeWavenumber(zi, size, tileMetres));
      modes.push({ cell: ((nz + half) % half) * half + ((nx + half) % half), k, texel });
    }
  }
  return modes;
}

/** The band's height, metres, on the half-size grid at wave time `seconds`: row-major (z · half + x). */
function heightGrid(modes: readonly Mode[], half: number, seconds: number): Float64Array {
  const re = new Float64Array(half * half);
  const im = new Float64Array(half * half);
  for (const { cell, k, texel } of modes) {
    const [hr, hi] = evolvedAmplitude(texel, k, seconds, WAVE_LOOP_SECONDS);
    re[cell] = hr;
    im[cell] = hi;
  }
  return inverseFft2d(re, im, half).re;
}

const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

export function createSeaSurface({ seabedHeightAt, enabled, cascade = WAVE_CASCADES[0] }: SeaSurfaceOptions): SeaSurface {
  const half = cascade.size / 2;
  const modes = halfGridModes(cascade);
  const tileUnits = cascade.tileMetres / METRES_PER_UNIT;
  const turnC = Math.cos(cascade.rotation);
  const turnS = Math.sin(cascade.rotation);
  // The grids at the key times last used, by key index.
  let keys = new Map<number, Float64Array>();
  const gridAtKey = (key: number) => keys.get(key) ?? heightGrid(modes, half, key * SEA_KEY_SECONDS);
  /** The grids at key times k0 and k1, kept for the next call (and only they). */
  const holdKeys = (k0: number, k1: number): [Float64Array, Float64Array] => {
    const g0 = gridAtKey(k0);
    const g1 = gridAtKey(k1);
    if (!keys.has(k0) || !keys.has(k1)) {
      keys = new Map([
        [k0, g0],
        [k1, g1],
      ]);
    }
    return [g0, g1];
  };

  const sample = (grid: Float64Array, x: number, z: number) => {
    // cascadeTileUv, then a texel-centred read of the full-size texture: full
    // index u · size − ½, which is half that on the half-size grid.
    const px = x / tileUnits;
    const pz = z / tileUnits;
    const gx = ((turnC * px + turnS * pz) * cascade.size - 0.5) / 2;
    const gz = ((-turnS * px + turnC * pz) * cascade.size - 0.5) / 2;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const at = (i: number, j: number) => grid[wrapIndex(j, half) * half + wrapIndex(i, half)];
    return (
      (at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx) * (1 - fz) +
      (at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx) * fz
    );
  };

  /** The swell's height, metres, at wave time `seconds`: between the key times around it. */
  const swellAt = (x: number, z: number, seconds: number) => {
    // The epsilon keeps a time on a key (12 / 0.1 = 119.99…) on that key.
    const step = Math.floor(seconds / SEA_KEY_SECONDS + 1e-9);
    const w = Math.min(1, Math.max(0, seconds / SEA_KEY_SECONDS - step));
    const k0 = wrapIndex(step, KEYS_PER_LOOP);
    const k1 = wrapIndex(step + 1, KEYS_PER_LOOP);
    const [g0, g1] = holdKeys(k0, k1);
    const h0 = sample(g0, x, z);
    return w === 0 ? h0 : h0 * (1 - w) + sample(g1, x, z) * w;
  };

  return {
    heightAt: (x, z, seconds, [cx, cy, cz]) => {
      if (!enabled) return 0;
      const damping = shallowDisplacementDamping(-seabedHeightAt(x, z) * METRES_PER_UNIT);
      const fade = waveDetailFade(Math.hypot(x - cx, cy, z - cz));
      const gain = WAVE_HEIGHT_GAIN * damping * fade;
      if (gain === 0) return 0;
      return (gain * swellAt(x, z, seconds)) / METRES_PER_UNIT;
    },
  };
}
