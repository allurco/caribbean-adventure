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
 * "Notch up" register, readable relief and no textures:
 * - The deck is the surface the game camera sees most, so it carries the
 *   most detail: a coping base with a chamfered outer edge, and on it a
 *   grid of flagstones (`QUAY_SLAB_GRID`, irregular widths from the
 *   variation stream), each a shallow bevelled slab a groove apart from its
 *   neighbours, with a tone of its own.
 * - Above the waterline the wall is laid in stepped courses, each standing
 *   a little further out than the one above (a battered wall, the foot
 *   flush with the coping's edge) with an up-facing ledge at every course
 *   line; on the sea face each course carries proud blocks, a joint apart,
 *   so every joint is a shadow groove in any light. The courses alternate
 *   in tone and the joints are staggered.
 * - A wet band: over the lowest course the stone darkens and greens down
 *   to the waterline (a vertex colour gradient, `tintColors`).
 * - A stair hung on the +x end of the sea wall, stepping down from under
 *   the coping to the water: the one feature that reads in silhouette.
 * - Deck dressing: two crates and a third on top of one, a barrel with two
 *   hoops, and the two bollards at the sea edge.
 *
 * Parts meet on shared planes with the hidden face dropped: the body is
 * open on top where the coping base sits, the base is open underneath (its
 * exposed overhang is drawn as three strips), the flagstones, crates and
 * bollards are open at their feet, the blocks open at their backs on the
 * wall plane, the stair's slabs stack open-bottomed on the one below. The
 * stair stands a hair's breadth seaward of the wall's foot, so it touches
 * neither the ledges, the blocks nor the coping's overhang. No face
 * overlaps another in its plane and none passes through another; the
 * tests check both.
 */
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { PIER_DECK_TOP, PIER_POST_BOTTOM } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { lerpRange, seedOf, stream } from "./variationStream";

export interface QuayColors {
  /** The sea wall, the stair and the rear step. */
  stone: Rgb;
  /** The coping base and the flagstones; lighter than the stone. */
  coping: Rgb;
  /** The bollards, crates and barrel. */
  timber: Rgb;
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
/** The chamfer on the coping base's outer edge. */
export const QUAY_COPING_BEVEL = 0.006;
export const QUAY_BOLLARD = { halfWidth: 0.012, height: 0.03, inset: 0.05, z: QUAY_SEA_FACE - 0.03 };
/** Courses between the waterline and the coping; each steps out `QUAY_COPING_PROUD / count` going down. */
export const QUAY_COURSE_COUNT = 3;
export const QUAY_COURSE_HEIGHT = (QUAY_STEP_TOP - SEA_LEVEL) / QUAY_COURSE_COUNT;
/** The course lines: the height of the ledge under each course, from the waterline up. */
export const QUAY_COURSE_LEDGES: readonly number[] = Array.from({ length: QUAY_COURSE_COUNT }, (_, i) => SEA_LEVEL + i * QUAY_COURSE_HEIGHT);
/** The wet band fades out this far above the waterline: the lowest course. */
export const QUAY_WET_HEIGHT = QUAY_COURSE_HEIGHT;
/** The flagstones' thickness; the groove floor between them is the base's top. */
export const QUAY_SLAB_HEIGHT = 0.012;
export const QUAY_GROOVE_FLOOR = QUAY_TOP - QUAY_SLAB_HEIGHT;
export const QUAY_SLAB_GRID = { across: 3, along: 2 };
/** The groove between neighbouring flagstones. */
export const QUAY_SLAB_GAP = 0.006;

const WALL_FOOT = QUAY_SEA_FACE + QUAY_COPING_PROUD;
const HALF_WIDTH = QUAY_WIDTH / 2;
const COPING_HALF_WIDTH = HALF_WIDTH + QUAY_COPING_PROUD;

/** The coping base's flat top, inside its chamfer: the flagstones lie on it and the dressing stands within it. */
export const QUAY_DECK = {
  minX: -COPING_HALF_WIDTH + QUAY_COPING_BEVEL,
  maxX: COPING_HALF_WIDTH - QUAY_COPING_BEVEL,
  minZ: QUAY_STEP_Z + QUAY_COPING_BEVEL,
  maxZ: WALL_FOOT - QUAY_COPING_BEVEL,
};

/**
 * The stair on the +x end of the sea wall: `steps` treads from `topTread`
 * (just under the coping) down by `rise` each to the water, each tread
 * `tread` long, the flight stepping down towards the end, `depth` out from
 * `back`, which stands a hair seaward of the wall's foot.
 */
export const QUAY_STAIR = (() => {
  const steps = 3;
  const topTread = QUAY_STEP_TOP - 0.002;
  const tread = 0.04;
  return { steps, topTread, rise: (topTread - SEA_LEVEL) / steps, tread, x0: COPING_HALF_WIDTH - steps * tread, back: WALL_FOOT + 0.001, depth: 0.05 };
})();

export interface QuaySlab {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const SLAB_SEED = 0x7e31;
const SLAB_WIDTH_SPREAD = 0.3;
const ROW_SPLIT_SPREAD = 0.15;

/** The flagstone cells, columns across x (−x first) within rows along z (the back row first), from a seeded stream. */
export const QUAY_SLAB_CELLS: readonly QuaySlab[] = (() => {
  const next = stream(seedOf([QUAY_SLAB_GRID.across, QUAY_SLAB_GRID.along], SLAB_SEED));
  const widths = Array.from({ length: QUAY_SLAB_GRID.across }, () => 1 + (next() * 2 - 1) * SLAB_WIDTH_SPREAD);
  const total = widths.reduce((a, b) => a + b, 0);
  const xs = [QUAY_DECK.minX];
  for (const w of widths) xs.push(xs[xs.length - 1] + ((QUAY_DECK.maxX - QUAY_DECK.minX) * w) / total);
  const zs = [QUAY_DECK.minZ];
  for (let r = 1; r < QUAY_SLAB_GRID.along; r++) {
    zs.push(QUAY_DECK.minZ + ((QUAY_DECK.maxZ - QUAY_DECK.minZ) * (r + (next() * 2 - 1) * ROW_SPLIT_SPREAD)) / QUAY_SLAB_GRID.along);
  }
  zs.push(QUAY_DECK.maxZ);
  const cells: QuaySlab[] = [];
  for (let r = 0; r < QUAY_SLAB_GRID.along; r++) {
    for (let c = 0; c < QUAY_SLAB_GRID.across; c++) cells.push({ x0: xs[c], x1: xs[c + 1], z0: zs[r], z1: zs[r + 1] });
  }
  return cells;
})();

const SLAB_BEVEL = 0.004;
/** A flagstone's flat top: the cell inset by half a groove on each inner side and by the bevel all round. */
function slabTop(cell: QuaySlab): QuaySlab {
  const inset = (v: number, edge: number) => (Math.abs(v - edge) < 1e-9 ? 0 : QUAY_SLAB_GAP / 2) + SLAB_BEVEL;
  return {
    x0: cell.x0 + inset(cell.x0, QUAY_DECK.minX),
    x1: cell.x1 - inset(cell.x1, QUAY_DECK.maxX),
    z0: cell.z0 + inset(cell.z0, QUAY_DECK.minZ),
    z1: cell.z1 - inset(cell.z1, QUAY_DECK.maxZ),
  };
}

export interface QuayCrate {
  x: number;
  /** The crate's underside. */
  y: number;
  z: number;
  size: number;
  /** Turn about the vertical axis (radians). */
  yaw: number;
}

/** Two crates in the back-left flagstone, a smaller one on the first; placed by fractions of the flagstone's flat top. */
export const QUAY_CRATES: readonly QuayCrate[] = (() => {
  const top = slabTop(QUAY_SLAB_CELLS[0]);
  const at = (fx: number, fz: number) => ({ x: top.x0 + (top.x1 - top.x0) * fx, z: top.z0 + (top.z1 - top.z0) * fz });
  const a = { ...at(0.25, 0.3), y: QUAY_TOP, size: 0.034, yaw: 0 };
  return [a, { ...at(0.72, 0.68), y: QUAY_TOP, size: 0.028, yaw: 0.26 }, { x: a.x, z: a.z, y: QUAY_TOP + a.size, size: 0.024, yaw: 0 }];
})();

/** A barrel in the middle of the back-right flagstone. */
export const QUAY_BARREL = (() => {
  const top = slabTop(QUAY_SLAB_CELLS[QUAY_SLAB_GRID.across - 1]);
  return { x: (top.x0 + top.x1) / 2, z: (top.z0 + top.z1) / 2, radius: 0.016, height: 0.04 };
})();

export const QUAY_TRIANGLE_BUDGET = 700;
/**
 * What the build below comes to: footing 10, courses 42 (walls, sides, backs
 * and ledges), 13 blocks 130, rear step 2, overhang undersides 6, stair 32,
 * coping base 30, 6 flagstones 180, two bollards 60, three crates 90,
 * barrel 88.
 */
export const QUAY_TRIANGLES = 670;

const BOLLARD_BEVEL = 0.004;
const COURSE_STEP = QUAY_COPING_PROUD / QUAY_COURSE_COUNT;
/** Blocks across the sea face of each course, from the top course down: the odd courses stagger the joints. */
const COURSE_BLOCKS = [4, 5, 4];
/** How far the blocks stand proud of the course's wall, and the joint left round each. */
const BLOCK_PROUD = 0.004;
const BLOCK_JOINT = 0.005;
/** Alternate courses (and stair slabs) are this much darker. */
const COURSE_SHADE = 0.9;
const BLOCK_TONE = 0.08;
const BLOCK_SEED = 0x2c91;
const SLAB_TONE = 0.1;
const SLAB_TONE_SEED = 0x19d3;
/** The wall at the waterline, as a factor on the stone: darker and greener. */
const WET_TINT: Rgb = [0.45, 0.6, 0.48];
/** Ground-contact and under-coping shading meet at one ring of the wall, AO_REACH up from the waterline. */
const AO_REACH = 0.025;
const AO_GROUND_HEIGHT = QUAY_STEP_TOP - SEA_LEVEL - AO_REACH;
const AO_GROUND_STRENGTH = 0.2;
const AO_COPING_STRENGTH = 0.4;
const COLOR_JITTER = 0.05;
const JITTER_SEED = 0x51a7;
const CRATE_BEVEL = 0.003;
const BARREL_SEGMENTS = 8;
/** The barrel's hoops: the fraction of its height each band covers, and their shade. */
const BARREL_HOOPS: readonly [number, number][] = [
  [0.22, 0.32],
  [0.68, 0.78],
];
const BARREL_HOOP_SHADE = 0.6;
const BARREL_END_RADIUS = 0.88;

/** The plan outline of course `i` (0 the top course); `QUAY_COURSE_COUNT` is the footing below the waterline. */
const outlineOf = (i: number) => ({ hw: HALF_WIDTH + i * COURSE_STEP, front: QUAY_SEA_FACE + i * COURSE_STEP });

/** Builds the quay at scale 1. Colours are linear RGB in [0, 1]. */
export function buildQuayGeometry(colors: QuayColors): FacetGeometryData {
  const b = createFacetBuilder();
  const hw = HALF_WIDTH;
  const proud = COPING_HALF_WIDTH;

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
  // to its own where the course below stands proud. The sea face carries
  // proud blocks, open at their backs on the wall plane, a joint apart.
  const blockTone = stream(seedOf([QUAY_COURSE_COUNT, COURSE_BLOCKS.length], BLOCK_SEED));
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
    // The wall itself, all four sides.
    b.quad([-outline.hw, y0, outline.front], [outline.hw, y0, outline.front], [outline.hw, y1, outline.front], [-outline.hw, y1, outline.front], course);
    b.quad([outline.hw, y0, outline.front], [outline.hw, y0, QUAY_BACK], [outline.hw, y1, QUAY_BACK], [outline.hw, y1, outline.front], course);
    b.quad([-outline.hw, y0, QUAY_BACK], [-outline.hw, y0, outline.front], [-outline.hw, y1, outline.front], [-outline.hw, y1, QUAY_BACK], course);
    b.quad([outline.hw, y0, QUAY_BACK], [-outline.hw, y0, QUAY_BACK], [-outline.hw, y1, QUAY_BACK], [outline.hw, y1, QUAY_BACK], course);
    // The blocks on the sea face.
    const blocks = COURSE_BLOCKS[i % COURSE_BLOCKS.length];
    const pitch = (2 * outline.hw) / blocks;
    for (let k = 0; k < blocks; k++) {
      const x0 = -outline.hw + pitch * k + BLOCK_JOINT / 2;
      const x1 = -outline.hw + pitch * (k + 1) - BLOCK_JOINT / 2;
      const tone = shadeRgb(course, 1 + (blockTone() * 2 - 1) * BLOCK_TONE);
      // A bevelled box at zero bevel is a plain box whose back can be dropped (its chamfers collapse and are skipped).
      b.bevelledBox([x0, y0 + BLOCK_JOINT / 2, outline.front], [x1, y1 - BLOCK_JOINT / 2, outline.front + BLOCK_PROUD], 0, tone, { back: false });
    }
  }
  // The rear step: the body's own top behind the coping.
  b.quad([-hw, QUAY_STEP_TOP, QUAY_BACK], [-hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_BACK], colors.stone);

  // The coping's exposed underside: a strip along the sea face and one down each side, facing down.
  const underside = (x0: number, x1: number, z0: number, z1: number) =>
    b.quad([x0, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z1], [x0, QUAY_STEP_TOP, z1], colors.stone);
  underside(-proud, proud, QUAY_SEA_FACE, WALL_FOOT);
  underside(-proud, -hw, QUAY_STEP_Z, QUAY_SEA_FACE);
  underside(hw, proud, QUAY_STEP_Z, QUAY_SEA_FACE);

  // The stair: slabs stacked open-bottomed on the one below, each a tread
  // longer than the one above, so the flight steps down towards the end;
  // the lowest runs on down to the base.
  const stair = QUAY_STAIR;
  for (let j = 0; j < stair.steps; j++) {
    const top = stair.topTread - j * stair.rise;
    const bottom = j === stair.steps - 1 ? QUAY_BASE : top - stair.rise;
    const tone = j % 2 === 0 ? colors.stone : shadeRgb(colors.stone, COURSE_SHADE);
    b.box([stair.x0, bottom, stair.back], [stair.x0 + (j + 1) * stair.tread, top, stair.back + stair.depth], tone, { bottom: j === stair.steps - 1 });
  }

  b.bakeAmbientOcclusion({
    groundHeight: AO_GROUND_HEIGHT,
    groundStrength: AO_GROUND_STRENGTH,
    overhangs: [{ y: QUAY_STEP_TOP, reach: AO_REACH, strength: AO_COPING_STRENGTH }],
    from: bodyFrom,
    to: b.vertexCount(),
  });
  // The wet band: full at and below the waterline, gone at the top of the lowest course.
  b.tintColors(bodyFrom, b.vertexCount(), ([, y]) => {
    const t = Math.max(0, Math.min(1, 1 - (y - SEA_LEVEL) / QUAY_WET_HEIGHT));
    return [lerpRange([1, WET_TINT[0]], t), lerpRange([1, WET_TINT[1]], t), lerpRange([1, WET_TINT[2]], t)];
  });

  // The coping base, open underneath, chamfered on its top and vertical edges, and the flagstones on it.
  b.bevelledBox([-proud, QUAY_STEP_TOP, QUAY_STEP_Z], [proud, QUAY_GROOVE_FLOOR, WALL_FOOT], QUAY_COPING_BEVEL, colors.coping, { bottom: false });
  const slabTone = stream(seedOf([QUAY_SLAB_CELLS.length], SLAB_TONE_SEED));
  for (const cell of QUAY_SLAB_CELLS) {
    const edge = (v: number, bound: number) => (Math.abs(v - bound) < 1e-9 ? 0 : QUAY_SLAB_GAP / 2);
    const tone = shadeRgb(colors.coping, 1 + (slabTone() * 2 - 1) * SLAB_TONE);
    b.bevelledBox(
      [cell.x0 + edge(cell.x0, QUAY_DECK.minX), QUAY_GROOVE_FLOOR, cell.z0 + edge(cell.z0, QUAY_DECK.minZ)],
      [cell.x1 - edge(cell.x1, QUAY_DECK.maxX), QUAY_TOP, cell.z1 - edge(cell.z1, QUAY_DECK.maxZ)],
      SLAB_BEVEL,
      tone,
      { bottom: false }
    );
  }

  // Two bollards near the sea edge, standing on the deck with open feet.
  const { halfWidth, height, inset, z } = QUAY_BOLLARD;
  for (const sign of [-1, 1]) {
    const x = sign * (hw - inset);
    b.bevelledBox([x - halfWidth, QUAY_TOP, z - halfWidth], [x + halfWidth, QUAY_TOP + height, z + halfWidth], BOLLARD_BEVEL, colors.timber, {
      bottom: false,
    });
  }

  // Crates: bevelled boxes with open feet, built about the origin, turned, then moved into place.
  for (const crate of QUAY_CRATES) {
    const from = b.vertexCount();
    const h = crate.size / 2;
    b.bevelledBox([-h, 0, -h], [h, crate.size, h], CRATE_BEVEL, colors.timber, { bottom: false });
    b.rotate(from, b.vertexCount(), "y", crate.yaw);
    b.translate(from, b.vertexCount(), [crate.x, crate.y, crate.z]);
  }

  // The barrel: staves, two darker hoop bands and a top, open at its foot on the deck.
  const barrelFrom = b.vertexCount();
  const { radius: r, height: bh } = QUAY_BARREL;
  const [hoopA, hoopB] = BARREL_HOOPS;
  const hoop = shadeRgb(colors.timber, BARREL_HOOP_SHADE);
  b.lathe(
    [
      [BARREL_END_RADIUS * r, 0],
      [r, hoopA[0] * bh],
    ],
    BARREL_SEGMENTS,
    colors.timber
  );
  b.lathe(
    [
      [r, hoopA[0] * bh],
      [r, hoopA[1] * bh],
    ],
    BARREL_SEGMENTS,
    hoop
  );
  b.lathe(
    [
      [r, hoopA[1] * bh],
      [r, hoopB[0] * bh],
    ],
    BARREL_SEGMENTS,
    colors.timber
  );
  b.lathe(
    [
      [r, hoopB[0] * bh],
      [r, hoopB[1] * bh],
    ],
    BARREL_SEGMENTS,
    hoop
  );
  b.lathe(
    [
      [r, hoopB[1] * bh],
      [BARREL_END_RADIUS * r, bh],
    ],
    BARREL_SEGMENTS,
    colors.timber
  );
  b.lathe(
    [
      [BARREL_END_RADIUS * r, bh],
      [0, bh],
    ],
    BARREL_SEGMENTS,
    colors.timber
  );
  b.translate(barrelFrom, b.vertexCount(), [QUAY_BARREL.x, QUAY_TOP, QUAY_BARREL.z]);

  b.jitterColors(COLOR_JITTER, JITTER_SEED);
  return b.build();
}
