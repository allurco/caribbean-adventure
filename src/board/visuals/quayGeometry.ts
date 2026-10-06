/**
 * The stone quay at a pier's root (issue #59, port kit slice 3). Pure, no
 * Three.js.
 *
 * Same local space as the pier (`pierGeometry.ts`): Y up, the pier's land
 * end at the origin, the pier running out along +Z. The quay is a flat
 * platform two and a half piers wide whose sea wall stands a little seaward
 * of the origin, so the pier's root is embedded in it; landward it runs
 * back under the beach and steps down a coping's thickness at
 * `QUAY_STEP_Z`, so where the sand lies low the back reads as a stair into
 * the beach and where it lies high it is simply buried. The body reaches
 * as deep as the pier posts, so however the quay is lifted to clear the
 * sand at its sea face (`quayPlacement.ts`) nothing ever floats.
 *
 * "Notch up" register: the sea wall is battered (leans back as it rises)
 * above the waterline, the coping slab overhangs the wall with chamfered
 * edges, two bollards stand at the sea edge, occlusion is baked along the
 * waterline and under the coping's overhang, and the stone carries a small
 * colour jitter. Parts meet on shared planes with the hidden face dropped:
 * the body is open on top where the coping sits, the coping is open
 * underneath (its exposed overhang is drawn as three strips), the bollards
 * are open at their feet. No face overlaps another in its plane and none
 * passes through another; the tests check both.
 */
import { createFacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { PIER_DECK_TOP, PIER_POST_BOTTOM } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";

export interface QuayColors {
  /** The sea wall and the rear step. */
  stone: Rgb;
  /** The coping slab and deck; lighter than the stone. */
  coping: Rgb;
  /** The mooring bollards (timber). */
  bollard: Rgb;
}

/** Across the pier, world units at scale 1 (2.5 piers; `quayPlacement.ts` scales it per port). */
export const QUAY_WIDTH = 0.4;
/** The sea wall's face at the coping, seaward of the pier's land end, which it swallows. */
export const QUAY_SEA_FACE = 0.04;
/** The buried landward end. */
export const QUAY_BACK = -0.28;
/** Landward of here the top steps down a coping's thickness. */
export const QUAY_STEP_Z = -0.2;
/** The body's underside, as deep as the pier posts. */
export const QUAY_BASE = PIER_POST_BOTTOM;
/** The deck, a lip above the pier deck's landward end. */
export const QUAY_TOP = PIER_DECK_TOP + 0.015;
export const QUAY_COPING_THICKNESS = 0.03;
/** The rear step's top: the body's own top, under the coping. */
export const QUAY_STEP_TOP = QUAY_TOP - QUAY_COPING_THICKNESS;
/** How far the coping overhangs the wall below it; the battered wall's foot is flush with its edge. */
export const QUAY_COPING_PROUD = 0.015;
export const QUAY_BOLLARD = { halfWidth: 0.012, height: 0.03, inset: 0.05, z: QUAY_SEA_FACE - 0.03 };
export const QUAY_TRIANGLE_BUDGET = 160;
/** What the build below comes to: body 28, overhang undersides 6, coping 30, two bollards 60. */
export const QUAY_TRIANGLES = 124;

const COPING_BEVEL = 0.01;
const BOLLARD_BEVEL = 0.004;
/** Ground-contact and under-coping shading meet at one ring of the wall, QUAY_AO_REACH up from the waterline. */
const AO_REACH = 0.025;
const AO_GROUND_HEIGHT = QUAY_STEP_TOP - SEA_LEVEL - AO_REACH;
const AO_GROUND_STRENGTH = 0.35;
const AO_COPING_STRENGTH = 0.4;
const COLOR_JITTER = 0.05;
const JITTER_SEED = 0x51a7;

/** The battered wall's front at height `y`: flush with the coping at the top, out to the coping's edge at the waterline. */
const wallFront = (y: number) => {
  const t = Math.max(0, Math.min(1, (QUAY_STEP_TOP - y) / (QUAY_STEP_TOP - SEA_LEVEL)));
  return QUAY_SEA_FACE + QUAY_COPING_PROUD * t;
};

/** Builds the quay at scale 1. Colours are linear RGB in [0, 1]. */
export function buildQuayGeometry(colors: QuayColors): FacetGeometryData {
  const b = createFacetBuilder();
  const hw = QUAY_WIDTH / 2;
  const proud = hw + QUAY_COPING_PROUD;

  // The body in three bands, so the vertex colours can hold a ring between
  // the waterline shading and the band under the coping: open on top, where
  // the coping sits, except for the rear step.
  const bodyFrom = b.vertexCount();
  const ring = (y: number): Vec3[] => [
    [-hw, y, QUAY_BACK],
    [-hw, y, wallFront(y)],
    [hw, y, wallFront(y)],
    [hw, y, QUAY_BACK],
  ];
  const bands = [QUAY_BASE, SEA_LEVEL, SEA_LEVEL + AO_GROUND_HEIGHT, QUAY_STEP_TOP];
  for (let i = 0; i < bands.length - 1; i++) {
    b.prism(ring(bands[i]), ring(bands[i + 1]), colors.stone, { top: false, bottom: i === 0 });
  }
  b.quad([-hw, QUAY_STEP_TOP, QUAY_BACK], [-hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_BACK], colors.stone);

  // The coping's exposed underside: a strip along the sea face and one down each side, facing down.
  const underside = (x0: number, x1: number, z0: number, z1: number) =>
    b.quad([x0, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z1], [x0, QUAY_STEP_TOP, z1], colors.stone);
  underside(-proud, proud, QUAY_SEA_FACE, QUAY_SEA_FACE + QUAY_COPING_PROUD);
  underside(-proud, -hw, QUAY_STEP_Z, QUAY_SEA_FACE);
  underside(hw, proud, QUAY_STEP_Z, QUAY_SEA_FACE);
  b.bakeAmbientOcclusion({
    groundHeight: AO_GROUND_HEIGHT,
    groundStrength: AO_GROUND_STRENGTH,
    overhangs: [{ y: QUAY_STEP_TOP, reach: AO_REACH, strength: AO_COPING_STRENGTH }],
    from: bodyFrom,
    to: b.vertexCount(),
  });

  // The coping slab, open underneath, chamfered on its top and vertical edges.
  b.bevelledBox([-proud, QUAY_STEP_TOP, QUAY_STEP_Z], [proud, QUAY_TOP, QUAY_SEA_FACE + QUAY_COPING_PROUD], COPING_BEVEL, colors.coping, {
    bottom: false,
  });

  // Two bollards near the sea edge, standing on the deck with open feet.
  const { halfWidth, height, inset, z } = QUAY_BOLLARD;
  for (const sign of [-1, 1]) {
    const x = sign * (hw - inset);
    b.bevelledBox([x - halfWidth, QUAY_TOP, z - halfWidth], [x + halfWidth, QUAY_TOP + height, z + halfWidth], BOLLARD_BEVEL, colors.bollard, {
      bottom: false,
    });
  }

  b.jitterColors(COLOR_JITTER, JITTER_SEED);
  return b.build();
}
