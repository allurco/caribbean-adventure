/**
 * The maths behind the dev `stats=1` overlay (#162): frames are summed into
 * a window, and once it spans `RENDER_STATS_WINDOW_SECONDS` it reports fps
 * (frames over the window's time) and the draw calls and triangles of an
 * average frame, every pass counted. Pure, no Three.js; `RenderStatsProbe`
 * feeds it `renderer.info` and `RenderStatsOverlay` prints it.
 */

/** One frame: how long it took and what it drew, every pass included. */
export interface FrameSample {
  readonly seconds: number;
  readonly calls: number;
  readonly triangles: number;
}

/** Frames summed since the window opened. */
export interface StatsWindow {
  readonly frames: number;
  readonly seconds: number;
  readonly calls: number;
  readonly triangles: number;
}

/** What the overlay shows: fps over the window, draw calls and triangles per frame. */
export interface RenderStats {
  readonly fps: number;
  readonly calls: number;
  readonly triangles: number;
}

/** How long a window runs before it reports, seconds: long enough to steady the numbers, short enough to follow a zoom. */
export const RENDER_STATS_WINDOW_SECONDS = 0.5;

export const EMPTY_STATS_WINDOW: StatsWindow = { frames: 0, seconds: 0, calls: 0, triangles: 0 };

/** `window` with `frame` added. */
export function addFrame(window: StatsWindow, frame: FrameSample): StatsWindow {
  return {
    frames: window.frames + 1,
    seconds: window.seconds + frame.seconds,
    calls: window.calls + frame.calls,
    triangles: window.triangles + frame.triangles,
  };
}

/** Whether `window` spans the reporting interval. */
export function isWindowFull(window: StatsWindow, seconds = RENDER_STATS_WINDOW_SECONDS): boolean {
  return window.frames > 0 && window.seconds >= seconds;
}

/** The window's averages, or null while it holds no frames or no time. */
export function windowStats(window: StatsWindow): RenderStats | null {
  if (window.frames === 0 || window.seconds <= 0) return null;
  return {
    fps: window.frames / window.seconds,
    calls: window.calls / window.frames,
    triangles: window.triangles / window.frames,
  };
}

/**
 * Carries the probe's reports (inside the Canvas) to the overlay (outside
 * it) without re-rendering the board: the overlay alone subscribes.
 */
export interface RenderStatsFeed {
  readonly publish: (stats: RenderStats) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly latest: () => RenderStats | null;
}

export function createRenderStatsFeed(): RenderStatsFeed {
  let current: RenderStats | null = null;
  const listeners = new Set<() => void>();
  return {
    publish: (stats) => {
      current = stats;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    latest: () => current,
  };
}

/** A count for the overlay: whole below a thousand, then `k`, then `M`. */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 10_000) return `${Math.round(n / 1000)} k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`;
  return `${Math.round(n)}`;
}
