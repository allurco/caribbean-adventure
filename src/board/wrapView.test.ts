import { describe, expect, it } from "vitest";
import {
  clampFocusToBand,
  copyShiftToward,
  groundFootprint,
  mapBand,
  seamAwareStart,
  wrapCopyRange,
  type GroundFootprint,
} from "./wrapView";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_DIRECTION } from "./cameraBounds";
import { OCEAN_GRID_BASE_CELL, OCEAN_GRID_RINGS, oceanGridCoverage } from "./visuals/oceanGrid";
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

  describe("of the game camera", () => {
    // Due south of the focus, looking north (#36): the footprint is a
    // trapezium symmetric about the focus in x, reaching further north (−z,
    // the far edge of a pitched view) than south.
    const footprint = groundFootprint(CAMERA_DIRECTION, CAMERA_FOV, 16 / 9)!;

    it("is symmetric in x about the focus", () => {
      expect(footprint.minX).toBeCloseTo(-footprint.maxX, 12);
    });

    it("reaches further north of the focus than south", () => {
      expect(footprint.maxZ).toBeGreaterThan(0);
      expect(footprint.minZ).toBeLessThan(0);
      expect(-footprint.minZ).toBeGreaterThan(footprint.maxZ);
    });
  });
});

describe("mapBand", () => {
  it("is the strip every column covers: from the top of row 0 of the odd columns to the bottom of the last row of the even ones", () => {
    expect(mapBand(18)).toEqual({ minZ: 0, maxZ: SQRT3 * 17.5 });
  });
});

describe("clampFocusToBand", () => {
  const band = { minZ: 0, maxZ: 25 };

  it("leaves a focus inside the band alone", () => {
    expect(clampFocusToBand(10, band)).toBe(10);
  });

  it("stops the focus at the north edge", () => {
    expect(clampFocusToBand(-3, band)).toBe(0);
  });

  it("stops the focus at the south edge", () => {
    expect(clampFocusToBand(31, band)).toBe(25);
  });

  it("lets the focus sit exactly on either edge", () => {
    expect(clampFocusToBand(0, band)).toBe(0);
    expect(clampFocusToBand(25, band)).toBe(25);
  });
});

describe("the game's camera on a wrapping map", () => {
  // As Board.tsx wires it: the zoom-out cap is CAMERA_MAX_DISTANCE on every
  // map and the focus itself is clamped to the band of hexes, Civ style: the
  // view can be pulled until a map edge reaches the screen centre, whatever
  // the zoom, with open sea filling the rest.
  const SMALL_ROWS = 18;
  const SIXTEEN_NINE = 16 / 9;
  const zooms = [4, 8, 12, 16, 20, 24, CAMERA_MAX_DISTANCE];

  for (const aspect of [0.5, 1, SIXTEEN_NINE, 21 / 9, 4]) {
    for (const preset of MAP_PRESETS) {
      const footprint = groundFootprint(CAMERA_DIRECTION, CAMERA_FOV, aspect)!;
      const viewHeightPerUnit = footprint.maxZ - footprint.minZ;
      const band = mapBand(preset.rows);
      const label = `the ${preset.id} map at aspect ${aspect.toFixed(2)}`;

      it(`never lets the focus leave the rows of ${label}`, () => {
        for (const focus of [-1000, -50, band.minZ, (band.minZ + band.maxZ) / 2, band.maxZ, 200, 1000]) {
          const z = clampFocusToBand(focus, band);
          expect(z).toBeGreaterThanOrEqual(band.minZ);
          expect(z).toBeLessThanOrEqual(band.maxZ);
        }
      });

      it(`brings the top and bottom rows to the screen centre at every zoom on ${label}`, () => {
        // The clamp does not depend on the zoom or the view: pulled as far
        // north as allowed the focus is on the top edge of row 0 ...
        const north = clampFocusToBand(-1000, band);
        expect(north).toBe(band.minZ);
        // ... and as far south, on the bottom edge of the last row, so at
        // every zoom the view past the focus shows open sea beyond the rows.
        const south = clampFocusToBand(1000, band);
        expect(south).toBe(band.maxZ);
        for (const d of zooms) {
          expect(north + d * footprint.minZ).toBeLessThan(band.minZ);
          expect(south + d * footprint.maxZ).toBeGreaterThan(band.maxZ);
        }
      });

      it(`fits every row on screen at once at full zoom-out on ${label} when the view is tall enough`, () => {
        const d = CAMERA_MAX_DISTANCE;
        // The large map is taller than the view at 16:9 and wider.
        if (d * viewHeightPerUnit < band.maxZ - band.minZ) return;
        // From the allowed focus nearest the one that centres the rows on
        // screen (the view reaches further north of the focus than south, so
        // on a very wide screen that one is past the bottom row) the view
        // still reaches the top row and the bottom row.
        const centred = (band.minZ + band.maxZ) / 2 - (d * (footprint.minZ + footprint.maxZ)) / 2;
        const z = clampFocusToBand(centred, band);
        expect(z + d * footprint.minZ).toBeLessThanOrEqual(band.minZ + 1e-9);
        expect(z + d * footprint.maxZ).toBeGreaterThanOrEqual(band.maxZ - 1e-9);
      });

      it(`keeps the edge of the ocean grid off screen at full zoom-out on ${label} with the focus at either edge of the rows`, () => {
        const d = CAMERA_MAX_DISTANCE;
        const halfSize = oceanGridCoverage(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL);
        for (const focus of [clampFocusToBand(-1000, band), clampFocusToBand(1000, band)]) {
          // The grid is centred under the focus (to within its snap) and follows it.
          const plane = { minZ: focus - halfSize, maxZ: focus + halfSize, minX: -halfSize, maxX: halfSize };
          expect(focus + d * footprint.minZ).toBeGreaterThanOrEqual(plane.minZ);
          expect(focus + d * footprint.maxZ).toBeLessThanOrEqual(plane.maxZ);
          expect(d * footprint.minX).toBeGreaterThanOrEqual(plane.minX);
          expect(d * footprint.maxX).toBeLessThanOrEqual(plane.maxX);
        }
      });
    }
  }

  it("zooms out to the same distance on every map size", () => {
    // Civ style: the cap does not shrink with the map; a small map shows open
    // sea past its top and bottom rows at full zoom-out instead.
    const footprint = groundFootprint(CAMERA_DIRECTION, CAMERA_FOV, SIXTEEN_NINE)!;
    const band = mapBand(SMALL_ROWS);
    const d = CAMERA_MAX_DISTANCE;
    // The focus that centres the rows on screen (the view reaches further
    // north of the focus than south).
    const centred = (band.minZ + band.maxZ) / 2 - (d * (footprint.minZ + footprint.maxZ)) / 2;
    const z = clampFocusToBand(centred, band);
    // Measured: a 16:9 view at distance 28 is ~37.6 units tall against 30.3 of rows.
    expect(z + d * footprint.minZ).toBeLessThan(band.minZ);
    expect(z + d * footprint.maxZ).toBeGreaterThan(band.maxZ);
    expect(d * (footprint.maxZ - footprint.minZ)).toBeGreaterThan(band.maxZ - band.minZ);
  });

  it("draws five copies of the small map at full zoom-out on a 16:9 screen, three of the others", () => {
    // The view is symmetric about the focus (the camera looks due north), so
    // the copies are too: ~68 units of view plus the margin just exceeds two
    // widths of the small map (36).
    const footprint = groundFootprint(CAMERA_DIRECTION, CAMERA_FOV, SIXTEEN_NINE)!;
    const margin = 3; // WRAP_COPY_MARGIN in Board.tsx
    const ranges = MAP_PRESETS.map((preset) =>
      wrapCopyRange(footprint, CAMERA_MAX_DISTANCE, 1.5 * preset.columns, margin)
    );
    expect(ranges).toEqual([
      { from: -2, to: 2 },
      { from: -1, to: 1 },
      { from: -1, to: 1 },
    ]);
  });
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
