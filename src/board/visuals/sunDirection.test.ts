import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { sunDirection, viewDirectionXZ } from "./sunDirection";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_OFFSET } from "../cameraBounds";
import { SUN_AZIMUTH_DEG, SUN_DIRECTION, SUN_ELEVATION_DEG, SUN_OFFSET } from "./atmosphere";

/** Where on the sea plane (y = 0) a flat mirror reflects the sun into the camera. */
function mirrorGlintPoint(camera: Vector3, sun: readonly [number, number, number]): Vector3 {
  // The view ray to the glint is the sun direction mirrored in the plane.
  const ray = new Vector3(sun[0], -sun[1], sun[2]);
  return camera.clone().addScaledVector(ray, camera.y / sun[1]);
}

/** The glint's position in normalised device coordinates for a camera at `distance` from the origin. */
function glintNdc(distance: number, aspect: number, sun: readonly [number, number, number]): Vector3 {
  const offset = new Vector3(...CAMERA_OFFSET).normalize().multiplyScalar(distance);
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 1000);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return mirrorGlintPoint(offset, sun).project(camera);
}

const VIEW_CASES: [string, number, number][] = [
  ["mid zoom, 16:9", 14, 16 / 9],
  ["max zoom-out, 16:9", CAMERA_MAX_DISTANCE, 16 / 9],
  ["max zoom-out, 1400x900", CAMERA_MAX_DISTANCE, 1400 / 900],
  ["close zoom, 4:3", 6, 4 / 3],
];

/** Inside the screen with a 0.1 NDC margin on every edge. */
function glintInsideMargin(ndc: Vector3): boolean {
  return Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9;
}

describe("viewDirectionXZ", () => {
  it("points from the camera towards its target, flattened and normalised", () => {
    const [x, z] = viewDirectionXZ([0.4, 0.6, 0.4]);
    expect(x).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(z).toBeCloseTo(-Math.SQRT1_2, 10);
  });
});

describe("sunDirection", () => {
  const view = viewDirectionXZ(CAMERA_OFFSET);

  it("is a unit vector at the requested elevation", () => {
    const [x, y, z] = sunDirection(view, 35, -25);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(Math.sin((35 * Math.PI) / 180), 10);
  });

  it("with zero azimuth lies straight along the view direction", () => {
    const [x, , z] = sunDirection(view, 30, 0);
    const h = Math.hypot(x, z);
    expect(x / h).toBeCloseTo(view[0], 10);
    expect(z / h).toBeCloseTo(view[1], 10);
  });

  it("with positive azimuth swings towards screen right", () => {
    const ndc = glintNdc(20, 16 / 9, sunDirection(view, 35, 25));
    expect(ndc.x).toBeGreaterThan(0);
    const left = glintNdc(20, 16 / 9, sunDirection(view, 35, -25));
    expect(left.x).toBeLessThan(0);
  });
});

describe("the scene sun", () => {
  const view = viewDirectionXZ(CAMERA_OFFSET);

  it("swings as far to the side as the glint margin allows: one degree more breaks it", () => {
    const wider = sunDirection(view, SUN_ELEVATION_DEG, SUN_AZIMUTH_DEG + Math.sign(SUN_AZIMUTH_DEG));
    const allInside = VIEW_CASES.every(([, distance, aspect]) => glintInsideMargin(glintNdc(distance, aspect, wider)));
    expect(allInside).toBe(false);
  });

  it("sits in front of the camera, not behind it", () => {
    const along = SUN_DIRECTION[0] * view[0] + SUN_DIRECTION[2] * view[1];
    expect(along).toBeGreaterThan(0);
  });

  it("is the configured elevation and azimuth", () => {
    expect(SUN_DIRECTION).toEqual(sunDirection(view, SUN_ELEVATION_DEG, SUN_AZIMUTH_DEG));
  });

  it("offsets the shadow-casting light along the same direction", () => {
    const len = Math.hypot(...SUN_OFFSET);
    SUN_OFFSET.forEach((c, i) => expect(c / len).toBeCloseTo(SUN_DIRECTION[i], 10));
  });

  it.each(VIEW_CASES)("puts the mirror glint on screen, at least 0.1 in from every edge (%s)", (_label, distance, aspect) => {
    const ndc = glintNdc(distance, aspect, SUN_DIRECTION);
    expect(Math.abs(ndc.x)).toBeLessThan(0.9);
    expect(Math.abs(ndc.y)).toBeLessThan(0.9);
  });

  it("is high enough to light the slopes that face the camera (scanned: gains level off above 55°)", () => {
    expect(SUN_ELEVATION_DEG).toBeGreaterThanOrEqual(55);
  });
});
