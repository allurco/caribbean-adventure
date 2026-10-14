import { describe, expect, it } from "vitest";
import { hexToWorld, type Hex } from "../game/hex";
import { moveHeading, trackShipHeadings } from "./shipHeading";

const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

describe("heading of a move", () => {
  it("points the bow along +z for a move toward +z", () => {
    expect(moveHeading([0, 0], [0, 2], Infinity)).toBeCloseTo(0, 12);
  });

  it("points the bow along +x for a move toward +x", () => {
    expect(moveHeading([1, 1], [3, 1], Infinity)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("has no heading when the ship stays put", () => {
    expect(moveHeading([1, 1], [1, 1], Infinity)).toBeNull();
  });

  it("takes the short way across the seam", () => {
    // From the east edge to the west edge of a 40-wide map: one step east.
    expect(moveHeading([39, 0], [1, 0], 40)).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe("tracking each ship's last heading", () => {
  it("keeps the heading of a ship's last move", () => {
    const before = { "0": { position: hex(0, 0) } };
    const after = { "0": { position: hex(1, 0) } };
    const [fx, , fz] = hexToWorld(hex(0, 0));
    const [tx, , tz] = hexToWorld(hex(1, 0));
    const headings = trackShipHeadings({}, before, after, Infinity);
    expect(headings["0"]).toBeCloseTo(Math.atan2(tx - fx, tz - fz), 12);
  });

  it("keeps the last heading of a ship that did not move or has gone", () => {
    const ships = { "0": { position: hex(1, 0) } };
    expect(trackShipHeadings({ "0": 1.2 }, ships, ships, Infinity)).toEqual({ "0": 1.2 });
    expect(trackShipHeadings({ "0": 1.2 }, ships, {}, Infinity)).toEqual({ "0": 1.2 });
  });
});
