import { describe, expect, it } from "vitest";
import { onFirstGesture } from "./firstGesture";

describe("onFirstGesture", () => {
  it("runs on the first tap's release, once", () => {
    const target = new EventTarget();
    let runs = 0;
    onFirstGesture(target, () => runs++);
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("touchend"));
    expect(runs).toBe(1);
  });

  it("counts a touchend where pointer events are missing", () => {
    const target = new EventTarget();
    let runs = 0;
    onFirstGesture(target, () => runs++);
    target.dispatchEvent(new Event("touchend"));
    expect(runs).toBe(1);
  });

  it("ignores a touch going down, which grants no user activation", () => {
    const target = new EventTarget();
    let runs = 0;
    onFirstGesture(target, () => runs++);
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("touchstart"));
    expect(runs).toBe(0);
  });

  it("runs nothing once disarmed", () => {
    const target = new EventTarget();
    let runs = 0;
    const disarm = onFirstGesture(target, () => runs++);
    disarm();
    target.dispatchEvent(new Event("pointerup"));
    expect(runs).toBe(0);
  });
});
