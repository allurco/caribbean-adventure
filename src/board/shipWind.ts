/**
 * Sails and flags in the scene's one wind (#204). Pure maths, mirrored in
 * GLSL by `SHIP_WIND_GLSL`; `injectShipWind` patches a ship's canvas, flag
 * and pennant materials (and their shadow depth) with it, on the merged
 * meshes (#136), so a ship draws no more than it did.
 *
 * Everything here is in the model's own frame (the generator's: real
 * metres, bow along −Z, y up), where the vertex shader works: the model's
 * group scales it to ship scale (`shipModelScale`, through `SHIP_SCALE`), so
 * the displacements are model metres and grow with the ships.
 *
 * - **Flags and the pennant** stream downwind whatever the heading: each
 *   cloth is turned about its hoist onto the wind (`flagClothPosition`), and
 *   a ripple travels along it, pinned at the hoist and strongest at the fly
 *   (`flagRipple`).
 * - **Sails** belly out on their leeward side by how much wind they catch
 *   (`sailFullness`): full from astern round to close-hauled, slack and
 *   luffing in irons. The generator models each sail full; the shader scales
 *   that belly (`sailBellyOffset`) and flutters a slack one (`sailLuff`).
 *   The belly does not depend on speed, so a ship at rest stays filled.
 *
 * Time is the wave clock's (ADR 0004): every rate is a whole number of
 * cycles per loop (`loopRate`), so the clock wraps without a jump, and a
 * frozen clock (reduced motion) freezes the cloth.
 */
import { SHIP_MODEL_ROTATION_Y } from "./shipModels";
import { WAVE_LOOP_SECONDS } from "./visuals/waveClock";
import type { Wind } from "./visuals/wind";

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;

/** Within this many degrees of the wind's eye a sail is in irons: slack and luffing. */
export const SAIL_IN_IRONS_DEG = 35;
/** From this many degrees off the wind's eye round to dead astern a sail is full: close-hauled, reaching, running. */
export const SAIL_CLOSE_HAULED_DEG = 70;
/** Wind speed, m/s, from which sails fill and flags stream fully; lighter winds fill them in proportion. */
export const WIND_FULL_SPEED = 5;
/** Share of its modelled belly a slack sail keeps. */
export const SAIL_SLACK_BELLY = 0.3;
/** Share of a square sail's belly depth it leans to leeward with the wind on the beam. */
export const SAIL_LEEWARD_LEAN = 0.35;
/** Crosswind (a share of the downwind unit vector) over which a fore-and-aft sail's belly passes from side to side. */
export const SAIL_GYBE_BAND = 0.25;
/** Share of its belly depth a slack sail luffs by. */
export const SAIL_LUFF_SHARE = 0.2;
/** Wavelength of the luff's ripple across the canvas, model metres. */
export const SAIL_LUFF_WAVELENGTH_METRES = 6;
/** Period of the luff's flutter, s. */
export const SAIL_LUFF_PERIOD = 0.8;
/** The flag's ripple at its fly, as a share of the cloth's length (model metres). */
export const FLAG_RIPPLE_SHARE = 0.07;
/** Ripple waves along a cloth, hoist to fly. */
export const FLAG_RIPPLE_WAVES = 1.25;
/** Period of the flag's ripple, s. */
export const FLAG_RIPPLE_PERIOD = 0.55;
/** How the ripple grows from hoist (u 0) to fly (u 1): u to this power. */
export const FLAG_RIPPLE_GROWTH = 1.5;
/** How far toward hanging plumb down its staff a limp flag falls (1: plumb). */
export const FLAG_LIMP_DROOP = 0.85;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Angular frequency (rad/s) of a motion with about `periodSeconds`, rounded to
 * a whole number of cycles per wave-clock loop, so it wraps with the clock.
 */
export function loopRate(periodSeconds: number): number {
  return (TAU * Math.max(1, Math.round(WAVE_LOOP_SECONDS / periodSeconds))) / WAVE_LOOP_SECONDS;
}

const SAIL_LUFF_RATE = loopRate(SAIL_LUFF_PERIOD);
const FLAG_RIPPLE_RATE = loopRate(FLAG_RIPPLE_PERIOD);

/** How much of a full wind is blowing: 0 calm … 1 from `WIND_FULL_SPEED` up. */
const windShare = (wind: Wind) => clamp01(wind.speed / WIND_FULL_SPEED);

/**
 * A world XZ vector in the ship model's frame, for a ship on `heading` (its
 * group's rotation about +Y; `Ship.tsx`), whose model is turned a further
 * `SHIP_MODEL_ROTATION_Y` in it.
 */
function toShipModelFrame(heading: number, [x, z]: Vec2): [number, number] {
  const yaw = heading + SHIP_MODEL_ROTATION_Y;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [x * c - z * s, x * s + z * c];
}

/** The way a ship's flags stream: downwind, as a unit XZ vector in its model's frame. */
export function flagStreamDirection(heading: number, wind: Wind): [number, number] {
  return toShipModelFrame(heading, wind.toward);
}

/** Degrees between a ship's bow and the wind's eye (where it blows from): 0 head to wind, 180 dead astern. */
export function offTheWindDeg(heading: number, wind: Wind): number {
  const along = -(Math.sin(heading) * wind.toward[0] + Math.cos(heading) * wind.toward[1]);
  return Math.acos(Math.max(-1, Math.min(1, along))) / DEG;
}

/**
 * How full a ship's sails are on `heading` in `wind`: 1 with the wind from
 * astern round to close-hauled, easing to 0 (slack) in irons, continuous in
 * the heading; scaled down in a wind lighter than `WIND_FULL_SPEED`.
 */
export function sailFullness(heading: number, wind: Wind): number {
  return smoothstep(SAIL_IN_IRONS_DEG, SAIL_CLOSE_HAULED_DEG, offTheWindDeg(heading, wind)) * windShare(wind);
}

/**
 * A sail vertex's offset from its sail's flat plane at `fullness`, from its
 * modelled offset `belly` (the generator models every sail full) and the
 * wind's `downwind` direction, both in the model's frame. A square sail
 * (bellied fore and aft) keeps its belly forward and leans it to leeward on
 * the beam; a fore-and-aft sail (bellied athwartships) swings its belly to
 * whichever side is leeward.
 */
export function sailBellyOffset(belly: Vec3, downwind: Vec2, fullness: number): [number, number, number] {
  const depth = Math.hypot(belly[0], belly[1], belly[2]);
  if (depth === 0) return [0, 0, 0];
  const across = Math.hypot(belly[0], belly[2]);
  const [nx, nz] = across > 0 ? [belly[0] / across, belly[2] / across] : [0, 0];
  const athwart = nx * nx;
  const side = Math.max(-1, Math.min(1, (nx * downwind[0] + nz * downwind[1]) / SAIL_GYBE_BAND));
  const scale = (SAIL_SLACK_BELLY + (1 - SAIL_SLACK_BELLY) * fullness) * (1 + (side - 1) * athwart);
  const lean = downwind[0] * (1 - athwart) * SAIL_LEEWARD_LEAN * depth * fullness;
  return [belly[0] * scale + lean, belly[1] * scale, belly[2] * scale];
}

/**
 * The flutter a slack sail luffs with, at model-frame `position`: along its
 * belly, by a share of the belly's depth, so its edges stay pinned; none on a
 * full sail or without `flutter`.
 */
export function sailLuff(belly: Vec3, position: Vec3, seconds: number, fullness: number, flutter: number): [number, number, number] {
  const phase = (TAU * (position[1] + 0.5 * (position[0] + position[2]))) / SAIL_LUFF_WAVELENGTH_METRES - SAIL_LUFF_RATE * seconds;
  const k = SAIL_LUFF_SHARE * (1 - fullness) * flutter * Math.sin(phase);
  return [belly[0] * k, belly[1] * k, belly[2] * k];
}

/**
 * The ripple across a cloth `lengthMetres` long, at `u` from its hoist (0) to
 * its fly (1): a wave travelling hoist to fly, zero at the hoist and growing
 * to `FLAG_RIPPLE_SHARE` of the length at the fly, times `ripple`.
 */
export function flagRipple(u: number, lengthMetres: number, seconds: number, ripple: number): number {
  const growth = Math.pow(clamp01(u), FLAG_RIPPLE_GROWTH);
  return FLAG_RIPPLE_SHARE * lengthMetres * growth * Math.sin(TAU * FLAG_RIPPLE_WAVES * u - FLAG_RIPPLE_RATE * seconds) * ripple;
}

/** A cloth vertex as the generator flew it, relative to its hoist (`shipWindGeometry.ts`). */
export interface ClothVertex {
  /** The hoist's XZ, model frame. */
  readonly hoist: Vec2;
  /** Distance along the modelled fly from the hoist, model metres. */
  readonly along: number;
  /** Offset across the modelled fly (the modelled waves), model metres. */
  readonly across: number;
  /** 0 at the hoist … 1 at the fly. */
  readonly u: number;
  /** The cloth's length, hoist to fly, model metres. */
  readonly length: number;
}

/**
 * Where a cloth vertex at height `y` goes: turned about its hoist to fly
 * `downwind`, rippling across the wind, and falling down the staff as it
 * goes `limp` (0 … 1). Model frame.
 */
export function flagClothPosition(
  cloth: ClothVertex,
  y: number,
  downwind: Vec2,
  seconds: number,
  ripple: number,
  limp: number
): [number, number, number] {
  const droop = limp * FLAG_LIMP_DROOP;
  const [fx, fy, fz] = [downwind[0] * (1 - droop), -droop, downwind[1] * (1 - droop)];
  const n = Math.hypot(fx, fy, fz);
  const r = flagRipple(cloth.u, cloth.length, seconds, ripple) * (1 - limp);
  const across = cloth.across + r;
  return [
    cloth.hoist[0] + (fx / n) * cloth.along - downwind[1] * across,
    y + (fy / n) * cloth.along,
    cloth.hoist[1] + (fz / n) * cloth.along + downwind[0] * across,
  ];
}

/** A cloth vertex's normal, turned with it from its modelled fly (`flyAngle`, radians from +X toward +Z) onto `downwind`. */
export function flagNormal(normal: Vec3, flyAngle: number, downwind: Vec2): [number, number, number] {
  const turn = Math.atan2(downwind[1], downwind[0]) - flyAngle;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return [normal[0] * c - normal[2] * s, normal[1], normal[0] * s + normal[2] * c];
}

/** What a ship's cloth does this frame: the shader's uniforms. */
export interface ShipWindPose {
  /** Downwind, model frame XZ. */
  readonly downwind: Vec2;
  /** 0 slack … 1 full. */
  readonly fullness: number;
  /** 0 … 1: how much a slack sail luffs. */
  readonly flutter: number;
  /** 0 … 1: how much the flags ripple. */
  readonly ripple: number;
  /** 0 … 1: how limp the flags hang. */
  readonly limp: number;
  /** The wave clock, s. */
  readonly seconds: number;
}

export interface ShipWindPoseInput {
  readonly heading: number;
  readonly wind: Wind;
  /** The wave clock's time (`waveTimeAt`), s. */
  readonly seconds: number;
  readonly reducedMotion: boolean;
  readonly sinking: boolean;
}

/**
 * A ship's cloth this frame. Under reduced motion it holds a still, filled
 * pose, with no time in it; a sinking ship's flags go limp and its sails slack.
 */
export function shipWindPose({ heading, wind, seconds, reducedMotion, sinking }: ShipWindPoseInput): ShipWindPose {
  const downwind = flagStreamDirection(heading, wind);
  if (sinking) return { downwind, fullness: 0, flutter: 0, ripple: 0, limp: 1, seconds: 0 };
  if (reducedMotion) return { downwind, fullness: 1, flutter: 0, ripple: 0, limp: 0, seconds: 0 };
  return { downwind, fullness: sailFullness(heading, wind), flutter: 1, ripple: windShare(wind), limp: 0, seconds };
}

/** A ship's own wind uniforms, shared by its canvas, flag and pennant materials and their shadow depth. */
export interface ShipWindUniforms {
  uWindDown: { value: [number, number] };
  uSailFullness: { value: number };
  uSailFlutter: { value: number };
  uFlagRipple: { value: number };
  uFlagLimp: { value: number };
  uWindSeconds: { value: number };
}

export function createShipWindUniforms(): ShipWindUniforms {
  return {
    uWindDown: { value: [0, -1] },
    uSailFullness: { value: 1 },
    uSailFlutter: { value: 0 },
    uFlagRipple: { value: 0 },
    uFlagLimp: { value: 0 },
    uWindSeconds: { value: 0 },
  };
}

/** Writes `pose` into `uniforms` in place, so a frame allocates nothing. */
export function writeShipWindPose(uniforms: ShipWindUniforms, pose: ShipWindPose): void {
  uniforms.uWindDown.value[0] = pose.downwind[0];
  uniforms.uWindDown.value[1] = pose.downwind[1];
  uniforms.uSailFullness.value = pose.fullness;
  uniforms.uSailFlutter.value = pose.flutter;
  uniforms.uFlagRipple.value = pose.ripple;
  uniforms.uFlagLimp.value = pose.limp;
  uniforms.uWindSeconds.value = pose.seconds;
}

const f = (v: number) => v.toFixed(6);

/** GLSL for the above. */
export const SHIP_WIND_GLSL = /* glsl */ `
  const float SW_TAU = ${f(TAU)};
  const float SAIL_SLACK_BELLY = ${f(SAIL_SLACK_BELLY)};
  const float SAIL_LEEWARD_LEAN = ${f(SAIL_LEEWARD_LEAN)};
  const float SAIL_GYBE_BAND = ${f(SAIL_GYBE_BAND)};
  const float SAIL_LUFF_SHARE = ${f(SAIL_LUFF_SHARE)};
  const float SAIL_LUFF_WAVELENGTH_METRES = ${f(SAIL_LUFF_WAVELENGTH_METRES)};
  const float SAIL_LUFF_RATE = ${f(SAIL_LUFF_RATE)};
  const float FLAG_RIPPLE_SHARE = ${f(FLAG_RIPPLE_SHARE)};
  const float FLAG_RIPPLE_WAVES = ${f(FLAG_RIPPLE_WAVES)};
  const float FLAG_RIPPLE_RATE = ${f(FLAG_RIPPLE_RATE)};
  const float FLAG_RIPPLE_GROWTH = ${f(FLAG_RIPPLE_GROWTH)};
  const float FLAG_LIMP_DROOP = ${f(FLAG_LIMP_DROOP)};

  vec3 sailBellyOffset(vec3 belly, vec2 downwind, float fullness) {
    float depth = length(belly);
    if (depth <= 0.0) return vec3(0.0);
    float across = length(belly.xz);
    vec2 n = across > 0.0 ? belly.xz / across : vec2(0.0);
    float athwart = n.x * n.x;
    float side = clamp(dot(n, downwind) / SAIL_GYBE_BAND, -1.0, 1.0);
    float scale = mix(SAIL_SLACK_BELLY, 1.0, fullness) * (1.0 + (side - 1.0) * athwart);
    float lean = downwind.x * (1.0 - athwart) * SAIL_LEEWARD_LEAN * depth * fullness;
    return belly * scale + vec3(lean, 0.0, 0.0);
  }

  vec3 sailLuff(vec3 belly, vec3 position, float seconds, float fullness, float flutter) {
    float phase = SW_TAU * (position.y + 0.5 * (position.x + position.z)) / SAIL_LUFF_WAVELENGTH_METRES - SAIL_LUFF_RATE * seconds;
    return belly * (SAIL_LUFF_SHARE * (1.0 - fullness) * flutter * sin(phase));
  }

  float flagRipple(float u, float lengthMetres, float seconds, float ripple) {
    float growth = pow(clamp(u, 0.0, 1.0), FLAG_RIPPLE_GROWTH);
    return FLAG_RIPPLE_SHARE * lengthMetres * growth * sin(SW_TAU * FLAG_RIPPLE_WAVES * u - FLAG_RIPPLE_RATE * seconds) * ripple;
  }

  vec3 flagClothPosition(vec2 hoist, float along, float across, float u, float lengthMetres, float y,
                         vec2 downwind, float seconds, float ripple, float limp) {
    float droop = limp * FLAG_LIMP_DROOP;
    vec3 fly = normalize(vec3(downwind.x * (1.0 - droop), -droop, downwind.y * (1.0 - droop)));
    float side = across + flagRipple(u, lengthMetres, seconds, ripple) * (1.0 - limp);
    return vec3(hoist.x + fly.x * along - downwind.y * side, y + fly.y * along, hoist.y + fly.z * along + downwind.x * side);
  }

  vec3 flagNormal(vec3 normal, float flyAngle, vec2 downwind) {
    float turn = atan(downwind.y, downwind.x) - flyAngle;
    float c = cos(turn);
    float s = sin(turn);
    return vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
  }
`;

const DECLARATIONS = /* glsl */ `
uniform vec2 uWindDown;
uniform float uSailFullness;
uniform float uSailFlutter;
uniform float uFlagRipple;
uniform float uFlagLimp;
uniform float uWindSeconds;
attribute vec3 windSail;       // a sail vertex's modelled belly: its offset from the sail's flat plane
attribute vec3 windFlagHoist;  // a cloth vertex's hoist (x, z) and its modelled fly angle
attribute vec4 windFlagLocal;  // (along, across, u, length); length 0 off the cloth
${SHIP_WIND_GLSL}
`;

/** Runs after beginnormal_vertex: a cloth's normal turns with it. */
const NORMAL_BODY = /* glsl */ `
if (windFlagLocal.w > 0.0) objectNormal = flagNormal(objectNormal, windFlagHoist.z, uWindDown);
`;

/** Runs after begin_vertex, in the model's frame, so the colour and the shadow depth passes see the same cloth. */
const POSITION_BODY = /* glsl */ `
if (windFlagLocal.w > 0.0) {
  transformed = flagClothPosition(windFlagHoist.xy, windFlagLocal.x, windFlagLocal.y, windFlagLocal.z, windFlagLocal.w,
                                  transformed.y, uWindDown, uWindSeconds, uFlagRipple, uFlagLimp);
} else {
  transformed = transformed - windSail + sailBellyOffset(windSail, uWindDown, uSailFullness)
              + sailLuff(windSail, position, uWindSeconds, uSailFullness, uSailFlutter);
}
`;

export interface WindShader {
  vertexShader: string;
  uniforms: Record<string, { value: unknown }>;
}

/**
 * Patches a built-in material's vertex shader (from `onBeforeCompile`) with
 * the ship's wind, binding its uniforms. Returns the new vertex source. A
 * depth shader, which has no normals, gets the displacement alone.
 */
export function injectShipWind(shader: WindShader, uniforms: ShipWindUniforms): string {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${DECLARATIONS}`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${NORMAL_BODY}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${POSITION_BODY}`);
  return shader.vertexShader;
}
