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
import { hexToWorld, worldToHex, type MapWrap } from "../../game/hex";
import { seamStrip, withSeamImages, wrapIntoStrip } from "./seamStrip";

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

/** A point in the strip is at most a hex (2 units) from the rim edges it reads. */
const SEAM_IMAGE_MARGIN = 3;

/** Floats per rim edge in the table: the edge's ends (ax, az, bx, bz) and its outward unit normal (ux, uz). */
const EDGE_STRIDE = 6;

interface ReefRim {
  /** Per reef hex (by axial key), its edges that border a non-reef hex, EDGE_STRIDE floats each. */
  edges: Map<string, Float64Array>;
  /** Moves a world x into the seam strip on a wrapping map. */
  intoStrip: (x: number) => number;
}

/** The reef hexes' rim edges, shared by the mask and the outward normal. */
function reefRim(cells: readonly MapCell[], wrap: MapWrap): ReefRim {
  const strip = seamStrip(wrap);
  const reefs = new Set<string>();
  for (const cell of withSeamImages(cells, wrap, SEAM_IMAGE_MARGIN)) {
    if (cell.terrain === "reef") reefs.add(key(cell.hex.q, cell.hex.r));
  }

  const edges = new Map<string, Float64Array>();
  for (const k of reefs) {
    const [q, r] = k.split(",").map(Number);
    const [cx, , cz] = hexToWorld({ q, r, s: -q - r });
    const table: number[] = [];
    for (const [dq, dr] of HEX_DIRS) {
      if (reefs.has(key(q + dq, r + dr))) continue;
      const [nx, , nz] = hexToWorld({ q: q + dq, r: r + dr, s: -q - dq - r - dr });
      // The shared edge passes through the midpoint of the centres, perpendicular
      // to them, with half-length 0.5 (edge length equals hex size 1); the
      // unit vector from this centre to the neighbour's is its outward normal.
      const mx = (cx + nx) / 2;
      const mz = (cz + nz) / 2;
      const ux = (nx - cx) / SQRT3;
      const uz = (nz - cz) / SQRT3;
      table.push(mx - uz * 0.5, mz + ux * 0.5, mx + uz * 0.5, mz - ux * 0.5, ux, uz);
    }
    edges.set(k, Float64Array.from(table));
  }

  return { edges, intoStrip: (x) => (strip ? wrapIntoStrip(x, strip) : x) };
}

/** Offset into the edge table of the rim edge nearest (x, z), or −1 with no rim. */
function nearestRimEdge(edges: Float64Array, x: number, z: number): number {
  let best = -1;
  let d = Infinity;
  for (let i = 0; i < edges.length; i += EDGE_STRIDE) {
    const di = pointSegmentDistance(x, z, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
    if (di < d) {
      d = di;
      best = i;
    }
  }
  return best;
}

/**
 * A reef mask in [0, 1] at world (x, z) for the map. Build once per map;
 * sampling is O(1). With a `wrap` it repeats every wrap width and reefs carry
 * on across the seam (#36).
 */
export function createReefMask(cells: readonly MapCell[], wrap: MapWrap = null): (x: number, z: number) => number {
  const { edges, intoStrip } = reefRim(cells, wrap);
  return (worldX: number, z: number): number => {
    const x = intoStrip(worldX);
    const h = worldToHex(x, z);
    const table = edges.get(key(h.q, h.r));
    if (!table) return 0;
    const i = nearestRimEdge(table, x, z);
    if (i < 0) return 1;
    return smoothstep(0, REEF_EDGE_SOFTNESS, pointSegmentDistance(x, z, table[i], table[i + 1], table[i + 2], table[i + 3]));
  };
}

/**
 * The unit outward normal of the reef's rim edge nearest world (x, z), for a
 * point inside a reef hex: which way that part of the reef faces, for the
 * windward weighting of the reef foam (#38 step 7, shoreFoam.ts). [0, 0]
 * off the reef, or inside a reef hex with no rim. Wraps like the mask.
 */
export function createReefOutward(cells: readonly MapCell[], wrap: MapWrap = null): (x: number, z: number) => [number, number] {
  const { edges, intoStrip } = reefRim(cells, wrap);
  return (worldX: number, z: number): [number, number] => {
    const x = intoStrip(worldX);
    const h = worldToHex(x, z);
    const table = edges.get(key(h.q, h.r));
    if (!table) return [0, 0];
    const i = nearestRimEdge(table, x, z);
    return i < 0 ? [0, 0] : [table[i + 4], table[i + 5]];
  };
}
