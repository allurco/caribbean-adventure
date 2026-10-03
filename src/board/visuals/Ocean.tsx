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
  const float EPSILON = 1e-3;
  #define EPSILON_NRM (5e-4)

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

  mat2 octave_m = mat2(1.7, 1.2, -1.2, 1.4);

  uniform sampler2D terrainField;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  ${TERRAIN_FIELD_GLSL}

  varying vec3 eye;
  varying vec3 pos;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  // Depth below sea level from the baked height field; 0 on land and at the waterline.
  float seaDepth(vec2 worldXZ) {
    vec2 uv = terrainFieldUv(worldXZ);
    if (!terrainFieldInside(uv)) return OPEN_SEA_DEPTH;
    return max(-terrainFieldHeight(texture2D(terrainField, uv)), 0.0);
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

  vec3 getSeaColor(vec3 base, vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist) {
    float fresnel = 1.0 - max(dot(n, -eye), 0.0);
    fresnel = pow(fresnel, 3.0) * 0.45;
    vec3 reflected = getSkyColor(reflect(eye, n)) * 0.99;
    vec3 refracted = base + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.27;
    vec3 color = mix(refracted, reflected, fresnel);
    float atten = max(1.0 - dot(dist, dist) * 0.001, 0.0);
    color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.15 * atten;
    color += vec3(specular(n, l, eye, 90.0)) * 0.5;
    return color;
  }

  void main() {
    vec3 ori = pos;
    ori.y -= SEA_HEIGHT;
    vec3 dir = normalize(eye);

    vec3 p;
    heightMapTracing(ori, dir, p);

    vec3 dist = p - ori;
    vec3 n = getNormal(p, dot(dist, dist) * EPSILON_NRM);

    // Open sea keeps its original look; nearer land the palette depth colour
    // takes over, without the distance falloff so the palette colours read true.
    vec3 openSea = getSeaColor(SEA_BASE, p, n, light, dir, dist) / sqrt(sqrt(length(dist)));
    float depth = seaDepth(vWorld.xz);
    vec3 nearShore = getSeaColor(depthColor(depth), p, n, light, dir, dist);
    vec3 seaColor = mix(nearShore, openSea, smoothstep(TEAL_END, DEEP_START, depth));

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
  const { data, width, height, bounds } = bakeTerrainField(sharedTerrainField(cells));
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

  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as ShaderMaterial;
      mat.uniforms.iTime.value = (performance.now() * 0.001) % 10000;
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
