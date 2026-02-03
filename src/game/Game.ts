import type { Game } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { hex, hexDistance, hexEquals } from "./hex";
import { generateMap } from "./mapGenerator";
import { DEFAULT_MAP_SIZE, getMapPreset } from "./mapConfig";
import type { MapSizeId } from "./mapConfig";
import type {
  CaribbeanState,
  GoodType,
  ShipClass,
  ShipStats,
  DamageCategory,
} from "./types";
import { SHIP_CLASSES } from "./types";
import { SHIP_SPECS } from "./constants";
import {
  createShipState,
  canBuy,
  canSell,
  canBuyUpgrade,
  applyUpgrade,
  canRepair,
  applyRepair,
} from "./economy";
import { createCaptainDeck, dealHands, findHomePort } from "./captains";

export type { CaribbeanState } from "./types";

export const MOVES_PER_TURN = 3;

export function getMaxMoves(ship: {
  stats?: ShipStats;
  shipClass?: ShipClass;
}): number {
  if (ship.stats) return ship.stats.maneuverability;
  if (ship.shipClass) return SHIP_SPECS[ship.shipClass].maneuverability;
  return MOVES_PER_TURN;
}

export const Caribbean: Game<CaribbeanState> = {
  name: "caribbean",

  setup: (_, setupData) => {
    const mapSize: MapSizeId =
      (setupData as { mapSize?: MapSizeId } | undefined)?.mapSize ??
      DEFAULT_MAP_SIZE;
    const { radius } = getMapPreset(mapSize);
    const cells = generateMap(radius);

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
      mapSize,
      captainDeck: remaining,
      draftHands: hands,
    };
  },

  // Top-level moves/turn serve as defaults when tests override phases
  moves: {
    moveShip: ({ G, ctx }, q: number, r: number) => {
      const ship = G.ships[ctx.currentPlayer];
      const target = hex(q, r);
      if (hexDistance(ship.position, target) !== 1) return INVALID_MOVE;
      const cell = G.cells.find((c) => hexEquals(c.hex, target));
      if (!cell) return INVALID_MOVE;
      if (cell.terrain === "island" && !cell.hasPort) return INVALID_MOVE;
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
      const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
      if (!cell?.market) return INVALID_MOVE;
      if (action === "BUY") {
        if (!canBuy(ship, good, amount, cell.market)) return INVALID_MOVE;
        ship.gold -= cell.market.prices[good].buy * amount;
        ship.cargo[good] += amount;
      } else {
        if (!canSell(ship, good, amount)) return INVALID_MOVE;
        ship.gold += cell.market.prices[good].sell * amount;
        ship.cargo[good] -= amount;
      }
    },

    buyUpgrade: ({ G, ctx }, upgradeId: string) => {
      const ship = G.ships[ctx.currentPlayer];
      const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
      if (!cell?.hasPort || !cell.market) return INVALID_MOVE;
      if (!canBuyUpgrade(ship, upgradeId)) return INVALID_MOVE;
      applyUpgrade(ship, upgradeId);
    },

    repair: ({ G, ctx }, category: DamageCategory, points: number) => {
      const ship = G.ships[ctx.currentPlayer];
      const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
      if (!cell?.hasPort || !cell.market) return INVALID_MOVE;
      if (points <= 0) return INVALID_MOVE;
      if (!canRepair(ship, category)) return INVALID_MOVE;
      applyRepair(ship, category, points);
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
            !(SHIP_CLASSES as readonly string[]).includes(shipClass)
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
          if (port) {
            ship.position = port.hex;
            ship.homePortHex = port.hex;
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
      },
      moves: {
        moveShip: ({ G, ctx }, q: number, r: number) => {
          const ship = G.ships[ctx.currentPlayer];
          const target = hex(q, r);
          if (hexDistance(ship.position, target) !== 1) return INVALID_MOVE;
          const cell = G.cells.find((c) => hexEquals(c.hex, target));
          if (!cell) return INVALID_MOVE;
          if (cell.terrain === "island" && !cell.hasPort) return INVALID_MOVE;
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
          const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
          if (!cell?.market) return INVALID_MOVE;
          if (action === "BUY") {
            if (!canBuy(ship, good, amount, cell.market)) return INVALID_MOVE;
            ship.gold -= cell.market.prices[good].buy * amount;
            ship.cargo[good] += amount;
          } else {
            if (!canSell(ship, good, amount)) return INVALID_MOVE;
            ship.gold += cell.market.prices[good].sell * amount;
            ship.cargo[good] -= amount;
          }
        },

        buyUpgrade: ({ G, ctx }, upgradeId: string) => {
          const ship = G.ships[ctx.currentPlayer];
          const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
          if (!cell?.hasPort || !cell.market) return INVALID_MOVE;
          if (!canBuyUpgrade(ship, upgradeId)) return INVALID_MOVE;
          applyUpgrade(ship, upgradeId);
        },

        repair: ({ G, ctx }, category: DamageCategory, points: number) => {
          const ship = G.ships[ctx.currentPlayer];
          const cell = G.cells.find((c) => hexEquals(c.hex, ship.position));
          if (!cell?.hasPort || !cell.market) return INVALID_MOVE;
          if (points <= 0) return INVALID_MOVE;
          if (!canRepair(ship, category)) return INVALID_MOVE;
          applyRepair(ship, category, points);
        },
      },
    },
  },
};
