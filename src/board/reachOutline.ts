/**
 * The turn's reach drawn as lines rather than fills (#213 polish): the
 * outline round the whole set of hexes in reach, faint inner rings where the
 * cost steps up, and a light tint, all clipped to the water so nothing lies
 * over a beach. The coast needs no line of its own: the land already bounds
 * the reach there. Pure; `ReachOverlay` draws the geometry.
 */
import type { Hex } from "../game/hex";
import { canonicalHex, hexToWorld, neighbors } from "../game/hex";
import type { MapCell } from "../game/types";
import type { Reach } from "../game/reach";
import type { Point } from "./shipMotion";

export interface Segment {
  readonly a: Point;
  readonly b: Point;
}

/** Ground height at world (x, z); below 0 is under water. */
export type HeightAt = (x: number, z: number) => number;

/** How far below sea level the ground must be for the overlay to lie on it: off the wet sand. */
export const WATER_MARGIN = 0.004;
const isWater = (heightAt: HeightAt, x: number, z: number): boolean => heightAt(x, z) < -WATER_MARGIN;

const key = (h: Hex): string => `${h.q},${h.r}`;

/** The six corners of the flat-top hex at `centre`, as the board lays its hex shapes down. */
export function hexCorners([cx, cz]: Point, radius = 1): Point[] {
  return Array.from({ length: 6 }, (_, i): Point => {
    const angle = (Math.PI / 3) * i;
    return [cx + radius * Math.cos(angle), cz - radius * Math.sin(angle)];
  });
}

const centreOf = (h: Hex): Point => {
  const [x, , z] = hexToWorld(h);
  return [x, z];
};

const dist2 = (p: Point, q: Point): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

/** The edge `h` shares with its neighbour `n` (an unwrapped neighbour, for the geometry). */
function sharedEdge(h: Hex, n: Hex): Segment {
  const towards = centreOf(n);
  const [a, b] = hexCorners(centreOf(h))
    .map((c) => ({ c, d: dist2(c, towards) }))
    .sort((x, y) => x.d - y.d);
  return { a: a.c, b: b.c };
}

/**
 * The reach's outline and cost rings. `boundary`: every edge between a hex
 * in reach (or the ship's own) and open water out of reach. `rings`: every
 * edge where the cost steps from 1 to 2, 2 to 3 and so on.
 */
export function reachEdges(reach: Reach, cells: readonly MapCell[]): { boundary: Segment[]; rings: Segment[] } {
  const terrain = new Map(cells.map((c) => [key(c.hex), c.terrain]));
  const costs = new Map<string, number>([[key(reach.start), 0]]);
  for (const s of reach.hexes) costs.set(key(s.hex), s.cost);
  const inSet: Hex[] = [reach.start, ...reach.hexes.map((s) => s.hex)];
  const boundary: Segment[] = [];
  const rings: Segment[] = [];
  for (const h of inSet) {
    const cost = costs.get(key(h)) ?? 0;
    for (const n of neighbors(h)) {
      const k = key(canonicalHex(n, reach.wrap));
      const other = costs.get(k);
      if (other === undefined) {
        // Land bounds the reach on its own; off the map is open sea
        if (terrain.get(k) === "island") continue;
        boundary.push(sharedEdge(h, n));
      } else if (cost >= 1 && other === cost + 1) {
        rings.push(sharedEdge(h, n));
      }
    }
  }
  return { boundary, rings };
}

/** `segments` cut into `pieces` each, keeping the pieces whose middle is over water. */
export function clipToWater(segments: readonly Segment[], heightAt: HeightAt, pieces = 4): Segment[] {
  const out: Segment[] = [];
  for (const { a, b } of segments) {
    for (let i = 0; i < pieces; i++) {
      const p = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const mid = p((i + 0.5) / pieces);
      if (isWater(heightAt, mid[0], mid[1])) out.push({ a: p(i / pieces), b: p((i + 1) / pieces) });
    }
  }
  return out;
}

/**
 * Flat ribbons `width` wide along `segments` at height `y`, as triangle
 * positions (x, y, z per vertex). Each runs half a width past its ends, so
 * ribbons meeting at a corner close the gap.
 */
export function ribbonPositions(segments: readonly Segment[], width: number, y: number): Float32Array {
  const out = new Float32Array(segments.length * 18);
  const h = width / 2;
  segments.forEach(({ a, b }, i) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / len;
    const dz = (b[1] - a[1]) / len;
    // Ends pushed out along the segment, sides out across it
    const a0: Point = [a[0] - dx * h, a[1] - dz * h];
    const b0: Point = [b[0] + dx * h, b[1] + dz * h];
    const nx = -dz * h;
    const nz = dx * h;
    const quad: Point[] = [
      [a0[0] + nx, a0[1] + nz],
      [a0[0] - nx, a0[1] - nz],
      [b0[0] - nx, b0[1] - nz],
      [a0[0] + nx, a0[1] + nz],
      [b0[0] - nx, b0[1] - nz],
      [b0[0] + nx, b0[1] + nz],
    ];
    quad.forEach(([x, z], v) => out.set([x, y, z], i * 18 + v * 3));
  });
  return out;
}

/**
 * The hexes at `centres` as small triangles at height `y`, keeping only
 * those over water: each of a hex's six wedges is cut into `steps`² pieces.
 * Triangle positions (x, y, z per vertex).
 */
export function waterHexTriangles(centres: readonly Point[], heightAt: HeightAt, y: number, radius = 1, steps = 3): Float32Array {
  const tris: number[] = [];
  for (const centre of centres) {
    const corners = hexCorners(centre, radius);
    for (let w = 0; w < 6; w++) {
      const o = centre;
      const u = corners[w];
      const v = corners[(w + 1) % 6];
      // Barycentric grid on the wedge (o, u, v)
      const at = (i: number, j: number): Point => {
        const s = i / steps;
        const t = j / steps;
        return [o[0] + (u[0] - o[0]) * s + (v[0] - o[0]) * t, o[1] + (u[1] - o[1]) * s + (v[1] - o[1]) * t];
      };
      const keep = (p: Point, q: Point, r: Point) => {
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cz = (p[1] + q[1] + r[1]) / 3;
        if (isWater(heightAt, cx, cz)) tris.push(p[0], y, p[1], q[0], y, q[1], r[0], y, r[1]);
      };
      for (let i = 0; i < steps; i++) {
        for (let j = 0; j + i < steps; j++) {
          keep(at(i, j), at(i + 1, j), at(i, j + 1));
          if (i + j + 1 < steps) keep(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
        }
      }
    }
  }
  return new Float32Array(tris);
}
