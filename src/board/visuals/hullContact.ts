/**
 * Where a hull meets the water (#144, "Hull contact line"). Pure maths,
 * mirrored in GLSL by `HULL_CONTACT_GLSL`; the water shader (Ocean.tsx) runs
 * it for every ship the board registers (shipFoamSources.ts), next to the
 * fainter contact patch of hullFoam.ts.
 *
 * At the diorama ship scale (ADR 0006) a hull without a cue at its waterline
 * reads as sitting on the sea, not in it. Three cues, all measured from the
 * hull's waterline outline:
 *
 * - **Contact line**: a thin, crisp, nearly solid foam line just outside the
 *   outline, at rest as well as under way: solid over its width, then a
 *   short edge. It reaches a little past the hull's widest beam, so it shows
 *   beside the hull seen low from the side instead of hiding under it; and it
 *   is full right up to (and under) the outline, so a waterline drawn a
 *   little small never leaves a gap. Under way it widens, along the sides and
 *   most at the bow, where the hull pushes the water aside.
 * - **Bow wave**: under way, a short crest standing just off the stem and
 *   running back along the bow quarters (the "bone in her teeth"), growing
 *   with speed.
 * - **Wet band**: the water against the hull is darker, shaded by the hull
 *   and stirred; full just past the foam line and fading over a band a few
 *   times wider, so the line reads as a bright edge on a dark one.
 *
 * The outline (`hullWaterlineDistance`) has a parallel middle body and ends
 * of one radius tangent to the sides (`shipWaterline`, shipHull.ts): a
 * rounded rectangle for an end radius under a half beam (the box hulls), a
 * stadium at a half beam (full hulls), and an ogive, pointed at the stem and
 * the stern, above it (fine hulls). The foam's lace is the hull foam's,
 * sized in water metres (foamShading.ts, ADR 0006); the widths here follow
 * the hull, since they outline it. A line is drawn at least
 * `LINE_MIN_PIXELS` wide, so it still reads at mid zoom, and fades out only
 * where it would be a fraction of a pixel (map zoom). All ship foam fades out
 * in the last metre of water before the sand, where the shore wash takes
 * over, and is nothing on land.
 */

/** STYLISTIC: the contact line's solid width outside the outline at rest, in hull beams ... */
export const HULL_CONTACT_LINE_BEAMS = 0.05;
/** ... and the crisp edge it fades out over beyond that. */
export const HULL_CONTACT_EDGE_BEAMS = 0.02;
/** STYLISTIC: the contact line's coverage: nearly solid, so the lace barely breaks it. */
export const HULL_CONTACT_STRENGTH = 0.97;
/** STYLISTIC: how much wider the line is along the sides at full speed (1 + gain) ... */
export const HULL_CONTACT_SIDE_GAIN = 0.1;
/** ... and how much more again at the bow. */
export const HULL_CONTACT_BOW_GAIN = 1.2;
/** Share of the half length forward of amidships where the bow's widening begins, and full at the stem. */
export const HULL_CONTACT_BOW_START = 0.3;
/** STYLISTIC: how far off the outline the bow wave's crest stands, in beams ... */
export const BOW_WAVE_OFFSET_BEAMS = 0.22;
/** ... its half width, in beams ... */
export const BOW_WAVE_WIDTH_BEAMS = 0.14;
/** ... and its coverage at full speed. */
export const BOW_WAVE_STRENGTH = 0.85;
/** STYLISTIC: how much darker the water is against the hull (share of its radiance removed). */
export const HULL_CONTACT_DARKEN = 0.45;
/** STYLISTIC: how far the darker band reaches off the outline, in beams. */
export const HULL_CONTACT_DARK_BAND_BEAMS = 0.5;
/**
 * Seabed depth (metres) under which the ship foam fades out toward the sand:
 * about the shore wash's reach at the flood (WASH_DEPTH_FLOOD, shoreFoam.ts),
 * where the shore's own foam takes over. Nothing on land.
 */
export const SHIP_FOAM_SHALLOW_METRES = 1;
/**
 * STYLISTIC: the stern's end radius in half beams, at most, for a hull whose
 * bow radius is HULL_TRANSOM_BOW or more: the fine-bowed hulls (the Sloop,
 * the Frigate, the Galleon) end aft in a transom, a rounded square whatever
 * their bow. A fuller bow (the Flute's) is matched by a round stern, its own
 * radius at both ends.
 */
export const HULL_STERN_ROUNDNESS = 0.6;
export const HULL_TRANSOM_BOW = 1.5;
/** STYLISTIC: the narrowest a foam line is drawn, in pixels, so it still reads at mid zoom. */
export const LINE_MIN_PIXELS = 1.6;
/** A line this many pixels wide (before the minimum) or more is drawn in full; this many or fewer, not at all (map zoom). */
const LINE_FULL_PIXELS = 0.75;
const LINE_GONE_PIXELS = 0.25;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Rounded rectangle: ends of radius `r` (≤ halfBeam) in the corners. */
function roundedRectDistance(x: number, y: number, halfLength: number, halfBeam: number, r: number): number {
  const qx = x - (halfLength - r);
  const qy = y - (halfBeam - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Ogive: ends of radius `radius` (> halfBeam), tangent to the sides, meeting
 * on the centre line at a point. Exact outside; inside, the distance to the
 * nearer of the side and the end, which is all the foam needs (negative).
 */
function ogiveDistance(x: number, y: number, halfLength: number, halfBeam: number, radius: number): number {
  // Each end is sqrt(2ρb − b²) long; where that is longer than the half length, the ends meet amidships.
  let end = Math.sqrt(2 * radius * halfBeam - halfBeam * halfBeam);
  let rho = radius;
  if (end > halfLength) {
    end = halfLength;
    rho = (end * end + halfBeam * halfBeam) / (2 * halfBeam);
  }
  const x0 = halfLength - end;
  if (x <= x0) return y - halfBeam;
  // The end's centre of curvature, below the centre line, and the vector to its point.
  const cx = x0;
  const cy = halfBeam - rho;
  const px = x - cx;
  const py = y - cy;
  const tx = end;
  const ty = rho - halfBeam;
  // Clockwise of the point's direction: past the point, nearest the point itself.
  if (tx * py - ty * px < 0) return Math.hypot(x - halfLength, y);
  return Math.hypot(px, py) - rho;
}

/**
 * Signed distance (world units, + outside) from a point `along` the heading
 * and `across` it, from the ship's position, to a waterline of `halfLength`
 * and `halfBeam` whose bow has a radius of `roundness` half beams: 0
 * square, under 1 a rounded rectangle, 1 a stadium, over 1 an ogive
 * (pointed). A fine bow (HULL_TRANSOM_BOW or more) ends aft in a transom, of
 * radius HULL_STERN_ROUNDNESS at most; a fuller one in its own round.
 */
export function hullWaterlineDistance(along: number, across: number, halfLength: number, halfBeam: number, roundness: number): number {
  const x = Math.abs(along);
  const y = Math.abs(across);
  const bow = Math.max(0, roundness);
  const k = along < 0 && bow >= HULL_TRANSOM_BOW ? Math.min(bow, HULL_STERN_ROUNDNESS) : bow;
  if (k <= 1) return roundedRectDistance(x, y, halfLength, halfBeam, k * halfBeam);
  return ogiveDistance(x, y, halfLength, halfBeam, k * halfBeam);
}

/** Share of a line `width` wide drawn where a pixel spans `footprint` (same units): none at a quarter pixel, all from three quarters. */
export function lineDetailFade(width: number, footprint: number): number {
  if (footprint <= 0) return 1;
  return smoothstep(LINE_GONE_PIXELS, LINE_FULL_PIXELS, width / footprint);
}

/** The width a line `width` wide is drawn at where a pixel spans `footprint`: never under LINE_MIN_PIXELS. */
export function lineDrawnWidth(width: number, footprint: number): number {
  return Math.max(width, LINE_MIN_PIXELS * Math.max(footprint, 0));
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
  const gain = 1 + motion * (HULL_CONTACT_SIDE_GAIN + HULL_CONTACT_BOW_GAIN * bowWeight(alongShare));
  const width = beam * (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS) * gain;
  const drawn = lineDrawnWidth(width, footprint);
  const solid = (drawn * HULL_CONTACT_LINE_BEAMS) / (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS);
  const line = 1 - smoothstep(solid, drawn, distance);
  return line * HULL_CONTACT_STRENGTH * lineDetailFade(width, footprint);
}

/** Bow wave coverage, same arguments: a crest standing off the stem under way, growing with speed. */
export function bowWaveCoverage(distance: number, alongShare: number, beam: number, motion: number, footprint: number): number {
  if (beam <= 0 || motion <= 0) return 0;
  const width = beam * BOW_WAVE_WIDTH_BEAMS;
  const crest = 1 - smoothstep(0, lineDrawnWidth(width, footprint), Math.abs(distance - beam * BOW_WAVE_OFFSET_BEAMS * (0.5 + 0.5 * motion)));
  return crest * bowWeight(alongShare) * motion * BOW_WAVE_STRENGTH * lineDetailFade(width, footprint);
}

/** Share of the water's radiance the wet band removes at signed `distance` from the outline of a hull of `beam`: full out past the foam line, none past the band. */
export function hullContactShade(distance: number, beam: number): number {
  if (beam <= 0) return 0;
  const lineOuter = beam * (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS);
  return HULL_CONTACT_DARKEN * (1 - smoothstep(lineOuter, beam * HULL_CONTACT_DARK_BAND_BEAMS, distance));
}

/** Ship foam's share kept over a seabed `depthMetres` below sea level: none on land, full past the shore wash. */
export function shipFoamDepthFade(depthMetres: number): number {
  return smoothstep(0, SHIP_FOAM_SHALLOW_METRES, depthMetres);
}

/** GLSL for the above. */
export const HULL_CONTACT_GLSL = `
  const float HULL_CONTACT_LINE_BEAMS = ${HULL_CONTACT_LINE_BEAMS.toFixed(4)};
  const float HULL_CONTACT_EDGE_BEAMS = ${HULL_CONTACT_EDGE_BEAMS.toFixed(4)};
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
  const float LINE_MIN_PIXELS = ${LINE_MIN_PIXELS.toFixed(4)};
  const float HULL_STERN_ROUNDNESS = ${HULL_STERN_ROUNDNESS.toFixed(4)};
  const float HULL_TRANSOM_BOW = ${HULL_TRANSOM_BOW.toFixed(4)};
  const float LINE_FULL_PIXELS = ${LINE_FULL_PIXELS.toFixed(4)};
  const float LINE_GONE_PIXELS = ${LINE_GONE_PIXELS.toFixed(4)};
  float hullWaterlineDistance(float along, float across, float halfLength, float halfBeam, float roundness) {
    vec2 p = abs(vec2(along, across));
    float k = max(roundness, 0.0);
    if (along < 0.0 && k >= HULL_TRANSOM_BOW) k = min(k, HULL_STERN_ROUNDNESS);
    if (k <= 1.0) {
      float r = k * halfBeam;
      vec2 q = p - vec2(halfLength - r, halfBeam - r);
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }
    float rho = k * halfBeam;
    float end = sqrt(2.0 * rho * halfBeam - halfBeam * halfBeam);
    if (end > halfLength) {
      end = halfLength;
      rho = (end * end + halfBeam * halfBeam) / (2.0 * halfBeam);
    }
    float x0 = halfLength - end;
    if (p.x <= x0) return p.y - halfBeam;
    vec2 cp = p - vec2(x0, halfBeam - rho);
    vec2 ct = vec2(end, rho - halfBeam);
    if (ct.x * cp.y - ct.y * cp.x < 0.0) return length(p - vec2(halfLength, 0.0));
    return length(cp) - rho;
  }
  float lineDetailFade(float width, float footprint) {
    if (footprint <= 0.0) return 1.0;
    return smoothstep(LINE_GONE_PIXELS, LINE_FULL_PIXELS, width / footprint);
  }
  float lineDrawnWidth(float width, float footprint) {
    return max(width, LINE_MIN_PIXELS * max(footprint, 0.0));
  }
  float hullContactBowWeight(float alongShare) {
    return smoothstep(HULL_CONTACT_BOW_START, 1.0, alongShare);
  }
  float hullContactCoverage(float distance, float alongShare, float beam, float motion, float footprint) {
    if (beam <= 0.0) return 0.0;
    float gain = 1.0 + motion * (HULL_CONTACT_SIDE_GAIN + HULL_CONTACT_BOW_GAIN * hullContactBowWeight(alongShare));
    float width = beam * (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS) * gain;
    float drawn = lineDrawnWidth(width, footprint);
    float solid = drawn * HULL_CONTACT_LINE_BEAMS / (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS);
    float line = 1.0 - smoothstep(solid, drawn, distance);
    return line * HULL_CONTACT_STRENGTH * lineDetailFade(width, footprint);
  }
  float bowWaveCoverage(float distance, float alongShare, float beam, float motion, float footprint) {
    if (beam <= 0.0 || motion <= 0.0) return 0.0;
    float width = beam * BOW_WAVE_WIDTH_BEAMS;
    float crest = 1.0 - smoothstep(0.0, lineDrawnWidth(width, footprint),
      abs(distance - beam * BOW_WAVE_OFFSET_BEAMS * (0.5 + 0.5 * motion)));
    return crest * hullContactBowWeight(alongShare) * motion * BOW_WAVE_STRENGTH * lineDetailFade(width, footprint);
  }
  float hullContactShade(float distance, float beam) {
    if (beam <= 0.0) return 0.0;
    float lineOuter = beam * (HULL_CONTACT_LINE_BEAMS + HULL_CONTACT_EDGE_BEAMS);
    return HULL_CONTACT_DARKEN * (1.0 - smoothstep(lineOuter, beam * HULL_CONTACT_DARK_BAND_BEAMS, distance));
  }
  float shipFoamDepthFade(float depthMetres) {
    return smoothstep(0.0, SHIP_FOAM_SHALLOW_METRES, depthMetres);
  }
`;
