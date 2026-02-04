import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ShaderMaterial,
  PlaneGeometry,
  DoubleSide,
  Mesh,
} from "three";
import type { DataTexture } from "three";

const vertexShader = `
  uniform sampler2D heightmap;
  uniform vec4 mapBounds; // minX, maxX, minZ, maxZ
  uniform float heightScale;

  varying vec2 vUv;
  varying float vHeight;
  varying float vTerrainType;
  varying float vCoastDist;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    // Flip V coordinate because PlaneGeometry rotation inverts the Z-to-UV mapping
    vec2 correctedUv = vec2(uv.x, 1.0 - uv.y);
    vUv = correctedUv;

    // Sample heightmap with corrected UV
    vec4 hmData = texture2D(heightmap, correctedUv);
    float landMask = hmData.a;

    // Skip water pixels (landMask = 0)
    if (landMask < 0.5) {
      gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    // Height already incorporates landMask fade from heightmap generation
    vHeight = hmData.r * heightScale;
    vTerrainType = hmData.g;
    vCoastDist = hmData.b;

    // Displace vertex Y position
    vec3 displaced = position;
    displaced.y = vHeight;

    // Compute normal from heightmap gradient (finite differences)
    float texelSize = 1.0 / 1024.0;
    float hL = texture2D(heightmap, correctedUv - vec2(texelSize, 0.0)).r * heightScale;
    float hR = texture2D(heightmap, correctedUv + vec2(texelSize, 0.0)).r * heightScale;
    float hD = texture2D(heightmap, correctedUv - vec2(0.0, texelSize)).r * heightScale;
    float hU = texture2D(heightmap, correctedUv + vec2(0.0, texelSize)).r * heightScale;

    // World scale for proper normal calculation
    float worldWidth = mapBounds.y - mapBounds.x;
    float step = worldWidth * texelSize;

    vec3 tangentX = normalize(vec3(step * 2.0, hR - hL, 0.0));
    vec3 tangentZ = normalize(vec3(0.0, hU - hD, step * 2.0));
    vNormal = normalize(cross(tangentZ, tangentX));

    // World position for noise sampling in fragment shader
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec3 lightDirection;
  uniform float debugMode; // 0 = normal, 1 = show biome, 2 = show height, 3 = show coastDist

  varying float vHeight;
  varying float vTerrainType;
  varying float vCoastDist;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  // Biome colors - vibrant Caribbean palette
  const vec3 SAND = vec3(0.93, 0.87, 0.70);
  const vec3 GRASS = vec3(0.22, 0.55, 0.28);
  const vec3 ROCK = vec3(0.50, 0.47, 0.42);

  // Debug colors
  const vec3 DEBUG_RED = vec3(1.0, 0.0, 0.0);
  const vec3 DEBUG_GREEN = vec3(0.0, 1.0, 0.0);
  const vec3 DEBUG_BLUE = vec3(0.0, 0.0, 1.0);
  const vec3 DEBUG_YELLOW = vec3(1.0, 1.0, 0.0);
  const vec3 DEBUG_MAGENTA = vec3(1.0, 0.0, 1.0);

  // Hash function for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // FBM for more organic noise
  float fbm(vec2 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.01;
    f += 0.2500 * noise(p); p *= 2.02;
    f += 0.1250 * noise(p);
    return f / 0.875;
  }

  void main() {
    // No discard needed - water vertices are already squashed in vertex shader
    // This fragment shader only runs for land pixels

    // === NOISY BIOME TRANSITIONS ===
    // Instead of muddy linear mix, use noise to create organic boundaries

    // Sample noise at different scales for natural variation
    float n1 = fbm(vWorldPos.xz * 8.0) * 0.08;  // Large scale variation (reduced)
    float n2 = noise(vWorldPos.xz * 25.0) * 0.04; // Fine detail (reduced)
    float noiseOffset = n1 + n2;

    // Terrain type with noise perturbation
    float t = vTerrainType + noiseOffset;

    vec3 color;

    // FORCE beach near coastline regardless of biome value
    // vCoastDist < 0.3 means we're very close to water edge
    if (vCoastDist < 0.25) {
      // Near water = always beach/sand
      color = SAND;
      color *= 0.95 + noise(vWorldPos.xz * 30.0) * 0.1;
    } else if (vCoastDist < 0.4) {
      // Transition zone - blend to actual biome
      float beachBlend = smoothstep(0.4, 0.25, vCoastDist);
      vec3 sandColor = SAND * (0.95 + noise(vWorldPos.xz * 30.0) * 0.1);

      // Determine inland color based on biome
      vec3 inlandColor;
      if (t < 0.45) {
        inlandColor = SAND * (0.95 + noise(vWorldPos.xz * 30.0) * 0.1);
      } else if (t < 0.75) {
        inlandColor = GRASS * (0.9 + noise(vWorldPos.xz * 20.0) * 0.2);
      } else {
        inlandColor = ROCK * (0.9 + noise(vWorldPos.xz * 15.0) * 0.2);
      }
      color = mix(inlandColor, sandColor, beachBlend);
    } else {
      // Inland - use biome-based coloring
      if (t < 0.45) {
        // Pure sand (beach)
        color = SAND;
        color *= 0.95 + noise(vWorldPos.xz * 30.0) * 0.1;
      } else if (t < 0.55) {
        // Sand to grass transition
        float edge = smoothstep(0.45, 0.55, t);
        color = mix(SAND, GRASS, edge);
      } else if (t < 0.75) {
        // Pure grass (jungle)
        color = GRASS;
        color *= 0.9 + noise(vWorldPos.xz * 20.0) * 0.2;
      } else if (t < 0.88) {
        // Grass to rock transition
        float edge = smoothstep(0.75, 0.88, t);
        color = mix(GRASS, ROCK, edge);
      } else {
        // Pure rock (mountain) - only at high elevations inland
        color = ROCK;
        color *= 0.9 + noise(vWorldPos.xz * 15.0) * 0.2;
      }
    }

    // === LIGHTING ===
    vec3 normal = normalize(vNormal);
    float diffuse = max(dot(normal, normalize(lightDirection)), 0.0);
    float ambient = 0.45;
    float lighting = ambient + diffuse * 0.55;

    color *= lighting;

    // Height-based shading (subtle)
    color *= 0.92 + vHeight * 0.15;

    // Coastal wetness (darken near water edge)
    if (vCoastDist < 0.4) {
      float wetness = smoothstep(0.4, 0.0, vCoastDist);
      color *= 1.0 - wetness * 0.2;
    }

    // DEBUG MODE
    if (debugMode > 0.5) {
      if (debugMode < 1.5) {
        // Mode 1: Show biome value as color gradient
        // Red = low biome (sand), Green = mid (grass), Blue = high (rock)
        color = vec3(vTerrainType, 1.0 - vTerrainType, vTerrainType * 2.0 - 1.0);
      } else if (debugMode < 2.5) {
        // Mode 2: Show height as grayscale
        color = vec3(vHeight);
      } else {
        // Mode 3: Show coastDist - Red = near coast (0), Green = inland (1)
        color = vec3(1.0 - vCoastDist, vCoastDist, 0.0);
      }
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface UnifiedTerrainProps {
  heightmap: DataTexture;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  segments?: number;
  debugMode?: number; // 0 = normal, 1 = biome, 2 = height, 3 = coastDist
}

export function UnifiedTerrain({
  heightmap,
  bounds,
  segments = 512,
  debugMode = 0,
}: UnifiedTerrainProps) {
  const meshRef = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const geo = new PlaneGeometry(width, depth, segments, segments);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [bounds, segments]);

  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        heightmap: { value: heightmap },
        mapBounds: { value: [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ] },
        heightScale: { value: 1.0 },
        iTime: { value: 0 },
        lightDirection: { value: [0.5, 0.8, 0.3] },
        debugMode: { value: debugMode },
      },
      side: DoubleSide,
    });
  }, [heightmap, bounds, debugMode]);

  // Update time uniform for any animated effects
  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as ShaderMaterial;
      mat.uniforms.iTime.value = (performance.now() * 0.001) % 10000;
    }
  });

  // Center position
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[centerX, 0, centerZ]}
      receiveShadow
      castShadow
    />
  );
}
