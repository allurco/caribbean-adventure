import { afterEach, describe, expect, it } from "vitest";
import { hudStackShowing, showHudStack, subscribeHudStack } from "./hudStackPresence";

// Whether a board's HUD stack is up, for what sits over the board from
// outside it: the harbour link (#125).
describe("hudStackPresence", () => {
  const releases: Array<() => void> = [];
  const show = () => {
    const release = showHudStack();
    releases.push(release);
    return release;
  };
  afterEach(() => releases.splice(0).forEach((release) => release()));

  it("is down until a board shows its stack, and down again once it lets go", () => {
    expect(hudStackShowing()).toBe(false);
    const release = show();
    expect(hudStackShowing()).toBe(true);
    release();
    expect(hudStackShowing()).toBe(false);
  });

  it("stays up while any board shows it: one of several boards on a page letting go leaves it up", () => {
    const first = show();
    show();
    first();
    expect(hudStackShowing()).toBe(true);
  });

  it("lets go once only, however often a release is called", () => {
    const first = show();
    show();
    first();
    first();
    expect(hudStackShowing()).toBe(true);
  });

  it("tells subscribers when it changes, and only then, until they unsubscribe", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeHudStack(() => seen.push(hudStackShowing()));
    const first = show();
    const second = show();
    first();
    second();
    unsubscribe();
    show();
    expect(seen).toEqual([true, false]);
  });
});
