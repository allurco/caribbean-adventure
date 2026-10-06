/**
 * A collector of coloured triangles for hand-built props (issue #49). Pure,
 * no Three.js. Faces are non-indexed with a normal per vertex. The basic
 * shapes (`triangle`, `quad`, `prism`, `box`) are flat: every vertex of a
 * facet carries the face normal, like the palms, rocks and terrain.
 *
 * The "notch up" tools (issue #59) stay in the same register, chunky
 * silhouettes and bold colour blocks, but give a surface a little more to
 * catch the light: `bevelledBox` chamfers edges, `lathe` and `dome` share
 * normals across their facets so a curve shades smoothly, `smoothNormals`
 * does the same to shapes already collected, `bakeAmbientOcclusion` darkens
 * ground contacts, concavities and the band under an overhang, and
 * `jitterColors` breaks up a flat colour. Passes act on a vertex range
 * `[from, to)` of what has been collected so far (`vertexCount()`), so a
 * piece can be smoothed or shaded part by part before `build()`.
 */
import type { Rgb } from "./palmGeometry";
import { seedOf, stream } from "./variationStream";

export type Vec3 = [number, number, number];

export interface FacetGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB per vertex. */
  colors: Float32Array;
  vertexCount: number;
}

export interface BoxFaces {
  bottom?: boolean;
  top?: boolean;
}

/**
 * Which faces of a bevelled box to draw. A dropped face takes its chamfers
 * and corners with it and the neighbouring faces run out square to the
 * box's bound there, so the piece butts cleanly onto whatever it stands on
 * or against. `left` is −x, `right` +x, `front` +z, `back` −z.
 */
export interface BevelledBoxFaces extends BoxFaces {
  left?: boolean;
  right?: boolean;
  front?: boolean;
  back?: boolean;
}

export interface AmbientOcclusionOptions {
  /** Height above y = 0 over which the ground-contact darkening fades out. */
  groundHeight: number;
  /** How dark the ground contact gets (0 none, 1 black); below y = 0 is fully darkened. */
  groundStrength: number;
  /** Darkening where a normal points back towards the centroid, scaled by how far it does. */
  concavityStrength?: number;
  /** Centre the concavity term measures from; the range's mean position if omitted. */
  centroid?: Vec3;
  /**
   * Horizontal ledges (an eave, a deck) that shade the band `reach` deep
   * below them: a vertex at the ledge's height is darkened by `strength`,
   * fading to nothing `reach` below it. Upward-facing surfaces, the top of
   * the ledge itself, are left alone.
   */
  overhangs?: readonly { y: number; reach: number; strength: number }[];
  from?: number;
  to?: number;
}

export type Axis = "x" | "y" | "z";

const EPSILON = 1e-9;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < EPSILON ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** A key that puts float-noise-apart positions in the same bucket. */
const positionKey = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;

/** Multiplies a colour, clamped to [0, 1]. */
export const shadeRgb = (c: Rgb, k: number): Rgb => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

const AXES: readonly Axis[] = ["x", "y", "z"];
const AXIS_INDEX: Readonly<Record<Axis, number>> = { x: 0, y: 1, z: 2 };
const FACE_NAME: Readonly<Record<Axis, readonly [keyof BevelledBoxFaces, keyof BevelledBoxFaces]>> = {
  x: ["left", "right"],
  y: ["bottom", "top"],
  z: ["back", "front"],
};

export function createFacetBuilder() {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const vertexCount = () => positions.length / 3;

  const push = (p: Vec3, n: Vec3, color: Rgb) => {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    colors.push(color[0], color[1], color[2]);
  };

  /** One triangle with a normal per vertex; degenerate ones are skipped. */
  const triangleWithNormals = (a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3, color: Rgb) => {
    const n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < EPSILON) return;
    push(a, na, color);
    push(b, nb, color);
    push(c, nc, color);
  };

  /** One flat triangle, wound counter-clockwise seen from outside; degenerate ones are skipped. */
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Rgb) => {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
    push(a, n, color);
    push(b, n, color);
    push(c, n, color);
  };

  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb) => {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  };

  /** A flat triangle wound so that it faces away from `centre` (for convex shapes). */
  const outwardTriangle = (a: Vec3, b: Vec3, c: Vec3, centre: Vec3, color: Rgb) => {
    const n = cross(sub(b, a), sub(c, a));
    const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(centroid, centre)) < 0) triangle(a, c, b, color);
    else triangle(a, b, c, color);
  };

  const outwardQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, centre: Vec3, color: Rgb) => {
    outwardTriangle(a, b, c, centre, color);
    outwardTriangle(a, c, d, centre, color);
  };

  /**
   * A prism between a bottom ring and a top ring of four corners each. The
   * bottom ring goes round so that its vertices read counter-clockwise from
   * above (−x−z, −x+z, +x+z, +x−z for an axis-aligned box) and the top ring
   * sits over it corner for corner. A top ring collapsed to one point gives
   * a pyramid.
   */
  const prism = (bottom: readonly Vec3[], top: readonly Vec3[], color: Rgb, faces: BoxFaces = {}) => {
    const n = bottom.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      quad(bottom[k], bottom[k1], top[k1], top[k], color);
    }
    if (faces.top !== false) for (let k = 1; k < n - 1; k++) triangle(top[0], top[k], top[k + 1], color);
    if (faces.bottom !== false) for (let k = 1; k < n - 1; k++) triangle(bottom[0], bottom[k + 1], bottom[k], color);
  };

  /** An axis-aligned box from its min corner to its max corner. */
  const box = (min: Vec3, max: Vec3, color: Rgb, faces: BoxFaces = {}) => {
    const ring = (y: number): Vec3[] => [
      [min[0], y, min[2]],
      [min[0], y, max[2]],
      [max[0], y, max[2]],
      [max[0], y, min[2]],
    ];
    prism(ring(min[1]), ring(max[1]), color, faces);
  };

  /**
   * An axis-aligned box with every edge and corner chamfered by `bevel`
   * (flat chamfer facets): 6 faces, 12 edge strips and 8 corner triangles,
   * 44 triangles in all. The bevel is clamped to half the smallest side.
   */
  const bevelledBox = (min: Vec3, max: Vec3, bevel: number, color: Rgb, faces: BevelledBoxFaces = {}) => {
    const b = Math.max(0, Math.min(bevel, ...AXES.map((_, k) => (max[k] - min[k]) / 2)));
    const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const drawn = (axis: number, sign: number) => faces[FACE_NAME[AXES[axis]][sign > 0 ? 1 : 0]] !== false;
    const outer = (axis: number, sign: number) => (sign > 0 ? max[axis] : min[axis]);
    const inner = (axis: number, sign: number) => (sign > 0 ? max[axis] - b : min[axis] + b);
    /** The vertex of corner `c` that belongs to the face along `axis`: outer on that axis, inset on the others. */
    const corner = (c: readonly number[], axis: number): Vec3 => {
      const p: Vec3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) p[k] = k === axis || !drawn(k, c[k]) ? outer(k, c[k]) : inner(k, c[k]);
      return p;
    };
    const signs = [-1, 1];
    // Faces.
    for (let axis = 0; axis < 3; axis++) {
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      for (const s of signs) {
        if (!drawn(axis, s)) continue;
        const at = (su: number, sv: number) => {
          const c = [0, 0, 0];
          c[axis] = s;
          c[u] = su;
          c[v] = sv;
          return corner(c, axis);
        };
        outwardQuad(at(-1, -1), at(-1, 1), at(1, 1), at(1, -1), centre, color);
      }
    }
    // Edge chamfers between each pair of adjacent faces.
    for (let a = 0; a < 3; a++) {
      for (let bAxis = a + 1; bAxis < 3; bAxis++) {
        const third = 3 - a - bAxis;
        for (const sa of signs) {
          for (const sb of signs) {
            if (!drawn(a, sa) || !drawn(bAxis, sb)) continue;
            const cornerAt = (st: number) => {
              const c = [0, 0, 0];
              c[a] = sa;
              c[bAxis] = sb;
              c[third] = st;
              return c;
            };
            const lo = cornerAt(-1);
            const hi = cornerAt(1);
            outwardQuad(corner(lo, a), corner(hi, a), corner(hi, bAxis), corner(lo, bAxis), centre, color);
          }
        }
      }
    }
    // Corner triangles.
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          const c = [sx, sy, sz];
          if (!drawn(0, sx) || !drawn(1, sy) || !drawn(2, sz)) continue;
          outwardTriangle(corner(c, 0), corner(c, 1), corner(c, 2), centre, color);
        }
      }
    }
  };

  /**
   * A surface of revolution about Y from an `(r, y)` profile listed from
   * the bottom up (r ≥ 0; a point with r = 0 is a pole). Normals come from
   * the profile's tangent, averaged over the two segments at each point,
   * and are shared round the ring, so the surface shades smoothly. Repeat a
   * point to put a crease there: each copy takes the tangent of its own
   * side only, so a flat end on a cylinder stays flat.
   */
  const lathe = (profile: readonly (readonly [number, number])[], segments: number, color: Rgb) => {
    const n = profile.length;
    const same = (i: number, j: number) => Math.abs(profile[i][0] - profile[j][0]) < EPSILON && Math.abs(profile[i][1] - profile[j][1]) < EPSILON;
    // Profile-space normals (nr, ny) per point.
    const profileNormals = profile.map(([r], i) => {
      let tr = 0;
      let ty = 0;
      const add = (from: number, to: number) => {
        const dr = profile[to][0] - profile[from][0];
        const dy = profile[to][1] - profile[from][1];
        const len = Math.hypot(dr, dy);
        if (len < EPSILON) return;
        tr += dr / len;
        ty += dy / len;
      };
      if (i > 0 && !same(i - 1, i)) add(i - 1, i);
      if (i < n - 1 && !same(i, i + 1)) add(i, i + 1);
      const len = Math.hypot(tr, ty);
      if (len < EPSILON) return [1, 0] as const;
      // Outward is to the right of the direction of travel.
      const nr = ty / len;
      const ny = -tr / len;
      if (r < EPSILON) return [0, ny >= 0 ? 1 : -1] as const;
      return [nr, ny] as const;
    });
    const point = (i: number, k: number): Vec3 => {
      const phi = (2 * Math.PI * (k % segments)) / segments;
      return [profile[i][0] * Math.cos(phi), profile[i][1], profile[i][0] * Math.sin(phi)];
    };
    const normalAt = (i: number, k: number): Vec3 => {
      const phi = (2 * Math.PI * (k % segments)) / segments;
      const [nr, ny] = profileNormals[i];
      return [nr * Math.cos(phi), ny, nr * Math.sin(phi)];
    };
    const oriented = (a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3) => {
      const face = cross(sub(b, a), sub(c, a));
      const wanted: Vec3 = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
      if (dot(face, wanted) < 0) triangleWithNormals(a, c, b, na, nc, nb, color);
      else triangleWithNormals(a, b, c, na, nb, nc, color);
    };
    for (let i = 0; i < n - 1; i++) {
      if (same(i, i + 1)) continue;
      for (let k = 0; k < segments; k++) {
        const [a, b, c, d] = [point(i, k), point(i, k + 1), point(i + 1, k + 1), point(i + 1, k)];
        const [na, nb, nc, nd] = [normalAt(i, k), normalAt(i, k + 1), normalAt(i + 1, k + 1), normalAt(i + 1, k)];
        oriented(a, b, c, na, nb, nc);
        oriented(a, c, d, na, nc, nd);
      }
    }
  };

  /** A smooth dome of `radius` and `height` over an open base at y = 0, its pole up. */
  const dome = (radius: number, height: number, segments: number, rings: number, color: Rgb) => {
    const profile: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
      const theta = (Math.PI / 2) * (i / rings);
      profile.push([radius * Math.cos(theta), height * Math.sin(theta)]);
    }
    lathe(profile, segments, color);
  };

  /**
   * Averages face normals over coincident positions within `[from, to)`,
   * so a faceted shape shades smoothly there. Faces that meet at more than
   * `creaseAngleDeg` keep their own normal, which leaves sharp edges hard.
   */
  const smoothNormals = (from = 0, to = vertexCount(), creaseAngleDeg = 180) => {
    const cosCrease = Math.cos((creaseAngleDeg * Math.PI) / 180);
    const facesAt = new Map<string, Vec3[]>();
    for (let i = from; i < to; i++) {
      const key = positionKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const n: Vec3 = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
      const list = facesAt.get(key) ?? [];
      // One entry per distinct face normal, so a face split into two triangles counts once.
      if (!list.some((m) => dot(m, n) > 1 - 1e-6)) list.push(n);
      facesAt.set(key, list);
    }
    const smoothed: number[] = [];
    for (let i = from; i < to; i++) {
      const own: Vec3 = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
      const sum: Vec3 = [0, 0, 0];
      for (const m of facesAt.get(positionKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])) ?? []) {
        if (dot(m, own) < cosCrease - 1e-9) continue;
        sum[0] += m[0];
        sum[1] += m[1];
        sum[2] += m[2];
      }
      const n = normalize(sum);
      smoothed.push(...(n[0] === 0 && n[1] === 0 && n[2] === 0 ? own : n));
    }
    for (let k = 0; k < smoothed.length; k++) normals[from * 3 + k] = smoothed[k];
  };

  /**
   * Darkens vertex colours by a cheap occlusion estimate: ground contact
   * (rising from y = 0 over `groundHeight`), concavity (a normal that points
   * back towards the centroid) and the band under each overhang.
   */
  const bakeAmbientOcclusion = (options: AmbientOcclusionOptions) => {
    const from = options.from ?? 0;
    const to = options.to ?? vertexCount();
    const concavity = options.concavityStrength ?? 0;
    let centroid = options.centroid;
    if (!centroid) {
      centroid = [0, 0, 0];
      const count = Math.max(1, to - from);
      for (let i = from; i < to; i++) for (let k = 0; k < 3; k++) centroid[k] += positions[i * 3 + k] / count;
    }
    for (let i = from; i < to; i++) {
      const p: Vec3 = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const n: Vec3 = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
      let light = 1;
      const rise = options.groundHeight > 0 ? clamp01(p[1] / options.groundHeight) : p[1] > 0 ? 1 : 0;
      light *= 1 - options.groundStrength * (1 - rise);
      if (concavity > 0) {
        const d = dot(n, normalize(sub(p, centroid)));
        if (d < 0) light *= 1 - concavity * -d;
      }
      for (const ledge of options.overhangs ?? []) {
        if (n[1] > 0.5 || p[1] > ledge.y + EPSILON || ledge.reach <= 0) continue;
        light *= 1 - ledge.strength * clamp01(1 - (ledge.y - p[1]) / ledge.reach);
      }
      for (let k = 0; k < 3; k++) colors[i * 3 + k] = clamp01(colors[i * 3 + k] * light);
    }
  };

  /**
   * Scales each vertex colour by a factor within 1 ± `amount`, hashed from
   * the vertex position and `seed`, so coincident vertices agree and the
   * result is the same on every client.
   */
  const jitterColors = (amount: number, seed: number, from = 0, to = vertexCount()) => {
    for (let i = from; i < to; i++) {
      const next = stream(seedOf([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], seed));
      const factor = 1 + (next() * 2 - 1) * amount;
      for (let k = 0; k < 3; k++) colors[i * 3 + k] = clamp01(colors[i * 3 + k] * factor);
    }
  };

  /** Turns the vertices in `[from, to)` (and their normals) about a world axis through the origin. */
  const rotate = (from: number, to: number, axis: Axis, angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const a = AXIS_INDEX[axis];
    const [u, v] = [(a + 1) % 3, (a + 2) % 3];
    const turn = (array: number[], i: number) => {
      const pu = array[i * 3 + u];
      const pv = array[i * 3 + v];
      array[i * 3 + u] = pu * cos - pv * sin;
      array[i * 3 + v] = pu * sin + pv * cos;
    };
    for (let i = from; i < to; i++) {
      turn(positions, i);
      turn(normals, i);
    }
  };

  const translate = (from: number, to: number, delta: Vec3) => {
    for (let i = from; i < to; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] += delta[k];
  };

  const build = (): FacetGeometryData => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    vertexCount: vertexCount(),
  });

  return {
    triangle,
    triangleWithNormals,
    quad,
    prism,
    box,
    bevelledBox,
    lathe,
    dome,
    smoothNormals,
    bakeAmbientOcclusion,
    jitterColors,
    rotate,
    translate,
    vertexCount,
    build,
  };
}

export type FacetBuilder = ReturnType<typeof createFacetBuilder>;
