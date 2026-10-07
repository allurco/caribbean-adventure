import { describe, it, expect, vi } from "vitest";
import { createAudioEngine, installAudioUnlock } from "./audioEngine";

function fakeEngine() {
  const engine = createAudioEngine(undefined, "/");
  // Unlocking needs a browser AudioContext; count the calls instead.
  const unlock = vi.fn();
  return { ...engine, unlock };
}

describe("createAudioEngine before unlock", () => {
  it("stays silent and touches no AudioContext", () => {
    const engine = createAudioEngine(undefined, "/");
    expect(engine.isUnlocked()).toBe(false);
    expect(engine.play("ui-click")).toBeNull();
  });

  it("shares settings with subscribers and saves them", () => {
    const saved: Record<string, string> = {};
    const storage = { getItem: (k: string) => saved[k] ?? null, setItem: (k: string, v: string) => void (saved[k] = v) };
    const engine = createAudioEngine(storage, "/");
    const notify = vi.fn();
    const unsubscribe = engine.subscribe(notify);
    engine.setSettings({ muted: true, volume: 0.2 });
    expect(engine.getSettings()).toEqual({ muted: true, volume: 0.2 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(createAudioEngine(storage, "/").getSettings()).toEqual({ muted: true, volume: 0.2 });
    unsubscribe();
    engine.setSettings({ muted: false, volume: 0.2 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("installAudioUnlock", () => {
  it("unlocks once, on the first pointerdown or keydown", () => {
    const engine = fakeEngine();
    const target = new EventTarget();
    installAudioUnlock(engine, target);
    target.dispatchEvent(new Event("pointermove"));
    expect(engine.unlock).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("keydown"));
    target.dispatchEvent(new Event("pointerdown"));
    expect(engine.unlock).toHaveBeenCalledTimes(1);
  });

  it("can be removed before any gesture", () => {
    const engine = fakeEngine();
    const target = new EventTarget();
    installAudioUnlock(engine, target)();
    target.dispatchEvent(new Event("pointerdown"));
    expect(engine.unlock).not.toHaveBeenCalled();
  });
});
