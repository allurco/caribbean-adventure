import { describe, it, expect } from "vitest";
import {
  BOUNTY_THRESHOLD,
  getBountyForAction,
  addBounty,
  getPlayerBountyWithNation,
  shouldSpawnFlotilla,
  getTotalBounty,
  isPirate,
  isBannedAtPort,
  getWantedNations,
  type BountyAction,
} from "./reputation";
import { emptyBounties, createShipState } from "./economy";
import type { Nation } from "./types";

describe("getBountyForAction", () => {
  it("returns base bounty for attacking a merchant", () => {
    const bounty = getBountyForAction("attack_merchant", 30);
    expect(bounty).toBe(30); // NPC's bounty value
  });

  it("returns half bounty for sinking a merchant", () => {
    const bounty = getBountyForAction("sink_merchant", 40);
    expect(bounty).toBe(20);
  });

  it("returns full bounty for boarding (capturing) a merchant", () => {
    const bounty = getBountyForAction("board_merchant", 50);
    expect(bounty).toBe(50);
  });

  it("returns zero for unknown actions", () => {
    // Test with an invalid action by casting through unknown
    const bounty = getBountyForAction("unknown" as unknown as BountyAction, 30);
    expect(bounty).toBe(0);
  });
});

describe("addBounty", () => {
  it("adds bounty to the specified nation", () => {
    const bounties = emptyBounties();
    addBounty(bounties, "Spain", 25);
    expect(bounties.Spain).toBe(25);
  });

  it("accumulates bounty with existing value", () => {
    const bounties = emptyBounties();
    bounties.England = 10;
    addBounty(bounties, "England", 15);
    expect(bounties.England).toBe(25);
  });

  it("does not affect other nations", () => {
    const bounties = emptyBounties();
    addBounty(bounties, "France", 30);
    expect(bounties.England).toBe(0);
    expect(bounties.Spain).toBe(0);
    expect(bounties.Netherlands).toBe(0);
  });
});

describe("getPlayerBountyWithNation", () => {
  it("returns the bounty for a specific nation", () => {
    const bounties: Record<Nation, number> = {
      England: 10,
      France: 20,
      Spain: 30,
      Netherlands: 40,
    };
    expect(getPlayerBountyWithNation(bounties, "Spain")).toBe(30);
    expect(getPlayerBountyWithNation(bounties, "Netherlands")).toBe(40);
  });

  it("returns 0 for nations with no bounty", () => {
    const bounties = emptyBounties();
    expect(getPlayerBountyWithNation(bounties, "France")).toBe(0);
  });
});

describe("shouldSpawnFlotilla", () => {
  it("returns true when bounty exceeds threshold", () => {
    const bounties = emptyBounties();
    bounties.Spain = BOUNTY_THRESHOLD + 1;
    expect(shouldSpawnFlotilla(bounties, "Spain")).toBe(true);
  });

  it("returns true when bounty equals threshold", () => {
    const bounties = emptyBounties();
    bounties.England = BOUNTY_THRESHOLD;
    expect(shouldSpawnFlotilla(bounties, "England")).toBe(true);
  });

  it("returns false when bounty is below threshold", () => {
    const bounties = emptyBounties();
    bounties.France = BOUNTY_THRESHOLD - 1;
    expect(shouldSpawnFlotilla(bounties, "France")).toBe(false);
  });

  it("returns false for nations with zero bounty", () => {
    const bounties = emptyBounties();
    expect(shouldSpawnFlotilla(bounties, "Netherlands")).toBe(false);
  });
});

describe("BOUNTY_THRESHOLD", () => {
  it("is a positive number", () => {
    expect(BOUNTY_THRESHOLD).toBeGreaterThan(0);
  });

  it("is set to 50", () => {
    expect(BOUNTY_THRESHOLD).toBe(50);
  });
});

describe("getTotalBounty", () => {
  it("returns 0 when all bounties are 0", () => {
    const bounties = emptyBounties();
    expect(getTotalBounty(bounties)).toBe(0);
  });

  it("sums all bounties correctly", () => {
    const bounties: Record<Nation, number> = {
      England: 10,
      France: 20,
      Spain: 30,
      Netherlands: 40,
    };
    expect(getTotalBounty(bounties)).toBe(100);
  });

  it("works with partial bounties", () => {
    const bounties = emptyBounties();
    bounties.Spain = 25;
    bounties.France = 15;
    expect(getTotalBounty(bounties)).toBe(40);
  });
});

describe("isPirate", () => {
  it("returns false when no bounties", () => {
    const bounties = emptyBounties();
    expect(isPirate(bounties)).toBe(false);
  });

  it("returns true when any bounty is greater than 0", () => {
    const bounties = emptyBounties();
    bounties.Spain = 1;
    expect(isPirate(bounties)).toBe(true);
  });

  it("returns true when multiple bounties exist", () => {
    const bounties: Record<Nation, number> = {
      England: 10,
      France: 0,
      Spain: 30,
      Netherlands: 0,
    };
    expect(isPirate(bounties)).toBe(true);
  });
});

describe("isBannedAtPort", () => {
  it("returns false when port has no nation", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    ship.bounties.Spain = 10;
    expect(isBannedAtPort(ship, undefined)).toBe(false);
  });

  it("returns false at Pirate ports regardless of bounties", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    ship.bounties.Spain = 100;
    ship.bounties.England = 50;
    expect(isBannedAtPort(ship, "Pirate")).toBe(false);
  });

  it("returns true when player has bounty with the port nation", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    ship.bounties.Spain = 10;
    expect(isBannedAtPort(ship, "Spain")).toBe(true);
  });

  it("returns false when player has no bounty with the port nation", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    ship.bounties.Spain = 10;
    expect(isBannedAtPort(ship, "England")).toBe(false);
  });

  it("returns false when player has zero bounty with port nation", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    expect(isBannedAtPort(ship, "Spain")).toBe(false);
  });

  it("correctly handles each nation independently", () => {
    const ship = createShipState({ q: 0, r: 0, s: 0 });
    ship.bounties.England = 5;
    ship.bounties.France = 0;
    ship.bounties.Spain = 15;
    ship.bounties.Netherlands = 0;

    expect(isBannedAtPort(ship, "England")).toBe(true);
    expect(isBannedAtPort(ship, "France")).toBe(false);
    expect(isBannedAtPort(ship, "Spain")).toBe(true);
    expect(isBannedAtPort(ship, "Netherlands")).toBe(false);
    expect(isBannedAtPort(ship, "Pirate")).toBe(false);
  });
});

describe("getWantedNations", () => {
  it("returns empty array when no bounties", () => {
    const bounties = emptyBounties();
    expect(getWantedNations(bounties)).toEqual([]);
  });

  it("returns nations where bounty is greater than 0", () => {
    const bounties = emptyBounties();
    bounties.Spain = 10;
    bounties.France = 5;
    const wanted = getWantedNations(bounties);
    expect(wanted).toContain("Spain");
    expect(wanted).toContain("France");
    expect(wanted).not.toContain("England");
    expect(wanted).not.toContain("Netherlands");
  });

  it("returns all nations when all have bounties", () => {
    const bounties: Record<Nation, number> = {
      England: 1,
      France: 2,
      Spain: 3,
      Netherlands: 4,
    };
    const wanted = getWantedNations(bounties);
    expect(wanted).toHaveLength(4);
  });
});
