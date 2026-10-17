import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { hex, hexGrid } from "./hex";
import type { MapCell } from "./mapGenerator";
import { WIN_SCORE, type Captain, type CaribbeanState, type NPCShip, type ShipState } from "./types";
import { Caribbean, withHotseatView } from "./Game";
import { openFight } from "./combatMoves";
import { createShipState } from "./economy";
import { fightToTheEnd } from "../testSupport/combatSteps";

/**
 * A captain who reaches the winning glory in the fight that sinks them wins
 * (#369, option A): the game ends on glory on the move that settles the
 * fight, naming the fallen captain. Since #346 a sunk ship never answers, so
 * both sides go down in one round only in a fight stored at the resolution
 * before #380, whose damage had all landed; these fights start there.
 */

const cells: MapCell[] = hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));

const captain = (id: string): Captain => ({ id, name: id, nation: "England", ability: "" });

/** A player ship at (q, r) with `glory`, its hull holed through: sunk once the round settles. */
function sinking(q: number, r: number, id: string, glory: number): ShipState {
  const s = createShipState(hex(q, r), "Galleon");
  s.stats!.hull = { current: 0, max: 40 };
  s.captain = captain(id);
  s.score = glory;
  return s;
}

/** A flotilla beside seat 0 (a worthy target, worth glory), sunk too. */
function sinkingFlotilla(): NPCShip {
  return {
    id: "flotilla",
    position: hex(1, 0),
    cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
    gold: 0,
    shipClass: "Frigate",
    stats: {
      maneuverability: 0,
      scouting: 1,
      cannons: 4,
      crew: { current: 20, max: 20 },
      hull: { current: 0, max: 40 },
      cargo: 8,
      shallowDraft: false,
    },
    damage: { hull: 40, crew: 0, masts: 0 },
    nation: "Spain",
    aiBehavior: "HUNTER",
    destinationPortHex: hex(-5, 0),
    spawnPortHex: hex(5, 0),
    isIdentified: false,
    bounty: 0,
    role: "FLOTILLA",
    huntingTargetId: null,
  };
}

/** A client whose game starts at the resolution of `combat`, seat 0 attacking. */
function atResolution(ships: Record<string, ShipState>, combat: CaribbeanState["combat"], npcs: Record<string, NPCShip> = {}, captainDeck: Captain[] = [captain("drake")]) {
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    seed: "posthumous-win-369",
    phases: {
      main: Caribbean.phases!.main!,
      combat: { ...Caribbean.phases!.combat!, start: true },
    },
    setup: () => ({
      cells,
      ships,
      mapSize: "small",
      captainDeck,
      draftHands: {},
      floatingLoot: [],
      npcs,
      npcIdCounter: 0,
      wrap: null,
      pirates: {},
      bountyClaims: [],
      movesUsed: 0,
      combat,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: Object.keys(ships).length });
  client.start();
  return client;
}

const resolution = (defenderId: string, isNPC: boolean): CaribbeanState["combat"] => ({ ...openFight("0", defenderId, 1, isNPC), round: 2, stage: "resolution" });

describe("a win on glory in the fight that sinks the captain (#369)", () => {
  it("seat 0 at 9 glory sinks a flotilla and goes down with it: seat 0 wins, fallen", () => {
    const client = atResolution({ "0": sinking(0, 0, "blackbeard", WIN_SCORE - 1) }, resolution("flotilla", true), { flotilla: sinkingFlotilla() });
    fightToTheEnd(client);
    const { G, ctx } = client.getState()!;
    expect(G.ships["0"]).toBeUndefined();
    expect(ctx.gameover).toEqual({ reason: "glory", winner: "0", captainName: "blackbeard", score: WIN_SCORE, fallen: true });
  });

  it("a defender at 9 glory who sinks the attacker and goes down too wins", () => {
    const client = atResolution({ "0": sinking(0, 0, "blackbeard", 3), "1": sinking(1, 0, "surcouf", WIN_SCORE - 1) }, resolution("1", false));
    fightToTheEnd(client);
    expect(client.getState()!.ctx.gameover).toEqual({ reason: "glory", winner: "1", captainName: "surcouf", score: WIN_SCORE, fallen: true });
  });

  it("both captains reaching the winning glory as they sink each other: the first seat wins, as findWinner breaks a tie", () => {
    const client = atResolution({ "0": sinking(0, 0, "blackbeard", WIN_SCORE - 1), "1": sinking(1, 0, "surcouf", WIN_SCORE - 1) }, resolution("1", false));
    fightToTheEnd(client);
    expect(client.getState()!.ctx.gameover).toMatchObject({ reason: "glory", winner: "0", captainName: "blackbeard", fallen: true });
  });

  it("short of the winning glory, sinking together ends nothing: the seats go on to pick new captains", () => {
    const client = atResolution({ "0": sinking(0, 0, "blackbeard", 2), "1": sinking(1, 0, "surcouf", 4) }, resolution("1", false), {}, [captain("drake"), captain("morgan")]);
    fightToTheEnd(client);
    const { G, ctx } = client.getState()!;
    expect(ctx.gameover).toBeUndefined();
    expect(G.lostShips).toMatchObject({ "0": { score: 3 }, "1": { score: 5 } });
  });
});
