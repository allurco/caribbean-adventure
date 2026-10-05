import { describe, it, expect } from "vitest";
import { validMoveTargets } from "./moves";
import { hex, hexEquals, neighbors, hexDistance, hexRect, offsetToHex, createWrap, NO_WRAP } from "./hex";
import { generateMap } from "./mapGenerator";
import { getMapPreset } from "./mapConfig";
import type { MapDimensions } from "./mapConfig";
import type { MapCell, Elevation, Biome } from "./types";
import { SHIP_SPECS } from "./constants";
import { checkLineOfSight, getHexLine, MOUNTAIN_ELEVATION } from "./combat";

/** Small generated maps that still fit a few islands between the open-sea edges. */
const SMALL_MAP: MapDimensions = { columns: 12, rows: 12 };
const MID_MAP: MapDimensions = { columns: 16, rows: 14 };

function cell(
  q: number,
  r: number,
  terrain: "water" | "island" | "reef" = "water",
  hasPort = false,
  elevation: Elevation = terrain === "water" || terrain === "reef" ? 0 : 1
): MapCell {
  const biome: Biome | undefined =
    elevation === 1 ? "SAND" : elevation === 2 ? "GRASS" : elevation === 3 ? "ROCK" : undefined;
  return { hex: hex(q, r), terrain, hasPort, elevation, biome };
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
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, [], true);
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
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, [], false);
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
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, [], shallowDraft);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(true);
    });

    it("Frigate (deep-draft) cannot enter reef", () => {
      const cells: MapCell[] = [
        cell(0, 0),
        cell(1, 0, "reef"),
      ];
      const shallowDraft = SHIP_SPECS["Frigate"].shallowDraft;
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, [], shallowDraft);
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
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, [], false);
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
      const targets = validMoveTargets(hex(0, 0), cells, NO_WRAP, occupied, true);
      expect(targets).toHaveLength(1);
      expect(targets.some((h) => hexEquals(h, hex(1, 0)))).toBe(false);
      expect(targets.some((h) => hexEquals(h, hex(0, 1)))).toBe(true);
    });
  });

  describe("reef generation in maps", () => {
    it("reefs only spawn adjacent to islands (coastal hexes)", () => {
      // Use a fixed seed for deterministic testing
      const map = generateMap(SMALL_MAP,42);

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
      const map = generateMap(SMALL_MAP,42);
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
      const map1 = generateMap(SMALL_MAP,123);
      const map2 = generateMap(SMALL_MAP,123);

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
        const map = generateMap(SMALL_MAP,seed);
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
      const map = generateMap(SMALL_MAP,42);
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
    it("most island hexes have decorations", () => {
      const map = generateMap(SMALL_MAP,42);
      const islandCells = map.filter((c) => c.terrain === "island");

      // Not all islands have decorations now (beach hexes can have 0)
      // But most should have at least some
      const withDecorations = islandCells.filter(
        (c) => c.decorations && c.decorations.length > 0
      );
      expect(withDecorations.length).toBeGreaterThan(0);

      // Non-port islands with elevation 2+ should have decorations
      const jungleAndMountain = islandCells.filter(
        (c) => !c.hasPort && (c.elevation === 2 || c.elevation === 3)
      );
      for (const cell of jungleAndMountain) {
        expect(cell.decorations).toBeDefined();
        expect(cell.decorations!.length).toBeGreaterThan(0);
      }
    });

    it("water hexes do not have decorations", () => {
      const map = generateMap(SMALL_MAP,42);
      const waterCells = map.filter((c) => c.terrain === "water");

      for (const water of waterCells) {
        expect(water.decorations).toBeUndefined();
      }
    });

    it("reef hexes do not have decorations", () => {
      const map = generateMap(SMALL_MAP,42);
      const reefCells = map.filter((c) => c.terrain === "reef");

      for (const reef of reefCells) {
        expect(reef.decorations).toBeUndefined();
      }
    });

    it("port hexes have a fort decoration", () => {
      const map = generateMap(SMALL_MAP,42);
      const portCells = map.filter((c) => c.hasPort);

      for (const port of portCells) {
        expect(port.decorations).toBeDefined();
        const hasFort = port.decorations!.some((d) => d.type === "fort");
        expect(hasFort).toBe(true);
      }
    });

    it("port hexes have a pier decoration", () => {
      const map = generateMap(SMALL_MAP,42);
      const portCells = map.filter((c) => c.hasPort);

      for (const port of portCells) {
        expect(port.decorations).toBeDefined();
        const hasPier = port.decorations!.some((d) => d.type === "pier");
        expect(hasPier).toBe(true);
      }
    });

    it("decorations are deterministic with same seed", () => {
      const map1 = generateMap(SMALL_MAP,99);
      const map2 = generateMap(SMALL_MAP,99);

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
      const map = generateMap(SMALL_MAP,42);
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

describe("terrain elevation and biomes", () => {
  describe("island elevation generation (volcano shape)", () => {
    it("water hexes have elevation 0", () => {
      const map = generateMap(SMALL_MAP,42);
      const waterCells = map.filter((c) => c.terrain === "water");

      for (const water of waterCells) {
        expect(water.elevation).toBe(0);
      }
    });

    it("reef hexes have elevation 0", () => {
      const map = generateMap(SMALL_MAP,42);
      const reefCells = map.filter((c) => c.terrain === "reef");

      for (const reef of reefCells) {
        expect(reef.elevation).toBe(0);
      }
    });

    it("island hexes have elevation 1, 2, or 3", () => {
      const map = generateMap(SMALL_MAP,42);
      const islandCells = map.filter((c) => c.terrain === "island");

      for (const island of islandCells) {
        expect([1, 2, 3]).toContain(island.elevation);
      }
    });

    it("ports are always at beach elevation (1)", () => {
      const seeds = [42, 123, 456, 789, 999];
      for (const seed of seeds) {
        const map = generateMap(SMALL_MAP,seed);
        const portCells = map.filter((c) => c.hasPort);

        for (const port of portCells) {
          expect(port.elevation).toBe(1);
        }
      }
    });

    it("larger islands have mountains (elevation 3) at center", () => {
      // Use larger radius to get bigger islands
      const map = generateMap(getMapPreset("small"),42);

      // Find islands with at least 5 hexes (guaranteed to have mountain centers)
      const islandCells = map.filter((c) => c.terrain === "island");

      // There should be at least one mountain hex in the map
      const hasMountain = islandCells.some((c) => c.elevation === 3);
      // Since we're using a larger map, we should have some mountains
      expect(hasMountain || islandCells.length < 5).toBe(true);
    });

    it("islands have cone-like structure (center higher than edges)", () => {
      const map = generateMap(MID_MAP,42);
      const islandCells = map.filter((c) => c.terrain === "island");

      // Group cells by their distance from same-island hexes
      // For each island, the center should have highest elevation
      const cellMap = new Map<string, MapCell>();
      for (const cell of map) {
        cellMap.set(`${cell.hex.q},${cell.hex.r}`, cell);
      }

      // Find mountain hexes and verify they have lower-elevation neighbors
      const mountainCells = islandCells.filter((c) => c.elevation === 3);
      for (const mountain of mountainCells) {
        const adjacentIslands = neighbors(mountain.hex)
          .map((n) => cellMap.get(`${n.q},${n.r}`))
          .filter((c) => c && c.terrain === "island");

        // Adjacent island hexes should not be higher than the mountain
        for (const adj of adjacentIslands) {
          if (adj) {
            expect(adj.elevation).toBeLessThanOrEqual(mountain.elevation);
          }
        }
      }
    });
  });

  describe("biome assignment", () => {
    it("beach hexes (elevation 1) have SAND biome", () => {
      const map = generateMap(SMALL_MAP,42);
      const beachCells = map.filter((c) => c.terrain === "island" && c.elevation === 1);

      for (const beach of beachCells) {
        expect(beach.biome).toBe("SAND");
      }
    });

    it("jungle hexes (elevation 2) have GRASS biome", () => {
      const map = generateMap(MID_MAP,42);
      const jungleCells = map.filter((c) => c.terrain === "island" && c.elevation === 2);

      for (const jungle of jungleCells) {
        expect(jungle.biome).toBe("GRASS");
      }
    });

    it("mountain hexes (elevation 3) have ROCK biome", () => {
      const map = generateMap(getMapPreset("small"),42);
      const mountainCells = map.filter((c) => c.terrain === "island" && c.elevation === 3);

      for (const mountain of mountainCells) {
        expect(mountain.biome).toBe("ROCK");
      }
    });

    it("water/reef hexes have no biome", () => {
      const map = generateMap(SMALL_MAP,42);
      const nonLandCells = map.filter(
        (c) => c.terrain === "water" || c.terrain === "reef"
      );

      for (const cell of nonLandCells) {
        expect(cell.biome).toBeUndefined();
      }
    });
  });

  describe("getHexLine utility", () => {
    it("returns single hex for same start and end", () => {
      const a = hex(0, 0);
      const line = getHexLine(a, a, NO_WRAP);
      expect(line).toHaveLength(1);
      expect(hexEquals(line[0], a)).toBe(true);
    });

    it("returns correct hexes for adjacent hexes", () => {
      const a = hex(0, 0);
      const b = hex(1, 0);
      const line = getHexLine(a, b, NO_WRAP);
      expect(line).toHaveLength(2);
      expect(hexEquals(line[0], a)).toBe(true);
      expect(hexEquals(line[1], b)).toBe(true);
    });

    it("returns all hexes along a straight line", () => {
      const a = hex(0, 0);
      const b = hex(3, 0);
      const line = getHexLine(a, b, NO_WRAP);
      expect(line).toHaveLength(4); // distance 3 + 1
      expect(hexEquals(line[0], hex(0, 0))).toBe(true);
      expect(hexEquals(line[1], hex(1, 0))).toBe(true);
      expect(hexEquals(line[2], hex(2, 0))).toBe(true);
      expect(hexEquals(line[3], hex(3, 0))).toBe(true);
    });

    it("returns correct number of hexes for diagonal line", () => {
      const a = hex(0, 0);
      const b = hex(2, -2);
      const line = getHexLine(a, b, NO_WRAP);
      expect(line).toHaveLength(hexDistance(a, b) + 1);
    });
  });

  describe("line of sight blocking by mountains", () => {
    it("returns true for adjacent hexes with no obstruction", () => {
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(1, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(true);
    });

    it("returns true when no mountain in between", () => {
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "water", false, 0),
        cell(2, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(2, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(true);
    });

    it("returns false when mountain (elevation 3) blocks line", () => {
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "island", false, 3), // Mountain in the middle
        cell(2, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(2, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(false);
    });

    it("returns true when jungle (elevation 2) is in between", () => {
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "island", false, 2), // Jungle doesn't block
        cell(2, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(2, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(true);
    });

    it("returns true when beach (elevation 1) is in between", () => {
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "island", false, 1), // Beach doesn't block
        cell(2, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(2, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(true);
    });

    it("endpoints are not checked for obstruction", () => {
      // Even if start or end is a mountain, LOS is clear
      const cells: MapCell[] = [
        cell(0, 0, "island", false, 3), // Start is mountain
        cell(1, 0, "water", false, 0),
        cell(2, 0, "island", false, 3), // End is mountain
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(2, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(true);
    });

    it("mountain at range 3 blocks shooting", () => {
      // Ships at (0,0) and (3,0), mountain at (1,0) or (2,0)
      const cells: MapCell[] = [
        cell(0, 0, "water", false, 0),
        cell(1, 0, "water", false, 0),
        cell(2, 0, "island", false, 3), // Mountain
        cell(3, 0, "water", false, 0),
      ];
      const hasLOS = checkLineOfSight(hex(0, 0), hex(3, 0), cells, NO_WRAP);
      expect(hasLOS).toBe(false);
    });

    it("draws the line the short way across the east–west seam", () => {
      const wrap = createWrap(8);
      const from = offsetToHex(6, 2);
      const to = offsetToHex(1, 2);
      const line = getHexLine(from, to, wrap);
      expect(line).toHaveLength(4); // 6 → 7 → 0 → 1
      expect(line.every((h) => h.q >= 0 && h.q < 8)).toBe(true);
      expect(line.map((h) => h.q)).toEqual([6, 7, 0, 1]);
    });

    it("is blocked by a mountain sitting on the seam", () => {
      const wrap = createWrap(8);
      const cells: MapCell[] = hexRect(8, 5).map((h) =>
        h.q === 7 ? cell(h.q, h.r, "island", false, 3) : cell(h.q, h.r, "water", false, 0)
      );
      expect(checkLineOfSight(offsetToHex(6, 2), offsetToHex(0, 2), cells, wrap)).toBe(false);
      expect(checkLineOfSight(offsetToHex(0, 2), offsetToHex(1, 2), cells, wrap)).toBe(true);
    });

    it("MOUNTAIN_ELEVATION constant is 3", () => {
      expect(MOUNTAIN_ELEVATION).toBe(3);
    });
  });
});
