import { describe, it, expect } from "vitest";
import { openingView, turnChangeView, SHIP_VIEW_DISTANCE } from "./shipView";

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
      target: [0, 0, 2 * SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
  });

  it("opens on the client's own ship in networked play, whoever's turn it is", () => {
    expect(openingView({ ships, currentPlayer: "1", playerID: "0", mapView })).toEqual({
      target: [3, 0, SQRT3],
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
      target: [0, 0, 2 * SQRT3],
      distance: 12,
    });
  });
});

describe("turnChangeView", () => {
  it("flies to the new current player's ship at ship zoom in hotseat play", () => {
    expect(turnChangeView({ ships, currentPlayer: "0", playerID: null })).toEqual({
      target: [3, 0, SQRT3],
      distance: SHIP_VIEW_DISTANCE,
    });
    expect(turnChangeView({ ships, currentPlayer: "1" })).toEqual({
      target: [0, 0, 2 * SQRT3],
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
