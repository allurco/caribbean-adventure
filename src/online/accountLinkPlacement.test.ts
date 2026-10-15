import { describe, expect, it } from "vitest";
import { accountLinkPlacement, MIN_TAP_TARGET } from "./accountLinkPlacement";

// The corner link over the local game back to the harbour (#125, PR #306).
describe("accountLinkPlacement", () => {
  it("keeps the desktop link in the top right corner, under the turn bar", () => {
    const desktop = accountLinkPlacement("desktop");
    expect(desktop.top).toBe(70);
    expect(desktop.right).toBe(16);
    expect(desktop.minHeight).toBeUndefined();
  });

  it("gives the compact link a 48 px tap target", () => {
    expect(MIN_TAP_TARGET).toBe(48);
    expect(accountLinkPlacement("compact").minHeight).toBe(48);
  });

  it("moves the compact link left of the port panel's column, so it never covers the panel's header", () => {
    // The port panel is 288 px wide, 16 px in from the right edge: 304 px of column.
    expect(accountLinkPlacement("compact").right).toBeGreaterThanOrEqual(304 + 8);
  });

  it("stays at the same top in both layouts, under the 58 px turn bar", () => {
    expect(accountLinkPlacement("compact").top).toBe(70);
  });
});
