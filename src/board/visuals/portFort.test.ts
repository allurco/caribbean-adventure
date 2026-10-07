import { describe, it, expect } from "vitest";
import { portHasFort } from "./portFort";

describe("portHasFort (#84)", () => {
  it("gives a fort to a port with a shipyard", () => {
    expect(portHasFort({ hasPort: true, hasShipyard: true })).toBe(true);
  });

  it("gives none to a port without one, or to a cell that is not a port", () => {
    expect(portHasFort({ hasPort: true, hasShipyard: false })).toBe(false);
    expect(portHasFort({ hasPort: true })).toBe(false);
    expect(portHasFort({ hasPort: false, hasShipyard: true })).toBe(false);
  });
});
