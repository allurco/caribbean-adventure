import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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
} from "three";
import type { Texture } from "three";
import { cubeUvDefines } from "./skyEnvironment";
import type { Vec3 } from "./sunDirection";
import type { MapCell } from "../../game/types";
import { PALETTE_GLSL } from "./palette";
import { sharedTerrainField } from "./sharedTerrainField";
import { bakeTerrainField, TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import { advanceSurfTime, SURF_TIMING_GLSL } from "./surfMotion";
import { advanceCausticTime, CAUSTIC_TIMING_GLSL } from "./causticMotion";
import { CAUSTIC_PATTERN_GLSL } from "./causticPattern";
import { createReefMask } from "./reefMask";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import type { TerrainBounds } from "./terrainHeightField";
import { useSeabedPrepass } from "./seabedPrepass";
import { WATER_OPTICS_GLSL } from "./waterOptics";
import { METRES_PER_UNIT } from "./worldScale";

const vertexShader = `
  varying vec3 eye;
  varying vec3 pos;
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  void main () {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    pos = position;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    eye = vec3(mvPosition) * normalMatrix;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec3 light; // unit vector towards the sun, shared with the scene's directional light
  uniform vec3 sunIrradiance; // linear sun colour × intensity, as the directional light

  // The scene's sky environment (a PMREM; see useSkyEnvironment.ts).
  uniform sampler2D skyEnv;
  uniform float skyIntensity;
  #include <cube_uv_reflection_fragment>
  // Mirror-like lookup; the wave normals carry the surface detail.
  const float SKY_REFLECTION_ROUGHNESS = 0.05;

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
  // World Y given to prepass texels with no seabed: far below the fade.
  const float NO_SEABED_Y = -1000.0;
  // The seabed mesh stops at 100 m (landMesh.ts); its faint remaining light
  // fades out above that so the cut never shows.
  const float SEABED_FADE_START = 70.0; // metres
  const float SEABED_FADE_END = 95.0;   // metres

  const float PI = 3.14159265358;
  // Finite-difference step for wave normals, in world units. It must stay well
  // above float precision at the wave coordinates, which grow with SEA_TIME;
  // a step near 1e-5 turns the normals into noise (white static) within minutes.
  const float NORMAL_STEP = 0.02;

  const int NUM_STEPS = 6;
  const int ITER_GEOMETRY = 2;
  const int ITER_FRAGMENT = 5;

  const float SEA_HEIGHT = 0.05;
  const float SEA_CHOPPY = 0.5;
  const float SEA_SPEED = 0.6;
  const float SEA_FREQ = 1.8;
  ${PALETTE_GLSL}
  #define SEA_TIME (iTime * SEA_SPEED)

  const float OPEN_SEA_COAST_DISTANCE = 10.0; // offshore distance assumed outside the map bounds

  // Shore surf (issue #10). Distances are world units offshore from the
  // waterline (a hex is ~1.7 across); the foam lives on the ocean plane only
  // where the baked coast distance is negative, so it never draws on land.
  uniform float surfTime; // seconds, wrapped on the CPU to a whole number of periods
  ${SURF_TIMING_GLSL}
  const float SURF_EDGE_SOFTNESS = 0.02; // foam fades in over this just offshore, so it meets the land with no gap
  const float SURF_WASH_MIN = 0.12;      // width of the shore wash at the ebb of the pulse
  const float SURF_WASH_MAX = 0.32;      // ... and at the flood
  const float SURF_BREAKER_NEAR = 0.3;   // the outer breaker line rolls between these distances
  const float SURF_BREAKER_FAR = 0.55;
  const float SURF_BREAKER_WIDTH = 0.06; // half-width of the breaker line
  const float SURF_BREAKER_LAG = 1.2;    // radians the breaker trails the wash in the pulse
  const float SURF_MAX_REACH = 0.62;     // no foam beyond this (keep >= BREAKER_FAR + BREAKER_WIDTH)
  const float SURF_PHASE_SCALE = 0.45;   // along-coast phase noise frequency; lower = longer stretches in step
  const float SURF_PHASE_SPREAD = 3.0;   // radians of pulse offset between stretches of coast
  const float SURF_NOISE_SCALE = 6.0;    // frequency of the noise that breaks the foam up
  const float SURF_CHURN_AMOUNT = 0.35;  // radius (noise units) the breakup noise circles each churn cycle
  const float SURF_COVERAGE = 0.8;       // < 1 leaves holes even in the densest foam
  const float SURF_BREAKUP_SOFTNESS = 0.12; // edge softness of the foam patches
  const float SURF_STRENGTH = 0.9;       // max blend of foam over the water colour

  // Shallow-water caustics (issue #11): a moving web of light on the seabed,
  // only in the shallows. It redistributes the seabed's direct sunlight before
  // the water attenuates it; scale, contrast and level of detail are in
  // causticPattern.ts (#38). Time only enters as sin/cos of
  // 2π·causticTime/period (causticTime is wrapped on the CPU, see
  // causticMotion.ts), so it never jumps or loses precision.
  uniform float causticTime;
  ${CAUSTIC_TIMING_GLSL}
  ${CAUSTIC_PATTERN_GLSL}
  const float CAUSTIC_LAYER_B_SCALE = 1.37; // second layer's frequency multiplier, so the layers never line up
  const float CAUSTIC_DRIFT = 0.6;          // radius (noise units) each layer circles once per period
  const float CAUSTIC_LINE_WIDTH = 0.12;    // noise distance from a zero crossing that still lights: smaller gives thinner lines

  mat2 octave_m = mat2(1.7, 1.2, -1.2, 1.4);

  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}

  varying vec3 eye;
  varying vec3 pos;
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

  // Foam amount (0..1) on the water at worldXZ, given the signed coast distance.
  // Time only enters as sin/cos of 2π·surfTime/period (surfTime is wrapped on
  // the CPU), so nothing here loses precision over a long session.
  float surfFoam(vec2 worldXZ, float coastDist) {
    float off = -coastDist; // distance offshore; <= 0 on land
    if (off <= 0.0 || off >= SURF_MAX_REACH) return 0.0;

    // Each stretch of coast gets its own phase, so the surf doesn't move in step.
    float phase = noise(worldXZ * SURF_PHASE_SCALE) * SURF_PHASE_SPREAD;
    float pulseAngle = 2.0 * PI * surfTime / SURF_PULSE_PERIOD + phase;

    // Shore wash: dense at the waterline, reaching further out at the flood.
    float pulse = 0.5 + 0.5 * sin(pulseAngle);
    float washReach = mix(SURF_WASH_MIN, SURF_WASH_MAX, pulse);
    float wash = 1.0 - smoothstep(washReach * 0.35, washReach, off);

    // Breaker line: trails the wash, rolling in toward the shore and back out,
    // brightest when it is closest in.
    float roll = 0.5 + 0.5 * sin(pulseAngle - SURF_BREAKER_LAG);
    float breakerAt = mix(SURF_BREAKER_FAR, SURF_BREAKER_NEAR, roll);
    float breaker = (1.0 - smoothstep(0.0, SURF_BREAKER_WIDTH, abs(off - breakerAt))) * mix(0.35, 0.8, roll);

    // Break the bands into patches: the breakup noise circles a small loop each
    // churn cycle (bounded offset, so precision-safe), and denser foam lets
    // more of the noise through.
    float churnAngle = 2.0 * PI * surfTime / SURF_CHURN_PERIOD;
    vec2 churn = vec2(cos(churnAngle), sin(churnAngle)) * SURF_CHURN_AMOUNT;
    vec2 q = worldXZ * SURF_NOISE_SCALE;
    float n = 0.5 + 0.25 * noise(q + churn) + 0.25 * noise(q * 2.1 - churn.yx);
    float threshold = 1.0 - max(wash, breaker) * SURF_COVERAGE;
    float foam = smoothstep(threshold, threshold + SURF_BREAKUP_SOFTNESS, n);

    return foam * smoothstep(0.0, SURF_EDGE_SOFTNESS, off) * SURF_STRENGTH;
  }

  // The caustic web (0..1) at noise coordinate q: 1 on the light lines.
  float causticWeb(vec2 q) {
    // Two ridged-noise webs, each circling a small loop on its own period.
    float a = 2.0 * PI * causticTime / CAUSTIC_PERIOD_A;
    float b = 2.0 * PI * causticTime / CAUSTIC_PERIOD_B;
    // Each layer's light lines are the noise zero crossings: thin contours that
    // wind into a web, rather than a broad lift that the bright shallows hide.
    float n1 = noise(q + vec2(cos(a), sin(a)) * CAUSTIC_DRIFT);
    float n2 = noise(q * CAUSTIC_LAYER_B_SCALE + vec2(sin(b), cos(b)) * CAUSTIC_DRIFT + vec2(31.0, 7.0));
    float r1 = 1.0 - smoothstep(0.0, CAUSTIC_LINE_WIDTH, abs(n1));
    float r2 = 1.0 - smoothstep(0.0, CAUSTIC_LINE_WIDTH, abs(n2));
    return max(r1, r2);
  }

  float sea_octave(vec2 uv, float choppy) {
    uv += noise(uv);
    vec2 wv = 1.0 - abs(sin(uv));
    vec2 swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
  }

  float map(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz;
    uv.x *= 0.75;
    float d, h = 0.0;
    for(int i = 0; i < ITER_GEOMETRY; i++) {
      d = sea_octave((uv + SEA_TIME) * freq, choppy);
      h += d * amp;
      uv *= octave_m;
      freq *= 1.9;
      amp *= 0.22;
      choppy = mix(choppy, 1.0, 0.2);
    }
    return p.y - h;
  }

  float map_detailed(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz;
    uv.x *= 0.75;
    float d, h = 0.0;
    for(int i = 0; i < ITER_FRAGMENT; i++) {
      d = sea_octave((uv + SEA_TIME) * freq, choppy);
      d += sea_octave((uv - SEA_TIME) * freq, choppy);
      h += d * amp;
      uv *= octave_m / 1.2;
      freq *= 1.9;
      amp *= 0.22;
      choppy = mix(choppy, 1.0, 0.2);
    }
    return p.y - h;
  }

  float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {
    float tm = 0.0;
    float tx = 500.0;
    float hx = map(ori + dir * tx);
    if(hx > 0.0) return tx;
    float hm = map(ori + dir * tm);
    float tmid = 0.0;
    for(int i = 0; i < NUM_STEPS; i++) {
      tmid = mix(tm, tx, hm / (hm - hx));
      p = ori + dir * tmid;
      float hmid = map(p);
      if(hmid < 0.0) {
        tx = tmid;
        hx = hmid;
      } else {
        tm = tmid;
        hm = hmid;
      }
    }
    return tmid;
  }

  vec3 getNormal(vec3 p, float eps) {
    vec3 n;
    n.y = map_detailed(p);
    n.x = map_detailed(vec3(p.x + eps, p.y, p.z)) - n.y;
    n.z = map_detailed(vec3(p.x, p.y, p.z + eps)) - n.y;
    n.y = eps;
    return normalize(n);
  }

  float diffuse(vec3 n, vec3 l, float p) {
    return pow(dot(n, l) * 0.4 + 0.6, p);
  }

  float specular(vec3 n, vec3 l, vec3 e, float s) {
    float nrm = (s + 8.0) / (3.1415 * 8.0);
    return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm;
  }

  // Sky radiance along e. Rays reflected below the horizon would see the sea
  // itself, so they are held at the horizon.
  vec3 getSkyColor(vec3 e) {
    vec3 dir = normalize(vec3(e.x, max(e.y, 0.0), e.z) + vec3(0.0, 1e-4, 0.0));
    return textureCubeUV(skyEnv, dir, SKY_REFLECTION_ROUGHNESS).rgb * skyIntensity;
  }

  // World Y of the seabed seen through prepass texel (i, j).
  float seabedTexelY(ivec2 texel) {
    float z = texelFetch(seabedDepth, texel, 0).r;
    if (z >= 1.0) return NO_SEABED_Y;
    vec2 uv = (vec2(texel) + 0.5) / seabedSize;
    vec4 view = cameraProjectionInverse * vec4(vec3(uv, z) * 2.0 - 1.0, 1.0);
    return (cameraWorld * vec4(view.xyz / view.w, 1.0)).y;
  }

  // Seabed world Y under this pixel, bilinear between the four nearest prepass
  // texels. The seabed's height is smooth where its raw depth is not: across a
  // half-resolution texel the depth jumps by the slant of the view ray, which
  // turned into stair-step bands in the water colour.
  float seabedY(vec2 screenUv) {
    vec2 st = screenUv * seabedSize - 0.5;
    ivec2 maxTexel = ivec2(seabedSize) - 1;
    ivec2 i0 = clamp(ivec2(floor(st)), ivec2(0), maxTexel);
    ivec2 i1 = min(i0 + 1, maxTexel);
    vec2 f = clamp(st - floor(st), 0.0, 1.0);
    float a = mix(seabedTexelY(i0), seabedTexelY(ivec2(i1.x, i0.y)), f.x);
    float b = mix(seabedTexelY(ivec2(i0.x, i1.y)), seabedTexelY(i1), f.x);
    return mix(a, b, f.y);
  }

  // Light from the water body: the prepass seabed seen through the water, plus
  // the deep-water glow, for the surface point at this pixel.
  vec3 waterBody() {
    vec2 screenUv = gl_FragCoord.xy / screenSize;
    vec3 seabed = texture2D(seabedColor, screenUv).rgb;
    // Caustic cell size on screen, from the derivative of the noise coordinate
    // (taken here, in uniform control flow).
    vec2 causticUv = vWorld.xz * CAUSTIC_FREQUENCY;
    vec2 causticFootprint = fwidth(causticUv);
    float causticCellPixels = 1.0 / max(max(causticFootprint.x, causticFootprint.y), 1e-6);

    // The seabed's depth below the surface, and the path down to it along this
    // pixel's view ray, in metres.
    float depth = max(-seabedY(screenUv), 0.0) * METRES_PER_UNIT;
    vec3 worldDir = normalize(vWorld - cameraPosition);
    float viewPath = depth / max(-worldDir.y, 0.05);

    // Sunlight reaches the seabed along the refracted sun ray, then the light
    // it reflects comes back up the view ray.
    float sunCos = max(light.y, 0.0);
    vec3 t = waterTransmittance(depth / refractedCosine(sunCos) + viewPath);
    t *= 1.0 - smoothstep(SEABED_FADE_START, SEABED_FADE_END, depth);

    // Downwelling irradiance on a level surface, in the units three lights the
    // seabed with (Lambert: sun irradiance / π, plus the sky's diffuse term).
    vec3 sunDirect = sunIrradiance * sunCos / PI;
    vec3 skyDiffuse = textureCubeUV(skyEnv, vec3(0.0, 1.0, 0.0), 1.0).rgb * skyIntensity;
    vec3 downwelling = sunDirect + skyDiffuse;

    // Caustics redistribute only the direct sunlight on the seabed (the
    // prepass lit it with sun and sky together, so scale the sun's share).
    float causticContrastHere = causticContrast(depth) * causticLod(causticCellPixels);
    if (causticContrastHere > 0.0) {
      float light = causticLight(causticWeb(causticUv), causticContrastHere);
      seabed *= 1.0 + (sunDirect / max(downwelling, vec3(1e-6))) * (light - 1.0);
    }
    vec3 deep = deepWaterReflectance() * downwelling;
    return seabed * t + deep * (1.0 - t);
  }

  void main() {
    vec3 ori = pos;
    ori.y -= SEA_HEIGHT;
    vec3 dir = normalize(eye);

    vec3 p;
    heightMapTracing(ori, dir, p);

    vec3 n = getNormal(p, NORMAL_STEP);

    // Coast distance for the surf; sampled up front so the texture lookup
    // stays in uniform control flow.
    vec2 fieldUv = terrainFieldUv(vWorld.xz);
    bool inField = terrainFieldInside(fieldUv);
    vec4 fieldTexel = texture2D(terrainField, fieldUv);

    // Fresnel splits what we see between light from the water body and the
    // reflected sky; the sun glint uses the same Fresnel.
    float fresnel = schlickFresnel(dot(n, -dir));
    vec3 seaColor = waterBody() * (1.0 - fresnel) + getSkyColor(reflect(dir, n)) * fresnel;
    seaColor += sunIrradiance * fresnel * specular(n, light, dir, 90.0) * max(dot(n, light), 0.0);

    // Surf on top, lightly shaded by the wave normal so it sits on the water.
    float foam = surfFoam(vWorld.xz, coastDistance(fieldTexel, inField));
    vec3 foamColor = PALETTE_SURF * (0.8 + 0.2 * diffuse(n, light, 1.0));
    seaColor = mix(seaColor, foamColor, foam);

    gl_FragColor = vec4(seaColor, 1.0);
    #include <fog_fragment>
  }
`;

interface OceanProps {
  cells: readonly MapCell[];
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
}

/** The baked terrain field as a GPU texture (layout in terrainFieldTexture.ts). */
function terrainFieldTexture(cells: readonly MapCell[]): { texture: DataTexture; bounds: TerrainBounds } {
  const { data, width, height, bounds } = bakeTerrainField(sharedTerrainField(cells), {
    sampleReef: createReefMask(cells),
  });
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, bounds };
}

export function Ocean({
  cells,
  size = 1024,
  sun,
  sunColor,
  sunIntensity,
  sky,
  skyHeight,
  skyIntensity,
}: OceanProps) {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [size]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Built once per map.
  const field = useMemo(() => terrainFieldTexture(cells), [cells]);
  useEffect(() => () => field.texture.dispose(), [field]);

  // The seabed under the water, rendered each frame before the main pass.
  const seabed = useSeabedPrepass();

  const material = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = field.bounds;
    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // Opt in to scene fog: three fills these uniforms from scene.fog.
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          iTime: { value: 0 },
          surfTime: { value: 0 },
          causticTime: { value: 0 },
          light: { value: new Vector3(...sun) },
          sunIrradiance: { value: new Color(sunColor).multiplyScalar(sunIntensity) },
          skyIntensity: { value: skyIntensity },
          mapBounds: { value: new Vector4(minX, maxX, minZ, maxZ) },
        },
      ]),
      defines: cubeUvDefines(skyHeight),
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
    return mat;
  }, [sun, sunColor, sunIntensity, sky, skyHeight, skyIntensity, field, seabed]);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<Mesh>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(({ gl, camera }, delta) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as ShaderMaterial;
      gl.getDrawingBufferSize(mat.uniforms.screenSize.value);
      mat.uniforms.seabedSize.value.set(seabed.width, seabed.height);
      mat.uniforms.cameraProjectionInverse.value.copy(camera.projectionMatrixInverse);
      mat.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      mat.uniforms.iTime.value = (performance.now() * 0.001) % 10000;
      mat.uniforms.surfTime.value = advanceSurfTime(mat.uniforms.surfTime.value, delta, reducedMotion);
      mat.uniforms.causticTime.value = advanceCausticTime(mat.uniforms.causticTime.value, delta, reducedMotion);
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, 0, 0]}
    />
  );
}
