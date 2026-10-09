import { describe, it, expect } from "vitest";
import { createAmbienceBed } from "./ambienceBed";
import type { PlayOptions, SoundHandle } from "./audioEngine";
import type { SoundId } from "./soundRegistry";
import { soundById } from "./soundRegistry";
import { AMBIENCE_WIDE_FLOOR, ambienceMix } from "./ambienceMix";

interface FakeSound {
  id: SoundId;
  options: PlayOptions;
  volume: number;
  volumeCalls: number;
  stopped: boolean;
}

/** An engine that refuses to play until unlocked, and records what it plays. */
function fakeEngine() {
  const sounds: FakeSound[] = [];
  let unlocked = false;
  return {
    sounds,
    unlock: () => void (unlocked = true),
    play(id: SoundId, options: PlayOptions = {}): SoundHandle | null {
      if (!unlocked) return null;
      const sound: FakeSound = { id, options, volume: options.volume ?? 0, volumeCalls: 0, stopped: false };
      sounds.push(sound);
      return {
        stop: () => void (sound.stopped = true),
        isPlaying: () => !sound.stopped,
        setVolume: (v) => {
          sound.volume = v;
          sound.volumeCalls++;
        },
        setLoop: () => {},
      };
    },
  };
}

const playing = (engine: ReturnType<typeof fakeEngine>, id: SoundId) =>
  engine.sounds.find((s) => s.id === id && !s.stopped);

describe("ambience bed", () => {
  it("plays nothing before audio is unlocked", () => {
    const engine = fakeEngine();
    const bed = createAmbienceBed(engine);
    bed.setDistance(4.32);
    bed.setDistance(20);
    expect(engine.sounds).toHaveLength(0);
    expect(bed.levels().playing).toBe(false);
  });

  it("starts both layers looping on the first frame after the unlock", () => {
    const engine = fakeEngine();
    const bed = createAmbienceBed(engine);
    bed.setDistance(4.32);
    engine.unlock();
    bed.setDistance(4.32);
    expect(engine.sounds.map((s) => s.id).sort()).toEqual(["sea-close", "sea-wide"]);
    for (const s of engine.sounds) expect(s.options.loop).toBe(true);
    expect(bed.levels().playing).toBe(true);
  });

  it("sets each layer to its mix gain times its base volume", () => {
    const engine = fakeEngine();
    engine.unlock();
    const bed = createAmbienceBed(engine);
    bed.setDistance(4.32);
    expect(playing(engine, "sea-close")?.volume).toBeCloseTo(soundById("sea-close").volume, 9);
    expect(playing(engine, "sea-wide")?.volume).toBeCloseTo(AMBIENCE_WIDE_FLOOR * soundById("sea-wide").volume, 9);

    bed.setDistance(25);
    expect(playing(engine, "sea-close")?.volume).toBeCloseTo(0, 9);
    expect(playing(engine, "sea-wide")?.volume).toBeCloseTo(soundById("sea-wide").volume, 9);
    expect(bed.levels().mix).toEqual(ambienceMix(25));
  });

  it("does not touch the gains while the distance holds", () => {
    const engine = fakeEngine();
    engine.unlock();
    const bed = createAmbienceBed(engine);
    bed.setDistance(9);
    bed.setDistance(9);
    bed.setDistance(9);
    for (const s of engine.sounds) expect(s.volumeCalls).toBe(0);
  });

  it("applies a new base volume at once", () => {
    const engine = fakeEngine();
    engine.unlock();
    const bed = createAmbienceBed(engine);
    bed.setDistance(25);
    bed.setBaseVolume("wide", 0.8);
    expect(playing(engine, "sea-wide")?.volume).toBeCloseTo(0.8, 9);
    expect(bed.levels().base.wide).toBe(0.8);
    expect(bed.levels().gains.wide).toBeCloseTo(0.8, 9);
  });

  it("stops both layers and starts again on the next frame", () => {
    const engine = fakeEngine();
    engine.unlock();
    const bed = createAmbienceBed(engine);
    bed.setDistance(9);
    bed.stop();
    expect(engine.sounds.every((s) => s.stopped)).toBe(true);
    expect(bed.levels().playing).toBe(false);
    bed.setDistance(9);
    expect(engine.sounds.filter((s) => !s.stopped)).toHaveLength(2);
  });

  it("stays stopped while paused, even as the distance changes", () => {
    const engine = fakeEngine();
    engine.unlock();
    const bed = createAmbienceBed(engine);
    bed.setPaused(true);
    bed.setDistance(9);
    expect(engine.sounds).toHaveLength(0);
    bed.setPaused(false);
    bed.setDistance(9);
    expect(engine.sounds).toHaveLength(2);
    bed.setPaused(true);
    expect(engine.sounds.every((s) => s.stopped)).toBe(true);
  });
});
