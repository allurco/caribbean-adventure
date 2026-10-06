/**
 * Plank pier mesh data (issue #49). Pure, no Three.js.
 *
 * Local space: Y up, the land end at the origin, the deck running out along
 * +Z (the decoration's rotation turns +Z towards the docking hex, as the old
 * box did). Posts reach well below the water line so they show through the
 * shallows; the deck sits a little above it. Faceted and flat-shaded like the
 * other props; the colours are per vertex (the planks alternate in shade), so
 * the material needs `vertexColors`.
 */
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

export interface PierColors {
  plank: Rgb;
  post: Rgb;
}

export type PierGeometryData = FacetGeometryData;

/** Deck length from the land end to the sea end, world units. */
export const PIER_LENGTH = 0.6;
export const PIER_WIDTH = 0.16;
/** Top of the deck planks, above sea level (0). */
export const PIER_DECK_TOP = 0.07;
export const PIER_DECK_THICKNESS = 0.02;
/** Posts run from here, under the shallows, to a little above the deck. */
export const PIER_POST_BOTTOM = -0.3;
export const PIER_POST_TOP = 0.1;
export const PIER_TRIANGLE_BUDGET = 240;

const PLANK_COUNT = 8;
/** Fraction of each plank's pitch that is wood; the rest is the gap. */
const PLANK_FILL = 0.82;
const PLANK_BAND_SHADE = 0.86;
const POST_SIZE = 0.03;
const POST_INSET = 0.012;
/** Posts stand in pairs at these fractions of the length. */
const POST_STATIONS = [0.12, 0.5, 0.88];
const STRINGER_WIDTH = 0.022;
const STRINGER_DEPTH = 0.02;

/** Builds one pier's triangles. Colours are linear RGB in [0, 1]. */
export function buildPierGeometry(colors: PierColors): PierGeometryData {
  const b = createFacetBuilder();
  const halfWidth = PIER_WIDTH / 2;

  // Posts: square timbers just inside the deck edge.
  const postX = halfWidth - POST_INSET - POST_SIZE / 2;
  for (const station of POST_STATIONS) {
    const z = station * PIER_LENGTH;
    for (const sign of [-1, 1]) {
      const x = sign * postX;
      b.box(
        [x - POST_SIZE / 2, PIER_POST_BOTTOM, z - POST_SIZE / 2],
        [x + POST_SIZE / 2, PIER_POST_TOP, z + POST_SIZE / 2],
        colors.post
      );
    }
  }

  // Two stringers under the planks, running the pier's length.
  const deckBottom = PIER_DECK_TOP - PIER_DECK_THICKNESS;
  for (const sign of [-1, 1]) {
    const x = sign * postX;
    b.box(
      [x - STRINGER_WIDTH / 2, deckBottom - STRINGER_DEPTH, 0],
      [x + STRINGER_WIDTH / 2, deckBottom, PIER_LENGTH],
      colors.post,
      { top: false }
    );
  }

  // Planks across the width, with a gap between each and alternate shades.
  const pitch = PIER_LENGTH / PLANK_COUNT;
  const gap = (pitch * (1 - PLANK_FILL)) / 2;
  for (let i = 0; i < PLANK_COUNT; i++) {
    const z0 = i * pitch + (i === 0 ? 0 : gap);
    const z1 = (i + 1) * pitch - (i === PLANK_COUNT - 1 ? 0 : gap);
    const color = i % 2 === 0 ? colors.plank : shadeRgb(colors.plank, PLANK_BAND_SHADE);
    const min: Vec3 = [-halfWidth, deckBottom, z0];
    const max: Vec3 = [halfWidth, PIER_DECK_TOP, z1];
    b.box(min, max, color);
  }

  return b.build();
}
