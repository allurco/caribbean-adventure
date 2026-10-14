import { describe, expect, it } from "vitest";
import { canonicalHex, createWrap, hex, hexDistance, hexToWorld, neighbors, type Hex, type MapWrap } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import type { Elevation, MapCell } from "../../game/types";
import { cellId, islandIdsByCell, findIslands, mapCellId } from "./islands";
import { SEED_FEATURES } from "./seedFeatures";
import { MAX_TOWN_SPILL, portTownCells, townCellsBound, townSpillCandidates, type TownCells } from "./townCells";

const land = (q: number, r: number, elevation: Elevation = 2, extra: Partial<MapCell> = {}): MapCell => ({
  hex: hex(q, r),
  terrain: "island",
  hasPort: false,
  elevation,
  ...extra,
});
const water = (q: number, r: number): MapCell => ({ hex: hex(q, r), terrain: "water", hasPort: false, elevation: 0 });
/** A port at (0, 0) with its pier pointing towards `toWater` (radians, as the generator turns it). */
const port = (q: number, r: number, toWater = 0): MapCell =>
  land(q, r, 1, { hasPort: true, decorations: [{ type: "pier", position: [0, 0, 0], rotation: toWater }] });

/** A sea of water round a few land cells. */
function world(landCells: readonly MapCell[]): MapCell[] {
  const byKey = new Map(landCells.map((c) => [`${c.hex.q},${c.hex.r}`, c]));
  const out: MapCell[] = [];
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) out.push(byKey.get(`${q},${r}`) ?? water(q, r));
  return out;
}

const key = (h: Hex) => `${h.q},${h.r}`;

describe("a port's town cells (#170)", () => {
  it("are the port cell first, then only land neighbours of it, elevation 2 or less, on its island", () => {
    const cells = world([port(0, 0), land(1, 0, 2), land(1, -1, 3), land(0, -1, 1), land(-1, 0, 2), land(0, 1, 2), land(-1, 1, 2)]);
    const candidates = townSpillCandidates(cells, null, cells.find((c) => c.hex.q === 0 && c.hex.r === 0)!);
    // The mountain (1, -1) never qualifies.
    expect(candidates.map(key).sort()).toEqual(["-1,0", "-1,1", "0,-1", "0,1", "1,0"]);
  });

  it("never takes another port's cell, nor a cell another port also touches", () => {
    // A second port at (2, -1) touches (1, 0) and (1, -1).
    const cells = world([port(0, 0), land(1, 0, 2), land(1, -1, 2), port(2, -1), land(-1, 0, 2), land(-1, 1, 2), land(0, 1, 2)]);
    const at = (q: number, r: number) => cells.find((c) => c.hex.q === q && c.hex.r === r)!;
    const candidates = townSpillCandidates(cells, null, at(0, 0)).map(key);
    expect(candidates).not.toContain("1,0");
    expect(candidates).not.toContain("1,-1");
    // And the other port's cell itself, were it adjacent.
    const adjacent = world([port(0, 0), port(1, 0), land(0, 1, 2), land(-1, 1, 2)]);
    const at2 = (q: number, r: number) => adjacent.find((c) => c.hex.q === q && c.hex.r === r)!;
    expect(townSpillCandidates(adjacent, null, at2(0, 0)).map(key)).not.toContain("1,0");
  });

  it.each(["small", "medium", "large"] as const)("S3: takes one to MAX_TOWN_SPILL of the candidates on every %s map of 200 seeds", (size) => {
    const preset = getMapPreset(size);
    const wrap = createWrap(preset.columns);
    let spilled = 0;
    let ports = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const cells = generateMap(preset, seed, wrap);
      const towns = portTownCells(cells, wrap, seed);
      for (const cell of cells.filter((c) => c.hasPort)) {
        const town = towns.get(mapCellId(cell))!;
        const candidates = townSpillCandidates(cells, wrap, cell);
        expect(town.cells[0]).toEqual(cell.hex);
        const spill = town.cells.slice(1);
        expect(spill.length).toBeLessThanOrEqual(Math.min(MAX_TOWN_SPILL, candidates.length));
        if (candidates.length > 0) expect(spill.length).toBeGreaterThanOrEqual(1);
        for (const h of spill) {
          expect(hexDistance(h, cell.hex)).toBe(1);
          expect(candidates.map(key)).toContain(key(h));
        }
        ports++;
        if (spill.length > 0) spilled++;
      }
    }
    // Most ports spill onto at least one neighbour.
    expect(spilled / ports).toBeGreaterThan(0.6);
  }, 60_000);

  it("keeps every town cell on the port's island, and no cell in two towns", () => {
    const preset = getMapPreset("medium");
    const wrap = createWrap(preset.columns);
    for (let seed = 1; seed <= 10; seed++) {
      const cells = generateMap(preset, seed, wrap);
      const islandOf = islandIdsByCell(findIslands(cells, wrap), wrap);
      const towns = portTownCells(cells, wrap, seed);
      const owner = new Map<string, string>();
      for (const [portId, town] of towns) {
        for (const h of town.cells) {
          expect(islandOf.get(cellId(h, wrap))).toBe(islandOf.get(portId));
          const id = cellId(h, wrap);
          expect(owner.get(id), `${id} in two towns`).toBeUndefined();
          owner.set(id, portId);
        }
      }
    }
  });

  it("spills across the wrap seam in the port's own world copy", () => {
    const wrap: MapWrap = createWrap(8);
    // The port at column 0; its west neighbour lies in column 7.
    const cells: MapCell[] = [];
    for (let col = 0; col < 8; col++) {
      for (let r = -3; r <= 3; r++) {
        const h = canonicalHex(hex(col, r - Math.floor(col / 2)), wrap);
        cells.push(water(h.q, h.r));
      }
    }
    const set = (c: MapCell) => {
      const i = cells.findIndex((x) => key(x.hex) === key(canonicalHex(c.hex, wrap)));
      cells[i] = { ...c, hex: canonicalHex(c.hex, wrap) };
    };
    set(port(0, 0));
    for (const n of neighbors(hex(0, 0))) set(land(n.q, n.r, 2));
    const town = portTownCells(cells, wrap, 7).get("0,0")!;
    // Every spill cell is a plain neighbour of (0, 0), uncanonicalised, so its world position sits next to the port.
    for (const h of town.cells.slice(1)) expect(hexDistance(h, hex(0, 0))).toBe(1);
  });

  it("S1: the same seed and cells give deep-equal towns", () => {
    const preset = getMapPreset("small");
    const wrap = createWrap(preset.columns);
    const cells = generateMap(preset, 3, wrap);
    expect(portTownCells(structuredClone(cells), wrap, 3)).toEqual(portTownCells(structuredClone(cells), wrap, 3));
  });

  it("S2: another world seed on the same cells spreads the towns differently", () => {
    const preset = getMapPreset("small");
    const wrap = createWrap(preset.columns);
    const cells = generateMap(preset, 3, wrap);
    const signature = (towns: Map<string, TownCells>) => [...towns.values()].map((t) => t.cells.map(key).join(" ")).join(" | ");
    expect(signature(portTownCells(cells, wrap, 3))).not.toBe(signature(portTownCells(cells, wrap, 4)));
  });

  it("draws from its own named sub-seed", () => {
    expect(SEED_FEATURES.townSpill).toBe("townSpill");
  });
});

describe("the town-cells bound (#170)", () => {
  const town: TownCells = { portId: "0,0", cells: [hex(0, 0), hex(1, 0)] };
  const bound = townCellsBound(town);
  const [x1, , z1] = hexToWorld(hex(1, 0));

  it("takes a footprint wholly inside the town cells, across the edge between two of them", () => {
    expect(bound.contains(0, 0, 0.3)).toBe(true);
    // Halfway between the two centres: on their shared edge.
    expect(bound.contains(x1 / 2, z1 / 2, 0.3)).toBe(true);
    expect(bound.contains(x1, z1, 0.3)).toBe(true);
  });

  it("refuses one reaching over the edge of a cell outside the town", () => {
    // The port cell's edge towards (-1, 0) lies √3/2 west-ish of its centre.
    const [xw, , zw] = hexToWorld(hex(-1, 0));
    const half = { x: xw / 2, z: zw / 2 };
    expect(bound.contains(half.x * 0.9, half.z * 0.9, 0.02)).toBe(true);
    expect(bound.contains(half.x * 0.9, half.z * 0.9, 0.2)).toBe(false);
    expect(bound.contains(xw, zw, 0.01)).toBe(false);
  });

  it("tells the port cell from a spilled one", () => {
    expect(bound.inPortCell(0.1, 0.1)).toBe(true);
    expect(bound.inPortCell(x1, z1)).toBe(false);
  });

  it("matches the old one-hex rule for a town of the port cell alone", () => {
    const alone = townCellsBound({ portId: "0,0", cells: [hex(0, 0)] });
    const SQRT3 = Math.sqrt(3);
    const edgeNormals = neighbors(hex(0, 0)).map((n) => {
      const [nx, , nz] = hexToWorld(n);
      return [nx / SQRT3, nz / SQRT3];
    });
    for (let i = 0; i < 400; i++) {
      const x = Math.sin(i * 1.7) * 0.95;
      const z = Math.cos(i * 2.3) * 0.95;
      const reach = 0.02 + (i % 7) * 0.03;
      const old = edgeNormals.every(([ux, uz]) => x * ux + z * uz <= SQRT3 / 2 - reach);
      expect(alone.contains(x, z, reach)).toBe(old);
    }
  });
});
