import type { Game } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { hex, hexEquals, canonicalHex, wrappedDistance, wrappedNeighbors } from "./hex";
import type { MapWrap } from "./hex";
import { generateMap } from "./mapGenerator";
import { getMapPreset } from "./mapConfig";
import type { MapSizeId } from "./mapConfig";
import type {
  CaribbeanState,
  GoodType,
  ShipClass,
  ShipStats,
  DamageCategory,
  CombatAction,
} from "./types";
import { SHIP_CLASSES, STARTER_SHIP_CLASSES } from "./types";
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
import { SHIP_SPECS } from "./constants";
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
import { createCaptainDeck, dealHands, findHomePort } from "./captains";
import { moveAllNPCs, spawnMerchant, createFlotillaShip, getPortCells } from "./npcManager";
import { getBountyForAction, addBounty, shouldSpawnFlotilla } from "./reputation";
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

export type { CaribbeanState } from "./types";

export const MOVES_PER_TURN = 3;

export function getMaxMoves(ship: {
  stats?: ShipStats;
  shipClass?: ShipClass;
  damage?: { masts: number };
}): number {
  let base = MOVES_PER_TURN;
  if (ship.stats) base = ship.stats.maneuverability;
  else if (ship.shipClass) base = SHIP_SPECS[ship.shipClass].maneuverability;

  // Mast damage reduces movement (1 damage = -1 move)
  const mastDamage = ship.damage?.masts ?? 0;
  return Math.max(1, base - mastDamage);
}

/**
 * Spawn a flotilla to hunt a player who has accumulated enough bounty with a nation.
 * The flotilla spawns at a port belonging to that nation and hunts the target player.
 */
function spawnFlotillaForPlayer(
  G: CaribbeanState,
  nation: string,
  targetPlayerId: string
): void {
  // Find a port belonging to this nation to spawn the flotilla
  const ports = getPortCells(G.cells);
  const nationPort = ports.find((p) => p.nation === nation);

  if (!nationPort) {
    return; // No port found for this nation
  }

  // Check if there's already a flotilla from this nation hunting this player
  const existingFlotilla = Object.values(G.npcs).find(
    (npc) =>
      npc.role === "FLOTILLA" &&
      npc.nation === nation &&
      npc.huntingTargetId === targetPlayerId
  );

  if (existingFlotilla) {
    return; // Already have a flotilla hunting this player
  }

  // Generate a unique ID for the flotilla
  G.npcIdCounter++;
  const flotillaId = `flotilla-${G.npcIdCounter}`;

  // Create the flotilla ship (Frigates are the standard warship)
  const flotilla = createFlotillaShip(
    flotillaId,
    nationPort.hex,
    nation as "England" | "France" | "Spain" | "Netherlands",
    "Frigate",
    targetPlayerId
  );

  G.npcs[flotillaId] = flotilla;
}

export const Caribbean: Game<CaribbeanState> = {
  name: "caribbean",

  endIf: ({ G }) => {
    const winner = findWinner(G.ships);
    if (winner !== null) {
      const ship = G.ships[winner];
      return {
        winner,
        captainName: ship.captain?.name ?? `Player ${Number(winner) + 1}`,
        score: ship.score,
      };
    }
  },

  setup: ({ random }, setupData) => {
    // Use provided map size, or pick randomly
    const mapSizes: MapSizeId[] = ["small", "medium", "large"];
    const mapSize: MapSizeId =
      (setupData as { mapSize?: MapSizeId } | undefined)?.mapSize ??
      mapSizes[Math.floor(random.Number() * mapSizes.length)];
    // The map is a rectangle that can wrap east–west. The wrap stays off until
    // the board can draw across the seam (#36); the generator and G share it,
    // so turning it on is this one line.
    const wrap: MapWrap = null;
    // Use a random seed for map generation
    const mapSeed = Math.floor(random.Number() * 1000000);
    const cells = generateMap(getMapPreset(mapSize), mapSeed, wrap);

    const numPlayers = 2;
    const deck = createCaptainDeck(Math.random);
    const { hands, remaining } = dealHands(deck, numPlayers);

    const ships: Record<string, ReturnType<typeof createShipState>> = {};
    for (let i = 0; i < numPlayers; i++) {
      ships[String(i)] = createShipState(hex(0, 0));
    }

    return {
      cells,
      ships,
      npcs: {},
      mapSize,
      wrap,
      captainDeck: remaining,
      draftHands: hands,
      floatingLoot: [],
      npcIdCounter: 0,
    };
  },

  // Top-level moves/turn serve as defaults when tests override phases
  moves: {
    moveShip: ({ G, ctx }, q: number, r: number) => {
      const ship = G.ships[ctx.currentPlayer];
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
      if (points <= 0) return INVALID_MOVE;
      if (!canRepair(ship, category)) return INVALID_MOVE;
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

  turn: {
    maxMoves: MOVES_PER_TURN,
  },

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
          if (!hand || captainIndex < 0 || captainIndex >= hand.length) {
            return INVALID_MOVE;
          }
          if (
            !shipClass ||
            !(STARTER_SHIP_CLASSES as readonly string[]).includes(shipClass)
          ) {
            return INVALID_MOVE;
          }
          const ship = G.ships[playerId];
          if (ship.captain) return INVALID_MOVE;

          const chosen = hand[captainIndex];
          ship.captain = chosen;
          ship.shipClass = shipClass;
          const stats = structuredClone(SHIP_SPECS[shipClass]);
          ship.stats = stats;
          ship.maxCargo = stats.cargo;

          // Find home port matching the captain's nation
          const occupiedHexes = Object.entries(G.ships)
            .filter(([id, s]) => id !== playerId && s.captain !== undefined)
            .map(([, s]) => s.position);
          const port = findHomePort(chosen.nation, G.cells, occupiedHexes);
          if (port && port.dockingHex) {
            // Validate that dockingHex is actually a water hex
            const dockingCell = G.cells.find((c) => hexEquals(c.hex, port.dockingHex!));
            if (dockingCell && dockingCell.terrain === "water") {
              // Ship spawns at the docking water hex, not the port island
              ship.position = port.dockingHex;
              // homePortHex is the actual port (for display/scoring)
              ship.homePortHex = port.hex;
              // homeDockingHex is where the ship docks to access home port
              ship.homeDockingHex = port.dockingHex;
            } else {
              // Fallback: find any water hex adjacent to the port
              const portNeighbors = wrappedNeighbors(port.hex, G.wrap);
              const waterNeighbor = portNeighbors.find((n) => {
                const cell = G.cells.find((c) => hexEquals(c.hex, n));
                return cell && cell.terrain === "water" && !occupiedHexes.some((o) => hexEquals(o, n));
              });
              if (waterNeighbor) {
                ship.position = waterNeighbor;
                ship.homePortHex = port.hex;
                ship.homeDockingHex = waterNeighbor;
              }
            }
          }

          // Clear the player's draft hand
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
        maxMoves: Math.max(
          ...SHIP_CLASSES.map((c) => SHIP_SPECS[c].maneuverability),
        ),
        endIf: ({ G, ctx }) => {
          const ship = G.ships[ctx.currentPlayer];
          return (ctx.numMoves ?? 0) >= getMaxMoves(ship);
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
        moveShip: ({ G, ctx }, q: number, r: number) => {
          const ship = G.ships[ctx.currentPlayer];
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
          if (points <= 0) return INVALID_MOVE;
          if (!canRepair(ship, category)) return INVALID_MOVE;
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

          if (isNPC) {
            const npc = G.npcs[targetId];
            if (!npc) return INVALID_MOVE;
            if (!canScoutNPC(ship, npc, G.wrap)) return INVALID_MOVE;
            // Mark NPC as identified
            npc.isIdentified = true;
          } else {
            const target = G.ships[targetId];
            if (!target) return INVALID_MOVE;
            if (!canScoutPlayer(ship, target, targetId, G.wrap)) return INVALID_MOVE;
            // Add to scouted ships list
            if (!ship.scoutedShips.includes(targetId)) {
              ship.scoutedShips.push(targetId);
            }
          }
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
          if (!canJuryRig(ship)) return INVALID_MOVE;
          applyJuryRig(ship);
        },

        attackShip: ({ G, ctx, events }, targetId: string) => {
          const attacker = G.ships[ctx.currentPlayer];
          const defender = G.ships[targetId];
          if (!defender) return INVALID_MOVE;

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
          const npc = G.npcs[npcId];
          if (!npc) return INVALID_MOVE;

          const distance = wrappedDistance(attacker.position, npc.position, G.wrap);
          if (!canAttackNPC(attacker, npc, distance)) return INVALID_MOVE;

          // Add bounty for attacking a merchant (not flotillas)
          if (npc.role === "MERCHANT") {
            const bountyGained = getBountyForAction("attack_merchant", npc.bounty);
            addBounty(attacker.bounties, npc.nation, bountyGained);

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

        chooseCombatAction: ({ G, events }, action: CombatAction) => {
          if (!G.combat || G.combat.stage !== "chooseAction") return INVALID_MOVE;
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
              const bountyGained = getBountyForAction("board_merchant", npc.bounty);
              addBounty(attacker.bounties, npc.nation, bountyGained);

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

        applyResolution: ({ G, events }) => {
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

          // Check if NPC defender is sunk
          if (isNPC) {
            const npc = G.npcs[G.combat.defenderId];
            if (npc.stats.hull.current <= 0) {
              // Add bounty for sinking a merchant (not flotillas)
              if (npc.role === "MERCHANT") {
                const bountyGained = getBountyForAction("sink_merchant", npc.bounty);
                addBounty(attacker.bounties, npc.nation, bountyGained);

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

              const loot = createLootFromShip(defenderShip);
              G.floatingLoot.push(loot);
              delete G.ships[G.combat.defenderId];
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
            }

            const loot = createLootFromShip(attacker);
            G.floatingLoot.push(loot);
            delete G.ships[G.combat.attackerId];
            combatEnded = true;
          } else if (isDerelict(attacker)) {
            attacker.isDerelict = true;
            combatEnded = true;
          }

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
