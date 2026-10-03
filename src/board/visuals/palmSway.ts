/**
 * Palm sway (issue #14): the clock that drives it and the vertex-shader patch
 * that applies it. No Three.js runtime imports, so it stays unit-testable.
 *
 * The shader is driven by an angle in [0, 2π) rather than elapsed time, and
 * every sway term uses a whole-number multiple of it, so wrapping is seamless
 * and float32 precision never degrades the longer the page stays open.
 */
import { PALM_CROWN_CENTER, PALM_TRUNK_TOP_SWAY } from "./palmGeometry";

const TAU = Math.PI * 2;

/** Sway clock speed, radians per second (one full cycle ≈ 5.7 s). */
export const PALM_SWAY_SPEED = 1.1;
/** Speed with `prefers-reduced-motion`: palms hold still. */
export const PALM_SWAY_REDUCED_SPEED = 0;
/** Longest frame step (seconds) the clock honours, so a background tab doesn't jump. */
export const MAX_SWAY_STEP = 0.1;

/** World-space sway amplitudes at a sway weight of 1 and scale 1. */
export const PALM_SWAY_BEND = 0.035; // Downwind bend of the whole palm
export const PALM_SWAY_SIDE = 0.012; // Crosswind wobble
export const PALM_SWAY_FLUTTER = 0.018; // Up/down flutter of the fronds
/** World-space wind direction (XZ, normalised in the shader). */
export const PALM_WIND_DIR: readonly [number, number] = [0.8, 0.6];

export function advanceSwayAngle(angle: number, delta: number, reducedMotion: boolean): number {
  const speed = reducedMotion ? PALM_SWAY_REDUCED_SPEED : PALM_SWAY_SPEED;
  const next = angle + Math.min(Math.max(delta, 0), MAX_SWAY_STEP) * speed;
  return ((next % TAU) + TAU) % TAU;
}

const f = (v: number) => v.toFixed(5);

const SWAY_DECLARATIONS = /* glsl */ `
uniform float uPalmSwayAngle;
attribute vec2 palm;          // (sway weight, crown mask)
attribute vec2 palmInstance;  // (sway phase, crown twist)
`;

/**
 * Runs after begin_vertex, in palm-local space, so the colour pass and the
 * shadow depth pass both see the same displaced palm. The wind is defined in
 * world space and brought into local space through the instance matrix, so a
 * grove bends the same way whatever each palm's yaw, lean or height.
 */
const SWAY_BODY = /* glsl */ `
{
  float swayWeight = palm.x;
  float crownMask = palm.y;
  float phase = palmInstance.x;

  // Turn the crown about the trunk top by this palm's twist.
  vec3 crownCentre = vec3(${PALM_CROWN_CENTER.map(f).join(", ")});
  float twist = palmInstance.y * crownMask;
  vec2 rel = transformed.xz - crownCentre.xz;
  float ct = cos(twist);
  float st = sin(twist);
  transformed.xz = crownCentre.xz + vec2(ct * rel.x - st * rel.y, st * rel.x + ct * rel.y);

  float a = uPalmSwayAngle;
  vec3 windDir = normalize(vec3(${f(PALM_WIND_DIR[0])}, 0.0, ${f(PALM_WIND_DIR[1])}));
  vec3 crossDir = vec3(-windDir.z, 0.0, windDir.x);
  float bend = swayWeight * swayWeight;
  float frond = max(swayWeight - ${f(PALM_TRUNK_TOP_SWAY)}, 0.0) * crownMask;
  float flutterPhase = phase * 2.3 + dot(position.xz, vec2(37.0, 23.0));

  vec3 worldOffset =
      windDir * (${f(PALM_SWAY_BEND)} * bend * (0.55 + 0.45 * sin(a + phase)))
    + crossDir * (${f(PALM_SWAY_SIDE)} * bend * sin(2.0 * a + phase * 1.7))
    + vec3(0.0, ${f(PALM_SWAY_FLUTTER)} * frond * sin(3.0 * a + flutterPhase), 0.0);

  #ifdef USE_INSTANCING
    // Local offset d with instanceMatrix * d = worldOffset * heightScale, so the
    // sway grows with the palm: d = S^-2 * transpose(M) * w * |M_y|.
    mat3 im = mat3(instanceMatrix);
    vec3 axisScale2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    transformed += (transpose(im) * worldOffset) * sqrt(axisScale2.y) / axisScale2;
  #else
    transformed += worldOffset;
  #endif
}
`;

export interface SwayShader {
  vertexShader: string;
  uniforms: Record<string, { value: unknown }>;
}

/**
 * Patches a built-in material's vertex shader (from `onBeforeCompile`) with the
 * palm sway, binding the shared angle uniform. Returns the new vertex source.
 */
export function injectPalmSway(shader: SwayShader, angle: { value: number }): string {
  shader.uniforms.uPalmSwayAngle = angle;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${SWAY_DECLARATIONS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SWAY_BODY}`);
  return shader.vertexShader;
}
