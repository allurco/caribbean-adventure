/**
 * Where a hull meets the water (#144, "Hull contact line"). Pure maths,
 * mirrored in GLSL by `HULL_CONTACT_GLSL`; the water shader (Ocean.tsx) runs
 * it for every ship the board registers (shipFoamSources.ts), next to the
 * softer contact patch of hullFoam.ts.
 *
 * At the diorama ship scale (ADR 0006) a hull without a cue at its waterline
 * reads as sitting on the sea, not in it. Three cues, all measured from the
 * hull's waterline outline:
 *
 * - **Contact line**: a narrow, bright foam line hugging the outline, at
 *   rest as well as under way. Under way it widens, along the sides and most
 *   at the bow, where the hull pushes the water aside. It is full right up to
 *   (and under) the outline, so a waterline drawn a little smaller than the
 *   hull never leaves a gap between the hull and its foam.
 * - **Bow wave**: under way, a short crest standing just off the stem and
 *   running back along the bow quarters (the "bone in her teeth").
 * - **Wet band**: the water against the hull is darker, shaded by the hull
 *   and stirred; a band a little wider than the line, so the foam sits on a
 *   darker edge instead of on the bright shallows.
 *
 * The outline is a rounded rectangle of the waterline's length and beam
 * (`shipWaterline`, shipHull.ts): a stadium for the modelled hulls, nearly
 * square for the box hulls. The foam's lace is the hull foam's, sized in
 * water metres (foamShading.ts, ADR 0006); the widths here follow the hull,
 * since they outline it. Lines thinner than a couple of pixels (map zoom)
 * fade out rather than shimmer. All ship foam fades out in the last metre of
 * water before the sand, where the shore wash takes over, and is nothing on
 * land.
 */

/** STYLISTIC: the contact line's width at rest, in hull beams. */
export const HULL_CONTACT_LINE_BEAMS = 0.1;
/** STYLISTIC: the contact line's coverage at the waterline: dense enough that the lace reads as a nearly solid line. */
export const HULL_CONTACT_STRENGTH = 0.9;
/** STYLISTIC: how much wider the line is along the sides at full speed (1 + gain) ... */
export const HULL_CONTACT_SIDE_GAIN = 0.6;
/** ... and how much more again at the bow. */
export const HULL_CONTACT_BOW_GAIN = 1.5;
/** Share of the half length forward of amidships where the bow's widening begins, and full at the stem. */
export const HULL_CONTACT_BOW_START = 0.3;
/** STYLISTIC: how far off the outline the bow wave's crest stands, in beams ... */
export const BOW_WAVE_OFFSET_BEAMS = 0.3;
/** ... its half width, in beams ... */
export const BOW_WAVE_WIDTH_BEAMS = 0.25;
/** ... and its coverage at full speed. */
export const BOW_WAVE_STRENGTH = 0.85;
/** STYLISTIC: how much darker the water is against the hull (share of its radiance removed). */
export const HULL_CONTACT_DARKEN = 0.3;
/** STYLISTIC: how far the darker band reaches off the outline, in beams. */
export const HULL_CONTACT_DARK_BAND_BEAMS = 0.45;
/**
 * Seabed depth (metres) under which the ship foam fades out toward the sand:
 * about the shore wash's reach at the flood (WASH_DEPTH_FLOOD, shoreFoam.ts),
 * where the shore's own foam takes over. Nothing on land.
 */
export const SHIP_FOAM_SHALLOW_METRES = 1;
/** A line this many pixels wide or more is drawn in full; one pixel wide or less, not at all. */
const LINE_FULL_PIXELS = 3;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Signed distance (world units, + outside) from a point `along` the heading
 * and `across` it, from the ship's position, to a waterline of `halfLength`
 * and `halfBeam` whose ends are rounded by `roundness` (0 square … 1 a
 * stadium, ends of radius halfBeam).
 */
export function hullWaterlineDistance(along: number, across: number, halfLength: number, halfBeam: number, roundness: number): number {
  const r = Math.max(0, Math.min(1, roundness)) * halfBeam;
  const qx = Math.abs(along) - (halfLength - r);
  const qy = Math.abs(across) - (halfBeam - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Share of a line `width` wide drawn where a pixel spans `footprint` (same units): 0 at a pixel, 1 from three. */
export function lineDetailFade(width: number, footprint: number): number {
  if (footprint <= 0) return 1;
  return smoothstep(1, LINE_FULL_PIXELS, width / footprint);
}

/** How far forward a point is, as a weight: 0 from amidships aft, 1 at and ahead of the stem. */
const bowWeight = (alongShare: number) => smoothstep(HULL_CONTACT_BOW_START, 1, alongShare);

/**
 * Contact line coverage at signed `distance` from the waterline outline, at
 * `alongShare` of the half length forward of amidships (−1 stern … 1 stem),
 * for a hull of `beam`, at `motion` (0 at rest … 1 full speed), where a pixel
 * spans `footprint` world units.
 */
export function hullContactCoverage(distance: number, alongShare: number, beam: number, motion: number, footprint: number): number {
  if (beam <= 0) return 0;
  const width =
    beam * HULL_CONTACT_LINE_BEAMS * (1 + motion * (HULL_CONTACT_SIDE_GAIN + HULL_CONTACT_BOW_GAIN * bowWeight(alongShare)));
  const line = 1 - smoothstep(0, width, Math.max(distance, 0));
  return line * HULL_CONTACT_STRENGTH * lineDetailFade(width, footprint);
}

/** Bow wave coverage, same arguments: a crest standing off the stem under way. */
export function bowWaveCoverage(distance: number, alongShare: number, beam: number, motion: number, footprint: number): number {
  if (beam <= 0 || motion <= 0) return 0;
  const width = beam * BOW_WAVE_WIDTH_BEAMS;
  const crest = 1 - smoothstep(0, width, Math.abs(distance - beam * BOW_WAVE_OFFSET_BEAMS));
  return crest * bowWeight(alongShare) * motion * BOW_WAVE_STRENGTH * lineDetailFade(width, footprint);
}

/** Share of the water's radiance the wet band removes at signed `distance` from the outline of a hull of `beam`. */
export function hullContactShade(distance: number, beam: number): number {
  if (beam <= 0) return 0;
  return HULL_CONTACT_DARKEN * (1 - smoothstep(0, beam * HULL_CONTACT_DARK_BAND_BEAMS, Math.max(distance, 0)));
}

/** Ship foam's share kept over a seabed `depthMetres` below sea level: none on land, full past the shore wash. */
export function shipFoamDepthFade(depthMetres: number): number {
  return smoothstep(0, SHIP_FOAM_SHALLOW_METRES, depthMetres);
}

/** GLSL for the above. */
export const HULL_CONTACT_GLSL = `
  const float HULL_CONTACT_LINE_BEAMS = ${HULL_CONTACT_LINE_BEAMS.toFixed(4)};
  const float HULL_CONTACT_STRENGTH = ${HULL_CONTACT_STRENGTH.toFixed(4)};
  const float HULL_CONTACT_SIDE_GAIN = ${HULL_CONTACT_SIDE_GAIN.toFixed(4)};
  const float HULL_CONTACT_BOW_GAIN = ${HULL_CONTACT_BOW_GAIN.toFixed(4)};
  const float HULL_CONTACT_BOW_START = ${HULL_CONTACT_BOW_START.toFixed(4)};
  const float BOW_WAVE_OFFSET_BEAMS = ${BOW_WAVE_OFFSET_BEAMS.toFixed(4)};
  const float BOW_WAVE_WIDTH_BEAMS = ${BOW_WAVE_WIDTH_BEAMS.toFixed(4)};
  const float BOW_WAVE_STRENGTH = ${BOW_WAVE_STRENGTH.toFixed(4)};
  const float HULL_CONTACT_DARKEN = ${HULL_CONTACT_DARKEN.toFixed(4)};
  const float HULL_CONTACT_DARK_BAND_BEAMS = ${HULL_CONTACT_DARK_BAND_BEAMS.toFixed(4)};
  const float SHIP_FOAM_SHALLOW_METRES = ${SHIP_FOAM_SHALLOW_METRES.toFixed(4)};
  const float LINE_FULL_PIXELS = ${LINE_FULL_PIXELS.toFixed(4)};
  float hullWaterlineDistance(float along, float across, float halfLength, float halfBeam, float roundness) {
    float r = clamp(roundness, 0.0, 1.0) * halfBeam;
    vec2 q = vec2(abs(along) - (halfLength - r), abs(across) - (halfBeam - r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float lineDetailFade(float width, float footprint) {
    if (footprint <= 0.0) return 1.0;
    return smoothstep(1.0, LINE_FULL_PIXELS, width / footprint);
  }
  float hullContactBowWeight(float alongShare) {
    return smoothstep(HULL_CONTACT_BOW_START, 1.0, alongShare);
  }
  float hullContactCoverage(float distance, float alongShare, float beam, float motion, float footprint) {
    if (beam <= 0.0) return 0.0;
    float width = beam * HULL_CONTACT_LINE_BEAMS
      * (1.0 + motion * (HULL_CONTACT_SIDE_GAIN + HULL_CONTACT_BOW_GAIN * hullContactBowWeight(alongShare)));
    float line = 1.0 - smoothstep(0.0, width, max(distance, 0.0));
    return line * HULL_CONTACT_STRENGTH * lineDetailFade(width, footprint);
  }
  float bowWaveCoverage(float distance, float alongShare, float beam, float motion, float footprint) {
    if (beam <= 0.0 || motion <= 0.0) return 0.0;
    float width = beam * BOW_WAVE_WIDTH_BEAMS;
    float crest = 1.0 - smoothstep(0.0, width, abs(distance - beam * BOW_WAVE_OFFSET_BEAMS));
    return crest * hullContactBowWeight(alongShare) * motion * BOW_WAVE_STRENGTH * lineDetailFade(width, footprint);
  }
  float hullContactShade(float distance, float beam) {
    if (beam <= 0.0) return 0.0;
    return HULL_CONTACT_DARKEN * (1.0 - smoothstep(0.0, beam * HULL_CONTACT_DARK_BAND_BEAMS, max(distance, 0.0)));
  }
  float shipFoamDepthFade(float depthMetres) {
    return smoothstep(0.0, SHIP_FOAM_SHALLOW_METRES, depthMetres);
  }
`;
