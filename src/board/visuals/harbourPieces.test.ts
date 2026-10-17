import { describe, it, expect } from "vitest";
import { PORT_NATIONS } from "../../game/types";
import type { FacetGeometryData } from "./facetBuilder";
import { backfacingFirstHits } from "./facetVisibility";
import { flagRgb, NATION_FLAG_CELLS } from "./nationFlagGeometry";
import {
  buildCrane,
  buildCraneLoad,
  buildMarketHall,
  buildQuayFlag,
  CRANE_FOOT,
  CRANE_HEIGHT,
  CRANE_JIB_TIP,
  CRANE_LOAD_DROP,
  HARBOUR_PIECE_TRIANGLE_BUDGET,
  MARKET_HALL_EAVE,
  MARKET_HALL_HEIGHT,
  MARKET_HALL_LANTERNS,
  MARKET_HALL_PLAN,
  QUAY_FLAG_HEIGHT,
  QUAY_FLAG_RADIUS,
  type HarbourPieceColors,
} from "./harbourPieces";
import { TOWN_PIECE_TRIANGLE_BUDGET } from "./townPieces";

const COLORS: HarbourPieceColors = {
  timber: [0.3, 0.22, 0.15],
  darkTimber: [0.1, 0.08, 0.06],
  stone: [0.5, 0.46, 0.4],
  iron: [0.02, 0.02, 0.02],
  rope: [0.42, 0.34, 0.22],
  thatch: [0.4, 0.3, 0.12],
  crate: [0.35, 0.27, 0.18],
  goods: [
    [0.6, 0.3, 0.05],
    [0.5, 0.45, 0.1],
  ],
};

const triangles = (g: FacetGeometryData) => g.vertexCount / 3;
const vertices = (g: FacetGeometryData) => Array.from({ length: g.vertexCount }, (_, i) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]] as const);

describe("harbour pieces (#181)", () => {
  const crane = buildCrane(COLORS);
  const load = buildCraneLoad(COLORS);
  const hall = buildMarketHall(COLORS);

  it("keeps every piece within the town pieces' budget, the crane with its load", () => {
    expect(HARBOUR_PIECE_TRIANGLE_BUDGET).toBe(TOWN_PIECE_TRIANGLE_BUDGET);
    for (const g of [crane, load, hall, ...PORT_NATIONS.map((n) => buildQuayFlag(n, COLORS))]) {
      expect(triangles(g)).toBeGreaterThan(0);
      expect(triangles(g)).toBeLessThanOrEqual(HARBOUR_PIECE_TRIANGLE_BUDGET);
    }
    expect(triangles(crane) + triangles(load)).toBeLessThanOrEqual(HARBOUR_PIECE_TRIANGLE_BUDGET);
    console.log(`harbour pieces: crane ${triangles(crane)} + load ${triangles(load)}, market hall ${triangles(hall)}, quay flag ${triangles(buildQuayFlag("England", COLORS))} triangles`);
  });

  describe("the dock crane", () => {
    it("stands on its foot and reaches out along +z with its jib, no taller than its height", () => {
      for (const [x, y, z] of vertices(crane)) {
        expect(y).toBeLessThanOrEqual(CRANE_HEIGHT + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-CRANE_FOOT.depth - 1e-6);
        expect(Math.abs(x)).toBeLessThanOrEqual(CRANE_FOOT.half + 1e-6);
        expect(z).toBeLessThanOrEqual(CRANE_JIB_TIP[2] + 0.01);
        expect(z).toBeGreaterThanOrEqual(-CRANE_FOOT.half - 0.06);
        // Below the jib, only the foot and the mast: nothing of it stands out over the water.
        if (y < CRANE_JIB_TIP[1] - 0.12) expect(Math.abs(z)).toBeLessThanOrEqual(CRANE_FOOT.half + 1e-6);
      }
      expect(CRANE_JIB_TIP[2]).toBeGreaterThan(CRANE_FOOT.half * 3);
    });

    it("hangs its load from the jib's tip: the rope's top at the tip, the crate below it", () => {
      let top = -Infinity;
      let bottom = Infinity;
      for (const [x, y, z] of vertices(load)) {
        top = Math.max(top, y);
        bottom = Math.min(bottom, y);
        expect(Math.hypot(x - CRANE_JIB_TIP[0], z - CRANE_JIB_TIP[2])).toBeLessThan(0.03);
      }
      expect(top).toBeCloseTo(CRANE_JIB_TIP[1], 6);
      expect(top - bottom).toBeCloseTo(CRANE_LOAD_DROP, 6);
      // Hung clear of the ground under the crane's foot.
      expect(bottom).toBeGreaterThan(0.05);
    });

    it("shows no inside-out facet from the board camera's elevations", () => {
      expect(backfacingFirstHits(crane, { minY: 0.001, elevations: [0.6, 0.9, 1.2] })).toEqual([]);
      expect(backfacingFirstHits(load, { minY: 0.001, elevations: [0.6, 0.9, 1.2] })).toEqual([]);
    });
  });

  describe("the market hall", () => {
    it("fits its plan and eaves and its height, its footing under the ground", () => {
      for (const [x, y, z] of vertices(hall)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(MARKET_HALL_PLAN.halfW + MARKET_HALL_EAVE + 1e-6);
        expect(Math.abs(z)).toBeLessThanOrEqual(MARKET_HALL_PLAN.halfD + MARKET_HALL_EAVE + 1e-6);
        expect(y).toBeLessThanOrEqual(MARKET_HALL_HEIGHT + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-0.03 - 1e-6);
      }
    });

    it("is open-sided: under the eaves its sides are clear between the posts", () => {
      // A ray across the hall at head height, between the corner posts, meets nothing but the goods inside it.
      const mid = vertices(hall).filter(([x, y, z]) => y > 0.05 && y < 0.09 && Math.abs(x) > MARKET_HALL_PLAN.halfW * 0.6 && Math.abs(z) < MARKET_HALL_PLAN.halfD * 0.5);
      expect(mid).toEqual([]);
    });

    it("roofs it in thatch, by vertex colour alone (ADR 0002 amendment (c))", () => {
      const eave = MARKET_HALL_HEIGHT * 0.55;
      let thatched = 0;
      let roof = 0;
      for (let i = 0; i < hall.vertexCount; i++) {
        if (hall.positions[i * 3 + 1] < eave) continue;
        roof++;
        const c = [hall.colors[i * 3], hall.colors[i * 3 + 1], hall.colors[i * 3 + 2]];
        // The thatch's hue (red over green over blue, as straw), its tone jittered course by course.
        const k = c[0] / COLORS.thatch[0];
        if (Math.abs(c[1] / COLORS.thatch[1] - k) < 0.12 && Math.abs(c[2] / COLORS.thatch[2] - k) < 0.12 && k > 0.6 && k < 1.4) thatched++;
      }
      expect(roof).toBeGreaterThan(0);
      expect(thatched / roof).toBeGreaterThan(0.8);
    });

    it("hangs its lanterns under the front eave, inside its plan", () => {
      expect(MARKET_HALL_LANTERNS.length).toBeGreaterThanOrEqual(2);
      for (const [x, y, z] of MARKET_HALL_LANTERNS) {
        expect(Math.abs(x)).toBeLessThanOrEqual(MARKET_HALL_PLAN.halfW);
        expect(z).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(0.05);
        expect(y).toBeLessThan(MARKET_HALL_HEIGHT * 0.55);
      }
    });

    it("shows no inside-out facet from the board camera's elevations", () => {
      expect(backfacingFirstHits(hall, { minY: 0.001, elevations: [0.6, 0.9, 1.2] })).toEqual([]);
    });
  });

  describe("the quay's flag", () => {
    for (const nation of PORT_NATIONS) {
      it(`flies ${nation}'s colours, every one of them, on a pole within its radius and height`, () => {
        const g = buildQuayFlag(nation, COLORS);
        const colours = new Set<string>();
        for (let i = 0; i < g.vertexCount; i++) colours.add([0, 1, 2].map((c) => g.colors[i * 3 + c].toFixed(5)).join(","));
        for (const row of NATION_FLAG_CELLS[nation]) for (const name of row) expect(colours.has(flagRgb(name).map((v) => v.toFixed(5)).join(","))).toBe(true);
        for (const [x, y, z] of vertices(g)) {
          expect(y).toBeLessThanOrEqual(QUAY_FLAG_HEIGHT + 1e-6);
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(QUAY_FLAG_RADIUS + 1e-6);
        }
      });
    }

    it("never flies the black flag but at a pirate haven", () => {
      const black = flagRgb("black").map((v) => v.toFixed(5)).join(",");
      for (const nation of PORT_NATIONS) {
        const g = buildQuayFlag(nation, COLORS);
        let has = false;
        for (let i = 0; i < g.vertexCount; i++) if ([0, 1, 2].map((c) => g.colors[i * 3 + c].toFixed(5)).join(",") === black) has = true;
        expect(has, nation).toBe(nation === "Pirate");
      }
    });
  });
});
