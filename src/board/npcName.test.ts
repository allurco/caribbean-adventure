import { describe, expect, it } from "vitest";
import { npcKind, npcName } from "./npcName";

describe("npcName: what the board calls an NPC ship", () => {
  it("is its role, merchant or flotilla", () => {
    expect(npcKind({ role: "MERCHANT" })).toBe("Merchant");
    expect(npcKind({ role: "FLOTILLA" })).toBe("Flotilla");
  });

  it("in a sentence, with its nation and the right article", () => {
    expect(npcName({ role: "FLOTILLA", nation: "Spain" })).toBe("a Spanish flotilla");
    expect(npcName({ role: "MERCHANT", nation: "England" })).toBe("an English merchant");
    expect(npcName({ role: "MERCHANT", nation: "France" })).toBe("a French merchant");
    expect(npcName({ role: "FLOTILLA", nation: "Netherlands" })).toBe("a Dutch flotilla");
  });
});
