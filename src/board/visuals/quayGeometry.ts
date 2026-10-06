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
 * "Notch up" register: above the waterline the wall is laid in stepped
 * courses, each a vertical band that stands a little further out than the
 * one above (a battered wall, the foot flush with the coping's edge), with
 * an up-facing ledge at every course line to catch the light; the courses
 * alternate in tone and the sea face of each is split into staggered
 * blocks with their own small jitter, so it reads as coursed stone at ship
 * zoom without a texture. The coping slab overhangs the wall with
 * chamfered edges, two bollards stand at the sea edge, occlusion is baked
 * along the waterline and under the coping's overhang, and all the stone
 * carries a small colour jitter. Parts meet on shared planes with the
 * hidden face dropped: the body is open on top where the coping sits, the
 * coping is open underneath (its exposed overhang is drawn as three
 * strips), the bollards are open at their feet. No face overlaps another
 * in its plane and none passes through another; the tests check both.
 */
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { PIER_DECK_TOP, PIER_POST_BOTTOM } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { seedOf, stream } from "./variationStream";

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
/** How far the coping overhangs the wall below it; the stepped wall's foot is flush with its edge. */
export const QUAY_COPING_PROUD = 0.015;
export const QUAY_BOLLARD = { halfWidth: 0.012, height: 0.03, inset: 0.05, z: QUAY_SEA_FACE - 0.03 };
/** Courses between the waterline and the coping; each steps out `QUAY_COPING_PROUD / count` going down. */
export const QUAY_COURSE_COUNT = 3;
export const QUAY_COURSE_HEIGHT = (QUAY_STEP_TOP - SEA_LEVEL) / QUAY_COURSE_COUNT;
/** The course lines: the height of the ledge under each course, from the waterline up. */
export const QUAY_COURSE_LEDGES: readonly number[] = Array.from({ length: QUAY_COURSE_COUNT }, (_, i) => SEA_LEVEL + i * QUAY_COURSE_HEIGHT);
export const QUAY_TRIANGLE_BUDGET = 200;
/** What the build below comes to: footing 10, courses 44 (26 front blocks, 18 sides and backs), ledges 18, rear step 2, overhang undersides 6, coping 30, two bollards 60. */
export const QUAY_TRIANGLES = 170;

const COPING_BEVEL = 0.01;
const BOLLARD_BEVEL = 0.004;
const COURSE_STEP = QUAY_COPING_PROUD / QUAY_COURSE_COUNT;
/** Blocks across the sea face of each course, from the top course down: the odd courses stagger the joints. */
const COURSE_BLOCKS = [4, 5, 4];
/** Alternate courses are this much darker. */
const COURSE_SHADE = 0.9;
const BLOCK_JITTER = 0.04;
const BLOCK_SEED = 0x2c91;
/** Ground-contact and under-coping shading meet at one ring of the wall, QUAY_AO_REACH up from the waterline. */
const AO_REACH = 0.025;
const AO_GROUND_HEIGHT = QUAY_STEP_TOP - SEA_LEVEL - AO_REACH;
const AO_GROUND_STRENGTH = 0.35;
const AO_COPING_STRENGTH = 0.4;
const COLOR_JITTER = 0.05;
const JITTER_SEED = 0x51a7;

/** The plan outline of course `i` (0 the top course); `QUAY_COURSE_COUNT` is the footing below the waterline. */
const outlineOf = (i: number) => ({ hw: QUAY_WIDTH / 2 + i * COURSE_STEP, front: QUAY_SEA_FACE + i * COURSE_STEP });

/** Builds the quay at scale 1. Colours are linear RGB in [0, 1]. */
export function buildQuayGeometry(colors: QuayColors): FacetGeometryData {
  const b = createFacetBuilder();
  const hw = QUAY_WIDTH / 2;
  const proud = hw + QUAY_COPING_PROUD;

  // The footing below the waterline, on the lowest course's outline, closed underneath and open on top.
  const bodyFrom = b.vertexCount();
  const foot = outlineOf(QUAY_COURSE_COUNT);
  const ring = (y: number): Vec3[] => [
    [-foot.hw, y, QUAY_BACK],
    [-foot.hw, y, foot.front],
    [foot.hw, y, foot.front],
    [foot.hw, y, QUAY_BACK],
  ];
  b.prism(ring(QUAY_BASE), ring(SEA_LEVEL), colors.stone, { top: false });

  // The courses, from the waterline up: each a vertical band on its own
  // outline, open top and bottom, with a ledge from the outline below up
  // to its own where the course below stands proud. The sea face is split
  // into blocks that take their own jitter; the sides and back are plain.
  const blockJitter = stream(seedOf([QUAY_COURSE_COUNT, COURSE_BLOCKS.length], BLOCK_SEED));
  for (let i = QUAY_COURSE_COUNT - 1; i >= 0; i--) {
    const y0 = SEA_LEVEL + (QUAY_COURSE_COUNT - 1 - i) * QUAY_COURSE_HEIGHT;
    const y1 = i === 0 ? QUAY_STEP_TOP : y0 + QUAY_COURSE_HEIGHT;
    const outline = outlineOf(i);
    const below = outlineOf(i + 1);
    // The odd courses are the light ones: the occlusion bake already darkens the top course and the one at the waterline.
    const course = i % 2 === 1 ? colors.stone : shadeRgb(colors.stone, COURSE_SHADE);
    // Ledge at y0: a strip along the front and one down each side, facing up.
    b.quad([-below.hw, y0, outline.front], [-below.hw, y0, below.front], [below.hw, y0, below.front], [below.hw, y0, outline.front], course);
    b.quad([outline.hw, y0, QUAY_BACK], [outline.hw, y0, outline.front], [below.hw, y0, outline.front], [below.hw, y0, QUAY_BACK], course);
    b.quad([-below.hw, y0, QUAY_BACK], [-below.hw, y0, outline.front], [-outline.hw, y0, outline.front], [-outline.hw, y0, QUAY_BACK], course);
    // Sides and back.
    b.quad([outline.hw, y0, outline.front], [outline.hw, y0, QUAY_BACK], [outline.hw, y1, QUAY_BACK], [outline.hw, y1, outline.front], course);
    b.quad([-outline.hw, y0, QUAY_BACK], [-outline.hw, y0, outline.front], [-outline.hw, y1, outline.front], [-outline.hw, y1, QUAY_BACK], course);
    b.quad([outline.hw, y0, QUAY_BACK], [-outline.hw, y0, QUAY_BACK], [-outline.hw, y1, QUAY_BACK], [outline.hw, y1, QUAY_BACK], course);
    // The sea face in blocks.
    const blocks = COURSE_BLOCKS[i % COURSE_BLOCKS.length];
    for (let k = 0; k < blocks; k++) {
      const x0 = -outline.hw + (2 * outline.hw * k) / blocks;
      const x1 = -outline.hw + (2 * outline.hw * (k + 1)) / blocks;
      const block = shadeRgb(course, 1 + (blockJitter() * 2 - 1) * BLOCK_JITTER);
      b.quad([x0, y0, outline.front], [x1, y0, outline.front], [x1, y1, outline.front], [x0, y1, outline.front], block);
    }
  }
  // The rear step: the body's own top behind the coping.
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
