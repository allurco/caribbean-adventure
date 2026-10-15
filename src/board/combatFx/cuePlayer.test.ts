import { describe, expect, it } from "vitest";
import { createCuePlayer, cuesOf, type CombatCue } from "./cuePlayer";
import type { CombatBeat, VolleyBeat } from "./combatTimeline";

const VOLLEY: VolleyBeat = {
  kind: "volley",
  seconds: 3,
  volleys: [
    {
      shooterId: "0",
      targetId: "1",
      mastFalls: false,
      shots: [
        { fireAt: 0, landAt: 0.5, hit: true },
        { fireAt: 0.3, landAt: 0.75, hit: false },
      ],
    },
  ],
};
const DECLARE: CombatBeat = { kind: "declare", attackerId: "0", defenderId: "1", seconds: 2 };
const SINK: CombatBeat = { kind: "sink", shipId: "1", shooterId: "0", seconds: 4 };

const kinds = (cues: readonly CombatCue[]) => cues.map((c) => c.type);

describe("a beat's cues: the moments the table sees and hears (#263)", () => {
  it("a volley: each gun fires, then each shot strikes or splashes", () => {
    const cues = cuesOf(VOLLEY);
    expect(cues.map((c) => [c.type, c.at])).toEqual([
      ["beatStart", 0],
      ["gunFired", 0],
      ["gunFired", 0.3],
      ["shotHit", 0.5],
      ["shotSplashed", 0.75],
    ]);
  });

  it("a sink groans, breaks up, and is gone at the end", () => {
    expect(kinds(cuesOf(SINK))).toEqual(["beatStart", "hullGroans", "shipBreaksUp", "shipGone"]);
    expect(cuesOf(SINK).at(-1)?.at).toBe(4);
  });

  it("boarding throws the grapples on the way in", () => {
    expect(kinds(cuesOf({ kind: "closeAlongside", attackerId: "0", defenderId: "npc-1", seconds: 5 }))).toEqual(["beatStart", "grapplesThrown"]);
  });

  it("a flight runs, then shows how it ended", () => {
    const cues = cuesOf({ kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "caught", seconds: 5 });
    expect(kinds(cues)).toEqual(["beatStart", "fleeEnded"]);
  });
});

describe("the cue player: beats one after another, cues as their time comes", () => {
  it("hands out each cue once, when its time has passed", () => {
    const player = createCuePlayer();
    player.enqueue([VOLLEY]);
    expect(kinds(player.advance(0.01))).toEqual(["beatStart", "gunFired"]);
    expect(kinds(player.advance(0.3))).toEqual(["gunFired"]);
    expect(kinds(player.advance(0.5))).toEqual(["shotHit", "shotSplashed"]);
    expect(player.advance(5)).toEqual([]);
  });

  it("plays the next beat only once the last one is done", () => {
    const player = createCuePlayer();
    player.enqueue([DECLARE, SINK]);
    expect(kinds(player.advance(0.1))).toEqual(["beatStart"]);
    expect(player.advance(1.5)).toEqual([]);
    expect(kinds(player.advance(0.5))).toEqual(["beatStart", "hullGroans"]);
  });

  it("tells each cue's beat and when that beat started", () => {
    const player = createCuePlayer();
    player.advance(1);
    player.enqueue([VOLLEY]);
    const [start] = player.advance(0.01);
    expect(start.beat).toBe(VOLLEY);
    expect(start.beatStartedAt).toBeCloseTo(1, 6);
    expect(player.time()).toBeCloseTo(1.01, 6);
  });

  it("is idle with nothing queued", () => {
    const player = createCuePlayer();
    expect(player.busy()).toBe(false);
    player.enqueue([DECLARE]);
    expect(player.busy()).toBe(true);
    player.advance(3);
    expect(player.busy()).toBe(false);
  });
});
