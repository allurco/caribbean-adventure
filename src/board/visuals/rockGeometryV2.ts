/**
 * The "notch up" rock for the fidelity probe (issue #59). Pure, no Three.js.
 *
 * Same silhouette family as `rockGeometry.ts` (its lattice, ellipsoid radii,
 * twist and seeds, so each variant is recognisably the same boulder, slab
 * or spur), about twice as dense so the outline rounds off, and shaded a
 * notch up: smooth normals everywhere except across edges sharper than the
 * crease angle, which stay hard as ridge lines, ambient occlusion darkens
 * the base and colour jitter breaks up the flat tint. Colours start white,
 * so `instanceColor` still carries the rock's actual colour as it does for
 * the faceted rock.
 *
 * The faceted rock's per-vertex radial jitter is a slope: ±22% between
 * vertices 60° apart. Kept as is on a ring twice as fine it tilts band
 * faces to near vertical and folds them (seen as a tall dark facet), so it
 * is scaled down with the ring step and the lumpiness comes instead from a
 * couple of low, seeded bumps round the rock that every ring shares.
 *
 * Same local-space contract as the faceted rock: ground contact at the
 * origin, the widest ring at y = 0 and a squashed buried base below it.
 */
import { createFacetBuilder, type FacetGeometryData } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { rockBands, rockBottomCap, rockLattice, rockTopCap, ROCK_VARIANTS, type RockLattice, type RockVariantSpec } from "./rockGeometry";
import { stream } from "./variationStream";

/** Triangles per variant, at most (the faceted rock's budget is 80). */
export const ROCK_V2_TRIANGLE_BUDGET = 160;
/** Triangles each variant actually has (crown + bands + base). */
export const ROCK_V2_TRIANGLES: readonly number[] = [120, 130, 154];
/** Faces meeting at more than this stay hard: the rock's ridge lines. */
export const ROCK_V2_CREASE_DEG = 35;
/** Ground-contact darkening fades out over this share of the rock's height. */
export const ROCK_V2_AO_HEIGHT = 0.45;
export const ROCK_V2_AO_STRENGTH = 0.35;
export const ROCK_V2_CONCAVITY_STRENGTH = 0.5;
export const ROCK_V2_COLOR_JITTER = 0.08;
/** Amplitudes of the two-lobed and three-lobed bumps round the rock, as fractions of the radius. */
export const ROCK_V2_BUMPS: readonly [number, number] = [0.06, 0.04];

const WHITE: Rgb = [1, 1, 1];

/**
 * The faceted variants' shapes at about twice the sides and rings (odd ring
 * counts keep a ring on the equator, the widest, at y = 0). Smooth normals
 * interpolate the shading across each facet, and on the faceted rock's
 * 6×3 lattice a facet spans 60° of the surface, so the result was dark
 * wedges rather than a round boulder (tried at 8×4 first: the same, a
 * little smaller). Around 120–150 triangles the interpolation reads as a
 * surface.
 */
const DENSITY: readonly { sides: number; rings: number }[] = [
  { sides: 12, rings: 5 },
  { sides: 13, rings: 5 },
  { sides: 11, rings: 7 },
];

function specV2(index: number): RockVariantSpec {
  const n = ROCK_VARIANTS.length;
  const i = ((index % n) + n) % n;
  const base = ROCK_VARIANTS[i];
  // The same surface slope as the faceted rock: jitter per unit of ring step.
  return { ...base, ...DENSITY[i], jitter: (base.jitter * base.sides) / DENSITY[i].sides };
}

/** Scales every lattice point's plan radius by two low harmonics round the rock, phased from the seed. */
function addBumps(lattice: RockLattice, seed: number): RockLattice {
  const next = stream(seed ^ 0x6b75);
  const phase2 = next() * Math.PI * 2;
  const phase3 = next() * Math.PI * 2;
  const bump = ([x, y, z]: [number, number, number]): [number, number, number] => {
    const phi = Math.atan2(z, x);
    const f = 1 + ROCK_V2_BUMPS[0] * Math.cos(2 * phi - phase2) + ROCK_V2_BUMPS[1] * Math.cos(3 * phi - phase3);
    return [x * f, y, z * f];
  };
  return { top: bump(lattice.top), rings: lattice.rings.map((ring) => ring.map(bump)), bottom: bump(lattice.bottom) };
}

/** Builds one notch-up rock variant (`index` wraps round the variant count), world units at scale 1. */
export function buildRockGeometryV2(index: number): FacetGeometryData {
  const spec = specV2(index);
  const lattice = addBumps(rockLattice(spec), spec.seed);
  const b = createFacetBuilder();
  const triangle = (p: [number, number, number], q: [number, number, number], r: [number, number, number]) => b.triangle(p, q, r, WHITE);

  rockTopCap(lattice, triangle);
  rockBands(lattice, triangle);
  rockBottomCap(lattice, triangle);
  b.smoothNormals(0, b.vertexCount(), ROCK_V2_CREASE_DEG);

  b.jitterColors(ROCK_V2_COLOR_JITTER, spec.seed);
  b.bakeAmbientOcclusion({
    groundHeight: lattice.top[1] * ROCK_V2_AO_HEIGHT,
    groundStrength: ROCK_V2_AO_STRENGTH,
    concavityStrength: ROCK_V2_CONCAVITY_STRENGTH,
    centroid: [0, lattice.top[1] * 0.3, 0],
  });
  return b.build();
}
