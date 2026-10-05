/**
 * Shore and reef foam bands (#38 step 7), from the seabed's depth and the
 * terrain field. Pure maths, mirrored in GLSL by `SHORE_FOAM_GLSL`; the
 * water shader (Ocean.tsx) paints the bands on the sea and the land's
 * shoreline patch (shoreFoamLand.ts) runs the wash up the sand.
 *
 * Three bands, all in metres of seabed depth under the pixel (the prepass
 * depth the water shader already decodes), so they follow the drawn seabed
 * exactly:
 *
 * - **Shore wash** at the waterline: full at depth 0 and gone by a fraction
 *   of a metre, reaching deeper at the flood of the surf pulse than at the
 *   ebb (surfMotion.ts). On the sand side of the waterline the land draws
 *   the same wash by the baked coast distance (`beachWashBand`), so the foam
 *   is never cut off at the island's edge.
 * - **Breaker line** where the waves break. By McCowan's criterion a wave
 *   of height H breaks where the depth is H / 0.78 (McCowan 1894, Phil.
 *   Mag. 38, "On the highest wave of permanent type"); with the trade-wind
 *   sea's significant height (jonswap.ts) that is ≈ 2 m. The band peaks on
 *   that contour, fades fast seaward (the wave has not broken yet) and more
 *   slowly shoreward (the broken bore runs on). On the ~1:21 beach face the
 *   2 m contour is ~40 m out, so on a wide shelf the breaker line sits
 *   visibly off the wash; where the seabed drops fast they merge.
 * - **Reef foam**: a reef crest is 1–3 m down (seabedProfile.ts), so the
 *   breaker rule foams it already; on top, wherever the reef mask is set
 *   and the crest is within a few metres of the surface, a persistent band
 *   weighted toward the windward side (`reefWindwardWeight`, baked into the
 *   terrain field's A channel from the reef's outward normal and the wind).
 *
 * The bands' pulsing, lace and distance fades are applied by the shaders
 * (foamShading.ts).
 */
import { jonswapSignificantHeight } from "./jonswap";
import { TRADE_WIND_SEA, WIND_ANGLE } from "./oceanWaves";

/** McCowan's breaker index: the wave height over the depth at breaking. */
export const BREAKER_INDEX = 0.78;

/** Depth (metres) at which a wave of height `waveHeightMetres` breaks. */
export function breakingDepth(waveHeightMetres: number): number {
  return waveHeightMetres / BREAKER_INDEX;
}

/** The trade-wind sea's breaking depth, from its significant height: ≈ 2 m. */
export const BREAKING_DEPTH_METRES = breakingDepth(jonswapSignificantHeight(TRADE_WIND_SEA));

/** Metres of depth beyond the breaking contour over which the breaker band fades out seaward ... */
export const BREAKER_SEAWARD_FADE = 0.9;
/** ... and shoreward, longer: the broken bore runs on toward the beach. */
export const BREAKER_SHOREWARD_FADE = 1.4;

/** Depth (metres) the shore wash reaches at the ebb of the surf pulse ... */
export const WASH_DEPTH_EBB = 0.35;
/** ... and at the flood. */
export const WASH_DEPTH_FLOOD = 0.9;
/** The wash is solid out to this share of its reach, then fades. */
const WASH_SOLID_SHARE = 0.35;

/** Coast distance (world units, + up the beach) the wash reaches on the sand at the ebb ... */
export const BEACH_WASH_EBB = 0.03;
/** ... and at the flood: ~6 m of sand. */
export const BEACH_WASH_FLOOD = 0.09;

/** Reef crest depths (metres) between which the persistent reef band fades out. */
export const REEF_FOAM_DEPTH_FADE: readonly [number, number] = [3, 4.5];

/**
 * STYLISTIC: how much stronger the reef band is on the face that meets the
 * wind than in its lee: windward 1, lee (1 − bias) / (1 + bias).
 */
export const REEF_WINDWARD_BIAS = 0.6;

/** Unit vector the trade wind blows toward, world xz (oceanWaves.ts). */
export const WIND_TOWARD: readonly [number, number] = [Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)];

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The breaker band at `depthMetres`, for waves breaking at `breakingDepthMetres`: 1 on the contour. */
export function breakerBand(depthMetres: number, breakingDepthMetres: number): number {
  if (depthMetres <= 0) return 0;
  const past = depthMetres - breakingDepthMetres;
  return past >= 0 ? 1 - smoothstep(0, BREAKER_SEAWARD_FADE, past) : 1 - smoothstep(0, BREAKER_SHOREWARD_FADE, -past);
}

/** The shore wash at `depthMetres` for the surf `pulse` (0 ebb … 1 flood). */
export function washBand(depthMetres: number, pulse: number): number {
  const reach = WASH_DEPTH_EBB + (WASH_DEPTH_FLOOD - WASH_DEPTH_EBB) * pulse;
  return 1 - smoothstep(reach * WASH_SOLID_SHARE, reach, depthMetres);
}

/** The wash on the sand at signed `coastDistance` (+ up the beach) for the surf `pulse`; 1 on the water side. */
export function beachWashBand(coastDistance: number, pulse: number): number {
  const reach = BEACH_WASH_EBB + (BEACH_WASH_FLOOD - BEACH_WASH_EBB) * pulse;
  return 1 - smoothstep(reach * WASH_SOLID_SHARE, reach, coastDistance);
}

/** The persistent reef band over a reef crest `depthMetres` down. */
export function reefFoamBand(depthMetres: number): number {
  return 1 - smoothstep(REEF_FOAM_DEPTH_FADE[0], REEF_FOAM_DEPTH_FADE[1], depthMetres);
}

/**
 * Weight of the reef band for a reef face of unit `outward` normal under a
 * wind blowing toward `windToward`: 1 facing the wind, least in the lee,
 * in between on a flank or inside a reef with no face ([0, 0]).
 */
export function reefWindwardWeight(
  outward: readonly [number, number],
  windToward: readonly [number, number] = WIND_TOWARD
): number {
  const intoWind = -(outward[0] * windToward[0] + outward[1] * windToward[1]);
  return (1 + REEF_WINDWARD_BIAS * intoWind) / (1 + REEF_WINDWARD_BIAS);
}

/**
 * STYLISTIC, shared by the water and the land: how dense the shore foam is
 * (< 1 leaves holes even in the densest wash), the breaker and reef bands'
 * strengths next to the wash, how far the breaker band drops between sets
 * (the sets lead the wash's pulse by SETS_PHASE_LEAD radians, so a set
 * breaks before the wash floods), the breakup noise's scale (cycles per
 * world unit) and the lace's feature size for the detail fade.
 */
export const SHORE_FOAM_COVERAGE = 0.6;
export const BREAKER_STRENGTH = 1;
export const BREAKER_SET_FLOOR = 0.45;
export const SETS_PHASE_LEAD = 1.2;
export const REEF_FOAM_STRENGTH = 0.75;
export const SHORE_FOAM_NOISE_SCALE = 6;
export const SHORE_FOAM_LACE_METRES = 2.5;

/** GLSL constants and functions matching the TypeScript above. */
export const SHORE_FOAM_GLSL = `
  const float SHORE_FOAM_COVERAGE = ${SHORE_FOAM_COVERAGE.toFixed(4)};
  const float BREAKER_STRENGTH = ${BREAKER_STRENGTH.toFixed(4)};
  const float BREAKER_SET_FLOOR = ${BREAKER_SET_FLOOR.toFixed(4)};
  const float SETS_PHASE_LEAD = ${SETS_PHASE_LEAD.toFixed(4)};
  const float REEF_FOAM_STRENGTH = ${REEF_FOAM_STRENGTH.toFixed(4)};
  const float SHORE_FOAM_NOISE_SCALE = ${SHORE_FOAM_NOISE_SCALE.toFixed(4)};
  const float SHORE_FOAM_LACE_METRES = ${SHORE_FOAM_LACE_METRES.toFixed(4)};
  const float BREAKING_DEPTH_METRES = ${BREAKING_DEPTH_METRES.toFixed(4)};
  const float BREAKER_SEAWARD_FADE = ${BREAKER_SEAWARD_FADE.toFixed(4)};
  const float BREAKER_SHOREWARD_FADE = ${BREAKER_SHOREWARD_FADE.toFixed(4)};
  const float WASH_DEPTH_EBB = ${WASH_DEPTH_EBB.toFixed(4)};
  const float WASH_DEPTH_FLOOD = ${WASH_DEPTH_FLOOD.toFixed(4)};
  const float WASH_SOLID_SHARE = ${WASH_SOLID_SHARE.toFixed(4)};
  const float BEACH_WASH_EBB = ${BEACH_WASH_EBB.toFixed(4)};
  const float BEACH_WASH_FLOOD = ${BEACH_WASH_FLOOD.toFixed(4)};
  const vec2 REEF_FOAM_DEPTH_FADE = vec2(${REEF_FOAM_DEPTH_FADE.map((v) => v.toFixed(4)).join(", ")});

  float breakerBand(float depthMetres, float breakingDepthMetres) {
    if (depthMetres <= 0.0) return 0.0;
    float past = depthMetres - breakingDepthMetres;
    return past >= 0.0 ? 1.0 - smoothstep(0.0, BREAKER_SEAWARD_FADE, past) : 1.0 - smoothstep(0.0, BREAKER_SHOREWARD_FADE, -past);
  }
  float washBand(float depthMetres, float pulse) {
    float reach = mix(WASH_DEPTH_EBB, WASH_DEPTH_FLOOD, pulse);
    return 1.0 - smoothstep(reach * WASH_SOLID_SHARE, reach, depthMetres);
  }
  float beachWashBand(float coastDistance, float pulse) {
    float reach = mix(BEACH_WASH_EBB, BEACH_WASH_FLOOD, pulse);
    return 1.0 - smoothstep(reach * WASH_SOLID_SHARE, reach, coastDistance);
  }
  float reefFoamBand(float depthMetres) {
    return 1.0 - smoothstep(REEF_FOAM_DEPTH_FADE.x, REEF_FOAM_DEPTH_FADE.y, depthMetres);
  }
  // The water's shore foam coverage over a seabed \`depthMetres\` down, with
  // the reef mask and windward weight there, at surf \`pulse\` and breaker \`sets\`.
  float shoreFoamCoverage(float depthMetres, float reef, float windward, float pulse, float sets) {
    float wash = washBand(depthMetres, pulse);
    float breaker = breakerBand(depthMetres, BREAKING_DEPTH_METRES) * mix(BREAKER_SET_FLOOR, 1.0, sets) * BREAKER_STRENGTH;
    float reefLine = reef * windward * reefFoamBand(depthMetres) * REEF_FOAM_STRENGTH;
    return max(wash, max(breaker, reefLine)) * SHORE_FOAM_COVERAGE;
  }
`;
