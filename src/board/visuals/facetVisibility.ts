/**
 * A test-side guard for hand-built facet geometry: casts parallel rays at
 * a piece from many directions above the ground and checks that the first
 * facet each ray meets faces the ray. A facet wound inside out is met from
 * its back; a missing exterior facet lets the ray through to an interior
 * face, also met from its back. Either is a hole the player would see.
 * Pure, no Three.js; used by the geometry tests.
 */
import type { FacetGeometryData, Vec3 } from "./facetBuilder";

export interface BackfaceHit {
  /** The ray's direction (unit, into the scene). */
  direction: Vec3;
  /** Where the ray met the back-facing facet. */
  point: Vec3;
  /** Index of the triangle it met. */
  triangle: number;
}

export interface VisibilityOptions {
  /** Azimuths round the piece. */
  azimuths?: number;
  /** Elevations of the viewing directions (radians above the horizon; a little below is allowed, to look under eaves). */
  elevations?: readonly number[];
  /** Rays per side of the square grid each direction casts. */
  grid?: number;
  /** Rays below this height at their nearest approach to the axis are not cast (the footing is underground). */
  minY?: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Möller–Trumbore, both sides: the distance along the ray, or null. */
function hitDistance(origin: Vec3, dir: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = sub(origin, a);
  const u = dot(s, p) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const q = cross(s, e1);
  const v = dot(dir, q) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = dot(e2, q) * inv;
  return t > 1e-9 ? t : null;
}

/**
 * Every ray whose first facet faces away from it. Rays cast in a square
 * grid across the piece's bounding sphere, from each direction; a ray that
 * meets several facets at the same distance (coplanar faces of touching
 * solids) passes if any of them faces it.
 */
export function backfacingFirstHits(g: FacetGeometryData, options: VisibilityOptions = {}): BackfaceHit[] {
  const azimuths = options.azimuths ?? 12;
  const elevations = options.elevations ?? [-0.08, 0.25, 0.7, 1.2];
  const grid = options.grid ?? 20;
  const minY = options.minY ?? -1e-6;
  const triangles = g.vertexCount / 3;
  const tri = (t: number, k: number): Vec3 => [g.positions[(t * 3 + k) * 3], g.positions[(t * 3 + k) * 3 + 1], g.positions[(t * 3 + k) * 3 + 2]];
  const faceNormals: Vec3[] = [];
  let radius = 0;
  let top = 0;
  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [tri(t, 0), tri(t, 1), tri(t, 2)];
    faceNormals.push(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) {
      radius = Math.max(radius, Math.hypot(p[0], p[2]));
      top = Math.max(top, p[1]);
    }
  }
  const reach = Math.hypot(radius, top) + 0.01;
  const hits: BackfaceHit[] = [];
  const directions: Vec3[] = [[0, -1, 0]];
  for (const e of elevations) {
    for (let i = 0; i < azimuths; i++) {
      const az = (i / azimuths) * Math.PI * 2 + 0.013;
      directions.push([-Math.cos(e) * Math.sin(az), -Math.sin(e), -Math.cos(e) * Math.cos(az)]);
    }
  }
  const centre: Vec3 = [0, top / 2, 0];
  for (const d of directions) {
    const up: Vec3 = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    const u = cross(d, up);
    const ul = Math.hypot(...u);
    const uu: Vec3 = [u[0] / ul, u[1] / ul, u[2] / ul];
    const vv = cross(uu, d);
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const a = ((i + 0.5) / grid - 0.5) * 2 * reach;
        const b = ((j + 0.5) / grid - 0.5) * 2 * reach;
        const origin: Vec3 = [
          centre[0] - d[0] * reach * 2 + uu[0] * a + vv[0] * b,
          centre[1] - d[1] * reach * 2 + uu[1] * a + vv[1] * b,
          centre[2] - d[2] * reach * 2 + uu[2] * a + vv[2] * b,
        ];
        let best = Infinity;
        let frontAtBest = false;
        let bestTriangle = -1;
        for (let t = 0; t < triangles; t++) {
          const dist = hitDistance(origin, d, tri(t, 0), tri(t, 1), tri(t, 2));
          if (dist === null) continue;
          const front = dot(faceNormals[t], d) < 0;
          if (dist < best - 1e-7) {
            best = dist;
            frontAtBest = front;
            bestTriangle = t;
          } else if (Math.abs(dist - best) <= 1e-7 && front) {
            frontAtBest = true;
          }
        }
        if (bestTriangle < 0 || frontAtBest) continue;
        const point: Vec3 = [origin[0] + d[0] * best, origin[1] + d[1] * best, origin[2] + d[2] * best];
        if (point[1] < minY) continue;
        hits.push({ direction: d, point, triangle: bestTriangle });
      }
    }
  }
  return hits;
}

export interface OpposedOverlap {
  /** Indices of the two triangles. */
  triangles: [number, number];
  /** Unit normal of the first. */
  normal: Vec3;
  /** A point inside the area they share. */
  point: Vec3;
  /** The area they share. */
  area: number;
}

type Pt2 = readonly [number, number];

/**
 * Pairs of triangles that lie in one plane, face opposite ways, overlap
 * over an area, and are the outermost surface there from at least one
 * side: what a concave outline fan-triangulated from the wrong corner
 * leaves behind, one triangle wound inside out under a sound one. The ray
 * guard above lets that through, since a ray meets both at the same
 * distance and one of them faces it; this finds it directly. Pairs buried
 * inside the piece (a plank's top under the lintel that sits on it) are
 * not reported, nor are triangles that only share an edge or a corner, nor
 * two that face the same way (a slab laid over a wall). Pairs below `minY`
 * are underground and ignored.
 */
export function opposedCoplanarOverlaps(g: FacetGeometryData, options: { tolerance?: number; minY?: number } = {}): OpposedOverlap[] {
  const tolerance = options.tolerance ?? 1e-6;
  const minY = options.minY ?? -1e-6;
  const triangles = g.vertexCount / 3;
  const tri = (t: number, k: number): Vec3 => [g.positions[(t * 3 + k) * 3], g.positions[(t * 3 + k) * 3 + 1], g.positions[(t * 3 + k) * 3 + 2]];
  const faces: { n: Vec3; d: number; area: number; u: Vec3; v: Vec3; pts: Pt2[] }[] = [];
  let reach = 0;
  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [tri(t, 0), tri(t, 1), tri(t, 2)];
    for (const p of [a, b, c]) reach = Math.max(reach, Math.hypot(...p));
    const nn = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(...nn);
    if (len < 1e-12) {
      faces.push({ n: [0, 0, 0], d: 0, area: 0, u: [0, 0, 0], v: [0, 0, 0], pts: [] });
      continue;
    }
    const n: Vec3 = [nn[0] / len, nn[1] / len, nn[2] / len];
    // A 2D frame in the plane; the triangle's own points come out counter-clockwise in it.
    const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u0 = cross(ref, n);
    const ul = Math.hypot(...u0);
    const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
    const v = cross(n, u);
    faces.push({ n, d: dot(n, a), area: len / 2, u, v, pts: [a, b, c].map((p): Pt2 => [dot(p, u), dot(p, v)]) });
  }
  const firstHitIsAt = (origin: Vec3, dir: Vec3, distance: number) => {
    let best = Infinity;
    for (let t = 0; t < triangles; t++) {
      const dist = hitDistance(origin, dir, tri(t, 0), tri(t, 1), tri(t, 2));
      if (dist !== null && dist < best) best = dist;
    }
    return Math.abs(best - distance) <= 1e-7;
  };
  const found: OpposedOverlap[] = [];
  for (let i = 0; i < triangles; i++) {
    const f = faces[i];
    if (f.area === 0) continue;
    for (let j = i + 1; j < triangles; j++) {
      const h = faces[j];
      if (h.area === 0) continue;
      // Opposite normals on the same plane: n_j = -n_i and the plane offsets negate with it.
      if (Math.abs(f.n[0] + h.n[0]) > 1e-6 || Math.abs(f.n[1] + h.n[1]) > 1e-6 || Math.abs(f.n[2] + h.n[2]) > 1e-6) continue;
      if (Math.abs(f.d + h.d) > tolerance) continue;
      // The other triangle in this frame, turned counter-clockwise for the clip.
      const other = [tri(j, 0), tri(j, 2), tri(j, 1)].map((p): Pt2 => [dot(p, f.u), dot(p, f.v)]);
      const shared = clipConvex(f.pts, other, tolerance);
      const area = polygonArea(shared);
      if (area <= tolerance * tolerance) continue;
      const [s, t] = polygonCentroid(shared);
      const point: Vec3 = [
        f.u[0] * s + f.v[0] * t + f.n[0] * f.d,
        f.u[1] * s + f.v[1] * t + f.n[1] * f.d,
        f.u[2] * s + f.v[2] * t + f.n[2] * f.d,
      ];
      if (point[1] < minY) continue;
      // Exposed from either side: a ray along the normal from well outside meets this plane first.
      const far = reach * 2 + 1;
      const exposed = ([1, -1] as const).some((sign) => {
        const dir: Vec3 = [-sign * f.n[0], -sign * f.n[1], -sign * f.n[2]];
        const origin: Vec3 = [point[0] + sign * f.n[0] * far, point[1] + sign * f.n[1] * far, point[2] + sign * f.n[2] * far];
        return firstHitIsAt(origin, dir, far);
      });
      if (exposed) found.push({ triangles: [i, j], normal: f.n, point, area });
    }
  }
  return found;
}

/** Sutherland–Hodgman: the subject polygon clipped to a convex counter-clockwise clip polygon. */
function clipConvex(subject: readonly Pt2[], clip: readonly Pt2[], tolerance: number): Pt2[] {
  let output: Pt2[] = [...subject];
  for (let k = 0; k < clip.length && output.length > 0; k++) {
    const p = clip[k];
    const q = clip[(k + 1) % clip.length];
    const inside = (r: Pt2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) >= -tolerance;
    const cross2 = (a: Pt2, b: Pt2): Pt2 => {
      const da: Pt2 = [b[0] - a[0], b[1] - a[1]];
      const de: Pt2 = [q[0] - p[0], q[1] - p[1]];
      const denom = da[0] * de[1] - da[1] * de[0];
      const s = denom === 0 ? 0 : ((p[0] - a[0]) * de[1] - (p[1] - a[1]) * de[0]) / denom;
      return [a[0] + da[0] * s, a[1] + da[1] * s];
    };
    const input = output;
    output = [];
    for (let m = 0; m < input.length; m++) {
      const current = input[m];
      const previous = input[(m + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(cross2(previous, current));
        output.push(current);
      } else if (inside(previous)) {
        output.push(cross2(previous, current));
      }
    }
  }
  return output;
}

function polygonArea(poly: readonly Pt2[]): number {
  let twice = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(twice) / 2;
}

function polygonCentroid(poly: readonly Pt2[]): Pt2 {
  let cx = 0;
  let cy = 0;
  let twice = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    const w = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * w;
    cy += (p[1] + q[1]) * w;
    twice += w;
  }
  if (Math.abs(twice) < 1e-18) return poly[0];
  return [cx / (3 * twice), cy / (3 * twice)];
}
