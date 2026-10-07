/**
 * The bastioned fort (#84 prototype): a small Spanish-Caribbean fort of the
 * late sixteenth century, our own authored model in the aged kit's register
 * (faceted, vertex colour only, weathered stone). Pure, no Three.js.
 *
 * In plan a square of curtain walls with an arrow-head bastion at each
 * corner (flanks square to the curtain, faces meeting at a point on the
 * diagonal), `FORT_REACH` from the centre to a bastion tip. The walls are
 * battered: they lean in from a footing to a rounded string course (the
 * cordón) at about three quarters of their height, then rise nearly
 * plumb to the terreplein, the flat fighting platform, which a low
 * breastwork and its merlons ring. Local +z is the sea front: four cannons
 * stand in its embrasures and the two seaward bastions carry a sentry box
 * (garita) each. The gate is in the landward curtain (−z), and inside it a
 * square keep stands at the back of the terreplein with the flagstaff on
 * it. The origin is at the ground contact; the footing carries on under
 * the ground by `FORT_FOOTING`.
 */
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { FORT_KEEP_TOP, FORT_REACH, FORT_TOP, FORT_WALL_HEIGHT } from "./portFort";

/** Curtain half-side, how far along the curtain each bastion's flank starts from the corner, and the flank's length. */
export const FORT_CURTAIN = 0.3;
const FLANK_AT = 0.09;
const FLANK = 0.06;
/** The bastion tip on the diagonal: FORT_REACH from the centre. */
const TIP = FORT_REACH / Math.SQRT2;
export const FORT_FOOTING = 0.05;
/** The wall's lean in to the cordón, the cordón's height, depth and how far it stands proud, and the upper wall's lean. */
const BATTER = 0.016;
const CORDON_Y = FORT_WALL_HEIGHT * 0.72;
const CORDON_DEPTH = 0.01;
const CORDON_PROUD = 0.007;
const UPPER_LEAN = 0.004;
/** The breastwork round the terreplein: height and thickness; the merlons over it, their length, the embrasures between them and their height. */
const BREASTWORK = 0.012;
const BREASTWORK_THICKNESS = 0.03;
const MERLON = 0.055;
const EMBRASURE = 0.03;
const MERLON_HEIGHT = 0.02;
/** The keep: half width and depth, how far back of the centre, and its top under its merlons. */
const KEEP_HALF = 0.075;
const KEEP_BACK = 0.12;
const KEEP_BODY_TOP = FORT_KEEP_TOP - MERLON_HEIGHT;
const STAFF = 0.004;
/** Where the flag's hoist is, on the staff's top, for `buildNationFlagGeometry`. */
export const FORT_FLAG_HOIST: Vec3 = [STAFF + 0.001, FORT_TOP - 0.004, -KEEP_BACK + KEEP_HALF - 0.02];
/** Triangle budget for the whole fort (one per fort port, so a few thousand is cheap). */
export const FORT_TRIANGLE_BUDGET = 2000;

export interface FortColors {
  stone: Rgb;
  cordon: Rgb;
  terreplein: Rgb;
  mortar: Rgb;
  timber: Rgb;
  iron: Rgb;
}

/** The outline at y = 0, in the prism winding (`facetBuilder.prism`): round the four bastions. */
export function fortOutline(): Vec3[] {
  const a = FORT_CURTAIN;
  const corner: [number, number][] = [
    [a, a - FLANK_AT],
    [a + FLANK, a - FLANK_AT],
    [TIP, TIP],
    [a - FLANK_AT, a + FLANK],
    [a - FLANK_AT, a],
  ];
  const points: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    for (const [x, z] of corner) {
      // Turn by k quarter turns: (x, z) → (−z, x).
      let px = x;
      let pz = z;
      for (let t = 0; t < k; t++) [px, pz] = [-pz, px];
      points.push([px, pz]);
    }
  }
  // The prism winding runs the other way round from increasing angle.
  return points.reverse().map(([x, z]) => [x, 0, z]);
}

/** The outline moved in (negative: out) by `inset` along each corner's mitre, at height `y`. */
function offsetRing(outline: readonly Vec3[], inset: number, y: number): Vec3[] {
  const n = outline.length;
  /** Edge p→q's outward normal in plan: (dz, −dx), turned by the winding's sign. */
  const normalOf = (p: Vec3, q: Vec3): [number, number] => {
    const dx = q[0] - p[0];
    const dz = q[2] - p[2];
    const len = Math.hypot(dx, dz);
    return [(WINDING_SIGN * dz) / len, (-WINDING_SIGN * dx) / len];
  };
  return outline.map((p, i) => {
    const prev = outline[(i + n - 1) % n];
    const next = outline[(i + 1) % n];
    const [n1x, n1z] = normalOf(prev, p);
    const [n2x, n2z] = normalOf(p, next);
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    mx /= ml;
    mz /= ml;
    const k = inset / (mx * n1x + mz * n1z);
    return [p[0] - mx * k, y, p[2] - mz * k];
  });
}

/** +1 if the prism winding's (dz, −dx) edge normal points out, else −1 (worked out once from a convex case). */
const WINDING_SIGN = (() => {
  const square: Vec3[] = [
    [-1, 0, -1],
    [-1, 0, 1],
    [1, 0, 1],
    [1, 0, -1],
  ];
  // Edge from (−1,−1) to (−1,1) is the −x side: its outward normal is −x.
  const dx = square[1][0] - square[0][0];
  const dz = square[1][2] - square[0][2];
  return dz / Math.hypot(dx, dz) < 0 ? 1 : -1;
})();

/** The fort's triangles in its local frame (origin at the ground contact, sea front +z). */
export function buildFortGeometry(colors: FortColors): FacetGeometryData {
  const b = createFacetBuilder();
  const outline = fortOutline();
  const n = outline.length;
  const H = FORT_WALL_HEIGHT;

  // The walls: a profile of rings from the footing up, each band joining one ring to the next.
  const profile: { y: number; inset: number; color: Rgb }[] = [
    { y: -FORT_FOOTING, inset: 0, color: colors.stone },
    { y: 0, inset: 0, color: colors.stone },
    { y: CORDON_Y, inset: BATTER, color: colors.stone },
    { y: CORDON_Y, inset: BATTER - CORDON_PROUD, color: colors.cordon },
    { y: CORDON_Y + CORDON_DEPTH, inset: BATTER - CORDON_PROUD, color: colors.cordon },
    { y: CORDON_Y + CORDON_DEPTH, inset: BATTER, color: colors.stone },
    { y: H + BREASTWORK, inset: BATTER + UPPER_LEAN, color: colors.stone },
    { y: H + BREASTWORK, inset: BATTER + UPPER_LEAN + BREASTWORK_THICKNESS, color: colors.stone },
    { y: H, inset: BATTER + UPPER_LEAN + BREASTWORK_THICKNESS, color: colors.stone },
  ];
  const rings = profile.map((r) => offsetRing(outline, r.inset, r.y));
  const wallsFrom = b.vertexCount();
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      b.quad(rings[r][k], rings[r][k1], rings[r + 1][k1], rings[r + 1][k], profile[r + 1].color);
    }
  }
  // The footing's underside, closed so no ray through the ground sees in.
  const base = rings[0];
  const under: Vec3 = [0, -FORT_FOOTING, 0];
  for (let k = 0; k < n; k++) b.triangle(under, base[(k + 1) % n], base[k], colors.stone);
  const wallsTo = b.vertexCount();
  // The terreplein: a fan from the centre over the innermost ring.
  const top = rings[rings.length - 1];
  const centre: Vec3 = [0, H, 0];
  for (let k = 0; k < n; k++) b.triangle(centre, top[k], top[(k + 1) % n], colors.terreplein);

  // Merlons along the breastwork, the embrasures between them; cannons in the sea front's.
  const breastOuter = rings[6];
  const cannonsAt: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let k = 0; k < n; k++) {
    const p = breastOuter[k];
    const q = breastOuter[(k + 1) % n];
    const dx = q[0] - p[0];
    const dz = q[2] - p[2];
    const len = Math.hypot(dx, dz);
    const tx = dx / len;
    const tz = dz / len;
    const nx = tz * WINDING_SIGN;
    const nz = -tx * WINDING_SIGN;
    const count = Math.max(1, Math.floor((len + EMBRASURE) / (MERLON + EMBRASURE)));
    const used = count * MERLON + (count - 1) * EMBRASURE;
    const start = (len - used) / 2;
    for (let m = 0; m < count; m++) {
      const s0 = start + m * (MERLON + EMBRASURE);
      const s1 = s0 + MERLON;
      const at = (s: number, inward: number, y: number): Vec3 => [p[0] + tx * s - nx * inward, y, p[2] + tz * s - nz * inward];
      const y0 = H + BREASTWORK;
      const y1 = y0 + MERLON_HEIGHT;
      const ring = (y: number): Vec3[] => [at(s0, 0, y), at(s1, 0, y), at(s1, BREASTWORK_THICKNESS, y), at(s0, BREASTWORK_THICKNESS, y)];
      const bottom = ring(y0);
      const topRing = ring(y1);
      // Each face outward from the merlon's own centre.
      const mc: Vec3 = [(bottom[0][0] + bottom[2][0]) / 2, (y0 + y1) / 2, (bottom[0][2] + bottom[2][2]) / 2];
      for (let e = 0; e < 4; e++) b.outwardQuad(bottom[e], bottom[(e + 1) % 4], topRing[(e + 1) % 4], topRing[e], mc, colors.stone);
      b.outwardQuad(topRing[0], topRing[1], topRing[2], topRing[3], mc, shadeRgb(colors.stone, 1.06));
      // A cannon in each embrasure of the sea front's curtain (the long edge facing +z).
      if (m < count - 1 && nz > 0.9 && len > 0.3) {
        const s = s1 + EMBRASURE / 2;
        cannonsAt.push({ x: p[0] + tx * s, z: p[2] + tz * s, nx, nz });
      }
    }
  }
  const merlonsTo = b.vertexCount();

  // Cannons: a timber carriage and an iron barrel run out through the embrasure.
  for (const c of cannonsAt.slice(0, 4)) {
    const from = b.vertexCount();
    b.box([-0.014, 0, -0.03], [0.014, 0.012, 0.012], colors.timber);
    b.box([-0.006, 0.01, -0.012], [0.006, 0.022, 0.055], colors.iron);
    const yaw = Math.atan2(c.nx, c.nz);
    b.rotate(from, b.vertexCount(), "y", yaw);
    b.translate(from, b.vertexCount(), [c.x - c.nx * (BREASTWORK_THICKNESS + 0.02), H, c.z - c.nz * (BREASTWORK_THICKNESS + 0.02)]);
  }

  // Garitas on the two seaward bastion tips: a stone drum under a domed cap.
  for (const sx of [1, -1]) {
    const from = b.vertexCount();
    b.lathe(
      [
        [0.022, 0],
        [0.022, 0.05],
        [0.022, 0.05],
        [0.03, 0.054],
        [0.03, 0.054],
        [0.024, 0.06],
        [0, 0.085],
      ],
      6,
      colors.stone
    );
    const inset = 0.07;
    b.translate(from, b.vertexCount(), [sx * (TIP - inset), H + BREASTWORK, TIP - inset]);
  }

  // The gate in the landward curtain: a stone surround, the dark doorway and its timber leaves.
  {
    const z = -FORT_CURTAIN - 0.004;
    b.box([-0.045, 0, z - 0.006], [0.045, 0.095, z + 0.03], colors.cordon);
    b.box([-0.03, 0, z - 0.009], [0.03, 0.07, z + 0.02], colors.mortar);
    b.box([-0.026, 0, z - 0.011], [-0.002, 0.064, z], colors.timber);
    b.box([0.002, 0, z - 0.011], [0.026, 0.064, z], shadeRgb(colors.timber, 0.85));
  }

  // The keep at the back of the terreplein, its merlons, and the flagstaff on it.
  const keepFrom = b.vertexCount();
  const kz0 = -KEEP_BACK - KEEP_HALF;
  const kz1 = -KEEP_BACK + KEEP_HALF;
  b.box([-KEEP_HALF, H, kz0], [KEEP_HALF, KEEP_BODY_TOP, kz1], colors.stone, { bottom: false });
  for (const [mx, mz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const cx = mx * (KEEP_HALF - 0.016);
    const cz = -KEEP_BACK + mz * (KEEP_HALF - 0.016);
    b.box([cx - 0.016, KEEP_BODY_TOP, cz - 0.016], [cx + 0.016, FORT_KEEP_TOP, cz + 0.016], colors.stone, { bottom: false });
  }
  b.box([-STAFF, KEEP_BODY_TOP, FORT_FLAG_HOIST[2] - STAFF], [STAFF, FORT_TOP, FORT_FLAG_HOIST[2] + STAFF], colors.timber);
  const keepTo = b.vertexCount();

  // Weathering: grime and damp at the foot, shade under the cordón, a little stone-to-stone jitter.
  b.tintColors(wallsFrom, wallsTo, (p) => {
    const t = Math.max(0, Math.min(1, p[1] / 0.04));
    const k = 0.72 + 0.28 * t;
    return [k, k * 0.98, k * 0.95];
  });
  b.bakeAmbientOcclusion({ groundHeight: 0.025, groundStrength: 0.3, overhangs: [{ y: CORDON_Y, reach: 0.02, strength: 0.25 }], from: wallsFrom, to: wallsTo });
  b.jitterColors(0.07, 0x6f2a9d41, wallsFrom, merlonsTo);
  b.jitterColors(0.05, 0x1c7e3b55, keepFrom, keepTo);
  return b.build();
}
