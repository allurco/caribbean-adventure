import { describe, expect, it } from "vitest";
import { CASCADE_PRIORITY, WAVE_CLOCK_PRIORITY } from "./frameOrder";

describe("frame order of the sea", () => {
  it("advances the wave clock before the cascades read it", () => {
    expect(WAVE_CLOCK_PRIORITY).toBeLessThan(CASCADE_PRIORITY);
  });

  it("keeps the wave clock negative, so it does not take over rendering", () => {
    expect(WAVE_CLOCK_PRIORITY).toBeLessThan(0);
  });
});
