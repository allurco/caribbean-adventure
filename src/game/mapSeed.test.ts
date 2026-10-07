import { describe, it, expect } from "vitest";
import { isValidMapSeed } from "./mapSeed";

describe("isValidMapSeed", () => {
  it("accepts a plain integer within int32, ends included", () => {
    for (const seed of [0, 1, -1, 123456, 2147483647, -2147483648]) {
      expect(isValidMapSeed(seed)).toBe(true);
    }
  });

  it("rejects anything the generator's int32 fold would alias to another seed", () => {
    // `seed | 0` maps each of these onto a different, valid seed's map.
    for (const seed of [1.5, -0.5, 2147483648, -2147483649, 2 ** 32 + 1, NaN, Infinity, -Infinity]) {
      expect(isValidMapSeed(seed)).toBe(false);
    }
  });

  it("rejects a value that is not a number", () => {
    for (const seed of ["1", null, undefined, {}, [1], true, 1n]) {
      expect(isValidMapSeed(seed)).toBe(false);
    }
  });
});
