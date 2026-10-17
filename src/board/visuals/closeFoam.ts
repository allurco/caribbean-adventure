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
import { FOAM_LACE_SOFTNESS, foamDetailFade, foamLace } from "./foamShading";

/** Camera distance to its focus (world units) at and under which the close-up look is full ... */
export const CLOSE_FOAM_NEAR = 1.8;
/** ... and at and over which it is gone: under the opening ship view's 3.4, so that view is unchanged. */
export const CLOSE_FOAM_FAR = 2.8;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much of the close-up look applies with the camera `cameraDistance` from its focus: 1 in close, 0 from the ship view out. */
export function closeFoamWeight(cameraDistance: number): number {
  return 1 - smoothstep(CLOSE_FOAM_NEAR, CLOSE_FOAM_FAR, cameraDistance);
}

/**
 * The share of the sea one octave of the bubble field (`foamBubbleCell`)
 * lies above a cell value t, about BUBBLE_CONE_FILL · (1 − t)²: each cell is
 * a cone, so the disc it keeps above t has a radius in (1 − t). Measured
 * over the field (closeFoam.test.ts); the two octaves are close to
 * independent, so their union keeps 1 − (1 − a)² of an octave's a.
 */
export const BUBBLE_CONE_FILL = 0.94;
/** STYLISTIC: a bubble's soft edge, as a share of its radius (half inside, half outside its rim). */
export const BUBBLE_SOFTNESS = 0.5;
/** STYLISTIC: foam denser than this also fills the water between the bubbles, so solid foam stays solid. */
export const BUBBLE_GAP_FROM = 0.85;
/** STYLISTIC: how much the coarse cluster noise moves the foam's level from place to place, so bubbles gather in streaks and clumps. */
export const BUBBLE_CLUSTER = 0.8;
/** STYLISTIC: the cluster noise's feature size, water metres. */
export const BUBBLE_CLUSTER_METRES = 2.4;

/**
 * The cell value over which the bubble field covers `foam` of the sea: each
 * octave covers a = 1 − √(1 − foam), so the two together cover foam, and an
 * octave covers a above 1 − √(a / BUBBLE_CONE_FILL).
 */
export function bubbleThreshold(foam: number): number {
  const perOctave = 1 - Math.sqrt(1 - Math.max(0, Math.min(1, foam)));
  return 1 - Math.sqrt(perOctave / BUBBLE_CONE_FILL);
}

/**
 * Foam `foam` (0 … 1) broken into bubbles: `cell` is the bubble field there
 * (`foamBubbleCell`), `weight` the close-up weight and `cluster` the coarse
 * cluster noise (−1 … 1, mean 0). The bubbles are white and keep the foam's
 * amount: they cover as much of the sea as the foam's level (shifted from
 * place to place by the cluster, which keeps its mean), so thin foam is a few
 * white bubbles and dense foam packed ones, and past BUBBLE_GAP_FROM the
 * water between them fills too. The foam itself at weight 0.
 */
export function closeUpFoam(foam: number, cell: number, weight: number, cluster = 0): number {
  if (weight <= 0 || foam <= 0) return foam;
  const f = Math.min(1, foam);
  const level = f * (1 + BUBBLE_CLUSTER * cluster * (1 - f));
  const threshold = bubbleThreshold(level);
  const edge = 0.5 * BUBBLE_SOFTNESS * (1 - threshold);
  const bubbles = smoothstep(threshold - edge, threshold + edge, cell);
  const bubbled = bubbles + (1 - bubbles) * smoothstep(BUBBLE_GAP_FROM, 1, level);
  return foam + (bubbled - foam) * Math.min(1, weight);
}

/** STYLISTIC: the share of the hull's contact patch kept up close: a thin residue of stirred water round the hull, under the flecks. */
export const CLOSE_PATCH_RESIDUE = 0.25;
/** STYLISTIC: the bubbles' cell size in water metres (big ones; the small ones are BUBBLE_SMALL_RATIO of it). */
export const BUBBLE_METRES = 0.9;
export const BUBBLE_SMALL_RATIO = 0.42;
/** STYLISTIC: how much faster the small bubbles' field circles with the churn than the big ones'. */
export const BUBBLE_SMALL_CHURN = 1.3;
/** STYLISTIC: a bubble's middle lies this far in from its cell's edges (cell units), so neighbours do not merge ... */
export const BUBBLE_INSET = 0.15;
/** ... and a bubble's radius (cell units) is drawn between these. */
export const BUBBLE_RADIUS: readonly [number, number] = [0.38, 0.7];
/** Salts that give a cell's x and y jitter and its radius their own hashes. */
export const BUBBLE_SALTS: readonly [number, number] = [17.31, 41.7];

const fract = (x: number) => x - Math.floor(x);
/** GLSL's mod, which floors (unlike %). */
const glslMod = (x: number, y: number) => x - y * Math.floor(x / y);
/** FOAM_MOTION_GLSL's `foamHash`, in TypeScript (double precision: the same field in its statistics, not bit for bit). */
function foamHash(x: number, y: number): number {
  return fract(Math.sin(glslMod(x, 289) * 127.1 + glslMod(y, 289) * 311.7) * 43758.5453123);
}

/** One octave of round cells at (px, py) (cell units): 1 at the nearest bubble's middle, 0 at its rim. */
function bubbleOctave(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const span = 1 - 2 * BUBBLE_INSET;
  let best = 0;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const idx = ix + x;
      const idy = iy + y;
      const jx = foamHash(idx, idy);
      const jy = foamHash(idx + BUBBLE_SALTS[0], idy + BUBBLE_SALTS[0]);
      const radius = BUBBLE_RADIUS[0] + (BUBBLE_RADIUS[1] - BUBBLE_RADIUS[0]) * foamHash(idx + BUBBLE_SALTS[1], idy + BUBBLE_SALTS[1]);
      const d = Math.hypot(x + BUBBLE_INSET + span * jx - (px - ix), y + BUBBLE_INSET + span * jy - (py - iy));
      best = Math.max(best, 1 - d / radius);
    }
  }
  return Math.max(0, Math.min(1, best));
}

/**
 * The bubble field at world (x, z) (CLOSE_FOAM_GLSL's `foamBubbleCell`):
 * two octaves of round cells, the small ones circling the other way with
 * the churn; 1 at a bubble's middle, 0 at and past its rim.
 */
export function foamBubbleCell(x: number, z: number, churnX: number, churnZ: number, metresPerUnit: number): number {
  const px = (x * metresPerUnit) / BUBBLE_METRES;
  const pz = (z * metresPerUnit) / BUBBLE_METRES;
  return Math.max(
    bubbleOctave(px + churnX, pz + churnZ),
    bubbleOctave(px / BUBBLE_SMALL_RATIO - churnZ * BUBBLE_SMALL_CHURN, pz / BUBBLE_SMALL_RATIO - churnX * BUBBLE_SMALL_CHURN)
  );
}

/**
 * The bubbles' weight where a pixel spans `footprintMetres`: the close-up
 * weight `closeUp`, faded out (foamDetailFade) where the small bubbles would
 * be a pixel or two across, so the far part of a close frame draws the smooth
 * foam rather than sparkling. 0 wherever `closeUp` is.
 */
export function closeBubbleWeight(closeUp: number, footprintMetres: number): number {
  if (closeUp <= 0) return 0;
  return closeUp * foamDetailFade(footprintMetres, BUBBLE_METRES * BUBBLE_SMALL_RATIO);
}

/**
 * The shares of the hull's contact patch and contact line drawn at close-up
 * weight `weight`: the patch fades to a residue up close; the line stays
 * whole, and is laid over the bubbles (`withContactLine`) so the hull keeps a
 * white waterline.
 */
export function closeShipFoamShares(weight: number): { patch: number; contact: number } {
  const w = Math.max(0, Math.min(1, weight));
  return { patch: 1 + (CLOSE_PATCH_RESIDUE - 1) * w, contact: 1 };
}

/**
 * The bubbled foam `foam` with the hull's contact line `contact` (laced, not
 * bubbled) laid over it at close-up weight `weight`, as foams combine
 * (foamShading.ts `combineFoam`). The foam itself at weight 0.
 */
export function withContactLine(foam: number, contact: number, weight: number): number {
  if (weight <= 0 || contact <= 0) return foam;
  return 1 - (1 - foam) * (1 - contact * Math.min(1, weight));
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
 * of the two; `foamBubbleCluster`, the coarse noise that gathers them; and
 * `closeBubbleWeight`. Needs `foamHash` and `foamNoise` (FOAM_MOTION_GLSL)
 * and `foamLace` and `foamDetailFade` (FOAM_SHADING_GLSL) in scope; METRES_PER_UNIT is passed in as `metresPerUnit`.
 */
export const CLOSE_FOAM_GLSL = `
  const float CLOSE_FOAM_NEAR = ${CLOSE_FOAM_NEAR.toFixed(4)};
  const float CLOSE_FOAM_FAR = ${CLOSE_FOAM_FAR.toFixed(4)};
  const float BUBBLE_CONE_FILL = ${BUBBLE_CONE_FILL.toFixed(4)};
  const float BUBBLE_GAP_FROM = ${BUBBLE_GAP_FROM.toFixed(4)};
  const float BUBBLE_CLUSTER = ${BUBBLE_CLUSTER.toFixed(4)};
  const float BUBBLE_CLUSTER_METRES = ${BUBBLE_CLUSTER_METRES.toFixed(4)};
  const float BUBBLE_SOFTNESS = ${BUBBLE_SOFTNESS.toFixed(4)};
  const float CLOSE_PATCH_RESIDUE = ${CLOSE_PATCH_RESIDUE.toFixed(4)};
  const float BUBBLE_METRES = ${BUBBLE_METRES.toFixed(4)};
  const float BUBBLE_SMALL_RATIO = ${BUBBLE_SMALL_RATIO.toFixed(4)};
  const float CLOSE_LACE_SOFTENING = ${CLOSE_LACE_SOFTENING.toFixed(4)};
  const float BUBBLE_SMALL_CHURN = ${BUBBLE_SMALL_CHURN.toFixed(4)};
  const float BUBBLE_INSET = ${BUBBLE_INSET.toFixed(4)};
  const float BUBBLE_SPAN = ${(1 - 2 * BUBBLE_INSET).toFixed(4)}; // the room the middle moves in, 1 − 2 · inset
  const float BUBBLE_RADIUS_MIN = ${BUBBLE_RADIUS[0].toFixed(4)};
  const float BUBBLE_RADIUS_MAX = ${BUBBLE_RADIUS[1].toFixed(4)};
  const float BUBBLE_SALT_Y = ${BUBBLE_SALTS[0].toFixed(4)};
  const float BUBBLE_SALT_RADIUS = ${BUBBLE_SALTS[1].toFixed(4)};
  vec2 closeShipFoamShares(float weight) {
    float w = clamp(weight, 0.0, 1.0);
    return vec2(mix(1.0, CLOSE_PATCH_RESIDUE, w), 1.0);
  }
  float withContactLine(float foam, float contact, float weight) {
    if (weight <= 0.0 || contact <= 0.0) return foam;
    return 1.0 - (1.0 - foam) * (1.0 - contact * min(weight, 1.0));
  }
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
        vec2 jitter = vec2(foamHash(id), foamHash(id + BUBBLE_SALT_Y));
        float radius = mix(BUBBLE_RADIUS_MIN, BUBBLE_RADIUS_MAX, foamHash(id + BUBBLE_SALT_RADIUS));
        float d = length(c + BUBBLE_INSET + BUBBLE_SPAN * jitter - f);
        best = max(best, 1.0 - d / radius);
      }
    }
    return clamp(best, 0.0, 1.0);
  }
  float foamBubbleCell(vec2 worldXZ, vec2 churn, float metresPerUnit) {
    vec2 p = worldXZ * metresPerUnit / BUBBLE_METRES;
    return max(bubbleOctave(p + churn), bubbleOctave(p / BUBBLE_SMALL_RATIO - churn.yx * BUBBLE_SMALL_CHURN));
  }
  float closeBubbleWeight(float closeUp, float footprintMetres) {
    if (closeUp <= 0.0) return 0.0;
    return closeUp * foamDetailFade(footprintMetres, BUBBLE_METRES * BUBBLE_SMALL_RATIO);
  }
  // The coarse noise (−1 … 1, mean 0) that gathers the bubbles into streaks and clumps.
  float foamBubbleCluster(vec2 worldXZ, vec2 churn, float metresPerUnit) {
    return foamNoise(worldXZ * metresPerUnit / BUBBLE_CLUSTER_METRES + churn);
  }
  float bubbleThreshold(float foam) {
    float perOctave = 1.0 - sqrt(1.0 - clamp(foam, 0.0, 1.0));
    return 1.0 - sqrt(perOctave / BUBBLE_CONE_FILL);
  }
  float closeUpFoam(float foam, float cell, float weight, float cluster) {
    if (weight <= 0.0 || foam <= 0.0) return foam;
    float f = min(foam, 1.0);
    float level = f * (1.0 + BUBBLE_CLUSTER * cluster * (1.0 - f));
    float threshold = bubbleThreshold(level);
    float edge = 0.5 * BUBBLE_SOFTNESS * (1.0 - threshold);
    float bubbles = smoothstep(threshold - edge, threshold + edge, cell);
    float bubbled = bubbles + (1.0 - bubbles) * smoothstep(BUBBLE_GAP_FROM, 1.0, level);
    return mix(foam, bubbled, min(weight, 1.0));
  }
`;
