/**
 * Where the draft puts the players' ships, over 200 seeds of every map size
 * (#166, ADR 0006): at diorama scale a ship covers about half a hex, so two
 * ships on one hex centre draw as one tangle of hulls. A full table of six
 * players drafts through the real `pickCaptain` move, and no two ships may
 * share a hex, nor sit anywhere but on water.
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean, withHotseatView } from "./Game";
import type { CaribbeanState } from "./Game";
import { createCaptainDeck, dealHands } from "./captains";
import { createShipState } from "./economy";
import { createWrap, hex, hexEquals } from "./hex";
import { getMapPreset, type MapSizeId } from "./mapConfig";
import { generateMapFor } from "./mapRequest";
import { STARTER_SHIP_CLASSES } from "./types";

const SEEDS = 200;
const PLAYERS = 6;
const SIZES: readonly MapSizeId[] = ["small", "medium", "large"];

/** A small seeded generator for the deck's shuffle, so every run deals the same hands. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ships after six players draft on map `seed` of `mapSize`, each taking the first captain of their hand. */
function draftedShips(mapSize: MapSizeId, mapSeed: number) {
  const cells = generateMapFor({ mapSize, mapSeed });
  const { hands, remaining } = dealHands(createCaptainDeck(mulberry32(mapSeed)), PLAYERS);
  const ships: CaribbeanState["ships"] = {};
  for (let i = 0; i < PLAYERS; i++) ships[String(i)] = createShipState(hex(0, 0));
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells,
      ships,
      npcs: {},
      mapSize,
      mapSeed,
      wrap: createWrap(getMapPreset(mapSize).columns),
      captainDeck: remaining,
      draftHands: hands,
      floatingLoot: [],
      npcIdCounter: 0,
    }),
  };
  const client = Client<CaribbeanState>({ game: withHotseatView(game), numPlayers: PLAYERS });
  client.start();
  for (let i = 0; i < PLAYERS; i++) client.moves.pickCaptain(0, STARTER_SHIP_CLASSES[i % STARTER_SHIP_CLASSES.length]);
  const { G, ctx } = client.getState()!;
  client.stop();
  return { G, phase: ctx.phase, cells };
}

describe(`the draft's ship placement over ${SEEDS} seeds per map size (#166)`, () => {
  for (const mapSize of SIZES) {
    it(`never draws two ships on one hex centre on ${mapSize} maps`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { G, phase, cells } = draftedShips(mapSize, seed);
        expect(phase, `seed ${seed}`).toBe("main");
        const positions = Object.values(G.ships).map((ship) => ship.position);
        expect(positions, `seed ${seed}`).toHaveLength(PLAYERS);
        positions.forEach((p, i) => {
          const cell = cells.find((c) => hexEquals(c.hex, p));
          expect(cell?.terrain, `seed ${seed}: ship ${i} at (${p.q}, ${p.r})`).toBe("water");
          for (let j = 0; j < i; j++) {
            expect(hexEquals(p, positions[j]), `seed ${seed}: ships ${j} and ${i} share (${p.q}, ${p.r})`).toBe(false);
          }
        });
      }
    }, 300_000);
  }
});
