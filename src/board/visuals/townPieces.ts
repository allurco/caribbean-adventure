/**
 * The town's small pieces (#84 detail pass): our own models of what a
 * sixteenth-century Caribbean port has lying about. Pure, no Three.js;
 * built once at scale 1 (the building scale multiplies them) and merged
 * into the village's mesh (`villageMesh.ts`), so they cost no draw call of
 * their own.
 *
 * Origin at the ground contact, the front (or the bow) on +z. Faceted,
 * vertex-coloured, weathered, in the aged kit's register.
 */
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";
import { seedOf, stream } from "./variationStream";

export type TownPieceKind =
  | "barrel"
  | "crate"
  | "crateStack"
  | "cart"
  | "stall"
  | "boat"
  | "netRack"
  | "garden"
  | "palm"
  | "fountain";

export const TOWN_PIECE_KINDS: readonly TownPieceKind[] = ["barrel", "crate", "crateStack", "cart", "stall", "boat", "netRack", "garden", "palm", "fountain"];

export interface TownPieceColors {
  timber: Rgb;
  darkTimber: Rgb;
  iron: Rgb;
  stone: Rgb;
  /** Awning cloths, picked per stall. */
  cloths: readonly Rgb[];
  /** Hull strakes, picked per boat. */
  strakes: readonly Rgb[];
  tar: Rgb;
  soil: Rgb;
  leaf: Rgb;
  frond: Rgb;
  trunk: Rgb;
  water: Rgb;
  net: Rgb;
  /** Goods on a stall: fruit, cloth, pots. */
  goods: readonly Rgb[];
}

/** Each kind's footprint radius at scale 1 (what keeps pieces apart and off streets). */
export const TOWN_PIECE_RADIUS: Readonly<Record<TownPieceKind, number>> = {
  barrel: 0.014,
  crate: 0.0185,
  crateStack: 0.034,
  cart: 0.1,
  stall: 0.062,
  boat: 0.078,
  netRack: 0.05,
  garden: 0.085,
  palm: 0.12,
  fountain: 0.06,
};

/** Each kind's height at scale 1. */
export const TOWN_PIECE_HEIGHT: Readonly<Record<TownPieceKind, number>> = {
  barrel: 0.026,
  crate: 0.024,
  crateStack: 0.05,
  cart: 0.056,
  stall: 0.077,
  boat: 0.03,
  netRack: 0.05,
  garden: 0.03,
  palm: 0.26,
  fountain: 0.06,
};

/** How many variants each kind has (awning colours, strakes, wear). */
export const TOWN_PIECE_VARIANTS: Readonly<Record<TownPieceKind, number>> = {
  barrel: 2,
  crate: 2,
  crateStack: 2,
  cart: 1,
  stall: 3,
  boat: 3,
  netRack: 1,
  garden: 2,
  palm: 2,
  fountain: 1,
};

export const TOWN_PIECE_TRIANGLE_BUDGET = 400;

function barrel(b: FacetBuilder, c: TownPieceColors, at: Vec3 = [0, 0, 0], tone = 1) {
  const from = b.vertexCount();
  b.lathe(
    [
      [0, 0],
      [0.0105, 0],
      [0.0105, 0],
      [0.0128, 0.013],
      [0.0105, 0.026],
      [0.0105, 0.026],
      [0, 0.026],
    ],
    7,
    shadeRgb(c.timber, tone)
  );
  // Iron hoops: dark bands near the ends and the bilge.
  b.tintColors(from, b.vertexCount(), ([, y]) => {
    const hoop = Math.abs(y - 0.004) < 0.0025 || Math.abs(y - 0.022) < 0.0025;
    return hoop ? [0.45, 0.45, 0.45] : [1, 1, 1];
  });
  b.translate(from, b.vertexCount(), at);
}

function crate(b: FacetBuilder, c: TownPieceColors, at: Vec3, size: number, yaw: number, tone: number) {
  const from = b.vertexCount();
  const h = size / 2;
  b.box([-h, 0, -h], [h, size, h], shadeRgb(c.timber, 1.15 * tone));
  // Two dark slats round it.
  b.box([-h - 0.0008, size * 0.3, -h - 0.0008], [h + 0.0008, size * 0.38, h + 0.0008], shadeRgb(c.darkTimber, tone), { bottom: false });
  b.box([-h - 0.0008, size * 0.68, -h - 0.0008], [h + 0.0008, size * 0.76, h + 0.0008], shadeRgb(c.darkTimber, tone), { bottom: false });
  b.rotate(from, b.vertexCount(), "y", yaw);
  b.translate(from, b.vertexCount(), at);
}

/** A disc wheel of `segments` facets about the x axis, centred at `at`. */
function wheel(b: FacetBuilder, at: Vec3, radius: number, half: number, color: Rgb) {
  const from = b.vertexCount();
  b.lathe(
    [
      [0, -half],
      [radius, -half],
      [radius, -half],
      [radius, half],
      [radius, half],
      [0, half],
    ],
    8,
    color
  );
  // The lathe turns about y; lay it on its side so it turns about x.
  b.rotate(from, b.vertexCount(), "z", Math.PI / 2);
  b.translate(from, b.vertexCount(), at);
}

function cart(b: FacetBuilder, c: TownPieceColors) {
  const bed: Vec3 = [0.03, 0.024, 0.045];
  b.box([-bed[0], bed[1], -bed[2]], [bed[0], bed[1] + 0.006, bed[2]], shadeRgb(c.timber, 1.05));
  // Low sides.
  for (const s of [-1, 1]) b.box([s * bed[0] - 0.002, bed[1] + 0.006, -bed[2]], [s * bed[0] + 0.002, bed[1] + 0.016, bed[2]], c.timber, { bottom: false });
  b.box([-bed[0], bed[1] + 0.006, -bed[2] - 0.002], [bed[0], bed[1] + 0.016, -bed[2] + 0.002], c.timber, { bottom: false });
  // Two big wheels and the axle, the shafts resting on the ground in front.
  for (const s of [-1, 1]) wheel(b, [s * (bed[0] + 0.006), 0.022, 0], 0.022, 0.0025, c.darkTimber);
  b.box([-bed[0] - 0.006, 0.02, -0.002], [bed[0] + 0.006, 0.024, 0.002], c.darkTimber);
  for (const s of [-1, 1]) {
    b.prism(
      [
        [s * 0.018 - 0.002, bed[1] - 0.002, bed[2] - 0.004],
        [s * 0.02 - 0.002, 0.0, bed[2] + 0.05],
        [s * 0.02 + 0.002, 0.0, bed[2] + 0.05],
        [s * 0.018 + 0.002, bed[1] - 0.002, bed[2] - 0.004],
      ],
      [
        [s * 0.018 - 0.002, bed[1] + 0.002, bed[2] - 0.004],
        [s * 0.02 - 0.002, 0.004, bed[2] + 0.05],
        [s * 0.02 + 0.002, 0.004, bed[2] + 0.05],
        [s * 0.018 + 0.002, bed[1] + 0.002, bed[2] - 0.004],
      ],
      c.darkTimber
    );
  }
  // A load: two barrels and a sack.
  barrel(b, c, [-0.013, bed[1] + 0.006, -0.02], 0.9);
  barrel(b, c, [0.013, bed[1] + 0.006, 0.0], 1.05);
  b.box([-0.022, bed[1] + 0.006, 0.018], [0.0, bed[1] + 0.018, 0.04], shadeRgb(c.cloths[2] ?? c.timber, 1));
}

function stall(b: FacetBuilder, c: TownPieceColors, variant: number) {
  const hw = 0.04;
  const hd = 0.028;
  const cloth = c.cloths[variant % c.cloths.length];
  // Four posts, the back pair taller, so the awning slopes to the front.
  for (const [x, z, h] of [
    [-hw, -hd, 0.072],
    [hw, -hd, 0.072],
    [-hw, hd, 0.058],
    [hw, hd, 0.058],
  ] as const) {
    b.box([x - 0.0025, 0, z - 0.0025], [x + 0.0025, h, z + 0.0025], c.darkTimber, { bottom: false });
  }
  // The counter across the front, goods on it.
  b.box([-hw + 0.003, 0, hd - 0.014], [hw - 0.003, 0.026, hd - 0.002], shadeRgb(c.timber, 1.1), { bottom: false });
  const next = stream(seedOf([variant], 0x5a11));
  for (let i = 0; i < 4; i++) {
    const x = -hw + 0.01 + i * 0.019;
    const good = c.goods[Math.floor(next() * c.goods.length)];
    b.box([x - 0.006, 0.026, hd - 0.012], [x + 0.006, 0.026 + 0.004 + next() * 0.004, hd - 0.004], good, { bottom: false });
  }
  // The awning: a sloped cloth with a scalloped-looking front drop, in two tones (stripes).
  const over = 0.008;
  const yBack = 0.074;
  const yFront = 0.06;
  const strips = 4;
  for (let i = 0; i < strips; i++) {
    const x0 = -hw - over + (i / strips) * (2 * (hw + over));
    const x1 = -hw - over + ((i + 1) / strips) * (2 * (hw + over));
    const tone = i % 2 === 0 ? cloth : shadeRgb(cloth, 0.78);
    const ring = (dy: number): Vec3[] => [
      [x0, yBack + dy, -hd - over],
      [x0, yFront + dy, hd + over],
      [x1, yFront + dy, hd + over],
      [x1, yBack + dy, -hd - over],
    ];
    b.prism(ring(0), ring(0.002), tone);
    // The drop at the front edge: a thin hanging panel of the same cloth.
    b.box([x0, yFront - 0.012, hd + over - 0.001], [x1, yFront + 0.0015, hd + over + 0.0005], tone);
  }
}

function boat(b: FacetBuilder, c: TownPieceColors, variant: number) {
  // An open fishing boat, bow on +z: three stations (transom, midship, bow), outer planking tarred, a coloured sheer strake.
  const L = 0.075;
  const stations: { z: number; half: number; deck: number; keel: number }[] = [
    { z: -L, half: 0.018, deck: 0.024, keel: 0.006 },
    { z: -L * 0.2, half: 0.026, deck: 0.022, keel: 0.0 },
    { z: L * 0.55, half: 0.018, deck: 0.024, keel: 0.002 },
    { z: L, half: 0.003, deck: 0.03, keel: 0.01 },
  ];
  const strake = c.strakes[variant % c.strakes.length];
  const tar = c.tar;
  const inner = shadeRgb(c.timber, 0.9);
  const bilge = (s: (typeof stations)[number], side: number): Vec3 => [side * s.half * 0.65, s.keel + 0.004, s.z];
  const sheer = (s: (typeof stations)[number], side: number): Vec3 => [side * s.half, s.deck, s.z];
  const keel = (s: (typeof stations)[number]): Vec3 => [0, s.keel, s.z];
  const centre: Vec3 = [0, 0.012, -L * 0.1];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const n = stations[i + 1];
    for (const side of [-1, 1]) {
      // Bottom (keel to bilge), then side (bilge to sheer), outward.
      b.outwardQuad(keel(a), keel(n), bilge(n, side), bilge(a, side), centre, tar);
      b.outwardQuad(bilge(a, side), bilge(n, side), sheer(n, side), sheer(a, side), centre, i === 1 ? strake : shadeRgb(strake, 0.9));
      // The inside of the side, facing in (seen from above into the open boat).
      const inA: Vec3 = [side * a.half * 0.88, a.deck - 0.001, a.z];
      const inN: Vec3 = [side * n.half * 0.88, n.deck - 0.001, n.z];
      const flA: Vec3 = [side * a.half * 0.55, a.keel + 0.008, a.z];
      const flN: Vec3 = [side * n.half * 0.55, n.keel + 0.008, n.z];
      b.outwardQuad(flA, flN, inN, inA, [side, -1, (a.z + n.z) / 2], inner);
      // The gunwale's top, joining the outer and inner sheer lines.
      b.outwardQuad(sheer(a, side), sheer(n, side), inN, inA, [0, -1, (a.z + n.z) / 2], shadeRgb(c.timber, 1.05));
    }
    // The floor boards between the two inner floor lines.
    b.outwardQuad([-a.half * 0.55, a.keel + 0.008, a.z], [a.half * 0.55, a.keel + 0.008, a.z], [n.half * 0.55, n.keel + 0.008, n.z], [-n.half * 0.55, n.keel + 0.008, n.z], [0, -1, (a.z + n.z) / 2], shadeRgb(c.timber, 0.75));
  }
  // The transom across the stern and the stem's narrow face at the bow, each closed outside and in.
  for (const [s, sign] of [
    [stations[0], -1],
    [stations[stations.length - 1], 1],
  ] as const) {
    b.outwardQuad(sheer(s, -1), sheer(s, 1), bilge(s, 1), bilge(s, -1), [0, 0.012, 0], shadeRgb(tar, 1.3));
    b.outwardTriangle(bilge(s, -1), bilge(s, 1), keel(s), [0, 0.03, 0], tar);
    const z = s.z - sign * 0.0015;
    const inner4: Vec3[] = [
      [-s.half * 0.88, s.deck - 0.001, z],
      [s.half * 0.88, s.deck - 0.001, z],
      [s.half * 0.55, s.keel + 0.008, z],
      [-s.half * 0.55, s.keel + 0.008, z],
    ];
    b.outwardQuad(inner4[0], inner4[1], inner4[2], inner4[3], [0, 0.02, sign], shadeRgb(c.timber, 0.85));
    // Its top, from the outer sheer line to the inner face.
    b.outwardQuad(sheer(s, -1), sheer(s, 1), inner4[1], inner4[0], [0, -1, s.z], shadeRgb(c.timber, 1.05));
  }
  // A thwart across the middle, and oars along it.
  b.box([-0.022, 0.016, -0.02], [0.022, 0.019, -0.012], shadeRgb(c.timber, 1.1));
  b.box([0.006, 0.019, -0.06], [0.01, 0.022, 0.04], shadeRgb(c.timber, 1.2), { bottom: false });
}

function netRack(b: FacetBuilder, c: TownPieceColors) {
  const hw = 0.045;
  for (const x of [-hw, hw]) b.box([x - 0.0025, 0, -0.0025], [x + 0.0025, 0.048, 0.0025], c.darkTimber, { bottom: false });
  b.box([-hw - 0.004, 0.044, -0.002], [hw + 0.004, 0.048, 0.002], c.darkTimber);
  // The net hung over the rail: a drape either side, sagging, seen from both faces.
  for (const side of [-1, 1]) {
    const z0 = side * 0.002;
    const z1 = side * 0.009;
    const pts: Vec3[] = [
      [-hw + 0.004, 0.046, z0],
      [hw - 0.004, 0.046, z0],
      [hw - 0.01, 0.014, z1],
      [0, 0.01, z1 * 1.2],
      [-hw + 0.01, 0.016, z1],
    ];
    const tone = shadeRgb(c.net, side > 0 ? 1 : 0.85);
    const mid: Vec3 = [0, 0.03, 0];
    const far: Vec3 = [0, 0.03, side * 1];
    // Both faces of the drape: outward, and inward (darker, the net's shadowed side).
    for (const [p, q, r] of [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
    ] as const) {
      b.outwardTriangle(pts[p], pts[q], pts[r], mid, tone);
      b.outwardTriangle(pts[p], pts[q], pts[r], far, shadeRgb(tone, 0.75));
    }
  }
}

function garden(b: FacetBuilder, c: TownPieceColors, variant: number) {
  const hw = 0.06;
  const hd = 0.05;
  // The bed: dark worked soil, a little raised, with rows of green.
  b.box([-hw + 0.004, -0.004, -hd + 0.004], [hw - 0.004, 0.003, hd - 0.004], c.soil, { bottom: false });
  const rows = 4;
  const next = stream(seedOf([variant], 0x6a7d));
  for (let i = 0; i < rows; i++) {
    const z = -hd + 0.014 + (i / (rows - 1)) * (2 * hd - 0.028);
    const h = 0.006 + next() * 0.006;
    b.box([-hw + 0.012, 0.003, z - 0.004], [hw - 0.012, 0.003 + h, z + 0.004], shadeRgb(c.leaf, 0.85 + next() * 0.3), { bottom: false });
  }
  // The fence: posts at the corners and between, two rails, a gap for the gate on the front.
  const post = (x: number, z: number) => b.box([x - 0.0018, -0.004, z - 0.0018], [x + 0.0018, 0.026, z + 0.0018], c.darkTimber, { bottom: false });
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number) =>
    b.box([Math.min(x0, x1) - 0.001, y, Math.min(z0, z1) - 0.001], [Math.max(x0, x1) + 0.001, y + 0.0025, Math.max(z0, z1) + 0.001], shadeRgb(c.timber, 1.1));
  for (const [x, z] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
    [0, -hd],
    [-hw, 0],
    [hw, 0],
    [-0.016, hd],
    [0.016, hd],
  ] as const) {
    post(x, z);
  }
  for (const y of [0.01, 0.02]) {
    rail(-hw, -hd, hw, -hd, y);
    rail(-hw, -hd, -hw, hd, y);
    rail(hw, -hd, hw, hd, y);
    rail(-hw, hd, -0.016, hd, y);
    rail(0.016, hd, hw, hd, y);
  }
}

function palm(b: FacetBuilder, c: TownPieceColors, variant: number) {
  const height = variant === 0 ? 0.22 : 0.18;
  const lean = variant === 0 ? 0.05 : -0.04;
  const from = b.vertexCount();
  b.lathe(
    [
      [0.009, 0],
      [0.0065, height * 0.5],
      [0.005, height],
      [0, height + 0.004],
    ],
    5,
    c.trunk
  );
  b.jitterColors(0.08, 0x9a1 + variant, from, b.vertexCount());
  b.shear(from, b.vertexCount(), "x", "y", lean);
  // The crown: fronds arching out and down, each a bent strip of two segments, coloured both faces.
  const top: Vec3 = [lean * height, height, 0];
  const fronds = 7;
  const next = stream(seedOf([variant], 0x9a1d));
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + next() * 0.4;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const len = 0.075 + next() * 0.02;
    const w = 0.012;
    const px = -dz;
    const pz = dx;
    const mid: Vec3 = [top[0] + dx * len * 0.55, top[1] + 0.012, top[2] + dz * len * 0.55];
    const tip: Vec3 = [top[0] + dx * len, top[1] - 0.03, top[2] + dz * len];
    const l0: Vec3 = [top[0] + px * w * 0.3, top[1], top[2] + pz * w * 0.3];
    const r0: Vec3 = [top[0] - px * w * 0.3, top[1], top[2] - pz * w * 0.3];
    const l1: Vec3 = [mid[0] + px * w, mid[1], mid[2] + pz * w];
    const r1: Vec3 = [mid[0] - px * w, mid[1], mid[2] - pz * w];
    const tone = shadeRgb(c.frond, 0.85 + next() * 0.3);
    // Upper faces, then the undersides (darker), so a frond reads from any side.
    b.triangle(l0, l1, r1, tone);
    b.triangle(l0, r1, r0, tone);
    b.triangle(l1, tip, r1, tone);
    const under = shadeRgb(tone, 0.7);
    b.triangle(l0, r1, l1, under);
    b.triangle(l0, r0, r1, under);
    b.triangle(l1, r1, tip, under);
  }
}

function fountain(b: FacetBuilder, c: TownPieceColors) {
  const r = 0.05;
  const wall = 0.006;
  const h = 0.014;
  // The basin: an eight-sided stone ring, its rim, the water inside.
  b.lathe(
    [
      [r + 0.002, -0.004],
      [r + 0.002, 0.002],
      [r + 0.002, 0.002],
      [r, h],
      [r, h],
      [r - wall, h],
      [r - wall, h],
      [r - wall, h - 0.008],
    ],
    8,
    c.stone
  );
  b.lathe(
    [
      [r - wall, h - 0.006],
      [0, h - 0.006],
    ],
    8,
    c.water
  );
  // The pillar and its bowl, and a finial.
  b.lathe(
    [
      [0.009, h - 0.006],
      [0.007, 0.036],
      [0.007, 0.036],
      [0.018, 0.04],
      [0.018, 0.04],
      [0.016, 0.046],
      [0.016, 0.046],
      [0.004, 0.046],
      [0.004, 0.046],
      [0.004, 0.054],
      [0.004, 0.054],
      [0, 0.06],
    ],
    8,
    shadeRgb(c.stone, 1.08)
  );
  b.jitterColors(0.06, 0xf0a7);
}

/** Builds one piece at scale 1; `variant` picks its colours and wear (0 … TOWN_PIECE_VARIANTS[kind] − 1). */
export function buildTownPiece(kind: TownPieceKind, colors: TownPieceColors, variant = 0): FacetGeometryData {
  const b = createFacetBuilder();
  const tone = variant % 2 === 0 ? 1 : 0.85;
  switch (kind) {
    case "barrel":
      barrel(b, colors, [0, 0, 0], tone);
      break;
    case "crate":
      crate(b, colors, [0, 0, 0], 0.024, 0, tone);
      break;
    case "crateStack":
      crate(b, colors, [-0.0135, 0, 0], 0.024, 0.04, tone);
      crate(b, colors, [0.0135, 0, 0.003], 0.024, -0.04, 1.05 * tone);
      crate(b, colors, [0.001, 0.024, 0.001], 0.022, 0.35, 0.95 * tone);
      break;
    case "cart":
      cart(b, colors);
      break;
    case "stall":
      stall(b, colors, variant);
      break;
    case "boat":
      boat(b, colors, variant);
      break;
    case "netRack":
      netRack(b, colors);
      break;
    case "garden":
      garden(b, colors, variant);
      break;
    case "palm":
      palm(b, colors, variant);
      break;
    case "fountain":
      fountain(b, colors);
      break;
  }
  if (kind !== "palm" && kind !== "boat") b.bakeAmbientOcclusion({ groundHeight: 0.008, groundStrength: 0.3 });
  return b.build();
}
