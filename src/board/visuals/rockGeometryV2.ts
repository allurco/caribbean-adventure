/**
 * The "notch up" rock for the fidelity probe (issue #59). Pure, no Three.js.
 *
 * Same silhouette family as `rockGeometry.ts` (its lattice, ellipsoid radii,
 * jitter and seeds, so each variant is recognisably the same boulder, slab
 * or spur), one step denser so the outline rounds off, and shaded a notch
 * up: the bulk takes smooth normals (edges sharper than the crease angle
 * stay hard, a few ridge lines), the crown fan keeps its facets so the top
 * reads as broken rock, ambient occlusion darkens the base and colour
 * jitter breaks up the flat tint. Colours start white, so `instanceColor`
 * still carries the rock's actual colour as it does for the faceted rock.
 *
 * Same local-space contract as the faceted rock: ground contact at the
 * origin, the widest ring at y = 0 and a squashed buried base below it.
 */
import { createFacetBuilder, type FacetGeometryData } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { rockBands, rockBottomCap, rockLattice, rockTopCap, ROCK_VARIANTS, type RockVariantSpec } from "./rockGeometry";

/** Triangles per variant, at most. */
export const ROCK_V2_TRIANGLE_BUDGET = 80;
/** Triangles each variant actually has (crown + bands + base). */
export const ROCK_V2_TRIANGLES: readonly number[] = [64, 72, 70];
/** Faces meeting at more than this stay hard: the rock's ridge lines. */
export const ROCK_V2_CREASE_DEG = 75;
/** Ground-contact darkening fades out over this share of the rock's height. */
export const ROCK_V2_AO_HEIGHT = 0.45;
export const ROCK_V2_AO_STRENGTH = 0.35;
export const ROCK_V2_CONCAVITY_STRENGTH = 0.5;
export const ROCK_V2_COLOR_JITTER = 0.08;

const WHITE: Rgb = [1, 1, 1];

/** The faceted variants' shapes, with more sides and rings so smooth shading has a round outline to work with. */
const DENSITY: readonly { sides: number; rings: number }[] = [
  { sides: 8, rings: 4 },
  { sides: 9, rings: 4 },
  { sides: 7, rings: 5 },
];

function specV2(index: number): RockVariantSpec {
  const n = ROCK_VARIANTS.length;
  const i = ((index % n) + n) % n;
  return { ...ROCK_VARIANTS[i], ...DENSITY[i] };
}

/** Builds one notch-up rock variant (`index` wraps round the variant count), world units at scale 1. */
export function buildRockGeometryV2(index: number): FacetGeometryData {
  const spec = specV2(index);
  const lattice = rockLattice(spec);
  const b = createFacetBuilder();
  const triangle = (p: [number, number, number], q: [number, number, number], r: [number, number, number]) => b.triangle(p, q, r, WHITE);

  rockTopCap(lattice, triangle);
  const bulkFrom = b.vertexCount();
  rockBands(lattice, triangle);
  rockBottomCap(lattice, triangle);
  b.smoothNormals(bulkFrom, b.vertexCount(), ROCK_V2_CREASE_DEG);

  b.jitterColors(ROCK_V2_COLOR_JITTER, spec.seed);
  b.bakeAmbientOcclusion({
    groundHeight: lattice.top[1] * ROCK_V2_AO_HEIGHT,
    groundStrength: ROCK_V2_AO_STRENGTH,
    concavityStrength: ROCK_V2_CONCAVITY_STRENGTH,
    centroid: [0, lattice.top[1] * 0.3, 0],
  });
  return b.build();
}
