import { describe, expect, it } from "vitest";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_PITCH } from "../cameraBounds";
import {
  PORT_LABEL_FADE_FAR,
  PORT_LABEL_FADE_NEAR,
  PORT_LABEL_FONT_SIZE,
  PORT_LABEL_LIFT_MARGIN,
  PORT_LABEL_MAX_PX,
  PORT_LABEL_MIN_HEIGHT,
  PORT_LABEL_MIN_OPACITY,
  portLabelBaseY,
  portLabelOpacity,
  portLabelScale,
  worldUnitsPerPixel,
} from "./portLabel";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import type { BuildingKind } from "./buildingGeometry";
import type { PortBuilding } from "./portSettlement";

const VIEWPORT = 900;

/** The label's on-screen font size in CSS pixels at `distance`. */
function screenPx(distance: number, viewport = VIEWPORT): number {
  const font = PORT_LABEL_FONT_SIZE * portLabelScale(distance, CAMERA_FOV, viewport);
  return font / worldUnitsPerPixel(distance, CAMERA_FOV, viewport);
}

describe("worldUnitsPerPixel", () => {
  it("spans the frustum's visible height over the viewport", () => {
    // fov 90: visible height is 2·d
    expect(worldUnitsPerPixel(10, 90, 1000)).toBeCloseTo(0.02, 10);
  });
});

describe("portLabelScale", () => {
  it("leaves the label as it was at map zoom", () => {
    expect(portLabelScale(CAMERA_MAX_DISTANCE, CAMERA_FOV, VIEWPORT)).toBe(1);
    // and for labels nearer the bottom of a map-zoom view
    expect(portLabelScale(20, CAMERA_FOV, VIEWPORT)).toBe(1);
  });

  it("never lets the font grow past the cap on screen as the camera closes in", () => {
    for (const d of [1, 2, 4.3, 6, 8, 11, 15]) {
      expect(screenPx(d)).toBeLessThanOrEqual(PORT_LABEL_MAX_PX + 1e-9);
    }
    expect(screenPx(4.3)).toBeCloseTo(PORT_LABEL_MAX_PX, 6);
    expect(screenPx(11)).toBeCloseTo(PORT_LABEL_MAX_PX, 6);
  });

  it("shrinks monotonically with the camera's approach", () => {
    let prev = Infinity;
    for (const d of [28, 20, 15, 11, 8, 6, 4.3, 2]) {
      const s = portLabelScale(d, CAMERA_FOV, VIEWPORT);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThan(0);
      prev = s;
    }
  });

  it("caps the size in CSS pixels whatever the viewport height", () => {
    expect(screenPx(4.3, 600)).toBeCloseTo(PORT_LABEL_MAX_PX, 6);
    expect(screenPx(4.3, 1440)).toBeCloseTo(PORT_LABEL_MAX_PX, 6);
  });

  it("falls back to 1 on a degenerate viewport or distance", () => {
    expect(portLabelScale(0, CAMERA_FOV, VIEWPORT)).toBe(1);
    expect(portLabelScale(5, CAMERA_FOV, 0)).toBe(1);
  });
});

function building(kind: BuildingKind, x: number, y: number, z: number, scale = 1): PortBuilding {
  return { kind, worldX: x, worldY: y, worldZ: z, yaw: 0, scale, tint: 1 };
}

const topOf = (b: PortBuilding) => b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale;
/** Screen-up runs along (0, cos p, −sin p) in world (y up, the camera looking toward −z). */
const screenUp = (y: number, z: number) => y * Math.cos(CAMERA_PITCH) - z * Math.sin(CAMERA_PITCH);

describe("portLabelBaseY", () => {
  const centre = { x: 10, z: 10 };

  it("keeps the old baseline when no building is in the way", () => {
    expect(portLabelBaseY(centre, 0.2, [], CAMERA_PITCH)).toBeCloseTo(0.2 + PORT_LABEL_MIN_HEIGHT, 10);
    // A low house in front of (south of, nearer the camera than) the centre does not lift it
    const front = building("house", 10, 0.2, 10.5, 0.8);
    expect(portLabelBaseY(centre, 0.2, [front], CAMERA_PITCH)).toBeCloseTo(0.2 + PORT_LABEL_MIN_HEIGHT, 10);
  });

  it("sits above a tall piece over the centre by the margin", () => {
    const tower = building("watchtower", 10, 0.2, 10, 1.6);
    const reach = AGED_BUILDING_HALF_DIAGONAL.watchtower * 1.6;
    expect(portLabelBaseY(centre, 0.2, [tower], CAMERA_PITCH)).toBeCloseTo(
      Math.max(0.2 + PORT_LABEL_MIN_HEIGHT, topOf(tower) + reach * Math.tan(CAMERA_PITCH) + PORT_LABEL_LIFT_MARGIN),
      10
    );
  });

  it("clears every building's top as seen down the camera pitch, behind the centre too", () => {
    const set = [
      building("church", 10.2, 0.3, 9.45, 1.1),
      building("watchtower", 9.7, 0.25, 9.7, 1.4),
      building("house", 10.4, 0.1, 10.4, 0.9),
    ];
    const base = portLabelBaseY(centre, 0.1, set, CAMERA_PITCH);
    for (const b of set) {
      const farZ = b.worldZ - AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
      expect(screenUp(base, centre.z)).toBeGreaterThan(screenUp(topOf(b), farZ));
    }
  });

  it("ignores another port's buildings", () => {
    const far = building("watchtower", 30, 3, 0, 2);
    expect(portLabelBaseY(centre, 0.2, [far], CAMERA_PITCH)).toBeCloseTo(0.2 + PORT_LABEL_MIN_HEIGHT, 10);
  });
});

describe("portLabelOpacity", () => {
  it("is fully opaque at map and mid zoom", () => {
    expect(portLabelOpacity(CAMERA_MAX_DISTANCE, false)).toBe(1);
    expect(portLabelOpacity(11, false)).toBe(1);
    expect(portLabelOpacity(PORT_LABEL_FADE_FAR, false)).toBe(1);
  });

  it("fades to the floor at the closest zoom", () => {
    expect(portLabelOpacity(PORT_LABEL_FADE_NEAR, false)).toBeCloseTo(PORT_LABEL_MIN_OPACITY, 10);
    expect(portLabelOpacity(4.3, false)).toBeCloseTo(PORT_LABEL_MIN_OPACITY, 10);
  });

  it("eases monotonically between the two", () => {
    let prev = -Infinity;
    for (let d = PORT_LABEL_FADE_NEAR; d <= PORT_LABEL_FADE_FAR; d += 0.25) {
      const o = portLabelOpacity(d, false);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it("stays readable while the port is hovered", () => {
    expect(portLabelOpacity(4.3, true)).toBe(1);
  });
});
