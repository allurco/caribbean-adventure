/**
 * Foam seen close up (#389). Pure maths, mirrored in GLSL by
 * `CLOSE_FOAM_GLSL`; the water shader (Ocean.tsx) and the land's wash
 * (shoreFoamLand.ts) apply it, and the ships' foam flecks (foamFlecks.ts)
 * fade in by the same weight.
 *
 * The foam's lace (foamShading.ts) is a smooth value noise thresholded by the
 * coverage. From the opening ship view out its features are a few pixels and
 * it reads as foam; with the camera in close each feature spans tens of
 * pixels, its soft edges blur, and dense foam (the shore bands, the hull's
 * contact line and patch) reads as a flat white patch. So, only up close, by
 * camera distance (`closeFoamWeight`):
 *
 * - every foam is broken again by a fine field of bubbles (`foamBubbles`):
 *   round cells of two sizes, kept where the cell value clears a threshold
 *   the coverage lowers, so thin foam is a scatter of bubbles and dense foam
 *   clustered bubbles with dark water between, never a slab;
 * - the hull's contact patch fades out and its contact line thins to a
 *   share of its strength (`closeShipFoamShares`); the ships' foam flecks,
 *   particles riding the sea (foamFlecks.ts), take over the stirred water.
 *
 * At the weight 0 (the opening ship view, mid and map zoom) all of it is the
 * identity: the foam there is drawn exactly as before.
 */

/** Camera distance to its focus (world units) at and under which the close-up look is full ... */
export const CLOSE_FOAM_NEAR = 1.8;
/** ... and at and over which it is gone: under the opening ship view's 3.4, so that view is unchanged. */
export const CLOSE_FOAM_FAR = 2.8;

import { FOAM_LACE_SOFTNESS, foamLace } from "./foamShading";

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much of the close-up look applies with the camera `cameraDistance` from its focus: 1 in close, 0 from the ship view out. */
export function closeFoamWeight(cameraDistance: number): number {
  return 1 - smoothstep(CLOSE_FOAM_NEAR, CLOSE_FOAM_FAR, cameraDistance);
}

/** STYLISTIC: the share of the cells a solid foam fills up close; the rest is water between bubbles. */
export const BUBBLE_FILL = 0.75;
/** STYLISTIC: the cell-value range over which a bubble's edge fades in. */
export const BUBBLE_SOFTNESS = 0.12;

/**
 * Foam `foam` (0 … 1) broken into bubbles: `cell` is the bubble field there
 * (1 at a bubble's middle, 0 between cells), `weight` the close-up weight.
 * A bubble is kept where the cell clears a threshold the coverage lowers;
 * never brighter than the foam, and the foam itself at weight 0.
 */
export function closeUpFoam(foam: number, cell: number, weight: number): number {
  if (weight <= 0 || foam <= 0) return foam;
  const threshold = 1 - Math.min(1, foam) * BUBBLE_FILL;
  const bubbled = foam * smoothstep(threshold, threshold + BUBBLE_SOFTNESS, cell);
  return foam + (bubbled - foam) * Math.min(1, weight);
}

/** STYLISTIC: the share of the contact line's strength kept up close: a thin cue that the hull sits in the water. */
export const CLOSE_CONTACT_SHARE = 0.5;
/** STYLISTIC: the bubbles' cell size in water metres (big ones; the small ones are BUBBLE_SMALL_RATIO of it). */
export const BUBBLE_METRES = 0.9;
export const BUBBLE_SMALL_RATIO = 0.42;

/** The shares of the hull's contact patch and contact line drawn at close-up weight `weight`. */
export function closeShipFoamShares(weight: number): { patch: number; contact: number } {
  const w = Math.max(0, Math.min(1, weight));
  return { patch: 1 - w, contact: 1 + (CLOSE_CONTACT_SHARE - 1) * w };
}

/**
 * STYLISTIC: how much wider the lace's edge is up close (noise range, split
 * either side of its threshold): the lace's coverage then ramps across its
 * edge, and the bubbles thin out along that ramp instead of stopping at a
 * hard rim.
 */
export const CLOSE_LACE_SOFTENING = 0.5;

/** The foam's lace (foamShading.ts `foamLace`) at close-up weight `weight`: its edge widened up close, itself at weight 0. */
export function closeLace(coverage: number, noise: number, weight: number): number {
  if (weight <= 0 || coverage <= 0) return foamLace(coverage, noise);
  const widen = CLOSE_LACE_SOFTENING * Math.min(1, weight);
  const threshold = 1 - Math.min(1, coverage);
  return smoothstep(threshold - widen / 2, threshold + FOAM_LACE_SOFTNESS + widen / 2, noise);
}

/**
 * GLSL for the above, plus the bubble field: `foamBubbleCell(worldXZ,
 * churn)`, two octaves of round cells (a jittered point per cell, a radius
 * of its own), 1 at a bubble's middle and 0 at and past its rim, the larger
 * of the two. Needs `foamHash` (FOAM_MOTION_GLSL) and `foamLace`
 * (FOAM_SHADING_GLSL) in scope; METRES_PER_UNIT is passed in as `metresPerUnit`.
 */
export const CLOSE_FOAM_GLSL = `
  const float CLOSE_FOAM_NEAR = ${CLOSE_FOAM_NEAR.toFixed(4)};
  const float CLOSE_FOAM_FAR = ${CLOSE_FOAM_FAR.toFixed(4)};
  const float BUBBLE_FILL = ${BUBBLE_FILL.toFixed(4)};
  const float BUBBLE_SOFTNESS = ${BUBBLE_SOFTNESS.toFixed(4)};
  const float CLOSE_CONTACT_SHARE = ${CLOSE_CONTACT_SHARE.toFixed(4)};
  const float BUBBLE_METRES = ${BUBBLE_METRES.toFixed(4)};
  const float BUBBLE_SMALL_RATIO = ${BUBBLE_SMALL_RATIO.toFixed(4)};
  const float CLOSE_LACE_SOFTENING = ${CLOSE_LACE_SOFTENING.toFixed(4)};
  float closeLace(float coverage, float noise, float weight) {
    if (weight <= 0.0 || coverage <= 0.0) return foamLace(coverage, noise);
    float widen = CLOSE_LACE_SOFTENING * min(weight, 1.0);
    float threshold = 1.0 - min(coverage, 1.0);
    return smoothstep(threshold - 0.5 * widen, threshold + FOAM_LACE_SOFTNESS + 0.5 * widen, noise);
  }
  float closeFoamWeight(float cameraDistance) {
    return 1.0 - smoothstep(CLOSE_FOAM_NEAR, CLOSE_FOAM_FAR, cameraDistance);
  }
  // One octave of round cells at p (cell units): 1 at the nearest bubble's middle, 0 at its rim.
  float bubbleOctave(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float best = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 c = vec2(float(x), float(y));
        vec2 id = i + c;
        vec2 jitter = vec2(foamHash(id), foamHash(id + 17.31));
        float radius = 0.38 + 0.32 * foamHash(id + 41.7);
        float d = length(c + 0.15 + 0.7 * jitter - f);
        best = max(best, 1.0 - d / radius);
      }
    }
    return clamp(best, 0.0, 1.0);
  }
  float foamBubbleCell(vec2 worldXZ, vec2 churn, float metresPerUnit) {
    vec2 p = worldXZ * metresPerUnit / BUBBLE_METRES;
    return max(bubbleOctave(p + churn), bubbleOctave(p / BUBBLE_SMALL_RATIO - churn.yx * 1.3));
  }
  float closeUpFoam(float foam, float cell, float weight) {
    if (weight <= 0.0 || foam <= 0.0) return foam;
    float threshold = 1.0 - min(foam, 1.0) * BUBBLE_FILL;
    float bubbled = foam * smoothstep(threshold, threshold + BUBBLE_SOFTNESS, cell);
    return mix(foam, bubbled, min(weight, 1.0));
  }
`;
