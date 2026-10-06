/**
 * A collector of flat-shaded, coloured triangles for hand-built props
 * (issue #49). Pure, no Three.js. Faces are non-indexed with a face normal
 * per vertex, so every facet is flat, like the palms, rocks and terrain.
 */
import type { Rgb } from "./palmGeometry";

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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Multiplies a colour, clamped to [0, 1]. */
export const shadeRgb = (c: Rgb, k: number): Rgb => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

export function createFacetBuilder() {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  /** One triangle, wound counter-clockwise seen from outside; degenerate ones are skipped. */
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Rgb) => {
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0] / len, n[1] / len, n[2] / len);
      colors.push(color[0], color[1], color[2]);
    }
  };

  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb) => {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
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

  const build = (): FacetGeometryData => ({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  });

  return { triangle, quad, prism, box, build };
}

export type FacetBuilder = ReturnType<typeof createFacetBuilder>;
