import { describe, it, expect } from "vitest";
import { BUILDING_KINDS } from "./buildingGeometry";
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

const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("agedBuildingColors", () => {
  it("keeps every colour of every kind in [0, 1]", () => {
    for (const kind of BUILDING_KINDS) {
      for (const c of Object.values(agedBuildingColors(kind))) {
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

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

  it("whitewashes the church a shade brighter than the houses' lime render, still warm, not a clean cool white", () => {
    const church = agedBuildingColors("church");
    const house = agedBuildingColors("house");
    expect(luminance(church.wall)).toBeGreaterThan(luminance(house.wall) * 1.03);
    expect(luminance(church.wall)).toBeLessThan(luminance(house.wall) * 1.25);
    // Warm: red over blue.
    expect(church.wall[0]).toBeGreaterThan(church.wall[2] * 1.1);
    expect(church.roof).toEqual(house.roof);
  });

  it("gives the church grey-ochre stone, dark timber, near-black iron and a bronze for the bells", () => {
    const church = agedBuildingColors("church");
    const tower = agedBuildingColors("watchtower");
    // The quoin stone leans ochre against the tower's grey-brown blocks.
    expect(church.stone[0] / church.stone[2]).toBeGreaterThan(tower.stone[0] / tower.stone[2]);
    expect(luminance(church.timber)).toBeLessThan(0.1);
    expect(luminance(church.iron)).toBeLessThan(0.02);
    // Bronze: a dark warm metal, red over green over blue, darker than the stone.
    expect(church.bronze[0]).toBeGreaterThan(church.bronze[1]);
    expect(church.bronze[1]).toBeGreaterThan(church.bronze[2]);
    expect(luminance(church.bronze)).toBeLessThan(luminance(church.stone));
    expect(luminance(church.bronze)).toBeGreaterThan(luminance(church.timber));
  });
});
