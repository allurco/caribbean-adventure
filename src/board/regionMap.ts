import type { Hex, MapWrap } from "../game/hex";
import { canonicalHex, hexToWorld, wrappedNeighbors } from "../game/hex";
import type { MapCell, Region, RegionId } from "../game/types";
import type { HexGridEdges } from "./hexGridEdges";
import { SHIP_VIEW_DISTANCE } from "./shipView";

/**
 * The regions on the board (#239), pure: the borders between them, a label
 * position per region, and how loud the labels are at each zoom. The region
 * table and every cell's region come from `G` (src/game/regions.ts); this
 * only turns them into geometry. The label positions are where the event
 * deck (#240) points the camera at a region.
 */

/**
 * Neighbour offset (dq, dr) across side `i`, which runs from corner `i` to
 * corner `i + 1`, corner `i` at local angle 60°·i laid flat on XZ as
 * (cos, -sin): the same sides as `buildHexGridEdges`.
 */
const SIDE_NEIGHBOUR: readonly (readonly [number, number])[] = [
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
];
const CORNER: readonly (readonly [number, number])[] = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 3) * i;
  return [Math.cos(angle), -Math.sin(angle)] as const;
});

const hexKey = (h: Hex): string => `${h.q},${h.r}`;

/**
 * The hex sides where the region changes, each once, as `HexGridEdges`
 * (owners are indices into `cells`, one of each region). With a `wrap` the
 * sides across the seam are drawn too, by the cell whose side it is in this
 * copy, so world copies one wrap width apart join up.
 */
export function regionBorderEdges(cells: readonly MapCell[], wrap: MapWrap): HexGridEdges {
  const index = new Map(cells.map((c, i) => [hexKey(c.hex), i]));
  const corners: number[] = [];
  const owners: number[] = [];
  cells.forEach((cell, i) => {
    if (cell.region === undefined) return;
    const [cx, , cz] = hexToWorld(cell.hex);
    for (let side = 0; side < 6; side++) {
      const [dq, dr] = SIDE_NEIGHBOUR[side];
      const n = canonicalHex({ q: cell.hex.q + dq, r: cell.hex.r + dr, s: -cell.hex.q - dq - cell.hex.r - dr }, wrap);
      const j = index.get(hexKey(n));
      // Shared sides are drawn once, by the lower-indexed cell
      if (j === undefined || j < i) continue;
      const other = cells[j].region;
      if (other === undefined || other === cell.region) continue;
      const a = CORNER[side];
      const b = CORNER[(side + 1) % 6];
      corners.push(cx + a[0], cz + a[1], cx + b[0], cz + b[1]);
      owners.push(i, j);
    }
  });
  return { count: owners.length / 2, corners: new Float32Array(corners), owners: new Int32Array(owners) };
}

/** The region `hex` lies in, for the hover tooltip; undefined off the map or on a map without regions. */
export function regionAt(cells: readonly MapCell[], regions: readonly Region[], hex: Hex): Region | undefined {
  const cell = cells.find((c) => c.hex.q === hex.q && c.hex.r === hex.r);
  return cell?.region === undefined ? undefined : regions[cell.region];
}

/** Where a region's name is written on the board. */
export interface RegionLabel {
  region: RegionId;
  name: string;
  /** The water hex it is centred over, canonical. */
  hex: Hex;
  /** That hex's centre in world XZ. */
  x: number;
  z: number;
}

/**
 * One label per region, in region order: over the water hex of the region
 * nearest the middle of its islands (measured round the seam) that has no
 * land or reef beside it, so the name reads as the cluster's and sits on
 * open sea. Falls back to any water of the region, then any of its cells;
 * a region with no cells has no label.
 */
export function regionLabels(cells: readonly MapCell[], regions: readonly Region[], wrap: MapWrap): RegionLabel[] {
  const byKey = new Map(cells.map((c) => [hexKey(c.hex), c]));
  const period = wrap ? 1.5 * wrap.columns : Infinity;
  const dx = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Number.isFinite(period) ? Math.min(d, period - (d % period)) : d;
  };
  const openSea = (c: MapCell) =>
    c.terrain === "water" &&
    wrappedNeighbors(c.hex, wrap).every((n) => {
      const cell = byKey.get(hexKey(n));
      return !cell || cell.terrain === "water";
    });

  return regions.flatMap((region) => {
    const own = cells.filter((c) => c.region === region.id);
    if (own.length === 0) return [];
    const land = own.filter((c) => c.terrain === "island");
    const middle = centreOf(land.length > 0 ? land : own, period);
    const candidates = [own.filter(openSea), own.filter((c) => c.terrain === "water"), own].find((cs) => cs.length > 0)!;
    let best = candidates[0];
    let bestDistance = Infinity;
    for (const c of candidates) {
      const [x, , z] = hexToWorld(c.hex);
      const d = Math.hypot(dx(x, middle.x), z - middle.z);
      if (d < bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    const [x, , z] = hexToWorld(best.hex);
    return [{ region: region.id, name: region.name, hex: best.hex, x, z }];
  });
}

/** The middle of some cells in world XZ: x as a mean round the cylinder (circular) when the map wraps. */
function centreOf(cells: readonly MapCell[], period: number): { x: number; z: number } {
  let z = 0;
  let sin = 0;
  let cos = 0;
  let x = 0;
  for (const c of cells) {
    const [cx, , cz] = hexToWorld(c.hex);
    z += cz;
    x += cx;
    if (Number.isFinite(period)) {
      sin += Math.sin((cx / period) * Math.PI * 2);
      cos += Math.cos((cx / period) * Math.PI * 2);
    }
  }
  const n = Math.max(1, cells.length);
  if (!Number.isFinite(period)) return { x: x / n, z: z / n };
  const angle = Math.atan2(sin, cos);
  return { x: (((angle / (Math.PI * 2)) * period) % period + period) % period, z: z / n };
}

/** The labels' opacity at map zoom: legible, not loud (ADR 0002's ambience). */
export const REGION_LABEL_OPACITY = 0.55;
/** Camera distance from which the labels are at `REGION_LABEL_OPACITY`. */
export const REGION_LABEL_FULL_DISTANCE = 12;
/** Camera distance at and below which they are gone: ship zoom, where they would lie across the sea. */
export const REGION_LABEL_GONE_DISTANCE = SHIP_VIEW_DISTANCE + 2;

/** The region labels' opacity for a camera `distance` from its focus. */
export function regionLabelOpacity(distance: number): number {
  const t = (distance - REGION_LABEL_GONE_DISTANCE) / (REGION_LABEL_FULL_DISTANCE - REGION_LABEL_GONE_DISTANCE);
  const s = Math.min(1, Math.max(0, t));
  return REGION_LABEL_OPACITY * s * s * (3 - 2 * s);
}
