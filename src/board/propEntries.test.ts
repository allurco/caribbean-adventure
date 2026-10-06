import { describe, it, expect } from "vitest";
import { concatGeometry, PROP_ENTRIES } from "./propEntries";
import { AGED_BUILDING_TRIANGLES } from "./visuals/agedBuildingGeometry";
import { FLAG_TRIANGLES } from "./visuals/nationFlagGeometry";

describe("PROP_ENTRIES", () => {
  it("builds every entry to whole triangles under distinct labels, the aged settlement among them", () => {
    const labels = PROP_ENTRIES.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const entry of PROP_ENTRIES) {
      const g = entry.build();
      expect(g.vertexCount % 3).toBe(0);
      expect(g.positions).toHaveLength(g.vertexCount * 3);
      expect(g.normals).toHaveLength(g.vertexCount * 3);
      if (g.colors) expect(g.colors).toHaveLength(g.vertexCount * 3);
    }
    for (const piece of ["house, aged", "tavern, aged", "warehouse, aged", "watchtower, aged (Spain)", "church, aged"]) expect(labels).toContain(piece);
  });

  it("shows the aged church at its recorded triangle count", () => {
    const church = PROP_ENTRIES.find((e) => e.label === "church, aged")!.build();
    expect(church.vertexCount / 3).toBe(AGED_BUILDING_TRIANGLES.church);
  });

  it("shows the aged tower with its flag as one piece", () => {
    const tower = PROP_ENTRIES.find((e) => e.label.startsWith("watchtower, aged"))!.build();
    expect(tower.vertexCount / 3).toBe(AGED_BUILDING_TRIANGLES.watchtower + FLAG_TRIANGLES);
  });
});

describe("concatGeometry", () => {
  it("joins two pieces end to end", () => {
    const a = { positions: new Float32Array([1, 2, 3]), normals: new Float32Array([0, 1, 0]), colors: new Float32Array([1, 1, 1]), vertexCount: 1 };
    const b = { positions: new Float32Array([4, 5, 6]), normals: new Float32Array([1, 0, 0]), colors: new Float32Array([0, 0, 0]), vertexCount: 1 };
    const joined = concatGeometry(a, b);
    expect(joined.vertexCount).toBe(2);
    expect([...joined.positions]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...joined.normals]).toEqual([0, 1, 0, 1, 0, 0]);
    expect([...joined.colors]).toEqual([1, 1, 1, 0, 0, 0]);
  });
});
