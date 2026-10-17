/**
 * The harbour's furniture (#181): our own models of a dock crane, its
 * hanging load, an open-sided thatched market hall and the quay's flag.
 * Pure, no Three.js; built once at scale 1 (`TOWN_PIECE_SCALE` and
 * `BUILDING_SCALE` multiply them) and merged into the village's mesh
 * (`villageGeometry.ts`), the crane's load into the one swaying mesh of
 * every crane on the map (`craneSway.ts`), so none costs a draw of its own.
 *
 * Origin at the ground contact, the front on +z: the crane's jib reaches
 * out along +z over the water, the hall opens onto the square on +z.
 * Faceted and vertex-coloured in the aged kit's register (ADR 0002); the
 * hall's roof is thatch, coloured by its vertices alone (amendment (c)).
 */
import type { PortNation } from "../../game/types";
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import { buildNationFlagGeometry, FLAG_RIPPLE, FLAG_WIDTH } from "./nationFlagGeometry";
import type { Rgb } from "./palmGeometry";
import { TOWN_PIECE_TRIANGLE_BUDGET } from "./townPieces";

/** Every harbour piece is a town piece: a few hundred triangles at most. */
export const HARBOUR_PIECE_TRIANGLE_BUDGET = TOWN_PIECE_TRIANGLE_BUDGET;

export interface HarbourPieceColors {
  timber: Rgb;
  darkTimber: Rgb;
  stone: Rgb;
  iron: Rgb;
  rope: Rgb;
  /** The market hall's roof (ADR 0002 amendment (c)). */
  thatch: Rgb;
  /** The crane's load. */
  crate: Rgb;
  /** Sacks and goods under the hall. */
  goods: readonly Rgb[];
}

/** The crane's stone foot at scale 1: its half width and how deep it goes under the ground contact. */
export const CRANE_FOOT = { half: 0.034, top: 0.024, depth: 0.03 } as const;
/** The mast's half width and its top at scale 1. */
const MAST = { half: 0.01, top: 0.3 } as const;
/** The jib at scale 1: its height (underside), depth, half width, the counterweight's end behind the mast. */
const JIB = { y: 0.27, depth: 0.016, half: 0.008, back: -0.055 } as const;
/** Where the load hangs at scale 1: under the jib's tip, its pulley block. */
export const CRANE_JIB_TIP: Vec3 = [0, JIB.y - 0.012, 0.19];
/** How far the load (the rope and the crate) drops from the tip at scale 1. */
export const CRANE_LOAD_DROP = 0.13;
/** The crate's size at scale 1. */
const CRATE = 0.038;
/** The crane's top at scale 1: the mast's cap. */
export const CRANE_HEIGHT = MAST.top + 0.008;

/** The market hall's posts' plan (half extents) at scale 1, x across its open front. */
export const MARKET_HALL_PLAN = { halfW: 0.13, halfD: 0.09 } as const;
/** How far past the posts its thatch reaches in plan at scale 1. */
export const MARKET_HALL_EAVE = 0.04;
/** The posts' height (the eave beams' top) and the ridge's at scale 1. */
const HALL_EAVE_Y = 0.112;
const HALL_RIDGE_Y = 0.235;
/** Thatch thickness at the eave, the courses' step, at scale 1. */
const THATCH_THICK = 0.016;
const THATCH_COURSES = 3;
/** The hall's top at scale 1: the ridge's cap. */
export const MARKET_HALL_HEIGHT = HALL_RIDGE_Y + THATCH_THICK + 0.012;
/** Two lanterns hung under the front eave beam at scale 1 (for a later night, ADR 0002 amendment (b)). */
export const MARKET_HALL_LANTERNS: readonly Vec3[] = [
  [-MARKET_HALL_PLAN.halfW * 0.55, HALL_EAVE_Y - 0.02, MARKET_HALL_PLAN.halfD - 0.004],
  [MARKET_HALL_PLAN.halfW * 0.55, HALL_EAVE_Y - 0.02, MARKET_HALL_PLAN.halfD - 0.004],
];

/** The quay's flagpole at scale 1: its height (the finial's top), the reach of its flag in plan. */
const POLE = { half: 0.0045, top: 0.25 } as const;
export const QUAY_FLAG_HEIGHT = POLE.top + 0.012;
export const QUAY_FLAG_RADIUS = Math.max(Math.hypot(POLE.half + FLAG_WIDTH, FLAG_RIPPLE), 0.02);
/** The flag's hoist at scale 1: just under the finial, flying along +x. */
export const QUAY_FLAG_HOIST: Vec3 = [POLE.half, POLE.top - 0.004, 0];

/** A box between two points of a slanted member (a strut): a square section of half `half` from `a` to `b`. */
function strut(b: FacetBuilder, a: Vec3, c: Vec3, half: number, color: Rgb) {
  // A section square to the strut's plane (here, the y–z plane), so its ends are flush with what it joins.
  const dy = c[1] - a[1];
  const dz = c[2] - a[2];
  const len = Math.hypot(dy, dz) || 1;
  const ny = -dz / len;
  const nz = dy / len;
  const ring = (p: Vec3): Vec3[] => [
    [p[0] - half, p[1] + ny * half, p[2] + nz * half],
    [p[0] + half, p[1] + ny * half, p[2] + nz * half],
    [p[0] + half, p[1] - ny * half, p[2] - nz * half],
    [p[0] - half, p[1] - ny * half, p[2] - nz * half],
  ];
  b.prism(ring(a), ring(c), color, { bottom: false, top: false });
}

/**
 * A dock crane: a squared timber mast on a dressed stone foot, a jib out over
 * the water braced back to the mast, a stone counterweight on its tail, a
 * winch drum at the mast's foot and the pulley block at the jib's tip.
 */
export function buildCrane(c: HarbourPieceColors): FacetGeometryData {
  const b = createFacetBuilder();
  const f = CRANE_FOOT;
  // The foot, its top course a shade darker where the timber meets the stone.
  b.box([-f.half, -f.depth, -f.half], [f.half, f.top - 0.005, f.half], c.stone, { bottom: false, top: false });
  b.box([-f.half, f.top - 0.005, -f.half], [f.half, f.top, f.half], shadeRgb(c.stone, 0.75), { bottom: false });
  b.box([-MAST.half, f.top, -MAST.half], [MAST.half, MAST.top, MAST.half], c.timber, { bottom: false });
  b.box([-MAST.half - 0.002, MAST.top, -MAST.half - 0.002], [MAST.half + 0.002, CRANE_HEIGHT, MAST.half + 0.002], c.darkTimber, { bottom: true });
  // The jib, from the counterweight's end to past the tip.
  b.box([-JIB.half, JIB.y, JIB.back], [JIB.half, JIB.y + JIB.depth, CRANE_JIB_TIP[2] + 0.008], shadeRgb(c.timber, 1.08), { bottom: true });
  // The brace from the mast up under the jib, and its pair to the tail.
  strut(b, [0, 0.165, MAST.half], [0, JIB.y, 0.11], JIB.half * 0.75, shadeRgb(c.timber, 0.92));
  strut(b, [0, 0.2, -MAST.half], [0, JIB.y, JIB.back + 0.012], JIB.half * 0.7, shadeRgb(c.timber, 0.88));
  // The counterweight: a stone block slung under the tail.
  b.box([-0.016, JIB.y - 0.032, JIB.back], [0.016, JIB.y, JIB.back + 0.028], shadeRgb(c.stone, 0.9), { bottom: true });
  // The winch drum across the mast's foot, its rope wound on it.
  const drum = b.vertexCount();
  b.lathe(
    [
      [0, -0.022],
      [0.012, -0.022],
      [0.012, -0.022],
      [0.012, 0.022],
      [0.012, 0.022],
      [0, 0.022],
    ],
    6,
    c.rope
  );
  b.rotate(drum, b.vertexCount(), "z", Math.PI / 2);
  b.translate(drum, b.vertexCount(), [0, f.top + 0.03, MAST.half + 0.013]);
  // The pulley block under the tip.
  const [tx, ty, tz] = CRANE_JIB_TIP;
  b.box([tx - 0.005, ty, tz - 0.006], [tx + 0.005, JIB.y, tz + 0.006], c.iron, { top: false, bottom: true });
  return b.build();
}

/**
 * The crane's load at scale 1, in the crane's frame: a rope from the jib's
 * tip down to a corded crate. It sways about the tip (`craneSway.ts`); its
 * top is the tip, its bottom `CRANE_LOAD_DROP` below.
 */
export function buildCraneLoad(c: HarbourPieceColors): FacetGeometryData {
  const b = createFacetBuilder();
  const [x, top, z] = CRANE_JIB_TIP;
  const crateTop = top - CRANE_LOAD_DROP + CRATE;
  b.box([x - 0.0016, crateTop, z - 0.0016], [x + 0.0016, top, z + 0.0016], c.rope, { bottom: false, top: false });
  const h = CRATE / 2;
  const bottom = top - CRANE_LOAD_DROP;
  b.box([x - h, bottom, z - h], [x + h, crateTop, z + h], c.crate, { bottom: true });
  // The sling: a dark band round the crate's middle.
  b.box([x - h - 0.001, bottom + CRATE * 0.42, z - h - 0.001], [x + h + 0.001, bottom + CRATE * 0.58, z + h + 0.001], c.rope, { bottom: false, top: false });
  return b.build();
}

/** One course of a hipped roof: a sloped skin from the eave ring at `y0` (half extents `hw0`, `hd0`) up to a ring at `y1`. */
function hipCourse(b: FacetBuilder, hw0: number, hd0: number, y0: number, hw1: number, hd1: number, y1: number, color: Rgb, centre: Vec3, tones: readonly number[]) {
  const lo: Vec3[] = [
    [-hw0, y0, hd0],
    [hw0, y0, hd0],
    [hw0, y0, -hd0],
    [-hw0, y0, -hd0],
  ];
  const hi: Vec3[] = [
    [-hw1, y1, hd1],
    [hw1, y1, hd1],
    [hw1, y1, -hd1],
    [-hw1, y1, -hd1],
  ];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    const tone = shadeRgb(color, tones[k]);
    if (Math.hypot(hi[k][0] - hi[n][0], hi[k][2] - hi[n][2]) < 1e-9) b.outwardTriangle(lo[k], lo[n], hi[k], centre, tone);
    else b.outwardQuad(lo[k], lo[n], hi[n], hi[k], centre, tone);
  }
}

/**
 * An open-sided market hall: a low stone floor, six squared posts carrying
 * eave beams, a hipped roof of thick thatch laid in courses, its ridge
 * capped; a trestle counter and sacks of goods in its middle, clear of its
 * open sides.
 */
export function buildMarketHall(c: HarbourPieceColors): FacetGeometryData {
  const b = createFacetBuilder();
  const { halfW, halfD } = MARKET_HALL_PLAN;
  // The floor: a stone platform, its footing under the ground.
  b.box([-halfW - 0.012, -0.03, -halfD - 0.012], [halfW + 0.012, 0.01, halfD + 0.012], c.stone, { bottom: false });
  // Six posts: the corners and the middle of the long sides.
  const post = 0.0075;
  for (const x of [-halfW, 0, halfW]) {
    for (const z of [-halfD, halfD]) b.box([x - post, 0.01, z - post], [x + post, HALL_EAVE_Y, z + post], shadeRgb(c.timber, 0.95 + (x > 0 ? 0.06 : 0)), { bottom: false, top: false });
  }
  // The eave beams round the posts' tops.
  const beam = 0.009;
  b.box([-halfW - beam, HALL_EAVE_Y - beam * 1.4, halfD - beam], [halfW + beam, HALL_EAVE_Y, halfD + beam], c.darkTimber, { bottom: true, top: false });
  b.box([-halfW - beam, HALL_EAVE_Y - beam * 1.4, -halfD - beam], [halfW + beam, HALL_EAVE_Y, -halfD + beam], c.darkTimber, { bottom: true, top: false });
  for (const x of [-halfW, halfW]) b.box([x - beam, HALL_EAVE_Y - beam * 1.4, -halfD + beam], [x + beam, HALL_EAVE_Y, halfD - beam], c.darkTimber, { bottom: true, top: false });
  // The thatch: a thick skirt at the eave, then courses up to the ridge, each a tone of straw.
  const ew = halfW + MARKET_HALL_EAVE;
  const ed = halfD + MARKET_HALL_EAVE;
  const ridgeHalf = ew - ed;
  const centre: Vec3 = [0, HALL_EAVE_Y, 0];
  const at = (t: number) => ({ hw: ew + (ridgeHalf - ew) * t, hd: ed * (1 - t), y: HALL_EAVE_Y + (HALL_RIDGE_Y - HALL_EAVE_Y) * t });
  // Under the skirt, the thatch's dark underside; then the skirt's edge, its thickness.
  const under = shadeRgb(c.thatch, 0.62);
  b.quad([-ew, HALL_EAVE_Y, -ed], [ew, HALL_EAVE_Y, -ed], [ew, HALL_EAVE_Y, ed], [-ew, HALL_EAVE_Y, ed], under);
  hipCourse(b, ew, ed, HALL_EAVE_Y, ew, ed, HALL_EAVE_Y + THATCH_THICK, shadeRgb(c.thatch, 0.82), centre, [1, 0.96, 1.02, 0.94]);
  for (let k = 0; k < THATCH_COURSES; k++) {
    const a = at(k / THATCH_COURSES);
    const z = at((k + 1) / THATCH_COURSES);
    // Each course laid a little proud of the one above it, so the roof reads in steps of straw.
    const lift = THATCH_THICK * (1 - (k * 0.25) / THATCH_COURSES);
    const tones = [1.02, 0.95, 1.06, 0.9].map((t) => t * (1 - k * 0.05));
    hipCourse(b, a.hw, a.hd, a.y + lift, z.hw, z.hd, z.y + THATCH_THICK * (1 - ((k + 1) * 0.25) / THATCH_COURSES), c.thatch, centre, tones);
    if (k > 0) {
      // The course's lower edge: a short drip where it overlaps the one below.
      const drip = THATCH_THICK * 0.35;
      hipCourse(b, a.hw, a.hd, a.y + lift - drip, a.hw, a.hd, a.y + lift, shadeRgb(c.thatch, 0.78), centre, [1, 1, 1, 1]);
    }
  }
  // The ridge's cap: a bound roll of straw along the top.
  const ridgeTop = HALL_RIDGE_Y + THATCH_THICK * 0.75;
  b.box([-ridgeHalf - 0.012, ridgeTop - 0.004, -0.009], [ridgeHalf + 0.012, MARKET_HALL_HEIGHT, 0.009], shadeRgb(c.thatch, 0.86), { bottom: false });
  // The counter: a trestle board down the middle, and sacks of goods on and by it.
  const cw = halfW * 0.5;
  b.box([-cw, 0.045, -0.018], [cw, 0.052, 0.018], shadeRgb(c.timber, 1.12), { bottom: true });
  for (const x of [-cw + 0.008, cw - 0.008]) b.box([x - 0.004, 0.01, -0.014], [x + 0.004, 0.045, 0.014], c.darkTimber, { bottom: false, top: false });
  c.goods.forEach((g, i) => {
    const x = -cw * 0.5 + i * cw;
    b.box([x - 0.014, 0.052, -0.012], [x + 0.014, 0.068, 0.012], g, { bottom: false });
  });
  b.box([-cw * 0.4, 0.01, -halfD * 0.45], [cw * 0.1, 0.034, -halfD * 0.15], shadeRgb(c.goods[0] ?? c.timber, 0.85), { bottom: false });
  b.jitterColors(0.03, 0x4a11);
  return b.build();
}

/** The quay's flagpole: a stone socket, a pole with an iron finial, the port's flag flying from it. */
export function buildQuayFlag(nation: PortNation, c: HarbourPieceColors): FacetGeometryData {
  const b = createFacetBuilder();
  b.box([-0.013, -0.01, -0.013], [0.013, 0.012, 0.013], c.stone, { bottom: false });
  b.box([-POLE.half, 0.012, -POLE.half], [POLE.half, POLE.top, POLE.half], c.timber, { bottom: false, top: false });
  b.box([-POLE.half - 0.002, POLE.top, -POLE.half - 0.002], [POLE.half + 0.002, QUAY_FLAG_HEIGHT, POLE.half + 0.002], c.iron, { bottom: true });
  const pole = b.build();
  const flag = buildNationFlagGeometry(nation, QUAY_FLAG_HOIST);
  return concat(pole, flag);
}

/** Two soups as one. */
function concat(a: FacetGeometryData, c: FacetGeometryData): FacetGeometryData {
  const join = (x: Float32Array, y: Float32Array) => {
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  return { positions: join(a.positions, c.positions), normals: join(a.normals, c.normals), colors: join(a.colors, c.colors), vertexCount: a.vertexCount + c.vertexCount };
}
