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
 * Art direction: an old Spanish-Caribbean port that has stood a century in
 * salt air, in the stylised mid-poly register (bold silhouette, faceted,
 * vertex colour only, no textures). Nothing is a perfect grid:
 * - The wall above the waterline is two tall battered courses, each
 *   standing half the coping's overhang further out than the one above,
 *   with an up-facing ledge at the course line. Its faces are a dark mortar
 *   plane set with rough-cut blocks of unequal widths (`QUAY_WALL_BLOCKS`,
 *   from the variation stream): each stands proud by its own amount, the
 *   joints vary in width so the course lines wobble, a few have a chipped
 *   corner, one or two are missing and show the dark rubble behind, and
 *   each has its own tone (±15 %, with an ochre drift). Blocks under the
 *   bollards and the mooring ring are stained dark.
 * - A green-black wet band over most of the lower course, a vertex colour
 *   gradient down to the waterline (`tintColors`).
 * - The deck is a square-edged stone base with irregular paving on it
 *   (`QUAY_PAVING`: three rows of unequal stones, joints of varying width,
 *   no bevels); every stone's corners sit at their own height so the deck
 *   is uneven, a few stones are sunk, and the ones that carry a prop are
 *   flat. Sand drifts over the landward row, a damp patch darkens the
 *   middle, and the outer edge carries a hint of salt-pale.
 * - A three-tread stair hung on the +x end of the sea wall, its rises
 *   uneven and its top tread chipped.
 * - Props: two tapered octagonal timber posts, leaning and worn dark at the
 *   foot; an iron mooring ring on the sea face; a rope coil, an aged crate
 *   and a hooped barrel on the deck.
 *
 * Parts meet on shared planes with the hidden face dropped: the body is
 * open on top where the base sits, the base is open underneath (its
 * exposed overhang is drawn as three strips), the paving, posts, crate,
 * barrel and rope are open at their feet, the blocks open at their backs on
 * the mortar plane, the stair's slabs stack open-bottomed on the one below.
 * The stair stands a hair seaward of the proudest block, so it touches
 * nothing. No face overlaps another in its plane and none passes through
 * another; the tests check both. `buildQuayParts` also reports each part's
 * vertex range so the tests can address a part without guessing it from
 * its colour.
 */
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { PIER_DECK_TOP, PIER_POST_BOTTOM } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { lerpRange, seedOf, stream } from "./variationStream";

export interface QuayColors {
  /** Weathered stone: everything of the wall, the deck and the stair. */
  stone: Rgb;
  /** The mortar plane behind the blocks and the joints between the paving: near black-brown. */
  mortar: Rgb;
  /** The posts, crate and barrel staves. */
  timber: Rgb;
  /** The mooring ring and the barrel's hoops. */
  iron: Rgb;
  /** The rope coil. */
  rope: Rgb;
  /** The beach sand, drifted over the landward paving. */
  sand: Rgb;
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
/** The deck, a lip above the pier deck's landward end: the nominal paving top. */
export const QUAY_TOP = PIER_DECK_TOP + 0.015;
export const QUAY_COPING_THICKNESS = 0.03;
/** The rear step's top: the body's own top, under the base. */
export const QUAY_STEP_TOP = QUAY_TOP - QUAY_COPING_THICKNESS;
/** How far the base overhangs the wall below it; the battered wall's foot is flush with its edge. */
export const QUAY_COPING_PROUD = 0.015;
/** Courses between the waterline and the base; each steps out `QUAY_COPING_PROUD / count` going down. */
export const QUAY_COURSE_COUNT = 2;
export const QUAY_COURSE_HEIGHT = (QUAY_STEP_TOP - SEA_LEVEL) / QUAY_COURSE_COUNT;
/** The course lines: the height of the ledge under each course, from the waterline up. */
export const QUAY_COURSE_LEDGES: readonly number[] = Array.from({ length: QUAY_COURSE_COUNT }, (_, i) => SEA_LEVEL + i * QUAY_COURSE_HEIGHT);
/** The wet band fades out this far above the waterline: most of the lower course. */
export const QUAY_WET_HEIGHT = QUAY_COURSE_HEIGHT * 0.75;
/** The paving's nominal thickness; the joints between the stones go down to the base's top. */
export const QUAY_PAVING_THICKNESS = 0.012;
export const QUAY_PAVING_FLOOR = QUAY_TOP - QUAY_PAVING_THICKNESS;
/** Each paving stone's corners sit within this of the nominal top; a sunk stone is this much lower again. */
export const QUAY_PAVING_TILT = 0.003;
export const QUAY_PAVING_SINK = 0.004;
/** How far the wall blocks may stand proud of the mortar plane, per course from the top down (the lower course stays under the base's edge). */
export const QUAY_BLOCK_PROUD: readonly (readonly [number, number])[] = [
  [0.002, 0.01],
  [0.002, 0.007],
];
/** The joints between blocks and between paving stones. */
export const QUAY_JOINT: readonly [number, number] = [0.004, 0.01];

const COURSE_STEP = QUAY_COPING_PROUD / QUAY_COURSE_COUNT;
const HALF_WIDTH = QUAY_WIDTH / 2;
const BASE_HALF_WIDTH = HALF_WIDTH + QUAY_COPING_PROUD;
const WALL_FOOT = QUAY_SEA_FACE + QUAY_COPING_PROUD;

/** The plan outline of course `i` (0 the top course); `QUAY_COURSE_COUNT` is the footing below the waterline. */
const outlineOf = (i: number) => ({ hw: HALF_WIDTH + i * COURSE_STEP, front: QUAY_SEA_FACE + i * COURSE_STEP });
/** Course `i`'s ledge height and top: the ledges are listed from the waterline up, the courses from the top down. */
const courseSpan = (i: number): [number, number] => [
  QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - 1 - i],
  i === 0 ? QUAY_STEP_TOP : QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - i],
];

/** The base's flat top, which the paving covers edge to edge. */
export const QUAY_DECK = { minX: -BASE_HALF_WIDTH, maxX: BASE_HALF_WIDTH, minZ: QUAY_STEP_Z, maxZ: WALL_FOOT };

export type QuayWallFace = "sea" | "left" | "right";

/**
 * One rough-cut block on a wall face, in that face's own plane: `u` runs
 * along the face (x on the sea face, z on the sides), `v` is height, and
 * the block stands `proud` out of the mortar plane. A chipped block loses
 * the corner `chip` (0 bottom-start, 1 bottom-end, 2 top-end, 3 top-start)
 * over `chipSize`; a missing block is laid out but never built.
 */
export interface QuayWallBlock {
  face: QuayWallFace;
  course: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  proud: number;
  tone: number;
  ochre: number;
  chip?: number;
  chipSize: number;
  missing: boolean;
  stained: boolean;
}

/** Blocks across each face per course, the top course first: unequal counts stagger the joints. */
const SEA_BLOCK_COUNTS = [5, 6];
const SIDE_BLOCK_COUNTS = [4, 3];
const BLOCK_SEED = 0x2c91;
const BLOCK_WIDTH_SPREAD: readonly [number, number] = [0.6, 1.4];
const BLOCK_END_JOINT = 0.002;
/** Each block's bed and top joint, so the course line wobbles. */
const BLOCK_BED_JOINT: readonly [number, number] = [0.002, 0.006];
const BLOCK_TONE = 0.15;
const BLOCK_OCHRE = 0.08;
const BLOCK_CHIP_CHANCE = 0.3;
const BLOCK_CHIP_SIZE: readonly [number, number] = [0.005, 0.009];
/** Which laid-out blocks are left out (face, course, index): one on the sea face low down, one on the left side. */
const MISSING_BLOCKS: readonly (readonly [QuayWallFace, number, number])[] = [
  ["sea", 1, 1],
  ["left", 0, 1],
];
const STAIN_SHADE = 0.72;

export const QUAY_BOLLARD = { radius: 0.009, topRadius: 0.0065, height: 0.032, lean: (4 * Math.PI) / 180 };
/** The bollards stand on the two outer stones of the front paving row; the mooring ring hangs on the sea face at this x. */
export const QUAY_RING = { x: -0.12, radius: 0.006, tube: 0.0015, clearance: 0.0004 };

/** Lays out one face of one course: unequal widths, joints of varying width, each block's own bed, proud, tone and chip. */
function layoutFace(face: QuayWallFace, course: number, count: number, span: readonly [number, number], y0: number, y1: number, next: () => number, stains: readonly number[]) {
  const joints = Array.from({ length: count - 1 }, () => lerpRange(QUAY_JOINT, next()));
  const weights = Array.from({ length: count }, () => lerpRange(BLOCK_WIDTH_SPREAD, next()));
  const free = span[1] - span[0] - 2 * BLOCK_END_JOINT - joints.reduce((a, b) => a + b, 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const blocks: QuayWallBlock[] = [];
  let u = span[0] + BLOCK_END_JOINT;
  for (let k = 0; k < count; k++) {
    const u1 = u + (free * weights[k]) / total;
    const v0 = y0 + lerpRange(BLOCK_BED_JOINT, next());
    const v1 = y1 - lerpRange(BLOCK_BED_JOINT, next());
    const proud = lerpRange(QUAY_BLOCK_PROUD[course], next());
    const tone = 1 + (next() * 2 - 1) * BLOCK_TONE;
    const ochre = (next() * 2 - 1) * BLOCK_OCHRE;
    const chipped = next() < BLOCK_CHIP_CHANCE;
    const chip = Math.floor(next() * 4);
    const chipSize = lerpRange(BLOCK_CHIP_SIZE, next());
    blocks.push({
      face,
      course,
      u0: u,
      u1,
      v0,
      v1,
      proud,
      tone,
      ochre,
      chip: chipped ? chip : undefined,
      chipSize,
      missing: MISSING_BLOCKS.some(([f, c, i]) => f === face && c === course && i === k),
      stained: face === "sea" && stains.some((x) => x >= u && x <= u1),
    });
    u = u1 + (k < count - 1 ? joints[k] : 0);
  }
  return blocks;
}

/** Where the paving's three rows split and how many stones each holds, the landward row first. */
export const QUAY_PAVING_ROWS = [4, 3, 5];
const PAVING_SEED = 0x7e31;
const PAVING_WIDTH_SPREAD: readonly [number, number] = [0.7, 1.3];
const PAVING_ROW_SPREAD = 0.12;
const PAVING_SINK_CHANCE = 0.2;
const PAVING_TONE = 0.1;

export interface QuayPavingStone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Top heights at the corners −x−z, −x+z, +x+z, +x−z. */
  corners: readonly [number, number, number, number];
  row: number;
  tone: number;
  /** Flat at `QUAY_TOP`, because a prop stands on it. */
  flat: boolean;
}

/** The stones' plan cells and corner heights before the props' stones are flattened. */
function layoutPaving(): QuayPavingStone[] {
  const next = stream(seedOf(QUAY_PAVING_ROWS, PAVING_SEED));
  const rows = QUAY_PAVING_ROWS.length;
  const zs = [QUAY_DECK.minZ];
  for (let r = 1; r < rows; r++) {
    const joint = lerpRange(QUAY_JOINT, next());
    const split = QUAY_DECK.minZ + ((QUAY_DECK.maxZ - QUAY_DECK.minZ) * (r + (next() * 2 - 1) * PAVING_ROW_SPREAD)) / rows;
    zs.push(split - joint / 2, split + joint / 2);
  }
  zs.push(QUAY_DECK.maxZ);
  const stones: QuayPavingStone[] = [];
  QUAY_PAVING_ROWS.forEach((count, row) => {
    const z0 = zs[row * 2];
    const z1 = zs[row * 2 + 1];
    const joints = Array.from({ length: count - 1 }, () => lerpRange(QUAY_JOINT, next()));
    const weights = Array.from({ length: count }, () => lerpRange(PAVING_WIDTH_SPREAD, next()));
    const free = QUAY_DECK.maxX - QUAY_DECK.minX - joints.reduce((a, b) => a + b, 0);
    const total = weights.reduce((a, b) => a + b, 0);
    let x = QUAY_DECK.minX;
    for (let k = 0; k < count; k++) {
      const x1 = x + (free * weights[k]) / total;
      const sink = next() < PAVING_SINK_CHANCE ? QUAY_PAVING_SINK : 0;
      const corner = () => QUAY_TOP - sink + (next() * 2 - 1) * QUAY_PAVING_TILT;
      stones.push({ x0: x, x1, z0, z1, corners: [corner(), corner(), corner(), corner()], row, tone: 1 + (next() * 2 - 1) * PAVING_TONE, flat: false });
      x = x1 + (k < count - 1 ? joints[k] : 0);
    }
  });
  return stones;
}

const stoneCentre = (s: QuayPavingStone) => ({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 });
const rowStones = (stones: readonly QuayPavingStone[], row: number) => stones.filter((s) => s.row === row);

/**
 * The paving and the props standing on it, laid out together: each prop
 * stands at the centre of its own stone, which is flat. The bollards take
 * the front row's two end stones, the crate and the barrel the back row's
 * two end stones, the rope coil the middle row's +x end stone.
 */
const layout = (() => {
  const stones = layoutPaving();
  const last = QUAY_PAVING_ROWS.length - 1;
  const front = rowStones(stones, last);
  const back = rowStones(stones, 0);
  const middle = rowStones(stones, 1);
  const flat = (s: QuayPavingStone) => {
    s.flat = true;
    s.corners = [QUAY_TOP, QUAY_TOP, QUAY_TOP, QUAY_TOP];
    return stoneCentre(s);
  };
  const bollards = [flat(front[0]), flat(front[front.length - 1])];
  const crate = flat(back[0]);
  const barrel = flat(back[back.length - 1]);
  const rope = flat(middle[middle.length - 1]);
  return { stones, bollards, crate, barrel, rope };
})();

export const QUAY_PAVING: readonly QuayPavingStone[] = layout.stones;
/** The two posts' feet; each leans by `QUAY_BOLLARD.lean` towards `lean` (a unit plan direction). */
const leanTowards = (degrees: number): readonly [number, number] => [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
export const QUAY_BOLLARDS: readonly { x: number; z: number; lean: readonly [number, number] }[] = [
  { ...layout.bollards[0], lean: leanTowards(120) },
  { ...layout.bollards[1], lean: leanTowards(-72) },
];
export const QUAY_CRATE = { ...layout.crate, size: 0.03, yaw: 0.26 };
export const QUAY_BARREL = { ...layout.barrel, radius: 0.015, height: 0.038 };
export const QUAY_ROPE = { ...layout.rope, outer: 0.014, inner: 0.006, height: 0.004 };
/** The damp patch on the deck: a darkening that fades out over `radius`. */
export const QUAY_DAMP = { x: 0.0, z: -0.09, radius: 0.07, shade: 0.72 };
/** Sand drifts over the landward paving, fading out this far seaward of the step. */
export const QUAY_SAND_DRIFT = 0.09;

/** All the wall blocks, laid out once from the stream; the stains fall under the bollards and the ring. */
export const QUAY_WALL_BLOCKS: readonly QuayWallBlock[] = (() => {
  const next = stream(seedOf([QUAY_COURSE_COUNT, ...SEA_BLOCK_COUNTS, ...SIDE_BLOCK_COUNTS], BLOCK_SEED));
  const stains = [...QUAY_BOLLARDS.map((b) => b.x), QUAY_RING.x];
  const blocks: QuayWallBlock[] = [];
  for (let i = 0; i < QUAY_COURSE_COUNT; i++) {
    const [y0, top] = courseSpan(i);
    const { hw, front } = outlineOf(i);
    blocks.push(...layoutFace("sea", i, SEA_BLOCK_COUNTS[i], [-hw, hw], y0, top, next, stains));
    blocks.push(...layoutFace("left", i, SIDE_BLOCK_COUNTS[i], [QUAY_STEP_Z, front], y0, top, next, []));
    blocks.push(...layoutFace("right", i, SIDE_BLOCK_COUNTS[i], [QUAY_STEP_Z, front], y0, top, next, []));
  }
  return blocks;
})();

/** The proudest any block stands of the lower course's sea face: the stair stands a hair seaward of it. */
const LOWER_PROUD_MAX = QUAY_BLOCK_PROUD[QUAY_COURSE_COUNT - 1][1];

/**
 * The stair on the +x end of the sea wall: `steps` treads from `topTread`
 * (just under the base) down to the water by uneven `rises`, each slab a
 * tread longer than the one above so the flight steps down towards the
 * end, `depth` out from `back`. The top slab's seaward corner is chipped.
 */
export const QUAY_STAIR = (() => {
  const steps = 3;
  const next = stream(seedOf([steps], 0x5a1b));
  const topTread = QUAY_STEP_TOP - 0.002;
  const weights = Array.from({ length: steps }, () => lerpRange([0.75, 1.25], next()));
  const total = weights.reduce((a, b) => a + b, 0);
  const rises = weights.map((w) => ((topTread - SEA_LEVEL) * w) / total);
  const treads = Array.from({ length: steps }, () => lerpRange([0.032, 0.046], next()));
  const run = treads.reduce((a, b) => a + b, 0);
  return { steps, topTread, rises, treads, x0: BASE_HALF_WIDTH - run, back: outlineOf(QUAY_COURSE_COUNT - 1).front + LOWER_PROUD_MAX + 0.001, depth: 0.05, chip: 0.012 };
})();

export const QUAY_TRIANGLE_BUDGET = 1000;
/**
 * What the build below comes to (the test pins it): footing 10, wall 44
 * (courses, ledges, step and undersides), blocks 242 (23 of 25 built, 4 of
 * them chipped), stair 35, base 10, paving 120, posts 44, ring 64, rope 64,
 * crate 30, barrel 86.
 */
export const QUAY_TRIANGLES = 749;

export type QuayPart = "footing" | "wall" | "blocks" | "stair" | "base" | "paving" | "bollards" | "ring" | "rope" | "crate" | "barrel";

export interface QuayBuild {
  data: FacetGeometryData;
  /** Each part's vertex range `[from, to)`. */
  parts: Record<QuayPart, readonly [number, number]>;
}

/** Ground-contact and under-base shading meet at one ring of the wall, AO_REACH up from the waterline. */
const AO_REACH = 0.025;
const AO_GROUND_HEIGHT = QUAY_STEP_TOP - SEA_LEVEL - AO_REACH;
const AO_GROUND_STRENGTH = 0.2;
const AO_COPING_STRENGTH = 0.35;
/** The wall at the waterline, as a factor on the stone: green-black. */
const WET_TINT: Rgb = [0.38, 0.5, 0.4];
/** The outer edge of the deck, lightened. */
const SALT_TINT: Rgb = [1.12, 1.11, 1.08];
const SALT_REACH = 0.012;
const COLOR_JITTER = 0.05;
const JITTER_SEED = 0x51a7;
const POST_SEGMENTS = 8;
const POST_WORN_HEIGHT = 0.012;
const POST_WORN_SHADE = 0.55;
const RING_SEGMENTS = 8;
const RING_TUBE_SEGMENTS = 4;
const ROPE_SEGMENTS = 8;
const CRATE_BEVEL = 0.003;
const CRATE_SHADE = 0.8;
const BARREL_SEGMENTS = 8;
const BARREL_STAVE_SHADES = [0.95, 0.72];
const BARREL_END_RADIUS = 0.88;
/** The barrel's profile as fractions of its height; the hoops are the bands at index 1 and 3. */
const BARREL_PROFILE: readonly (readonly [number, number])[] = [
  [BARREL_END_RADIUS, 0],
  [1, 0.2],
  [1, 0.3],
  [1, 0.7],
  [1, 0.8],
  [BARREL_END_RADIUS, 1],
];
const BARREL_HOOP_BANDS = [1, 3];

type Uv = readonly [number, number];
type Builder = ReturnType<typeof createFacetBuilder>;

/** A rectangle in face space, counter-clockwise from the bottom-start corner, with one corner cut off if `chip` is set. */
function blockOutline(u0: number, u1: number, v0: number, v1: number, chip: number | undefined, size: number): Uv[] {
  const corners: Uv[] = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  if (chip === undefined) return corners;
  const s = Math.min(size, (u1 - u0) / 3, (v1 - v0) / 3);
  const c = corners[chip];
  const prev = corners[(chip + 3) % 4];
  const nxt = corners[(chip + 1) % 4];
  const towards = (o: Uv): Uv => [c[0] + Math.sign(o[0] - c[0]) * s, c[1] + Math.sign(o[1] - c[1]) * s];
  return corners.flatMap((p, i) => (i === chip ? [towards(prev), towards(nxt)] : [p]));
}

/**
 * A convex polygon extruded `proud` out of a plane, open at its back: a
 * fan for the front and a quad per edge, each wound to face away from the
 * block's centre. `map` takes (along, up, out) to the quay's space.
 */
function proudPolygon(b: Builder, outline: readonly Uv[], proud: number, map: (u: number, v: number, w: number) => Vec3, color: Rgb) {
  const n = outline.length;
  const cu = outline.reduce((a, p) => a + p[0], 0) / n;
  const cv = outline.reduce((a, p) => a + p[1], 0) / n;
  const centre = map(cu, cv, proud / 2);
  const front = outline.map(([u, v]) => map(u, v, proud));
  const back = outline.map(([u, v]) => map(u, v, 0));
  const outward = (p: Vec3, q: Vec3, r: Vec3) => {
    const e1: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const e2: Vec3 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const mid: Vec3 = [(p[0] + q[0] + r[0]) / 3 - centre[0], (p[1] + q[1] + r[1]) / 3 - centre[1], (p[2] + q[2] + r[2]) / 3 - centre[2]];
    if (nx * mid[0] + ny * mid[1] + nz * mid[2] < 0) b.triangle(p, r, q, color);
    else b.triangle(p, q, r, color);
  };
  for (let k = 1; k < n - 1; k++) outward(front[0], front[k], front[k + 1]);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    outward(back[k], back[k1], front[k1]);
    outward(back[k], front[k1], front[k]);
  }
}

/** A ring of `segments` points of `radius` about (cx, y, cz). */
const octagon = (cx: number, y: number, cz: number, radius: number, segments: number): Vec3[] =>
  Array.from({ length: segments }, (_, k) => {
    const phi = (2 * Math.PI * k) / segments;
    return [cx + radius * Math.cos(phi), y, cz - radius * Math.sin(phi)];
  });

/** Builds the quay at scale 1 and reports each part's vertex range. Colours are linear RGB in [0, 1]. */
export function buildQuayParts(colors: QuayColors): QuayBuild {
  const b = createFacetBuilder();
  const hw = HALF_WIDTH;
  const proud = BASE_HALF_WIDTH;
  const parts = {} as Record<QuayPart, readonly [number, number]>;
  let from = 0;
  const part = (name: QuayPart) => {
    parts[name] = [from, b.vertexCount()];
    from = b.vertexCount();
  };

  // The footing below the waterline, on the lowest course's outline, closed underneath and open on top.
  const foot = outlineOf(QUAY_COURSE_COUNT);
  const ring = (y: number): Vec3[] => [
    [-foot.hw, y, QUAY_BACK],
    [-foot.hw, y, foot.front],
    [foot.hw, y, foot.front],
    [foot.hw, y, QUAY_BACK],
  ];
  b.prism(ring(QUAY_BASE), ring(SEA_LEVEL), colors.stone, { top: false });
  part("footing");

  // The courses, from the waterline up: each a vertical band on its own
  // outline, open top and bottom, with a ledge from the outline below up to
  // its own where the course below stands proud. The sea face and the
  // seaward part of each side are the dark mortar plane the blocks stand
  // on; the buried part of the sides and the back are plain stone.
  for (let i = QUAY_COURSE_COUNT - 1; i >= 0; i--) {
    const [y0, y1] = courseSpan(i);
    const outline = outlineOf(i);
    const below = outlineOf(i + 1);
    b.quad([-below.hw, y0, outline.front], [-below.hw, y0, below.front], [below.hw, y0, below.front], [below.hw, y0, outline.front], colors.stone);
    b.quad([outline.hw, y0, QUAY_BACK], [outline.hw, y0, outline.front], [below.hw, y0, outline.front], [below.hw, y0, QUAY_BACK], colors.stone);
    b.quad([-below.hw, y0, QUAY_BACK], [-below.hw, y0, outline.front], [-outline.hw, y0, outline.front], [-outline.hw, y0, QUAY_BACK], colors.stone);
    b.quad([-outline.hw, y0, outline.front], [outline.hw, y0, outline.front], [outline.hw, y1, outline.front], [-outline.hw, y1, outline.front], colors.mortar);
    b.quad([outline.hw, y0, QUAY_STEP_Z], [outline.hw, y0, QUAY_BACK], [outline.hw, y1, QUAY_BACK], [outline.hw, y1, QUAY_STEP_Z], colors.stone);
    b.quad([outline.hw, y0, outline.front], [outline.hw, y0, QUAY_STEP_Z], [outline.hw, y1, QUAY_STEP_Z], [outline.hw, y1, outline.front], colors.mortar);
    b.quad([-outline.hw, y0, QUAY_BACK], [-outline.hw, y0, QUAY_STEP_Z], [-outline.hw, y1, QUAY_STEP_Z], [-outline.hw, y1, QUAY_BACK], colors.stone);
    b.quad([-outline.hw, y0, QUAY_STEP_Z], [-outline.hw, y0, outline.front], [-outline.hw, y1, outline.front], [-outline.hw, y1, QUAY_STEP_Z], colors.mortar);
    b.quad([outline.hw, y0, QUAY_BACK], [-outline.hw, y0, QUAY_BACK], [-outline.hw, y1, QUAY_BACK], [outline.hw, y1, QUAY_BACK], colors.stone);
  }
  // The rear step: the body's own top behind the base.
  b.quad([-hw, QUAY_STEP_TOP, QUAY_BACK], [-hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_STEP_Z], [hw, QUAY_STEP_TOP, QUAY_BACK], colors.stone);
  // The base's exposed underside: a strip along the sea face and one down each side, facing down.
  const underside = (x0: number, x1: number, z0: number, z1: number) =>
    b.quad([x0, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z0], [x1, QUAY_STEP_TOP, z1], [x0, QUAY_STEP_TOP, z1], colors.stone);
  underside(-proud, proud, QUAY_SEA_FACE, WALL_FOOT);
  underside(-proud, -hw, QUAY_STEP_Z, QUAY_SEA_FACE);
  underside(hw, proud, QUAY_STEP_Z, QUAY_SEA_FACE);
  part("wall");

  // The blocks, each proud of its face's mortar plane and open at the back.
  for (const block of QUAY_WALL_BLOCKS) {
    if (block.missing) continue;
    const { hw: chw, front } = outlineOf(block.course);
    const map: (u: number, v: number, w: number) => Vec3 =
      block.face === "sea" ? (u, v, w) => [u, v, front + w] : block.face === "right" ? (u, v, w) => [chw + w, v, u] : (u, v, w) => [-chw - w, v, u];
    let tone = shadeRgb(colors.stone, block.tone);
    tone = [tone[0] * (1 + block.ochre), tone[1], tone[2] * (1 - block.ochre)];
    if (block.stained) tone = shadeRgb(tone, STAIN_SHADE);
    proudPolygon(b, blockOutline(block.u0, block.u1, block.v0, block.v1, block.chip, block.chipSize), block.proud, map, tone);
  }
  part("blocks");

  // The stair: slabs stacked open-bottomed on the one below, each a tread
  // longer than the one above; the lowest runs on down to the base. The top
  // slab's seaward end corner is chipped.
  const stair = QUAY_STAIR;
  let top = stair.topTread;
  let x1 = stair.x0;
  for (let j = 0; j < stair.steps; j++) {
    x1 += stair.treads[j];
    const bottom = j === stair.steps - 1 ? QUAY_BASE : top - stair.rises[j];
    const z1 = stair.back + stair.depth;
    const plan: Vec3[] =
      j === 0
        ? [
            [stair.x0, 0, stair.back],
            [stair.x0, 0, z1],
            [x1 - stair.chip, 0, z1],
            [x1, 0, z1 - stair.chip],
            [x1, 0, stair.back],
          ]
        : [
            [stair.x0, 0, stair.back],
            [stair.x0, 0, z1],
            [x1, 0, z1],
            [x1, 0, stair.back],
          ];
    const at = (y: number): Vec3[] => plan.map(([x, , z]) => [x, y, z]);
    b.prism(at(bottom), at(top), j % 2 === 0 ? colors.stone : shadeRgb(colors.stone, 0.9), { bottom: j === stair.steps - 1 });
    top -= stair.rises[j];
  }
  part("stair");

  // Shading over the body: occlusion, then the wet band.
  b.bakeAmbientOcclusion({
    groundHeight: AO_GROUND_HEIGHT,
    groundStrength: AO_GROUND_STRENGTH,
    overhangs: [{ y: QUAY_STEP_TOP, reach: AO_REACH, strength: AO_COPING_STRENGTH }],
    from: 0,
    to: b.vertexCount(),
  });
  b.tintColors(0, b.vertexCount(), ([, y]) => {
    const t = Math.max(0, Math.min(1, 1 - (y - SEA_LEVEL) / QUAY_WET_HEIGHT));
    return [lerpRange([1, WET_TINT[0]], t), lerpRange([1, WET_TINT[1]], t), lerpRange([1, WET_TINT[2]], t)];
  });

  // The base: square-edged, open underneath, its top the mortar the paving's joints show.
  const deckFrom = b.vertexCount();
  b.box([-proud, QUAY_STEP_TOP, QUAY_STEP_Z], [proud, QUAY_PAVING_FLOOR, WALL_FOOT], colors.stone, { bottom: false, top: false });
  b.quad([-proud, QUAY_PAVING_FLOOR, QUAY_STEP_Z], [-proud, QUAY_PAVING_FLOOR, WALL_FOOT], [proud, QUAY_PAVING_FLOOR, WALL_FOOT], [proud, QUAY_PAVING_FLOOR, QUAY_STEP_Z], colors.mortar);
  part("base");

  // The paving: each stone a box open at its foot whose top corners sit at their own heights.
  for (const s of QUAY_PAVING) {
    const [a, c, d, e] = s.corners;
    const bottom: Vec3[] = [
      [s.x0, QUAY_PAVING_FLOOR, s.z0],
      [s.x0, QUAY_PAVING_FLOOR, s.z1],
      [s.x1, QUAY_PAVING_FLOOR, s.z1],
      [s.x1, QUAY_PAVING_FLOOR, s.z0],
    ];
    const topRing: Vec3[] = [
      [s.x0, a, s.z0],
      [s.x0, c, s.z1],
      [s.x1, d, s.z1],
      [s.x1, e, s.z0],
    ];
    b.prism(bottom, topRing, shadeRgb(colors.stone, s.tone), { bottom: false });
  }
  part("paving");
  // Sand over the landward row, the damp patch, and salt-pale along the outer edge.
  b.tintColors(deckFrom, b.vertexCount(), ([x, y, z]) => {
    if (y < QUAY_PAVING_FLOOR - 1e-9) return [1, 1, 1];
    const drift = Math.max(0, Math.min(1, (QUAY_STEP_Z + QUAY_SAND_DRIFT - z) / QUAY_SAND_DRIFT)) * 0.6;
    const damp = 1 - (1 - QUAY_DAMP.shade) * Math.max(0, 1 - Math.hypot(x - QUAY_DAMP.x, z - QUAY_DAMP.z) / QUAY_DAMP.radius);
    const salt: Rgb = Math.abs(x) > proud - SALT_REACH || z > WALL_FOOT - SALT_REACH ? SALT_TINT : [1, 1, 1];
    const channel = (k: number) => (1 + (colors.sand[k] / colors.stone[k] - 1) * drift) * damp * salt[k];
    return [channel(0), channel(1), channel(2)];
  });

  // The posts: tapered octagons whose top ring is pushed over by the lean, open at the foot, worn dark at the base.
  for (const post of QUAY_BOLLARDS) {
    const postFrom = b.vertexCount();
    const shift = QUAY_BOLLARD.height * Math.tan(QUAY_BOLLARD.lean);
    const topY = QUAY_TOP + QUAY_BOLLARD.height;
    b.prism(
      octagon(post.x, QUAY_TOP, post.z, QUAY_BOLLARD.radius, POST_SEGMENTS),
      octagon(post.x + post.lean[0] * shift, topY, post.z + post.lean[1] * shift, QUAY_BOLLARD.topRadius, POST_SEGMENTS),
      colors.timber,
      { bottom: false }
    );
    b.tintColors(postFrom, b.vertexCount(), ([, y]) => {
      const worn = 1 - (1 - POST_WORN_SHADE) * Math.max(0, 1 - (y - QUAY_TOP) / POST_WORN_HEIGHT);
      return [worn, worn, worn];
    });
  }
  part("bollards");

  // The mooring ring: an iron torus hung flat against the upper course's sea face, on the block under it.
  const ringBlock = QUAY_WALL_BLOCKS.find((k) => k.face === "sea" && k.course === 0 && !k.missing && k.u0 <= QUAY_RING.x && k.u1 >= QUAY_RING.x);
  if (ringBlock) {
    const cx = (ringBlock.u0 + ringBlock.u1) / 2;
    const cy = (ringBlock.v0 + ringBlock.v1) / 2;
    const cz = outlineOf(0).front + ringBlock.proud + QUAY_RING.tube + QUAY_RING.clearance;
    const point = (i: number, k: number): Vec3 => {
      const phi = (2 * Math.PI * i) / RING_SEGMENTS;
      const theta = (2 * Math.PI * k) / RING_TUBE_SEGMENTS;
      const r = QUAY_RING.radius + QUAY_RING.tube * Math.cos(theta);
      return [cx + r * Math.cos(phi), cy + r * Math.sin(phi), cz + QUAY_RING.tube * Math.sin(theta)];
    };
    for (let i = 0; i < RING_SEGMENTS; i++) {
      for (let k = 0; k < RING_TUBE_SEGMENTS; k++) {
        b.quad(point(i, k), point(i + 1, k), point(i + 1, k + 1), point(i, k + 1), colors.iron);
      }
    }
  }
  part("ring");

  // The rope coil: a flat ring lathed open at its foot.
  const ropeFrom = b.vertexCount();
  const { outer, inner, height: rh } = QUAY_ROPE;
  b.lathe(
    [
      [outer, 0],
      [outer, rh * 0.6],
      [(outer + inner) / 2, rh],
      [inner, rh * 0.6],
      [inner, 0],
    ],
    ROPE_SEGMENTS,
    colors.rope
  );
  b.translate(ropeFrom, b.vertexCount(), [QUAY_ROPE.x, QUAY_TOP, QUAY_ROPE.z]);
  part("rope");

  // The crate: a bevelled box with an open foot, darkened with age, turned, then moved into place.
  const crateFrom = b.vertexCount();
  const h = QUAY_CRATE.size / 2;
  b.bevelledBox([-h, 0, -h], [h, QUAY_CRATE.size, h], CRATE_BEVEL, shadeRgb(colors.timber, CRATE_SHADE), { bottom: false });
  b.rotate(crateFrom, b.vertexCount(), "y", QUAY_CRATE.yaw);
  b.translate(crateFrom, b.vertexCount(), [QUAY_CRATE.x, QUAY_TOP, QUAY_CRATE.z]);
  part("crate");

  // The barrel: staves in alternating tones, two iron hoops, a flat top, open at its foot.
  const { radius: br, height: bh, x: bx, z: bz } = QUAY_BARREL;
  const barrelPoint = (i: number, k: number): Vec3 => {
    const phi = (2 * Math.PI * (k % BARREL_SEGMENTS)) / BARREL_SEGMENTS;
    const [r, y] = BARREL_PROFILE[i];
    return [bx + br * r * Math.cos(phi), QUAY_TOP + bh * y, bz - br * r * Math.sin(phi)];
  };
  for (let i = 0; i < BARREL_PROFILE.length - 1; i++) {
    for (let k = 0; k < BARREL_SEGMENTS; k++) {
      const tone = BARREL_HOOP_BANDS.includes(i) ? colors.iron : shadeRgb(colors.timber, BARREL_STAVE_SHADES[k % 2]);
      b.quad(barrelPoint(i, k), barrelPoint(i, k + 1), barrelPoint(i + 1, k + 1), barrelPoint(i + 1, k), tone);
    }
  }
  const lid = BARREL_PROFILE.length - 1;
  for (let k = 1; k < BARREL_SEGMENTS - 1; k++) b.triangle(barrelPoint(lid, 0), barrelPoint(lid, k), barrelPoint(lid, k + 1), shadeRgb(colors.timber, 0.85));
  part("barrel");

  b.jitterColors(COLOR_JITTER, JITTER_SEED);
  return { data: b.build(), parts };
}

/** Builds the quay at scale 1. Colours are linear RGB in [0, 1]. */
export const buildQuayGeometry = (colors: QuayColors): FacetGeometryData => buildQuayParts(colors).data;
