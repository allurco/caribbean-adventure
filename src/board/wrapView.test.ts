import { describe, expect, it } from "vitest";
import {
  WRAP_BAND_PADDING,
  clampFocusZ,
  copyShiftToward,
  groundFootprint,
  mapBand,
  maxViewDistance,
  paddedBand,
  seamAwareStart,
  wrapCopyRange,
  type GroundFootprint,
} from "./wrapView";
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_OFFSET,
  CAMERA_PITCH,
  MAX_VIEW_ASPECT,
  groundViewReach,
  oceanPlaneSize,
} from "./cameraBounds";
import { MAP_PRESETS } from "../game/mapConfig";

const SQRT3 = Math.sqrt(3);

describe("groundFootprint", () => {
  // A camera due south of its target (+z), 45° up, 60° vertical FOV, square view.
  // Worked by hand: height and setback are d/√2; the bottom edge looks down at
  // 75°, the top at 15°; the side half-width of a ray is its length to the
  // ground × tan 30°.
  const south45 = groundFootprint([0, Math.SQRT1_2, Math.SQRT1_2], 60, 1)!;

  it("reaches from just in front of the camera to far beyond the target", () => {
    expect(south45.maxZ).toBeCloseTo(0.51764, 4); // 0.7071 − 0.7071 / tan 75°
    expect(south45.minZ).toBeCloseTo(-1.93185, 4); // 0.7071 − 0.7071 / tan 15°
  });

  it("is widest along its far edge", () => {
    expect(south45.maxX).toBeCloseTo(1.36603, 4);
    expect(south45.minX).toBeCloseTo(-1.36603, 4);
  });

  it("is null when the top of the view reaches the horizon", () => {
    expect(groundFootprint([0, Math.SQRT1_2, Math.SQRT1_2], 90, 1)).toBeNull();
  });

  it("widens with the aspect ratio", () => {
    const wide = groundFootprint([0, Math.SQRT1_2, Math.SQRT1_2], 60, 2)!;
    expect(wide.maxX).toBeCloseTo(2 * south45.maxX, 6);
    expect(wide.minZ).toBeCloseTo(south45.minZ, 6);
  });
});

describe("mapBand", () => {
  it("is the strip every column covers: from the top of row 0 of the odd columns to the bottom of the last row of the even ones", () => {
    expect(mapBand(18)).toEqual({ minZ: 0, maxZ: SQRT3 * 17.5 });
  });
});

describe("paddedBand", () => {
  it("grows the band by the padding on both sides", () => {
    expect(paddedBand({ minZ: 0, maxZ: 25 }, 2)).toEqual({ minZ: -2, maxZ: 27 });
  });

  it("pads the map band by two rows of sea by default", () => {
    expect(WRAP_BAND_PADDING).toBeCloseTo(2 * SQRT3, 12);
  });
});

describe("maxViewDistance", () => {
  const footprint: GroundFootprint = { minX: -1, maxX: 1, minZ: -2, maxZ: 0.5 };

  it("is the distance at which the view is exactly as tall as the band", () => {
    expect(maxViewDistance(footprint, { minZ: 0, maxZ: 25 }, 100)).toBe(10);
  });

  it("never exceeds the zoom-out limit", () => {
    expect(maxViewDistance(footprint, { minZ: 0, maxZ: 25 }, 8)).toBe(8);
  });
});

describe("clampFocusZ", () => {
  const footprint: GroundFootprint = { minX: -1, maxX: 1, minZ: -2, maxZ: 0.5 };
  const band = { minZ: 0, maxZ: 25 };

  it("leaves a focus whose view is inside the band alone", () => {
    expect(clampFocusZ(10, 4, footprint, band)).toBe(10);
  });

  it("stops the top of the view at the north edge", () => {
    // At distance 4 the view reaches 8 north of the focus.
    expect(clampFocusZ(3, 4, footprint, band)).toBe(8);
  });

  it("stops the bottom of the view at the south edge", () => {
    // ... and 2 south of it.
    expect(clampFocusZ(24.5, 4, footprint, band)).toBe(23);
  });

  it("centres the view when it is taller than the band", () => {
    // At distance 12 the view spans focus − 24 … focus + 6; centred on 12.5, the focus is 21.5.
    expect(clampFocusZ(3, 12, footprint, band)).toBe(21.5);
  });
});

describe("the game's camera on a wrapping map", () => {
  // As Board.tsx wires it: zoom-out is capped so the view fits the hex rows,
  // while the focus is clamped to the band padded with sea past the rows.
  for (const aspect of [0.5, 1, 16 / 9, 21 / 9, 4]) {
    for (const preset of MAP_PRESETS) {
      const footprint = groundFootprint(CAMERA_OFFSET, CAMERA_FOV, aspect)!;
      const hexBand = mapBand(preset.rows);
      const band = paddedBand(hexBand, WRAP_BAND_PADDING);
      const d = maxViewDistance(footprint, hexBand, CAMERA_MAX_DISTANCE);
      const label = `the ${preset.id} map at aspect ${aspect.toFixed(2)}`;

      it(`never shows past the sea margin north or south of ${label}`, () => {
        for (const focus of [-50, band.minZ, (band.minZ + band.maxZ) / 2, band.maxZ, 200]) {
          const z = clampFocusZ(focus, d, footprint, band);
          expect(z + d * footprint.minZ).toBeGreaterThanOrEqual(band.minZ - 1e-9);
          expect(z + d * footprint.maxZ).toBeLessThanOrEqual(band.maxZ + 1e-9);
        }
      });

      it(`can still pan north–south at full zoom-out on ${label}`, () => {
        const north = clampFocusZ(-1000, d, footprint, band);
        const south = clampFocusZ(1000, d, footprint, band);
        // The sea margin is the slack: two rows north plus two rows south.
        expect(south - north).toBeGreaterThanOrEqual(2 * WRAP_BAND_PADDING - 1e-9);
      });

      it(`still fits every row on screen at full zoom-out on ${label}`, () => {
        // Unless the general zoom-out limit kicks in first (large map, wide screens).
        if (d >= CAMERA_MAX_DISTANCE) return;
        // The focus whose view is centred on the rows is allowed ...
        const centred = (hexBand.minZ + hexBand.maxZ) / 2 - (d * (footprint.minZ + footprint.maxZ)) / 2;
        const z = clampFocusZ(centred, d, footprint, band);
        expect(z).toBeCloseTo(centred, 9);
        // ... and from it the view reaches the top row and the bottom row.
        expect(z + d * footprint.minZ).toBeLessThanOrEqual(hexBand.minZ + 1e-9);
        expect(z + d * footprint.maxZ).toBeGreaterThanOrEqual(hexBand.maxZ - 1e-9);
      });

      it(`keeps the edge of the ocean plane off screen on ${label}`, () => {
        // The plane is centred under the focus, so only the zoom matters.
        const halfSize = oceanPlaneSize(groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, MAX_VIEW_ASPECT)) / 2;
        const reachX = d * Math.max(Math.abs(footprint.minX), Math.abs(footprint.maxX));
        const reachZ = d * Math.max(Math.abs(footprint.minZ), Math.abs(footprint.maxZ));
        expect(reachX).toBeLessThanOrEqual(halfSize);
        expect(reachZ).toBeLessThanOrEqual(halfSize);
      });
    }
  }
});

describe("wrapCopyRange", () => {
  const footprint: GroundFootprint = { minX: -2, maxX: 0.25, minZ: -2, maxZ: 0.5 };

  it("covers the view from any focus in the copy it is centred on", () => {
    // Width 36, distance 10: the view spans focus − 20 … focus + 2.5.
    expect(wrapCopyRange(footprint, 10, 36, 1)).toEqual({ from: -1, to: 1 });
  });

  it("adds copies when the view is wider than the map", () => {
    expect(wrapCopyRange(footprint, 40, 36, 1)).toEqual({ from: -3, to: 1 });
  });
});

describe("seamAwareStart", () => {
  it("leaves the start alone when the move does not cross the seam", () => {
    expect(seamAwareStart(3, 4.5, 36)).toBe(3);
  });

  it("moves the start a wrap width so the ship sails straight across the seam", () => {
    // Last column (x 34.5) to column 0 (x 0): start from x −1.5.
    expect(seamAwareStart(34.5, 0, 36)).toBe(-1.5);
    expect(seamAwareStart(0, 34.5, 36)).toBe(36);
  });

  it("brings back a ship that drifted whole wrap widths away", () => {
    expect(seamAwareStart(-1.5 + 72, 0, 36)).toBe(-1.5);
  });

  it("does nothing without a wrap", () => {
    expect(seamAwareStart(34.5, 0, Infinity)).toBe(34.5);
  });
});

describe("copyShiftToward", () => {
  it("is 0 when the anchor's own copy is nearest the pointer", () => {
    expect(copyShiftToward(10, 12, 75)).toBe(0);
  });

  it("moves to the copy under the pointer when the view shows two copies", () => {
    // Ultra-wide view on the large map: the ship at x 10 also shows at 85.
    expect(copyShiftToward(10, 84, 75)).toBe(75);
    expect(copyShiftToward(10, -66, 75)).toBe(-75);
  });

  it("is 0 without a wrap", () => {
    expect(copyShiftToward(10, 84, Infinity)).toBe(0);
  });
});
