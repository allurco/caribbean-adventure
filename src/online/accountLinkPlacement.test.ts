import { describe, expect, it } from "vitest";
import { accountLinkPlacement, MIN_TAP_TARGET } from "./accountLinkPlacement";

// The corner link over the local game back to the harbour (#125, PR #306).
// HUD boxes measured at 844×390 and 667×375 (ledger, PR #306): Save & leave
// 208–315 × 48–79, the glory panel 20–228 × 96–149, the captain card from
// y 199 (375 tall), the port panel's left edge 304 px in from the right
// (363 at 667 wide), the link itself about 102 px wide.
const LINK_WIDTH = 102;

describe("accountLinkPlacement", () => {
  it("keeps the desktop link in the top right corner, under the turn bar, with or without it", () => {
    for (const turnBar of [true, false]) {
      expect(accountLinkPlacement("desktop", { turnBar })).toEqual({ top: 70, right: 16 });
    }
  });

  it("gives the compact link a 48 px tap target in either spot", () => {
    expect(MIN_TAP_TARGET).toBe(48);
    expect(accountLinkPlacement("compact", { turnBar: true }).minHeight).toBe(48);
    expect(accountLinkPlacement("compact", { turnBar: false }).minHeight).toBe(48);
  });

  it("joins the HUD's top-left stack on a compact board: under Save & leave, right of the glory panel", () => {
    const { top, left, right } = accountLinkPlacement("compact", { turnBar: true });
    expect(right).toBeUndefined();
    expect(top).toBeGreaterThanOrEqual(79 + 8);
    expect(left).toBeGreaterThanOrEqual(228 + 8);
    // above the captain card on the shortest phone (375 tall)
    expect(top! + MIN_TAP_TARGET).toBeLessThanOrEqual(199 - 8);
    // left of the port panel on the narrowest phone (667 wide)
    expect(left! + LINK_WIDTH).toBeLessThanOrEqual(667 - 304 - 8);
  });

  it("takes the empty top-right corner when the turn bar is down (the captain draft, a fight)", () => {
    expect(accountLinkPlacement("compact", { turnBar: false })).toEqual({ top: 16, right: 16, minHeight: 48 });
  });
});
