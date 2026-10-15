import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosaver } from "./autosaver";

describe("the autosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const written: string[] = [];
    const results: unknown[] = [];
    const saver = createAutosaver<string>({
      delayMs: 1_000,
      write: (state) => {
        written.push(state);
        return { ok: true };
      },
      onResult: (result) => results.push(result),
    });
    return { saver, written, results };
  }

  it("writes the latest state once changes settle, not on every change", () => {
    const { saver, written } = setup();
    saver.offer("a");
    vi.advanceTimersByTime(600);
    saver.offer("b");
    vi.advanceTimersByTime(600);
    expect(written).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(written).toEqual(["b"]);
  });

  it("writes at once on flush (leaving the page, Save & leave), and only once", () => {
    const { saver, written, results } = setup();
    saver.offer("a");
    expect(saver.flush()).toEqual({ ok: true });
    vi.advanceTimersByTime(5_000);
    expect(written).toEqual(["a"]);
    expect(results).toEqual([{ ok: true }]);
  });

  it("has nothing to write on flush when nothing changed since the last write", () => {
    const { saver, written } = setup();
    saver.offer("a");
    vi.advanceTimersByTime(1_000);
    expect(saver.flush()).toEqual({ ok: true });
    expect(written).toEqual(["a"]);
  });

  it("writes nothing more once stopped", () => {
    const { saver, written } = setup();
    saver.offer("a");
    saver.stop();
    saver.offer("b");
    vi.advanceTimersByTime(5_000);
    saver.flush();
    expect(written).toEqual([]);
  });

  it("passes a failed write on, and tries again on the next change", () => {
    const outcomes = [{ ok: false, reason: "quota" } as const, { ok: true } as const];
    const results: unknown[] = [];
    const saver = createAutosaver<string>({ delayMs: 10, write: () => outcomes.shift()!, onResult: (r) => results.push(r) });
    saver.offer("a");
    vi.advanceTimersByTime(10);
    saver.offer("b");
    vi.advanceTimersByTime(10);
    expect(results).toEqual([{ ok: false, reason: "quota" }, { ok: true }]);
  });
});
