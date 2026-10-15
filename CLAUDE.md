# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Caribbean is a turn-based multiplayer naval strategy game (spiritual successor to Merchants & Marauders) for 2 to 4 players. Built with React + Vite + boardgame.io + React Three Fiber.

## Commands

```bash
npm run dev              # Start dev server (Vite)
npm run build            # Type-check + production build (tsc -b && vite build)
npm run lint             # ESLint (flat config, v9)
npm run preview          # Preview production build
npm test                 # Run all tests once (vitest run)
npm run test:watch       # Vitest in watch mode
npm run test:db          # Row-level security tests against local Supabase (needs `npx supabase start`, Docker)
npx tsc --noEmit         # Type-check only (no emit)

npx vitest run src/game/combat.test.ts        # Run a single test file
npx vitest run -t "flee attempt"              # Run tests matching a name
```

Tests use **Vitest** and live next to their source as `*.test.ts`. Game logic is thoroughly unit-tested (~25 suites under `src/game/`); prefer writing tests **before** implementation (TDD). Under `src/board/` the pure modules (the terrain field, meshes, placement, wave and water maths in `visuals/`, grid and camera helpers) are tested the same way; React components and shaders are not, so keep logic out of them.

## Architecture

### Strict Separation: Game State vs. Visuals

**`src/game/`** — All game logic. No rendering, no React, no Three.js. Pure functions plus the boardgame.io `Game` definition. Boardgame.io uses Immer internally, so moves mutate `G` directly.

Logic is split into focused modules; `Game.ts` is the boardgame.io wiring that composes them:
- `Game.ts` — `Game<CaribbeanState>` definition: `setup()`, the two-phase flow, and all `moves` (moves delegate to pure `can*/apply*` helpers in the modules below). Also re-exports `MOVES_PER_TURN` and `getMaxMoves()` (from `turnMoves.ts`), and exports `withSetupData` / `withGeneratedMap` (a game whose `setup()` starts on a pinned size and seed, or on a map already generated), `withHotseatView` (the game for the seatless hotseat client, which sees the whole table) and `PLAYER_COUNT` (the seats a match is set up for, which the clients pass as `numPlayers`).
- `playerView.ts` — `playerViewFor(G, playerID)`, the game's boardgame.io `playerView` (#109): what one seat may see. Strips the undealt captain deck, other seats' draft hands, missions and stashed gold, and the cargo and gold of rival ships not scouted and NPCs not identified; no `playerID` is a spectator. boardgame.io's local client applies it too, so tests that read `G` from a seatless client wrap the game in `withHotseatView`.
- `types.ts` — All shared types, including `CaribbeanState` (the root G shape: `cells`, `ships`, `npcs`, `captainDeck`, `draftHands`, `combat?`, `floatingLoot`, …). Re-exported from `Game.ts` for convenience.
- `turnMoves.ts` — The turn's move budget: `getMaxMoves()` (the class's moves less mast damage), `movesLeft()`, `spendMove()` and `turnRunsOut()`, over the per-turn counter `G.movesUsed`.
- `hex.ts` — Pure hex-grid math (cube coords, neighbors, distance, `hexToWorld`).
- `constants.ts` — Ship specs/costs, upgrade definitions, repair costs.
- `mapConfig.ts` / `mapGenerator.ts` — Map size presets + procedural map generation (islands, ports, biomes). `generateWorld` returns the cells and the region table; `generateMap` just the cells.
- `regions.ts` — Regions (#239): five per map, one per nation plus the Pirates (`REGION_NATIONS`, region id = index). Each region's islands are one cluster, its ports fly its flag, channels at least 3 hexes wide (`REGION_CHANNEL`) separate the clusters, and every cell carries `region` (water: its nearest land's). `G.regions` holds each region's nation, seeded name and neighbouring regions.
- `mapRequest.ts` — `resolveMapRequest` (picks the map size and seed: pinned, else random) and `generateMapFor` (runs the generator for that request). Shared by `setup()` and the map worker.
- `moves.ts` — Movement helpers (`validMoveTargets`, `findAccessiblePort`).
- `combat.ts` — Ship-vs-ship combat resolution (seamanship, cannons, boarding, flee, damage/loot).
- `economy.ts` — Buy/sell goods, upgrades, repair, buying ships, jury-rig.
- `captains.ts` — Captain deck, drafting, home ports.
- `npcManager.ts` / `npcAI` — NPC merchants/flotillas: spawning and movement.
- `reputation.ts` — Bounties, flotilla escalation, pirate status (`isPlayerPirate`, kept per player in `G.pirates`) and the per-flag bounty on pirates.
- `missions.ts` — Mission generation and completion checks (delivery/escort/assassination).
- `scoring.ts` — Gold stashing, combat glory, win condition.
- `scouting.ts` — Scout targeting.
- `terrain.ts` — Terrain/elevation logic used by generation.

**`src/board/`** — All rendering. React components that read `BoardProps<CaribbeanState>` and call `moves.*`. No game logic here.
- `Board.tsx` — R3F `<Canvas>` + postprocessing + Tailwind HUD overlay; maps state to the 3D scene and orchestrates all panels/animations.
- `Ship.tsx` — Ship (also `SinkingShip`) sailing as `shipMotion.ts` steps it: one eased curve through the hexes of a move (routed round land by `shipRoute.ts` when it moves several at once), the bow turning at a limited rate, heeling into turns on top of the wave pose. It draws the class's generated model when it has one, else (and while it loads) the hull box from `shipHull.ts`.
- `shipModels.ts` — The ship model catalogue: each `ShipClass` to a model in `public/ships/` (board-variant `.glb` from `boats/`) or none, with its real length and part names; gives the scale (`metresToUnits × SHIP_SCALE`) and the turn from glTF −Z onto the heading. `shipAssetCheck.ts` (with `glb.ts`) holds every file in `public/ships/` to the budget and the catalogue, run by `shipAssets.node.test.ts`; `*.node.test.ts` files use Node's `fs` and are type-checked by `tsconfig.node.json`.
- `HexGrid.tsx` — Hex tile geometry.
- `regionMap.ts` — The regions on the board (#239), pure: border sides between regions, one label position per region (where the event deck's camera flies, #240), label opacity by zoom; drawn by `RegionBorders`, `RegionLabels` and `RegionTooltip`.
- `seat.ts` — The client's seat (#110): with a `playerID` the board acts only on that seat's turn (`seatMayAct`, `seatMayActInCombat`) and shows that seat's own ship and hand (`ownSeat`, `hudSeat`, `draftView`), never a rival's emptied purse; the glory scoreboard and the "waiting for" lines. Hotseat (no `playerID`) acts and shows for the current player. Dev `?seats=1` puts every seat on one page through boardgame.io's local transport (`loadSeatClient`, `LocalSeats.tsx`).
- `visuals/` — Environment rendering: the terrain height field (`terrainHeightField.ts`, `sharedTerrainField.ts`), the land mesh (`landMesh.ts`, `useLandTerrain.ts`, `LandTerrain.tsx`), `Ocean.tsx` and its wave/water maths, `TerrainDecorations.tsx` with the placement modules, and the light: `lighting.ts` (`lightingFor(timeOfDay)`, the one source of every lighting value, pinned to `GOLDEN_HOUR` in `sceneLighting.ts`; ADR 0002 amendment b) feeding `SunLight.tsx`, `FillLight.tsx`, the sky map and `PostEffects.tsx`; and the wind: `wind.ts` (`windFor(weather)`, the one wind direction and strength, pinned to `TRADE_WIND` in `sceneWind.ts`), read by the wave spectrum, the palms, the reefs' windward foam and the ships' sails and flags (`shipWind.ts`, #204). A source scan fails if any other module defines a wind direction. See **Terrain System** below.
- Panels & HUD: `PortPanel`, `MarketPanel`, `ShipyardPanel`, `ShipwrightPanel`, `TavernPanel`, `CombatPanel`, `DraftScreen`, `GameOverScreen`, `Hud*`, tooltips, and animation components.

**`src/audio/`** — Sound, played through three.js audio only: `soundRegistry.ts` (every sound and its CC0 credit; a test keeps it in step with `public/sounds/` and `NOTICE`), `audioEngine.ts` (one `AudioListener` on the camera, unlock on the first user gesture), `audioSettings.ts` (mute and master volume, saved per browser), `soundEvents.ts` / `eventSounds.ts` (game-state changes to sounds, played by `useGameSounds`), and the open-sea ambience bed (`ambienceBed.ts`, with `ambienceMix.ts` crossfading its two layers by camera distance). Keep the logic in the pure modules; `src/board/` only mounts the listener and feeds the bed.

**`src/lab/`** — Dev sandboxes, isolated from game code: the sound lab (`SoundLab.tsx`, at `?view=sound`) to audition every sound and tune the ambience bed, and the shader lab (`ShaderLab.tsx`, at `#lab`).

**`boats/`** — The ship generator, in Python, outside the web app: it drives Blender to build the Frigate, Galleon, Flute and Sloop procedurally (package `boats/frigate/`, one `*Params` per ship) and exports each as a lighter board-variant `.glb` (`export.export_board`, run inside Blender) held to the budget in `board.py`. Its tests are pure and run without Blender: `cd boats && uv run --with pytest pytest tests/ -q`. Only the `.blend` sources under `boats/build/` are tracked; the exported `.glb`s, the baked textures and renders are git-ignored.

**`src/online/`** — The online client's account pages (#105): email magic-link sign-in, sign-out, display-name edit (`?view=account`) and the public profile (`?view=profile&id=<uuid>`). Pure, tested modules (`supabaseConfig.ts`, `accountRoute.ts`, `displayName.ts`, `accountService.ts` over the narrow `AccountClient` port in `accountClient.ts`, which tests fake) with thin components on top. `supabaseClient.ts` loads supabase-js lazily, only when `VITE_SUPABASE_*` or the Marketplace's `NEXT_PUBLIC_SUPABASE_*` variables are set; without them the app is the hotseat game, unchanged. Styled with the online shell's tokens (`--font-fell*`, `--font-garamond`, `--color-shell-*` in `src/index.css`) and the class strings in `shellStyles.ts`.

**`api/` and `server/`** — The backend's one Vercel Function: `api/index.ts` serves every `/api/*` path (`vercel.json` rewrites them there) through `server/handleApiRequest.ts`, a web-standard `Request → Response` router tested without a server. Add routes there, not files under `api/` (each file there becomes its own function). Imports from `api/` into `server/` use a `.js` extension, as Node's ES modules need. Type-checked by `tsconfig.api.json`.

**`supabase/`** — `config.toml` for the local stack (Supabase CLI, a dev dependency), SQL migrations in `supabase/migrations/` (the schema; `profiles` with row-level security first) and the database tests in `supabase/tests/`, skipped unless `SUPABASE_DB_TESTS=1`. Deployment, env vars and local set-up: **`docs/deploy.md`**.

**`src/App.tsx`** — Routes to the labs, the prop viewer (`?view=props`), or the game. Dev URL parameters (size, seed, camera) are parsed in `src/board/devUrlParams.ts`. For the game, `loadGameClient.ts` generates the map first, in a Web Worker (`src/mapWorker/`, falling back to the main thread when there is no worker or it fails), because boardgame.io's `setup()` is synchronous; it then creates `Client({ game: withHotseatView(withGeneratedMap(Caribbean, map)), board })`. `GameClientLoader.tsx` shows `MapLoadingScreen` until the client is ready. Currently local single-client (no explicit transport). Online play (PRD #104) runs on Vercel Functions and Supabase instead of a boardgame.io server: moves go through `/api`, which runs the same `src/game/` reducer server-side.

### Game Flow (phases)

boardgame.io phases in `Game.ts`:
1. **`draft`** (start phase) — each player drafts a captain from a dealt hand (`minMoves/maxMoves: 1`), then advances to `main`.
2. **`main`** — the core loop. Each ship class sails its own number of moves a turn (`maneuverability`: Sloop 4, Frigate 3, Flute 2, Galleon 1; less one per point of mast damage, at least 1; `getMaxMoves()`). Only sailing a hex (`moveShip`), scouting (`spyglass`) and jury-rigging (`juryRig`) use a move, counted in `G.movesUsed` (reset as each turn begins), not boardgame.io's `ctx.numMoves`; port and ship-management actions (trade, upgrades, repair, buying a ship, stashing gold, the tavern) are free, and an attack ends the turn by starting combat. The turn ends by itself when the moves run out, unless the ship is then docked at a port: its captain may still use the port and presses End Turn. `onEnd` handles NPC movement/spawning. `endIf` on the game checks the win condition.

### Coordinate System

Hexagonal grid uses **cube coordinates** `(q, r, s)` where `s = -q - r`, flat-top orientation. `hexToWorld()` in `hex.ts` converts to Three.js world space (XZ plane, Y up). All coordinate math lives in `hex.ts`.

### Terrain System

One terrain height field (ADR 0001) drives everything drawn on or under the sea. `terrainHeightField.ts` builds it from `G.cells` and a seed in pure TypeScript: `sampleHeight(x, z)` in world space, a noise-perturbed coastline, `cell.elevation` setting how high land rises, negative under water; round each port it levels the town's terraces and carves its streets (`townPlateau.ts`, where the port village stands, `villageLayout.ts`). `sharedTerrainField.ts` builds it once per map. `landMesh.ts` samples it into one lattice mesh (land above sea level, seabed below); `terrainFieldTexture.ts` bakes it into a texture the ocean, wave displacement and shore foam shaders read; decorations and the port kit sample it on the CPU. The sea is one surface too (**ADR 0004**, `docs/adr/0004-one-sea-surface.md`): the GPU draws the wave spectrum at the wave clock's time, and `seaSurface.ts` (`createSeaSurface(...).heightAt`) evaluates the same swell band on the CPU for what rides the sea. Full design and the invariants the tests pin are in **`docs/terrain-system.md`** — read it before changing the field or the terrain/ocean shaders.

### Art Direction and Scale

Photorealism is confined to the water and the light; islands, props, ports and ships are our own stylised mid-poly models authored in code (**ADR 0002**, `docs/adr/0002-art-direction.md`). The hex is a board space, not a distance: each family of things carries its own picture factor (**ADR 0006**, `docs/adr/0006-diorama-scale-per-family-factors.md`, which supersedes ADR 0003's ship, building and village scale lines). Ships are ×2.3 on twice true scale (`SHIP_SCALE`, the Frigate's hull 0.44 of a hex, every hull box inside the hex inradius), rocks and stones stay at 115/350 (`PROP_SCALE`), and buildings, landmarks, vegetation and town pieces take `BUILDING_SCALE`, `LANDMARK_SCALE`, `VEGETATION_SCALE` and `TOWN_PIECE_SCALE`, while the water keeps 65 m per world unit (ADR 0003). The factors are named constants in `src/board/visuals/worldScale.ts`, with `PROP_DENSITY`; a new prop takes its family's factor there. Read ADR 0002 and ADR 0006 before adding or reshaping anything visible.

### Seeded World

The same map seed gives exactly the same world on every client; different seeds look different (**ADR 0007**, `docs/adr/0007-seeded-world-variety.md`). Every seeded visual draws from `stream(subSeed(G.mapSeed, "feature", ...ids))` (`src/board/visuals/subSeed.ts`; the feature names live in `seedFeatures.ts`), keyed by the stable ids of `src/board/visuals/islands.ts` (`cellId`, `portId`, `islandId`); nothing visual is stored in `G`. Each island draws an archetype (`islandArchetypes.ts`) and a look within its bands (`islandLook.ts`), which colour, plant and dress it but never change the field. ESLint rejects `Math.random` in game and render code; game randomness goes through boardgame.io's `random`.

### Multiplayer

boardgame.io's rules engine handles all multiplayer; online, its reducer runs in the `/api` function against Supabase (PRD #104), not in a boardgame.io server. All game state changes go through boardgame.io moves — never mutate state outside of moves.

### Styling

All HUD/overlay UI uses **TailwindCSS v4** (via `@tailwindcss/vite` plugin). No CSS modules, no styled-components. 3D visuals use Three.js materials/shaders directly. Postprocessing (bloom, vignette, tone mapping) via `@react-three/postprocessing`.

## Code Conventions

- **Functional TypeScript Only:** No classes. Interfaces/types for data, pure functions for logic.
- **State Serialization:** `CaribbeanState` (G) must stay JSON-serializable at all times — no methods, no class instances.
- **Separation of Concerns:** `src/game/` never imports React or Three.js. `src/board/` holds visuals only and dispatches moves.
- **Relative Imports:** There is **no** path alias configured (no `@/`). Use relative imports (e.g. `import { hexToWorld } from "../game/hex"`).
- **Strict Mode:** TypeScript strict mode, plus `noUnusedLocals`/`noUnusedParameters`. No `any`.
- **Single Responsibility:** Small files, one component per file. New game logic goes in a focused module under `src/game/`, wired into `Game.ts` moves.

## Key Dependencies

| Package | Role |
|---|---|
| `boardgame.io` | Game framework — state, moves, turns, phases, multiplayer |
| `three` | 3D engine |
| `@react-three/fiber` | React renderer for Three.js |
| `@react-three/drei` | R3F helpers (MapControls, etc.) |
| `@react-three/postprocessing` | Bloom / vignette / tone-mapping effects |
| `simplex-noise` | Noise behind the terrain field's coast, relief and reef crest (`visuals/periodicNoise.ts`) |
| `tailwindcss` | Utility-first CSS for HUD overlays |
| `vitest` | Test runner |

## Agent skills

### Issue tracker

Issues and specs are tracked as GitHub Issues on this repo (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

**This repo is public and built in the open.** Issues, PR descriptions, commit messages, and every tracked file are visible to anyone. Never include secrets, credentials, personal or employer details, absolute local paths, or private notes. Keep scratch work out of the repo.

### Triage labels

Uses the five canonical triage roles with default label strings. See `docs/agents/triage-labels.md`.

### Visual checks

Before chasing something that looks wrong in a screenshot, and after any browser check, read and update `docs/agents/visual-checks-ledger.md`: past false alarms, the limits of headless (software-rendered) screenshots, and the provenance every screenshot batch must state.

### Domain docs

Single-context: `docs/adr/` at the repo root, plus a root `CONTEXT.md` glossary once one is written (none exists yet; it is created lazily when domain terms get pinned down, so do not flag its absence). See `docs/agents/domain.md`.
