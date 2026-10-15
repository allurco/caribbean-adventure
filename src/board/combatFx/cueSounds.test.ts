import { describe, expect, it } from "vitest";
import { cueSound, pickVariant } from "./cueSounds";
import { cuesOf, type CombatCue } from "./cuePlayer";
import type { CombatBeat } from "./combatTimeline";
import { SOUNDS } from "../../audio/soundRegistry";

const VOLLEY: CombatBeat = {
  kind: "volley",
  seconds: 4,
  volleys: [
    {
      shooterId: "0",
      targetId: "1",
      mastFalls: true,
      shots: [
        { fireAt: 0, landAt: 0.5, hit: true },
        { fireAt: 0.3, landAt: 0.8, hit: false },
        { fireAt: 0.6, landAt: 1.1, hit: true },
      ],
    },
  ],
};
const cue = (beat: CombatBeat, type: CombatCue["type"], index = 0) => cuesOf(beat).filter((c) => c.type === type)[index];
const registered = new Set<string>(SOUNDS.map((s) => s.id));

describe("the sounds of a fight's cues (#263)", () => {
  it("every gun has its own report: a cannon sound for each shot fired", () => {
    for (let i = 0; i < 3; i++) {
      const id = cueSound(cue(VOLLEY, "gunFired", i));
      expect(id).toMatch(/^cannon-/);
      expect(registered.has(id!)).toBe(true);
    }
  });

  it("only plays sounds the registry has", () => {
    const sink: CombatBeat = { kind: "sink", shipId: "1", shooterId: "0", seconds: 6 };
    const board: CombatBeat = { kind: "closeAlongside", attackerId: "0", defenderId: "1", seconds: 5 };
    for (const beat of [VOLLEY, sink, board]) {
      for (const c of cuesOf(beat)) {
        const id = cueSound(c);
        if (id !== null) expect(registered.has(id)).toBe(true);
      }
    }
  });

  it("the beat's start is silent: the guns, hits and wreck make the noise", () => {
    expect(cueSound(cue(VOLLEY, "beatStart"))).toBeNull();
  });

  it("picks among variations by the shot's index, the same on every seat", () => {
    expect(pickVariant(["a", "b", "c"], 0)).toBe("a");
    expect(pickVariant(["a", "b", "c"], 4)).toBe("b");
    expect(pickVariant([], 4)).toBeNull();
  });
});
