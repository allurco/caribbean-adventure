/**
 * All of the scene's light from one pure input: the time of day (#169, ADR
 * 0002 amendment b).
 *
 * `lightingFor(timeOfDay)` returns the whole light state: the sun and the fill,
 * the sky the environment map is baked from, the haze, the exposure and grade,
 * bloom and vignette, and the ocean's reflection tint. No other module holds a
 * lighting value; they all read the record (a test scans the sources).
 *
 * V1 pins the input to `GOLDEN_HOUR` on every client and every seed (#158
 * decisions 10 and 14): lighting is not a variety axis. A later day/night
 * slice for live games (#187) only changes which time is passed, taken from
 * the shared game clock, never a local one.
 *
 * The day is a loop of keyed looks, interpolated linearly in time, so every
 * value is continuous in `timeOfDay`, across midnight too. Angles are
 * relative to the camera's view (sunDirection.ts): the camera never rotates,
 * so the sun is placed where the player should see it. Azimuths only ever
 * advance (left to right across the view, then round behind the camera), so
 * the sun sweeps the sky once a day instead of jumping back.
 */

import { CAMERA_DIRECTION } from "../cameraBounds";
import { kelvinToHex } from "./colourTemperature";
import { sunDirection, viewDirectionXZ, type Vec3 } from "./sunDirection";

/** Hours since midnight; any real number, taken modulo 24. */
export type TimeOfDay = number;

/** Late afternoon: the low, warm sun of the target look. */
export const GOLDEN_HOUR: TimeOfDay = 17;

export type Rgb = readonly [number, number, number];

/** A directional light placed by where the player sees it. */
export interface DirectionalLighting {
  /** Height above the horizon, degrees. */
  elevationDeg: number;
  /** Swing from the camera's view direction, degrees; positive is towards screen right. */
  azimuthDeg: number;
  /** Unit vector towards the light. */
  direction: Vec3;
  /** Where the light is mounted relative to the camera target: along `direction`, `MOUNT_DISTANCE` out. */
  offset: Vec3;
  /** "#rrggbb" (sRGB). */
  color: string;
  intensity: number;
}

export interface SkyLighting {
  /** Preetham turbidity: 2 very clear, 6 humid haze. */
  turbidity: number;
  /** three's Sky subtracts 1 from this for a sun at unit distance, so 2 is physical Rayleigh. */
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Diffuse share of the light on level ground; sets the sky's brightness against the sun. */
  diffuseFraction: number;
}

export interface HazeLighting {
  /** Fog and background colour, "#rrggbb". */
  color: string;
  /** Linear fog range in camera-space depth, world units. */
  near: number;
  far: number;
}

export interface GradeLighting {
  /** Multiplies the scene before ACES (the renderer's `toneMappingExposure`). */
  exposure: number;
  /** Per-channel gain applied after ACES: the colour grade. */
  gain: Rgb;
}

export interface BloomLighting {
  intensity: number;
  threshold: number;
  smoothing: number;
}

export interface VignetteLighting {
  darkness: number;
  offset: number;
}

export interface OceanLighting {
  /** Tint on the sea's sky reflection and glare, "#rrggbb" (wired by #175). */
  reflectionTint: string;
}

export interface Lighting {
  sun: DirectionalLighting;
  /** Shadowless fill from behind the camera: the sand and whitewash bounce the sky map cannot carry (#63). */
  fill: DirectionalLighting;
  sky: SkyLighting;
  haze: HazeLighting;
  grade: GradeLighting;
  bloom: BloomLighting;
  vignette: VignetteLighting;
  ocean: OceanLighting;
}

type KeyLight = Pick<DirectionalLighting, "elevationDeg" | "azimuthDeg" | "color" | "intensity">;

/** One keyed look: everything in `Lighting` that is not derived. */
interface LightingKey {
  time: TimeOfDay;
  sun: KeyLight;
  fill: KeyLight;
  sky: SkyLighting;
  haze: HazeLighting;
  grade: GradeLighting;
  bloom: BloomLighting;
  vignette: VignetteLighting;
  ocean: OceanLighting;
}

/** Lights are mounted this far from the camera target along their direction (the shadow camera's depth planes assume it). */
const MOUNT_DISTANCE = 70;

/**
 * The sky, haze and post settings every key shares until the sky slice
 * (#175) and the day/night slice (#187) give them their own values.
 */
const CLEAR_SKY: SkyLighting = {
  // Caribbean air is clear but moist; Mie terms are three's defaults.
  turbidity: 3,
  rayleigh: 2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  // Erbs et al. (1982): ≈ 0.18 at a clearness index of 0.75, a clear tropical day.
  diffuseFraction: 0.18,
};
/** Pale, slightly warm haze; the fog starts just past the camera's furthest zoom, so only the far third of the view softens. */
const PALE_HAZE: HazeLighting = { color: "#bcd4da", near: 28, far: 85 };
const VIGNETTE: VignetteLighting = { darkness: 0.35, offset: 0.3 };
const NEUTRAL_SEA: OceanLighting = { reflectionTint: "#ffffff" };

/**
 * Midday: the look before #169, kept as the day's high point. A high warm
 * sun (~4000 K, a deliberate warm grade) ahead and to the left of the view,
 * its mirror glint in the lower-left quarter of the screen, moderate shadows;
 * a cool pale fill from behind the camera on the right, a third of the sun.
 */
const MIDDAY: LightingKey = {
  time: 12,
  sun: { elevationDeg: 55, azimuthDeg: -48, color: "#ffd2a1", intensity: 2.5 },
  fill: { elevationDeg: 35, azimuthDeg: 132, color: "#cfdcea", intensity: 0.8 },
  sky: CLEAR_SKY,
  haze: PALE_HAZE,
  grade: { exposure: 1, gain: [1, 1, 1] },
  bloom: { intensity: 0.25, threshold: 0.85, smoothing: 0.9 },
  vignette: VIGNETTE,
  ocean: NEUTRAL_SEA,
};

/**
 * Golden hour, the V1 look (#158, #169).
 *
 * - **Sun** low at 22° and ~3200 K, ahead and to the right of the view: the
 *   shadows fall towards the lower left, 3.5× longer than midday's, and the
 *   mirror glint sits at the top right of the screen, so the glare lies over
 *   the upper-right sea and clear of the camera-facing slopes. 30° of swing
 *   keeps the glint a quarter of the screen in from the right edge.
 * - **Intensity with exposure**: a sun at 22° puts sin 22° / sin 55° = 0.46 of
 *   midday's light on level ground. A stronger sun (4.0) under a 1.25
 *   exposure brings level ground back to ~90 % of midday before the warmer
 *   colour, so the board is a warm evening, not a dim one.
 * - **Fill** cooler and bluer, mirrored to the left behind the camera now the
 *   sun is on the right, and lower than the sun so it grazes the walls the
 *   player sees (they all face away from a sun in front of the camera). A
 *   quarter of the sun, before exposure a little stronger than midday's, to
 *   lift the camera-facing slopes the low sun leaves in shade.
 * - **Post**: bloom 0.25 → 0.4 over a 0.8 threshold so glints and embers glow;
 *   a mild warm gain after ACES; the vignette is unchanged.
 */
const GOLDEN: LightingKey = {
  time: GOLDEN_HOUR,
  sun: { elevationDeg: 22, azimuthDeg: 30, color: kelvinToHex(3200), intensity: 4 },
  fill: { elevationDeg: 18, azimuthDeg: -132, color: "#a9c2e8", intensity: 1 },
  sky: CLEAR_SKY,
  haze: PALE_HAZE,
  grade: { exposure: 1.25, gain: [1.04, 1, 0.93] },
  bloom: { intensity: 0.4, threshold: 0.8, smoothing: 0.9 },
  vignette: VIGNETTE,
  ocean: NEUTRAL_SEA,
};

/**
 * Midnight, a placeholder that closes the loop so every value is continuous;
 * no V1 client ever shows it. The sun is below the horizon behind the
 * camera and gives no light; a dim blue fill stands in for the moon. The
 * day/night slice (#187) tunes it, with lit windows and lanterns.
 */
const MIDNIGHT: LightingKey = {
  time: 0,
  sun: { elevationDeg: -30, azimuthDeg: 180, color: kelvinToHex(2000), intensity: 0 },
  fill: { elevationDeg: 30, azimuthDeg: -48, color: "#7088b8", intensity: 0.3 },
  sky: CLEAR_SKY,
  haze: { color: "#1c2a3a", near: PALE_HAZE.near, far: PALE_HAZE.far },
  grade: { exposure: 1, gain: [0.9, 0.95, 1.1] },
  bloom: { intensity: 0.4, threshold: 0.8, smoothing: 0.9 },
  vignette: VIGNETTE,
  ocean: { reflectionTint: "#8aa0c8" },
};

/** The day's keys in time order, starting at midnight. */
const DAY: readonly LightingKey[] = [MIDNIGHT, MIDDAY, GOLDEN];

const HOURS = 24;
const wrapHours = (t: number): number => ((t % HOURS) + HOURS) % HOURS;

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Forward-only angle interpolation: the light advances (to screen right) from `a` to `b`. */
function lerpAzimuth(a: number, b: number, f: number): number {
  const ahead = (((b - a) % 360) + 360) % 360;
  const deg = a + ahead * f;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpHex(a: string, b: string, f: number): string {
  if (a === b) return a;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${[lerp(ar, br, f), lerp(ag, bg, f), lerp(ab, bb, f)]
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("")}`;
}

const lerpRgb = (a: Rgb, b: Rgb, f: number): Rgb => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

function lerpRecord<T extends object>(a: T, b: T, f: number): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(a) as (keyof T & string)[]) {
    const x = a[key];
    const y = b[key];
    out[key] =
      typeof x === "number" && typeof y === "number"
        ? lerp(x, y, f)
        : typeof x === "string" && typeof y === "string"
          ? lerpHex(x, y, f)
          : x;
  }
  return out as T;
}

const VIEW_XZ = viewDirectionXZ(CAMERA_DIRECTION);

function directional(a: KeyLight, b: KeyLight, f: number): DirectionalLighting {
  const elevationDeg = lerp(a.elevationDeg, b.elevationDeg, f);
  const azimuthDeg = lerpAzimuth(a.azimuthDeg, b.azimuthDeg, f);
  const direction = sunDirection(VIEW_XZ, elevationDeg, azimuthDeg);
  return {
    elevationDeg,
    azimuthDeg,
    direction,
    offset: [direction[0] * MOUNT_DISTANCE, direction[1] * MOUNT_DISTANCE, direction[2] * MOUNT_DISTANCE],
    color: lerpHex(a.color, b.color, f),
    intensity: lerp(a.intensity, b.intensity, f),
  };
}

/** The keys either side of `t` and how far `t` lies between them. */
function bracket(t: TimeOfDay): { from: LightingKey; to: LightingKey; f: number } {
  const i = DAY.findIndex((key, k) => t >= key.time && t < (DAY[k + 1]?.time ?? HOURS));
  const from = DAY[i];
  const to = DAY[(i + 1) % DAY.length];
  const span = wrapHours(to.time - from.time) || HOURS;
  return { from, to, f: (t - from.time) / span };
}

/** The whole light state at `timeOfDay` (hours, modulo 24). Pure: a fresh record each call. */
export function lightingFor(timeOfDay: TimeOfDay): Lighting {
  const { from, to, f } = bracket(wrapHours(timeOfDay));
  return {
    sun: directional(from.sun, to.sun, f),
    fill: directional(from.fill, to.fill, f),
    sky: lerpRecord(from.sky, to.sky, f),
    haze: lerpRecord(from.haze, to.haze, f),
    grade: { exposure: lerp(from.grade.exposure, to.grade.exposure, f), gain: lerpRgb(from.grade.gain, to.grade.gain, f) },
    bloom: lerpRecord(from.bloom, to.bloom, f),
    vignette: lerpRecord(from.vignette, to.vignette, f),
    ocean: lerpRecord(from.ocean, to.ocean, f),
  };
}
