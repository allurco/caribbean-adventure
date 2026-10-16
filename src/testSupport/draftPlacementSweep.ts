/**
 * Where the draft puts the players' ships, over 200 seeds of every map size
 * (#166, ADR 0006): at diorama scale a ship covers about half a hex, so two
 * ships on one hex centre draw as one tangle of hulls. A full table of six
 * players drafts through the real `pickCaptain` move, and no two ships may
 * share a hex, nor sit anywhere but on water.
 *
 * Shared by the `src/game/draftPlacement.<size>.test.ts` files, one per map
 * size (`DRAFT_SWEEP_SIZES`), so the sizes run on separate workers.
 */
import { describe, it, expect } from "vitest";
import { Client } from "boardgame.io/client";
import type { Game } from "boardgame.io";
import { Caribbean, withHotseatView } from "../game/Game";
import type { CaribbeanState } from "../game/Game";
import { createCaptainDeck, dealHands } from "../game/captains";
import { createShipState } from "../game/economy";
import { createWrap, hex, hexEquals, wrappedDistance } from "../game/hex";
import { getMapPreset, type MapSizeId } from "../game/mapConfig";
import { generateMapFor } from "../game/mapRequest";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { describeSeedBlocks } from "./seedBlocks";

/** Seeds per map size: 1 to DRAFT_SEEDS, each size in its own file. */
export const DRAFT_SEEDS = 200;
/** The map sizes the sweep covers, one `draftPlacement.<size>.test.ts` file each. */
export const DRAFT_SWEEP_SIZES: readonly MapSizeId[] = ["small", "medium", "large"];
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

/** Seeds per test (see `describeSeedBlocks`). */
const SEEDS_PER_TEST = 20;

/** The draft placement tests on `mapSize` maps, seeds 1 to DRAFT_SEEDS, in blocks of SEEDS_PER_TEST. */
export function describeDraftPlacement(mapSize: MapSizeId): void {
  describe(`the draft's ship placement on ${mapSize} maps over ${DRAFT_SEEDS} seeds (#166, #239)`, () => {
    describeSeedBlocks(1, DRAFT_SEEDS, SEEDS_PER_TEST, (first, last) => {
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
    });
  });
}
