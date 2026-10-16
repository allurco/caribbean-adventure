import { describe, expect, it } from "vitest";
import { afterResponse } from "./afterResponse";

/** Work that settles only when `settle` is called, and says whether it has. */
function pendingWork() {
  let settle = () => {};
  const state = { settled: false };
  const work = new Promise<void>((resolve) => {
    settle = () => {
      state.settled = true;
      resolve();
    };
  });
  return { work, settle: () => settle(), state };
}

const raced = (p: Promise<void>) => Promise.race([p.then(() => "done"), new Promise((r) => setTimeout(() => r("waiting"), 20))]);

describe("afterResponse: work that runs after the response where the platform keeps it, else before", () => {
  it("returns at once when the platform took the work", async () => {
    const { work } = pendingWork();
    const kept: Promise<unknown>[] = [];
    const done = afterResponse({ defer: (w) => (kept.push(w), true) }, work);
    expect(await raced(done)).toBe("done");
    expect(kept).toEqual([work]);
  });

  it("awaits the work when the platform did not take it (Vercel's request context missing)", async () => {
    const { work, settle, state } = pendingWork();
    const done = afterResponse({ defer: () => false }, work);
    expect(await raced(done)).toBe("waiting");
    settle();
    await done;
    expect(state.settled).toBe(true);
  });

  it("awaits the work when there is no platform to defer to (tests, local servers)", async () => {
    const { work, settle } = pendingWork();
    const done = afterResponse({}, work);
    expect(await raced(done)).toBe("waiting");
    settle();
    expect(await raced(done)).toBe("done");
  });
});
