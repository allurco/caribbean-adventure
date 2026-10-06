/**
 * Row layout for the prop viewer (#59). Pure.
 *
 * Pieces sit along x with a gap between footprints that clears the taller
 * neighbour's shadow: the sun stands high to the left of the camera, so
 * shadows fall to +x and reach about 0.7 × height (tan of a 55° elevation).
 */
import type { PropGeometryData } from "./propEntries";

export interface PropExtent {
  /** Farthest any vertex reaches from the piece's origin in plan, world units at its scale. */
  radius: number;
  height: number;
}

/** Least clear ground between two neighbours' footprints (also what keeps two small pieces' labels apart). */
export const PROP_ROW_MIN_GAP = 0.3;
/** Shadow length as a multiple of the caster's height (cot of the sun's elevation, rounded up). */
export const PROP_SHADOW_REACH = 0.75;
/** Clear sand between a piece's front edge and the top of its label, world units. */
export const PROP_LABEL_MARGIN = 0.1;

export function propExtent(data: PropGeometryData, scale: number): PropExtent {
  let radius = 0;
  let height = 0;
  for (let i = 0; i < data.vertexCount; i++) {
    radius = Math.max(radius, Math.hypot(data.positions[i * 3], data.positions[i * 3 + 2]));
    height = Math.max(height, data.positions[i * 3 + 1]);
  }
  return { radius: radius * scale, height: height * scale };
}

/**
 * How far in front of a piece's origin (+z, towards the camera) its label
 * starts, so no part of the piece, however wide, lies over the text.
 */
export function propLabelOffset(extent: PropExtent): number {
  return extent.radius + PROP_LABEL_MARGIN;
}

/** The x of each piece's origin, in order, the row centred on the origin. */
export function layoutRow(extents: readonly PropExtent[]): number[] {
  const xs: number[] = [];
  let x = 0;
  extents.forEach((e, i) => {
    if (i > 0) {
      const previous = extents[i - 1];
      x += previous.radius + Math.max(PROP_ROW_MIN_GAP, previous.height * PROP_SHADOW_REACH) + e.radius;
    }
    xs.push(x);
  });
  if (xs.length === 0) return xs;
  const left = xs[0] - extents[0].radius;
  const right = xs[xs.length - 1] + extents[extents.length - 1].radius;
  const centre = (left + right) / 2;
  return xs.map((v) => v - centre);
}
