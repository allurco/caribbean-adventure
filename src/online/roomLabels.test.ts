import { describe, expect, it } from "vitest";
import { seatRole, turnTimerLabel } from "./roomLabels";

describe("turnTimerLabel", () => {
  it("names a turn timer in the largest whole unit", () => {
    expect(turnTimerLabel(86400)).toBe("24 hours a turn");
    expect(turnTimerLabel(3600)).toBe("an hour a turn");
    expect(turnTimerLabel(7200)).toBe("2 hours a turn");
    expect(turnTimerLabel(120)).toBe("2 minutes a turn");
    expect(turnTimerLabel(60)).toBe("a minute a turn");
    expect(turnTimerLabel(90)).toBe("90 seconds a turn");
  });
});

describe("seatRole", () => {
  it("marks your own seat and the host's, from the room's host and not the seat number", () => {
    expect(seatRole(0, { yourSeat: 0, hostSeat: 0 })).toBe("you, host");
    expect(seatRole(1, { yourSeat: 1, hostSeat: 0 })).toBe("you");
    expect(seatRole(2, { yourSeat: 0, hostSeat: 2 })).toBe("host");
    expect(seatRole(0, { yourSeat: 1, hostSeat: null })).toBe("");
  });
});
