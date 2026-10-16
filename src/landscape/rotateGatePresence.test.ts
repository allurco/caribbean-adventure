import { afterEach, describe, expect, it } from "vitest";
import { ignoredUnderGate, rotateGatePresence } from "./rotateGatePresence";

let release: (() => void) | null = null;

afterEach(() => {
  release?.();
  release = null;
});

describe("ignoredUnderGate", () => {
  it("passes keys on while the gate is down", () => {
    const keys: string[] = [];
    const onKey = ignoredUnderGate((key: string) => keys.push(key));
    onKey("Enter");
    expect(keys).toEqual(["Enter"]);
  });

  it("drops keys while the gate shows, so Enter sails nothing under it", () => {
    const keys: string[] = [];
    const onKey = ignoredUnderGate((key: string) => keys.push(key));
    release = rotateGatePresence.show();
    onKey("Enter");
    onKey("Escape");
    expect(keys).toEqual([]);
  });

  it("passes keys on again once the phone is turned and the gate lifts", () => {
    const keys: string[] = [];
    const onKey = ignoredUnderGate((key: string) => keys.push(key));
    release = rotateGatePresence.show();
    release();
    onKey("Enter");
    expect(keys).toEqual(["Enter"]);
  });
});
