import { describe, it, expect } from "vitest";
import { validMoveTargets } from "./moves";
import { hex, hexEquals } from "./hex";
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
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(6);
  });

  it("excludes hexes that are not on the map", () => {
    // Only two neighbors present on the map
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
  });

  it("returns empty array when ship is isolated (no adjacent cells on map)", () => {
    const cells: MapCell[] = [cell(0, 0), cell(3, 3)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(0);
  });

  it("does not include the ship's own position", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets.some((h) => hexEquals(h, hex(0, 0)))).toBe(false);
  });

  it("works for a non-origin position", () => {
    const cells: MapCell[] = [cell(2, -1), cell(3, -1), cell(2, 0)];
    const targets = validMoveTargets(hex(2, -1), cells);
    expect(targets).toHaveLength(2);
    expect(targets.some((h) => hexEquals(h, hex(3, -1)))).toBe(true);
    expect(targets.some((h) => hexEquals(h, hex(2, 0)))).toBe(true);
  });

  it("water neighbors are always valid targets", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(2);
  });

  it("island neighbors with hasPort are NOT valid targets (ships dock at water)", () => {
    // With the new docking mechanic, ships stay on water and access ports
    // from the docking hex - they cannot move onto island tiles
    const cells: MapCell[] = [cell(0, 0), cell(1, 0, "island", true)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(0);
  });

  it("island neighbors without hasPort are excluded", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0, "island")];
    const targets = validMoveTargets(hex(0, 0), cells);
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
    const targets = validMoveTargets(hex(0, 0), cells);
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
    const targets = validMoveTargets(hex(0, 0), cells, occupied);
    expect(targets).toHaveLength(4);
    expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
    expect(targets.some((h) => hexEquals(h, hex(-1, 0)))).toBe(false);
  });

  it("works with no occupied hexes (default)", () => {
    const cells: MapCell[] = [cell(0, 0), cell(1, 0), cell(0, 1)];
    const targets = validMoveTargets(hex(0, 0), cells);
    expect(targets).toHaveLength(2);
  });
});
