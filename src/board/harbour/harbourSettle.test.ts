import { describe, expect, it } from "vitest";
import { HARBOUR_SETTLE_FRAMES, isSettled, settleStep, shouldCompile, UNSETTLED, type SettleEvent } from "./harbourSettle";

const run = (events: SettleEvent[]) => events.reduce(settleStep, UNSETTLED);
const frames = (n: number): SettleEvent[] => Array.from({ length: n }, () => "frame");

describe("the harbour's settled frame (#122: the fade waits on it, not a timer)", () => {
  it("is not settled however many frames draw before the world and the sky are in", () => {
    expect(isSettled(run(frames(100)))).toBe(false);
    expect(isSettled(run(["world", ...frames(100)]))).toBe(false);
    expect(isSettled(run(["sky", ...frames(100)]))).toBe(false);
  });

  it("compiles the scene's shaders once the world is built and the sky baked, in either order", () => {
    expect(shouldCompile(run(["world"]))).toBe(false);
    expect(shouldCompile(run(["world", "sky"]))).toBe(true);
    expect(shouldCompile(run(["sky", "world"]))).toBe(true);
    expect(shouldCompile(run(["sky", "world", "compiled"]))).toBe(false);
  });

  it("settles after a run of frames drawn once the shaders are compiled", () => {
    const compiled: SettleEvent[] = ["world", "sky", ...frames(5), "compiled"];
    expect(isSettled(run([...compiled, ...frames(HARBOUR_SETTLE_FRAMES - 1)]))).toBe(false);
    expect(isSettled(run([...compiled, ...frames(HARBOUR_SETTLE_FRAMES)]))).toBe(true);
    expect(isSettled(run([...compiled, ...frames(HARBOUR_SETTLE_FRAMES + 20)]))).toBe(true);
  });

  it("draws at least two frames before it settles: the sea and its prepasses compile on their first draw", () => {
    expect(HARBOUR_SETTLE_FRAMES).toBeGreaterThanOrEqual(2);
  });
});
