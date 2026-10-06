/**
 * Whitecaps from the wave surface's Jacobian (#38 step 7). Pure maths,
 * mirrored in GLSL by `WHITECAP_FOAM_GLSL`; the cascade output pass writes
 * the Jacobian and the accumulation pass integrates it (useWaveCascades.ts).
 *
 * A choppy sea moves its surface horizontally toward the crests (Tessendorf
 * 2001, §4.3; waveCascade.ts). Where that displacement compresses the
 * surface, the crest sharpens and, past a point, folds over: that is where
 * the real sea breaks. The compression is the Jacobian of the surface map
 * x ↦ x + D(x),
 *   J = (1 + ∂Du/∂u)(1 + ∂Dv/∂v) − (∂Du/∂v)²,
 * 1 where the surface is undisplaced, 0 at a fold. The GPU carries the two
 * stretches along (u) and across (v) the wind and drops the shear: the test
 * bounds what that costs for the trade-wind sea.
 *
 * Whitecaps persist after the crest that made them: each frame a tile-space
 * accumulation adds the fold (how far J is under the threshold) and decays
 * what it holds with a time constant of a few seconds. The step is the exact
 * solution of f' = −f/τ + g·fold over the frame, so it does not depend on the
 * frame rate, and a zero step (reduced motion) changes nothing.
 */

/**
 * STYLISTIC, physically motivated: the Jacobian below which a crest is taken
 * to break. A real crest folds at J = 0; the FFT sea's choppy map never quite
 * reaches it on a moderate sea, so foam starts earlier. With the trade-wind
 * sea's choppiness (oceanWaves.ts) the chop cascade's J bottoms out near
 * 0.6 and a percent of its tile is under 0.76 at any moment, so this keeps
 * the foaming area at a percent or two (see the test): Beaufort 4, "fairly
 * frequent white horses". The swell's J rarely drops under 0.8, so it
 * whitecaps only in traces.
 */
export const WHITECAP_FOLD_THRESHOLD = 0.77;

/** Time constant of the whitecaps' decay, seconds: a cap lasts a few seconds. */
export const WHITECAP_DECAY_SECONDS = 5;

/**
 * Foam added per second per unit of fold. A crest folding by 0.1 under the
 * threshold for a second leaves foam of 0.4, which the decay takes out over
 * the next few seconds.
 */
export const WHITECAP_GAIN = 4;

/** The surface's area scale under the choppy displacement; 1 undisplaced, 0 at a fold. */
export function surfaceJacobian(stretchAlong: number, stretchAcross: number, shear = 0): number {
  return (1 + stretchAlong) * (1 + stretchAcross) - shear * shear;
}

/** How far under the threshold the surface is folded: 0 where it is not. */
export function whitecapFold(jacobian: number): number {
  return Math.max(0, WHITECAP_FOLD_THRESHOLD - jacobian);
}

/** Share of the foam kept over a step of `dtSeconds`. */
export function whitecapDecay(dtSeconds: number): number {
  return Math.exp(-dtSeconds / WHITECAP_DECAY_SECONDS);
}

/** Foam added per unit of fold over a step of `dtSeconds`: the integral of the gain under the decay. */
export function whitecapInjection(dtSeconds: number): number {
  return WHITECAP_GAIN * WHITECAP_DECAY_SECONDS * (1 - whitecapDecay(dtSeconds));
}

/** The foam after a step of `dtSeconds` at Jacobian `jacobian`, from `previous`; at most 1. */
export function accumulateWhitecap(previous: number, jacobian: number, dtSeconds: number): number {
  return Math.min(1, previous * whitecapDecay(dtSeconds) + whitecapFold(jacobian) * whitecapInjection(dtSeconds));
}

/**
 * STYLISTIC: the breakup noise that turns the accumulated coverage into lacy
 * foam in the water shader: cycles per world unit (65 m), and the lace's
 * feature size in metres for the detail fade. Whitecaps are a few metres
 * across with sub-metre lace.
 */
export const WHITECAP_NOISE_SCALE = 18;
export const WHITECAP_LACE_METRES = 1;

/** GLSL for the above. The decay and injection are computed on the CPU per frame and passed in. */
export const WHITECAP_FOAM_GLSL = `
  const float WHITECAP_FOLD_THRESHOLD = ${WHITECAP_FOLD_THRESHOLD.toFixed(4)};
  const float WHITECAP_NOISE_SCALE = ${WHITECAP_NOISE_SCALE.toFixed(4)};
  const float WHITECAP_LACE_METRES = ${WHITECAP_LACE_METRES.toFixed(4)};
  // J of the surface map from the stretch along and across the wind (the shear is dropped).
  float surfaceJacobian(vec2 stretch) {
    return (1.0 + stretch.x) * (1.0 + stretch.y);
  }
  float whitecapFold(float jacobian) {
    return max(0.0, WHITECAP_FOLD_THRESHOLD - jacobian);
  }
  float accumulateWhitecap(float previous, float jacobian, float decay, float injection) {
    return min(1.0, previous * decay + whitecapFold(jacobian) * injection);
  }
`;
