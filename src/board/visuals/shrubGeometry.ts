/**
 * Low-poly shrub mesh data (issue #49). Pure, no Three.js.
 *
 * Two kinds of ground vegetation in the palms' faceted style, each in its own
 * local space with the ground contact on the origin and Y up, non-indexed so
 * every face is flat:
 *   bush  a cluster of overlapping faceted blobs on a short stem (GRASS cells)
 *   tuft  sparse spiky blades of dry grass splaying out of a low mound (SAND)
 *
 * Every vertex carries the same `palm` vec2 the palms use, so `injectPalmSway`
 * (palmSway.ts) displaces shrubs unchanged:
 *   x = sway weight, 0 at the base rising with height to SHRUB_MAX_SWAY
 *   y = crown mask, 0 throughout: the palm's crown twist and frond flutter do
 *       not apply, so a shrub only bends and wobbles with the trunk terms
 */
import { stream } from "./variationStream";

export type Rgb = readonly [number, number, number];

export type ShrubKind = "bush" | "tuft";

export const SHRUB_KINDS: readonly ShrubKind[] = ["bush", "tuft"];

export interface ShrubColors {
  /** The still base: the bush's stem, the tuft's mound of dry earth. */
  stem: Rgb;
  /** The swaying part: the bush's leaves, the tuft's blades. */
  foliage: Rgb;
}

export interface ShrubGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** vec2 per vertex: (sway weight, crown mask), the palms' attribute. */
  palm: Float32Array;
  vertexCount: number;
}

type Vec3 = [number, number, number];

/** Nominal height at scale 1 (world units; a palm trunk is 0.46). */
export const SHRUB_HEIGHT: Readonly<Record<ShrubKind, number>> = { bush: 0.18, tuft: 0.1 };
/** Radius of the ground footprint at scale 1, which every vertex stays inside. */
export const SHRUB_FOOTPRINT_RADIUS: Readonly<Record<ShrubKind, number>> = { bush: 0.13, tuft: 0.08 };
/**
 * Sway weight at the top. The shader bends by weight² × the palm amplitude,
 * so a bush top moves ~5% of its height and a blade tip ~15%: alive, not
 * whipping like a frond tip (weight 1).
 */
export const SHRUB_MAX_SWAY: Readonly<Record<ShrubKind, number>> = { bush: 0.5, tuft: 0.65 };
/** Triangles per kind, at most. */
export const SHRUB_TRIANGLE_BUDGET = 100;

const TAU = Math.PI * 2;

// Bush: a square stem and four blobs, [x, y, z, radius] at scale 1.
const BUSH_STEM_HEIGHT = 0.06;
const BUSH_STEM_RADIUS = 0.012;
const BUSH_BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.105, 0, 0.072],
  [0.052, 0.078, 0.02, 0.05],
  [-0.04, 0.082, 0.038, 0.048],
  [-0.012, 0.074, -0.052, 0.046],
];
const BLOB_SIDES = 5;
const BLOB_RINGS = 2;
const BLOB_JITTER = 0.12;
const BLOB_SEED = 0x3b7d;
/** Foliage shade at the ground and at the top (multiplies the foliage colour). */
const FOLIAGE_BASE_SHADE = 0.7;
const FOLIAGE_TOP_SHADE = 1.15;
/** Each blob is also shaded by its own factor so the cluster reads as several plants. */
const BLOB_SHADE_SPREAD = 0.08;

// Tuft: a low mound and splayed blades.
const MOUND_SIDES = 5;
const MOUND_RADIUS = 0.04;
const MOUND_HEIGHT = 0.012;
const BLADE_COUNT = 9;
const BLADE_ROOT_RADIUS: readonly [number, number] = [0.004, 0.016];
const BLADE_HALF_WIDTH = 0.008;
/** Blade tip height as a fraction of SHRUB_HEIGHT.tuft. */
const BLADE_HEIGHT_RANGE: readonly [number, number] = [0.65, 1.0];
/** How far a blade's midpoint and tip lean outward (world units at scale 1). */
const BLADE_MID_LEAN = 0.018;
const BLADE_TIP_LEAN = 0.05;
const BLADE_SEED = 0x6c15;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const shade = (c: Rgb, k: number): Rgb => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

interface Vertex {
  p: Vec3;
  sway: number;
  color: Rgb;
}

/** Collects flat-shaded triangles, skipping degenerate ones. */
function createBuilder() {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const palm: number[] = [];

  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const n = cross(sub(b.p, a.p), sub(c.p, a.p));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    for (const v of [a, b, c]) {
      positions.push(...v.p);
      normals.push(n[0] / len, n[1] / len, n[2] / len);
      colors.push(...v.color);
      palm.push(v.sway, 0);
    }
  };
  const quad = (a: Vertex, b: Vertex, c: Vertex, d: Vertex) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };
  const build = (): ShrubGeometryData => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    palm: new Float32Array(palm),
    vertexCount: positions.length / 3,
  });
  return { triangle, quad, build };
}

type Builder = ReturnType<typeof createBuilder>;

/** Sway weight by height: 0 on the ground, the kind's maximum at its nominal height and above. */
function swayAt(kind: ShrubKind, y: number): number {
  return SHRUB_MAX_SWAY[kind] * smoothstep(clamp01(y / SHRUB_HEIGHT[kind]));
}

/** Foliage colour by height: darker in the shade below, lighter at the top. */
function foliageAt(kind: ShrubKind, y: number, color: Rgb, extra = 1): Rgb {
  const t = clamp01(y / SHRUB_HEIGHT[kind]);
  return shade(color, (FOLIAGE_BASE_SHADE + (FOLIAGE_TOP_SHADE - FOLIAGE_BASE_SHADE) * t) * extra);
}

function addBushStem(b: Builder, color: Rgb) {
  const ring = (y: number, r: number): Vertex[] =>
    Array.from({ length: 4 }, (_, k) => {
      const a = Math.PI / 4 + (k / 4) * TAU;
      return { p: [Math.cos(a) * r, y, Math.sin(a) * r], sway: swayAt("bush", y), color };
    });
  const bottom = ring(0, BUSH_STEM_RADIUS);
  const top = ring(BUSH_STEM_HEIGHT, BUSH_STEM_RADIUS * 0.75);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    b.quad(bottom[k], top[k], top[k1], bottom[k1]);
  }
}

/** A jittered polar lattice of BLOB_SIDES × BLOB_RINGS plus two poles: 20 triangles. */
function addBlob(b: Builder, centre: Vec3, radius: number, next: () => number, color: Rgb) {
  const blobShade = 1 + (next() * 2 - 1) * BLOB_SHADE_SPREAD;
  const vertex = (theta: number, phi: number): Vertex => {
    const radial = radius * (1 + (next() * 2 - 1) * BLOB_JITTER);
    const p: Vec3 = [
      centre[0] + Math.sin(theta) * Math.cos(phi) * radial,
      centre[1] + Math.cos(theta) * radial,
      centre[2] + Math.sin(theta) * Math.sin(phi) * radial,
    ];
    return { p, sway: swayAt("bush", p[1]), color: foliageAt("bush", p[1], color, blobShade) };
  };
  const top = vertex(0, 0);
  const rings: Vertex[][] = [];
  for (let i = 0; i < BLOB_RINGS; i++) {
    const theta = (Math.PI * (i + 1)) / (BLOB_RINGS + 1);
    const step = TAU / BLOB_SIDES;
    const offset = (i % 2) * step * 0.5;
    rings.push(Array.from({ length: BLOB_SIDES }, (_, k) => vertex(theta, offset + k * step)));
  }
  const bottom = vertex(Math.PI, 0);

  // Azimuth increases clockwise seen from above (+x towards +z), so a face
  // is outward-wound when its ring vertices go in decreasing azimuth.
  const first = rings[0];
  for (let k = 0; k < BLOB_SIDES; k++) b.triangle(top, first[(k + 1) % BLOB_SIDES], first[k]);
  for (let i = 0; i < rings.length - 1; i++) {
    const upper = rings[i];
    const lower = rings[i + 1];
    for (let k = 0; k < BLOB_SIDES; k++) {
      const k1 = (k + 1) % BLOB_SIDES;
      // The lower ring is half a step round, so its k-th vertex sits between upper k and k+1.
      b.triangle(upper[k], upper[k1], lower[k]);
      b.triangle(upper[k1], lower[k1], lower[k]);
    }
  }
  const last = rings[rings.length - 1];
  for (let k = 0; k < BLOB_SIDES; k++) b.triangle(bottom, last[k], last[(k + 1) % BLOB_SIDES]);
}

function buildBush(colors: ShrubColors): ShrubGeometryData {
  const b = createBuilder();
  const next = stream(BLOB_SEED);
  addBushStem(b, colors.stem);
  for (const [x, y, z, radius] of BUSH_BLOBS) addBlob(b, [x, y, z], radius, next, colors.foliage);
  return b.build();
}

/** A low faceted cone of dry earth the blades grow out of. */
function addMound(b: Builder, next: () => number, color: Rgb) {
  const apex: Vertex = { p: [0, MOUND_HEIGHT, 0], sway: 0, color: shade(color, 1.05) };
  const rim: Vertex[] = Array.from({ length: MOUND_SIDES }, (_, k) => {
    const a = (k / MOUND_SIDES) * TAU + (next() * 2 - 1) * 0.2;
    const r = MOUND_RADIUS * (1 + (next() * 2 - 1) * 0.15);
    return { p: [Math.cos(a) * r, 0, Math.sin(a) * r], sway: 0, color };
  });
  for (let k = 0; k < MOUND_SIDES; k++) b.triangle(apex, rim[(k + 1) % MOUND_SIDES], rim[k]);
}

/**
 * One blade: a folded strip of three triangles from a two-vertex root on the
 * ground through a wider midpoint to a single tip, leaning outward as it rises.
 */
function addBlade(b: Builder, angle: number, next: () => number, color: Rgb) {
  const dir: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
  const side: Vec3 = [-dir[2], 0, dir[0]];
  const root = BLADE_ROOT_RADIUS[0] + next() * (BLADE_ROOT_RADIUS[1] - BLADE_ROOT_RADIUS[0]);
  const height = SHRUB_HEIGHT.tuft * (BLADE_HEIGHT_RANGE[0] + next() * (BLADE_HEIGHT_RANGE[1] - BLADE_HEIGHT_RANGE[0]));
  const lean = 0.8 + next() * 0.4;
  const at = (along: number, y: number, s: number): Vertex => {
    const p: Vec3 = [dir[0] * along + side[0] * s, y, dir[2] * along + side[2] * s];
    return { p, sway: swayAt("tuft", y), color: foliageAt("tuft", y, color) };
  };
  const rootL = at(root, 0, -BLADE_HALF_WIDTH);
  const rootR = at(root, 0, BLADE_HALF_WIDTH);
  const midAlong = root + BLADE_MID_LEAN * lean;
  const midL = at(midAlong, height * 0.5, -BLADE_HALF_WIDTH * 1.2);
  const midR = at(midAlong, height * 0.5, BLADE_HALF_WIDTH * 1.2);
  const tip = at(root + BLADE_TIP_LEAN * lean, height, 0);
  b.quad(rootL, rootR, midR, midL);
  b.triangle(midL, midR, tip);
}

function buildTuft(colors: ShrubColors): ShrubGeometryData {
  const b = createBuilder();
  const next = stream(BLADE_SEED);
  addMound(b, next, colors.stem);
  for (let k = 0; k < BLADE_COUNT; k++) {
    const angle = (k / BLADE_COUNT) * TAU + (next() * 2 - 1) * (TAU / BLADE_COUNT) * 0.35;
    addBlade(b, angle, next, colors.foliage);
  }
  return b.build();
}

/** Builds one shrub kind's triangles. Colours are linear RGB in [0, 1]. */
export function buildShrubGeometry(kind: ShrubKind, colors: ShrubColors): ShrubGeometryData {
  return kind === "bush" ? buildBush(colors) : buildTuft(colors);
}
