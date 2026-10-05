/**
 * Directional spreading of a wind sea (#38): the share of the energy at
 * frequency ω that travels at angle θ from the wind, as Mitsuyasu et al.'s
 * (1975) cos-2s model with Hasselmann et al.'s (1980) exponent fit:
 *
 *   D(θ, ω) = Q(s) · |cos(θ / 2)|^(2s),  Q(s) = Γ(s + 1) / (2√π Γ(s + ½)),
 *   s = sp (ω/ωp)⁵ below the peak, sp (ω/ωp)^−2.5 above it,
 *   sp = 11.5 (ωp U / g)^−2.5.
 *
 * Q normalises D so that it integrates to 1 over θ ∈ [−π, π]. Waves are
 * narrowest around the peak and spread wider at higher frequencies.
 */
import { jonswapPeakFrequency, type WindSea } from "./jonswap";
import { GRAVITY } from "./waveDispersion";

/** Lanczos (g = 7, n = 9) coefficients for ln Γ. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0. */
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** The cos-2s exponent s at angular frequency `omega` (rad/s). */
export function spreadingExponent(omega: number, sea: WindSea): number {
  const wp = jonswapPeakFrequency(sea);
  const sp = 11.5 * Math.pow((wp * sea.windSpeed) / GRAVITY, -2.5);
  const ratio = omega / wp;
  return omega <= wp ? sp * ratio ** 5 : sp * Math.pow(ratio, -2.5);
}

/** D(θ, ω), per radian: `theta` is the angle from the wind direction. */
export function directionalSpreading(theta: number, omega: number, sea: WindSea): number {
  const s = spreadingExponent(omega, sea);
  const q = Math.exp(logGamma(s + 1) - logGamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
  return q * Math.pow(Math.abs(Math.cos(theta / 2)), 2 * s);
}
