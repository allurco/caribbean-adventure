import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import {
  CAPTAINS,
  createCaptainDeck,
  dealHands,
  findHomePort,
} from "./captains";
import { Caribbean } from "./Game";
import type { CaribbeanState } from "./Game";
import { NATIONS } from "./types";
import type { MapCell, Captain } from "./types";
import { hex, hexEquals } from "./hex";
import { createShipState } from "./economy";
import type { MapSizeId } from "./mapConfig";

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("CAPTAINS data", () => {
  it("has at least 12 captains (enough for 6 players x 2 dealt)", () => {
    expect(CAPTAINS.length).toBeGreaterThanOrEqual(12);
  });

  it("every captain has required fields", () => {
    for (const c of CAPTAINS) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(NATIONS).toContain(c.nation);
      expect(c.ability).toBeTruthy();
    }
  });

  it("every nation has at least 3 captains", () => {
    for (const nation of NATIONS) {
      const count = CAPTAINS.filter((c) => c.nation === nation).length;
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it("all captain IDs are unique", () => {
    const ids = CAPTAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("createCaptainDeck", () => {
  it("returns all captains in shuffled order", () => {
    const deck = createCaptainDeck(() => 0.5);
    expect(deck).toHaveLength(CAPTAINS.length);
    for (const c of CAPTAINS) {
      expect(deck.some((d) => d.id === c.id)).toBe(true);
    }
  });

  it("shuffles with the provided rng", () => {
    let call = 0;
    const fakeRng = () => {
      call++;
      return call % 2 === 0 ? 0.1 : 0.9;
    };
    const a = createCaptainDeck(fakeRng);
    // Reset
    call = 0;
    const b = createCaptainDeck(fakeRng);
    // Same rng sequence produces same order
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe("dealHands", () => {
  it("deals 2 captains to each player", () => {
    const deck = createCaptainDeck(() => 0.5);
    const { hands, remaining } = dealHands(deck, 2);
    expect(hands["0"]).toHaveLength(2);
    expect(hands["1"]).toHaveLength(2);
    expect(remaining).toHaveLength(deck.length - 4);
  });

  it("deals to 6 players without repeating captains", () => {
    const deck = createCaptainDeck(() => 0.5);
    const { hands, remaining } = dealHands(deck, 6);
    const dealt: string[] = [];
    for (let i = 0; i < 6; i++) {
      expect(hands[String(i)]).toHaveLength(2);
      dealt.push(...hands[String(i)].map((c) => c.id));
    }
    // No duplicates among dealt cards
    expect(new Set(dealt).size).toBe(dealt.length);
    expect(remaining).toHaveLength(deck.length - 12);
  });

  it("dealt captains are not in remaining deck", () => {
    const deck = createCaptainDeck(() => 0.5);
    const { hands, remaining } = dealHands(deck, 2);
    const dealtIds = [
      ...hands["0"].map((c) => c.id),
      ...hands["1"].map((c) => c.id),
    ];
    for (const id of dealtIds) {
      expect(remaining.some((c) => c.id === id)).toBe(false);
    }
  });
});

describe("findHomePort", () => {
  const portEngland: MapCell = {
    hex: hex(1, 0),
    terrain: "island",
    hasPort: true,
    nation: "England",
  };
  const portFrance: MapCell = {
    hex: hex(2, 0),
    terrain: "island",
    hasPort: true,
    nation: "France",
  };
  const portEngland2: MapCell = {
    hex: hex(3, 0),
    terrain: "island",
    hasPort: true,
    nation: "England",
  };
  const waterCell: MapCell = {
    hex: hex(0, 0),
    terrain: "water",
    hasPort: false,
  };
  const cells = [waterCell, portEngland, portFrance, portEngland2];

  it("returns a port matching the given nation", () => {
    const result = findHomePort("England", cells, []);
    expect(result).toBeDefined();
    expect(result!.nation).toBe("England");
  });

  it("skips ports occupied by other ships", () => {
    const result = findHomePort("England", cells, [hex(1, 0)]);
    expect(result).toBeDefined();
    expect(hexEquals(result!.hex, hex(3, 0))).toBe(true);
  });

  it("falls back to any unoccupied port if no matching nation port", () => {
    const result = findHomePort("Spain", cells, []);
    expect(result).toBeDefined();
    expect(result!.hasPort).toBe(true);
  });

  it("returns undefined if all ports are occupied", () => {
    const result = findHomePort("England", cells, [
      hex(1, 0),
      hex(2, 0),
      hex(3, 0),
    ]);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pickCaptain move integration tests (boardgame.io Client)
// ---------------------------------------------------------------------------

function makeDraftCells(): MapCell[] {
  return [
    { hex: hex(0, 0), terrain: "water", hasPort: false },
    {
      hex: hex(1, 0),
      terrain: "island",
      hasPort: true,
      nation: "England",
      market: {
        prices: {
          Wood: { buy: 8, sell: 6 },
          Sugar: { buy: 20, sell: 15 },
          Rum: { buy: 30, sell: 23 },
          Spice: { buy: 45, sell: 35 },
        },
      },
    },
    {
      hex: hex(2, 0),
      terrain: "island",
      hasPort: true,
      nation: "France",
      market: {
        prices: {
          Wood: { buy: 7, sell: 5 },
          Sugar: { buy: 18, sell: 13 },
          Rum: { buy: 28, sell: 21 },
          Spice: { buy: 42, sell: 32 },
        },
      },
    },
    {
      hex: hex(3, 0),
      terrain: "island",
      hasPort: true,
      nation: "Spain",
      market: {
        prices: {
          Wood: { buy: 9, sell: 7 },
          Sugar: { buy: 22, sell: 17 },
          Rum: { buy: 32, sell: 25 },
          Spice: { buy: 48, sell: 38 },
        },
      },
    },
    { hex: hex(0, 1), terrain: "water", hasPort: false },
    { hex: hex(-1, 1), terrain: "water", hasPort: false },
    { hex: hex(1, -1), terrain: "water", hasPort: false },
  ];
}

const CAPTAIN_A: Captain = {
  id: "test-eng",
  name: "Test English",
  nation: "England",
  ability: "Test ability A",
};
const CAPTAIN_B: Captain = {
  id: "test-fra",
  name: "Test French",
  nation: "France",
  ability: "Test ability B",
};
const CAPTAIN_C: Captain = {
  id: "test-spa",
  name: "Test Spanish",
  nation: "Spain",
  ability: "Test ability C",
};
const CAPTAIN_D: Captain = {
  id: "test-fra2",
  name: "Test French 2",
  nation: "France",
  ability: "Test ability D",
};

function setupDraft() {
  const DraftGame: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells: makeDraftCells(),
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(0, 0)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {
        "0": [CAPTAIN_A, CAPTAIN_B],
        "1": [CAPTAIN_C, CAPTAIN_D],
      },
    }),
  };
  const client = Client<CaribbeanState>({ game: DraftGame, numPlayers: 2 });
  client.start();
  return client;
}

describe("pickCaptain move", () => {
  it("starts in the draft phase", () => {
    const client = setupDraft();
    const { ctx } = client.getState()!;
    expect(ctx.phase).toBe("draft");
  });

  it("assigns the chosen captain to the player's ship", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop"); // pick first card (CAPTAIN_A, England)
    const { G } = client.getState()!;
    expect(G.ships["0"].captain).toEqual(CAPTAIN_A);
  });

  it("spawns the ship at a port matching the captain's nation", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop"); // England captain
    const { G } = client.getState()!;
    // England port is at hex(1, 0)
    expect(hexEquals(G.ships["0"].position, hex(1, 0))).toBe(true);
    expect(hexEquals(G.ships["0"].homePortHex!, hex(1, 0))).toBe(true);
  });

  it("clears the player's draft hand after picking", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop");
    const { G } = client.getState()!;
    expect(G.draftHands["0"]).toHaveLength(0);
  });

  it("rejects an invalid captain index", () => {
    const client = setupDraft();
    client.moves.pickCaptain(5, "Sloop"); // out of bounds
    const { G } = client.getState()!;
    expect(G.ships["0"].captain).toBeUndefined();
  });

  it("rejects picking if player already has a captain", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop");
    // Turn should have advanced to player 1 now.
    // Switch context: player 1 picks
    client.moves.pickCaptain(0, "Flute"); // P1 picks CAPTAIN_C (Spain)
    const { G } = client.getState()!;
    // Both should have captains
    expect(G.ships["0"].captain).toEqual(CAPTAIN_A);
    expect(G.ships["1"].captain).toEqual(CAPTAIN_C);
  });

  it("auto-advances turn after picking", () => {
    const client = setupDraft();
    const playerBefore = client.getState()!.ctx.currentPlayer;
    expect(playerBefore).toBe("0");
    client.moves.pickCaptain(0, "Sloop");
    const playerAfter = client.getState()!.ctx.currentPlayer;
    expect(playerAfter).toBe("1");
  });
});

describe("draft → main phase transition", () => {
  it("transitions to main phase after all players pick", () => {
    const client = setupDraft();
    // P0 picks
    client.moves.pickCaptain(0, "Sloop");
    expect(client.getState()!.ctx.phase).toBe("draft");
    // P1 picks
    client.moves.pickCaptain(0, "Flute");
    expect(client.getState()!.ctx.phase).toBe("main");
  });

  it("players can use moveShip in main phase after draft", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop"); // P0 → England port hex(1,0)
    client.moves.pickCaptain(0, "Flute"); // P1 → Spain port hex(3,0)
    // Now in main phase. P0's turn.
    expect(client.getState()!.ctx.phase).toBe("main");
    // P0 at hex(1,0), move to hex(0,1) if adjacent... actually let's check adjacency
    // hex(1,0) neighbors: (2,0),(2,-1),(1,-1),(0,0),(0,1),(1,1) — but not all are on the map
    // hex(0,0) is water and adjacent to hex(1,0)
    client.moves.moveShip(0, 0);
    const { G } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, hex(0, 0))).toBe(true);
  });

  it("spawns ships at different ports when nations differ", () => {
    const client = setupDraft();
    client.moves.pickCaptain(0, "Sloop"); // P0 → England → hex(1,0)
    client.moves.pickCaptain(0, "Flute"); // P1 → Spain → hex(3,0)
    const { G } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, hex(1, 0))).toBe(true);
    expect(hexEquals(G.ships["1"].position, hex(3, 0))).toBe(true);
  });
});
