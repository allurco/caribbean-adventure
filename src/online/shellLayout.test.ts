import { describe, expect, it } from "vitest";
import { partyDockFits, shellLayoutFor } from "./shellLayout";

describe("shellLayoutFor", () => {
  it("floats the boards over the harbour on desktop windows, a 1280 laptop's short inner height included", () => {
    expect(shellLayoutFor({ width: 1280, height: 800 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1280, height: 580 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1280, height: 520 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1440, height: 900 })).toBe("desktop");
    expect(shellLayoutFor({ width: 1920, height: 1080 })).toBe("desktop");
    expect(shellLayoutFor({ width: 768, height: 600 })).toBe("desktop");
  });

  it("stands the nav board on its end on a phone held sideways", () => {
    expect(shellLayoutFor({ width: 667, height: 375 })).toBe("compact");
    expect(shellLayoutFor({ width: 844, height: 390 })).toBe("compact");
    expect(shellLayoutFor({ width: 932, height: 430 })).toBe("compact");
  });

  it("uses the compact layout for any window shorter than a phone's top or too narrow for the floating boards", () => {
    expect(shellLayoutFor({ width: 1280, height: 499 })).toBe("compact");
    expect(shellLayoutFor({ width: 700, height: 900 })).toBe("compact");
  });
});

describe("partyDockFits", () => {
  it("leaves the party board off a desktop window too short to stack it under the nav board", () => {
    expect(partyDockFits({ height: 580 })).toBe(false);
    expect(partyDockFits({ height: 520 })).toBe(false);
    expect(partyDockFits({ height: 600 })).toBe(true);
    expect(partyDockFits({ height: 900 })).toBe(true);
  });
});
