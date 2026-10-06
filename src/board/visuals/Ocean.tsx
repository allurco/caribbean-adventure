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
} from "three";
import type { Texture } from "three";
import { wrapWorldWidth } from "../../game/hex";
import { controlsTarget } from "../controlsTarget";
import { cubeUvDefines } from "./skyEnvironment";
import type { Vec3 } from "./sunDirection";
import { TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import { advanceSurfTime, SURF_TIMING_GLSL, surfTimeUniform } from "./surfMotion";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { useSeabedPrepass } from "./seabedPrepass";
import { WATER_OPTICS_GLSL } from "./waterOptics";
import { METRES_PER_UNIT } from "./worldScale";
import { GLINT_BASE_ROUGHNESS2 } from "./oceanWaves";
import { SUN_GLINT_GLSL } from "./sunGlint";
import { bindWaveSlopeTextures, bindWhitecapTextures, WAVE_SLOPE_GLSL } from "./waveSlopeGlsl";
import { CASCADE_PRIORITY } from "./useWaveCascades";
import type { TerrainFieldTexture } from "./useTerrainFieldTexture";
import { FOAM_MOTION_GLSL, FOAM_SHADING_GLSL } from "./foamShading";
import { SHORE_FOAM_GLSL } from "./shoreFoam";
import { HULL_FOAM_GLSL } from "./hullFoam";
import { WHITECAP_FOAM_GLSL } from "./whitecapFoam";
import { SHIP_FOAM_CAP, SHIP_FOAM_FLOATS_A, SHIP_FOAM_FLOATS_B, shipFoamSources } from "../shipFoamSources";

/** After the cascades have drawn this frame's whitecaps, before the seabed prepass (0.5). */
const WHITECAP_BIND_PRIORITY = CASCADE_PRIORITY + 0.05;

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

  // Foam (#38 step 7): whitecaps from the cascades' accumulated folds
  // (whitecapFoam.ts, sampled by sumCascadeWhitecaps above), the shore and
  // reef bands from the seabed's depth and the terrain field
  // (shoreFoam.ts), and contact foam around the ships (hullFoam.ts,
  // positions from shipFoamSources.ts). Each coverage is broken into lace
  // by a world-space noise churned on the surf clock, the three are
  // unioned, and the foam replaces the water under it as a sunlit diffuse
  // layer (foamShading.ts). The wash on the sand side of the waterline is
  // drawn by the land itself (shoreFoamLand.ts) on the same clock.
  uniform float surfTime; // seconds, wrapped on the CPU to a whole number of periods
  ${SURF_TIMING_GLSL}
  ${FOAM_MOTION_GLSL}
  ${FOAM_SHADING_GLSL}
  ${SHORE_FOAM_GLSL}
  ${WHITECAP_FOAM_GLSL}
  ${HULL_FOAM_GLSL}

  const int SHIP_FOAM_CAP = ${SHIP_FOAM_CAP};
  uniform vec4 shipFoamA[SHIP_FOAM_CAP]; // x, z, heading x, heading z
  uniform vec2 shipFoamB[SHIP_FOAM_CAP]; // hull length, speed
  uniform int shipFoamCount;
  uniform float shipFoamWrap; // the map's wrap width; 0 where it does not wrap

  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}

  varying vec3 vWorld;
  #include <fog_pars_fragment>

  // Hull foam coverage at worldXZ: the strongest of the ships' patches,
  // each measured the short way round on a wrapping map.
  float shipFoamCoverage(vec2 worldXZ) {
    float coverage = 0.0;
    for (int i = 0; i < SHIP_FOAM_CAP; i++) {
      if (i >= shipFoamCount) break;
      vec2 d = worldXZ - shipFoamA[i].xy;
      if (shipFoamWrap > 0.0) d.x -= shipFoamWrap * floor(d.x / shipFoamWrap + 0.5);
      coverage = max(coverage, hullFoamCoverage(d, shipFoamA[i].zw, shipFoamB[i].x, shipFoamB[i].y));
    }
    return coverage;
  }

  // A coverage turned into lace by the breakup noise at \`scale\` cycles per
  // unit, falling back to its smooth mean where the lace's \`featureMetres\`
  // features are under a few pixels.
  float lacedFoam(float coverage, float scale, float featureMetres, vec2 churn, float footprintMetres) {
    float lace = foamLace(coverage, foamBreakupNoise(vWorld.xz, scale, churn));
    return mix(coverage * FOAM_FAR_SHARE, lace, foamDetailFade(footprintMetres, featureMetres));
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
  // \`sunFacet\` is the local facet's share of the direct sun (facetSunlight);
  // \`skyDiffuse\` the sky's downwelling term.
  // Returns the colour; \`depth\` gets the seabed's depth in metres.
  vec3 waterBody(vec3 seabed, float seabedWorldY, vec3 refracted, float sunFacet, vec3 skyDiffuse, out float depth) {
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
    // The whitecaps, through the same tile transforms and fades.
    float whitecapCoverage = sumCascadeWhitecaps(vWorld.xz, footprintMetres, distanceFade, cascadeWeights);
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

    // Terrain field for the shore and reef foam; sampled up front so the
    // texture lookup stays in uniform control flow.
    vec2 fieldUv = terrainFieldUv(vWorld.xz);
    bool inField = terrainFieldInside(fieldUv);
    vec4 fieldTexel = texture2D(terrainField, fieldUv);

    // The seabed this pixel really sees, through the refracting facet.
    float seabedWorldY;
    vec3 refracted;
    vec3 seabed = refractedSeabed(dir, nShade, seabedWorldY, refracted);

    // Fresnel splits what we see between light from the water body and the
    // reflected sky.
    vec3 skyDiffuse = textureCubeUV(skyEnv, vec3(0.0, 1.0, 0.0), 1.0).rgb * skyIntensity;
    float fresnel = schlickFresnel(dot(nShade, -dir));
    float seabedDepthMetres;
    vec3 seaColor = waterBody(seabed, seabedWorldY, refracted, facetSunlight(nShade, light), skyDiffuse, seabedDepthMetres) * (1.0 - fresnel)
      + getSkyColor(reflect(dir, nShade), skyRoughness) * fresnel;
    // The sun's own reflection (the sky map has no solar disc): GGX, HDR and
    // unclamped so its brightest sparkles bloom.
    seaColor += sunGlintRadiance(n, -dir, light, alpha2, sunIrradiance);

    // Foam on top. The shore bands pulse on the surf clock (the breaker sets
    // lead the wash); every coverage is laced by its own breakup noise and
    // fades with distance like the waves (the whitecaps already have).
    vec2 churn = surfChurn(surfTime);
    float pulse = surfPulse(vWorld.xz, surfTime, 0.0);
    float sets = surfPulse(vWorld.xz, surfTime, SETS_PHASE_LEAD);
    float reef = inField ? terrainFieldReef(fieldTexel) : 0.0;
    float shoreCoverage = shoreFoamCoverage(seabedDepthMetres, reef, terrainFieldReefWindward(fieldTexel), pulse, sets) * distanceFade;
    float hullCoverage = shipFoamCoverage(vWorld.xz) * distanceFade;
    float shore = lacedFoam(shoreCoverage, SHORE_FOAM_NOISE_SCALE, SHORE_FOAM_LACE_METRES, churn, footprintMetres);
    float whitecaps = lacedFoam(whitecapCoverage, WHITECAP_NOISE_SCALE, WHITECAP_LACE_METRES, churn, footprintMetres);
    float hull = lacedFoam(hullCoverage, HULL_FOAM_NOISE_SCALE, HULL_FOAM_LACE_METRES, churn, footprintMetres);
    float foam = combineFoam(shore, whitecaps, hull);
    // Foam is rough and opaque: it replaces the water, its sky reflection and
    // its glint, as a diffuse layer lit by the sun and the sky.
    seaColor = mix(seaColor, foamRadiance(nShade, light, sunIrradiance, skyDiffuse), foam);

    gl_FragColor = vec4(seaColor, 1.0);
    #include <fog_fragment>
  }
`;

interface OceanProps {
  /** The map's baked terrain field (useTerrainFieldTexture): depth, coast distance, reefs. */
  terrainField: TerrainFieldTexture;
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
  /**
   * The whitecap foam accumulated per whitecapping cascade (useWaveCascades),
   * in WHITECAP_CASCADES order. The entries are swapped in place every frame,
   * so they are rebound each frame, not captured at material creation.
   */
  waveWhitecaps: readonly Texture[];
}

export function Ocean({
  terrainField,
  size = 1024,
  sun,
  sunColor,
  sunIntensity,
  sky,
  skyHeight,
  skyIntensity,
  waveSlopes,
  waveWhitecaps,
}: OceanProps) {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [size]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // The seabed under the water, rendered each frame before the main pass.
  const seabed = useSeabedPrepass();

  const reducedMotion = usePrefersReducedMotion();

  const material = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = terrainField.bounds;
    const wrap = terrainField.wrap;
    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // Opt in to scene fog: three fills these uniforms from scene.fog.
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          light: { value: new Vector3(...sun) },
          sunIrradiance: { value: new Color(sunColor).multiplyScalar(sunIntensity) },
          skyIntensity: { value: skyIntensity },
          mapBounds: { value: new Vector4(minX, maxX, minZ, maxZ) },
          shipFoamCount: { value: 0 },
          shipFoamWrap: { value: wrap ? wrapWorldWidth(wrap) : 0 },
        },
      ]),
      defines: wrap ? { ...cubeUvDefines(skyHeight), TERRAIN_FIELD_WRAP_X: "" } : cubeUvDefines(skyHeight),
      fog: true,
    });
    // UniformsUtils.merge clones uniform values, so textures, shared uniforms
    // and the ship arrays are attached afterwards.
    mat.uniforms.surfTime = surfTimeUniform;
    mat.uniforms.terrainField = { value: terrainField.texture };
    mat.uniforms.skyEnv = { value: sky };
    mat.uniforms.seabedColor = { value: seabed.texture };
    mat.uniforms.seabedDepth = { value: seabed.depthTexture };
    mat.uniforms.screenSize = { value: new Vector2(1, 1) };
    mat.uniforms.seabedSize = { value: new Vector2(1, 1) };
    mat.uniforms.cameraProjectionInverse = { value: new Matrix4() };
    mat.uniforms.cameraWorld = { value: new Matrix4() };
    mat.uniforms.cameraViewProjection = { value: new Matrix4() };
    mat.uniforms.shipFoamA = { value: new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_A) };
    mat.uniforms.shipFoamB = { value: new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_B) };
    bindWaveSlopeTextures(mat.uniforms, waveSlopes);
    bindWhitecapTextures(mat.uniforms, waveWhitecaps);
    return mat;
  }, [sun, sunColor, sunIntensity, sky, skyHeight, skyIntensity, terrainField, seabed, waveSlopes, waveWhitecaps]);
  useEffect(() => () => material.dispose(), [material]);

  // The whitecap accumulators ping-pong, so the current one is rebound after
  // the cascades have drawn this frame and before the frame renders.
  useFrame(() => {
    bindWhitecapTextures(material.uniforms, waveWhitecaps);
  }, WHITECAP_BIND_PRIORITY);

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
      // The one surf clock, shared with the land's shoreline foam.
      surfTimeUniform.value = advanceSurfTime(surfTimeUniform.value, delta, reducedMotion);
      // This frame's animated ship positions (written by Ship.tsx) for the hull foam.
      mat.uniforms.shipFoamCount.value = shipFoamSources.fill(mat.uniforms.shipFoamA.value, mat.uniforms.shipFoamB.value);
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
