import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ShaderMaterial, PlaneGeometry, Vector3, MathUtils, Mesh } from "three";

const vertexShader = `
  varying vec3 eye;
  varying vec3 pos;

  void main () {
    vec4 mvp = modelViewMatrix * vec4(position, 1.0);
    pos = position;
    eye = vec3(mvp) * normalMatrix;
    gl_Position = projectionMatrix * mvp;
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
  const vec3 SEA_BASE = vec3(0.02, 0.05, 0.12);
  const vec3 SEA_WATER_COLOR = vec3(0.08, 0.18, 0.35);
  #define SEA_TIME (iTime * SEA_SPEED)

  mat2 octave_m = mat2(1.7, 1.2, -1.2, 1.4);

  varying vec3 eye;
  varying vec3 pos;

  float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 83758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return -1.0 + 2.0 * mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
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

  vec3 getSeaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist) {
    float fresnel = 1.0 - max(dot(n, -eye), 0.0);
    fresnel = pow(fresnel, 3.0) * 0.45;
    vec3 reflected = getSkyColor(reflect(eye, n)) * 0.99;
    vec3 refracted = SEA_BASE + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.27;
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

    vec3 seaColor = getSeaColor(p, n, light, dir, dist);
    seaColor /= sqrt(sqrt(length(dist)));

    gl_FragColor = vec4(seaColor, 0.85);
  }
`;

interface OceanProps {
  size?: number;
}

export function Ocean({ size = 1024 }: OceanProps) {
  // Calculate sun position like the example
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

  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        light: { value: sun },
      },
      transparent: true,
    });
  }, [sun]);

  const meshRef = useRef<Mesh>(null);

  // Update time uniform every frame for animation
  // Wrap time to prevent floating-point precision degradation
  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as ShaderMaterial;
      // Wrap at 10000 seconds to avoid precision issues
      mat.uniforms.iTime.value = (performance.now() * 0.001) % 10000;
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} position={[0, -0.1, 0]} />;
}
