/**
 * Low-poly palm tree mesh data (issue #14). Pure, no Three.js.
 *
 * One palm in its own local space: trunk base on the origin, Y up, the trunk
 * curving towards +X. Triangles are non-indexed so every face is flat, which
 * matches the faceted terrain. Besides positions/normals/colours each vertex
 * carries a `palm` vec2 for the sway shader:
 *   x = sway weight, 0 at the trunk base rising to 1 at the frond tips
 *   y = crown mask, 1 for crown parts (fronds, coconuts) that turn with the
 *       per-instance crown twist, 0 for the trunk
 */

export type Rgb = readonly [number, number, number];

export interface PalmColors {
  trunk: Rgb;
  frond: Rgb;
}

export interface PalmGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** vec2 per vertex: (sway weight, crown mask). */
  palm: Float32Array;
  vertexCount: number;
}

type Vec3 = [number, number, number];

/** Trunk height at scale 1, before per-instance height variation. */
export const PALM_TRUNK_HEIGHT = 0.46;
/** Sway weight at the top of the trunk; fronds go from here to 1 at the tip. */
export const PALM_TRUNK_TOP_SWAY = 0.35;

const TRUNK_SEGMENTS = 5;
const TRUNK_SIDES = 5;
const TRUNK_BASE_RADIUS = 0.034;
const TRUNK_TOP_RADIUS = 0.018;
/** X offset of the trunk top; the centreline is a parabola, so it bends more near the top. */
const TRUNK_CURVE = 0.07;
/** Each segment's bottom ring flares out by this factor, giving the stacked-ring look. */
const TRUNK_SEGMENT_FLARE = 1.18;
/** Alternate segments are darkened by this factor. */
const TRUNK_BAND_SHADE = 0.82;

/** Fronds: [angle offset from even spacing (rad), length, droop multiplier]. */
const FRONDS: readonly (readonly [number, number, number])[] = [
  [0.0, 0.24, 1.0],
  [0.25, 0.2, 1.15],
  [-0.15, 0.23, 0.9],
  [0.1, 0.19, 1.2],
  [-0.2, 0.25, 0.95],
  [0.18, 0.21, 1.1],
  [-0.08, 0.22, 1.05],
];
/** Positions along a frond (0 at the crown, 1 at the tip) and the half-width there. */
const FROND_STATIONS: readonly (readonly [number, number])[] = [
  [0, 0.008],
  [0.25, 0.042],
  [0.5, 0.046],
  [0.75, 0.032],
  [1, 0],
];
/** Frond height profile, as fractions of its length: rises, then droops. */
const FROND_RISE = 0.5;
const FROND_DROOP = 0.95;
/** Leaflets hang below the midrib by this fraction of the half-width (an inverted V). */
const FROND_FOLD = 0.55;
/** Frond shade at the base and at the tip (multiplies the frond colour). */
const FROND_BASE_SHADE = 0.75;
const FROND_TIP_SHADE = 1.15;

const COCONUT_RADIUS = 0.017;
const COCONUT_SHADE = 0.55;
const COCONUTS: readonly (readonly [number, number])[] = [
  [0.3, 0.024],
  [2.4, 0.022],
  [4.3, 0.026],
];

function trunkCentre(t: number): Vec3 {
  return [TRUNK_CURVE * t * t, PALM_TRUNK_HEIGHT * t, 0];
}

/** Centre of the crown, in palm-local space; the crown twist turns about its vertical axis. */
export const PALM_CROWN_CENTER: Vec3 = (() => {
  const [x, y, z] = trunkCentre(1);
  return [x, y + 0.008, z];
})();

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const shade = (c: Rgb, k: number): Rgb => [
  Math.min(1, c[0] * k),
  Math.min(1, c[1] * k),
  Math.min(1, c[2] * k),
];

interface Vertex {
  p: Vec3;
  sway: number;
  crown: number;
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
      palm.push(v.sway, v.crown);
    }
  };
  const quad = (a: Vertex, b: Vertex, c: Vertex, d: Vertex) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };
  const build = (): PalmGeometryData => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    palm: new Float32Array(palm),
    vertexCount: positions.length / 3,
  });
  return { triangle, quad, build };
}

type Builder = ReturnType<typeof createBuilder>;

function trunkSway(y: number): number {
  const t = Math.max(0, y / PALM_TRUNK_HEIGHT);
  return PALM_TRUNK_TOP_SWAY * t * t;
}

function addTrunk(b: Builder, color: Rgb) {
  const radius = (t: number) => TRUNK_BASE_RADIUS + (TRUNK_TOP_RADIUS - TRUNK_BASE_RADIUS) * t;
  const ring = (t: number, r: number, twist: number, c: Rgb): Vertex[] => {
    const centre = trunkCentre(t);
    return Array.from({ length: TRUNK_SIDES }, (_, k) => {
      const a = twist + (k / TRUNK_SIDES) * Math.PI * 2;
      const p: Vec3 = [centre[0] + Math.cos(a) * r, centre[1], centre[2] + Math.sin(a) * r];
      return { p, sway: trunkSway(p[1]), crown: 0, color: c };
    });
  };

  for (let s = 0; s < TRUNK_SEGMENTS; s++) {
    const t0 = s / TRUNK_SEGMENTS;
    const t1 = (s + 1) / TRUNK_SEGMENTS;
    const c = s % 2 === 0 ? color : shade(color, TRUNK_BAND_SHADE);
    // Twist alternate segments by half a side so the facets don't line up.
    const twist = (s % 2) * (Math.PI / TRUNK_SIDES);
    const flare = s === 0 ? 1 : TRUNK_SEGMENT_FLARE;
    const bottom = ring(t0, radius(t0) * flare, twist, c);
    const top = ring(t1, radius(t1), twist, c);
    for (let k = 0; k < TRUNK_SIDES; k++) {
      const k1 = (k + 1) % TRUNK_SIDES;
      b.quad(bottom[k], top[k], top[k1], bottom[k1]);
    }
    // Cap the top so the trunk never reads as hollow from above.
    if (s === TRUNK_SEGMENTS - 1) {
      for (let k = 1; k < TRUNK_SIDES - 1; k++) b.triangle(top[0], top[k + 1], top[k]);
    }
  }
}

function addFrond(b: Builder, angle: number, length: number, droop: number, color: Rgb) {
  const dir: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
  const side: Vec3 = [-dir[2], 0, dir[0]];
  const [cx, cy, cz] = PALM_CROWN_CENTER;

  const stations = FROND_STATIONS.map(([u, halfWidth]) => {
    const along = length * u;
    const h = length * (FROND_RISE * u - FROND_DROOP * droop * u * u);
    const sway = PALM_TRUNK_TOP_SWAY + (1 - PALM_TRUNK_TOP_SWAY) * u;
    const c = shade(color, FROND_BASE_SHADE + (FROND_TIP_SHADE - FROND_BASE_SHADE) * u);
    const mid: Vec3 = [cx + dir[0] * along, cy + h, cz + dir[2] * along];
    const edge = (sign: number): Vertex => ({
      p: [
        mid[0] + side[0] * halfWidth * sign,
        mid[1] - halfWidth * FROND_FOLD,
        mid[2] + side[2] * halfWidth * sign,
      ],
      sway,
      crown: 1,
      color: c,
    });
    return { mid: { p: mid, sway, crown: 1, color: c } as Vertex, left: edge(-1), right: edge(1) };
  });

  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    b.quad(s0.left, s1.left, s1.mid, s0.mid);
    b.quad(s0.mid, s1.mid, s1.right, s0.right);
  }
}

function addCoconut(b: Builder, angle: number, offset: number, color: Rgb) {
  const [cx, cy, cz] = PALM_CROWN_CENTER;
  const centre: Vec3 = [cx + Math.cos(angle) * offset, cy - 0.022, cz + Math.sin(angle) * offset];
  const r = COCONUT_RADIUS;
  const v = (dx: number, dy: number, dz: number): Vertex => ({
    p: [centre[0] + dx, centre[1] + dy, centre[2] + dz],
    sway: PALM_TRUNK_TOP_SWAY,
    crown: 1,
    color,
  });
  const top = v(0, r, 0);
  const bottom = v(0, -r, 0);
  const ring = [v(r, 0, 0), v(0, 0, r), v(-r, 0, 0), v(0, 0, -r)];
  for (let k = 0; k < 4; k++) {
    const a = ring[k];
    const c = ring[(k + 1) % 4];
    b.triangle(top, c, a);
    b.triangle(bottom, a, c);
  }
}

/** Builds one palm's triangles. Colours are linear RGB in [0, 1]. */
export function buildPalmGeometry(colors: PalmColors): PalmGeometryData {
  const b = createBuilder();
  addTrunk(b, colors.trunk);
  FRONDS.forEach(([offset, length, droop], k) => {
    const angle = (k / FRONDS.length) * Math.PI * 2 + offset;
    addFrond(b, angle, length, droop, colors.frond);
  });
  const coconut = shade(colors.trunk, COCONUT_SHADE);
  for (const [angle, offset] of COCONUTS) addCoconut(b, angle, offset, coconut);
  return b.build();
}
