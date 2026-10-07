import { describe, expect, it } from "vitest";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_PITCH } from "../cameraBounds";
import {
  PORT_LABEL_FADE_FAR,
  PORT_LABEL_FADE_NEAR,
  PORT_LABEL_FONT_SIZE,
  PORT_LABEL_LIFT_MARGIN,
  PORT_LABEL_MAX_PX,
  PORT_LABEL_MIN_HEIGHT,
  PORT_LABEL_HUD_GAP,
  PORT_LABEL_MIN_OPACITY,
  PORT_LABEL_TOWN_FADE_FAR,
  PORT_LABEL_TOWN_FADE_NEAR,
  PORT_LABEL_VIEWPORT_MARGIN,
  portLabelBaseY,
  portLabelOpacity,
  portLabelScale,
  portLabelScreenShift,
  worldUnitsPerPixel,
} from "./portLabel";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import type { BuildingKind } from "./buildingGeometry";
import type { PortBuilding } from "./portSettlement";
import { HUD_TOP_BAR_HEIGHT } from "../hudLayout";

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

  it("keeps the floor high enough to read over shore foam", () => {
    expect(PORT_LABEL_MIN_OPACITY).toBe(0.35);
    expect(portLabelOpacity(4.3, false)).toBeCloseTo(0.35, 10);
  });

  it("stays readable while the port is hovered", () => {
    expect(portLabelOpacity(4.3, true)).toBe(1);
  });

  describe("at town zoom (#90)", () => {
    it("keeps the faint floor at the old ship-zoom floor, where the label is about 3.8 from the camera", () => {
      expect(PORT_LABEL_TOWN_FADE_FAR).toBeLessThan(3.8);
      expect(portLabelOpacity(PORT_LABEL_TOWN_FADE_FAR, false)).toBeCloseTo(PORT_LABEL_MIN_OPACITY, 10);
    });

    it("fades out entirely, so no faint name hangs over the streets", () => {
      expect(PORT_LABEL_TOWN_FADE_NEAR).toBeLessThan(PORT_LABEL_TOWN_FADE_FAR);
      expect(portLabelOpacity(PORT_LABEL_TOWN_FADE_NEAR, false)).toBe(0);
      expect(portLabelOpacity(0.8, false)).toBe(0);
    });

    it("stays out while hovered: one hex fills the screen there, so the pointer is nearly always on the port", () => {
      expect(portLabelOpacity(PORT_LABEL_TOWN_FADE_NEAR, true)).toBe(0);
      expect(portLabelOpacity(0.8, true)).toBe(0);
      expect(portLabelOpacity(PORT_LABEL_TOWN_FADE_FAR, true)).toBe(1);
    });

    it("eases monotonically between the two", () => {
      let prev = -Infinity;
      for (let d = PORT_LABEL_TOWN_FADE_NEAR; d <= PORT_LABEL_TOWN_FADE_FAR; d += 0.05) {
        const o = portLabelOpacity(d, false);
        expect(o).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = o;
      }
    });
  });
});

describe("portLabelScreenShift", () => {
  const M = PORT_LABEL_VIEWPORT_MARGIN;

  it("keeps the label just below the HUD's top bar", () => {
    expect(PORT_LABEL_HUD_GAP).toBeGreaterThan(0);
    expect(PORT_LABEL_VIEWPORT_MARGIN).toBe(HUD_TOP_BAR_HEIGHT + PORT_LABEL_HUD_GAP);
    // Close to the hand-picked 56 px it replaces: the label's place barely moves
    expect(Math.abs(PORT_LABEL_VIEWPORT_MARGIN - 56)).toBeLessThanOrEqual(8);
  });

  it("leaves a label that is already inside the viewport where it is", () => {
    expect(portLabelScreenShift({ baselineY: 300, topY: 270, portY: 400 })).toBe(0);
    // Exactly at the margin counts as inside
    expect(portLabelScreenShift({ baselineY: M + 30, topY: M, portY: 400 })).toBe(0);
  });

  it("brings a label lifted off the top back down to the margin", () => {
    // Ship zoom over Crescent Harbor: the port is on screen, its label's top is above it
    const shift = portLabelScreenShift({ baselineY: 10, topY: -20, portY: 350 });
    expect(shift).toBeCloseTo(M + 20, 10);
    expect(-20 + shift).toBeCloseTo(M, 10);
  });

  it("never pulls the label's baseline below the port it names", () => {
    // The port itself is near the top edge: the label may only come down onto it
    expect(portLabelScreenShift({ baselineY: -10, topY: -40, portY: 5 })).toBeCloseTo(15, 10);
  });

  it("lets a label go off screen with a port that is off screen", () => {
    // Port above the top edge: the label (above it on screen) is not pinned to the edge
    const shift = portLabelScreenShift({ baselineY: -120, topY: -150, portY: -60 });
    expect(-120 + shift).toBeLessThanOrEqual(-60);
    expect(-150 + shift).toBeLessThan(0);
  });

  it("never pushes a label up", () => {
    expect(portLabelScreenShift({ baselineY: 300, topY: 270, portY: 200 })).toBe(0);
  });
});
