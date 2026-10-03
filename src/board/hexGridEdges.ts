import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";

/**
 * Pure geometry for the water hex grid lines (issue #32).
 *
 * The grid is built from unique edges at full hex size, so two neighbouring
 * hexes share one line instead of each drawing its own inset ring. Each edge
 * remembers the one or two hexes it borders, so per-hex emphasis (hover,
 * targets) can be resolved per edge as the stronger of the two.
 */

/** Owner slot value for an edge on the border of the given hex set. */
export const NO_HEX = -1;

/**
 * Neighbour offset (dq, dr) across edge `i`, where edge `i` runs from corner
 * `i` to corner `i + 1` and corner `i` sits at local angle 60°·i, laid flat on
 * the XZ plane as (cos, -sin) like the hex shapes in `HexGrid.tsx`.
 */
const EDGE_NEIGHBOR_DIRS: readonly (readonly [number, number])[] = [
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
];

const CORNER_OFFSETS: readonly (readonly [number, number])[] = Array.from(
  { length: 6 },
  (_, i) => {
    const angle = (Math.PI / 3) * i;
    return [Math.cos(angle), -Math.sin(angle)] as const;
  }
);

export interface HexGridEdges {
  /** Number of unique edges. */
  count: number;
  /** Two world-space XZ corners per edge: ax, az, bx, bz. */
  corners: Float32Array;
  /** Two hex indices per edge; the second is `NO_HEX` on the border. */
  owners: Int32Array;
}

const hexKey = (q: number, r: number) => `${q},${r}`;

/** The unique full-size edges of a set of flat-top hexes (hex size 1). */
export function buildHexGridEdges(hexes: readonly Hex[]): HexGridEdges {
  const indexByHex = new Map<string, number>();
  hexes.forEach((h, i) => indexByHex.set(hexKey(h.q, h.r), i));

  const corners: number[] = [];
  const owners: number[] = [];
  hexes.forEach((h, i) => {
    const [cx, , cz] = hexToWorld(h);
    for (let edge = 0; edge < 6; edge++) {
      const [dq, dr] = EDGE_NEIGHBOR_DIRS[edge];
      const neighbour = indexByHex.get(hexKey(h.q + dq, h.r + dr));
      // A shared edge is emitted once, by the lower-indexed hex.
      if (neighbour !== undefined && neighbour < i) continue;
      const a = CORNER_OFFSETS[edge];
      const b = CORNER_OFFSETS[(edge + 1) % 6];
      corners.push(cx + a[0], cz + a[1], cx + b[0], cz + b[1]);
      owners.push(i, neighbour ?? NO_HEX);
    }
  });

  return {
    count: owners.length / 2,
    corners: new Float32Array(corners),
    owners: new Int32Array(owners),
  };
}

/**
 * LineSegments positions (xyz per vertex) for `edges` at height `y`, each
 * edge split into `subdivisions` segments so per-vertex attributes such as
 * the shore fade can vary along it.
 */
export function buildEdgeLinePositions(
  edges: HexGridEdges,
  y: number,
  subdivisions: number
): Float32Array {
  const positions = new Float32Array(edges.count * subdivisions * 2 * 3);
  const c = edges.corners;
  let p = 0;
  for (let e = 0; e < edges.count; e++) {
    const ax = c[e * 4];
    const az = c[e * 4 + 1];
    const dx = c[e * 4 + 2] - ax;
    const dz = c[e * 4 + 3] - az;
    for (let s = 0; s < subdivisions; s++) {
      const t0 = s / subdivisions;
      const t1 = (s + 1) / subdivisions;
      positions[p++] = ax + dx * t0;
      positions[p++] = y;
      positions[p++] = az + dz * t0;
      positions[p++] = ax + dx * t1;
      positions[p++] = y;
      positions[p++] = az + dz * t1;
    }
  }
  return positions;
}

/**
 * Per-vertex emphasis (minimum opacity) for the line positions built by
 * `buildEdgeLinePositions`. `emphasisByHex` maps a hex index to its emphasis;
 * an edge takes the larger value of the two hexes it borders.
 */
export function buildEdgeEmphasis(
  edges: HexGridEdges,
  subdivisions: number,
  emphasisByHex: ReadonlyMap<number, number>,
  target: Float32Array = new Float32Array(edges.count * subdivisions * 2)
): Float32Array {
  const vertsPerEdge = subdivisions * 2;
  const of = (hexIndex: number) =>
    hexIndex === NO_HEX ? 0 : (emphasisByHex.get(hexIndex) ?? 0);
  for (let e = 0; e < edges.count; e++) {
    const value = Math.max(of(edges.owners[e * 2]), of(edges.owners[e * 2 + 1]));
    target.fill(value, e * vertsPerEdge, (e + 1) * vertsPerEdge);
  }
  return target;
}

export interface ShoreFadeParams {
  /** Offshore distance (world units) inside which lines are hidden. */
  clearStart: number;
  /** Offshore distance beyond which lines are at full strength. */
  clearEnd: number;
}

/**
 * Lines fade out across the shallows so they do not stack on the shore surf,
 * whose outer breaker reaches ~0.62 offshore (`SURF_MAX_REACH` in Ocean.tsx).
 */
export const SHORE_FADE: ShoreFadeParams = {
  clearStart: 0.15,
  clearEnd: 0.7,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Line strength (0..1) for a signed coast distance (positive on land,
 * negative over water, as `TerrainHeightField.sampleCoastDistance`).
 */
export function shoreFade(
  coastDistance: number,
  { clearStart, clearEnd }: ShoreFadeParams = SHORE_FADE
): number {
  return smoothstep(clearStart, clearEnd, -coastDistance);
}

/** Per-vertex shore fade for line positions (xyz per vertex). */
export function buildEdgeShoreFade(
  positions: Float32Array,
  coastDistance: (x: number, z: number) => number,
  params: ShoreFadeParams = SHORE_FADE
): Float32Array {
  const fade = new Float32Array(positions.length / 3);
  for (let v = 0; v < fade.length; v++) {
    fade[v] = shoreFade(coastDistance(positions[v * 3], positions[v * 3 + 2]), params);
  }
  return fade;
}
