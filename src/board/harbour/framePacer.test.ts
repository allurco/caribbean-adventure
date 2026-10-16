import { describe, expect, it } from "vitest";
import { createFramePacer, HARBOUR_FPS } from "./framePacer";

/** How many of a display's refreshes over `seconds` the pacer draws. */
function drawsOver(displayHz: number, seconds: number, fps = HARBOUR_FPS): number {
  const pacer = createFramePacer(fps);
  let draws = 0;
  for (let i = 0; i < displayHz * seconds; i++) if (pacer.shouldDraw((i * 1000) / displayHz)) draws++;
  return draws;
}

describe("the harbour's frame pacer (#122: about 30 fps, on demand)", () => {
  it("draws about 30 frames a second on 60, 90, 120 and 144 Hz displays", () => {
    for (const hz of [60, 90, 120, 144]) {
      const perSecond = drawsOver(hz, 10) / 10;
      expect(perSecond, `${hz} Hz`).toBeGreaterThanOrEqual(29);
      expect(perSecond, `${hz} Hz`).toBeLessThanOrEqual(30.1);
    }
  });

  it("draws every refresh of a display slower than 30 Hz, never more", () => {
    expect(drawsOver(24, 10)).toBe(240);
  });

  it("draws the first frame at once", () => {
    expect(createFramePacer(30).shouldDraw(12345)).toBe(true);
  });

  it("after a long gap (a hidden tab) draws once, then keeps its pace rather than catching up", () => {
    const pacer = createFramePacer(30);
    pacer.shouldDraw(0);
    expect(pacer.shouldDraw(5000)).toBe(true);
    expect(pacer.shouldDraw(5000 + 1000 / 60)).toBe(false);
    expect(pacer.shouldDraw(5000 + 2000 / 60)).toBe(true);
  });
});
