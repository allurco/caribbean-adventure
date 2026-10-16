import { describe, expect, it } from "vitest";
import { backdropView, nextBackdropPhase, type BackdropEvent, type BackdropPhase } from "./harbourBackdropState";

const run = (events: BackdropEvent[], from: BackdropPhase = "still"): BackdropPhase => events.reduce(nextBackdropPhase, from);

describe("the harbour backdrop's phases (#122)", () => {
  it("first paints the still alone, with no live scene mounted", () => {
    expect(backdropView("still")).toEqual({ mountScene: false, sceneVisible: false, showStill: true, wavesRunning: false });
  });

  it("mounts the live scene, hidden under the still and with its waves held, once the shell is idle", () => {
    expect(run(["idle"])).toBe("mounting");
    expect(backdropView("mounting")).toEqual({ mountScene: true, sceneVisible: false, showStill: true, wavesRunning: false });
  });

  it("fades the scene in only on its settled signal, and starts the waves with the fade", () => {
    expect(run(["idle", "settled"])).toBe("fading");
    expect(backdropView("fading")).toEqual({ mountScene: true, sceneVisible: true, showStill: true, wavesRunning: true });
  });

  it("lets the still go once the fade has ended", () => {
    expect(run(["idle", "settled", "fadeEnded"])).toBe("live");
    expect(backdropView("live")).toEqual({ mountScene: true, sceneVisible: true, showStill: false, wavesRunning: true });
  });

  it("ignores a settled signal before the scene is mounted, and an end of fade before the fade", () => {
    expect(run(["settled"])).toBe("still");
    expect(run(["idle", "fadeEnded"])).toBe("mounting");
  });

  it("ignores a second idle callback: the scene is mounted once", () => {
    expect(run(["idle", "settled", "idle"])).toBe("fading");
    expect(run(["idle", "settled", "fadeEnded", "idle"])).toBe("live");
  });

  it("falls back to the still for good when the scene fails, whenever it fails", () => {
    for (const before of [[], ["idle"], ["idle", "settled"], ["idle", "settled", "fadeEnded"]] as BackdropEvent[][]) {
      expect(run([...before, "failed"])).toBe("failed");
    }
    expect(run(["idle", "failed", "idle", "settled"])).toBe("failed");
    expect(backdropView("failed")).toEqual({ mountScene: false, sceneVisible: false, showStill: true, wavesRunning: false });
  });
});
