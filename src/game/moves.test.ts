import { describe, it, expect } from "vitest";
import { validMoveTargets, findAccessiblePort } from "./moves";
import { hex, hexEquals, hexRect, offsetToHex, createWrap, NO_WRAP } from "./hex";
import type { MapCell } from "./mapGenerator";

function cell(q: number, r: number, terrain: "water" | "island" = "water", hasPort = false): MapCell {
  return { hex: hex(q, r), terrain, hasPort, elevation: terrain === "water" ? 0 : 2 };
}

describe("validMoveTargets", () => {
  it("returns all adjacent cells that exist on the map", () => {
    const cells: MapCell[] = [
      cell(0, 0),
      cell(1, 0),
      cell(0, 1),
      cell(-1, 1),
      cell(-1, 0),
      cell(0, -1),
      cell(1, -1),
    ];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(6);
  });

  it("excludes hexes that are not on the map", () => {
    // Only two neighbors present on the map
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
  });

  it("returns empty array when ship is isolated (no adjacent cells on map)", () => {
    const cells: MapCell[] = [cell(0, 0), cell(3, 3)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(0);
  });

  it("does not include the ship's own position", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets.some((h) => hexEquals(h, hex(0, 0)))).toBe(false);
  });

  it("works for a non-origin position", () => {
    const cells: MapCell[] = [cell(2, -1), cell(3, -1), cell(2, 0)];
    const targets = validMoveTargets(hex(2, -1), cells, NO_WRAP);
    expect(targets).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, hex(3, -1)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(2, 0)))).toBe(true);
  });

  it("water neighbors are always valid targets", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(2);
  });

  it("island neighbors with hasPort are NOT valid targets (ships dock at water)", () => {
    // With the new docking mechanic, ships stay on water and access ports
    // from the docking hex - they cannot move onto island tiles
    const cells: MapCell[] = [cell(0, 0), cell(1, 0, "island", true)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(0);
  });

  it("island neighbors without hasPort are excluded", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0, "island")];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(0);
  });

  it("mixed scenario: only water is returned, islands are blocked", () => {
    // With the new docking mechanic, only water hexes are valid move targets
    // (plus reefs for shallow-draft ships, but not tested here)
    const cells: MapCell[] = [
      cell(0, 0),
      cell(1, 0),                      // water — valid
      cell(0, 1, "island", true),       // port island — blocked (ships dock from water)
      cell(-1, 1, "island"),            // plain island — blocked
      cell(-1, 0),                      // water — valid
    ];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(false); // port island blocked
    expect(targets.some((h) => hexEquals(h, hex(-1, 0)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(-1, 1)))).toBe(false);
  });

  it("excludes hexes occupied by other ships", () => {
    const cells: MapCell[] = [
      cell(0, 0),
      cell(1, 0),
      cell(0, 1),
      cell(-1, 1),
      cell(-1, 0),
      cell(0, -1),
      cell(1, -1),
    ];
    const occupied = [hex(1, 0), hex(-1, 0)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, occupied);
    expect(targets).toHaveLength(4);
    expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
    expect(targets.some((h) => hexEquals(h, hex(-1, 0)))).toBe(false);
  });

  it("works with no occupied hexes (default)", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP);
    expect(targets).toHaveLength(2);
  });
});

describe("validMoveTargets on a wrapped map", () => {
  const wrap = createWrap(8);
  const cells: MapCell[] = hexRect(8, 4).map((h) => cell(h.q, h.r));

  it("offers the west-edge hexes from an east-edge hex", () => {
    const eastEdge = offsetToHex(7, 1);
    const targets = validMoveTargets(eastEdge, cells, wrap);
    expect(targets).toHaveLength(6);
    expect(targets.filter((h) => h.q === 0)).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, offsetToHex(0, 1)))).toBe(true);
  });

  it("offers the east-edge hexes from a west-edge hex", () => {
    const targets = validMoveTargets(offsetToHex(0, 2), cells, wrap);
    expect(targets).toHaveLength(6);
    expect(targets.filter((h) => h.q === 7)).toHaveLength(2);
  });

  it("respects ships blocking the far side of the seam", () => {
    const targets = validMoveTargets(offsetToHex(7, 1), cells, wrap, [offsetToHex(0, 1)]);
    expect(targets.some((h) => hexEquals(h, offsetToHex(0, 1)))).toBe(false);
  });

  it("does not cross the seam with no wrap", () => {
    const targets = validMoveTargets(offsetToHex(7, 1), cells, NO_WRAP);
    expect(targets.some((h) => h.q === 0)).toBe(false);
  });
});

describe("findAccessiblePort on a wrapped map", () => {
  it("matches a docking hex given as any copy across the seam", () => {
    const wrap = createWrap(8);
    const port: MapCell = { ...cell(1, 0, "island", true), dockingHex: hex(0, 0) };
    const cells: MapCell[] = [cell(0, 0), port];
    expect(findAccessiblePort(hex(8, -4), cells, wrap)).toBe(port);
    expect(findAccessiblePort(hex(8, -4), cells, NO_WRAP)).toBeUndefined();
  });
});
