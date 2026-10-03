import { Color, ShaderMaterial, Vector2 } from "three";
import type { GridFadeParams } from "./hexOutlineGrid";

/**
 * Line material for the water hex grid. Opacity fades with XZ distance from
 * `uFocus` (the camera focus point, updated every frame) and never drops
 * below the per-vertex `aEmphasis`, so acted-on hexes stay crisp anywhere.
 * The fade formula mirrors `gridFadeOpacity` in `hexOutlineGrid.ts`.
 */

const vertexShader = /* glsl */ `
  attribute float aEmphasis;
  varying float vEmphasis;
  varying vec2 vWorldXZ;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldXZ = world.xz;
    vEmphasis = aEmphasis;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uFocus;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uBaseOpacity;
  varying float vEmphasis;
  varying vec2 vWorldXZ;

  void main() {
    float d = distance(vWorldXZ, uFocus);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);
    float alpha = max(uBaseOpacity * fade, vEmphasis);
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export type HexOutlineUniforms = {
  uColor: { value: Color };
  uFocus: { value: Vector2 };
  uFadeStart: { value: number };
  uFadeEnd: { value: number };
  uBaseOpacity: { value: number };
};

export function createHexOutlineMaterial(
  color: string,
  { fadeStart, fadeEnd, baseOpacity }: GridFadeParams
): ShaderMaterial & { uniforms: HexOutlineUniforms } {
  const uniforms: HexOutlineUniforms = {
    uColor: { value: new Color(color) },
    uFocus: { value: new Vector2() },
    uFadeStart: { value: fadeStart },
    uFadeEnd: { value: fadeEnd },
    uBaseOpacity: { value: baseOpacity },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  return material as ShaderMaterial & { uniforms: HexOutlineUniforms };
}
