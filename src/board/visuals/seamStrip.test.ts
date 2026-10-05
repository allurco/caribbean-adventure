import { describe, expect, it } from "vitest";
import { createWrap, hexRect, hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { seamStrip, withSeamImages, wrapIntoStrip } from "./seamStrip";

const water = (columns: number, rows: number): MapCell[] =>
  hexRect(columns, rows).map((hex) => ({ hex, terrain: "water", hasPort: false, elevation: 0 }));

describe("seamStrip", () => {
  it("is one wrap width wide, starting half a column west of column 0", () => {
    // 24 columns, 1.5 units apart
    expect(seamStrip(createWrap(24))).toEqual({ minX: -0.75, width: 36 });
  });

  it("is null without a wrap", () => {
    expect(seamStrip(null)).toBeNull();
  });
});

describe("wrapIntoStrip", () => {
  const strip = { minX: -0.75, width: 36 };

  it("leaves a point inside the strip alone", () => {
    expect(wrapIntoStrip(10, strip)).toBe(10);
    expect(wrapIntoStrip(-0.75, strip)).toBe(-0.75);
  });

  it("moves a point by whole wrap widths into the strip", () => {
    expect(wrapIntoStrip(36.25, strip)).toBeCloseTo(0.25, 12);
    expect(wrapIntoStrip(-1, strip)).toBeCloseTo(35, 12);
    expect(wrapIntoStrip(10 + 5 * 36, strip)).toBeCloseTo(10, 9);
  });
});

describe("withSeamImages", () => {
  it("keeps every cell and adds the images of cells near either edge, one wrap width away", () => {
    const columns = 24;
    const cells = water(columns, 4);
    const out = withSeamImages(cells, createWrap(columns), 3);
    expect(out.slice(0, cells.length)).toEqual(cells);
    const images = out.slice(cells.length);
    // Column 0..1 (x 0, 1.5) shift east to x 36, 37.5; columns 22..23 (x 33, 34.5) shift west to -3, -1.5.
    const xs = [...new Set(images.map((c) => hexToWorld(c.hex)[0]))].sort((a, b) => a - b);
    expect(xs).toEqual([-3, -1.5, 36, 37.5]);
    // An image keeps the cell's data and its row (world z).
    const image = images.find((c) => hexToWorld(c.hex)[0] === 36)!;
    const original = cells.find((c) => c.hex.q === 0 && hexToWorld(c.hex)[2] === hexToWorld(image.hex)[2])!;
    expect({ ...image, hex: original.hex }).toEqual(original);
  });

  it("adds nothing without a wrap", () => {
    const cells = water(6, 3);
    expect(withSeamImages(cells, null, 3)).toBe(cells);
  });
});
