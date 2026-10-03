/**
 * Reef mask (issue #11): how much of a point is reef, for the ocean shader.
 *
 * Pure, no Three.js, so it is unit-tested. It is baked into the B channel of
 * the terrain field texture (`terrainFieldTexture.ts`), so the shader reads the
 * reefs from the texture it already samples instead of a uniform per cell.
 *
 *   mask(p) = 0                                 p is in a non-reef hex (or off the map)
 *           = smoothstep(0, REEF_EDGE_SOFTNESS, d)  p is in a reef hex, d = distance to
 *                                               the nearest edge shared with a non-reef hex
 *
 * So a reef hex is fully masked except for a soft rim just inside its outline,
 * the mask is exactly 0 at and beyond that outline (no non-reef hex ever reads
 * as reef), and edges between two reef hexes don't count, so a reef spanning
 * several hexes has no seam. The outline stays on the hex edges on purpose:
 * reefs block deep-draft ships, so players need to see which hex is reef.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, worldToHex } from "../../game/hex";

/** Width of the soft rim just inside a reef hex's outline, in world units (inradius is √3/2). */
export const REEF_EDGE_SOFTNESS = 0.2;

/** Axial neighbour offsets, in the same order as `hex.ts`'s neighbours. */
const HEX_DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const SQRT3 = Math.sqrt(3);

const key = (q: number, r: number): string => `${q},${r}`;

function pointSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax;
  const ez = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez)));
  const dx = px - (ax + ex * t);
  const dz = pz - (az + ez * t);
  return Math.sqrt(dx * dx + dz * dz);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A reef mask in [0, 1] at world (x, z) for the map. Build once per map; sampling is O(1). */
export function createReefMask(cells: readonly MapCell[]): (x: number, z: number) => number {
  const reefs = new Set<string>();
  for (const cell of cells) {
    if (cell.terrain === "reef") reefs.add(key(cell.hex.q, cell.hex.r));
  }

  // Per reef hex, its edges that border a non-reef hex, as flat [ax, az, bx, bz, …].
  const rimEdges = new Map<string, Float64Array>();
  for (const k of reefs) {
    const [q, r] = k.split(",").map(Number);
    const [cx, , cz] = hexToWorld({ q, r, s: -q - r });
    const edges: number[] = [];
    for (const [dq, dr] of HEX_DIRS) {
      if (reefs.has(key(q + dq, r + dr))) continue;
      const [nx, , nz] = hexToWorld({ q: q + dq, r: r + dr, s: -q - dq - r - dr });
      // The shared edge passes through the midpoint of the centres, perpendicular
      // to them, with half-length 0.5 (edge length equals hex size 1).
      const mx = (cx + nx) / 2;
      const mz = (cz + nz) / 2;
      const ux = (nx - cx) / SQRT3;
      const uz = (nz - cz) / SQRT3;
      edges.push(mx - uz * 0.5, mz + ux * 0.5, mx + uz * 0.5, mz - ux * 0.5);
    }
    rimEdges.set(k, Float64Array.from(edges));
  }

  return (x: number, z: number): number => {
    const h = worldToHex(x, z);
    const edges = rimEdges.get(key(h.q, h.r));
    if (!edges) return 0;
    let d = Infinity;
    for (let i = 0; i < edges.length; i += 4) {
      d = Math.min(d, pointSegmentDistance(x, z, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]));
    }
    return smoothstep(0, REEF_EDGE_SOFTNESS, d);
  };
}
