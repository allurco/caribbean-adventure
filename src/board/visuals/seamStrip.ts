/**
 * The world strip one wrap wide that the visuals of a wrapping map are built
 * over (#36). Every consumer that bakes or meshes the terrain covers exactly
 * this strip, so copies of it one wrap width apart tile with no seam, and
 * every sampler first moves its point into the strip.
 */
import { hexToWorld, wrapWorldWidth, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";

export interface SeamStrip {
  /** West edge of the strip, world x: half a column west of column 0's centres. */
  minX: number;
  /** Wrap width in world units. */
  width: number;
}

/** Columns are 1.5 units apart; the strip starts halfway between column −1 and column 0. */
const HALF_COLUMN = 0.75;

export function seamStrip(wrap: MapWrap): SeamStrip | null {
  return wrap ? { minX: -HALF_COLUMN, width: wrapWorldWidth(wrap) } : null;
}

/** World x moved by whole wrap widths into [minX, minX + width). */
export function wrapIntoStrip(x: number, { minX, width }: SeamStrip): number {
  if (x >= minX && x < minX + width) return x;
  return x - width * Math.floor((x - minX) / width);
}

/**
 * `cells` plus copies, one wrap width east or west, of the cells whose copy
 * lands within `margin` world units of the strip. Algorithms that look at a
 * point's neighbourhood (coast distance, reef rims) then see across the seam
 * from anywhere in the strip. Without a wrap, returns `cells` itself.
 */
export function withSeamImages(cells: readonly MapCell[], wrap: MapWrap, margin: number): readonly MapCell[] {
  const strip = seamStrip(wrap);
  if (!wrap || !strip) return cells;
  const images: MapCell[] = [];
  for (const k of [1, -1]) {
    for (const cell of cells) {
      const x = hexToWorld(cell.hex)[0] + k * strip.width;
      if (x < strip.minX - margin || x > strip.minX + strip.width + margin) continue;
      const q = cell.hex.q + k * wrap.columns;
      const r = cell.hex.r - (k * wrap.columns) / 2;
      images.push({ ...cell, hex: { q, r, s: -q - r } });
    }
  }
  return [...cells, ...images];
}
