import { describe, expect, it } from "vitest";
import { departedShips } from "./departedShips";
import type { CaribbeanState, NPCShip, ShipState } from "../../game/types";
import { hex } from "../../game/hex";
import { emptyCargo } from "../../game/economy";
import { SHIP_SPECS } from "../../game/constants";

const ship = { position: hex(1, 0), cargo: emptyCargo(), gold: 0, maxCargo: 10, upgrades: [], damage: { hull: 0, crew: 0, masts: 0 }, bounties: { England: 0, France: 0, Spain: 0, Netherlands: 0 }, score: 0, stashedGold: 0, scoutedShips: [], shipClass: "Sloop" } as ShipState;
const npc: NPCShip = {
  id: "npc-1", position: hex(2, 0), cargo: emptyCargo(), gold: 0, shipClass: "Flute",
  stats: { ...SHIP_SPECS.Flute, crew: { ...SHIP_SPECS.Flute.crew }, hull: { ...SHIP_SPECS.Flute.hull } },
  damage: { hull: 0, crew: 0, masts: 0 }, nation: "Spain", aiBehavior: "MERCHANT_ROUTE", destinationPortHex: hex(9, 9),
  spawnPortHex: hex(1, 1), isIdentified: false, bounty: 1, role: "MERCHANT", huntingTargetId: null,
};
const state = (over: Partial<CaribbeanState>): CaribbeanState =>
  ({ cells: [], ships: {}, npcs: {}, mapSize: "small", wrap: null, captainDeck: [], draftHands: {}, floatingLoot: [], npcIdCounter: 0, ...over }) as CaribbeanState;

describe("ships the fight still shows after they leave G (#263)", () => {
  it("a sunk ship goes down where she was, in her class and at her last heading", () => {
    const prev = state({ ships: { "1": ship } });
    const [gone] = departedShips(prev, state({}), [{ kind: "sink", shipId: "1", shooterId: "0", seconds: 6 }], () => 0.7);
    expect(gone).toMatchObject({ id: "1", shipClass: "Sloop", heading: 0.7, sinks: true });
  });

  it("a merchant taken by boarding stays afloat alongside", () => {
    const prev = state({ npcs: { [npc.id]: npc } });
    const [prize] = departedShips(prev, state({}), [{ kind: "closeAlongside", attackerId: "0", defenderId: npc.id, seconds: 5 }], () => 0);
    expect(prize).toMatchObject({ id: npc.id, shipClass: "Flute", sinks: false });
  });

  it("a ship still in G is drawn by the board as usual, not here", () => {
    const both = state({ ships: { "1": ship } });
    expect(departedShips(both, both, [{ kind: "sink", shipId: "1", shooterId: null, seconds: 6 }], () => 0)).toEqual([]);
  });
});
