import { describe, it, expect } from "vitest";
import { validMoveTargets } from "./moves";
import { hex, hexEquals, neighbors } from "./hex";
import { generateMap } from "./mapGenerator";
import type { MapCell } from "./types";
import { SHIP_SPECS } from "./constants";

function cell(
  q: number,
  r: number,
  terrain: "water" | "island" | "reef" = "water",
  hasPort = false
): MapCell {
  return { hex: hex(q, r), terrain, hasPort };
}

describe("reef terrain mechanics", () => {
  describe("validMoveTargets with shallowDraft", () => {
    it("shallow-draft ship (Sloop) can enter reef", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
        cell(0, 1),
      ];
      // Sloop has shallowDraft: true
      const targets = validMoveTargets(hex(0, 0), cells, [], true);
      expect(targets).toHaveLength(2);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    });

    it("deep-draft ship (Galleon) cannot enter reef", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
        cell(0, 1),
      ];
      // Galleon has shallowDraft: false
      const targets = validMoveTargets(hex(0, 0), cells, [], false);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
      expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
    });

    it("Flute (shallow-draft) can enter reef", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
      ];
      const shallowDraft = SHIP_SPECS["Flute"].shallowDraft;
      const targets = validMoveTargets(hex(0, 0), cells, [], shallowDraft);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    });

    it("Frigate (deep-draft) cannot enter reef", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
      ];
      const shallowDraft = SHIP_SPECS["Frigate"].shallowDraft;
      const targets = validMoveTargets(hex(0, 0), cells, [], shallowDraft);
      expect(targets).toHaveLength(0);
    });

    it("reef is not the same as water - both exist separately", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
        cell(0, 1, "water"),
        cell(-1, 1, "island"),
      ];
      // Deep-draft ship: can enter water, cannot enter reef or island
      const targets = validMoveTargets(hex(0, 0), cells, [], false);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
    });

    it("reef with occupied hex is still blocked", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
        cell(0, 1, "reef"),
      ];
      const occupied = [hex(1, 0)];
      const targets = validMoveTargets(hex(0, 0), cells, occupied, true);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
      expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
    });
  });

  describe("reef generation in maps", () => {
    it("reefs only spawn adjacent to islands (coastal hexes)", () => {
      // Use a fixed seed for deterministic testing
      const map = generateMap(5, 42);

      // Find all reef hexes
      const reefCells = map.filter((c) => c.terrain === "reef");
      const islandHexSet = new Set(
        map.filter((c) => c.terrain === "island").map((c) => `${c.hex.q},${c.hex.r}`)
      );

      // Every reef must be adjacent to at least one island
      for (const reef of reefCells) {
        const adjacentToIsland = neighbors(reef.hex).some((n) =>
          islandHexSet.has(`${n.q},${n.r}`)
        );
        expect(adjacentToIsland).toBe(true);
      }
    });

    it("reefs are not islands and not water", () => {
      const map = generateMap(5, 42);
      const reefCells = map.filter((c) => c.terrain === "reef");

      // Should have some reefs
      expect(reefCells.length).toBeGreaterThan(0);

      // No reef should be an island or water
      for (const reef of reefCells) {
        expect(reef.terrain).toBe("reef");
        expect(reef.terrain).not.toBe("island");
        expect(reef.terrain).not.toBe("water");
      }
    });

    it("same seed produces same reef placement", () => {
      const map1 = generateMap(5, 123);
      const map2 = generateMap(5, 123);

      const reefs1 = map1
        .filter((c) => c.terrain === "reef")
        .map((c) => `${c.hex.q},${c.hex.r}`)
        .sort();
      const reefs2 = map2
        .filter((c) => c.terrain === "reef")
        .map((c) => `${c.hex.q},${c.hex.r}`)
        .sort();

      expect(reefs1).toEqual(reefs2);
    });

    it("ports have at least one water exit (no reef blocking)", () => {
      // Test with multiple seeds to ensure consistency
      const seeds = [42, 123, 456, 789, 999];

      for (const seed of seeds) {
        const map = generateMap(5, seed);
        const portCells = map.filter((c) => c.hasPort);

        for (const port of portCells) {
          // Find all adjacent hexes
          const adjacentHexes = neighbors(port.hex);

          // Check that at least one adjacent hex is water (not reef, not island)
          const hasWaterExit = adjacentHexes.some((adjHex) => {
            const adjCell = map.find(
              (c) => c.hex.q === adjHex.q && c.hex.r === adjHex.r
            );
            return adjCell && adjCell.terrain === "water";
          });

          expect(hasWaterExit).toBe(true);
        }
      }
    });

    it("hexes adjacent to ports are never reefs", () => {
      const map = generateMap(5, 42);
      const portCells = map.filter((c) => c.hasPort);

      for (const port of portCells) {
        const adjacentHexes = neighbors(port.hex);

        for (const adjHex of adjacentHexes) {
          const adjCell = map.find(
            (c) => c.hex.q === adjHex.q && c.hex.r === adjHex.r
          );
          // Adjacent cells should never be reefs (can be water or island)
          if (adjCell && adjCell.terrain !== "island") {
            expect(adjCell.terrain).toBe("water");
          }
        }
      }
    });
  });

  describe("decoration generation", () => {
    it("island hexes have decorations", () => {
      const map = generateMap(5, 42);
      const islandCells = map.filter((c) => c.terrain === "island");

      // All islands should have decorations
      for (const island of islandCells) {
        expect(island.decorations).toBeDefined();
        expect(island.decorations!.length).toBeGreaterThan(0);
      }
    });

    it("water hexes do not have decorations", () => {
      const map = generateMap(5, 42);
      const waterCells = map.filter((c) => c.terrain === "water");

      for (const water of waterCells) {
        expect(water.decorations).toBeUndefined();
      }
    });

    it("reef hexes do not have decorations", () => {
      const map = generateMap(5, 42);
      const reefCells = map.filter((c) => c.terrain === "reef");

      for (const reef of reefCells) {
        expect(reef.decorations).toBeUndefined();
      }
    });

    it("port hexes have a fort decoration", () => {
      const map = generateMap(5, 42);
      const portCells = map.filter((c) => c.hasPort);

      for (const port of portCells) {
        expect(port.decorations).toBeDefined();
        const hasFort = port.decorations!.some((d) => d.type === "fort");
        expect(hasFort).toBe(true);
      }
    });

    it("port hexes have a pier decoration", () => {
      const map = generateMap(5, 42);
      const portCells = map.filter((c) => c.hasPort);

      for (const port of portCells) {
        expect(port.decorations).toBeDefined();
        const hasPier = port.decorations!.some((d) => d.type === "pier");
        expect(hasPier).toBe(true);
      }
    });

    it("decorations are deterministic with same seed", () => {
      const map1 = generateMap(5, 99);
      const map2 = generateMap(5, 99);

      // Compare decorations on all island hexes
      const islands1 = map1.filter((c) => c.terrain === "island");
      const islands2 = map2.filter((c) => c.terrain === "island");

      expect(islands1.length).toBe(islands2.length);

      for (let i = 0; i < islands1.length; i++) {
        const decos1 = islands1[i].decorations ?? [];
        const decos2 = islands2[i].decorations ?? [];
        expect(decos1.length).toBe(decos2.length);

        for (let j = 0; j < decos1.length; j++) {
          expect(decos1[j].type).toBe(decos2[j].type);
          expect(decos1[j].position).toEqual(decos2[j].position);
          expect(decos1[j].rotation).toBe(decos2[j].rotation);
          expect(decos1[j].scale).toBe(decos2[j].scale);
        }
      }
    });

    it("decorations include trees and rocks", () => {
      const map = generateMap(5, 42);
      const islandCells = map.filter((c) => c.terrain === "island");

      let hasTree = false;
      let hasRock = false;

      for (const island of islandCells) {
        for (const deco of island.decorations ?? []) {
          if (deco.type === "tree") hasTree = true;
          if (deco.type === "rock") hasRock = true;
        }
      }

      expect(hasTree).toBe(true);
      expect(hasRock).toBe(true);
    });
  });

  describe("ship specs shallowDraft values", () => {
    it("Sloop has shallowDraft true", () => {
      expect(SHIP_SPECS["Sloop"].shallowDraft).toBe(true);
    });

    it("Flute has shallowDraft true", () => {
      expect(SHIP_SPECS["Flute"].shallowDraft).toBe(true);
    });

    it("Frigate has shallowDraft false", () => {
      expect(SHIP_SPECS["Frigate"].shallowDraft).toBe(false);
    });

    it("Galleon has shallowDraft false", () => {
      expect(SHIP_SPECS["Galleon"].shallowDraft).toBe(false);
    });
  });
});
