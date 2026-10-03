import { describe, it, expect } from "vitest";
import {
  VERTICES_PER_OUTLINE,
  buildOutlinePositions,
  buildOutlineEmphasis,
  gridFadeOpacity,
  gridFadeForCameraDistance,
  GRID_FADE,
  GRID_FADE_ZOOM_DISTANCE,
} from "./hexOutlineGrid";
import { hexToWorld } from "../game/hex";
import type { Hex } from "../game/hex";

const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

describe("buildOutlinePositions", () => {
  it("emits six line segments (12 vertices) per hex", () => {
    const positions = buildOutlinePositions([hex(0, 0), hex(1, 0)], 1, 0.01);
    expect(VERTICES_PER_OUTLINE).toBe(12);
    expect(positions.length).toBe(2 * VERTICES_PER_OUTLINE * 3);
  });

  it("places every vertex on the hex corners around the hex centre", () => {
    const h = hex(2, -1);
    const [cx, , cz] = hexToWorld(h);
    const positions = buildOutlinePositions([h], 0.95, 0.01);
    for (let v = 0; v < VERTICES_PER_OUTLINE; v++) {
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];
      expect(y).toBeCloseTo(0.01);
      expect(Math.hypot(x - cx, z - cz)).toBeCloseTo(0.95);
    }
  });

  it("closes the loop: each segment ends where the next one starts", () => {
    const positions = buildOutlinePositions([hex(0, 0)], 1, 0);
    for (let edge = 0; edge < 6; edge++) {
      const end = (edge * 2 + 1) * 3;
      const nextStart = (((edge + 1) % 6) * 2) * 3;
      expect(positions[end]).toBeCloseTo(positions[nextStart]);
      expect(positions[end + 2]).toBeCloseTo(positions[nextStart + 2]);
    }
  });
});

describe("buildOutlineEmphasis", () => {
  it("is zero for hexes without emphasis", () => {
    const emphasis = buildOutlineEmphasis(3, new Map());
    expect(emphasis.length).toBe(3 * VERTICES_PER_OUTLINE);
    expect(Array.from(emphasis).every((v) => v === 0)).toBe(true);
  });

  it("writes the emphasis value to all vertices of the given hex", () => {
    const emphasis = buildOutlineEmphasis(3, new Map([[1, 0.5]]));
    for (let v = 0; v < 3 * VERTICES_PER_OUTLINE; v++) {
      const inHex1 = v >= VERTICES_PER_OUTLINE && v < 2 * VERTICES_PER_OUTLINE;
      expect(emphasis[v]).toBe(inHex1 ? 0.5 : 0);
    }
  });

  it("ignores indices outside the range", () => {
    const emphasis = buildOutlineEmphasis(1, new Map([[5, 1], [-1, 1]]));
    expect(Array.from(emphasis).every((v) => v === 0)).toBe(true);
  });
});

describe("gridFadeOpacity", () => {
  const params = { fadeStart: 4, fadeEnd: 10, baseOpacity: 0.15 };

  it("uses the base opacity near the focus point", () => {
    expect(gridFadeOpacity(0, 0, params)).toBeCloseTo(0.15);
    expect(gridFadeOpacity(4, 0, params)).toBeCloseTo(0.15);
  });

  it("disappears beyond the fade end", () => {
    expect(gridFadeOpacity(10, 0, params)).toBe(0);
    expect(gridFadeOpacity(50, 0, params)).toBe(0);
  });

  it("fades monotonically between start and end", () => {
    const a = gridFadeOpacity(5, 0, params);
    const b = gridFadeOpacity(7, 0, params);
    const c = gridFadeOpacity(9, 0, params);
    expect(a).toBeLessThan(0.15);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
    expect(c).toBeGreaterThan(0);
  });

  it("never drops below the emphasis opacity of an acted-on hex", () => {
    expect(gridFadeOpacity(50, 0.6, params)).toBeCloseTo(0.6);
    expect(gridFadeOpacity(0, 0.6, params)).toBeCloseTo(0.6);
  });
});

describe("gridFadeForCameraDistance", () => {
  it("is unchanged at close zoom", () => {
    expect(gridFadeForCameraDistance(GRID_FADE, 4)).toEqual(GRID_FADE);
    expect(gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE)).toEqual(GRID_FADE);
  });

  it("widens the fade in proportion to the distance when zoomed out", () => {
    const wide = gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE * 2);
    expect(wide.fadeStart).toBeCloseTo(GRID_FADE.fadeStart * 2);
    expect(wide.fadeEnd).toBeCloseTo(GRID_FADE.fadeEnd * 2);
    expect(wide.baseOpacity).toBe(GRID_FADE.baseOpacity);
  });

  it("grows continuously and monotonically with distance", () => {
    const just = gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE + 1e-6);
    expect(just.fadeEnd).toBeCloseTo(GRID_FADE.fadeEnd);
    let prev = GRID_FADE.fadeEnd;
    for (let d = GRID_FADE_ZOOM_DISTANCE; d <= 40; d += 2) {
      const { fadeEnd } = gridFadeForCameraDistance(GRID_FADE, d);
      expect(fadeEnd).toBeGreaterThanOrEqual(prev);
      prev = fadeEnd;
    }
  });

  it("covers a visibly larger area at full zoom-out", () => {
    const zoomedOut = gridFadeForCameraDistance(GRID_FADE, 28);
    expect(zoomedOut.fadeEnd).toBeGreaterThan(GRID_FADE.fadeEnd * 1.5);
  });
});
