import { describe, expect, it } from "vitest";
import { SEAL_WAXES, sealFor } from "./seal";

describe("sealFor", () => {
  it("presses the initials of the first and last word of the display name", () => {
    expect(sealFor("a", "Anne Bonny").initials).toBe("AB");
    expect(sealFor("a", "Calico Jack Rackham").initials).toBe("CR");
    expect(sealFor("a", "blackbeard").initials).toBe("B");
    expect(sealFor("a", "  Mary   Read ").initials).toBe("MR");
  });

  it("keeps a letter outside the basic plane whole", () => {
    expect(sealFor("a", "𝔄nne").initials).toBe("𝔄");
  });

  it("has a blank seal for an empty name", () => {
    expect(sealFor("a", "   ").initials).toBe("");
  });

  it("gives a captain the same wax every time, from their account id", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(sealFor(id, "Anne").wax).toBe(sealFor(id, "Someone else").wax);
    expect(SEAL_WAXES).toContain(sealFor(id, "Anne").wax);
  });

  it("spreads captains over the waxes", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const used = new Set(ids.map((id) => sealFor(id, "x").wax));
    expect(used.size).toBeGreaterThan(SEAL_WAXES.length / 2);
  });
});
