/**
 * The aged gable roof (issue #59). Pure, no Three.js.
 *
 * Two thick slabs meeting at a ridge, as the notch-up house has, under rows
 * of raised terracotta strips running from ridge to eave (the cover tiles
 * of a Spanish roof; the slab top between them is the darker channel).
 * The strips are unequal in length, so the eave line is uneven, and a few
 * have slipped down the slope. A ridge cap runs along the top and sags in
 * the middle. One slope is moss-dark, the other salt-pale.
 *
 * Built with the ridge along z (the slope runs along ±x) and turned about
 * y at the end for a ridge along x. The slabs' undersides meet the walls
 * at `roofEaveUnderside` and their inner faces meet at `roofGableApex`;
 * the walls and gables stop there (see `agedBuildingGeometry.ts`).
 */
import type { FacetBuilder, Vec3 } from "./facetBuilder";
import { shadeRgb } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { stream } from "./variationStream";

export interface AgedRoofSpec {
  /** Half the span across the slope in plan (ridge to eave), without the overhang. */
  halfU: number;
  /** Half the length along the ridge, without the overhang. */
  halfV: number;
  eave: number;
  ridge: number;
  ridgeAlong: "x" | "z";
}

export const AGED_ROOF_THICKNESS = 0.02;
export const AGED_ROOF_OVERHANG = 0.025;
/** Strips along the ridge at about this pitch; a strip is this fraction of it wide. */
export const TILE_PITCH = 0.021;
export const TILE_WIDTH_FRACTION = 0.6;
export const TILE_THICKNESS = 0.006;
/** Strips overshoot the slab's eave edge by up to this (uneven eaves). */
export const TILE_OVERSHOOT = 0.01;
/** Slipped strips sit this far further down the slope. */
export const TILE_SLIP = 0.012;
export const SLIPPED_TILES_PER_SLOPE = 2;
export const RIDGE_SAG = 0.006;
export const RIDGE_CAP_HALF_WIDTH = 0.022;
export const RIDGE_CAP_RISE = 0.008;
const RIDGE_CAP_SEGMENTS = 4;
/** The channel between strips is the slab top, in shade. */
export const CHANNEL_SHADE = 0.78;
export const CAP_SHADE = 0.85;
/** The shade side goes mossy, the sun side bleaches. */
export const MOSS_TINT: Rgb = [0.8, 0.86, 0.72];
export const SUN_TINT: Rgb = [1.1, 1.06, 1.0];

export const roofSlope = (s: AgedRoofSpec) => (s.ridge - s.eave) / s.halfU;
export const roofPitch = (s: AgedRoofSpec) => Math.atan(roofSlope(s));
/** The slab's thickness measured vertically. */
export const roofSlabDrop = (s: AgedRoofSpec) => AGED_ROOF_THICKNESS / Math.cos(roofPitch(s));
/** Where the slab undersides meet the walls. */
export const roofEaveUnderside = (s: AgedRoofSpec) => s.eave - roofSlabDrop(s);
/** Where the slabs' inner faces meet, the top of a gable. */
export const roofGableApex = (s: AgedRoofSpec) => s.ridge - roofSlabDrop(s);
/** The ridge cap's top at the ends, the roof's highest point. */
export const roofTop = (s: AgedRoofSpec) => s.ridge + RIDGE_CAP_RISE;
/** Strips per slope. */
export const tileStripCount = (s: AgedRoofSpec) => Math.max(3, Math.round((2 * (s.halfV + AGED_ROOF_OVERHANG)) / TILE_PITCH));
/**
 * Farthest the roof reaches from the ridge's foot in plan: the overhang,
 * plus the longest slipped and overshooting strip, whose top outer corner
 * leans out by its thickness on the pitch.
 */
export const roofReachU = (s: AgedRoofSpec) =>
  s.halfU + AGED_ROOF_OVERHANG + (TILE_OVERSHOOT + TILE_SLIP) * Math.cos(roofPitch(s)) + TILE_THICKNESS * Math.sin(roofPitch(s));
/** Slabs 2 × 12, strips 10 each, cap segments 6 each plus two ends, two wedge caps. */
export const agedRoofTriangles = (s: AgedRoofSpec) => 24 + tileStripCount(s) * 10 * 2 + RIDGE_CAP_SEGMENTS * 6 + 2 + 2;

/** Each slab starts this far along its own top from the ridge, so its inner bottom corner lies on the midline. */
const slabStart = (s: AgedRoofSpec) => AGED_ROOF_THICKNESS * Math.tan(roofPitch(s));

function addSlope(b: FacetBuilder, s: AgedRoofSpec, side: -1 | 1, roof: Rgb, seed: number) {
  const next = stream(seed);
  const pitch = roofPitch(s);
  const ue = s.halfU + AGED_ROOF_OVERHANG;
  const ye = s.eave - AGED_ROOF_OVERHANG * roofSlope(s);
  const length = Math.hypot(ue, s.ridge - ye);
  const halfV = s.halfV + AGED_ROOF_OVERHANG;
  const start = slabStart(s);
  const from = b.vertexCount();
  // The slab, lying flat: x out from the ridge, y down through its thickness, z along the ridge.
  const slabMin: Vec3 = [side > 0 ? start : -length, -AGED_ROOF_THICKNESS, -halfV];
  const slabMax: Vec3 = [side > 0 ? length : -start, 0, halfV];
  b.box(slabMin, slabMax, shadeRgb(roof, CHANNEL_SHADE));
  // Strips along the ridge, on the slab's top.
  const count = tileStripCount(s);
  const pitchV = (2 * halfV) / count;
  const width = pitchV * TILE_WIDTH_FRACTION;
  const slipped = new Set<number>();
  while (slipped.size < Math.min(SLIPPED_TILES_PER_SLOPE, count)) slipped.add(Math.floor(next() * count));
  for (let i = 0; i < count; i++) {
    const zc = -halfV + (i + 0.5) * pitchV;
    const slip = slipped.has(i) ? TILE_SLIP : 0;
    const inner = start + 0.004 + slip;
    const outer = length + next() * TILE_OVERSHOOT + slip;
    const tone = (i % 2 === 0 ? 0.92 : 1.04) * (1 + (next() * 2 - 1) * 0.06);
    const color = shadeRgb(roof, tone);
    const min: Vec3 = [side > 0 ? inner : -outer, 0, zc - width / 2];
    const max: Vec3 = [side > 0 ? outer : -inner, TILE_THICKNESS, zc + width / 2];
    b.box(min, max, color, { bottom: false });
  }
  b.rotate(from, b.vertexCount(), "z", -side * pitch);
  b.translate(from, b.vertexCount(), [0, s.ridge, 0]);
}

/** The cap's cross-section at `z`: base corners either side of the ridge and the crest, dropped by the sag there. */
function capRing(s: AgedRoofSpec, z: number, halfV: number): Vec3[] {
  const sag = RIDGE_SAG * (1 - (z / halfV) ** 2);
  const base = s.ridge - RIDGE_CAP_HALF_WIDTH * roofSlope(s) - 0.002 - sag;
  const crest = s.ridge + RIDGE_CAP_RISE - sag;
  return [
    [-RIDGE_CAP_HALF_WIDTH, base, z],
    [RIDGE_CAP_HALF_WIDTH, base, z],
    [0, crest, z],
  ];
}

function addRidgeCap(b: FacetBuilder, s: AgedRoofSpec, color: Rgb) {
  const halfV = s.halfV + AGED_ROOF_OVERHANG;
  const centreOf = (ring: Vec3[]): Vec3 => [0, (ring[0][1] + ring[2][1]) / 2, ring[0][2]];
  for (let k = 0; k < RIDGE_CAP_SEGMENTS; k++) {
    const z0 = -halfV + (2 * halfV * k) / RIDGE_CAP_SEGMENTS;
    const z1 = -halfV + (2 * halfV * (k + 1)) / RIDGE_CAP_SEGMENTS;
    const r0 = capRing(s, z0, halfV);
    const r1 = capRing(s, z1, halfV);
    const c0 = centreOf(r0);
    const c1 = centreOf(r1);
    const centre: Vec3 = [0, (c0[1] + c1[1]) / 2, (z0 + z1) / 2];
    for (let i = 0; i < 3; i++) {
      const i1 = (i + 1) % 3;
      b.outwardQuad(r0[i], r0[i1], r1[i1], r1[i], centre, color);
    }
    if (k === 0) b.outwardTriangle(r0[0], r0[1], r0[2], centre, color);
    if (k === RIDGE_CAP_SEGMENTS - 1) b.outwardTriangle(r1[0], r1[1], r1[2], centre, color);
  }
  // Between the slabs' inner faces under the cap is a wedge of air; a triangle at each end closes it.
  const apex = roofGableApex(s);
  const base = capRing(s, halfV, halfV)[0][1];
  const w = (base - apex) * Math.tan(roofPitch(s));
  for (const z of [-halfV, halfV]) {
    const centre: Vec3 = [0, (apex + base) / 2, 0];
    b.outwardTriangle([0, apex, z], [w, base, z], [-w, base, z], centre, color);
  }
}

/**
 * Adds the roof and returns the vertex range it occupies. Colours are
 * linear RGB in [0, 1]; the moss and sun tints are applied here.
 */
export function addAgedRoof(b: FacetBuilder, s: AgedRoofSpec, roof: Rgb, seed: number): { from: number; to: number } {
  const from = b.vertexCount();
  addSlope(b, s, -1, roof, seed ^ 0x51);
  addSlope(b, s, 1, roof, seed ^ 0x9c);
  addRidgeCap(b, s, shadeRgb(roof, CAP_SHADE));
  const to = b.vertexCount();
  b.tintColors(from, to, ([x]) => (x < -0.004 ? MOSS_TINT : x > 0.004 ? SUN_TINT : [1, 1, 1]));
  if (s.ridgeAlong === "x") b.rotate(from, to, "y", Math.PI / 2);
  return { from, to };
}
