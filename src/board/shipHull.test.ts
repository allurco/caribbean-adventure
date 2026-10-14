import { describe, it, expect } from "vitest";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";
import { SHIP_CLASSES } from "../game/types";
import { hex, hexToWorld } from "../game/hex";
import {
  DEFAULT_HULL_BOX,
  HULL_FIT_MARGIN,
  SHIP_RIDE_HEIGHT,
  SHIP_SINK_DEPTH,
  hullFootprintRadius,
  SHIP_TOOLTIP_CLEARANCE,
  shipHoverBox,
  shipHullBox,
  shipTooltipHeight,
  shipWaterline,
  WATERLINE_BEAM_SHARE,
  WATERLINE_LENGTH_SHARE,
} from "./shipHull";
import { SHIP_MODELS, shipModelDraftUnits, shipModelScale } from "./shipModels";

const expectBox = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(3);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
};

describe("shipHullBox", () => {
  const toWorld = (metres: number) => metresToUnits(metres) * SHIP_SCALE;

  it("sizes the Frigate's box from its model: 10.2 m beam, 8.4 m deep, 38 m long, at ship scale", () => {
    expectBox(shipHullBox("Frigate"), [toWorld(10.2), toWorld(8.4), toWorld(38)]);
  });

  it("sizes the Galleon's box from its model: 13.6 m beam, 11.1 m deep, 42 m long, at ship scale", () => {
    expectBox(shipHullBox("Galleon"), [toWorld(13.6), toWorld(11.1), toWorld(42)]);
  });

  it("sizes the Sloop's box from its model: 5.6 m beam, 4.15 m deep, 18 m long, at ship scale", () => {
    expectBox(shipHullBox("Sloop"), [toWorld(5.6), toWorld(4.15), toWorld(18)]);
  });

  it("sizes the Flute's box from its model: 7.4 m beam, 7.2 m deep, 30 m long, at ship scale", () => {
    expectBox(shipHullBox("Flute"), [toWorld(7.4), toWorld(7.2), toWorld(30)]);
  });

  it("keeps the default box for a ship without a class", () => {
    expectBox(shipHullBox(undefined), [0.3 * SHIP_SCALE, 0.25 * SHIP_SCALE, 0.7 * SHIP_SCALE]);
    expect(shipHullBox(undefined)).toBe(DEFAULT_HULL_BOX);
  });

  it("keeps the ride height and sink depth", () => {
    expect(SHIP_RIDE_HEIGHT).toBeCloseTo(0.12 * SHIP_SCALE, 10);
    expect(SHIP_SINK_DEPTH).toBeCloseTo(1.5 * SHIP_SCALE, 10);
  });
});

// A hex's inradius is half the distance between neighbouring centres; its
// width vertex to vertex is twice its circumradius, 2 / √3 of that.
const [ax, , az] = hexToWorld(hex(0, 0));
const [bx, , bz] = hexToWorld(hex(1, 0));
const HEX_INRADIUS = Math.hypot(bx - ax, bz - az) / 2;
const HEX_WIDTH = (4 / Math.sqrt(3)) * HEX_INRADIUS;

describe("ships at diorama scale (ADR 0006)", () => {
  it("measures the hex as the board draws it: 2 units vertex to vertex, √3/2 inradius", () => {
    expect(HEX_WIDTH).toBeCloseTo(2, 12);
    expect(HEX_INRADIUS).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  it("draws the Frigate's hull 0.44 ± 0.02 of a hex long, vertex to vertex", () => {
    const ratio = shipHullBox("Frigate")[2] / HEX_WIDTH;
    expect(ratio).toBeGreaterThanOrEqual(0.42);
    expect(ratio).toBeLessThanOrEqual(0.46);
  });

  it("follows SHIP_SCALE: the Frigate's hull is 38 m at 65 m a unit, times the ship factor", () => {
    expect(shipHullBox("Frigate")[2] / HEX_WIDTH).toBeCloseTo((metresToUnits(38) * SHIP_SCALE) / HEX_WIDTH, 12);
  });

  const SWEEP = Array.from({ length: 72 }, (_, i) => (i * 2 * Math.PI) / 72);
  const CORNERS: readonly (readonly [number, number])[] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const shipClass of SHIP_CLASSES) {
    it(`fits the ${shipClass}'s hull box inside the hex's inradius, less the margin, at every heading`, () => {
      const [width, , length] = shipHullBox(shipClass);
      for (const heading of SWEEP) {
        for (const [sx, sz] of CORNERS) {
          const x = (sx * width) / 2;
          const z = (sz * length) / 2;
          const rx = x * Math.cos(heading) + z * Math.sin(heading);
          const rz = -x * Math.sin(heading) + z * Math.cos(heading);
          expect(Math.hypot(rx, rz)).toBeLessThanOrEqual(HEX_INRADIUS - HULL_FIT_MARGIN);
        }
      }
      expect(hullFootprintRadius(shipHullBox(shipClass))).toBeLessThanOrEqual(HEX_INRADIUS - HULL_FIT_MARGIN);
    });
  }

  it("fits the 42 m Galleon, the longest hull, with half its length inside the inradius less the margin", () => {
    expect(SHIP_MODELS.Galleon!.lengthMetres).toBeGreaterThanOrEqual(42);
    const [, , length] = shipHullBox("Galleon");
    expect(length / 2).toBeLessThanOrEqual(HEX_INRADIUS - HULL_FIT_MARGIN);
    expect(HULL_FIT_MARGIN).toBeGreaterThan(0);
  });
});

describe("shipHoverBox", () => {
  for (const shipClass of SHIP_CLASSES) {
    it(`reaches from the ${shipClass}'s keel up to its masthead, as wide and long as its hull`, () => {
      const hull = shipHullBox(shipClass);
      const box = shipHoverBox(shipClass);
      const masthead = SHIP_MODELS[shipClass]!.mastheadMetres * shipModelScale();
      expect(box.top).toBeCloseTo(masthead, 12);
      expect(box.bottom).toBeCloseTo(-shipModelDraftUnits(SHIP_MODELS[shipClass]!), 12);
      expect(box.bottom).toBeLessThan(0);
      expect(box.width).toBe(hull[0]);
      expect(box.length).toBe(hull[2]);
      // The topsails stand well above the hull box, where the old hit test stopped.
      expect(box.top).toBeGreaterThan(1.5 * hull[1]);
    });
  }

  it("is the hull box for a ship without a class", () => {
    const hull = shipHullBox(undefined);
    const box = shipHoverBox(undefined);
    expect(box.top).toBeCloseTo(SHIP_RIDE_HEIGHT + hull[1] / 2, 12);
    expect(box.bottom).toBeCloseTo(SHIP_RIDE_HEIGHT - hull[1] / 2, 12);
  });
});

describe("shipTooltipHeight", () => {
  it("anchors the tooltip's bottom edge above the masthead, so it never covers the ship", () => {
    for (const shipClass of [...SHIP_CLASSES, undefined]) {
      expect(SHIP_TOOLTIP_CLEARANCE).toBeGreaterThan(0);
      expect(shipTooltipHeight(shipClass)).toBeCloseTo(shipHoverBox(shipClass).top + SHIP_TOOLTIP_CLEARANCE, 12);
    }
    expect(shipTooltipHeight("Galleon")).toBeGreaterThan(shipTooltipHeight("Sloop"));
  });
});

describe("shipWaterline", () => {
  it("is a modelled hull's waterline: a little shorter and narrower than its hull box, with rounded ends", () => {
    for (const shipClass of SHIP_CLASSES) {
      const [width, , length] = shipHullBox(shipClass);
      const waterline = shipWaterline(shipClass);
      expect(SHIP_MODELS[shipClass]).not.toBeNull();
      expect(waterline.length).toBeCloseTo(length * WATERLINE_LENGTH_SHARE, 12);
      expect(waterline.beam).toBeCloseTo(width * WATERLINE_BEAM_SHARE, 12);
      expect(waterline.roundness).toBe(1);
    }
    expect(WATERLINE_LENGTH_SHARE).toBeGreaterThan(0.75);
    expect(WATERLINE_LENGTH_SHARE).toBeLessThanOrEqual(1);
    expect(WATERLINE_BEAM_SHARE).toBeGreaterThan(0.75);
    expect(WATERLINE_BEAM_SHARE).toBeLessThanOrEqual(1);
  });

  it("is a box hull's footprint, nearly square, for a ship without a class", () => {
    const waterline = shipWaterline(undefined);
    expect(waterline.length).toBeCloseTo(DEFAULT_HULL_BOX[2], 12);
    expect(waterline.beam).toBeCloseTo(DEFAULT_HULL_BOX[0], 12);
    expect(waterline.roundness).toBeLessThan(0.3);
  });
});
