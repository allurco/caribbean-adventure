import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { sunDirection, viewDirectionXZ } from "./sunDirection";
import { CAMERA_FOV, CAMERA_DIRECTION } from "../cameraBounds";

/** Where on the sea plane (y = 0) a flat mirror reflects the sun into the camera. */
function mirrorGlintPoint(camera: Vector3, sun: readonly [number, number, number]): Vector3 {
  // The view ray to the glint is the sun direction mirrored in the plane.
  const ray = new Vector3(sun[0], -sun[1], sun[2]);
  return camera.clone().addScaledVector(ray, camera.y / sun[1]);
}

/** The glint's position in normalised device coordinates for a camera at `distance` from the origin. */
function glintNdc(distance: number, aspect: number, sun: readonly [number, number, number]): Vector3 {
  const offset = new Vector3(...CAMERA_DIRECTION).multiplyScalar(distance);
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 1000);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return mirrorGlintPoint(offset, sun).project(camera);
}

describe("viewDirectionXZ", () => {
  it("points from the camera towards its target, flattened and normalised", () => {
    const [x, z] = viewDirectionXZ([0.4, 0.6, 0.4]);
    expect(x).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(z).toBeCloseTo(-Math.SQRT1_2, 10);
  });

  it("is due north (world −z) for the game camera", () => {
    const [x, z] = viewDirectionXZ(CAMERA_DIRECTION);
    expect(x).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(-1, 12);
  });
});

describe("sunDirection", () => {
  const view = viewDirectionXZ(CAMERA_DIRECTION);

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
