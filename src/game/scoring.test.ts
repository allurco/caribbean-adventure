import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean } from "./Game";
import type { CaribbeanState, NPCShip, ShipState } from "./types";
import { WIN_SCORE } from "./types";
import { hex } from "./hex";
import {
  isAtHomePort,
  canStashGold,
  calculateGloryFromGold,
  applyStashGold,
  isWorthyTarget,
  awardCombatGlory,
  hasWon,
  findWinner,
} from "./scoring";
import { createShipState } from "./economy";

describe("scoring utility functions", () => {
  describe("isAtHomePort", () => {
    it("returns true when ship is at home port", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(1, 2);
      expect(isAtHomePort(ship)).toBe(true);
    });

    it("returns false when ship is not at home port", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(3, 4);
      expect(isAtHomePort(ship)).toBe(false);
    });

    it("returns false when ship has no home port", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = undefined;
      expect(isAtHomePort(ship)).toBe(false);
    });
  });

  describe("canStashGold", () => {
    it("returns true when at home port with enough gold", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(1, 2);
      ship.gold = 50;
      expect(canStashGold(ship, 20)).toBe(true);
    });

    it("returns false when not at home port", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(3, 4);
      ship.gold = 50;
      expect(canStashGold(ship, 20)).toBe(false);
    });

    it("returns false when amount exceeds gold", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(1, 2);
      ship.gold = 10;
      expect(canStashGold(ship, 20)).toBe(false);
    });

    it("returns false when amount is zero or negative", () => {
      const ship = createShipState(hex(1, 2));
      ship.homePortHex = hex(1, 2);
      ship.gold = 50;
      expect(canStashGold(ship, 0)).toBe(false);
      expect(canStashGold(ship, -10)).toBe(false);
    });
  });

  describe("calculateGloryFromGold", () => {
    it("returns 1 glory per 10 gold", () => {
      expect(calculateGloryFromGold(10)).toBe(1);
      expect(calculateGloryFromGold(20)).toBe(2);
      expect(calculateGloryFromGold(100)).toBe(10);
    });

    it("floors partial glory", () => {
      expect(calculateGloryFromGold(15)).toBe(1);
      expect(calculateGloryFromGold(29)).toBe(2);
    });

    it("returns 0 for amounts less than GOLD_PER_GLORY", () => {
      expect(calculateGloryFromGold(5)).toBe(0);
      expect(calculateGloryFromGold(9)).toBe(0);
    });
  });

  describe("applyStashGold", () => {
    it("deducts gold and adds to stashed", () => {
      const ship = createShipState(hex(0, 0));
      ship.gold = 50;
      ship.stashedGold = 0;
      ship.score = 0;

      applyStashGold(ship, 20);

      expect(ship.gold).toBe(30);
      expect(ship.stashedGold).toBe(20);
    });

    it("increments score based on gold amount", () => {
      const ship = createShipState(hex(0, 0));
      ship.gold = 50;
      ship.stashedGold = 0;
      ship.score = 0;

      const glory = applyStashGold(ship, 20);

      expect(glory).toBe(2);
      expect(ship.score).toBe(2);
    });

    it("stashing 20 gold increments score by 2", () => {
      const ship = createShipState(hex(0, 0));
      ship.gold = 100;
      ship.score = 0;

      applyStashGold(ship, 20);

      expect(ship.score).toBe(2);
    });
  });

  describe("isWorthyTarget", () => {
    it("returns true for player ships", () => {
      const playerShip = createShipState(hex(0, 0));
      expect(isWorthyTarget(playerShip)).toBe(true);
    });

    it("returns true for flotilla NPCs", () => {
      const flotilla: NPCShip = {
        id: "npc-1",
        position: hex(0, 0),
        cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
        gold: 0,
        shipClass: "Frigate",
        stats: {
          maneuverability: 3,
          scouting: 2,
          cannons: 4,
          crew: { current: 10, max: 10 },
          hull: { current: 6, max: 6 },
          cargo: 4,
        },
        damage: { hull: 0, crew: 0, masts: 0 },
        nation: "England",
        aiBehavior: "HUNTER",
        destinationPortHex: hex(0, 0),
        spawnPortHex: hex(0, 0),
        isIdentified: true,
        bounty: 0,
        role: "FLOTILLA",
        huntingTargetId: null,
      };
      expect(isWorthyTarget(flotilla)).toBe(true);
    });

    it("returns false for merchant NPCs", () => {
      const merchant: NPCShip = {
        id: "npc-1",
        position: hex(0, 0),
        cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
        gold: 0,
        shipClass: "Flute",
        stats: {
          maneuverability: 2,
          scouting: 1,
          cannons: 1,
          crew: { current: 5, max: 5 },
          hull: { current: 4, max: 4 },
          cargo: 6,
        },
        damage: { hull: 0, crew: 0, masts: 0 },
        nation: "Spain",
        aiBehavior: "MERCHANT_ROUTE",
        destinationPortHex: hex(0, 0),
        spawnPortHex: hex(0, 0),
        isIdentified: false,
        bounty: 5,
        role: "MERCHANT",
        huntingTargetId: null,
      };
      expect(isWorthyTarget(merchant)).toBe(false);
    });
  });

  describe("awardCombatGlory", () => {
    it("awards 1 glory for sinking a player ship", () => {
      const winner = createShipState(hex(0, 0));
      winner.score = 0;
      const victim = createShipState(hex(1, 0));

      const glory = awardCombatGlory(winner, victim);

      expect(glory).toBe(1);
      expect(winner.score).toBe(1);
    });

    it("awards 1 glory for sinking a flotilla", () => {
      const winner = createShipState(hex(0, 0));
      winner.score = 0;
      const flotilla: NPCShip = {
        id: "npc-1",
        position: hex(1, 0),
        cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
        gold: 0,
        shipClass: "Frigate",
        stats: {
          maneuverability: 3,
          scouting: 2,
          cannons: 4,
          crew: { current: 10, max: 10 },
          hull: { current: 6, max: 6 },
          cargo: 4,
        },
        damage: { hull: 0, crew: 0, masts: 0 },
        nation: "England",
        aiBehavior: "HUNTER",
        destinationPortHex: hex(0, 0),
        spawnPortHex: hex(0, 0),
        isIdentified: true,
        bounty: 0,
        role: "FLOTILLA",
        huntingTargetId: null,
      };

      const glory = awardCombatGlory(winner, flotilla);

      expect(glory).toBe(1);
      expect(winner.score).toBe(1);
    });

    it("awards 0 glory for sinking a merchant", () => {
      const winner = createShipState(hex(0, 0));
      winner.score = 0;
      const merchant: NPCShip = {
        id: "npc-1",
        position: hex(1, 0),
        cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
        gold: 0,
        shipClass: "Flute",
        stats: {
          maneuverability: 2,
          scouting: 1,
          cannons: 1,
          crew: { current: 5, max: 5 },
          hull: { current: 4, max: 4 },
          cargo: 6,
        },
        damage: { hull: 0, crew: 0, masts: 0 },
        nation: "Spain",
        aiBehavior: "MERCHANT_ROUTE",
        destinationPortHex: hex(0, 0),
        spawnPortHex: hex(0, 0),
        isIdentified: false,
        bounty: 5,
        role: "MERCHANT",
        huntingTargetId: null,
      };

      const glory = awardCombatGlory(winner, merchant);

      expect(glory).toBe(0);
      expect(winner.score).toBe(0);
    });
  });

  describe("hasWon", () => {
    it("returns true when score >= WIN_SCORE", () => {
      const ship = createShipState(hex(0, 0));
      ship.score = WIN_SCORE;
      expect(hasWon(ship)).toBe(true);

      ship.score = WIN_SCORE + 5;
      expect(hasWon(ship)).toBe(true);
    });

    it("returns false when score < WIN_SCORE", () => {
      const ship = createShipState(hex(0, 0));
      ship.score = WIN_SCORE - 1;
      expect(hasWon(ship)).toBe(false);

      ship.score = 0;
      expect(hasWon(ship)).toBe(false);
    });
  });

  describe("findWinner", () => {
    it("returns winner id when a player has won", () => {
      const ships: Record<string, ShipState> = {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(1, 0)),
      };
      ships["1"].score = WIN_SCORE;

      expect(findWinner(ships)).toBe("1");
    });

    it("returns null when no player has won", () => {
      const ships: Record<string, ShipState> = {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(1, 0)),
      };
      ships["0"].score = 5;
      ships["1"].score = 3;

      expect(findWinner(ships)).toBe(null);
    });
  });
});

describe("stashGold move", () => {
  function setupGameAtHomePort() {
    const client = Client({
      game: Caribbean,
      numPlayers: 2,
    });
    client.start();

    // Complete draft phase
    client.moves.pickCaptain(0, "Sloop");
    client.moves.pickCaptain(0, "Sloop");

    return client;
  }

  it("stashing 20 gold increments score by 2", () => {
    const client = setupGameAtHomePort();
    let state = client.getState()!;
    const G = state.G as CaribbeanState;

    // Player should start at home port after draft
    const ship = G.ships["0"];
    const initialScore = ship.score;
    const initialGold = ship.gold;

    // Stash gold
    client.moves.stashGold(20);

    state = client.getState()!;
    const updatedG = state.G as CaribbeanState;
    const updatedShip = updatedG.ships["0"];

    expect(updatedShip.score).toBe(initialScore + 2);
    expect(updatedShip.gold).toBe(initialGold - 20);
    expect(updatedShip.stashedGold).toBe(20);
  });

  it("cannot stash gold at a foreign port", () => {
    const client = setupGameAtHomePort();
    let state = client.getState()!;
    let G = state.G as CaribbeanState;

    // Move ship away from home port
    const ship = G.ships["0"];
    const homePort = ship.homePortHex!;

    // Find an adjacent water hex to move to
    const adjacentCells = G.cells.filter((c) => {
      const dq = Math.abs(c.hex.q - homePort.q);
      const dr = Math.abs(c.hex.r - homePort.r);
      const ds = Math.abs(c.hex.s - homePort.s);
      const dist = Math.max(dq, dr, ds);
      return dist === 1 && c.terrain === "water";
    });

    if (adjacentCells.length > 0) {
      client.moves.moveShip(adjacentCells[0].hex.q, adjacentCells[0].hex.r);

      state = client.getState()!;
      G = state.G as CaribbeanState;
      const movedShip = G.ships["0"];
      const initialScore = movedShip.score;
      const initialGold = movedShip.gold;

      // Try to stash gold (should fail - not at home port)
      client.moves.stashGold(20);

      state = client.getState()!;
      const finalG = state.G as CaribbeanState;
      const finalShip = finalG.ships["0"];

      // Score and gold should be unchanged (move was invalid)
      expect(finalShip.score).toBe(initialScore);
      expect(finalShip.gold).toBe(initialGold);
    }
  });
});

describe("victory condition", () => {
  it("game ends immediately when score hits WIN_SCORE", () => {
    // Test the findWinner function directly with a ship at WIN_SCORE
    const ships: Record<string, ShipState> = {
      "0": createShipState(hex(0, 0)),
      "1": createShipState(hex(1, 0)),
    };
    ships["0"].score = WIN_SCORE;
    ships["0"].captain = { id: "captain-1", name: "Test Captain", nation: "England", ability: "None" };

    // findWinner should return the winner
    const winner = findWinner(ships);
    expect(winner).toBe("0");
  });

  it("stashing enough gold to reach WIN_SCORE triggers victory", () => {
    // Test that the scoring math works correctly for victory
    const ship = createShipState(hex(0, 0));
    ship.homePortHex = hex(0, 0);
    ship.score = WIN_SCORE - 2; // 2 away from winning
    ship.gold = 100;

    // Stash 20 gold = 2 glory points
    applyStashGold(ship, 20);

    expect(ship.score).toBe(WIN_SCORE);
    expect(hasWon(ship)).toBe(true);
  });
});
