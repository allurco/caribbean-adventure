import { describe, it, expect } from "vitest";
import {
  EMPTY_STATS_WINDOW,
  RENDER_STATS_WINDOW_SECONDS,
  addFrame,
  createRenderStatsFeed,
  formatCount,
  isWindowFull,
  windowStats,
} from "./renderStats";

const frame = (seconds: number, calls: number, triangles: number) => ({ seconds, calls, triangles });

describe("render stats window", () => {
  it("starts empty, with nothing to report", () => {
    expect(EMPTY_STATS_WINDOW).toEqual({ frames: 0, seconds: 0, calls: 0, triangles: 0 });
    expect(windowStats(EMPTY_STATS_WINDOW)).toBeNull();
    expect(isWindowFull(EMPTY_STATS_WINDOW)).toBe(false);
  });

  it("adds frames without changing the window it was given", () => {
    const one = addFrame(EMPTY_STATS_WINDOW, frame(0.02, 100, 5000));
    const two = addFrame(one, frame(0.03, 120, 7000));
    expect(one).toEqual({ frames: 1, seconds: 0.02, calls: 100, triangles: 5000 });
    expect(two).toEqual({ frames: 2, seconds: 0.05, calls: 220, triangles: 12000 });
    expect(EMPTY_STATS_WINDOW.frames).toBe(0);
  });

  it("reports fps over the window's time, and calls and triangles per frame", () => {
    let window = EMPTY_STATS_WINDOW;
    for (let i = 0; i < 30; i++) window = addFrame(window, frame(1 / 60, 200 + (i % 2) * 20, 1_000_000));
    const stats = windowStats(window)!;
    expect(stats.fps).toBeCloseTo(60, 9);
    expect(stats.calls).toBeCloseTo(210, 9);
    expect(stats.triangles).toBeCloseTo(1_000_000, 6);
  });

  it("averages fps as frames over time, so one long frame weighs by its length", () => {
    // Three 10 ms frames and one 70 ms: 4 frames in 0.1 s is 40 fps, not the mean of the per-frame rates.
    let window = EMPTY_STATS_WINDOW;
    for (const s of [0.01, 0.01, 0.01, 0.07]) window = addFrame(window, frame(s, 1, 1));
    expect(windowStats(window)!.fps).toBeCloseTo(40, 9);
  });

  it("has nothing to report while no time has passed", () => {
    expect(windowStats(addFrame(EMPTY_STATS_WINDOW, frame(0, 10, 10)))).toBeNull();
  });

  it("is full once it spans the reporting interval", () => {
    const almost = addFrame(EMPTY_STATS_WINDOW, frame(RENDER_STATS_WINDOW_SECONDS - 0.001, 1, 1));
    expect(isWindowFull(almost)).toBe(false);
    expect(isWindowFull(addFrame(almost, frame(0.001, 1, 1)))).toBe(true);
    expect(isWindowFull(almost, 0.2)).toBe(true);
  });
});

describe("render stats feed", () => {
  it("holds the latest stats and tells its listeners until they unsubscribe", () => {
    const feed = createRenderStatsFeed();
    expect(feed.latest()).toBeNull();
    const heard: number[] = [];
    const unsubscribe = feed.subscribe(() => heard.push(feed.latest()!.fps));
    feed.publish({ fps: 60, calls: 200, triangles: 1e6 });
    feed.publish({ fps: 58, calls: 210, triangles: 1e6 });
    unsubscribe();
    feed.publish({ fps: 30, calls: 210, triangles: 1e6 });
    expect(heard).toEqual([60, 58]);
    expect(feed.latest()!.fps).toBe(30);
  });
});

describe("formatCount", () => {
  it("prints small counts whole, thousands as k and millions as M", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(212.6)).toBe("213");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1500)).toBe("1.5 k");
    expect(formatCount(48_250)).toBe("48 k");
    expect(formatCount(2_940_000)).toBe("2.94 M");
  });
});
