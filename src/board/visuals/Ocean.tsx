import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  ShaderMaterial,
  PlaneGeometry,
  Vector2,
  Vector3,
  Vector4,
  Mesh,
  Matrix4,
  UniformsLib,
  UniformsUtils,
  DataTexture,
  RGBAFormat,
  HalfFloatType,
  LinearFilter,
  ClampToEdgeWrapping,
  RepeatWrapping,
} from "three";
import type { Texture } from "three";
import type { MapWrap } from "../../game/hex";
import { controlsTarget } from "../controlsTarget";
import { cubeUvDefines } from "./skyEnvironment";
import type { Vec3 } from "./sunDirection";
import type { MapCell } from "../../game/types";
import { PALETTE_GLSL } from "./palette";
import { sharedTerrainField } from "./sharedTerrainField";
import { bakeTerrainField, TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import { advanceSurfTime, SURF_TIMING_GLSL } from "./surfMotion";
import { createReefMask } from "./reefMask";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import type { TerrainBounds } from "./terrainHeightField";
import { useSeabedPrepass } from "./seabedPrepass";
import { WATER_OPTICS_GLSL } from "./waterOptics";
import { METRES_PER_UNIT } from "./worldScale";
import { GLINT_BASE_ROUGHNESS2 } from "./oceanWaves";
import { SUN_GLINT_GLSL } from "./sunGlint";
import { bindWaveSlopeTextures, WAVE_SLOPE_GLSL } from "./waveSlopeGlsl";

const vertexShader = `
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  void main () {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = `
  uniform vec3 light; // unit vector towards the sun, shared with the scene's directional light
  uniform vec3 sunIrradiance; // linear sun colour × intensity, as the directional light

  // The scene's sky environment (a PMREM; see useSkyEnvironment.ts).
  uniform sampler2D skyEnv;
  uniform float skyIntensity;
  #include <cube_uv_reflection_fragment>
  // Floor of the sky lookup's roughness; the wave roughness raises it.
  const float SKY_REFLECTION_ROUGHNESS = 0.05;

  // Wave normals (#38 steps 4–5): three FFT cascades' mipmapped slope
  // textures (useWaveCascades.ts, bands in oceanWaves.ts), each on its own
  // turned tile, summed by the look-up shared with the seabed caustics
  // (waveSlopeGlsl.ts). Filtered lookups give mean slope and mean square
  // slope; what filtering, the distance fade and each cascade's
  // level-of-detail fade take out of the normal goes into the glint
  // roughness (waveNormalFilter.ts). Phase is evolved on the GPU from a
  // wrapped clock, so nothing here grows with time.
  ${WAVE_SLOPE_GLSL}
  // Glint roughness α² of the sub-grid waves (oceanWaves.ts).
  const float GLINT_BASE_ROUGHNESS2 = ${GLINT_BASE_ROUGHNESS2.toFixed(6)};

  // Water colour (#38 step 3): the lit seabed from the prepass, attenuated
  // along its path through the water, plus the glow of deep water; then
  // Fresnel against the sky. Coefficients and maths: waterOptics.ts.
  ${WATER_OPTICS_GLSL}
  const float METRES_PER_UNIT = ${METRES_PER_UNIT.toFixed(1)};
  uniform sampler2D seabedColor; // prepass: the lit seabed, linear HDR
  uniform sampler2D seabedDepth; // prepass depth; 1.0 where there is no seabed
  uniform vec2 screenSize;       // drawing-buffer size in pixels, for gl_FragCoord → uv
  uniform vec2 seabedSize;       // prepass size in pixels
  uniform mat4 cameraProjectionInverse;
  uniform mat4 cameraWorld;      // camera.matrixWorld
  uniform mat4 cameraViewProjection; // projection × view, to find a world point's prepass texel
  // The seabed mesh stops where its light is under 1% (VISIBLE_SEABED_DEPTH,
  // waterOptics.ts); texels with no seabed read NO_SEABED_DEPTH, past the fade.
  const float NO_SEABED_Y = -NO_SEABED_DEPTH / METRES_PER_UNIT;
  // Deeper than this the seabed has faded out, so the refraction look-up
  // treats the seabed as no deeper: it bounds how far the refracted ray can
  // travel before it is looked up.
  const float REFRACTION_MAX_DEPTH_UNITS = SEABED_FADE_END / METRES_PER_UNIT;

  const float PI = 3.14159265358;
  ${SUN_GLINT_GLSL}
  ${PALETTE_GLSL}

  const float OPEN_SEA_COAST_DISTANCE = 10.0; // offshore distance assumed outside the map bounds

  // Shore surf (issue #10). Distances are world units offshore from the
  // waterline (a hex is ~1.7 across); the foam lives on the ocean plane only
  // where the baked coast distance is negative, so it never draws on land.
  uniform float surfTime; // seconds, wrapped on the CPU to a whole number of periods
  ${SURF_TIMING_GLSL}
  const float SURF_EDGE_SOFTNESS = 0.02; // foam fades in over this just offshore, so it meets the land with no gap
  const float SURF_WASH_MIN = 0.12;      // width of the shore wash at the ebb of the pulse
  const float SURF_WASH_MAX = 0.32;      // ... and at the flood
  const float SURF_MAX_REACH = 0.34;     // no foam beyond this (keep >= SURF_WASH_MAX)
  // STOPGAP until step 7's surf (#38): foam only where the drawn seabed is
  // this shallow (metres, from the prepass), so it hugs the real waterline.
  // The baked coast distance alone left patches out on the water wherever it
  // disagreed with the land mesh, and the outer breaker line (20–36 m out)
  // floated detached from the sand; it is gone until step 7.
  const float SURF_DEPTH_FULL = 0.15;
  const float SURF_DEPTH_NONE = 0.6;
  const float SURF_PHASE_SCALE = 0.45;   // along-coast phase noise frequency; lower = longer stretches in step
  const float SURF_PHASE_SPREAD = 3.0;   // radians of pulse offset between stretches of coast
  const float SURF_NOISE_SCALE = 6.0;    // frequency of the noise that breaks the foam up
  const float SURF_CHURN_AMOUNT = 0.35;  // radius (noise units) the breakup noise circles each churn cycle
  // Coverage, softness and strength were lowered for #38: over the clear,
  // darker water the old values (0.8, 0.12, 0.9) gave solid white sheets.
  const float SURF_COVERAGE = 0.5;      // < 1 leaves holes even in the densest foam
  const float SURF_BREAKUP_SOFTNESS = 0.22; // edge softness of the foam patches
  const float SURF_LACE_SCALE = 4.3;     // frequency multiplier of the fine octave that turns patches into lace
  const float SURF_STRENGTH = 0.55;      // max blend of foam over the water colour: thin foam stays translucent

  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}

  varying vec3 vWorld;
  #include <fog_pars_fragment>

  // Signed distance to the coast (+ land, - water) from a baked field texel.
  float coastDistance(vec4 texel, bool inField) {
    if (!inField) return -OPEN_SEA_COAST_DISTANCE;
    return terrainFieldCoastDistance(texel);
  }

  // Wrap coordinates to prevent floating-point precision loss at large values
  vec2 wrapCoord(vec2 p) {
    return mod(p, 289.0);
  }

  float hash(vec2 p) {
    p = wrapCoord(p);
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    // Wrap integer coordinates to prevent precision issues
    vec2 iw = wrapCoord(i);
    return -1.0 + 2.0 * mix(
      mix(hash(iw + vec2(0.0, 0.0)), hash(iw + vec2(1.0, 0.0)), u.x),
      mix(hash(iw + vec2(0.0, 1.0)), hash(iw + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Foam amount (0..1) on the water at worldXZ, given the signed coast distance
  // and the depth of the drawn seabed below, in metres.
  // Time only enters as sin/cos of 2π·surfTime/period (surfTime is wrapped on
  // the CPU), so nothing here loses precision over a long session.
  float surfFoam(vec2 worldXZ, float coastDist, float depthMetres) {
    float off = -coastDist; // distance offshore; <= 0 on land
    if (off <= 0.0 || off >= SURF_MAX_REACH || depthMetres >= SURF_DEPTH_NONE) return 0.0;

    // Each stretch of coast gets its own phase, so the surf doesn't move in step.
    float phase = noise(worldXZ * SURF_PHASE_SCALE) * SURF_PHASE_SPREAD;
    float pulseAngle = 2.0 * PI * surfTime / SURF_PULSE_PERIOD + phase;

    // Shore wash: dense at the waterline, reaching further out at the flood.
    float pulse = 0.5 + 0.5 * sin(pulseAngle);
    float washReach = mix(SURF_WASH_MIN, SURF_WASH_MAX, pulse);
    float wash = 1.0 - smoothstep(washReach * 0.35, washReach, off);

    // Break the bands into patches: the breakup noise circles a small loop each
    // churn cycle (bounded offset, so precision-safe), and denser foam lets
    // more of the noise through.
    float churnAngle = 2.0 * PI * surfTime / SURF_CHURN_PERIOD;
    vec2 churn = vec2(cos(churnAngle), sin(churnAngle)) * SURF_CHURN_AMOUNT;
    vec2 q = worldXZ * SURF_NOISE_SCALE;
    float n = 0.5 + 0.22 * noise(q + churn) + 0.18 * noise(q * 2.1 - churn.yx)
      + 0.1 * noise(q * SURF_LACE_SCALE + churn * 1.7);
    wash *= 1.0 - smoothstep(SURF_DEPTH_FULL, SURF_DEPTH_NONE, depthMetres);
    float threshold = 1.0 - wash * SURF_COVERAGE;
    float foam = smoothstep(threshold, threshold + SURF_BREAKUP_SOFTNESS, n);

    return foam * smoothstep(0.0, SURF_EDGE_SOFTNESS, off) * SURF_STRENGTH;
  }

  float diffuse(vec3 n, vec3 l, float p) {
    return pow(dot(n, l) * 0.4 + 0.6, p);
  }

  // Sky radiance along e, blurred to the PMREM roughness. Rays reflected below
  // the horizon would see the sea itself, so they are held at the horizon.
  vec3 getSkyColor(vec3 e, float roughness) {
    vec3 dir = normalize(vec3(e.x, max(e.y, 0.0), e.z) + vec3(0.0, 1e-4, 0.0));
    return textureCubeUV(skyEnv, dir, roughness).rgb * skyIntensity;
  }

  // World Y of the seabed seen through prepass texel (i, j).
  float seabedTexelY(ivec2 texel) {
    float z = texelFetch(seabedDepth, texel, 0).r;
    if (z >= 1.0) return NO_SEABED_Y;
    vec2 uv = (vec2(texel) + 0.5) / seabedSize;
    vec4 view = cameraProjectionInverse * vec4(vec3(uv, z) * 2.0 - 1.0, 1.0);
    return (cameraWorld * vec4(view.xyz / view.w, 1.0)).y;
  }

  // The four prepass texels around \`screenUv\` and their bilinear weights.
  void seabedTexels(vec2 screenUv, out ivec2 texels[4], out float weights[4]) {
    vec2 st = screenUv * seabedSize - 0.5;
    ivec2 maxTexel = ivec2(seabedSize) - 1;
    ivec2 i0 = clamp(ivec2(floor(st)), ivec2(0), maxTexel);
    ivec2 i1 = min(i0 + 1, maxTexel);
    vec2 f = clamp(st - floor(st), 0.0, 1.0);
    texels = ivec2[4](i0, ivec2(i1.x, i0.y), ivec2(i0.x, i1.y), i1);
    weights = float[4]((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  }

  // The seabed under this pixel: its world Y (returned) and lit colour,
  // bilinear between the four nearest prepass texels. The seabed's height is
  // smooth where its raw depth is not: across a half-resolution texel the depth
  // jumps by the slant of the view ray, which turned into stair-step bands in
  // the water colour. Texels that hit land above sea level are left out (the
  // weights renormalised over the rest): next to an island's silhouette a
  // half-resolution texel can catch the land, and mixing in its depth (≈ 0) and
  // colour drew a 1–2 px land-coloured fringe on the water (#38).
  float seabedSample(vec2 screenUv, out vec3 colour) {
    ivec2 texels[4];
    float weights[4];
    seabedTexels(screenUv, texels, weights);
    float y = 0.0;
    float total = 0.0;
    float yAll = 0.0;
    vec3 colourAll = vec3(0.0);
    colour = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      float texelY = seabedTexelY(texels[k]);
      vec3 texelColour = texelFetch(seabedColor, texels[k], 0).rgb;
      yAll += weights[k] * texelY;
      colourAll += weights[k] * texelColour;
      if (texelY > 0.0) continue; // land above sea level
      y += weights[k] * texelY;
      colour += weights[k] * texelColour;
      total += weights[k];
    }
    // Only land around (rare: a sliver at the waterline): use all four.
    if (total < 1e-4) {
      colour = colourAll;
      return yAll;
    }
    colour /= total;
    return y / total;
  }

  // The seabed's world Y under \`screenUv\`, as seabedSample without the colour.
  float seabedHeight(vec2 screenUv) {
    ivec2 texels[4];
    float weights[4];
    seabedTexels(screenUv, texels, weights);
    float y = 0.0;
    float total = 0.0;
    float yAll = 0.0;
    for (int k = 0; k < 4; k++) {
      float texelY = seabedTexelY(texels[k]);
      yAll += weights[k] * texelY;
      if (texelY > 0.0) continue;
      y += weights[k] * texelY;
      total += weights[k];
    }
    return total < 1e-4 ? yAll : y / total;
  }

  // Prepass uv (xy) of the point where a ray from the surface at vWorld along
  // the unit refracted direction \`refracted\` reaches \`depthUnits\` below the
  // surface, and (z) its clip w: only a point in front of the camera (w > 0)
  // has a texel.
  vec3 refractedHitUv(vec3 refracted, float depthUnits) {
    vec3 hit = vWorld + refracted * (depthUnits / max(-refracted.y, 1e-3));
    vec4 clip = cameraViewProjection * vec4(hit, 1.0);
    return vec3(clip.xy / clip.w * 0.5 + 0.5, clip.w);
  }

  // Refraction (#38 step 6). The prepass holds the seabed each pixel sees
  // along its straight view ray; the real view ray bends at the wave facet
  // (Snell) and meets the seabed where that refracted ray hits it, so the
  // seabed is looked up there instead. The hit needs the depth, which is
  // taken from the prepass as well: first under this pixel, then once more
  // under the hit, so a ray leaving a shelf for deep water (or the reverse)
  // ends on the seabed it would really meet. The look-up falls back to the
  // straight sample when the hit is off screen, on land above sea level or
  // where no seabed was drawn.
  // Returns the seabed's lit colour; \`seabedWorldY\` gets its world Y and
  // \`refracted\` the refracted view direction.
  vec3 refractedSeabed(vec3 dir, vec3 facetNormal, out float seabedWorldY, out vec3 refracted) {
    vec2 screenUv = gl_FragCoord.xy / screenSize;
    vec3 straightColour;
    float straightY = seabedSample(screenUv, straightColour);

    refracted = refract(dir, facetNormal, 1.0 / WATER_IOR);
    // No ray is bent past the critical angle on a level sea; the gained
    // slopes' tails at grazing views are held there (waterOptics.ts).
    vec2 travel = refracted.xz / max(-refracted.y, 1e-3);
    travel *= min(1.0, MAX_REFRACTED_TRAVEL / max(length(travel), 1e-6));
    refracted = normalize(vec3(travel.x, -1.0, travel.y));

    float depth0 = clamp(-straightY, 0.0, REFRACTION_MAX_DEPTH_UNITS);
    float depth1 = clamp(-seabedHeight(refractedHitUv(refracted, depth0).xy), 0.0, REFRACTION_MAX_DEPTH_UNITS);
    vec3 hit = refractedHitUv(refracted, depth1);
    vec2 hitUv = hit.xy;
    vec3 hitColour;
    float hitY = seabedSample(hitUv, hitColour);

    bool onScreen = hit.z > 0.0 && all(greaterThanEqual(hitUv, vec2(0.0))) && all(lessThanEqual(hitUv, vec2(1.0)));
    bool onSeabed = hitY <= 0.0 && hitY > NO_SEABED_Y + 1e-3;
    if (onScreen && onSeabed) {
      seabedWorldY = hitY;
      return hitColour;
    }
    seabedWorldY = straightY;
    return straightColour;
  }

  // Light from the water body: the prepass seabed (\`seabed\`, at world Y
  // \`seabedWorldY\`) seen through the water along the refracted view ray,
  // plus the deep-water glow, for the surface point at this pixel.
  // \`sunFacet\` is the local facet's share of the direct sun (facetSunlight).
  // Returns the colour; \`depth\` gets the seabed's depth in metres.
  vec3 waterBody(vec3 seabed, float seabedWorldY, vec3 refracted, float sunFacet, out float depth) {
    // The seabed's depth below the surface, and the path down to it along the
    // refracted view ray, in metres.
    depth = max(-seabedWorldY, 0.0) * METRES_PER_UNIT;
    float viewPath = depth / max(-refracted.y, 0.05);

    // Sunlight reaches the seabed along the refracted sun ray, then the light
    // it reflects comes back up the view ray.
    float sunCos = max(light.y, 0.0);
    vec3 t = waterTransmittance(depth / refractedCosine(sunCos) + viewPath);
    t *= 1.0 - smoothstep(SEABED_FADE_START, SEABED_FADE_END, depth);

    // Downwelling irradiance on a level surface, in the units three lights the
    // seabed with (Lambert: sun irradiance / π, plus the sky's diffuse term).
    vec3 sunDirect = sunIrradiance * sunCos / PI;
    vec3 skyDiffuse = textureCubeUV(skyEnv, vec3(0.0, 1.0, 0.0), 1.0).rgb * skyIntensity;

    // The water's own glow is scattered from just below the surface, so it is
    // lit through the local wave facet: sun-facing faces look lighter. (The
    // seabed's sunlight is focused by the facets above it in the prepass
    // itself: seabedCaustics.ts.)
    vec3 facetDownwelling = sunDirect * sunFacet + skyDiffuse;
    vec3 deep = deepWaterReflectance() * facetDownwelling;
    vec3 body = seabed * t + deep * (1.0 - t);
    // Stylistic, not physics: lift deep water past the shelf. It is added on
    // top rather than mixed by (1 − t): the lifted blue is brighter than the
    // seabed's own, so mixing drew a dark ring wherever the seabed still shows.
    vec3 lift = liftedDeepWaterReflectance(deepWaterLiftWeight(depth)) - deepWaterReflectance();
    body += lift * facetDownwelling;
    // Stylistic, not physics: a mild saturation boost in the shallows only.
    float luma = dot(body, vec3(0.2126, 0.7152, 0.0722));
    return max(mix(vec3(luma), body, 1.0 + shallowSaturationBoost(depth, t.r)), 0.0);
  }

  void main() {
    vec3 toSurface = vWorld - cameraPosition;
    vec3 dir = normalize(toSurface);
    // World XZ per screen pixel (taken first, in uniform control flow).
    mat2 worldPerPixel = mat2(dFdx(vWorld.xz), dFdy(vWorld.xz));

    // Wave slope from the FFT look-ups, faded with distance and, per cascade,
    // once its band is sub-pixel; the slope variance that filtering and
    // fading remove becomes roughness. The footprint is the pixel's longer
    // side on the sea, so grazing views fade early rather than shimmer.
    float footprintMetres = max(length(worldPerPixel[0]), length(worldPerPixel[1])) * METRES_PER_UNIT;
    float distanceFade = waveDetailFade(length(toSurface));
    float cascadeWeights[WAVE_CASCADE_COUNT];
    for (int i = 0; i < WAVE_CASCADE_COUNT; i++) cascadeWeights[i] = 1.0;
    vec2 slope;
    float slopeVariance;
    sumCascadeSlopes(vWorld.xz, footprintMetres, distanceFade, cascadeWeights, 0.0, slope, slopeVariance);
    // The glint sees the drawn slopes, so the sun path stays narrow ...
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    float alpha2 = GLINT_BASE_ROUGHNESS2 + slopeVariance;
    // ... the sky reflection and the refracted seabed see them scaled to the
    // measured slope of the real sea (WAVE_SHADING_GAIN, oceanWaves.ts).
    vec2 shadeSlope = slope * WAVE_SHADING_GAIN;
    vec3 nShade = normalize(vec3(-shadeSlope.x, 1.0, -shadeSlope.y));
    float shadeAlpha2 = GLINT_BASE_ROUGHNESS2 + WAVE_SHADING_GAIN * WAVE_SHADING_GAIN * slopeVariance;
    // PMREM roughness is perceptual: α = roughness², α² = roughness⁴.
    float skyRoughness = max(SKY_REFLECTION_ROUGHNESS, sqrt(sqrt(shadeAlpha2)));

    // Terrain field for the surf; sampled up front so the texture lookup
    // stays in uniform control flow.
    vec2 fieldUv = terrainFieldUv(vWorld.xz);
    bool inField = terrainFieldInside(fieldUv);
    vec4 fieldTexel = texture2D(terrainField, fieldUv);

    // The seabed this pixel really sees, through the refracting facet.
    float seabedWorldY;
    vec3 refracted;
    vec3 seabed = refractedSeabed(dir, nShade, seabedWorldY, refracted);

    // Fresnel splits what we see between light from the water body and the
    // reflected sky.
    float fresnel = schlickFresnel(dot(nShade, -dir));
    float seabedDepthMetres;
    vec3 seaColor = waterBody(seabed, seabedWorldY, refracted, facetSunlight(nShade, light), seabedDepthMetres) * (1.0 - fresnel)
      + getSkyColor(reflect(dir, nShade), skyRoughness) * fresnel;
    // The sun's own reflection (the sky map has no solar disc): GGX, HDR and
    // unclamped so its brightest sparkles bloom.
    seaColor += sunGlintRadiance(n, -dir, light, alpha2, sunIrradiance);

    // Surf on top, lightly shaded by the wave normal so it sits on the water.
    float foam = surfFoam(vWorld.xz, coastDistance(fieldTexel, inField), seabedDepthMetres);
    vec3 foamColor = PALETTE_SURF * (0.8 + 0.2 * diffuse(nShade, light, 1.0));
    seaColor = mix(seaColor, foamColor, foam);

    gl_FragColor = vec4(seaColor, 1.0);
    #include <fog_fragment>
  }
`;

interface OceanProps {
  cells: readonly MapCell[];
  /** The map's east–west wrap; with one the water's terrain look-ups repeat every wrap width. */
  wrap: MapWrap;
  /** Side of the square plane, centred under the camera focus. */
  size?: number;
  /** Unit vector towards the sun (the scene's SUN_DIRECTION). */
  sun: Vec3;
  /** The directional sun's colour (sRGB) and intensity, so the glint matches it. */
  sunColor: string;
  sunIntensity: number;
  /** The sky environment PMREM the sea reflects. */
  sky: Texture;
  /** Height in texels of the `sky` PMREM atlas. */
  skyHeight: number;
  /** Radiance scale for `sky`, matching `scene.environmentIntensity`. */
  skyIntensity: number;
  /** The wave cascades' slope textures (useWaveCascades), one per cascade, shared with the seabed caustics. */
  waveSlopes: readonly Texture[];
}

/**
 * The baked terrain field as a GPU texture (layout in terrainFieldTexture.ts).
 * On a wrapping map it covers one wrap width and repeats in s (#36).
 */
function terrainFieldTexture(
  cells: readonly MapCell[],
  wrap: MapWrap
): { texture: DataTexture; bounds: TerrainBounds } {
  const { data, width, height, bounds } = bakeTerrainField(sharedTerrainField(cells, wrap), {
    sampleReef: createReefMask(cells, wrap),
  });
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = wrap ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, bounds };
}

export function Ocean({
  cells,
  wrap,
  size = 1024,
  sun,
  sunColor,
  sunIntensity,
  sky,
  skyHeight,
  skyIntensity,
  waveSlopes,
}: OceanProps) {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [size]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Built once per map.
  const field = useMemo(() => terrainFieldTexture(cells, wrap), [cells, wrap]);
  useEffect(() => () => field.texture.dispose(), [field]);

  // The seabed under the water, rendered each frame before the main pass.
  const seabed = useSeabedPrepass();

  const reducedMotion = usePrefersReducedMotion();

  const material = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = field.bounds;
    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // Opt in to scene fog: three fills these uniforms from scene.fog.
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          surfTime: { value: 0 },
          light: { value: new Vector3(...sun) },
          sunIrradiance: { value: new Color(sunColor).multiplyScalar(sunIntensity) },
          skyIntensity: { value: skyIntensity },
          mapBounds: { value: new Vector4(minX, maxX, minZ, maxZ) },
        },
      ]),
      defines: wrap ? { ...cubeUvDefines(skyHeight), TERRAIN_FIELD_WRAP_X: "" } : cubeUvDefines(skyHeight),
      fog: true,
    });
    // UniformsUtils.merge clones uniform values, so textures are attached afterwards.
    mat.uniforms.terrainField = { value: field.texture };
    mat.uniforms.skyEnv = { value: sky };
    mat.uniforms.seabedColor = { value: seabed.texture };
    mat.uniforms.seabedDepth = { value: seabed.depthTexture };
    mat.uniforms.screenSize = { value: new Vector2(1, 1) };
    mat.uniforms.seabedSize = { value: new Vector2(1, 1) };
    mat.uniforms.cameraProjectionInverse = { value: new Matrix4() };
    mat.uniforms.cameraWorld = { value: new Matrix4() };
    mat.uniforms.cameraViewProjection = { value: new Matrix4() };
    bindWaveSlopeTextures(mat.uniforms, waveSlopes);
    return mat;
  }, [sun, sunColor, sunIntensity, sky, skyHeight, skyIntensity, field, seabed, waveSlopes, wrap]);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<Mesh>(null);
  const controls = useThree((state) => state.controls);

  useFrame(({ gl, camera }, delta) => {
    if (meshRef.current) {
      // The plane is centred under the camera focus, so it covers the view
      // wherever the camera pans (east–west forever on a wrapping map). All
      // shading is in world space, so moving the plane changes no pixel.
      const focus = controlsTarget(controls);
      if (focus) meshRef.current.position.set(focus.x, 0, focus.z);
      const mat = meshRef.current.material as ShaderMaterial;
      gl.getDrawingBufferSize(mat.uniforms.screenSize.value);
      mat.uniforms.seabedSize.value.set(seabed.width, seabed.height);
      mat.uniforms.cameraProjectionInverse.value.copy(camera.projectionMatrixInverse);
      mat.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      mat.uniforms.cameraViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      mat.uniforms.surfTime.value = advanceSurfTime(mat.uniforms.surfTime.value, delta, reducedMotion);
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
