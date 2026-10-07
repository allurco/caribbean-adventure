import { describe, it, expect } from "vitest";
import {
  buildTownPiece,
  TOWN_PIECE_HEIGHT,
  TOWN_PIECE_KINDS,
  TOWN_PIECE_RADIUS,
  TOWN_PIECE_TRIANGLE_BUDGET,
  TOWN_PIECE_VARIANTS,
  type TownPieceColors,
} from "./townPieces";
import { backfacingFirstHits } from "./facetVisibility";

export const TEST_PIECE_COLORS: TownPieceColors = {
  timber: [0.3, 0.22, 0.15],
  darkTimber: [0.1, 0.08, 0.06],
  iron: [0.02, 0.02, 0.02],
  stone: [0.5, 0.46, 0.4],
  cloths: [
    [0.5, 0.1, 0.06],
    [0.6, 0.45, 0.15],
    [0.15, 0.2, 0.35],
  ],
  strakes: [
    [0.1, 0.25, 0.35],
    [0.4, 0.1, 0.05],
    [0.15, 0.3, 0.15],
  ],
  tar: [0.05, 0.04, 0.03],
  soil: [0.15, 0.09, 0.05],
  leaf: [0.15, 0.35, 0.1],
  frond: [0.2, 0.4, 0.12],
  trunk: [0.3, 0.22, 0.13],
  water: [0.1, 0.2, 0.22],
  net: [0.25, 0.22, 0.18],
  goods: [
    [0.6, 0.3, 0.05],
    [0.5, 0.45, 0.1],
    [0.3, 0.1, 0.1],
  ],
};

describe("town pieces (#84)", () => {
  for (const kind of TOWN_PIECE_KINDS) {
    for (let variant = 0; variant < TOWN_PIECE_VARIANTS[kind]; variant++) {
      describe(`${kind} ${variant}`, () => {
        const g = buildTownPiece(kind, TEST_PIECE_COLORS, variant);

        it("is a few hundred triangles at most", () => {
          expect(g.vertexCount).toBeGreaterThan(0);
          expect(g.vertexCount / 3).toBeLessThanOrEqual(TOWN_PIECE_TRIANGLE_BUDGET);
        });

        it("fits its footprint radius and height", () => {
          for (let i = 0; i < g.vertexCount; i++) {
            const x = g.positions[i * 3];
            const y = g.positions[i * 3 + 1];
            const z = g.positions[i * 3 + 2];
            expect(Math.hypot(x, z)).toBeLessThanOrEqual(TOWN_PIECE_RADIUS[kind] + 1e-6);
            expect(y).toBeLessThanOrEqual(TOWN_PIECE_HEIGHT[kind] + 1e-6);
            expect(y).toBeGreaterThanOrEqual(-0.0051);
          }
        });

        it("shows no inside-out facet from the board camera's elevations", () => {
          expect(backfacingFirstHits(g, { minY: 0.001, elevations: [0.6, 0.9, 1.2] })).toEqual([]);
        });
      });
    }
  }
});
