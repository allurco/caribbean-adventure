/**
 * The aged kit (issue #59): the surfaces every piece of the old settlement
 * is built from. Pure, no Three.js. A Spanish-Caribbean port that has stood
 * a century in salt air, still in the stylised mid-poly register: bold
 * silhouettes, flat facets, vertex colour only.
 *
 * - `wornPrism`: walls between two rings whose corners are cut by unequal
 *   amounts top and bottom, so no corner is a uniform chamfer; each main
 *   face is an irregular grid of cells (`panel`) a hash can darken into
 *   flaking patches.
 * - `tintGrime`: damp darkening over the lowest band of a wall.
 * - `streak`: the dark staining run under a window or an eave corner.
 * - `plankedDoor`, `shutteredWindow`: timber in alternating plank tones,
 *   near-black iron, shutters hanging a little open.
 * - `stoneCourses`: rough-cut blocks of unequal widths in wobbling courses,
 *   some proud, with chipped corners, over a dark mortar body.
 *
 * Everything here is built upright and axis-aligned; a piece leans as a
 * whole with `shear` at the end, which keeps every fixture on its wall.
 */
import type { FacetBuilder, Vec3 } from "./facetBuilder";
import { shadeRgb } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { seedOf, stream } from "./variationStream";

export interface AgedColors {
  wall: Rgb;
  roof: Rgb;
  timber: Rgb;
  stone: Rgb;
  iron: Rgb;
}

export type WallFace = "front" | "back" | "left" | "right";
/** Corner cuts in plan order: (−x,−z), (−x,+z), (+x,+z), (+x,−z). */
export type CornerCuts = readonly [number, number, number, number];

export interface WornRing {
  /** Half-size along x and z (square when equal). */
  hw: number;
  hd: number;
  y: number;
  cuts: CornerCuts;
}

export interface PanelOptions {
  cols: number;
  rows: number;
  /** A colour factor per cell; `face` is 0–3 in ring order (left, front, right, back). */
  cellTint?: (face: number, col: number, row: number) => number;
}

export interface WornPrismFaces {
  bottom?: boolean;
  top?: boolean;
}

/** Tan of the lean every aged wall gets (about 1.5°). */
export const AGED_LEAN = 0.026;
/** Corner cuts fall in this range (world units); a cut is a wear, not a chamfer. */
export const CORNER_CUT_RANGE: readonly [number, number] = [0.004, 0.012];
/** Fraction of a wall's height over which damp darkens it. */
export const GRIME_BAND = 0.2;
export const GRIME_STRENGTH = 0.3;
/** Fraction of wall cells that flake darker. */
export const FLAKE_FRACTION = 0.18;
export const FLAKE_SHADE = 0.9;
export const STREAK_SHADE = 0.72;
/** A second plank tone against the first. */
export const PLANK_ALT_SHADE = 0.82;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Four corner cuts hashed from a seed, each within CORNER_CUT_RANGE. */
export function wornCuts(seed: number): CornerCuts {
  const next = stream(seed);
  const cut = () => lerp(CORNER_CUT_RANGE[0], CORNER_CUT_RANGE[1], next());
  return [cut(), cut(), cut(), cut()];
}

/**
 * The eight points of a ring with its corners cut, counter-clockwise from
 * above as `box` orders its rings: left face, front, right, back; so the
 * even edges (0–1, 2–3, 4–5, 6–7) are the main faces and the odd ones the
 * corner facets.
 */
export function wornRingPoints({ hw, hd, y, cuts: [c0, c1, c2, c3] }: WornRing): Vec3[] {
  return [
    [-hw, y, -hd + c0],
    [-hw, y, hd - c1],
    [-hw + c1, y, hd],
    [hw - c2, y, hd],
    [hw, y, hd - c2],
    [hw, y, -hd + c3],
    [hw - c3, y, -hd],
    [-hw + c0, y, -hd],
  ];
}

/**
 * A planar quad `a b c d` (counter-clockwise from outside, `a` bottom-left)
 * as an irregular grid: the interior split lines are jittered, so the cells
 * are unequal, and each cell may take its own colour factor.
 */
export function panel(b: FacetBuilder, a: Vec3, bq: Vec3, c: Vec3, d: Vec3, options: PanelOptions, color: Rgb, seed: number, face = 0) {
  const next = stream(seed);
  const splits = (n: number) => {
    const s = [0];
    for (let i = 1; i < n; i++) s.push(i / n + ((next() * 2 - 1) * 0.3) / n);
    s.push(1);
    return s;
  };
  const us = splits(options.cols);
  const vs = splits(options.rows);
  const at = (u: number, v: number) => lerp3(lerp3(a, bq, u), lerp3(d, c, u), v);
  for (let j = 0; j < options.rows; j++) {
    for (let i = 0; i < options.cols; i++) {
      const k = options.cellTint?.(face, i, j) ?? 1;
      const cellColor = k === 1 ? color : shadeRgb(color, k);
      b.quad(at(us[i], vs[j]), at(us[i + 1], vs[j]), at(us[i + 1], vs[j + 1]), at(us[i], vs[j + 1]), cellColor);
    }
  }
}

/** A cell tint that flakes a fraction of cells darker, hashed per cell. */
export function flakingTint(seed: number, fraction = FLAKE_FRACTION, shade = FLAKE_SHADE) {
  return (face: number, col: number, row: number) => (stream(seedOf([face, col, row], seed))() < fraction ? shade : 1);
}

/**
 * Walls between two worn rings: four main faces (panelled when `panel` is
 * given) and four corner facets, each a planar trapezoid because a corner
 * takes the same cut on both of its edges. The rings may differ in size (a
 * tapering tower) and in cuts (worn unevenly).
 */
export function wornPrism(
  b: FacetBuilder,
  bottom: WornRing,
  top: WornRing,
  color: Rgb,
  options: { panel?: PanelOptions; faces?: WornPrismFaces; seed?: number } = {}
) {
  const lo = wornRingPoints(bottom);
  const hi = wornRingPoints(top);
  const seed = options.seed ?? 0;
  for (let k = 0; k < 8; k++) {
    const k1 = (k + 1) % 8;
    if (k % 2 === 0 && options.panel) panel(b, lo[k], lo[k1], hi[k1], hi[k], options.panel, color, seedOf([k], seed), k / 2);
    else b.quad(lo[k], lo[k1], hi[k1], hi[k], color);
  }
  if (options.faces?.top !== false) for (let k = 1; k < 7; k++) b.triangle(hi[0], hi[k], hi[k + 1], color);
  if (options.faces?.bottom !== false) for (let k = 1; k < 7; k++) b.triangle(lo[0], lo[k + 1], lo[k], color);
}

/**
 * Damp over the lowest `band` of height: the colours in `[from, to)` darken
 * towards the ground (and stay darkened below it), a little greener and
 * greyer than plain shade, like lime render that never quite dries.
 */
export function tintGrime(b: FacetBuilder, from: number, to: number, band: number, strength = GRIME_STRENGTH) {
  b.tintColors(from, to, ([, y]) => {
    const t = Math.min(1, Math.max(0, 1 - Math.max(0, y) / band));
    const s = strength * t;
    return [1 - s, 1 - s * 0.92, 1 - s * 1.05];
  });
}

/** The frame of a wall face of an axis-aligned body: a point for a position along it, and its outward normal. */
export interface FaceFrame {
  /** `s` runs along the face from its left end (seen from outside); `y` is height; the point lies on the wall plane. */
  at: (s: number, y: number) => Vec3;
  normal: Vec3;
}

/** The frame of one face of a box of half-sizes `hw`, `hd`: `s` is measured from the face's left end seen from outside. */
export function boxFace(face: WallFace, hw: number, hd: number): FaceFrame {
  switch (face) {
    case "front":
      return { at: (s, y) => [-hw + s, y, hd], normal: [0, 0, 1] };
    case "back":
      return { at: (s, y) => [hw - s, y, -hd], normal: [0, 0, -1] };
    case "right":
      return { at: (s, y) => [hw, y, hd - s], normal: [1, 0, 0] };
    case "left":
      return { at: (s, y) => [-hw, y, -hd + s], normal: [-1, 0, 0] };
  }
}

/** A quad on a face, `proud` of the wall plane, facing out: `s0 < s1` along the face, `y0 < y1` up. */
export function faceQuad(b: FacetBuilder, frame: FaceFrame, s0: number, s1: number, y0: number, y1: number, proud: number, color: Rgb) {
  const off = scale(frame.normal, proud);
  b.quad(add(frame.at(s0, y0), off), add(frame.at(s1, y0), off), add(frame.at(s1, y1), off), add(frame.at(s0, y1), off), color);
}

/**
 * An open-backed slab standing `proud` of a face: its front and four sides,
 * the back on the wall plane left out. Ten triangles.
 */
export function faceSlab(b: FacetBuilder, frame: FaceFrame, s0: number, s1: number, y0: number, y1: number, proud: number, color: Rgb) {
  const off = scale(frame.normal, proud);
  const back: Vec3[] = [frame.at(s0, y0), frame.at(s1, y0), frame.at(s1, y1), frame.at(s0, y1)];
  const front = back.map((p) => add(p, off));
  b.quad(front[0], front[1], front[2], front[3], color);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    // Each side is wound so it faces away from the slab's centre.
    b.quad(back[k], back[k1], front[k1], front[k], color);
  }
}

/**
 * The dark run of staining below a sill or an eave corner: a strip on the
 * wall plane, just proud of it, narrowing as it runs down.
 */
export function streak(b: FacetBuilder, frame: FaceFrame, s: number, top: number, length: number, halfWidth: number, color: Rgb) {
  const off = scale(frame.normal, 0.0012);
  const dark = shadeRgb(color, STREAK_SHADE);
  const a = add(frame.at(s - halfWidth * 0.5, top - length), off);
  const bq = add(frame.at(s + halfWidth * 0.5, top - length), off);
  const c = add(frame.at(s + halfWidth, top), off);
  const d = add(frame.at(s - halfWidth, top), off);
  b.quad(a, bq, c, d, dark);
}

export interface DoorSpec {
  /** Centre along the face. */
  s: number;
  halfWidth: number;
  height: number;
  proud: number;
}

/**
 * A door of vertical planks in alternating tones under a tapering lintel
 * beam, with an iron strap across it. Three planks, lintel, strap: 50 triangles.
 */
export function plankedDoor(b: FacetBuilder, frame: FaceFrame, door: DoorSpec, timber: Rgb, iron: Rgb) {
  const planks = 3;
  const width = door.halfWidth * 2;
  const gap = 0.0015;
  const plankWidth = (width - gap * (planks - 1)) / planks;
  for (let i = 0; i < planks; i++) {
    const s0 = door.s - door.halfWidth + i * (plankWidth + gap);
    const tone = i % 2 === 0 ? timber : shadeRgb(timber, PLANK_ALT_SHADE);
    faceSlab(b, frame, s0, s0 + plankWidth, 0, door.height, door.proud, tone);
  }
  // The lintel: deeper at its left end than its right, a beam that tapers.
  const lintelDepth = door.proud * 1.6;
  const lintelHeight = 0.012;
  const off = scale(frame.normal, 1);
  const l0 = door.s - door.halfWidth - 0.008;
  const l1 = door.s + door.halfWidth + 0.008;
  const y0 = door.height;
  const y1 = door.height + lintelHeight;
  const back: Vec3[] = [frame.at(l0, y0), frame.at(l1, y0), frame.at(l1, y1), frame.at(l0, y1)];
  const front: Vec3[] = [
    add(back[0], scale(off, lintelDepth)),
    add(back[1], scale(off, lintelDepth * 0.7)),
    add(back[2], scale(off, lintelDepth * 0.7)),
    add(back[3], scale(off, lintelDepth)),
  ];
  const lintel = shadeRgb(timber, 0.9);
  b.quad(front[0], front[1], front[2], front[3], lintel);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    b.quad(back[k], back[k1], front[k1], front[k], lintel);
  }
  // The iron strap: a thin band across the planks, a little above the middle.
  const strapY = door.height * 0.6;
  faceSlab(b, frame, door.s - door.halfWidth + 0.002, door.s + door.halfWidth - 0.006, strapY, strapY + 0.005, door.proud + 0.0015, iron);
}

export interface WindowSpec {
  s: number;
  halfWidth: number;
  bottom: number;
  top: number;
}

/** Triangles a `shutteredWindow` adds: opening 2, sill 10, two shutters of two planks 48, streak 2. */
export const SHUTTERED_WINDOW_TRIANGLES = 62;

/**
 * A window: a dark opening on the wall plane, a sill, and two plank shutters
 * on hinges at the jambs, one hanging a little open and one swung wide, plus
 * the staining run under the sill.
 */
export function shutteredWindow(b: FacetBuilder, frame: FaceFrame, w: WindowSpec, colors: AgedColors, seed: number) {
  const next = stream(seed);
  const opening = shadeRgb(colors.wall, 0.12);
  faceQuad(b, frame, w.s - w.halfWidth, w.s + w.halfWidth, w.bottom, w.top, 0.0008, opening);
  // The sill, standing out under the opening.
  faceSlab(b, frame, w.s - w.halfWidth - 0.004, w.s + w.halfWidth + 0.004, w.bottom - 0.006, w.bottom, 0.006, shadeRgb(colors.timber, 0.95));
  // Shutters: each is two planks, built flat against the wall just outside
  // the jamb, then swung about its hinge (the jamb edge) out from the wall.
  const shutterWidth = w.halfWidth * 0.95;
  const height = w.top - w.bottom;
  const thickness = 0.004;
  const angles = [0.1 + next() * 0.15, 0.45 + next() * 0.35];
  for (const side of [-1, 1] as const) {
    const hingeS = w.s + side * w.halfWidth;
    const angle = angles[side > 0 ? 1 : 0];
    const from = b.vertexCount();
    // Build in a local frame: the hinge on the y axis, the shutter along +x, its face on +z.
    const planks = 2;
    const plankWidth = (shutterWidth - 0.001) / planks;
    for (let i = 0; i < planks; i++) {
      const x0 = i * (plankWidth + 0.001);
      const tone = i % 2 === 0 ? shadeRgb(colors.timber, PLANK_ALT_SHADE) : colors.timber;
      // The left shutter is built behind the plane so that its mirroring brings its thickness out in front.
      const z0 = side > 0 ? 0 : -thickness;
      b.box([x0, 0, z0], [x0 + plankWidth, height, z0 + thickness], tone);
    }
    // Mirror for the left shutter so it swings the other way, then open it and set it on the hinge.
    if (side < 0) b.rotate(from, b.vertexCount(), "y", Math.PI);
    b.rotate(from, b.vertexCount(), "y", -side * angle);
    const hinge = add(frame.at(hingeS, w.bottom), scale(frame.normal, 0.002));
    b.translate(from, b.vertexCount(), hinge);
    // Carry the local +z (the wall normal) onto this face.
    alignToFace(b, from, b.vertexCount(), frame, hinge);
  }
  streak(b, frame, w.s, w.bottom - 0.006, (w.top - w.bottom) * 0.9, w.halfWidth * 0.7, colors.wall);
}

/**
 * Turns a range built for the front (+z) face about `pivot` so its +z
 * becomes `frame.normal`. The front face needs no turn.
 */
function alignToFace(b: FacetBuilder, from: number, to: number, frame: FaceFrame, pivot: Vec3) {
  const [nx, , nz] = frame.normal;
  const angle = Math.atan2(nx, nz);
  if (angle === 0) return;
  b.translate(from, to, scale(pivot, -1));
  b.rotate(from, to, "y", angle);
  b.translate(from, to, pivot);
}

export interface StoneFace {
  frame: FaceFrame;
  /** Width of the face along `s` at a height, and the cut at each end there. */
  widthAt: (y: number) => { left: number; right: number };
  y0: number;
  y1: number;
}

export interface StoneOptions {
  courseHeight: number;
  blockWidth: readonly [number, number];
  mortar: number;
  /** Fraction of blocks that stand clearly proud, with bevelled edges. */
  proudFraction: number;
  /** Fraction of blocks with a warm ochre cast. */
  ochreFraction: number;
}

export const STONE_DEFAULTS: StoneOptions = {
  courseHeight: 0.044,
  blockWidth: [0.04, 0.075],
  mortar: 0.004,
  proudFraction: 0.25,
  ochreFraction: 0.2,
};

const OCHRE: Rgb = [1.1, 1.0, 0.86];

/**
 * Rough-cut blocks over a face: courses whose lines wobble (each course's
 * ends are at different heights), blocks of unequal widths in running
 * bond, most a hair proud as a flat quad, a quarter standing further out
 * with bevelled, chipped edges. The body behind shows as the mortar.
 * Returns the number of blocks laid.
 */
export function stoneCourses(b: FacetBuilder, face: StoneFace, stone: Rgb, seed: number, options: StoneOptions = STONE_DEFAULTS): number {
  const next = stream(seed);
  let blocks = 0;
  let y = face.y0 + options.mortar;
  let course = 0;
  while (y + options.courseHeight * 0.6 < face.y1) {
    const h = options.courseHeight * (0.85 + next() * 0.3);
    const top = Math.min(y + h, face.y1 - options.mortar);
    // The course line wobbles: its two ends differ a little in height.
    const wobble = (next() * 2 - 1) * 0.004;
    const { left, right } = face.widthAt((y + top) / 2);
    const width = right - left;
    let s = left + (course % 2 === 1 ? options.blockWidth[0] * 0.5 : 0);
    while (s < right - options.blockWidth[0] * 0.5) {
      const w = Math.min(right - s, lerp(options.blockWidth[0], options.blockWidth[1], next()));
      const s0 = s + options.mortar / 2;
      const s1 = s + w - options.mortar / 2;
      const yb = y + options.mortar / 2 + wobble * ((s0 - left) / width - 0.5);
      const yt = top - options.mortar / 2 + wobble * ((s1 - left) / width - 0.5);
      let color = shadeRgb(stone, 0.86 + next() * 0.24);
      if (next() < options.ochreFraction) color = [Math.min(1, color[0] * OCHRE[0]), color[1] * OCHRE[1], color[2] * OCHRE[2]];
      if (next() < options.proudFraction) proudBlock(b, face.frame, s0, s1, yb, yt, 0.004 + next() * 0.003, color, next);
      else faceQuad(b, face.frame, s0, s1, yb, yt, 0.0015, color);
      blocks++;
      s += w;
    }
    y = top;
    course++;
  }
  return blocks;
}

/**
 * A block standing proud with bevelled edges: its face is inset from its
 * footprint on the wall, one corner chipped further than the others.
 */
function proudBlock(b: FacetBuilder, frame: FaceFrame, s0: number, s1: number, y0: number, y1: number, proud: number, color: Rgb, next: () => number) {
  const off = scale(frame.normal, proud);
  const chip = 0.003;
  const back: Vec3[] = [frame.at(s0, y0), frame.at(s1, y0), frame.at(s1, y1), frame.at(s0, y1)];
  const insets: [number, number][] = [
    [s0 + chip, y0 + chip],
    [s1 - chip, y0 + chip],
    [s1 - chip, y1 - chip],
    [s0 + chip, y1 - chip],
  ];
  const chipped = Math.floor(next() * 4);
  const extra = chip * 1.5;
  insets[chipped][0] += chipped === 0 || chipped === 3 ? extra : -extra;
  insets[chipped][1] += chipped < 2 ? extra : -extra;
  const front = insets.map(([s, y]) => add(frame.at(s, y), off));
  b.quad(front[0], front[1], front[2], front[3], color);
  const edge = shadeRgb(color, 0.9);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    b.quad(back[k], back[k1], front[k1], front[k], edge);
  }
}
