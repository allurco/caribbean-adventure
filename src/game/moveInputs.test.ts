import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexEquals, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import type { Captain, CaribbeanState, ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { createShipState } from "./economy";
import { REPAIR_COST_PER_POINT } from "./constants";
import { fireTheAmbush } from "../testSupport/combatSteps";
import { silenceInvalidMoveLogs } from "../testSupport/silenceInvalidMoveLogs";

// These tests send refused moves on purpose; boardgame.io logs each one.
silenceInvalidMoveLogs();

/**
 * Every move argument is untrusted: online, the `/api` reducer runs on
 * whatever a client sends. A move given a malformed argument (a fractional
 * or non-finite number, a value outside its set, an id that is no entry's
 * own) is refused and leaves G as it was.
 */

const PORT = hex(-1, 0);
const DOCK = hex(0, 0);

const cells: MapCell[] = hexGrid(4).map((h) =>
  hexEquals(h, PORT)
    ? {
        hex: h,
        terrain: "island",
        hasPort: true,
        hasShipyard: true,
        nation: "England",
        portName: "Port Royal",
        dockingHex: DOCK,
        elevation: 1,
        market: {
          prices: { Wood: { buy: 2, sell: 1 }, Sugar: { buy: 3, sell: 2 }, Rum: { buy: 4, sell: 3 }, Spice: { buy: 5, sell: 4 } },
          inDemandGood: "Rum",
        },
      }
    : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
);

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** Seat 0 docked at its home port with gold, cargo and damage; seat 1 beside it. */
function docked(): ShipState {
  const s = createShipState(DOCK, "Sloop");
  s.captain = captain("drake");
  s.homePortHex = PORT;
  s.homeDockingHex = DOCK;
  s.gold = 100;
  s.cargo.Rum = 4;
  s.damage.hull = 2;
  return s;
}

/** Seats 0 and 1 in the main phase; `unarmed`, neither has a gun, so a fight between them harms neither. */
function mainGame({ unarmed = false } = {}) {
  const rival = createShipState(hex(1, 0), "Sloop");
  rival.captain = captain("morgan");
  const ship0 = docked();
  if (unarmed) for (const s of [ship0, rival]) s.stats!.cannons = 0;
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    phases: {
      main: { ...(Caribbean.phases?.main ?? {}), start: true },
      combat: Caribbean.phases!.combat!,
    },
    setup: () => ({
      cells,
      ships: { "0": ship0, "1": rival },
      mapSize: "small",
      captainDeck: [],
      draftHands: {},
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

function draftGame() {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells,
      ships: { "0": createShipState(hex(2, 0)), "1": createShipState(hex(3, 0)) },
      mapSize: "small",
      captainDeck: [],
      draftHands: { "0": [captain("drake"), captain("morgan")], "1": [captain("hein"), captain("surcouf")] },
      floatingLoot: [],
      npcs: {},
      npcIdCounter: 0,
      wrap: null,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: 2 });
  client.start();
  return client;
}

type AnyClient = ReturnType<typeof mainGame>;

/** `act` changes nothing: G is as it was. */
function refused(client: AnyClient, act: () => void): void {
  const before = client.getState()!.G;
  act();
  expect(client.getState()!.G).toEqual(before);
}

/** Arguments a client could send in place of a number. */
const BAD_NUMBERS: unknown[] = [0.5, NaN, Infinity, -1, "1", null, undefined];

describe("pickCaptain refuses a malformed pick", () => {
  for (const index of [...BAD_NUMBERS, 2]) {
    it(`in the draft: captain index ${String(index)}`, () => {
      const client = draftGame();
      refused(client, () => client.moves.pickCaptain(index, "Sloop"));
      expect(client.getState()!.G.ships["0"].captain).toBeUndefined();
    });
  }

  for (const shipClass of [undefined, "Galleon", "Raft", 3]) {
    it(`in the draft: ship class ${String(shipClass)}`, () => {
      const client = draftGame();
      refused(client, () => client.moves.pickCaptain(0, shipClass));
    });
  }
});

describe("the main phase's moves refuse malformed arguments", () => {
  it("moveShip: a hex that is not whole numbers", () => {
    const client = mainGame();
    for (const [q, r] of [[0.5, 0], [NaN, 0], [1, Infinity], ["1", "-1"]]) {
      refused(client, () => client.moves.moveShip(q, r));
    }
  });

  it("trade: an amount that is not a whole number above zero, a good or an action outside its set", () => {
    const client = mainGame();
    for (const amount of BAD_NUMBERS) {
      refused(client, () => client.moves.trade("Rum", amount, "SELL"));
      refused(client, () => client.moves.trade("Wood", amount, "BUY"));
    }
    refused(client, () => client.moves.trade("Gold", 1, "BUY"));
    refused(client, () => client.moves.trade("__proto__", 1, "SELL"));
    refused(client, () => client.moves.trade("Rum", 1, "STEAL"));
  });

  it("repair: points that are not a whole number above zero, a category outside its set, or more than the gold pays for", () => {
    const client = mainGame();
    for (const points of BAD_NUMBERS) {
      refused(client, () => client.moves.repair("hull", points));
    }
    refused(client, () => client.moves.repair("sails", 1));
    refused(client, () => client.moves.repair("__proto__", 1));
  });

  it("repair: refuses points the gold cannot pay for, rather than going into debt", () => {
    const client = mainGame();
    const gold = client.getState()!.G.ships["0"].gold;
    client.moves.stashGold(gold - REPAIR_COST_PER_POINT);
    expect(client.getState()!.G.ships["0"].gold).toBe(REPAIR_COST_PER_POINT);
    refused(client, () => client.moves.repair("hull", 2));
  });

  it("stashGold: an amount that is not a whole number above zero", () => {
    const client = mainGame();
    for (const amount of BAD_NUMBERS) {
      refused(client, () => client.moves.stashGold(amount));
    }
    client.moves.stashGold(20);
    expect(client.getState()!.G.ships["0"]).toMatchObject({ gold: 80, stashedGold: 20 });
  });

  it("spyglass, attackShip and attackNPC: an id that is no ship's own", () => {
    const client = mainGame();
    for (const id of ["__proto__", "constructor", "toString"]) {
      refused(client, () => client.moves.spyglass(id, false));
      refused(client, () => client.moves.spyglass(id, true));
      refused(client, () => client.moves.attackShip(id));
      refused(client, () => client.moves.attackNPC(id));
    }
  });

  it("chooseCombatAction: an action outside fire, board and flee", () => {
    const client = mainGame({ unarmed: true });
    client.moves.attackShip("1");
    fireTheAmbush(client);
    client.moves.rollSeamanship();
    client.moves.rollDefenderSeamanship();
    expect(client.getState()!.G.combat?.stage).toBe("chooseAction");
    refused(client, () => client.moves.chooseCombatAction("broadside"));
    refused(client, () => client.moves.chooseCombatAction(undefined));
  });

  it("pickCaptain for a lost ship: a fractional index", () => {
    const client = mainGame();
    refused(client, () => client.moves.pickCaptain(0.5, "Sloop"));
  });
});
