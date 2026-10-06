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
