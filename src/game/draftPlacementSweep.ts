/**
 * Where the draft puts the players' ships, over 200 seeds of every map size
 * (#166, ADR 0006): at diorama scale a ship covers about half a hex, so two
 * ships on one hex centre draw as one tangle of hulls. A full table of six
 * players drafts through the real `pickCaptain` move, and no two ships may
 * share a hex, nor sit anywhere but on water.
 *
 * Shared by the `draftPlacement.<size>.test.ts` files, one per map size, so
 * the sizes run on separate workers.
 */
import { beforeEach, describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean, withHotseatView } from "./Game";
import type { CaribbeanState } from "./Game";
import { createCaptainDeck, dealHands } from "./captains";
import { createShipState } from "./economy";
import { createWrap, hex, hexEquals, wrappedDistance } from "./hex";
import { getMapPreset, type MapSizeId } from "./mapConfig";
import { generateMapFor } from "./mapRequest";
import { STARTER_SHIP_CLASSES } from "./types";

const SEEDS = 200;
const PLAYERS = 6;

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
  const { cells, regions } = generateMapFor({ mapSize, mapSeed });
  const { hands, remaining } = dealHands(createCaptainDeck(mulberry32(mapSeed)), PLAYERS);
  const ships: CaribbeanState["ships"] = {};
  for (let i = 0; i < PLAYERS; i++) ships[String(i)] = createShipState(hex(0, 0));
  const game: Game<CaribbeanState> = {
    ...Caribbean,
    setup: () => ({
      cells,
      regions,
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
  return { G, phase: ctx.phase, cells, regions };
}

/**
 * Seeds per test: a whole size in one block runs long enough on a CI runner to
 * starve the worker past vitest's 60 s RPC timeout, so it runs in short tests
 * with a macrotask yield before each (as villagePlacementSweep.ts does).
 */
const SEEDS_PER_TEST = 20;

/** The draft placement tests on `mapSize` maps, seeds 1 to SEEDS, in blocks of SEEDS_PER_TEST. */
export function describeDraftPlacement(mapSize: MapSizeId): void {
  describe(`the draft's ship placement on ${mapSize} maps over ${SEEDS} seeds (#166, #239)`, () => {
    // Tests in a file chain on microtasks, so without this the worker never reaches
    // its message queue between them and vitest's onTaskUpdate RPC times out.
    beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    for (let first = 1; first <= SEEDS; first += SEEDS_PER_TEST) {
      const last = Math.min(SEEDS, first + SEEDS_PER_TEST - 1);
      it(`never draws two ships on one hex centre, and starts every captain at a home port in their nation's region, on ${mapSize} maps, seeds ${first} to ${last}`, () => {
        for (let seed = first; seed <= last; seed++) {
          const { G, phase, cells, regions } = draftedShips(mapSize, seed);
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
          // Home in the captain's nation's waters (#239), starting beside the port.
          for (const [id, ship] of Object.entries(G.ships)) {
            const home = cells.find((c) => ship.homePortHex && hexEquals(c.hex, ship.homePortHex));
            expect(home?.hasPort, `seed ${seed}: ship ${id} has a home port`).toBe(true);
            expect(regions[home!.region!].nation, `seed ${seed}: ship ${id}`).toBe(ship.captain!.nation);
            expect(wrappedDistance(ship.position, home!.hex, G.wrap), `seed ${seed}: ship ${id}`).toBe(1);
          }
        }
      }, 120_000);
    }
  });
}
