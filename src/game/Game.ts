import type { Game, MoveFn } from "boardgame.io";
import { ActivePlayers, INVALID_MOVE } from "boardgame.io/core";
import { hex, hexEquals, canonicalHex, createWrap, wrappedDistance } from "./hex";
import type { MapWrap } from "./hex";
import { getMapPreset } from "./mapConfig";
import { generateMapFor, resolveMapRequest } from "./mapRequest";
import type { GeneratedMap } from "./mapRequest";
import type {
  CaribbeanSetupData,
  CaribbeanState,
  GoodType,
  ShipClass,
  DamageCategory,
  CombatAction,
} from "./types";
import { SHIP_CLASSES } from "./types";
import { playerViewFor } from "./playerView";
import { MAX_SEATS, MIN_SEATS, isValidSeatCount } from "./seats";
import { canAttack, canAttackNPC } from "./combat";
import {
  atCombatStage,
  canChooseCombatAction,
  applyRollSeamanship,
  applyRollDefenderSeamanship,
  applyCombatAction,
  applyFleeAttempt,
  applyCannons,
  applyCombatResolution,
  openFight,
} from "./combatMoves";
import { movesLeft, spendMove, turnRunsOut } from "./turnMoves";
import {
  createShipState,
  canBuy,
  canSell,
  canBuyUpgrade,
  applyUpgrade,
  canRepair,
  applyRepair,
  canBuyShip,
  applyBuyShip,
  canJuryRig,
  applyJuryRig,
} from "./economy";
import { createCaptainDeck, dealHands, isCaptainPick, takeCommand } from "./captains";
import { isOwnKey, isWhole } from "./moveArgs";
import { draftOver, nextToPick } from "./draftOrder";
import { dealReplacementHand, isEliminated, replaceCaptain, seatStillIn } from "./captainDeath";
import { gameOverResult } from "./gameOver";
import { spawnFlotillaForPlayer } from "./npcManager";
import { npcTurnEndStep } from "./npcTurnStep";
import { applySeaWear } from "./deepSea";
import { applyMerchantAction, shouldSpawnFlotilla } from "./reputation";
import { canStashGold, applyStashGold } from "./scoring";
import { canScoutNPC, canScoutPlayer } from "./scouting";
import { findAccessiblePort } from "./moves";
import { nextMissionId } from "./ids";
import {
  generateMission,
  canAffordTavern,
  getTavernCost,
  checkDeliveryMission,
  checkEscortMission,
  completeMission,
} from "./missions";

export type { CaribbeanState, CaribbeanSetupData } from "./types";

export { MOVES_PER_TURN, getMaxMoves } from "./turnMoves";

/**
 * The game with `setupData` pinned, for a client that creates matches
 * without any (the local boardgame.io client). What match creation passes
 * (a server's setupData) is kept for every key the pin leaves out; the pin
 * wins only for the keys it sets. No pin: the game as it is.
 */
export function withSetupData(
  game: Game<CaribbeanState>,
  setupData: CaribbeanSetupData | undefined
): Game<CaribbeanState> {
  if (!setupData) return game;
  return {
    ...game,
    setup: (ctx, matchSetupData?: CaribbeanSetupData) => game.setup!(ctx, { ...matchSetupData, ...setupData }),
  };
}

/**
 * The game for the local hotseat client (#109): one screen that every seat
 * shares, so it sees the whole table. boardgame.io's local client applies
 * `playerView` with the client's `playerID`, and the hotseat client has none,
 * which `Caribbean`'s view reads as a spectator; this keeps the full state.
 * Never for a client that talks to a server.
 */
export function withHotseatView(game: Game<CaribbeanState>): Game<CaribbeanState> {
  return { ...game, playerView: ({ G }) => G };
}

/**
 * The game started on `map`, generated before the match was created (in the
 * map worker, #124), so `setup()` stays synchronous and skips generating.
 * For the local client, which creates its match itself; `map` must come from
 * `generateMapFor`, so it is exactly the map `setup()` would have made for
 * its size and seed.
 */
export function withGeneratedMap(game: Game<CaribbeanState>, map: GeneratedMap): Game<CaribbeanState> {
  return { ...game, setup: ({ ctx, random }) => createInitialState(map, ctx.numPlayers, random.Number) };
}

/**
 * The state a match of `numPlayers` seats (the match's `ctx.numPlayers`, 1 to
 * 4, #278) starts in, on `map`: a ship and a captain hand per seat, no NPCs yet.
 * `random` is boardgame.io's setup `random.Number`, so the match's seed reproduces the draft (#160).
 */
function createInitialState(
  { mapSize, mapSeed, cells, regions }: GeneratedMap,
  numPlayers: number,
  random: () => number
): CaribbeanState {
  if (!isValidSeatCount(numPlayers)) {
    throw new Error(`A match has ${MIN_SEATS} to ${MAX_SEATS} seats, not ${numPlayers}`);
  }
  // The map is a rectangle that wraps east–west, a cylinder as wide as its
  // columns (#36); the generator and G share the wrap.
  const wrap: MapWrap = createWrap(getMapPreset(mapSize).columns);

  const deck = createCaptainDeck(random);
  const { hands, remaining } = dealHands(deck, numPlayers);

  const ships: Record<string, ReturnType<typeof createShipState>> = {};
  for (let i = 0; i < numPlayers; i++) {
    ships[String(i)] = createShipState(hex(0, 0));
  }

  return {
    cells,
    regions,
    ships,
    npcs: {},
    mapSize,
    mapSeed,
    wrap,
    captainDeck: remaining,
    draftHands: hands,
    floatingLoot: [],
    npcIdCounter: 0,
    missionIdCounters: {},
    lootIdCounter: 0,
    pirates: {},
    bountyClaims: [],
    movesUsed: 0,
  };
}

/**
 * The turn's move budget (#227): only the moves that spend one (sailing,
 * scouting, jury-rigging) count, in `G.movesUsed`, reset as the turn begins.
 * The turn ends by itself once they are spent, unless the ship is docked at a
 * port, where its captain may still trade and refit, then ends the turn.
 * No boardgame.io `maxMoves`: it counts every move, port actions too.
 */
const movesBudgetTurn = {
  onBegin: ({ G }: { G: CaribbeanState }) => {
    G.movesUsed = 0;
  },
  endIf: ({ G, ctx }: { G: CaribbeanState; ctx: { currentPlayer: string } }) => turnRunsOut(G, ctx.currentPlayer),
};

/**
 * The main phase's moves, each refused (INVALID_MOVE) while the current
 * player has no ship: between a lost ship and the pick of a new captain
 * (#265), only `pickCaptain` may be played.
 */
function needingAShip(moves: Record<string, MoveFn<CaribbeanState>>): Record<string, MoveFn<CaribbeanState>> {
  return Object.fromEntries(
    Object.entries(moves).map(([name, move]): [string, MoveFn<CaribbeanState>] => [
      name,
      (context, ...args) => (context.G.ships[context.ctx.currentPlayer] ? move(context, ...args) : INVALID_MOVE),
    ])
  );
}

export const Caribbean: Game<CaribbeanState> = {
  name: "caribbean",

  // The seats come from the match (#278): solo against the NPCs, up to four captains.
  minPlayers: MIN_SEATS,
  maxPlayers: MAX_SEATS,

  // Each seat sees only its own hidden information; a client with no seat is a spectator (#109).
  playerView: ({ G, ctx, playerID }) => playerViewFor(G, playerID, ctx.phase),

  // Won on glory, or every seat out of the game (#265, #289)
  endIf: ({ G, ctx }) => gameOverResult(G, ctx.playOrder),

  setup: ({ ctx, random }, setupData?: CaribbeanSetupData) => {
    // The provided size and seed, else random ones (see resolveMapRequest).
    const request = resolveMapRequest(setupData, random.Number);
    return createInitialState({ ...request, ...generateMapFor(request) }, ctx.numPlayers, random.Number);
  },

  // Top-level moves/turn serve as defaults when tests override phases
  moves: {
    moveShip: ({ G, ctx }, q: number, r: number) => {
      const ship = G.ships[ctx.currentPlayer];
      if (movesLeft(G, ctx.currentPlayer) <= 0) return INVALID_MOVE;
      if (!isWhole(q) || !isWhole(r)) return INVALID_MOVE;
      const target = canonicalHex(hex(q, r), G.wrap);
      if (wrappedDistance(ship.position, target, G.wrap) !== 1) return INVALID_MOVE;
      const cell = G.cells.find((c) => hexEquals(c.hex, target));
      if (!cell) return INVALID_MOVE;
      // Ships cannot enter island hexes (must dock at water)
      if (cell.terrain === "island") return INVALID_MOVE;
      // Reef check: only shallow-draft ships can enter reefs
      if (cell.terrain === "reef") {
        const canEnterReef = ship.stats?.shallowDraft ?? true;
        if (!canEnterReef) return INVALID_MOVE;
      }
      const occupied = Object.entries(G.ships).some(
        ([id, s]) =>
          id !== ctx.currentPlayer && hexEquals(s.position, target),
      );
      if (occupied) return INVALID_MOVE;
      ship.position = target;
      spendMove(G);
    },

    trade: (
      { G, ctx },
      good: GoodType,
      amount: number,
      action: "BUY" | "SELL",
    ) => {
      const ship = G.ships[ctx.currentPlayer];
      const port = findAccessiblePort(ship.position, G.cells, G.wrap);
      if (!port?.market) return INVALID_MOVE;
      if (action !== "BUY" && action !== "SELL") return INVALID_MOVE;
      if (action === "BUY") {
        if (!canBuy(ship, good, amount, port.market)) return INVALID_MOVE;
        ship.gold -= port.market.prices[good].buy * amount;
        ship.cargo[good] += amount;
      } else {
        if (!canSell(ship, good, amount)) return INVALID_MOVE;
        ship.gold += port.market.prices[good].sell * amount;
        ship.cargo[good] -= amount;
        // Award Glory for selling 3+ of in-demand good
        if (port.market.inDemandGood === good && amount >= 3) {
          ship.score += 1;
        }
      }
    },

    buyUpgrade: ({ G, ctx }, upgradeId: string) => {
      const ship = G.ships[ctx.currentPlayer];
      const port = findAccessiblePort(ship.position, G.cells, G.wrap);
      if (!port?.hasPort || !port.market) return INVALID_MOVE;
      if (!canBuyUpgrade(ship, upgradeId)) return INVALID_MOVE;
      applyUpgrade(ship, upgradeId);
    },

    repair: ({ G, ctx }, category: DamageCategory, points: number) => {
      const ship = G.ships[ctx.currentPlayer];
      const port = findAccessiblePort(ship.position, G.cells, G.wrap);
      if (!port?.hasPort || !port.market) return INVALID_MOVE;
      if (!canRepair(ship, category, points)) return INVALID_MOVE;
      applyRepair(ship, category, points);
    },

    buyShip: ({ G, ctx }, newClass: ShipClass) => {
      const ship = G.ships[ctx.currentPlayer];
      const port = findAccessiblePort(ship.position, G.cells, G.wrap);
      if (!port?.hasPort || !port.hasShipyard) return INVALID_MOVE;
      if (
        !(SHIP_CLASSES as readonly string[]).includes(newClass)
      )
        return INVALID_MOVE;
      if (!canBuyShip(ship, newClass)) return INVALID_MOVE;
      applyBuyShip(ship, newClass);
    },
  },

  turn: movesBudgetTurn,

  phases: {
    draft: {
      start: true,
      // Every seat still choosing may pick at once (#111); the turns walk the
      // seats in order, each passing on as its seat picks, so the hotseat
      // screen passes the pick from player to player (draftOrder.ts). The
      // seat whose turn it is has always yet to pick, so the last pick is
      // its own and ends its turn (maxMoves); the draft then ends on the
      // last seat's turn, and main begins at seat 0.
      turn: {
        minMoves: 1,
        maxMoves: 1,
        activePlayers: ActivePlayers.ALL,
        order: {
          first: () => 0,
          next: ({ G, ctx }) => nextToPick(G, ctx.playOrder, ctx.playOrderPos),
        },
      },
      moves: {
        pickCaptain: (
          { G, playerID },
          captainIndex: number,
          shipClass: ShipClass,
        ) => {
          const hand = G.draftHands[playerID];
          if (!isCaptainPick(hand, captainIndex, shipClass)) return INVALID_MOVE;
          const ship = G.ships[playerID];
          if (!ship || ship.captain) return INVALID_MOVE;

          takeCommand(G, playerID, ship, hand[captainIndex], shipClass);

          // The captain not picked lives, back at the bottom of the deck (#265); the hand is cleared
          G.captainDeck.push(...hand.filter((_, i) => i !== captainIndex));
          G.draftHands[playerID] = [];
        },
      },
      endIf: ({ G, ctx }) => draftOver(G, ctx.playOrder, ctx.playOrderPos),
      next: "main",
    },
    main: {
      turn: {
        ...movesBudgetTurn,
        // A player whose ship was lost is dealt a new captain's hand as their
        // turn begins; with no captain left to deal they are out of the game,
        // and the turn passes on at once (#265)
        onBegin: ({ G, ctx, events }) => {
          movesBudgetTurn.onBegin({ G });
          dealReplacementHand(G, ctx.currentPlayer);
          if (isEliminated(G, ctx.currentPlayer)) events.endTurn();
        },
        order: {
          // boardgame.io's default order, passing over a seat out of the
          // game for good (#265). The phase begins after the draft, or when
          // a fight ends: combat keeps the attacker's seat (its own order),
          // so the turn moves on exactly one seat from the attacker, whose
          // turn the fight ended (#284). A seat whose ship was lost is dealt
          // a new captain's hand as its turn begins, so it never sticks.
          first: ({ G, ctx }) =>
            seatStillIn(G, ctx.playOrder, ctx.turn === 0 ? ctx.playOrderPos : (ctx.playOrderPos + 1) % ctx.playOrder.length),
          next: ({ G, ctx }) => seatStillIn(G, ctx.playOrder, (ctx.playOrderPos + 1) % ctx.playOrder.length),
        },
        // The open sea wears the ship of a turn that ends on it (#340), not
        // one that ends in a fight. The NPCs sail as the turn ends; a turn
        // that ends in a fight starts it here, and its NPCs sail when the
        // fight resolves (#288)
        onEnd: ({ G, ctx, random }) => {
          applySeaWear(G, ctx.currentPlayer, ctx.turn);
          npcTurnEndStep(G, random.Number);
        },
      },
      moves: {
        // A player whose ship was lost picks a new captain from the hand their turn dealt (#265), on the draft's screen
        pickCaptain: ({ G, ctx }, captainIndex: number, shipClass: ShipClass) =>
          replaceCaptain(G, ctx.currentPlayer, captainIndex, shipClass) ? undefined : INVALID_MOVE,
        ...needingAShip({
        moveShip: ({ G, ctx }, q: number, r: number) => {
          const ship = G.ships[ctx.currentPlayer];
          if (movesLeft(G, ctx.currentPlayer) <= 0) return INVALID_MOVE;
          if (!isWhole(q) || !isWhole(r)) return INVALID_MOVE;
          const target = canonicalHex(hex(q, r), G.wrap);
          if (wrappedDistance(ship.position, target, G.wrap) !== 1) return INVALID_MOVE;
          const cell = G.cells.find((c) => hexEquals(c.hex, target));
          if (!cell) return INVALID_MOVE;
          // Ships cannot enter island hexes (must dock at water)
          if (cell.terrain === "island") return INVALID_MOVE;
          // Reef check: only shallow-draft ships can enter reefs
          if (cell.terrain === "reef") {
            const canEnterReef = ship.stats?.shallowDraft ?? true;
            if (!canEnterReef) return INVALID_MOVE;
          }
          const occupied = Object.entries(G.ships).some(
            ([id, s]) =>
              id !== ctx.currentPlayer && hexEquals(s.position, target),
          );
          if (occupied) return INVALID_MOVE;
          ship.position = target;
          spendMove(G);

          // Check for mission completion at new position
          if (ship.activeMission) {
            const port = findAccessiblePort(ship.position, G.cells, G.wrap);
            if (port?.portName) {
              // Check delivery mission
              if (checkDeliveryMission(ship.activeMission, port.portName)) {
                ship.gold += ship.activeMission.reward.gold;
                ship.score += ship.activeMission.reward.glory;
                completeMission(ship.activeMission);
                ship.activeMission = undefined;
              }
              // Check escort mission
              else if (checkEscortMission(ship.activeMission, port.portName)) {
                ship.gold += ship.activeMission.reward.gold;
                ship.score += ship.activeMission.reward.glory;
                completeMission(ship.activeMission);
                ship.activeMission = undefined;
              }
            }
          }
        },

        trade: (
          { G, ctx },
          good: GoodType,
          amount: number,
          action: "BUY" | "SELL",
        ) => {
          const ship = G.ships[ctx.currentPlayer];
          const port = findAccessiblePort(ship.position, G.cells, G.wrap);
          if (!port?.market) return INVALID_MOVE;
          if (action !== "BUY" && action !== "SELL") return INVALID_MOVE;
          if (action === "BUY") {
            if (!canBuy(ship, good, amount, port.market)) return INVALID_MOVE;
            ship.gold -= port.market.prices[good].buy * amount;
            ship.cargo[good] += amount;
          } else {
            if (!canSell(ship, good, amount)) return INVALID_MOVE;
            ship.gold += port.market.prices[good].sell * amount;
            ship.cargo[good] -= amount;
            // Award Glory for selling 3+ of in-demand good
            if (port.market.inDemandGood === good && amount >= 3) {
              ship.score += 1;
            }
          }
        },

        buyUpgrade: ({ G, ctx }, upgradeId: string) => {
          const ship = G.ships[ctx.currentPlayer];
          const port = findAccessiblePort(ship.position, G.cells, G.wrap);
          if (!port?.hasPort || !port.market) return INVALID_MOVE;
          if (!canBuyUpgrade(ship, upgradeId)) return INVALID_MOVE;
          applyUpgrade(ship, upgradeId);
        },

        repair: ({ G, ctx }, category: DamageCategory, points: number) => {
          const ship = G.ships[ctx.currentPlayer];
          const port = findAccessiblePort(ship.position, G.cells, G.wrap);
          if (!port?.hasPort || !port.market) return INVALID_MOVE;
          if (!canRepair(ship, category, points)) return INVALID_MOVE;
          applyRepair(ship, category, points);
        },

        buyShip: ({ G, ctx }, newClass: ShipClass) => {
          const ship = G.ships[ctx.currentPlayer];
          const port = findAccessiblePort(ship.position, G.cells, G.wrap);
          if (!port?.hasPort || !port.hasShipyard) return INVALID_MOVE;
          if (
            !(SHIP_CLASSES as readonly string[]).includes(newClass)
          )
            return INVALID_MOVE;
          if (!canBuyShip(ship, newClass)) return INVALID_MOVE;
          applyBuyShip(ship, newClass);
        },

        stashGold: ({ G, ctx }, amount: number) => {
          const ship = G.ships[ctx.currentPlayer];
          if (!canStashGold(ship, amount)) return INVALID_MOVE;
          applyStashGold(ship, amount);
        },

        spyglass: ({ G, ctx }, targetId: string, isNPC: boolean) => {
          const ship = G.ships[ctx.currentPlayer];
          if (movesLeft(G, ctx.currentPlayer) <= 0) return INVALID_MOVE;

          if (isNPC) {
            if (!isOwnKey(G.npcs, targetId)) return INVALID_MOVE;
            const npc = G.npcs[targetId];
            if (!canScoutNPC(ship, npc, G.wrap)) return INVALID_MOVE;
            // Mark NPC as identified
            npc.isIdentified = true;
          } else {
            if (!isOwnKey(G.ships, targetId)) return INVALID_MOVE;
            const target = G.ships[targetId];
            if (!canScoutPlayer(ship, target, targetId, G.wrap)) return INVALID_MOVE;
            // Add to scouted ships list
            if (!ship.scoutedShips.includes(targetId)) {
              ship.scoutedShips.push(targetId);
            }
          }
          spendMove(G);
        },

        listenForRumors: ({ G, ctx, random }) => {
          const ship = G.ships[ctx.currentPlayer];
          const port = findAccessiblePort(ship.position, G.cells, G.wrap);
          if (!port?.hasPort || !port.portName) return INVALID_MOVE;
          if (!canAffordTavern(ship.gold)) return INVALID_MOVE;
          if (ship.activeMission) return INVALID_MOVE; // Already have a mission

          // Pay tavern cost
          ship.gold -= getTavernCost();

          // Generate and assign a mission
          const mission = generateMission(port.portName, G, random.Number);
          // Numbered only once there is one, so the count is of missions given
          if (mission) {
            ship.activeMission = { ...mission, id: nextMissionId(G, ctx.currentPlayer) };
          }
        },

        abandonMission: ({ G, ctx }) => {
          const ship = G.ships[ctx.currentPlayer];
          if (!ship.activeMission) return INVALID_MOVE;

          // Simply clear the mission (no penalty for now)
          ship.activeMission = undefined;
        },

        juryRig: ({ G, ctx }) => {
          const ship = G.ships[ctx.currentPlayer];
          if (movesLeft(G, ctx.currentPlayer) <= 0) return INVALID_MOVE;
          if (!canJuryRig(ship)) return INVALID_MOVE;
          applyJuryRig(ship);
          spendMove(G);
        },

        attackShip: ({ G, ctx, events }, targetId: string) => {
          const attacker = G.ships[ctx.currentPlayer];
          if (!isOwnKey(G.ships, targetId) || targetId === ctx.currentPlayer) return INVALID_MOVE;
          const defender = G.ships[targetId];

          const distance = wrappedDistance(attacker.position, defender.position, G.wrap);
          if (!canAttack(attacker, defender, distance)) return INVALID_MOVE;

          G.combat = openFight(ctx.currentPlayer, targetId, distance, false);

          events.setPhase("combat");
        },

        attackNPC: ({ G, ctx, events }, npcId: string) => {
          const attacker = G.ships[ctx.currentPlayer];
          if (!isOwnKey(G.npcs, npcId)) return INVALID_MOVE;
          const npc = G.npcs[npcId];

          const distance = wrappedDistance(attacker.position, npc.position, G.wrap);
          if (!canAttackNPC(attacker, npc, distance)) return INVALID_MOVE;

          // Add bounty for attacking a merchant (not flotillas)
          if (npc.role === "MERCHANT") {
            applyMerchantAction(G, ctx.currentPlayer, "attack_merchant", npc.nation, npc.bounty, ctx.turn);

            // Check if flotilla should spawn
            if (shouldSpawnFlotilla(attacker.bounties, npc.nation)) {
              spawnFlotillaForPlayer(G, npc.nation, ctx.currentPlayer);
            }
          }

          G.combat = openFight(ctx.currentPlayer, npcId, distance, true);

          events.setPhase("combat");
        },
        }),
      },
    },

    combat: {
      turn: {
        // The fight is played on the attacker's turn: the current player
        // stays the attacker, and main moves the turn on from there (#284).
        // boardgame.io's default would move it on a seat as combat begins.
        order: {
          first: ({ ctx }) => ctx.playOrderPos,
          next: ({ ctx }) => ctx.playOrderPos,
        },
        activePlayers: { all: "combat" },
        // The fight resolved and ended the attacker's turn: the NPCs take
        // that turn's step now, once (#288)
        onEnd: ({ G, random }) => npcTurnEndStep(G, random.Number),
      },
      moves: {
        rollSeamanship: ({ G, random }) => {
          if (!atCombatStage(G, "seamanship")) return INVALID_MOVE;
          applyRollSeamanship(G, () => random.D6());
        },

        rollDefenderSeamanship: ({ G, random }) => {
          if (!atCombatStage(G, "defenderSeamanship")) return INVALID_MOVE;
          applyRollDefenderSeamanship(G, () => random.D6());
        },

        chooseCombatAction: ({ G, ctx, events }, action: CombatAction) => {
          if (!canChooseCombatAction(G, action)) return INVALID_MOVE;
          if (applyCombatAction(G, action, ctx.turn) === "ended") events.setPhase("main");
        },

        rollFleeAttempt: ({ G, random, events }) => {
          if (!atCombatStage(G, "fleeAttempt")) return INVALID_MOVE;
          if (applyFleeAttempt(G, () => random.D6()) === "ended") events.setPhase("main");
        },

        rollCannons: ({ G, random }) => {
          if (!atCombatStage(G, "cannons")) return INVALID_MOVE;
          applyCannons(G, () => random.D6());
        },

        applyResolution: ({ G, ctx, events }) => {
          if (!atCombatStage(G, "resolution")) return INVALID_MOVE;
          if (applyCombatResolution(G, ctx.turn) === "ended") events.setPhase("main");
        },
      },
      next: "main",
    },
  },
};
