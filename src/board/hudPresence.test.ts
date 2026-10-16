import { afterEach, describe, expect, it } from "vitest";
import { hudStackPresence, portPanelPresence, type PresenceFlag } from "./hudPresence";

// Whether a part of a board's HUD is up, for what sits over the board from
// outside it: the harbour link (#125) reads the HUD stack and the port panel.
describe.each([
  ["the HUD stack", hudStackPresence],
  ["the port panel", portPanelPresence],
])("presence of %s", (_name, flag: PresenceFlag) => {
  const releases: Array<() => void> = [];
  const show = () => {
    const release = flag.show();
    releases.push(release);
    return release;
  };
  afterEach(() => releases.splice(0).forEach((release) => release()));

  it("is down until a board shows it, and down again once it lets go", () => {
    expect(flag.showing()).toBe(false);
    const release = show();
    expect(flag.showing()).toBe(true);
    release();
    expect(flag.showing()).toBe(false);
  });

  it("stays up while any board shows it: one of several boards on a page letting go leaves it up", () => {
    const first = show();
    show();
    first();
    expect(flag.showing()).toBe(true);
  });

  it("lets go once only, however often a release is called", () => {
    const first = show();
    show();
    first();
    first();
    expect(flag.showing()).toBe(true);
  });

  it("tells subscribers when it changes, and only then, until they unsubscribe", () => {
    const seen: boolean[] = [];
    const unsubscribe = flag.subscribe(() => seen.push(flag.showing()));
    const first = show();
    const second = show();
    first();
    second();
    unsubscribe();
    show();
    expect(seen).toEqual([true, false]);
  });
});

describe("the HUD's presence flags", () => {
  it("are independent: the port panel opening leaves the HUD stack down", () => {
    const release = portPanelPresence.show();
    expect(hudStackPresence.showing()).toBe(false);
    expect(portPanelPresence.showing()).toBe(true);
    release();
  });
});
