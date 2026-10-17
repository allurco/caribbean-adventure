import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { generateMapFor } from "../../game/mapRequest";
import { hexToWorld } from "../../game/hex";
import { CAMERA_DIRECTION, CAMERA_FOV } from "../cameraBounds";
import { HARBOUR_CAMERA_DISTANCE, HARBOUR_MAP, harbourCamera, harbourFov, harbourTarget, STILL_HEIGHT, STILL_WIDTH } from "./harbourView";

const cells = generateMapFor(HARBOUR_MAP).cells;
const target = harbourTarget(cells);

/** A three camera set up as the harbour scene sets its own when drawn at a viewport of `width` × `height`. */
function sceneCamera(width: number, height: number): PerspectiveCamera {
  const view = harbourCamera(target);
  const camera = new PerspectiveCamera(harbourFov(width / height), width / height, view.near, 1000);
  camera.position.set(...view.position);
  camera.lookAt(...view.target);
  camera.updateMatrixWorld();
  return camera;
}

/** Pixel of `point` on a `width` × `height` view through `camera`. */
function pixelOf(point: Vector3, camera: PerspectiveCamera, width: number, height: number): [number, number] {
  const ndc = point.clone().project(camera);
  return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
}

/** Where a pixel of the still lands in a `width` × `height` box under CSS `background-size: cover; background-position: center`. */
function coverPixel([x, y]: [number, number], width: number, height: number): [number, number] {
  const scale = Math.max(width / STILL_WIDTH, height / STILL_HEIGHT);
  return [(width - STILL_WIDTH * scale) / 2 + x * scale, (height - STILL_HEIGHT * scale) / 2 + y * scale];
}

describe("the harbour still's view (#122, #418)", () => {
  it("looks at the harbour of the port nearest the map's middle, the same one every time", () => {
    expect(harbourTarget(generateMapFor(HARBOUR_MAP).cells)).toEqual(target);
    const ports = cells.filter((c) => c.hasPort).map((c) => hexToWorld(c.hex));
    const nearest = Math.min(...ports.map((p) => Math.hypot(p[0] - target[0], p[2] - target[2])));
    expect(nearest).toBeLessThan(2);
    expect(target[1]).toBe(0);
  });

  it("is the board's fixed camera: due south of its target at the board's pitch, never moved", () => {
    const view = harbourCamera(target);
    const offset = view.position.map((p, i) => p - view.target[i]);
    expect(Math.hypot(...offset)).toBeCloseTo(HARBOUR_CAMERA_DISTANCE, 9);
    offset.forEach((o, i) => expect(o / HARBOUR_CAMERA_DISTANCE).toBeCloseTo(CAMERA_DIRECTION[i], 9));
  });

  it("keeps the board's field of view up to the still's aspect, and its width beyond", () => {
    expect(harbourFov(16 / 10)).toBe(CAMERA_FOV);
    expect(harbourFov(19.5 / 9)).toBe(CAMERA_FOV);
    expect(harbourFov(STILL_WIDTH / STILL_HEIGHT)).toBe(CAMERA_FOV);
    expect(harbourFov(32 / 9)).toBeLessThan(CAMERA_FOV);
  });

  it("lines the still up, under CSS cover, with the scene drawn at each desktop and landscape-phone size, pixel for pixel", () => {
    const still = sceneCamera(STILL_WIDTH, STILL_HEIGHT);
    const points = [
      new Vector3(...target),
      new Vector3(target[0] - 3, 0, target[2] - 2),
      new Vector3(target[0] + 4, 0.4, target[2] + 1),
      new Vector3(target[0] + 1, 0, target[2] - 6),
    ];
    const viewports: [number, number][] = [
      [1440, 900], // laptop, 16:10
      [1920, 1080], // desktop, 16:9
      [1024, 768], // 4:3
      [3440, 1440], // 21:9 ultrawide
      [5120, 1440], // 32:9, wider than the still
      [844, 390], // phone held sideways
      [932, 430],
      [667, 375],
    ];
    for (const [width, height] of viewports) {
      const drawn = sceneCamera(width, height);
      for (const point of points) {
        const [lx, ly] = pixelOf(point, drawn, width, height);
        const [sx, sy] = coverPixel(pixelOf(point, still, STILL_WIDTH, STILL_HEIGHT), width, height);
        expect(Math.abs(lx - sx), `${width}×${height} x`).toBeLessThan(0.01);
        expect(Math.abs(ly - sy), `${width}×${height} y`).toBeLessThan(0.01);
      }
    }
  });
});
