/**
 * One FFT ocean cascade (#38): a square tile of `size`² Fourier modes,
 * `tileMetres` across, that carries the wind sea's energy between wavenumbers
 * kMin (kept) and kMax (dropped), after Tessendorf (2001), "Simulating Ocean
 * Water". Step 5 stacks several of these with non-overlapping bands.
 *
 * Spectrum on the grid. A mode at wavevector k (spacing Δk = 2π / tile) gets
 * the directional wavenumber spectrum
 *   F(k) = S(ω) · D(θ, ω) · (dω/dk) / |k|,  ω = √(g|k|),
 * so that Σ F Δk² over the band is the height variance (jonswap.ts,
 * directionalSpreading.ts, waveDispersion.ts). Each mode starts with a
 * complex Gaussian amplitude h0(k) of variance E|h0|² = F Δk² / 2, and evolves
 *   h̃(k, t) = h0(k) e^(−iωt) + conj(h0(−k)) e^(+iωt),
 * which keeps the height field real and sends crests along k.
 *
 * The cascade's per-frame output is the surface slope: x and z slopes are both
 * real, so they are packed into one complex inverse FFT as
 *   C(k) = i·kx·h̃ + i·(i·kz·h̃),   IFFT(C) = ∂h/∂x + i ∂h/∂z.
 * `evolvedSlopeSpectrum` is the CPU mirror of the GPU spectrum pass.
 *
 * Whitecaps (#38 step 7) need the choppy horizontal displacement's
 * derivatives. With Gerstner's sign for this e^(+ik·x) transform the
 * displacement pulls the surface toward the crests,
 *   D(k) = i λ (k/|k|) h̃,
 * so ∂Du/∂u along a unit direction u has spectrum −λ (k·u)² / |k| · h̃: real
 * coefficients, even in k, so the field is real. Two of them ride in the
 * working texture's spare complex pair the same way as the slopes,
 *   B(k) = −λ h̃ ((k·u)² + i (k·v)²) / |k|,   IFFT(B) = ∂Du/∂u + i ∂Dv/∂v,
 * with u the wind direction and v across it (`windInTile`): along the wind
 * the stretch is largest and the shear ∂Du/∂v, which does not fit, is
 * smallest (whitecapFoam.ts). `evolvedStretchSpectrum` is the CPU mirror.
 *
 * The geometry (#38 step 8) needs the displacement itself from the large
 * cascades: the height h and the choppy pull D = i λ (k/|k|) h̃. Three real
 * fields, packed into two more inverse FFTs that ride in their own blocks of
 * the atlas (waveCascadeAtlas.ts, waveCascadeShaders.ts):
 *   P(k) = h̃ + i · i λ (kx/|k|) h̃ = h̃ (1 − λ kx/|k|),   IFFT(P) = h + i Dx,
 *   Q(k) = i λ (kz/|k|) h̃,                              IFFT(Q) = Dz + i·0,
 * in the tile's own axes (the water turns D into the world's).
 * `evolvedDisplacementSpectrum` is the CPU mirror.
 */
import { directionalSpreading } from "./directionalSpreading";
import { jonswapSpectrum, type WindSea } from "./jonswap";
import { deepWaterFrequency, deepWaterFrequencySlope, wavePeriodMultiple } from "./waveDispersion";

export interface WaveCascade {
  sea: WindSea;
  /** Direction the wind blows toward, radians from +x toward +z (world XZ). */
  windAngle: number;
  /**
   * Turn of the tile against the world, radians from +x toward +z: the tile's
   * own x axis points along this world angle. Cascades turned by different
   * angles never line their repeats up along the same axes.
   */
  rotation: number;
  /** Tile width in metres; the field repeats with this period. */
  tileMetres: number;
  /** Modes per side (a power of two). */
  size: number;
  /** Band of wavenumbers this cascade carries, rad/m: kMin ≤ |k| < kMax. */
  kMin: number;
  kMax: number;
  /** Seed of the random mode amplitudes. */
  seed: number;
}

/** Wavenumber (rad/m) of grid index `i`, in standard FFT order. */
export function cascadeWavenumber(i: number, size: number, tileMetres: number): number {
  const n = i < size / 2 ? i : i - size;
  return (2 * Math.PI * n) / tileMetres;
}

/** The highest wavenumber a grid of `size` over `tileMetres` can hold: π · size / tile. */
export function nyquistWavenumber(size: number, tileMetres: number): number {
  return (Math.PI * size) / tileMetres;
}

/** Whether a mode of wavenumber magnitude `k` belongs to this cascade. Never the mean (k = 0). */
export function inCascadeBand(k: number, { kMin, kMax }: WaveCascade): boolean {
  return k > 0 && k >= kMin && k < kMax;
}

/** E|h0(k)|², m², for the mode at wavevector (kx, kz) in the tile's own axes. */
export function modeVariance(kx: number, kz: number, cascade: WaveCascade): number {
  const k = Math.hypot(kx, kz);
  if (!inCascadeBand(k, cascade)) return 0;
  const omega = deepWaterFrequency(k);
  // The tile's axes are turned by `rotation` against the world's.
  const theta = Math.atan2(kz, kx) + cascade.rotation - cascade.windAngle;
  const density =
    (jonswapSpectrum(omega, cascade.sea) *
      directionalSpreading(theta, omega, cascade.sea) *
      deepWaterFrequencySlope(k)) /
    k;
  const dk = (2 * Math.PI) / cascade.tileMetres;
  return (density * dk * dk) / 2;
}

/** mulberry32 + Box–Muller: a seeded stream of standard normal numbers. */
function gaussianStream(seed: number): () => number {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
}

/**
 * The initial amplitudes as RGBA texels, row-major (index z · size + x):
 * (h0(k).re, h0(k).im, conj(h0(−k)).re, conj(h0(−k)).im).
 */
export function initialSpectrum(cascade: WaveCascade): Float32Array {
  const { size, tileMetres } = cascade;
  const gauss = gaussianStream(cascade.seed);
  const h0 = new Float64Array(size * size * 2);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(z, size, tileMetres);
      const amplitude = Math.sqrt(modeVariance(kx, kz, cascade) / 2);
      const i = (z * size + x) * 2;
      h0[i] = gauss() * amplitude;
      h0[i + 1] = gauss() * amplitude;
    }
  }
  const data = new Float32Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = (z * size + x) * 2;
      const mirror = (((size - z) % size) * size + ((size - x) % size)) * 2;
      const t = (z * size + x) * 4;
      data[t] = h0[i];
      data[t + 1] = h0[i + 1];
      data[t + 2] = h0[mirror];
      data[t + 3] = -h0[mirror + 1];
    }
  }
  return data;
}

/**
 * One mode's amplitude h̃(k, t) = h0(k) e^(−iφ) + conj(h0(−k)) e^(+iφ), as
 * [re, im], from its `initialSpectrum` texel (h0.re, h0.im, conj.re,
 * conj.im) at wavenumber magnitude `k`. The phase φ = 2π·fract(m·t / loop)
 * uses the loop-quantised frequency (wavePeriodMultiple), so the mode repeats
 * exactly after one loop. Pure, for CPU sampling of the sea too.
 */
export function evolvedAmplitude(
  texel: ArrayLike<number>,
  k: number,
  seconds: number,
  loopSeconds: number
): [number, number] {
  const m = wavePeriodMultiple(k, loopSeconds);
  const phase = 2 * Math.PI * ((m * (seconds / loopSeconds)) % 1);
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  return [
    texel[0] * c + texel[1] * s + texel[2] * c - texel[3] * s,
    texel[1] * c - texel[0] * s + texel[3] * c + texel[2] * s,
  ];
}

/**
 * The packed slope spectrum C(k) at time `seconds`, from `initialSpectrum`
 * texels: each mode evolved by `evolvedAmplitude`, times (i·kx − kz).
 */
export function evolvedSlopeSpectrum(
  initial: Float32Array,
  cascade: WaveCascade,
  seconds: number,
  loopSeconds: number
): { re: Float64Array; im: Float64Array } {
  const { size, tileMetres } = cascade;
  const re = new Float64Array(size * size);
  const im = new Float64Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(z, size, tileMetres);
      const t = (z * size + x) * 4;
      const [hr, hi] = evolvedAmplitude(initial.subarray(t, t + 4), Math.hypot(kx, kz), seconds, loopSeconds);
      // C = h̃ · (i·kx − kz)
      const i = z * size + x;
      re[i] = -kx * hi - kz * hr;
      im[i] = kx * hr - kz * hi;
    }
  }
  return { re, im };
}

/** The world wind direction as a unit vector in the tile's own (turned) axes. */
export function windInTile(cascade: Pick<WaveCascade, "windAngle" | "rotation">): [number, number] {
  const angle = cascade.windAngle - cascade.rotation;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * The packed stretch spectrum B(k) at time `seconds` (see the header): the
 * choppy displacement's derivative along the wind (real part after the
 * inverse FFT) and across it (imaginary part), for choppiness λ.
 */
export function evolvedStretchSpectrum(
  initial: Float32Array,
  cascade: WaveCascade,
  seconds: number,
  loopSeconds: number,
  choppiness: number
): { re: Float64Array; im: Float64Array } {
  const { size, tileMetres } = cascade;
  const [ux, uz] = windInTile(cascade);
  const re = new Float64Array(size * size);
  const im = new Float64Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(z, size, tileMetres);
      const k = Math.hypot(kx, kz);
      if (k === 0) continue;
      const t = (z * size + x) * 4;
      const [hr, hi] = evolvedAmplitude(initial.subarray(t, t + 4), k, seconds, loopSeconds);
      const along = kx * ux + kz * uz;
      const across = -kx * uz + kz * ux;
      const a = (-choppiness * along * along) / k;
      const b = (-choppiness * across * across) / k;
      // B = h̃ · (a + i b)
      const i = z * size + x;
      re[i] = hr * a - hi * b;
      im[i] = hr * b + hi * a;
    }
  }
  return { re, im };
}

interface ComplexSpectrum {
  re: Float64Array;
  im: Float64Array;
}

/**
 * The packed displacement spectra at time `seconds` (see the header), for
 * choppiness λ: `heightAndX` is P(k), whose inverse FFT is the height (real)
 * and the x displacement (imaginary); `z` is Q(k), whose inverse FFT is the
 * z displacement (real). Both in the tile's own axes.
 */
export function evolvedDisplacementSpectrum(
  initial: Float32Array,
  cascade: WaveCascade,
  seconds: number,
  loopSeconds: number,
  choppiness: number
): { heightAndX: ComplexSpectrum; z: ComplexSpectrum } {
  const { size, tileMetres } = cascade;
  const heightAndX = { re: new Float64Array(size * size), im: new Float64Array(size * size) };
  const z = { re: new Float64Array(size * size), im: new Float64Array(size * size) };
  for (let zi = 0; zi < size; zi++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(zi, size, tileMetres);
      const k = Math.hypot(kx, kz);
      if (k === 0) continue;
      const t = (zi * size + x) * 4;
      const [hr, hi] = evolvedAmplitude(initial.subarray(t, t + 4), k, seconds, loopSeconds);
      const i = zi * size + x;
      // P = h̃ · (1 − λ kx/|k|), a real coefficient.
      const p = 1 - (choppiness * kx) / k;
      heightAndX.re[i] = hr * p;
      heightAndX.im[i] = hi * p;
      // Q = h̃ · i λ kz/|k|.
      const q = (choppiness * kz) / k;
      z.re[i] = -hi * q;
      z.im[i] = hr * q;
    }
  }
  return { heightAndX, z };
}

/**
 * Expected height variance E[h²] the cascade resolves: Σ E|h̃(k)|² =
 * Σ 2 E|h0(k)|² over the grid. Its significant height is 4 √variance.
 */
export function resolvedHeightVariance(cascade: WaveCascade): number {
  const { size, tileMetres } = cascade;
  let total = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      total += 2 * modeVariance(cascadeWavenumber(x, size, tileMetres), cascadeWavenumber(z, size, tileMetres), cascade);
    }
  }
  return total;
}

/**
 * Expected mean square slope E[(∂h/∂x)² + (∂h/∂z)²] the cascade resolves:
 * Σ |k|² E|h̃(k)|² = Σ 2 |k|² E|h0(k)|² over the grid.
 */
export function resolvedSlopeVariance(cascade: WaveCascade): number {
  const { size, tileMetres } = cascade;
  let total = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const kx = cascadeWavenumber(x, size, tileMetres);
      const kz = cascadeWavenumber(z, size, tileMetres);
      total += 2 * (kx * kx + kz * kz) * modeVariance(kx, kz, cascade);
    }
  }
  return total;
}
