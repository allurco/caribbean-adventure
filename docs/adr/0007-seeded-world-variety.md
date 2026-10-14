---
status: accepted
---

# Seeded world variety: every visual feature on a named sub-seed of the map seed

The board is to look varied the way a Minecraft world does (#158): every map seed gives a different archipelago, different islands and different towns, built from one vocabulary, and the same seed gives exactly the same world on every client, reload, worker or main thread, and world copy. Until now the board's variety came from a hash of the island cells (`terrainSeedFromCells`) and from position-only salts, one helper (`seedOf`) quantised its inputs by 4096 and so dropped a 32-bit seed's top bits, the captain deck was shuffled with `Math.random` at setup, and the map generator fell back to `Math.random` when it was given no seed. We decided that **the world seed is `G.mapSeed`, and every seeded visual is a pure function of that seed, a feature name, stable ids and the map's cells.**

## Decision

- **One world seed.** `G.mapSeed`, chosen by the map request (pinned by setup data or `?seed=`, else drawn once at the seed-picking call site) and stored in `G`. No wall clock, no `Math.random`, no load order and no device enter a seeded visual.
- **Named sub-seeds.** A feature draws from its own stream, `stream(subSeed(G.mapSeed, "feature", ...ids))` (`src/board/visuals/subSeed.ts`). `subSeed` hashes its arguments whole: strings by every UTF-16 code unit, numbers as 32-bit integers (it throws on anything else rather than folding it onto another value); each argument is tagged with its kind and length, so no two argument lists meet by concatenation. The result is a 32-bit seed that avalanches on every argument. A feature's seed depends on its own arguments only, so adding, removing or reordering a feature never reshuffles another.
- **Stable ids** (`src/board/visuals/islands.ts`, board-side, nothing stored in `G`): `cellId` is a hex's canonical `"q,r"` key; `portId` is the port cell's `cellId`; `islandId` is the `cellId` of the island's lowest cell (least `q`, then least `r`, canonical), where an island is a wrap-aware connected component of land cells. Per-piece ids are indices within those. None depends on the order of `G.cells` or on which world copy a cell is given in.
- **No `Math.random`** in game or render code. ESLint's `no-restricted-properties` rejects `Math.random` in `src/board/`, `src/game/`, `src/mapWorker/` and `src/loadGameClient.ts`; the only allowed use is the seed-picking call site, with a disable comment saying so. Tests may still pass `Math.random` where a function wants a stream. Game randomness at setup and in moves goes through boardgame.io's `random`, so a match seed reproduces it: the captain deck is shuffled with the setup's `random.Number`.
- **Transient effects** (a gull's wing phase, a smoke puff) are functions of a sub-seed and the shared wave clock (ADR 0004), so they agree between clients and freeze under reduced motion.
- **`G` gains no visual fields.** An island's archetype, a town's layout or a waterfall path is re-derived on the board, never stored. If one ever affects play, it moves to the generator and `G`.
- **The map generator stays one stream** (decision 13 of #158). It now requires a seed, but its single `mulberry32` stream is unchanged, so every existing seed keeps its map.
- **One-time decoration reshuffle** (decision 12). When the board moves from the cell hash to `G.mapSeed`, every map's decorations reshuffle once and the visual baselines are re-shot once.
- **Island archetypes** (decision 11), drawn per island from `subSeed(G.mapSeed, "archetype", islandId)`, renormalised over the archetypes the island qualifies for, ports biased away from the rocky isle: volcanic peak 0.30, jungle highland / mangrove 0.25, low atoll / sandbar 0.20, cliff / mesa 0.15, rocky ruins isle 0.10. The rocky ruins isle is drawn from V1 with no ruin meshes, so the archetype stream is locked now and a later ruins slice only adds meshes to islands that already carry it. An archetype never changes `cell.terrain` or `elevation`.
- **Not seeded:** the lighting (decision 14; every seed gets the same golden hour in V1, and a per-seed mood would perturb `lightingFor`'s output, never add a second lighting path) and the wave spectrum (ADR 0004; fixed by design).

## Considered options

- **Keep keying visuals off a hash of the cells.** Rejected: the map seed already names the world, and a cell hash cannot be told "the same world, a new feature"; low bits of each cell value also alias.
- **One shared stream for the board, drawn in a fixed order.** Rejected: adding or reordering any feature reshuffles everything after it.
- **Store archetypes and layouts in `G`.** Rejected: they are pure functions of the seed and the cells, would bloat every state sync, and would let clients hold different copies of something derivable.
- **Give the generator named sub-streams too.** Rejected for now (decision 13): it reshuffles every existing seed's map.
- **Island id = an index into the island list.** Rejected: an index shifts when the cell order or the discovery order changes; the lowest cell's key does not.

## Consequences

- Every seeded visual slice tests S1 (same seed and size, fresh caches, deep-equal) and S2 (two seeds, measurably different output), and from 5b on sweeps 200 seeds per size.
- A planted `Math.random` in game or render code fails `npm run lint`, and a test keeps the rule in place.
- Two clients on one seed draw one world; a replay or shared seed reproduces the draft.
- Islands draw their kinds (#177): `islandArchetypes.ts` draws each island's archetype from `subSeed(G.mapSeed, "archetype", islandId)` over the kinds it qualifies for, then balances the map so no kind holds more than 60 % of its islands and a map shows three kinds where its islands allow (moving the lowest-priority islands, the second number of each island's stream, so the balance is seeded too). `islandLook.ts` draws the continuous parameters within the archetype's bands, each from `subSeed(G.mapSeed, "islandLook", islandId, parameter)`. Qualification shapes the realised shares: over 200 seeds per size about 25 % volcanic, 39 % jungle, 7 % atoll, 23 % mesa and 5 % rocky, because the generator's smallest islands are three cells and none is low all over, so only three-cell isles can be atolls and only small isles without a port can be rocky; the sweep pins each share to its expected value under the renormalised draw. The look is wired to the rock tint and beach width of the land mesh's colour, the palm and shrub counts and the shore boulders; the field never reads it, so the terrain, the coast and every town plateau are the same whatever an island's kind.
- The board is on `G.mapSeed` (#165): the terrain field's three noises, the land mesh's bands and every decoration, port kit, village and town detail draw from named sub-seeds (`seedFeatures.ts`); `terrainSeedFromCells` is gone. A prop's look draws from its own sub-seed (`seed` on its placement), never from its position. `seedOf` (quantised) is left only to the fixed mesh vocabulary every map shares (house wear, quay courses, vertex colour jitter), which is not world-seeded; new code uses `subSeed`.
