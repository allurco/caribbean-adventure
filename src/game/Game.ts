import type { Game, MoveFn } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
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
import { COMBAT_ACTIONS, SHIP_CLASSES } from "./types";
import { playerViewFor } from "./playerView";
import { MAX_SEATS, MIN_SEATS, isValidSeatCount } from "./seats";
import {
  canAttack,
  canAttackNPC,
  canReturnFire,
  resolveSeamanship,
  resolveFleeAttempt,
  shouldNPCFlee,
  countCannonHits,
  calculateDamage,
  applyDamage,
  isSunk,
  isDerelict,
  createLootFromShip,
  createLootFromNPC,
  getEffectiveCannons,
} from "./combat";
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
import { isOneOf, isOwnKey, isWhole } from "./moveArgs";
import { dealReplacementHand, isEliminated, loseShip, replaceCaptain, seatStillIn, winnerWhenAllOut } from "./captainDeath";
import { moveAllNPCs, spawnMerchant, spawnFlotillaForPlayer } from "./npcManager";
import { applyMerchantAction, applyPirateBounty, shouldSpawnFlotilla } from "./reputation";
import { canStashGold, applyStashGold, awardCombatGlory, findWinner } from "./scoring";
import { canScoutNPC, canScoutPlayer } from "./scouting";
import { findAccessiblePort } from "./moves";
import {
  generateMission,
  canAffordTavern,
  getTavernCost,
  checkDeliveryMission,
  checkEscortMission,
  checkAssassinationMission,
  failEscortMission,
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
  playerView: ({ G, playerID }) => playerViewFor(G, playerID),

  endIf: ({ G, ctx }) => {
    const winner = findWinner(G.ships);
    if (winner !== null) {
      const ship = G.ships[winner];
      return {
        winner,
        captainName: ship.captain?.name ?? `Player ${Number(winner) + 1}`,
        score: ship.score,
      };
    }
    // Every player out of the game (#265): the most glory wins
    const lastOut = winnerWhenAllOut(G, ctx.playOrder);
    if (lastOut !== null) {
      const lost = G.lostShips![lastOut];
      return {
        winner: lastOut,
        captainName: lost.captain?.name ?? `Player ${Number(lastOut) + 1}`,
        score: lost.score,
      };
    }
  },

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
      turn: {
        minMoves: 1,
        maxMoves: 1,
      },
      moves: {
        pickCaptain: (
          { G, ctx },
          captainIndex: number,
          shipClass: ShipClass,
        ) => {
          const playerId = ctx.currentPlayer;
          const hand = G.draftHands[playerId];
          if (!isCaptainPick(hand, captainIndex, shipClass)) return INVALID_MOVE;
          const ship = G.ships[playerId];
          if (ship.captain) return INVALID_MOVE;

          takeCommand(G, playerId, ship, hand[captainIndex], shipClass);

          // The captain not picked lives, back at the bottom of the deck (#265); the hand is cleared
          G.captainDeck.push(...hand.filter((_, i) => i !== captainIndex));
          G.draftHands[playerId] = [];
        },
      },
      endIf: ({ G }) => {
        return Object.values(G.ships).every(
          (s) => s.captain !== undefined && s.shipClass !== undefined,
        );
      },
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
          // boardgame.io's default order, except that a seat which has just
          // lost its ship (no hand dealt yet) is passed over once: its turn
          // ended with the fight that lost it, and its next turn deals it a
          // new captain's hand. A seat out of the game is passed over for
          // good (#265). Never a seat stuck with no ship.
          first: ({ G, ctx }) => {
            const seats = ctx.playOrder.length;
            let first = ctx.turn === 0 ? ctx.playOrderPos : (ctx.playOrderPos + 1) % seats;
            const seat = ctx.playOrder[first];
            if (G.lostShips?.[seat] && (G.draftHands[seat]?.length ?? 0) === 0) first = (first + 1) % seats;
            return seatStillIn(G, ctx.playOrder, first);
          },
          next: ({ G, ctx }) => seatStillIn(G, ctx.playOrder, (ctx.playOrderPos + 1) % ctx.playOrder.length),
        },
        onEnd: ({ G, random }) => {
          // Don't move NPCs if combat is starting
          if (G.combat) return;

          // Move all NPCs at the end of each player's turn
          moveAllNPCs(G);

          // Occasionally spawn new merchants (10% chance per turn end)
          if (random.Number() < 0.1) {
            spawnMerchant(G, random.Number);
          }
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
          if (mission) {
            ship.activeMission = mission;
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

          G.combat = {
            attackerId: ctx.currentPlayer,
            defenderId: targetId,
            round: 1,
            stage: "seamanship",
            seamanshipWinner: null,
            seamanshipRolls: {},
            actionChosen: null,
            attackerHits: 0,
            defenderHits: 0,
            distance,
            isNPCCombat: false,
            fleeOutcome: null,
            fleeRolls: null,
          };

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

          G.combat = {
            attackerId: ctx.currentPlayer,
            defenderId: npcId,
            round: 1,
            stage: "seamanship",
            seamanshipWinner: null,
            seamanshipRolls: {},
            actionChosen: null,
            attackerHits: 0,
            defenderHits: 0,
            distance,
            isNPCCombat: true,
            fleeOutcome: null,
            fleeRolls: null,
          };

          events.setPhase("combat");
        },
        }),
      },
    },

    combat: {
      turn: {
        activePlayers: { all: "combat" },
      },
      moves: {
        rollSeamanship: ({ G, random }) => {
          if (!G.combat || G.combat.stage !== "seamanship") return INVALID_MOVE;

          const attacker = G.ships[G.combat.attackerId];
          const isNPC = G.combat.isNPCCombat;
          const defender = isNPC
            ? G.npcs[G.combat.defenderId]
            : G.ships[G.combat.defenderId];

          const attackerRoll = random.D6();
          const defenderRoll = random.D6();

          G.combat.seamanshipRolls[G.combat.attackerId] = attackerRoll;
          G.combat.seamanshipRolls[G.combat.defenderId] = defenderRoll;

          const attackerManeuv = attacker.stats?.maneuverability ?? 0;
          const defenderManeuv = defender.stats?.maneuverability ?? 0;

          const winner = resolveSeamanship(
            attackerManeuv,
            attackerRoll,
            defenderManeuv,
            defenderRoll
          );

          G.combat.seamanshipWinner =
            winner === "attacker" ? G.combat.attackerId : G.combat.defenderId;

          // If NPC won seamanship in NPC combat, auto-choose their action
          if (isNPC && G.combat.seamanshipWinner === G.combat.defenderId) {
            const npc = G.npcs[G.combat.defenderId];
            const npcHull = npc.stats.hull.current;
            // Use effective cannons (limited by current crew)
            const npcCannons = getEffectiveCannons(npc);
            const enemyCannons = getEffectiveCannons(attacker);

            // NPC decides to flee if hull < 2 OR outgunned
            if (shouldNPCFlee(npcHull, npcCannons, enemyCannons)) {
              G.combat.actionChosen = "flee";
              G.combat.stage = "fleeAttempt";
            } else {
              // NPC chooses to fire
              G.combat.actionChosen = "fire";
              G.combat.stage = "cannons";
            }
          } else {
            // Player chooses action
            G.combat.stage = "chooseAction";
          }
        },

        chooseCombatAction: ({ G, ctx, events }, action: CombatAction) => {
          if (!G.combat || G.combat.stage !== "chooseAction") return INVALID_MOVE;
          if (!isOneOf(COMBAT_ACTIONS, action)) return INVALID_MOVE;
          // In hotseat mode, we trust the UI to show who should choose
          // In NPC combat, player always chooses (NPC auto-fires if it won)

          if (action === "board" && G.combat.distance > 1) {
            return INVALID_MOVE;
          }

          // In NPC combat, boarding captures the NPC's cargo
          if (action === "board" && G.combat.isNPCCombat) {
            const attacker = G.ships[G.combat.attackerId];
            const npc = G.npcs[G.combat.defenderId];

            // Add bounty for boarding a merchant (not flotillas)
            if (npc.role === "MERCHANT") {
              applyMerchantAction(G, G.combat.attackerId, "board_merchant", npc.nation, npc.bounty, ctx.turn);

              // Check if flotilla should spawn
              if (shouldSpawnFlotilla(attacker.bounties, npc.nation)) {
                spawnFlotillaForPlayer(G, npc.nation, G.combat.attackerId);
              }
            }

            // Transfer cargo and gold to player (simplified boarding)
            for (const [good, amount] of Object.entries(npc.cargo)) {
              attacker.cargo[good as keyof typeof attacker.cargo] += amount;
            }
            attacker.gold += npc.gold;
            // Remove the NPC
            delete G.npcs[G.combat.defenderId];
            G.combat = undefined;
            events.setPhase("main");
            return;
          }

          G.combat.actionChosen = action;

          if (action === "flee") {
            // Transition to flee attempt stage
            G.combat.stage = "fleeAttempt";
            return;
          }

          if (action === "board") {
            // Boarding ends combat (simplified - winner captures ship)
            G.combat = undefined;
            events.setPhase("main");
            return;
          }

          // action === "fire"
          G.combat.stage = "cannons";
        },

        rollFleeAttempt: ({ G, random, events }) => {
          if (!G.combat || G.combat.stage !== "fleeAttempt") return INVALID_MOVE;

          const isNPC = G.combat.isNPCCombat;

          // Determine who is fleeing (the seamanship winner chose to flee)
          const fleeingId = G.combat.seamanshipWinner!;
          const pursuerId = fleeingId === G.combat.attackerId
            ? G.combat.defenderId
            : G.combat.attackerId;

          // Get ships/NPCs
          const fleeerShip = isNPC && fleeingId === G.combat.defenderId
            ? G.npcs[fleeingId]
            : G.ships[fleeingId];
          const pursuerShip = isNPC && pursuerId === G.combat.defenderId
            ? G.npcs[pursuerId]
            : G.ships[pursuerId];

          // Roll seamanship for flee attempt
          const pursuerRoll = random.D6();
          const fleeerRoll = random.D6();

          G.combat.fleeRolls = { pursuer: pursuerRoll, fleeer: fleeerRoll };

          const pursuerManeuv = pursuerShip.stats?.maneuverability ?? 0;
          const fleeerManeuv = fleeerShip.stats?.maneuverability ?? 0;

          const outcome = resolveFleeAttempt(
            pursuerManeuv,
            pursuerRoll,
            fleeerManeuv,
            fleeerRoll
          );

          G.combat.fleeOutcome = outcome;

          if (outcome === "escaped") {
            // Clean escape - combat ends, fleeer could move 1 hex away
            // (For now, just end combat - movement would require more logic)
            G.combat = undefined;
            events.setPhase("main");
            return;
          }

          // Caught - pursuer gets a free parting shot (defender can't return fire)
          // Go to cannons stage, but only pursuer fires
          G.combat.stage = "cannons";
        },

        rollCannons: ({ G, random }) => {
          if (!G.combat || G.combat.stage !== "cannons") return INVALID_MOVE;

          const isNPC = G.combat.isNPCCombat;
          const attacker = G.ships[G.combat.attackerId];
          const defender = isNPC
            ? G.npcs[G.combat.defenderId]
            : G.ships[G.combat.defenderId];

          // Check if this is a parting shot from failed flee
          const isPartingShot = G.combat.fleeOutcome === "caught";

          if (isPartingShot) {
            // Only the pursuer fires, fleeer cannot return fire
            const fleeingId = G.combat.seamanshipWinner!;
            const pursuerId = fleeingId === G.combat.attackerId
              ? G.combat.defenderId
              : G.combat.attackerId;

            const pursuerShip = isNPC && pursuerId === G.combat.defenderId
              ? G.npcs[pursuerId]
              : G.ships[pursuerId];

            // Use effective cannons (limited by current crew)
            const pursuerCannons = getEffectiveCannons(pursuerShip);
            const pursuerRolls: number[] = [];
            for (let i = 0; i < pursuerCannons; i++) {
              pursuerRolls.push(random.D6());
            }
            const pursuerHits = countCannonHits(pursuerRolls);

            // Assign hits based on who is the pursuer
            if (pursuerId === G.combat.attackerId) {
              G.combat.attackerHits = pursuerHits;
              G.combat.defenderHits = 0; // Fleeer can't return fire
            } else {
              G.combat.attackerHits = 0; // Fleeer can't return fire
              G.combat.defenderHits = pursuerHits;
            }
          } else {
            // Normal combat - both sides fire

            // Attacker fires - use effective cannons (limited by current crew)
            const attackerCannons = getEffectiveCannons(attacker);
            const attackerRolls: number[] = [];
            for (let i = 0; i < attackerCannons; i++) {
              attackerRolls.push(random.D6());
            }
            G.combat.attackerHits = countCannonHits(attackerRolls);

            // Defender fires back if in range
            if (canReturnFire(defender, G.combat.distance)) {
              // Use effective cannons (limited by current crew)
              const defenderCannons = getEffectiveCannons(defender);
              const defenderRolls: number[] = [];
              for (let i = 0; i < defenderCannons; i++) {
                defenderRolls.push(random.D6());
              }
              G.combat.defenderHits = countCannonHits(defenderRolls);
            } else {
              G.combat.defenderHits = 0;
            }
          }

          G.combat.stage = "resolution";
        },

        applyResolution: ({ G, ctx, events }) => {
          if (!G.combat || G.combat.stage !== "resolution") return INVALID_MOVE;

          const attacker = G.ships[G.combat.attackerId];
          const isNPC = G.combat.isNPCCombat;
          const defender = isNPC
            ? G.npcs[G.combat.defenderId]
            : G.ships[G.combat.defenderId];

          // Apply damage to defender from attacker's hits
          if (G.combat.attackerHits > 0) {
            const damage = calculateDamage(G.combat.attackerHits, attacker.upgrades);
            applyDamage(defender, damage);
          }

          // Apply damage to attacker from defender's hits
          if (G.combat.defenderHits > 0) {
            // NPCs don't have upgrades array
            const defenderUpgrades = isNPC ? [] : (defender as typeof attacker).upgrades;
            const damage = calculateDamage(G.combat.defenderHits, defenderUpgrades);
            applyDamage(attacker, damage);

            // Fail escort mission if attacker took damage
            if (attacker.activeMission) {
              failEscortMission(attacker.activeMission);
            }
          }

          // Check for sunk/derelict
          let combatEnded = false;
          // Player ships sunk this exchange: lost once both sides' glory and bounties are settled
          const sunk: string[] = [];

          // Check if NPC defender is sunk
          if (isNPC) {
            const npc = G.npcs[G.combat.defenderId];
            if (npc.stats.hull.current <= 0) {
              // Add bounty for sinking a merchant (not flotillas)
              if (npc.role === "MERCHANT") {
                applyMerchantAction(G, G.combat.attackerId, "sink_merchant", npc.nation, npc.bounty, ctx.turn);

                // Check if flotilla should spawn
                if (shouldSpawnFlotilla(attacker.bounties, npc.nation)) {
                  spawnFlotillaForPlayer(G, npc.nation, G.combat.attackerId);
                }
              }

              // Award combat glory for sinking worthy targets (flotillas)
              awardCombatGlory(attacker, npc);

              // Check assassination mission completion
              if (attacker.activeMission &&
                  checkAssassinationMission(attacker.activeMission, G.combat.defenderId, npc)) {
                attacker.gold += attacker.activeMission.reward.gold;
                attacker.score += attacker.activeMission.reward.glory;
                completeMission(attacker.activeMission);
                attacker.activeMission = undefined;
              }

              const loot = createLootFromNPC(npc);
              G.floatingLoot.push(loot);
              delete G.npcs[G.combat.defenderId];
              combatEnded = true;
            } else if (npc.stats.crew.current <= 0) {
              npc.isDerelict = true;
              combatEnded = true;
            }
          } else {
            const defenderShip = defender as typeof attacker;
            if (isSunk(defenderShip)) {
              // Award combat glory to attacker for sinking player ship
              awardCombatGlory(attacker, defenderShip);
              // Sinking a pirate pays the attacker their own nation's bounty
              // on them (#201), before the sunk ship's record goes.
              applyPirateBounty(G, G.combat.attackerId, G.combat.defenderId, ctx.turn);

              const loot = createLootFromShip(defenderShip);
              G.floatingLoot.push(loot);
              sunk.push(G.combat.defenderId);
              combatEnded = true;
            } else if (isDerelict(defenderShip)) {
              defenderShip.isDerelict = true;
              combatEnded = true;
            }
          }

          if (isSunk(attacker)) {
            // Award combat glory to defender for sinking attacker (if player vs player)
            if (!isNPC) {
              const defenderShip = defender as typeof attacker;
              awardCombatGlory(defenderShip, attacker);
              // The defender collects their nation's bounty on a pirate
              // attacker (#201); a flotilla that sinks one pays nobody.
              applyPirateBounty(G, G.combat.defenderId, G.combat.attackerId, ctx.turn);
            }

            const loot = createLootFromShip(attacker);
            G.floatingLoot.push(loot);
            sunk.push(G.combat.attackerId);
            combatEnded = true;
          } else if (isDerelict(attacker)) {
            attacker.isDerelict = true;
            combatEnded = true;
          }

          // The sunk ships leave G.ships here, and their captains die with them (#265)
          for (const id of sunk) loseShip(G, id, "sunk");

          // After a failed flee attempt, combat ends after the parting shot
          if (G.combat.fleeOutcome === "caught") {
            combatEnded = true;
          }

          if (combatEnded) {
            G.combat = undefined;
            events.setPhase("main");
            return;
          }

          // Combat continues - new round
          G.combat.round++;
          G.combat.stage = "seamanship";
          G.combat.fleeOutcome = null;
          G.combat.fleeRolls = null;
          G.combat.seamanshipWinner = null;
          G.combat.seamanshipRolls = {};
          G.combat.actionChosen = null;
          G.combat.attackerHits = 0;
          G.combat.defenderHits = 0;
        },
      },
      next: "main",
    },
  },
};
