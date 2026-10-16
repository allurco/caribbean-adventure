import { describe, expect, it } from "vitest";
import { IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, whenIdle, type IdleHost } from "./whenIdle";

/** A host whose callbacks run only when the test says so. */
function fakeHost(withIdleCallback: boolean) {
  const idle = new Map<number, { run: () => void; timeout?: number }>();
  const timers = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const host: IdleHost = {
    setTimeout: (run, ms) => {
      timers.set(next, { run, ms });
      return next++;
    },
    clearTimeout: (id) => void timers.delete(id),
    ...(withIdleCallback
      ? {
          requestIdleCallback: (run: () => void, options?: { timeout?: number }) => {
            idle.set(next, { run, timeout: options?.timeout });
            return next++;
          },
          cancelIdleCallback: (id: number) => void idle.delete(id),
        }
      : {}),
  };
  return { host, idle, timers };
}

describe("whenIdle (#122: the live harbour mounts once the shell is idle)", () => {
  it("waits for the browser's idle callback, with a timeout so a busy page still gets it", () => {
    const { host, idle, timers } = fakeHost(true);
    let ran = 0;
    whenIdle(host, () => ran++);
    expect(ran).toBe(0);
    expect(timers.size).toBe(0);
    expect([...idle.values()].map((c) => c.timeout)).toEqual([IDLE_TIMEOUT_MS]);
    for (const c of idle.values()) c.run();
    expect(ran).toBe(1);
  });

  it("falls back to a short timer where there is no idle callback (Safari)", () => {
    const { host, timers } = fakeHost(false);
    let ran = 0;
    whenIdle(host, () => ran++);
    expect([...timers.values()].map((t) => t.ms)).toEqual([IDLE_FALLBACK_MS]);
    for (const t of timers.values()) t.run();
    expect(ran).toBe(1);
  });

  it("cancels: nothing runs once the caller has gone", () => {
    for (const withIdle of [true, false]) {
      const { host, idle, timers } = fakeHost(withIdle);
      const cancel = whenIdle(host, () => {
        throw new Error("ran after cancel");
      });
      cancel();
      expect(idle.size + timers.size).toBe(0);
    }
  });
});
