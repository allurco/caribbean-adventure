/**
 * The cranes' loads swaying on their ropes (#181). Pure, no Three.js
 * runtime imports, so it stays unit-testable.
 *
 * Every crane's load (`buildCraneLoad`) is baked into one world-space mesh
 * (`craneLoadGeometry`), each vertex carrying its crane's jib tip and a
 * phase, and swung about that tip in the vertex shader (`injectCraneSway`):
 * a pendulum along the scene's one wind (`SCENE_WIND`), a few degrees
 * either way. It runs on the board's one sway clock (`useSwayClock.ts`), so
 * under reduced motion, or while the scene's motion is held, the clock
 * stands still and so does every load. `swayedPoint` is the shader's sum
 * on the CPU, for the tests.
 */
import type { FacetGeometryData, Vec3 } from "./facetBuilder";
import type { CranePlacement } from "./harbourFurniture";
import { SCENE_WIND } from "./sceneWind";
import { placeAnchor } from "./townAnchors";
import { seedOf } from "./variationStream";

/** The widest a load swings either side of hanging straight down (radians). */
export const CRANE_SWAY_AMPLITUDE = 0.07;
/** How many swings a load makes per turn of the sway clock: a short rope swings quicker than a palm bends. */
const SWINGS_PER_TURN = 2;
const TAU = Math.PI * 2;

/** A load's swing (radians, along the wind) at the sway clock's `angle`. */
export const craneSwing = (angle: number, phase: number): number => CRANE_SWAY_AMPLITUDE * Math.sin(SWINGS_PER_TURN * angle + phase);

/** Where a point `p` of a load hanging from `pivot` is drawn at the clock's `angle`: swung about the pivot along the wind. */
export function swayedPoint(p: Vec3, pivot: Vec3, angle: number, phase: number): Vec3 {
  const [wx, wz] = SCENE_WIND.toward;
  const len = Math.hypot(wx, wz) || 1;
  const drop = Math.max(pivot[1] - p[1], 0);
  const swing = craneSwing(angle, phase);
  const along = drop * Math.sin(swing);
  return [p[0] + (wx / len) * along, p[1] + drop * (1 - Math.cos(swing)), p[2] + (wz / len) * along];
}

/** A crane's load's phase: a hash of where it stands, so neighbouring cranes swing out of step, the same on every client. */
export const craneLoadPhase = (c: Pick<CranePlacement, "x" | "z">): number => (seedOf([c.x, c.z], 0xc4a1e5) / 2 ** 32) * TAU;

/** Every crane's load as one mesh: the soup, and per vertex its crane's tip (3) and phase (1). */
export interface CraneLoadGeometry extends FacetGeometryData {
  pivots: Float32Array;
  phases: Float32Array;
}

/** Bakes `load` (at scale 1 in a crane's frame) under every crane's jib tip. */
export function craneLoadGeometry(cranes: readonly CranePlacement[], load: FacetGeometryData): CraneLoadGeometry {
  const n = cranes.length * load.vertexCount;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const pivots = new Float32Array(n * 3);
  const phases = new Float32Array(n);
  let o = 0;
  for (const c of cranes) {
    const cos = Math.cos(c.yaw);
    const sin = Math.sin(c.yaw);
    const phase = craneLoadPhase(c);
    for (let i = 0; i < load.vertexCount; i++) {
      const p = placeAnchor([load.positions[i * 3], load.positions[i * 3 + 1], load.positions[i * 3 + 2]], c);
      positions.set(p, o * 3);
      const nx = load.normals[i * 3];
      const nz = load.normals[i * 3 + 2];
      normals.set([nx * cos + nz * sin, load.normals[i * 3 + 1], -nx * sin + nz * cos], o * 3);
      colors.set(load.colors.subarray(i * 3, i * 3 + 3), o * 3);
      pivots.set(c.tip, o * 3);
      phases[o] = phase;
      o++;
    }
  }
  return { positions, normals, colors, vertexCount: n, pivots, phases };
}

const f = (v: number) => v.toFixed(5);

const SWAY_DECLARATIONS = /* glsl */ `
uniform float uCraneSwayAngle;
attribute vec3 swayPivot;
attribute float swayPhase;
`;

/** `swayedPoint` in the vertex shader, after begin_vertex, so the colour and shadow passes swing the same. */
const SWAY_BODY = /* glsl */ `
{
  vec3 fromTip = swayPivot - transformed;
  float drop = max(fromTip.y, 0.0);
  float swing = ${f(CRANE_SWAY_AMPLITUDE)} * sin(${f(SWINGS_PER_TURN)} * uCraneSwayAngle + swayPhase);
  vec2 wind = normalize(vec2(${f(SCENE_WIND.toward[0])}, ${f(SCENE_WIND.toward[1])}));
  transformed.xz += wind * (drop * sin(swing));
  transformed.y += drop * (1.0 - cos(swing));
}
`;

export interface CraneSwayShader {
  vertexShader: string;
  uniforms: Record<string, { value: unknown }>;
}

/** Patches a built-in material's vertex shader (from `onBeforeCompile`) with the loads' swing, binding the shared clock. Returns the new source. */
export function injectCraneSway(shader: CraneSwayShader, angle: { value: number }): string {
  shader.uniforms.uCraneSwayAngle = angle;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${SWAY_DECLARATIONS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SWAY_BODY}`);
  return shader.vertexShader;
}
