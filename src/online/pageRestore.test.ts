import { describe, expect, it } from "vitest";
import { onPageRestored } from "./pageRestore";

/** A pageshow event as the browser fires it; `persisted` is true when the page came back from the back-forward cache. */
function pageshow(persisted: boolean): Event {
  return Object.assign(new Event("pageshow"), { persisted });
}

describe("onPageRestored", () => {
  it("calls back when Back brings the page out of the back-forward cache", () => {
    const page = new EventTarget();
    let restored = 0;
    onPageRestored(page, () => restored++);
    page.dispatchEvent(pageshow(true));
    expect(restored).toBe(1);
  });

  it("stays quiet on an ordinary page load", () => {
    const page = new EventTarget();
    let restored = 0;
    onPageRestored(page, () => restored++);
    page.dispatchEvent(pageshow(false));
    expect(restored).toBe(0);
  });

  it("stops listening once unsubscribed", () => {
    const page = new EventTarget();
    let restored = 0;
    const stop = onPageRestored(page, () => restored++);
    stop();
    page.dispatchEvent(pageshow(true));
    expect(restored).toBe(0);
  });
});
