import { describe, expect, it } from "vitest";
import { CASCADE_PRIORITY, SHIP_POSE_PRIORITY, WAVE_CLOCK_PRIORITY } from "./frameOrder";

describe("frame order of the sea", () => {
  it("advances the wave clock before the cascades read it", () => {
    expect(WAVE_CLOCK_PRIORITY).toBeLessThan(CASCADE_PRIORITY);
  });

  it("keeps the wave clock negative, so it does not take over rendering", () => {
    expect(WAVE_CLOCK_PRIORITY).toBeLessThan(0);
  });

  it("poses the ships after the wave clock advances", () => {
    expect(SHIP_POSE_PRIORITY).toBeGreaterThan(WAVE_CLOCK_PRIORITY);
  });

  it("poses the ships after the world copies move and the ships sail (default priority 0)", () => {
    expect(SHIP_POSE_PRIORITY).toBeGreaterThan(0);
  });

  it("poses the ships before the cascades", () => {
    expect(SHIP_POSE_PRIORITY).toBeLessThan(CASCADE_PRIORITY);
  });
});
