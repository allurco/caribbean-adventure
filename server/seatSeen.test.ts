import { describe, expect, it } from "vitest";
import { MISSING_LAST_SEEN_COLUMN, seenFailureReporter } from "./seatSeen";

const missingColumn = () => Object.assign(new Error("column seats.last_seen_at does not exist"), { code: "42703" });

function recording() {
  const lines: unknown[][] = [];
  return { lines, report: seenFailureReporter((...args) => void lines.push(args)) };
}

describe("seenFailureReporter: a last-seen failure costs a log line, never the request", () => {
  it("names the missing column and the migration to push, once per instance however often it fails", () => {
    const { lines, report } = recording();
    for (let i = 0; i < 5; i++) report("reading when seats were last seen failed", missingColumn());
    expect(lines).toEqual([[MISSING_LAST_SEEN_COLUMN]]);
    expect(MISSING_LAST_SEEN_COLUMN).toBe("seats.last_seen_at missing: push migration 20261022000000");
  });

  it("logs every other failure as the error it is, each time", () => {
    const { lines, report } = recording();
    const timeout = new Error("timeout");
    report("reading when seats were last seen failed", timeout);
    report("recording a seat as seen failed", timeout);
    expect(lines).toEqual([
      ["reading when seats were last seen failed", timeout],
      ["recording a seat as seen failed", timeout],
    ]);
  });

  it("keeps logging other failures after the missing column was reported", () => {
    const { lines, report } = recording();
    const refused = { code: "42501", message: "permission denied" };
    report("reading when seats were last seen failed", missingColumn());
    report("reading when seats were last seen failed", refused);
    report("reading when seats were last seen failed", missingColumn());
    expect(lines).toEqual([[MISSING_LAST_SEEN_COLUMN], ["reading when seats were last seen failed", refused]]);
  });
});
