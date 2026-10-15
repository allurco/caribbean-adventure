import { describe, expect, it } from "vitest";
import { shellLayoutFor } from "./shellLayout";

describe("shellLayoutFor", () => {
  it("floats the boards over the harbour on desktop windows", () => {
    expect(shellLayoutFor({ width: 1280, height: 800 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1440, height: 900 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1920, height: 1080 })).toBe("desktop");
    expect(shellLayoutFor({ width: 768, height: 600 })).toBe("desktop");
  });

  it("stands the nav board on its end on a phone held sideways", () => {
    expect(shellLayoutFor({ width: 667, height: 375 })).toBe("compact");
    expect(shellLayoutFor({ width: 844, height: 390 })).toBe("compact");
    expect(shellLayoutFor({ width: 932, height: 430 })).toBe("compact");
  });

  it("uses the compact layout for any window too short or too narrow for the floating boards", () => {
    expect(shellLayoutFor({ width: 1280, height: 520 })).toBe("compact");
    expect(shellLayoutFor({ width: 1280, height: 580 })).toBe("compact");
    expect(shellLayoutFor({ width: 700, height: 900 })).toBe("compact");
  });
});
