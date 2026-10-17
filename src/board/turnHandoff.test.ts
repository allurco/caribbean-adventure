import { describe, it, expect } from "vitest";
import type { NPCShip } from "../game/types";
import { controlsLocked, endedInFight, HANDOFF_TIMING as T, heldNpcsFor, holdsNpcs, startHandoff, turnsInPlay, stepHandoff, turnPassed, type Handoff, type HandoffSignals , npcsHeldNow } from "./turnHandoff";

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

  it("is not while the same turn goes on, nor before a turn has been shown", () => {
    expect(turnPassed({ player: "0", turn: 3 }, { player: "0", turn: 3 })).toBe(false);
    expect(turnPassed(null, { player: "0", turn: 1 })).toBe(false);
  });
});

describe("turnsInPlay", () => {
  it("is while the main phase or a fight is played", () => {
    expect(turnsInPlay({ phase: "main" })).toBe(true);
    expect(turnsInPlay({ phase: "combat" })).toBe(true);
  });

  it("is not in the draft", () => {
    expect(turnsInPlay({ phase: "draft" })).toBe(false);
  });

  it("is not once the game is over, even when a fight won it and left the turn number moved on (#284)", () => {
    expect(turnsInPlay({ phase: null, gameover: { winner: "0" } })).toBe(false);
    expect(turnsInPlay({ phase: "main", gameover: { winner: "0" } })).toBe(false);
  });
});

describe("a turn that ended in a fight (#288)", () => {
  // A fight is a turn of its own in boardgame.io: combat starts one, and main another as it ends
  it("is one the board's turn number jumped two or more across", () => {
    expect(endedInFight({ player: "0", turn: 4 }, { player: "1", turn: 6 })).toBe(true);
  });

  it("is not a turn that passed on by one", () => {
    expect(endedInFight({ player: "0", turn: 4 }, { player: "1", turn: 5 })).toBe(false);
  });

  it("solo: is told from the turn number, the seat being the same", () => {
    expect(endedInFight({ player: "0", turn: 4 }, { player: "0", turn: 6 })).toBe(true);
    expect(endedInFight({ player: "0", turn: 4 }, { player: "0", turn: 5 })).toBe(false);
  });
});

describe("the NPCs a hand-off holds (#288)", () => {
  // Only what the helper reads: which NPCs, and where each stood
  const npc = (id: string, q: number): NPCShip => ({ id, position: { q, r: 0, s: -q } }) as NPCShip;
  const before = { prey: npc("prey", 1), witness: npc("witness", 5) };
  const shown = { player: "0", turn: 4 };
  const passedOn = { player: "1", turn: 5 };
  const afterAFight = { player: "1", turn: 6 };

  it("after a turn without a fight: the NPCs as they stood, even one gone since (a merchant home in port)", () => {
    const after = { witness: npc("witness", 4) };
    expect(heldNpcsFor(before, after, shown, passedOn)).toBe(before);
  });

  it("after a fight: not the NPC sunk or captured in it, the rest where they stood", () => {
    const after = { witness: npc("witness", 4) };
    expect(heldNpcsFor(before, after, shown, afterAFight)).toEqual({ witness: npc("witness", 5) });
  });

  it("after a fight that took no NPC: the NPCs as they stood", () => {
    const after = { prey: npc("prey", 1), witness: npc("witness", 4) };
    expect(heldNpcsFor(before, after, shown, afterAFight)).toEqual(before);
  });
});

describe("whether the NPCs (and the turn's events) are held in this render (#246)", () => {
  const shown = { player: "0", turn: 4 };
  const playing = (h: ReturnType<typeof startHandoff> | null) => ({ handoff: h, active: true, shown, now: { player: "0", turn: 4 } });

  it("from the very render a new turn arrives in, before the hand-off has been started", () => {
    expect(npcsHeldNow({ handoff: { ...startHandoff("0", "1", 0, false), phase: "idle" }, active: true, shown, now: { player: "1", turn: 5 } })).toBe(true);
    expect(npcsHeldNow({ handoff: null, active: true, shown, now: { player: "1", turn: 5 } })).toBe(true);
  });

  it("while the hand-off holds them: the ship sailing on, then the turn-ended banner", () => {
    expect(npcsHeldNow(playing(startHandoff("0", "1", 0, false)))).toBe(true);
    expect(npcsHeldNow(playing({ ...startHandoff("0", "1", 0, false), phase: "turnEnded" }))).toBe(true);
  });

  it("not once the NPCs sail, nor at rest, nor in the draft, nor while a fight is played", () => {
    expect(npcsHeldNow(playing({ ...startHandoff("0", "1", 0, false), phase: "npcs" }))).toBe(false);
    expect(npcsHeldNow(playing({ ...startHandoff("0", "1", 0, false), phase: "idle" }))).toBe(false);
    expect(npcsHeldNow({ handoff: null, active: false, shown: null, now: { player: "0", turn: 1 } })).toBe(false);
    expect(npcsHeldNow({ handoff: null, active: true, shown, now: { player: "0", turn: 5, fight: true } })).toBe(false);
  });
});
