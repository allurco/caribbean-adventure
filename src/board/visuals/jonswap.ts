/**
 * The JONSWAP wind-sea spectrum (Hasselmann et al. 1973), in metres and
 * seconds: a Pierson–Moskowitz shape for a fetch-limited sea, sharpened
 * around its peak by the enhancement factor γ.
 *
 *   S(ω) = α g² / ω⁵ · exp(−5/4 (ωp/ω)⁴) · γ^r,
 *   r = exp(−(ω − ωp)² / (2 σ² ωp²)),  σ = 0.07 below ωp, 0.09 above,
 *   ωp = 22 (g² / (U F))^(1/3),  α = 0.076 (U² / (F g))^0.22.
 *
 * S is the one-sided height spectrum in m²·s: ∫ S dω is the variance of the
 * surface height.
 */
import { GRAVITY } from "./waveDispersion";

export interface WindSea {
  /** Wind speed 10 m above the sea, m/s. */
  windSpeed: number;
  /** Distance the wind has blown over open water, m. */
  fetch: number;
  /** JONSWAP peak enhancement γ; 3.3 is the mean measured value, 1 gives Pierson–Moskowitz. */
  peakEnhancement: number;
}

/** Peak angular frequency ωp, rad/s. */
export function jonswapPeakFrequency({ windSpeed, fetch }: WindSea): number {
  return 22 * Math.cbrt((GRAVITY * GRAVITY) / (windSpeed * fetch));
}

/** Phillips constant α of the fetch law. */
export function jonswapAlpha({ windSpeed, fetch }: WindSea): number {
  return 0.076 * Math.pow((windSpeed * windSpeed) / (fetch * GRAVITY), 0.22);
}

/**
 * Significant wave height Hs = 4 √m0, metres, with m0 = ∫ S dω the height
 * variance, integrated numerically from a tenth of the peak frequency to
 * thirty times it (the spectrum is negligible outside).
 */
export function jonswapSignificantHeight(sea: WindSea): number {
  const wp = jonswapPeakFrequency(sea);
  const lo = wp / 10;
  const hi = wp * 30;
  const steps = 20000;
  const h = (hi - lo) / steps;
  let m0 = 0;
  for (let i = 0; i < steps; i++) m0 += jonswapSpectrum(lo + (i + 0.5) * h, sea) * h;
  return 4 * Math.sqrt(m0);
}

/** Height spectral density S(ω), m²·s, at angular frequency `omega` (rad/s). */
export function jonswapSpectrum(omega: number, sea: WindSea): number {
  if (omega <= 0) return 0;
  const wp = jonswapPeakFrequency(sea);
  const sigma = omega <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((omega - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  return (
    ((jonswapAlpha(sea) * GRAVITY * GRAVITY) / omega ** 5) *
    Math.exp(-1.25 * (wp / omega) ** 4) *
    Math.pow(sea.peakEnhancement, r)
  );
}
