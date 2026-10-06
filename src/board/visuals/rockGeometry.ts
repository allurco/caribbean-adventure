/**
 * Low-poly rock mesh data (issue #49). Pure, no Three.js.
 *
 * Each variant is a jittered polar lattice: `rings` rings of `sides` vertices
 * between a top and a bottom pole, every vertex pushed in or out radially and
 * nudged round its ring by a seeded stream, then stretched to the variant's
 * ellipsoid radii. Triangles are non-indexed with face normals, so every
 * facet is flat, which matches the palms and the terrain.
 *
 * Local space: Y up, the ground contact at the origin. The widest ring sits
 * at y = 0 and the underside below it is squashed to a shallow base, so the
 * rock's belly is buried: placed on a slope it sinks in rather than floating
 * on the low side.
 */
import { stream } from "./variationStream";

export interface RockGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  vertexCount: number;
}

type Vec3 = [number, number, number];

/**
 * Rock radius in world units at scale 1 (matches `ROCK_RADIUS` in the layout).
 * 0.22 is about a palm canopy's radius; at the old 0.12 the rocks could not
 * be found at ship zoom.
 */
export const ROCK_UNIT_RADIUS = 0.22;
export const ROCK_VARIANT_COUNT = 3;
/** Triangles per variant, at most. */
export const ROCK_TRIANGLE_BUDGET = 80;
/** The underside (y < 0) is squashed to this fraction of the top's height. */
export const ROCK_UNDERSIDE_SQUASH = 0.45;

export interface RockVariantSpec {
  sides: number;
  rings: number;
  /** Ellipsoid radii as multiples of `ROCK_UNIT_RADIUS`: [x, y, z]. */
  radii: Vec3;
  /** Radial jitter, as a fraction of the radius (±). */
  jitter: number;
  /** Angular jitter, as a fraction of the ring step (±). */
  twist: number;
  seed: number;
}

/** Three silhouettes: a rounded boulder, a long low slab and a tall angular spur. */
export const ROCK_VARIANTS: readonly RockVariantSpec[] = [
  { sides: 6, rings: 3, radii: [1.0, 0.85, 0.9], jitter: 0.22, twist: 0.3, seed: 0x5a11 }, // 36 triangles
  { sides: 7, rings: 3, radii: [1.3, 0.65, 0.85], jitter: 0.18, twist: 0.25, seed: 0x2bd7 }, // 42 triangles
  { sides: 5, rings: 4, radii: [0.85, 1.15, 0.8], jitter: 0.26, twist: 0.3, seed: 0x7e39 }, // 40 triangles
];

/** A variant's jittered lattice: the two poles and the rings between them, top down. */
export interface RockLattice {
  top: Vec3;
  rings: Vec3[][];
  bottom: Vec3;
}

export type TriangleSink = (a: Vec3, b: Vec3, c: Vec3) => void;

/**
 * A variant's ellipsoid radii as multiples of `ROCK_UNIT_RADIUS`: [x, y, z].
 * The jitter moves single vertices in or out of these; the placement uses
 * them as the rock's nominal extent.
 */
export function rockVariantRadii(index: number): readonly [number, number, number] {
  return rockVariantSpec(index).radii;
}

/** The largest horizontal radius multiple over all variants (the slab's long axis). */
export const ROCK_VARIANT_MAX_RADIUS_XZ = Math.max(...ROCK_VARIANTS.map((v) => Math.max(v.radii[0], v.radii[2])));

/** How far a variant can reach from its origin at scale 1, world units: the farthest any vertex lies horizontally, and the highest any rises. */
export interface RockReach {
  horizontal: number;
  top: number;
}

/**
 * Per variant, a bound on the drawn extent at scale 1 (world units): the
 * ellipsoid radii pushed out by the widest radial jitter. Placement rules that
 * must keep a rock's rim clear of something (the shore boulders' offshore cap,
 * #49) scale these by the instance's scale instead of probing the mesh.
 */
export const ROCK_VARIANT_REACH: readonly RockReach[] = ROCK_VARIANTS.map((v) => ({
  horizontal: ROCK_UNIT_RADIUS * Math.max(v.radii[0], v.radii[2]) * (1 + v.jitter),
  top: ROCK_UNIT_RADIUS * v.radii[1] * (1 + v.jitter),
}));

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Collects flat-shaded triangles, skipping degenerate ones. */
function createBuilder() {
  const positions: number[] = [];
  const normals: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => {
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    for (const p of [a, b, c]) {
      positions.push(...p);
      normals.push(n[0] / len, n[1] / len, n[2] / len);
    }
  };
  const build = (): RockGeometryData => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    vertexCount: positions.length / 3,
  });
  return { triangle, build };
}

/** The lattice's rings from the top down, each a loop of `sides` points, plus the two poles. */
export function rockLattice(spec: RockVariantSpec): RockLattice {
  const next = stream(spec.seed);
  const [rx, ry, rz] = spec.radii.map((r) => r * ROCK_UNIT_RADIUS);
  const point = (theta: number, phi: number, radial: number): Vec3 => {
    const y = Math.cos(theta) * ry * radial;
    return [
      Math.sin(theta) * Math.cos(phi) * rx * radial,
      y < 0 ? y * ROCK_UNDERSIDE_SQUASH : y,
      Math.sin(theta) * Math.sin(phi) * rz * radial,
    ];
  };
  // Rings near the poles are small, so the same radial jitter would fold
  // their band faces; it tapers towards the poles.
  const jitter = (theta: number) => 1 + (next() * 2 - 1) * spec.jitter * (0.4 + 0.6 * Math.sin(theta));

  const top = point(0, 0, jitter(0));
  const rings: Vec3[][] = [];
  for (let i = 0; i < spec.rings; i++) {
    const theta = (Math.PI * (i + 1)) / (spec.rings + 1);
    const step = (Math.PI * 2) / spec.sides;
    // Alternate rings start half a step round so the band triangles don't line up.
    const offset = (i % 2) * step * 0.5;
    const ring: Vec3[] = [];
    for (let k = 0; k < spec.sides; k++) {
      const phi = offset + k * step + (next() * 2 - 1) * spec.twist * step;
      ring.push(point(theta, phi, jitter(theta)));
    }
    rings.push(ring);
  }
  const bottom = point(Math.PI, 0, jitter(Math.PI));
  return { top, rings, bottom };
}

/**
 * The crown: a fan from the top pole to the first ring. Azimuth increases
 * clockwise seen from above (+x towards +z), so a face is outward-wound
 * when its ring vertices go in decreasing azimuth.
 */
export function rockTopCap({ top, rings }: RockLattice, triangle: TriangleSink) {
  const first = rings[0];
  const sides = first.length;
  for (let k = 0; k < sides; k++) triangle(top, first[(k + 1) % sides], first[k]);
}

/**
 * The bands zigzag between the half-step-offset rings: on an even band the
 * lower ring's k-th vertex sits between the upper ring's k and k+1, on an
 * odd band it is the upper vertex that sits between the lower pair.
 */
export function rockBands({ rings }: RockLattice, triangle: TriangleSink) {
  const sides = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const upper = rings[i];
    const lower = rings[i + 1];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      if (i % 2 === 0) {
        triangle(upper[k], upper[k1], lower[k]);
        triangle(upper[k1], lower[k1], lower[k]);
      } else {
        triangle(upper[k], lower[k1], lower[k]);
        triangle(upper[k], upper[k1], lower[k1]);
      }
    }
  }
}

/** The buried base: a fan from the last ring to the bottom pole. */
export function rockBottomCap({ rings, bottom }: RockLattice, triangle: TriangleSink) {
  const last = rings[rings.length - 1];
  const sides = last.length;
  for (let k = 0; k < sides; k++) triangle(bottom, last[k], last[(k + 1) % sides]);
}

/** The variant spec for an index, wrapped round the variant count. */
export function rockVariantSpec(index: number): RockVariantSpec {
  return ROCK_VARIANTS[((index % ROCK_VARIANT_COUNT) + ROCK_VARIANT_COUNT) % ROCK_VARIANT_COUNT];
}

/**
 * Builds one rock variant's triangles (`index` wraps round the variant
 * count). Positions are in world units at scale 1.
 */
export function buildRockGeometry(index: number): RockGeometryData {
  const lattice = rockLattice(rockVariantSpec(index));
  const b = createBuilder();
  rockTopCap(lattice, b.triangle);
  rockBands(lattice, b.triangle);
  rockBottomCap(lattice, b.triangle);
  return b.build();
}
