import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import { Caribbean, MOVES_PER_TURN, getMaxMoves, withSetupData } from "./Game";
import type { CaribbeanState } from "./Game";
import type { Game } from "boardgame.io";
import { canonicalHex, hex, hexEquals, hexGrid, hexRect, offsetToHex, createWrap } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { MapSizeId } from "./mapConfig";
import { getMapPreset } from "./mapConfig";
import { createShipState } from "./economy";
import { SHIP_SPECS } from "./constants";

/** An all-water hexagon of `radius` around the origin, so navigation tests aren't blocked by islands. */
function waterGrid(radius: number): MapCell[] {
  return hexGrid(radius).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));
}

/** Creates a game with an all-water map so navigation tests aren't blocked by random islands.
 *  Skips draft phase by overriding phases to empty. */
function setup() {
  const cells: MapCell[] = waterGrid(3).map((c) => ({
    ...c,
    terrain: "water" as const, elevation: 0,
    hasPort: false,
  }));
  const TestGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(1, -1)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: TestGame });
  client.start();
  return client;
}

/** Game with ship starting at the map edge (5, 0). */
function setupAtEdge() {
  const EdgeGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells: waterGrid(5),
      ships: {
        "0": createShipState(hex(5, 0)),
        "1": createShipState(hex(1, -1)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: EdgeGame });
  client.start();
  return client;
}

describe("moveShip move", () => {
  it("moves the ship to a valid adjacent hex", () => {
    const client = setup();
    client.moves.moveShip(1, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(1);
    expect(G.ships["0"].position.r).toBe(0);
  });

  it("rejects a move to a non-adjacent hex", () => {
    const client = setup();
    const before = client.getState()!.G.ships["0"].position;
    client.moves.moveShip(3, 0);
    const after = client.getState()!.G.ships["0"].position;
    expect(after.q).toBe(before.q);
    expect(after.r).toBe(before.r);
  });

  it("rejects a move to a hex not on the map", () => {
    const client = setupAtEdge();
    client.moves.moveShip(6, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(5);
    expect(G.ships["0"].position.r).toBe(0);
  });

  it("rejects a move to the same hex (not adjacent to itself)", () => {
    const client = setup();
    const before = client.getState()!.G.ships["0"].position;
    client.moves.moveShip(0, 0);
    const after = client.getState()!.G.ships["0"].position;
    expect(after.q).toBe(before.q);
    expect(after.r).toBe(before.r);
  });

  it("allows sequential moves within the turn limit", () => {
    const client = setup();
    client.moves.moveShip(1, 0);
    client.moves.moveShip(2, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(2);
    expect(G.ships["0"].position.r).toBe(0);
  });
});

describe("moveShip across the east–west seam", () => {
  const wrap = createWrap(8);

  function setupWrapped(wrapped = true) {
    const cells: MapCell[] = hexRect(8, 4).map((h) => ({
      hex: h,
      terrain: "water" as const,
      elevation: 0 as const,
      hasPort: false,
    }));
    const WrapGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": createShipState(offsetToHex(7, 1)),
          "1": createShipState(offsetToHex(3, 3)),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
        floatingLoot: [],
        npcs: {},
        npcIdCounter: 0,
        wrap: wrapped ? wrap : null,
      }),
    };
    const client = Client<CaribbeanState>({ game: WrapGame });
    client.start();
    return client;
  }

  it("sails off the east edge onto the west edge for one move", () => {
    const client = setupWrapped();
    const west = offsetToHex(0, 1);
    client.moves.moveShip(west.q, west.r);
    const { G, ctx } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, west)).toBe(true);
    expect(ctx.numMoves).toBe(1);
  });

  it("accepts the uncanonical copy of the target and stores the canonical hex", () => {
    const client = setupWrapped();
    const west = offsetToHex(0, 1);
    // The same hex seen one wrap to the east, as a renderer drawing past the seam would send it.
    client.moves.moveShip(west.q + 8, west.r - 4);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(0);
    expect(hexEquals(G.ships["0"].position, west)).toBe(true);
  });

  it("can sail back from the west edge onto the east edge", () => {
    const client = setupWrapped();
    const west = offsetToHex(0, 1);
    client.moves.moveShip(west.q, west.r);
    client.moves.moveShip(7, -2); // offset (7, 1), the hex it started on
    const { G, ctx } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, offsetToHex(7, 1))).toBe(true);
    expect(ctx.numMoves).toBe(2);
  });

  it("does not cross the seam when the map does not wrap", () => {
    const client = setupWrapped(false);
    const west = offsetToHex(0, 1);
    client.moves.moveShip(west.q, west.r);
    const { G } = client.getState()!;
    expect(hexEquals(G.ships["0"].position, offsetToHex(7, 1))).toBe(true);
  });
});

describe("Caribbean.setup", () => {
  it("wraps the map east–west, as wide as it has columns", () => {
    const client = Client<CaribbeanState>({ game: Caribbean, numPlayers: 2 });
    client.start();
    const { G } = client.getState()!;
    expect(G.wrap).toEqual({ columns: getMapPreset(G.mapSize).columns });
  });

  it("generates a map whose islands and ports are the same seen across the seam", () => {
    for (const mapSize of ["small", "medium", "large"] as const) {
      const client = Client<CaribbeanState>({ game: { ...Caribbean, setup: (ctx) => Caribbean.setup!(ctx, { mapSize }) }, numPlayers: 2 });
      client.start();
      const { G } = client.getState()!;
      // Every position the game stores is canonical under the wrap.
      for (const cell of G.cells) {
        expect(hexEquals(canonicalHex(cell.hex, G.wrap), cell.hex)).toBe(true);
        if (cell.dockingHex) expect(hexEquals(canonicalHex(cell.dockingHex, G.wrap), cell.dockingHex)).toBe(true);
      }
    }
  });

  it("generates the rectangle of the chosen map size", () => {
    const client = Client<CaribbeanState>({ game: Caribbean, numPlayers: 2 });
    client.start();
    const { G } = client.getState()!;
    const { columns, rows } = getMapPreset(G.mapSize);
    const expected = new Set(hexRect(columns, rows).map((h) => `${h.q},${h.r}`));
    expect(G.cells).toHaveLength(columns * rows);
    for (const cell of G.cells) expect(expected.has(`${cell.hex.q},${cell.hex.r}`)).toBe(true);
  });

  it("generates the same map again for the same size and seed in setupData", () => {
    const start = () => {
      const client = Client<CaribbeanState>({ game: withSetupData(Caribbean, { mapSize: "small", mapSeed: 1 }), numPlayers: 2 });
      client.start();
      return client.getState()!.G;
    };
    const first = start();
    const second = start();
    expect(first.mapSize).toBe("small");
    expect(first.cells).toEqual(second.cells);
    expect(first.cells.some((c) => c.hasPort)).toBe(true);
  });

  it("keeps a different seed to a different map", () => {
    const start = (mapSeed: number) => {
      const client = Client<CaribbeanState>({ game: withSetupData(Caribbean, { mapSize: "small", mapSeed }), numPlayers: 2 });
      client.start();
      return client.getState()!.G;
    };
    expect(start(1).cells).not.toEqual(start(2).cells);
  });

  it("leaves the game as it is with no setupData", () => {
    expect(withSetupData(Caribbean, undefined)).toBe(Caribbean);
  });
});

describe("moveShip port logic", () => {
  function setupWithIslands() {
    const cells: MapCell[] = [
      { hex: hex(0, 0), terrain: "water", elevation: 0, hasPort: false },
      { hex: hex(1, 0), terrain: "island", elevation: 2, hasPort: false },  // plain island
      { hex: hex(0, 1), terrain: "island", elevation: 2, hasPort: true },   // port island
      { hex: hex(-1, 1), terrain: "water", elevation: 0, hasPort: false },
      { hex: hex(-1, 0), terrain: "water", elevation: 0, hasPort: false },
      { hex: hex(0, -1), terrain: "water", elevation: 0, hasPort: false },
      { hex: hex(1, -1), terrain: "water", elevation: 0, hasPort: false },
    ];
    const IslandGame: Game<CaribbeanState> = {
      ...Caribbean,
      phases: {},
      setup: () => ({
        cells,
        ships: {
          "0": createShipState(hex(0, 0)),
          "1": createShipState(hex(1, -1)),
        },
        mapSize: "small" as MapSizeId,
        captainDeck: [],
        draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
      }),
    };
    const client = Client<CaribbeanState>({ game: IslandGame });
    client.start();
    return client;
  }

  it("rejects a move to a plain island (no port)", () => {
    const client = setupWithIslands();
    client.moves.moveShip(1, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(0);
    expect(G.ships["0"].position.r).toBe(0);
  });

  it("rejects a move to an island with a port (ships dock from water)", () => {
    // With the new docking mechanic, ships stay on water and access ports
    // via their docking hex - they can never move onto island tiles
    const client = setupWithIslands();
    client.moves.moveShip(0, 1);
    const { G } = client.getState()!;
    // Ship stays at original position
    expect(G.ships["0"].position.q).toBe(0);
    expect(G.ships["0"].position.r).toBe(0);
  });
});

describe("move limit per turn", () => {
  it("exports MOVES_PER_TURN as 3", () => {
    expect(MOVES_PER_TURN).toBe(3);
  });

  it("allows exactly MOVES_PER_TURN moves in one turn", () => {
    const client = setup();
    client.moves.moveShip(1, 0);
    client.moves.moveShip(2, 0);
    client.moves.moveShip(3, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position.q).toBe(3);
    expect(G.ships["0"].position.r).toBe(0);
  });

  it("ends the turn automatically after MOVES_PER_TURN moves", () => {
    const client = setup();
    const turnBefore = client.getState()!.ctx.turn;
    client.moves.moveShip(1, 0);
    client.moves.moveShip(2, 0);
    client.moves.moveShip(3, 0);
    const turnAfter = client.getState()!.ctx.turn;
    expect(turnAfter).toBe(turnBefore + 1);
  });
});

/** Creates a 2-player game with an all-water map for hotseat testing. */
function setupTwoPlayer() {
  const cells: MapCell[] = waterGrid(3).map((c) => ({
    ...c,
    terrain: "water" as const, elevation: 0,
    hasPort: false,
  }));
  const TestGame: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {},
    setup: () => ({
      cells,
      ships: {
        "0": createShipState(hex(0, 0)),
        "1": createShipState(hex(1, -1)),
      },
      mapSize: "small" as MapSizeId,
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: TestGame, numPlayers: 2 });
  client.start();
  return client;
}

describe("2-player hotseat", () => {
  it("setup places two ships at distinct positions", () => {
    const client = setupTwoPlayer();
    const { G } = client.getState()!;
    expect(G.ships["0"].position).toEqual(hex(0, 0));
    expect(G.ships["1"].position).toEqual(hex(1, -1));
  });

  it("player 0 starts as currentPlayer", () => {
    const client = setupTwoPlayer();
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("0");
  });

  it("moveShip moves only the current player's ship", () => {
    const client = setupTwoPlayer();
    client.moves.moveShip(1, 0);
    const { G } = client.getState()!;
    expect(G.ships["0"].position).toEqual(hex(1, 0));
    expect(G.ships["1"].position).toEqual(hex(1, -1));
  });

  it("after endTurn, currentPlayer flips to '1'", () => {
    const client = setupTwoPlayer();
    client.events.endTurn!();
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("1");
  });

  it("player 1 can move their ship after player 0 ends turn", () => {
    const client = setupTwoPlayer();
    client.events.endTurn!();
    // Player 1 at (1,-1), move to (0,-1) — away from player 0
    client.moves.moveShip(0, -1);
    const { G } = client.getState()!;
    expect(G.ships["1"].position).toEqual(hex(0, -1));
    expect(G.ships["0"].position).toEqual(hex(0, 0));
  });

  it("exhausting 3 moves auto-switches to the other player", () => {
    const client = setupTwoPlayer();
    client.moves.moveShip(1, 0);
    client.moves.moveShip(2, 0);
    client.moves.moveShip(3, 0);
    const { ctx } = client.getState()!;
    expect(ctx.currentPlayer).toBe("1");
  });
});

describe("ship collision", () => {
  it("rejects a move to a hex occupied by another ship", () => {
    // P0 at (0,0), P1 at (1,-1). P0 tries to move onto P1's hex.
    const client = setupTwoPlayer();
    client.moves.moveShip(1, -1);
    const { G } = client.getState()!;
    expect(G.ships["0"].position).toEqual(hex(0, 0));
  });

  it("allows a move to a hex vacated by another ship earlier this round", () => {
    // P0 at (0,0), P1 at (1,-1). P0 moves away, then P1 moves to (0,0).
    const client = setupTwoPlayer();
    client.moves.moveShip(-1, 0);
    client.events.endTurn!();
    // P1 at (1,-1), move to (0,0) — now empty
    client.moves.moveShip(0, 0);
    const { G } = client.getState()!;
    expect(G.ships["1"].position).toEqual(hex(0, 0));
  });
});

describe("getMaxMoves", () => {
  it("returns ship stats maneuverability when available", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    expect(getMaxMoves(ship)).toBe(SHIP_SPECS.Sloop.maneuverability); // 4
  });

  it("returns MOVES_PER_TURN when no stats or class", () => {
    const ship = createShipState(hex(0, 0));
    expect(getMaxMoves(ship)).toBe(MOVES_PER_TURN);
  });

  it("reduces movement by mast damage", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    // Sloop has 4 maneuverability
    expect(getMaxMoves(ship)).toBe(4);

    // 1 mast damage = -1 movement
    ship.damage.masts = 1;
    expect(getMaxMoves(ship)).toBe(3);

    // 2 mast damage = -2 movement
    ship.damage.masts = 2;
    expect(getMaxMoves(ship)).toBe(2);
  });

  it("minimum movement is 1 even with severe mast damage", () => {
    const ship = createShipState(hex(0, 0), "Sloop");
    // Sloop has 4 maneuverability, massive mast damage
    ship.damage.masts = 10;
    expect(getMaxMoves(ship)).toBe(1);
  });

  it("Frigate with mast damage has reduced movement", () => {
    const ship = createShipState(hex(0, 0), "Frigate");
    // Frigate has 3 maneuverability
    expect(getMaxMoves(ship)).toBe(3);

    ship.damage.masts = 2;
    expect(getMaxMoves(ship)).toBe(1);
  });

  it("Galleon with mast damage still has minimum 1 movement", () => {
    const ship = createShipState(hex(0, 0), "Galleon");
    // Galleon has 1 maneuverability
    expect(getMaxMoves(ship)).toBe(1);

    // Even with mast damage, minimum is 1
    ship.damage.masts = 5;
    expect(getMaxMoves(ship)).toBe(1);
  });
});
