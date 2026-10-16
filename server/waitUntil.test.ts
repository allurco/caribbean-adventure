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
    waitUntil(work);
    expect(kept).toEqual([work]);
  });

  it("does nothing, and never throws, off Vercel: no context, or one without waitUntil", () => {
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
    global[CONTEXT] = { get: () => undefined };
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
    global[CONTEXT] = {};
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
  });
});
