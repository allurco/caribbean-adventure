import { describe, expect, it } from "vitest";
import { canLockLandscape, lockLandscape, type LockPorts } from "./landscapeLock";

/** A browser with both APIs (Android Chrome), recording the calls made on it. */
function androidChrome(overrides: Partial<LockPorts> = {}) {
  const calls: string[] = [];
  const ports: LockPorts = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    requestFullscreen: async () => {
      calls.push("fullscreen");
    },
    lockOrientation: async (orientation) => {
      calls.push(`lock ${orientation}`);
    },
    ...overrides,
  };
  return { ports, calls };
}

describe("canLockLandscape", () => {
  it("is true where full screen and the orientation lock both exist", () => {
    expect(canLockLandscape(androidChrome().ports)).toBe(true);
  });

  it("is false on iOS, which has no orientation lock", () => {
    expect(canLockLandscape(androidChrome({ lockOrientation: undefined }).ports)).toBe(false);
  });

  it("is false without full screen, which the lock needs", () => {
    expect(canLockLandscape(androidChrome({ requestFullscreen: undefined }).ports)).toBe(false);
    expect(canLockLandscape(androidChrome({ fullscreenEnabled: false }).ports)).toBe(false);
  });
});

describe("lockLandscape", () => {
  it("goes full screen, then locks to landscape", async () => {
    const { ports, calls } = androidChrome();
    await expect(lockLandscape(ports)).resolves.toBe(true);
    expect(calls).toEqual(["fullscreen", "lock landscape"]);
  });

  it("only locks when already full screen", async () => {
    const { ports, calls } = androidChrome({ fullscreenElement: {} });
    await expect(lockLandscape(ports)).resolves.toBe(true);
    expect(calls).toEqual(["lock landscape"]);
  });

  it("does nothing where the APIs are missing", async () => {
    const { ports, calls } = androidChrome({ lockOrientation: undefined });
    await expect(lockLandscape(ports)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it("never throws when full screen is refused, and does not try the lock", async () => {
    const { ports, calls } = androidChrome({
      requestFullscreen: () => Promise.reject(new TypeError("Permissions check failed")),
    });
    await expect(lockLandscape(ports)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it("never throws when the lock is refused", async () => {
    const { ports } = androidChrome({
      lockOrientation: () => Promise.reject(new DOMException("not supported", "NotSupportedError")),
    });
    await expect(lockLandscape(ports)).resolves.toBe(false);
  });

  it("never throws when a call throws at once rather than rejecting", async () => {
    const { ports } = androidChrome({
      requestFullscreen: () => {
        throw new Error("old browser");
      },
    });
    await expect(lockLandscape(ports)).resolves.toBe(false);
  });
});
