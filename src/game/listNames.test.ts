import { describe, expect, it } from "vitest";
import { listNames } from "./listNames";

describe("listNames", () => {
  it("lists names as a sentence does: none, one, two, then commas and a final and", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["Anne"])).toBe("Anne");
    expect(listNames(["Anne", "Jack"])).toBe("Anne and Jack");
    expect(listNames(["Anne", "Jack", "Mary"])).toBe("Anne, Jack and Mary");
  });
});
