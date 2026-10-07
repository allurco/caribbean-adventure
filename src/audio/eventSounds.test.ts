import { describe, it, expect } from "vitest";
import { soundForEvent, soundsForEvents } from "./eventSounds";

describe("soundForEvent", () => {
  it("maps the moves this slice has sounds for", () => {
    expect(soundForEvent({ type: "shipSailed", shipId: "0" })).toBe("ship-wash");
    expect(soundForEvent({ type: "goodsBought", shipId: "0", good: "Rum", amount: 1 })).toBe("coins");
    expect(soundForEvent({ type: "goodsSold", shipId: "0", good: "Rum", amount: 1 })).toBe("coins");
    expect(soundForEvent({ type: "upgradeBought", shipId: "0", upgradeId: "x" })).toBe("coins");
    expect(soundForEvent({ type: "shipRepaired", shipId: "0" })).toBe("coins");
    expect(soundForEvent({ type: "shipBought", shipId: "0", shipClass: "Frigate" })).toBe("coins");
    expect(soundForEvent({ type: "goldStashed", shipId: "0", amount: 5 })).toBe("coins");
    expect(soundForEvent({ type: "cannonsFired", attackerHits: 0, defenderHits: 0 })).toBe("cannon-fire");
  });

  it("leaves the rest silent for now", () => {
    expect(soundForEvent({ type: "npcSailed", npcId: "npc-1" })).toBeNull();
    expect(soundForEvent({ type: "docked", shipId: "0", portName: "Port Royal" })).toBeNull();
    expect(soundForEvent({ type: "combatStarted", attackerId: "0", defenderId: "1" })).toBeNull();
    expect(soundForEvent({ type: "shipSunk", shipId: "1", isNpc: false })).toBeNull();
  });
});

describe("soundsForEvents", () => {
  it("plays each sound once per change, in event order", () => {
    expect(
      soundsForEvents([
        { type: "shipSailed", shipId: "0" },
        { type: "npcSailed", npcId: "npc-1" },
        { type: "goodsSold", shipId: "0", good: "Rum", amount: 1 },
        { type: "goodsSold", shipId: "0", good: "Wood", amount: 1 },
        { type: "shipSailed", shipId: "1" },
      ])
    ).toEqual(["ship-wash", "coins"]);
    expect(soundsForEvents([])).toEqual([]);
  });
});
