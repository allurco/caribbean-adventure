import { describe, expect, it } from "vitest";
import { createWrap, hex, type Hex } from "./hex";
import { holdsGauge } from "./weatherGauge";
import { TRADE_WIND, windFor } from "./wind";

const ship = (id: string, position: Hex) => ({ id, position });
/** A wind blowing toward +z (down the screen), so the ship with the smaller z is upwind. */
const TOWARD_PLUS_Z = windFor({ angle: Math.PI / 2, speed: 7 });

describe("holdsGauge", () => {
  it("gives the gauge to the upwind ship, adjacent", () => {
    // hex(0, 1) sits straight downwind (+z) of the origin.
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(0, 1)), TOWARD_PLUS_Z)).toBe("a");
  });

  it("gives it to the other ship when they swap places", () => {
    expect(holdsGauge(ship("a", hex(0, 1)), ship("b", hex(0, 0)), TOWARD_PLUS_Z)).toBe("b");
  });

  it("gives it at range, across a slanted line", () => {
    // hex(1, 2) is 3 hexes away, about 30° off the wind's line, downwind.
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(1, 2)), TOWARD_PLUS_Z)).toBe("a");
    expect(holdsGauge(ship("a", hex(-2, -3)), ship("b", hex(0, 0)), TOWARD_PLUS_Z)).toBe("a");
  });

  it("gives it to neither when they sit square to the wind", () => {
    // hex(2, -1) lies exactly along +x from the origin, at right angles to the wind.
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(2, -1)), TOWARD_PLUS_Z)).toBeNull();
    expect(holdsGauge(ship("a", hex(2, -1)), ship("b", hex(0, 0)), TOWARD_PLUS_Z)).toBeNull();
  });

  it("calls a line within 15° of square to the wind a tie, and one beyond it not", () => {
    // Adjacent hex(1, 0) bears 30° from +x: 60° off the wind toward +z, so 30° from square.
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(1, 0)), TOWARD_PLUS_Z)).toBe("a");
    // Turn the wind so that line is 10° from square: a tie.
    const nearlySquare = windFor({ angle: (30 + 80) * (Math.PI / 180), speed: 7 });
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(1, 0)), nearlySquare)).toBeNull();
    // And 20° from square: the gauge again.
    const offSquare = windFor({ angle: (30 + 70) * (Math.PI / 180), speed: 7 });
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(1, 0)), offSquare)).toBe("a");
  });

  it("gives it to neither when the ships share a hex", () => {
    expect(holdsGauge(ship("a", hex(3, 3)), ship("b", hex(3, 3)), TOWARD_PLUS_Z)).toBeNull();
  });

  it("measures across the east–west seam the short way round", () => {
    const wrap = createWrap(10);
    // Wind toward +x: hex(9, ...) one column west of the seam is upwind of hex(0, ...).
    const towardPlusX = windFor({ angle: 0, speed: 7 });
    expect(holdsGauge(ship("a", hex(9, -4)), ship("b", hex(0, 1)), towardPlusX, wrap)).toBe("a");
    // Without the wrap, the long way round, the answer flips.
    expect(holdsGauge(ship("a", hex(9, -4)), ship("b", hex(0, 1)), towardPlusX)).toBe("b");
  });

  it("reads the trade wind: the ship further down the screen is upwind", () => {
    // The trade wind blows up the screen (−z) and left (−x).
    expect(holdsGauge(ship("a", hex(0, 0)), ship("b", hex(0, 3)), windFor(TRADE_WIND))).toBe("b");
  });
});
