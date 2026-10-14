import { describe, expect, it } from "vitest";
import { canonicalHex, createWrap, hex, wrappedNeighbors } from "../../game/hex";
import type { Hex, MapWrap } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import type { MapCell } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import type { MapSizeId } from "../../game/mapConfig";
import { cellId, findIslands, islandIdsByCell, portIds } from "./islands";

const SIZES: readonly MapSizeId[] = ["small", "medium", "large"];

const worldOf = (size: MapSizeId, mapSeed: number) => {
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  return { cells: generateMap(preset, mapSeed, wrap), wrap };
};

/** A deterministic shuffle (no Math.random), so reordering tests are reproducible. */
const shuffled = <T>(items: readonly T[], salt: number): T[] => {
  const out = [...items];
  let s = salt >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** The same world with every cell moved to another copy of itself, `k` wraps east. */
const worldCopy = (cells: readonly MapCell[], wrap: NonNullable<MapWrap>, k: number): MapCell[] =>
  cells.map((c) => {
    const q = c.hex.q + k * wrap.columns;
    const r = c.hex.r - (k * wrap.columns) / 2;
    return { ...c, hex: { q, r, s: -q - r } };
  });

describe("cellId", () => {
  it("is the canonical hex key, the same for every copy of a hex", () => {
    const wrap = createWrap(8);
    expect(cellId(hex(3, -1), wrap)).toBe("3,-1");
    expect(cellId(hex(3 + 8, -1 - 4), wrap)).toBe("3,-1");
    expect(cellId(hex(3 - 16, -1 + 8), wrap)).toBe("3,-1");
    expect(cellId(hex(-2, 5), null)).toBe("-2,5");
  });
});

describe("findIslands", () => {
  it("groups adjacent land cells, across the seam, and names each island after its lowest cell", () => {
    const wrap = createWrap(8);
    const land = (h: Hex): MapCell => ({ hex: h, terrain: "island", hasPort: false, elevation: 1 });
    const sea = (h: Hex): MapCell => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 });
    // Column 7 and column 0 touch across the seam: (7,-3) neighbours (0,1) once wrapped.
    const seamA = hex(7, -3);
    const seamB = canonicalHex(wrappedNeighbors(seamA, wrap).find((n) => n.q === 0)!, wrap);
    const cells: MapCell[] = [
      land(seamA),
      land(seamB),
      sea(hex(3, 0)),
      land(hex(4, 0)),
      land(hex(4, 1)),
      { hex: hex(2, 2), terrain: "reef", hasPort: false, elevation: 0 },
    ];
    const islands = findIslands(cells, wrap);
    expect(islands.map((i) => i.id)).toEqual([cellId(seamB, wrap), "4,0"]);
    expect(islands[0].cells.map((h) => cellId(h, wrap)).sort()).toEqual([cellId(seamA, wrap), cellId(seamB, wrap)].sort());
    expect(islands[1].cells).toEqual([hex(4, 0), hex(4, 1)]);
  });

  for (const size of SIZES) {
    it(`puts every land cell of a ${size} map in exactly one island, and no sea cell in any`, () => {
      for (const mapSeed of [1, 2, 3]) {
        const { cells, wrap } = worldOf(size, mapSeed);
        const islands = findIslands(cells, wrap);
        const counts = new Map<string, number>();
        for (const island of islands) {
          for (const h of island.cells) counts.set(cellId(h, wrap), (counts.get(cellId(h, wrap)) ?? 0) + 1);
        }
        const landIds = cells.filter((c) => c.terrain === "island").map((c) => cellId(c.hex, wrap));
        expect([...counts.keys()].sort()).toEqual([...landIds].sort());
        expect([...counts.values()].every((n) => n === 1)).toBe(true);
        // Each island's id is one of its own cells.
        for (const island of islands) {
          expect(island.cells.map((h) => cellId(h, wrap))).toContain(island.id);
        }
      }
    });
  }

  it("gives the same islands and ids when G.cells is reordered", () => {
    for (const size of SIZES) {
      const { cells, wrap } = worldOf(size, 11);
      const reference = findIslands(cells, wrap);
      for (const salt of [1, 2, 3]) {
        expect(findIslands(shuffled(cells, salt), wrap)).toEqual(reference);
      }
    }
  });

  it("gives the same islands and ids on every world copy", () => {
    const { cells, wrap } = worldOf("medium", 5);
    const reference = findIslands(cells, wrap);
    for (const k of [-2, -1, 1, 3]) {
      expect(findIslands(worldCopy(cells, wrap, k), wrap)).toEqual(reference);
    }
  });

  it("S1: the same seed and size give deep-equal islands, computed afresh", () => {
    for (const size of SIZES) {
      const a = worldOf(size, 31337);
      const b = worldOf(size, 31337);
      expect(findIslands(b.cells, b.wrap)).toEqual(findIslands(a.cells, a.wrap));
    }
  });

  it("S2: different seeds give different archipelagos (island ids differ)", () => {
    for (const size of SIZES) {
      const a = worldOf(size, 1);
      const b = worldOf(size, 2);
      const idsA = findIslands(a.cells, a.wrap).map((i) => i.id);
      const idsB = findIslands(b.cells, b.wrap).map((i) => i.id);
      expect(idsB).not.toEqual(idsA);
    }
  });
});

describe("islandIdsByCell", () => {
  it("maps every land cell id to its island's id", () => {
    const { cells, wrap } = worldOf("small", 7);
    const islands = findIslands(cells, wrap);
    const byCell = islandIdsByCell(islands, wrap);
    for (const island of islands) {
      for (const h of island.cells) expect(byCell.get(cellId(h, wrap))).toBe(island.id);
    }
    expect(byCell.size).toBe(cells.filter((c) => c.terrain === "island").length);
  });
});

describe("portIds", () => {
  it("names every port by its cell's canonical key, in a stable order, the same on reordered cells and world copies", () => {
    const { cells, wrap } = worldOf("medium", 9);
    const ids = portIds(cells, wrap);
    expect(ids.length).toBe(cells.filter((c) => c.hasPort).length);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(cells.filter((c) => c.hasPort).map((c) => cellId(c.hex, wrap)).sort());
    expect(portIds(shuffled(cells, 4), wrap)).toEqual(ids);
    expect(portIds(worldCopy(cells, wrap, -1), wrap)).toEqual(ids);
  });
});
