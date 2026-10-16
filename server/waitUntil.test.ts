import { afterEach, describe, expect, it } from "vitest";
import { waitUntil } from "./waitUntil";

const CONTEXT = Symbol.for("@vercel/request-context");
const global = globalThis as { [CONTEXT]?: unknown };

afterEach(() => {
  delete global[CONTEXT];
});

describe("waitUntil: work kept running after the response, on Vercel", () => {
  it("hands the work to the request context the Vercel runtime sets", () => {
    const kept: Promise<unknown>[] = [];
    global[CONTEXT] = { get: () => ({ waitUntil: (work: Promise<unknown>) => void kept.push(work) }) };
    const work = Promise.resolve();
    expect(waitUntil(work)).toBe(true);
    expect(kept).toEqual([work]);
  });

  it("says it kept nothing, and never throws, off Vercel: no context, or one without waitUntil", () => {
    expect(waitUntil(Promise.resolve())).toBe(false);
    global[CONTEXT] = { get: () => undefined };
    expect(waitUntil(Promise.resolve())).toBe(false);
    global[CONTEXT] = { get: () => ({}) };
    expect(waitUntil(Promise.resolve())).toBe(false);
    global[CONTEXT] = {};
    expect(waitUntil(Promise.resolve())).toBe(false);
  });
});
