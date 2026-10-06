import { describe, it, expect } from "vitest";
import { agedBuildingColors } from "./agedBuildingColors";
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

const close = (a: Rgb, b: Rgb) => {
  for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k], 9);
};

describe("agedBuildingColors", () => {
  it("walls the warehouse in bleached plank and the house and tavern in lime render (#59)", () => {
    close(agedBuildingColors("warehouse").wall, rgb("bleachedPlank"));
    close(agedBuildingColors("house").wall, rgb("limewash"));
    close(agedBuildingColors("tavern").wall, rgb("limewash"));
    close(agedBuildingColors("watchtower").wall, rgb("limewash"));
  });

  it("keeps the warehouse's fittings and roof the shared timber and tiles", () => {
    const warehouse = agedBuildingColors("warehouse");
    close(warehouse.timber, rgb("oldTimber"));
    close(warehouse.roof, rgb("oldTerracotta"));
    close(warehouse.stone, rgb("roughStone"));
    close(warehouse.iron, rgb("ironwork"));
    // The plank reads clearly against the fittings it frames.
    const lum = (c: Rgb) => (c[0] + c[1] + c[2]) / 3;
    expect(lum(warehouse.wall)).toBeGreaterThan(lum(warehouse.timber) * 2);
  });
});
