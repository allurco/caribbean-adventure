/**
 * Radix-2 Stockham inverse FFT, laid out for the GPU (#38).
 *
 * Each stage is one full-screen pass that gathers: output `o` reads two
 * inputs `a` and `b` of the previous stage and writes `in[a] + w · in[b]`.
 * Stockham's autosort ordering means no bit-reversal pass is needed, and
 * inputs and outputs are both in natural order. `butterflyTable` precomputes
 * (a, b, w) per stage and output (Govindaraju et al. 2008, "High performance
 * discrete Fourier transforms on graphics processors"); the GPU reads it as a
 * texture, and `inverseFft` runs the very same table on the CPU so the tests
 * can check the layout against a plain DFT.
 *
 * The transform is the unnormalised inverse, x[m] = Σ X[k] e^(+2πi k m / N),
 * with k in standard FFT order (index k ≥ N/2 stands for k − N).
 */

/** Number of radix-2 stages for size `n` (a power of two). */
export function fftStageCount(n: number): number {
  const stages = Math.log2(n);
  if (!Number.isInteger(stages) || stages < 1) {
    throw new RangeError(`FFT size must be a power of two ≥ 2, got ${n}`);
  }
  return stages;
}

/**
 * The butterfly table for size `n`: `stages` rows of `n` texels, each texel
 * (input a, input b, twiddle re, twiddle im), row-major from stage 0.
 */
export function butterflyTable(n: number): Float32Array {
  const stages = fftStageCount(n);
  const table = new Float32Array(n * stages * 4);
  for (let s = 0; s < stages; s++) {
    const ns = 1 << s; // size of the sub-transforms this stage combines
    for (let o = 0; o < n; o++) {
      const j = Math.floor(o / (2 * ns)) * ns + (o % ns);
      const r = Math.floor((o % (2 * ns)) / ns); // 0: sum, 1: difference
      const angle = (2 * Math.PI * (j % ns)) / (2 * ns);
      const sign = r === 0 ? 1 : -1;
      const i = (s * n + o) * 4;
      table[i] = j;
      table[i + 1] = j + n / 2;
      table[i + 2] = sign * Math.cos(angle);
      table[i + 3] = sign * Math.sin(angle);
    }
  }
  return table;
}

interface ComplexArray {
  re: Float64Array;
  im: Float64Array;
}

/** One butterfly stage over `n` values spaced `stride` apart from `offset`. */
function stagePass(
  src: ComplexArray,
  dst: ComplexArray,
  table: Float32Array,
  stage: number,
  n: number,
  offset: number,
  stride: number
): void {
  for (let o = 0; o < n; o++) {
    const t = (stage * n + o) * 4;
    const a = offset + table[t] * stride;
    const b = offset + table[t + 1] * stride;
    const wr = table[t + 2];
    const wi = table[t + 3];
    const out = offset + o * stride;
    dst.re[out] = src.re[a] + wr * src.re[b] - wi * src.im[b];
    dst.im[out] = src.im[a] + wr * src.im[b] + wi * src.re[b];
  }
}

/** Run every stage along lines of `n` values (rows if stride 1, columns if stride n). */
function transformLines(data: ComplexArray, n: number, lines: number, lineStep: number, stride: number) {
  const table = butterflyTable(n);
  let src = data;
  let dst: ComplexArray = { re: new Float64Array(data.re.length), im: new Float64Array(data.im.length) };
  for (let s = 0; s < fftStageCount(n); s++) {
    for (let line = 0; line < lines; line++) stagePass(src, dst, table, s, n, line * lineStep, stride);
    [src, dst] = [dst, src];
  }
  return src;
}

/** Inverse FFT of one line, through the butterfly table (CPU reference). */
export function inverseFft(re: Float64Array, im: Float64Array): ComplexArray {
  return transformLines({ re, im }, re.length, 1, 0, 1);
}

/** 2D inverse FFT of an `n` × `n` grid stored row-major (index z·n + x): rows, then columns. */
export function inverseFft2d(re: Float64Array, im: Float64Array, n: number): ComplexArray {
  const rows = transformLines({ re, im }, n, n, n, 1);
  return transformLines(rows, n, n, 1, n);
}
