import { describe, it, expect } from "vitest";
import { openingView, turnChangeView, hexesFramed, SHIP_VIEW_DISTANCE, SHIP_VIEW_OFFSET_X } from "./shipView";
import { CAMERA_FOV, CAMERA_PITCH } from "./cameraBounds";
import { HUD_PORT_PANEL_INSET, HUD_PORT_PANEL_WIDTH } from "./hudLayout";
import { hullFootprintRadius, shipHullBox } from "./shipHull";
import { SHIP_CLASSES } from "../game/types";

// Ship positions with known world centres (hexToWorld, flat-top, size 1):
// (0,0) → (0, 0); (2,0) → (3, √3); (0,2) → (0, 2√3).
const SQRT3 = Math.sqrt(3);
const ships = {
  "0": { position: { q: 2, r: 0, s: -2 } },
  "1": { position: { q: 0, r: 2, s: -2 } },
};
const mapView = { target: [10, 0, 8] as [number, number, number], distance: 30 };

describe("openingView", () => {
  it("opens on the current player's ship at ship zoom in hotseat play", () => {
    expect(openingView({ ships, currentPlayer: "1", playerID: null, mapView })).toEqual({
      target: [SHIP_VIEW_OFFSET_X, 0, 2 * SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
  });

  it("opens on the client's own ship in networked play, whoever's turn it is", () => {
    expect(openingView({ ships, currentPlayer: "1", playerID: "0", mapView })).toEqual({
      target: [3 + SHIP_VIEW_OFFSET_X, 0, SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
  });

  it("falls back on the map view when the ship is missing", () => {
    expect(openingView({ ships, currentPlayer: "4", playerID: null, mapView })).toEqual(mapView);
    expect(openingView({ ships, currentPlayer: "0", playerID: "5", mapView })).toEqual(mapView);
  });

  it("lets the dev pins win over the ship, each on its own", () => {
    const pinned = { target: [1, 0, 2] as [number, number, number], distance: 12 };
    expect(openingView({ ships, currentPlayer: "1", playerID: null, mapView, pins: pinned })).toEqual(pinned);
    expect(openingView({ ships, currentPlayer: "1", playerID: null, mapView, pins: { target: [1, 0, 2] } })).toEqual({
      target: [1, 0, 2],
      distance: SHIP_VIEW_DISTANCE,
    });
    expect(openingView({ ships, currentPlayer: "1", playerID: null, mapView, pins: { distance: 12 } })).toEqual({
      target: [SHIP_VIEW_OFFSET_X, 0, 2 * SQRT3],
      distance: 12,
    });
  });
});

describe("turnChangeView", () => {
  it("flies to the new current player's ship at ship zoom in hotseat play", () => {
    expect(turnChangeView({ ships, currentPlayer: "0", playerID: null })).toEqual({
      target: [3 + SHIP_VIEW_OFFSET_X, 0, SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
    expect(turnChangeView({ ships, currentPlayer: "1" })).toEqual({
      target: [SHIP_VIEW_OFFSET_X, 0, 2 * SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
  });

  it("never moves a networked client's camera", () => {
    expect(turnChangeView({ ships, currentPlayer: "1", playerID: "0" })).toBeNull();
    expect(turnChangeView({ ships, currentPlayer: "1", playerID: "1" })).toBeNull();
  });

  it("stays put when the new current player has no ship", () => {
    expect(turnChangeView({ ships, currentPlayer: "4", playerID: null })).toBeNull();
  });
});

describe("the ship view at diorama scale (ADR 0006)", () => {
  it("frames about 2.2 to 2.5 hexes top to bottom at the focus", () => {
    expect(SHIP_VIEW_DISTANCE).toBeCloseTo(3.4, 6);
    const framed = hexesFramed(SHIP_VIEW_DISTANCE, CAMERA_FOV, CAMERA_PITCH);
    expect(framed).toBeGreaterThanOrEqual(2.2);
    expect(framed).toBeLessThanOrEqual(2.5);
  });

  it("counts the hexes framed as the view's height at the focus over a hex row's height on screen", () => {
    // A hex row is √3 deep on the sea, foreshortened by the pitch.
    const d = 5;
    const height = 2 * d * Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));
    expect(hexesFramed(d, CAMERA_FOV, CAMERA_PITCH)).toBeCloseTo(height / (SQRT3 * Math.sin(CAMERA_PITCH)), 12);
    expect(hexesFramed(2 * d, CAMERA_FOV, CAMERA_PITCH)).toBeCloseTo(2 * hexesFramed(d, CAMERA_FOV, CAMERA_PITCH), 12);
  });

  it("sets the ship left of centre, clear of the port panel, on a 1280 × 720 screen", () => {
    const width = 1280;
    const aspect = 16 / 9;
    const halfWidth = SHIP_VIEW_DISTANCE * Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) * aspect;
    // The panel's left edge, in normalised screen x (−1 left, +1 right).
    const panelEdge = 1 - (2 * (HUD_PORT_PANEL_WIDTH + HUD_PORT_PANEL_INSET)) / width;
    expect(SHIP_VIEW_OFFSET_X).toBeGreaterThan(0);
    for (const shipClass of SHIP_CLASSES) {
      const reach = hullFootprintRadius(shipHullBox(shipClass));
      expect((-SHIP_VIEW_OFFSET_X + reach) / halfWidth).toBeLessThan(panelEdge);
      expect((-SHIP_VIEW_OFFSET_X - reach) / halfWidth).toBeGreaterThan(-1);
    }
  });
});
