/**
 * Seabed depth profile around islands, in metres (issue #38, step 2).
 *
 * At the render scale (65 m per world unit, `worldScale.ts`) the old
 * `−tanh(0.6·d)` seabed fell 10 m within ~17 m of the beach, so under clear
 * tropical water the turquoise shallows were a hairline ring. This profile is
 * built in metres instead, as the sum of two smooth terms of the distance
 * offshore `s`:
 *
 *   shelf(s) = SHELF_DEPTH · (1 − e^(−s / SHELF_LENGTH))
 *     A gentle beach face (slope SHELF_DEPTH / SHELF_LENGTH ≈ 1:21 at the
 *     waterline) easing into a shallow shelf, ~6 m deep a full hex out. Natural
 *     sand beaches slope about 1:20 (0.5 mm sand) to 1:100 (0.2 mm sand):
 *     Hong Kong CEDD, Port Works Design Manual Part 5, Table 1, "Typical
 *     Natural Beach Slopes for Various Sediment Sizes".
 *
 *   drop(s)  = DROP_HEIGHT · (σ(s) − σ(0)) / (1 − σ(0)),
 *     σ(s) = ½ · (1 + tanh((s − DROP_OFFSHORE) / DROP_WIDTH))
 *     The drop-off at the shelf edge: a steep (~60° at its steepest) wall
 *     centred DROP_OFFSHORE out, normalised so it is exactly 0 at the waterline.
 *
 * Both terms are smooth and strictly increasing, so the sum has no terraces or
 * kinks and levels out at SEABED_FLOOR_DEPTH. The land side of the height field
 * is unchanged: the profile only meets it at depth 0 (continuous height, but
 * the slope changes at the waterline, as it does on a real beach).
 *
 * These are design choices for a fringing-reef island look, not measurements.
 */

/** Depth the shelf term levels out at, metres. */
const SHELF_DEPTH = 14;
/** e-folding distance of the shelf term, metres. */
const SHELF_LENGTH = 300;
/** Extra depth added by the drop-off, metres. */
const DROP_HEIGHT = 108;
/** Distance offshore of the middle of the drop-off, metres (about 1.5 hexes). */
const DROP_OFFSHORE = 175;
/** Half-width scale of the drop-off, metres. */
const DROP_WIDTH = 28;

/** Depth the profile levels out at far offshore, metres. */
export const SEABED_FLOOR_DEPTH = SHELF_DEPTH + DROP_HEIGHT;

const sigma = (s: number): number => 0.5 * (1 + Math.tanh((s - DROP_OFFSHORE) / DROP_WIDTH));
const SIGMA_AT_SHORE = sigma(0);

/**
 * Seabed depth (metres below sea level, ≥ 0) at `offshore` metres from the
 * waterline. Distances ≤ 0 (on land) give 0.
 */
export function seabedDepth(offshore: number): number {
  if (offshore <= 0) return 0;
  const shelf = SHELF_DEPTH * (1 - Math.exp(-offshore / SHELF_LENGTH));
  const drop = (DROP_HEIGHT * (sigma(offshore) - SIGMA_AT_SHORE)) / (1 - SIGMA_AT_SHORE);
  return shelf + drop;
}
