import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA_DIRECTION, CAMERA_FOV, CAMERA_MAX_DISTANCE } from "../cameraBounds";
import { SHIP_VIEW_DISTANCE } from "../shipView";
import { kelvinToHex } from "./colourTemperature";
import { GOLDEN_HOUR, lightingFor, type Lighting } from "./lighting";
import { sunDirection, viewDirectionXZ, type Vec3 } from "./sunDirection";

const DEG = Math.PI / 180;
const NOON = 12;
const view = viewDirectionXZ(CAMERA_DIRECTION);
/** How much of a light's horizontal direction points the way the camera looks. */
const alongView = (d: Vec3) => d[0] * view[0] + d[2] * view[1];
const angleBetween = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))));
const blueOverRed = (hex: string) => parseInt(hex.slice(5, 7), 16) / parseInt(hex.slice(1, 3), 16);
/** Light on level ground from a directional light, before colour. */
const onLevelGround = (l: Lighting) => l.sun.intensity * Math.sin(l.sun.elevationDeg * DEG) * l.grade.exposure;

/** Where the camera sees the sun mirrored in a level sea, in normalised device coordinates. */
function glintNdc(distance: number, aspect: number, sun: Vec3): Vector3 {
  const offset = new Vector3(...CAMERA_DIRECTION).multiplyScalar(distance);
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 1000);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ray = new Vector3(sun[0], -sun[1], sun[2]);
  return offset.clone().addScaledVector(ray, offset.y / sun[1]).project(camera);
}

describe("lightingFor is pure", () => {
  it("gives deep-equal records for the same time, as fresh objects", () => {
    const a = lightingFor(GOLDEN_HOUR);
    lightingFor(3);
    lightingFor(NOON);
    const b = lightingFor(GOLDEN_HOUR);
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    expect(b.sun).not.toBe(a.sun);
  });

  it("is a day-long loop: the time is taken modulo 24 hours", () => {
    const a = lightingFor(GOLDEN_HOUR);
    for (const t of [GOLDEN_HOUR + 24, GOLDEN_HOUR - 24, GOLDEN_HOUR + 48]) {
      const b = lightingFor(t);
      b.sun.direction.forEach((c, i) => expect(c).toBeCloseTo(a.sun.direction[i], 12));
      expect(b.sun.color).toBe(a.sun.color);
      expect(b.grade.exposure).toBeCloseTo(a.grade.exposure, 12);
    }
  });

  it("takes no seed: the light is the same on every map (#158 decision 14)", () => {
    expect(lightingFor.length).toBe(1);
  });
});

describe("the golden-hour look (#169)", () => {
  const golden = lightingFor(GOLDEN_HOUR);
  const noon = lightingFor(NOON);

  it("puts the sun low, at 22°, and ~3200 K warm", () => {
    expect(golden.sun.elevationDeg).toBe(22);
    expect(golden.sun.color).toBe(kelvinToHex(3200));
    expect(blueOverRed(golden.sun.color)).toBeLessThan(blueOverRed(noon.sun.color));
  });

  it("puts the sun ahead and to the right of the camera", () => {
    expect(golden.sun.azimuthDeg).toBe(30);
    expect(alongView(golden.sun.direction)).toBeGreaterThan(0);
    // Screen right of a view due north is east (+x).
    expect(golden.sun.direction[0]).toBeGreaterThan(0);
  });

  it("is the configured elevation and azimuth, as a unit vector", () => {
    expect(golden.sun.direction).toEqual(sunDirection(view, 22, 30));
    expect(Math.hypot(...golden.sun.direction)).toBeCloseTo(1, 12);
  });

  it.each([
    ["opening ship view, 16:9", SHIP_VIEW_DISTANCE, 16 / 9],
    ["mid zoom, 16:9", 14, 16 / 9],
    ["max zoom-out, 1400x900", CAMERA_MAX_DISTANCE, 1400 / 900],
  ])("lays the glare over the upper-right sea, at least 0.1 in from the right edge (%s)", (_label, distance, aspect) => {
    const ndc = glintNdc(distance, aspect, golden.sun.direction);
    expect(ndc.x).toBeGreaterThan(0.4);
    expect(ndc.x).toBeLessThan(0.9);
    expect(ndc.y).toBeGreaterThan(0.75);
    expect(ndc.y).toBeLessThan(1.1);
  });

  it("casts shadows at least 2.5× longer than the midday sun's", () => {
    const length = (l: Lighting) => 1 / Math.tan(l.sun.elevationDeg * DEG);
    expect(length(golden) / length(noon)).toBeGreaterThanOrEqual(2.5);
  });

  it("rebalances the sun with the exposure: level ground keeps 80–100 % of midday's light", () => {
    const ratio = onLevelGround(golden) / onLevelGround(noon);
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(1);
    expect(golden.grade.exposure).toBeGreaterThan(1);
  });

  it("grades warm after ACES: red up, blue down, mildly", () => {
    const [r, g, b] = golden.grade.gain;
    expect(r).toBeGreaterThan(g);
    expect(b).toBeLessThan(g);
    for (const c of golden.grade.gain) expect(Math.abs(c - 1)).toBeLessThanOrEqual(0.1);
  });

  it("blooms more over a 0.8 threshold, with the vignette unchanged", () => {
    expect(golden.bloom.intensity).toBe(0.4);
    expect(golden.bloom.threshold).toBe(0.8);
    expect(golden.vignette).toEqual(noon.vignette);
  });
});

describe("the fill light (#63)", () => {
  const golden = lightingFor(GOLDEN_HOUR);

  it("is cooler and bluer than the sun", () => {
    expect(blueOverRed(golden.fill.color)).toBeGreaterThan(1);
    expect(blueOverRed(golden.fill.color)).toBeGreaterThan(blueOverRed(golden.sun.color));
  });

  it("comes from behind the camera, where the sun is in front of it", () => {
    // Every wall the player sees faces the camera, and so faces away from a
    // sun in front of it; only a light from behind the camera reaches them.
    expect(alongView(golden.sun.direction)).toBeGreaterThan(0);
    expect(alongView(golden.fill.direction)).toBeLessThan(0);
  });

  it("swings to the opposite side of the view from the sun", () => {
    expect(Math.sign(golden.fill.azimuthDeg)).toBe(-Math.sign(golden.sun.azimuthDeg));
    expect(Math.sign(golden.fill.direction[0])).toBe(-Math.sign(golden.sun.direction[0]));
  });

  it("sits lower than the sun, as bounce light does", () => {
    expect(golden.fill.elevationDeg).toBeLessThan(golden.sun.elevationDeg);
    expect(golden.fill.elevationDeg).toBeGreaterThan(0);
  });

  it("is a fraction of the sun's strength, never a second key light", () => {
    const ratio = golden.fill.intensity / golden.sun.intensity;
    expect(ratio).toBeGreaterThanOrEqual(0.15);
    expect(ratio).toBeLessThanOrEqual(0.4);
  });

  it("is mounted along its direction at the sun's distance", () => {
    const sunDistance = Math.hypot(...golden.sun.offset);
    expect(Math.hypot(...golden.fill.offset)).toBeCloseTo(sunDistance, 9);
    golden.fill.offset.forEach((c, i) => expect(c / sunDistance).toBeCloseTo(golden.fill.direction[i], 12));
    golden.sun.offset.forEach((c, i) => expect(c / sunDistance).toBeCloseTo(golden.sun.direction[i], 12));
  });
});

describe("the sun over the day", () => {
  const STEP = 1 / 60; // a minute

  it("moves continuously: under a degree a minute, across midnight too", () => {
    for (let t = -1; t < 25; t += STEP) {
      const a = lightingFor(t).sun.direction;
      const b = lightingFor(t + STEP).sun.direction;
      expect(angleBetween(a, b)).toBeLessThan(DEG);
    }
  });

  it("keeps the fill and the post continuous too", () => {
    for (let t = -1; t < 25; t += STEP) {
      const a = lightingFor(t);
      const b = lightingFor(t + STEP);
      expect(angleBetween(a.fill.direction, b.fill.direction)).toBeLessThan(DEG);
      expect(Math.abs(a.sun.intensity - b.sun.intensity)).toBeLessThan(0.05);
      expect(Math.abs(a.grade.exposure - b.grade.exposure)).toBeLessThan(0.01);
      expect(Math.abs(a.bloom.intensity - b.bloom.intensity)).toBeLessThan(0.01);
    }
  });

  it("is above the horizon by day and gives no light at midnight", () => {
    expect(lightingFor(NOON).sun.elevationDeg).toBeGreaterThan(0);
    expect(lightingFor(GOLDEN_HOUR).sun.elevationDeg).toBeGreaterThan(0);
    expect(lightingFor(0).sun.elevationDeg).toBeLessThan(0);
    expect(lightingFor(0).sun.intensity).toBe(0);
  });
});
