import { describe, it, expect } from "vitest";
import {
  MAP_PRESETS,
  DEFAULT_MAP_SIZE,
  getMapPreset,
  computeCameraConfig,
  mapWorldBounds,
} from "./mapConfig";
import type { MapSizeId } from "./mapConfig";
import { createWrap, hexRect, hexToWorld } from "./hex";

describe("MAP_PRESETS", () => {
  it("has exactly three presets", () => {
    expect(MAP_PRESETS).toHaveLength(3);
  });

  it("presets are ordered small, medium, large", () => {
    expect(MAP_PRESETS[0].id).toBe("small");
    expect(MAP_PRESETS[1].id).toBe("medium");
    expect(MAP_PRESETS[2].id).toBe("large");
  });

  it("are rectangles of 24×18, 36×28 and 50×38 hexes", () => {
    expect(getMapPreset("small")).toMatchObject({ columns: 24, rows: 18 });
    expect(getMapPreset("medium")).toMatchObject({ columns: 36, rows: 28 });
    expect(getMapPreset("large")).toMatchObject({ columns: 50, rows: 38 });
  });

  it("every preset is an even number of columns wide, so it can wrap east–west", () => {
    for (const preset of MAP_PRESETS) {
      expect(preset.columns % 2).toBe(0);
      expect(() => createWrap(preset.columns)).not.toThrow();
    }
  });

  it("keeps about the hex count of the old hexagonal maps (radius 12, 18, 25)", () => {
    const hexagonCells = (radius: number) => 3 * radius * (radius + 1) + 1;
    const oldRadii = [12, 18, 25];
    MAP_PRESETS.forEach((preset, i) => {
      const ratio = (preset.columns * preset.rows) / hexagonCells(oldRadii[i]);
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(1.15);
    });
  });

  it("grow with each preset", () => {
    for (let i = 1; i < MAP_PRESETS.length; i++) {
      expect(MAP_PRESETS[i].columns).toBeGreaterThan(MAP_PRESETS[i - 1].columns);
      expect(MAP_PRESETS[i].rows).toBeGreaterThan(MAP_PRESETS[i - 1].rows);
    }
  });

  it("every preset has a non-empty label", () => {
    for (const preset of MAP_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_MAP_SIZE", () => {
  it("is a valid map size id", () => {
    const ids = MAP_PRESETS.map((p) => p.id);
    expect(ids).toContain(DEFAULT_MAP_SIZE);
  });

  it("defaults to small", () => {
    expect(DEFAULT_MAP_SIZE).toBe("small");
  });
});

describe("getMapPreset", () => {
  it("returns the correct preset for each size", () => {
    const sizes: MapSizeId[] = ["small", "medium", "large"];
    for (const size of sizes) {
      const preset = getMapPreset(size);
      expect(preset.id).toBe(size);
    }
  });
});

describe("mapWorldBounds", () => {
  it("is the extent of the rectangle's cell centres in world XZ", () => {
    for (const preset of MAP_PRESETS) {
      const xs: number[] = [];
      const zs: number[] = [];
      for (const h of hexRect(preset.columns, preset.rows)) {
        const [x, , z] = hexToWorld(h);
        xs.push(x);
        zs.push(z);
      }
      const bounds = mapWorldBounds(preset);
      expect(bounds.minX).toBeCloseTo(Math.min(...xs));
      expect(bounds.maxX).toBeCloseTo(Math.max(...xs));
      expect(bounds.minZ).toBeCloseTo(Math.min(...zs));
      expect(bounds.maxZ).toBeCloseTo(Math.max(...zs));
    }
  });
});

describe("computeCameraConfig", () => {
  it("returns positive height and offset", () => {
    const config = computeCameraConfig(getMapPreset("small"));
    expect(config.height).toBeGreaterThan(0);
    expect(config.offset).toBeGreaterThan(0);
  });

  it("minDistance is less than maxDistance", () => {
    for (const preset of MAP_PRESETS) {
      const config = computeCameraConfig(preset);
      expect(config.minDistance).toBeLessThan(config.maxDistance);
    }
  });

  it("minDistance is positive", () => {
    for (const preset of MAP_PRESETS) {
      const config = computeCameraConfig(preset);
      expect(config.minDistance).toBeGreaterThan(0);
    }
  });

  it("scales with the map — a larger map produces larger values", () => {
    const small = computeCameraConfig(getMapPreset("small"));
    const large = computeCameraConfig(getMapPreset("large"));
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.maxDistance).toBeGreaterThan(small.maxDistance);
  });

  it("frames the same world size as the old hexagons (diameter 36, 54, 75)", () => {
    // The old radius-R hexagon spanned 3R world units east–west; the rectangles
    // are 1.5 units per column wide, so the camera keeps its old framing.
    expect(computeCameraConfig(getMapPreset("small")).isoDistance).toBeCloseTo(36 * 0.8);
    expect(computeCameraConfig(getMapPreset("medium")).isoDistance).toBeCloseTo(54 * 0.8);
    expect(computeCameraConfig(getMapPreset("large")).isoDistance).toBeCloseTo(75 * 0.8);
  });

  it("targets the centre of the map", () => {
    for (const preset of MAP_PRESETS) {
      const bounds = mapWorldBounds(preset);
      const { target } = computeCameraConfig(preset);
      expect(target[0]).toBeCloseTo((bounds.minX + bounds.maxX) / 2);
      expect(target[1]).toBe(0);
      expect(target[2]).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2);
    }
  });
});
