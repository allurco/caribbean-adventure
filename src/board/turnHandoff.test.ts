import { describe, it, expect } from "vitest";
import { controlsLocked, HANDOFF_TIMING as T, holdsNpcs, startHandoff, stepHandoff, turnPassed, type Handoff, type HandoffSignals } from "./turnHandoff";

const calm = (now: number, over: Partial<HandoffSignals> = {}): HandoffSignals => ({
  now,
  shipAtRest: true,
  npcsAtRest: true,
  turnShown: false,
  ...over,
});

describe("turn hand-off", () => {
  it("waits for the outgoing ship to come to rest before the turn-ended beat", () => {
    const h = startHandoff("0", "1", 0, false);
    expect(stepHandoff(h, calm(500, { shipAtRest: false })).phase).toBe("sailing");
    expect(stepHandoff(h, calm(900)).phase).toBe("turnEnded");
  });

  it("does not take a ship that has not yet reported way on as at rest", () => {
    const h = startHandoff("0", "1", 0, false);
    expect(stepHandoff(h, calm(T.sailingMin - 1))).toBe(h);
    expect(stepHandoff(h, calm(T.sailingMin)).phase).toBe("turnEnded");
  });

  it("waits out a slow reversal (well over 2.5 s) before giving up", () => {
    const h = startHandoff("0", "1", 0, false);
    expect(stepHandoff(h, calm(3000, { shipAtRest: false })).phase).toBe("sailing");
    expect(T.sailingMax).toBeGreaterThanOrEqual(5000);
  });

  it("gives up waiting for a ship that never settles", () => {
    const h = startHandoff("0", "1", 0, false);
    expect(stepHandoff(h, calm(T.sailingMax, { shipAtRest: false })).phase).toBe("turnEnded");
  });

  it("holds the turn-ended beat for its length, shorter under reduced motion", () => {
    const beat = (reduced: boolean): Handoff => ({ ...startHandoff("0", "1", 0, reduced), phase: "turnEnded" });
    expect(stepHandoff(beat(false), calm(T.turnEnded - 1)).phase).toBe("turnEnded");
    expect(stepHandoff(beat(false), calm(T.turnEnded)).phase).toBe("npcs");
    expect(stepHandoff(beat(true), calm(T.turnEndedReduced)).phase).toBe("npcs");
  });

  it("lets the NPCs sail, then moves on once they are at rest", () => {
    const h: Handoff = { ...startHandoff("0", "1", 0, false), phase: "npcs" };
    expect(stepHandoff(h, calm(T.npcsMin - 1)).phase).toBe("npcs");
    expect(stepHandoff(h, calm(1000, { npcsAtRest: false })).phase).toBe("npcs");
    expect(stepHandoff(h, calm(1000)).phase).toBe("nextTurn");
    expect(stepHandoff(h, calm(T.npcsMax, { npcsAtRest: false })).phase).toBe("nextTurn");
  });

  it("ends when the next turn has been announced, or after its time limit", () => {
    const h: Handoff = { ...startHandoff("0", "1", 0, false), phase: "nextTurn" };
    expect(stepHandoff(h, calm(100)).phase).toBe("nextTurn");
    expect(stepHandoff(h, calm(100, { turnShown: true })).phase).toBe("idle");
    expect(stepHandoff(h, calm(T.nextTurnMax)).phase).toBe("idle");
  });

  it("starts its clock at its first step when started without one", () => {
    const h = startHandoff("0", "1", null, false);
    const stamped = stepHandoff(h, calm(5000));
    expect(stamped).toMatchObject({ phase: "sailing", startedAt: 5000, phaseStartedAt: 5000 });
    expect(stepHandoff(stamped, calm(5000 + T.sailingMin)).phase).toBe("turnEnded");
  });

  it("never runs past its overall limit", () => {
    const h: Handoff = { ...startHandoff("0", "1", 0, false), phase: "npcs", phaseStartedAt: T.total - 10 };
    expect(stepHandoff(h, calm(T.total, { npcsAtRest: false })).phase).toBe("idle");
  });

  it("plays the phases in order from a calm board", () => {
    let h = startHandoff("0", "1", 0, false);
    const seen = [h.phase];
    for (let now = 0; now <= T.total && h.phase !== "idle"; now += 50) {
      const next = stepHandoff(h, calm(now, { turnShown: h.phase === "nextTurn" && now - h.phaseStartedAt > 1000 }));
      if (next.phase !== h.phase) seen.push(next.phase);
      h = next;
    }
    expect(seen).toEqual(["sailing", "turnEnded", "npcs", "nextTurn", "idle"]);
  });

  it("holds the NPCs back until their phase, and the controls until the end", () => {
    const at = (phase: Handoff["phase"]): Handoff => ({ ...startHandoff("0", "1", 0, false), phase });
    expect(holdsNpcs(at("sailing"))).toBe(true);
    expect(holdsNpcs(at("turnEnded"))).toBe(true);
    expect(holdsNpcs(at("npcs"))).toBe(false);
    expect(holdsNpcs(null)).toBe(false);
    expect(controlsLocked(at("nextTurn"))).toBe(true);
    expect(controlsLocked(at("idle"))).toBe(false);
    expect(controlsLocked(null)).toBe(false);
  });
});

describe("turnPassed", () => {
  it("is a new turn when the turn number moves on, to another seat or, solo, the same one (#278)", () => {
    expect(turnPassed({ player: "0", turn: 3 }, { player: "1", turn: 4 })).toBe(true);
    expect(turnPassed({ player: "0", turn: 3 }, { player: "0", turn: 4 })).toBe(true);
  });

  it("is not as a fight begins: the fight is played within the attacker's turn (#284)", () => {
    expect(turnPassed({ player: "0", turn: 3 }, { player: "0", turn: 4, fight: true })).toBe(false);
  });

  it("is once the fight ends and the turn moves on, from the attacker (#284)", () => {
    expect(turnPassed({ player: "0", turn: 3 }, { player: "1", turn: 5 })).toBe(true);
  });

  it("is not while the same turn goes on, nor before a turn has been shown", () => {
    expect(turnPassed({ player: "0", turn: 3 }, { player: "0", turn: 3 })).toBe(false);
    expect(turnPassed(null, { player: "0", turn: 1 })).toBe(false);
  });
});
