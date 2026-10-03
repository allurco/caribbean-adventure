import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ShaderMaterial,
  PlaneGeometry,
  Vector3,
  Vector4,
  MathUtils,
  Mesh,
  UniformsLib,
  UniformsUtils,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
} from "three";
import type { MapCell } from "../../game/types";
import { PALETTE_GLSL } from "./palette";
import { sharedTerrainField } from "./sharedTerrainField";
import { bakeTerrainField, TERRAIN_FIELD_GLSL } from "./terrainFieldTexture";
import { advanceSurfTime, SURF_TIMING_GLSL } from "./surfMotion";
import { advanceCausticTime, CAUSTIC_TIMING_GLSL } from "./causticMotion";
import { createReefMask } from "./reefMask";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import type { TerrainBounds } from "./terrainHeightField";

const vertexShader = `
  varying vec3 eye;
  varying vec3 pos;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_vertex>

  void main () {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    pos = position;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    eye = vec3(mvPosition) * normalMatrix;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec3 light;

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
  const vec3 SEA_BASE = PALETTE_DEEP_WATER;
  // No matching palette entry; kept as-is.
  const vec3 SEA_WATER_COLOR = vec3(0.08, 0.18, 0.35);
  #define SEA_TIME (iTime * SEA_SPEED)

  // Depth colour bands, in world units below sea level. The field's seabed is
  // -tanh(0.6 * distance offshore), so open sea sits at ~0.8 and these bands
  // end roughly 0.1, 0.2, 0.7 and 1.5 world units out from the coast (a hex
  // is ~1.7 across).
  const float SEABED_FADE = 0.06;     // seabed shows through up to here
  const float SHALLOWS_END = 0.12;    // turquoise shallows start turning teal
  const float TEAL_END = 0.4;         // fully reef teal, starts turning deep
  const float DEEP_START = 0.7;       // open sea from here on
  const float OPEN_SEA_DEPTH = 1.0;   // used outside the map bounds
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

  // Reef patches (issue #11). The reef mask is the field's B channel
  // (reefMask.ts): 1 inside a reef hex, 0 everywhere else, with a soft rim just
  // inside the reef outline. Reefs read as dark, mottled coral heads on lighter
  // reef flats, which open water (a smooth depth gradient) never has.
  const float REEF_NOISE_SCALE = 2.6;     // coral patch frequency, per world unit (a hex is ~1.7 across)
  const float REEF_DETAIL_SCALE = 2.3;    // frequency multiplier of the second, finer noise octave
  const float REEF_CORAL_COVER = 0.5;     // noise threshold for coral: higher leaves fewer, smaller heads
  const float REEF_CORAL_SOFTNESS = 0.16; // edge softness of each coral head
  const float REEF_CORAL_DARKEN = 0.45;   // coral colour = reef teal times this, darker than any open water
  const float REEF_FLAT_TEAL = 0.35;      // reef flats between the coral: shallows mixed this far toward reef teal
  const float REEF_DEPTH_SHOW = 0.25;     // how much the plain depth colour still shows through the reef
  const float REEF_STRENGTH = 0.95;       // max blend of the reef over the water at full mask

  // Shallow-water caustics (issue #11): a soft moving web of light on the
  // seabed, only in the shallows. Time only enters as sin/cos of
  // 2π·causticTime/period (causticTime is wrapped on the CPU, see
  // causticMotion.ts), so it never jumps or loses precision.
  uniform float causticTime;
  ${CAUSTIC_TIMING_GLSL}
  const float CAUSTIC_SCALE = 3.2;          // light-web frequency, per world unit
  const float CAUSTIC_LAYER_B_SCALE = 1.37; // second layer's frequency multiplier, so the layers never line up
  const float CAUSTIC_DRIFT = 0.6;          // radius (noise units) each layer circles once per period
  const float CAUSTIC_SHARPNESS = 5.0;      // exponent on the ridges: higher gives thinner, crisper lines
  const float CAUSTIC_FADE_IN = 0.02;       // depth over which caustics fade in from the waterline
  const float CAUSTIC_FADE_START = 0.08;    // full strength down to this depth ...
  const float CAUSTIC_FADE_END = 0.3;       // ... and gone by this depth (open sea is ~0.8 deep)
  const float CAUSTIC_STRENGTH = 0.3;       // light added at full strength, as a fraction of PALETTE_SURF

  mat2 octave_m = mat2(1.7, 1.2, -1.2, 1.4);

  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}

  varying vec3 eye;
  varying vec3 pos;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  // Depth below sea level from a baked field texel; 0 on land and at the waterline.
  float seaDepth(vec4 texel, bool inField) {
    if (!inField) return OPEN_SEA_DEPTH;
    return max(-terrainFieldHeight(texel), 0.0);
  }

  // Signed distance to the coast (+ land, - water) from a baked field texel.
  float coastDistance(vec4 texel, bool inField) {
    if (!inField) return -OPEN_SEA_COAST_DISTANCE;
    return terrainFieldCoastDistance(texel);
  }

  // Water body colour: seabed at the waterline, turquoise shallows, reef teal, deep water.
  vec3 depthColor(float depth) {
    vec3 c = mix(PALETTE_WET_SAND, PALETTE_SHALLOWS, smoothstep(0.0, SEABED_FADE, depth));
    c = mix(c, PALETTE_REEF_TEAL, smoothstep(SHALLOWS_END, TEAL_END, depth));
    return mix(c, PALETTE_DEEP_WATER, smoothstep(TEAL_END, DEEP_START, depth));
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

  // Water body colour over a reef: dark coral heads on lighter reef flats.
  vec3 reefBodyColor(vec2 worldXZ, float depth) {
    vec2 q = worldXZ * REEF_NOISE_SCALE;
    float n = 0.5 + 0.35 * noise(q) + 0.15 * noise(q * REEF_DETAIL_SCALE + vec2(17.0, -9.0));
    float coral = smoothstep(REEF_CORAL_COVER, REEF_CORAL_COVER + REEF_CORAL_SOFTNESS, n);
    vec3 flats = mix(PALETTE_SHALLOWS, PALETTE_REEF_TEAL, REEF_FLAT_TEAL);
    vec3 body = mix(flats, PALETTE_REEF_TEAL * REEF_CORAL_DARKEN, coral);
    return mix(body, depthColor(depth), REEF_DEPTH_SHOW);
  }

  // Caustic light (0..CAUSTIC_STRENGTH) on the seabed at worldXZ; 0 beyond the shallows.
  float caustics(vec2 worldXZ, float depth) {
    float fade = smoothstep(0.0, CAUSTIC_FADE_IN, depth) * (1.0 - smoothstep(CAUSTIC_FADE_START, CAUSTIC_FADE_END, depth));
    if (fade <= 0.0) return 0.0;
    // Two ridged-noise webs, each circling a small loop on its own period.
    float a = 2.0 * PI * causticTime / CAUSTIC_PERIOD_A;
    float b = 2.0 * PI * causticTime / CAUSTIC_PERIOD_B;
    vec2 q = worldXZ * CAUSTIC_SCALE;
    float r1 = 1.0 - abs(noise(q + vec2(cos(a), sin(a)) * CAUSTIC_DRIFT));
    float r2 = 1.0 - abs(noise(q * CAUSTIC_LAYER_B_SCALE + vec2(sin(b), cos(b)) * CAUSTIC_DRIFT + vec2(31.0, 7.0)));
    float web = 0.5 * (pow(r1, CAUSTIC_SHARPNESS) + pow(r2, CAUSTIC_SHARPNESS));
    return web * fade * CAUSTIC_STRENGTH;
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

  vec3 getSkyColor(vec3 e) {
    e.y = max(e.y, 0.0);
    vec3 ret;
    ret.x = pow(1.0 - e.y, 2.0);
    ret.y = 1.0 - e.y;
    ret.z = 0.6 + (1.0 - e.y) * 0.4;
    return ret;
  }

  vec3 getSeaColor(vec3 base, vec3 p, vec3 n, vec3 l, vec3 eye) {
    float fresnel = 1.0 - max(dot(n, -eye), 0.0);
    fresnel = pow(fresnel, 3.0) * 0.45;
    vec3 reflected = getSkyColor(reflect(eye, n)) * 0.99;
    vec3 refracted = base + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.27;
    vec3 color = mix(refracted, reflected, fresnel);
    color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.15;
    color += vec3(specular(n, l, eye, 90.0)) * 0.5;
    return color;
  }

  void main() {
    vec3 ori = pos;
    ori.y -= SEA_HEIGHT;
    vec3 dir = normalize(eye);

    vec3 p;
    heightMapTracing(ori, dir, p);

    vec3 n = getNormal(p, NORMAL_STEP);

    // Open sea is the deep base colour; nearer land the palette depth colour
    // takes over. Both share the same lighting so the blend has no seam.
    // One field fetch feeds both depth and coast distance; sampled outside the
    // branch so the texture lookup stays in uniform control flow.
    vec2 fieldUv = terrainFieldUv(vWorld.xz);
    bool inField = terrainFieldInside(fieldUv);
    vec4 fieldTexel = texture2D(terrainField, fieldUv);

    vec3 openSea = getSeaColor(SEA_BASE, p, n, light, dir);
    float depth = seaDepth(fieldTexel, inField);
    vec3 nearShore = getSeaColor(depthColor(depth), p, n, light, dir);
    vec3 seaColor = mix(nearShore, openSea, smoothstep(TEAL_END, DEEP_START, depth));

    // Reefs over the water body, lit the same way so the rim has no seam.
    float reef = inField ? terrainFieldReef(fieldTexel) * REEF_STRENGTH : 0.0;
    if (reef > 0.0) {
      seaColor = mix(seaColor, getSeaColor(reefBodyColor(vWorld.xz, depth), p, n, light, dir), reef);
    }

    // Caustic light in the shallows (reefs included), under the surf.
    seaColor += PALETTE_SURF * caustics(vWorld.xz, depth);

    // Surf on top, lightly shaded by the wave normal so it sits on the water.
    float foam = surfFoam(vWorld.xz, coastDistance(fieldTexel, inField));
    vec3 foamColor = PALETTE_SURF * (0.8 + 0.2 * diffuse(n, light, 1.0));
    seaColor = mix(seaColor, foamColor, foam);

    gl_FragColor = vec4(seaColor, 0.98);
    #include <fog_fragment>
  }
`;

interface OceanProps {
  cells: readonly MapCell[];
  size?: number;
}

/** The baked terrain field as a GPU texture (layout in terrainFieldTexture.ts). */
function terrainFieldTexture(cells: readonly MapCell[]): { texture: DataTexture; bounds: TerrainBounds } {
  const { data, width, height, bounds } = bakeTerrainField(sharedTerrainField(cells), {
    sampleReef: createReefMask(cells),
  });
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, bounds };
}

export function Ocean({ cells, size = 1024 }: OceanProps) {
  const sun = useMemo(() => {
    const s = new Vector3();
    const phi = MathUtils.degToRad(85);
    const theta = MathUtils.degToRad(180);
    s.setFromSphericalCoords(1, phi, theta);
    return s;
  }, []);

  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [size]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Built once per map.
  const field = useMemo(() => terrainFieldTexture(cells), [cells]);
  useEffect(() => () => field.texture.dispose(), [field]);

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
          light: { value: sun },
          mapBounds: { value: new Vector4(minX, maxX, minZ, maxZ) },
        },
      ]),
      fog: true,
      transparent: true,
    });
    // UniformsUtils.merge clones uniform values, so the texture is attached afterwards.
    mat.uniforms.terrainField = { value: field.texture };
    return mat;
  }, [sun, field]);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<Mesh>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame((_, delta) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as ShaderMaterial;
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
