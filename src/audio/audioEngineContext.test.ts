import { describe, it, expect, vi, beforeEach } from "vitest";

// A stand-in for three's audio classes: a context whose resume() the test
// controls, and an Audio that only reports playing once a buffer is set.
const context = { state: "suspended" as AudioContextState, resume: vi.fn() };
let resolveLoad: (buffer: AudioBuffer) => void = () => {};

vi.mock("three", () => {
  class AudioListener {
    context = context;
    setMasterVolume() {}
  }
  class Audio {
    isPlaying = false;
    source = { addEventListener() {} };
    gain = { disconnect() {} };
    setLoop() {}
    setVolume() {}
    setBuffer() {}
    play() {
      this.isPlaying = true;
    }
    stop() {
      this.isPlaying = false;
    }
  }
  class AudioLoader {
    loadAsync() {
      return new Promise<AudioBuffer>((resolve) => (resolveLoad = resolve));
    }
  }
  return { Audio, AudioListener, AudioLoader };
});

const { createAudioEngine, installAudioUnlock } = await import("./audioEngine");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  context.state = "suspended";
  context.resume.mockReset();
});

describe("unlocking against a real context state", () => {
  it("is not unlocked while the context stays suspended", () => {
    const engine = createAudioEngine(undefined, "/");
    context.resume.mockResolvedValue(undefined);
    engine.unlock();
    expect(engine.isUnlocked()).toBe(false);
  });

  it("keeps trying on later gestures until the context runs", async () => {
    const engine = createAudioEngine(undefined, "/");
    const target = new EventTarget();
    installAudioUnlock(engine, target);

    // A touch pointerdown is not a user activation: resume() leaves it suspended
    context.resume.mockResolvedValue(undefined);
    target.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(engine.isUnlocked()).toBe(false);

    // The touchend that follows is one: the context starts running
    context.resume.mockImplementation(async () => {
      context.state = "running";
    });
    target.dispatchEvent(new Event("touchend"));
    await flush();
    expect(engine.isUnlocked()).toBe(true);

    // Unlocked, the handlers are gone
    const calls = context.resume.mock.calls.length;
    target.dispatchEvent(new Event("click"));
    await flush();
    expect(context.resume.mock.calls.length).toBe(calls);
  });
});

describe("a sound still loading", () => {
  it("counts as playing until it is stopped", async () => {
    const engine = createAudioEngine(undefined, "/");
    context.resume.mockResolvedValue(undefined);
    engine.unlock();
    const handle = engine.play("sea-waves");
    expect(handle?.isPlaying()).toBe(true);
    handle?.stop();
    expect(handle?.isPlaying()).toBe(false);
  });

  it("keeps playing once its buffer arrives", async () => {
    const engine = createAudioEngine(undefined, "/");
    context.resume.mockResolvedValue(undefined);
    engine.unlock();
    const handle = engine.play("sea-waves");
    resolveLoad({} as AudioBuffer);
    await flush();
    expect(handle?.isPlaying()).toBe(true);
  });
});
