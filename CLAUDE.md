# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Caribbean is a turn-based multiplayer naval strategy game (spiritual successor to Merchants & Marauders) for 6 players. Built with React + Vite + boardgame.io + React Three Fiber.

## Commands

```bash
npm run dev              # Start dev server (Vite)
npm run build            # Type-check + production build (tsc -b && vite build)
npm run lint             # ESLint (flat config, v9)
npm run preview          # Preview production build
npm test                 # Run all tests once (vitest run)
npm run test:watch       # Vitest in watch mode
npx tsc --noEmit         # Type-check only (no emit)

npx vitest run src/game/combat.test.ts        # Run a single test file
npx vitest run -t "flee attempt"              # Run tests matching a name
```

Tests use **Vitest** and live next to their source as `*.test.ts`. Game logic is thoroughly unit-tested (~25 suites under `src/game/`); prefer writing tests **before** implementation (TDD). Under `src/board/` the pure modules (the terrain field, meshes, placement, wave and water maths in `visuals/`, grid and camera helpers) are tested the same way; React components and shaders are not, so keep logic out of them.

## Architecture

### Strict Separation: Game State vs. Visuals

**`src/game/`** — All game logic. No rendering, no React, no Three.js. Pure functions plus the boardgame.io `Game` definition. Boardgame.io uses Immer internally, so moves mutate `G` directly.

Logic is split into focused modules; `Game.ts` is the boardgame.io wiring that composes them:
- `Game.ts` — `Game<CaribbeanState>` definition: `setup()`, the two-phase flow, and all `moves` (moves delegate to pure `can*/apply*` helpers in the modules below). Also exports `MOVES_PER_TURN` and `getMaxMoves()`.
- `types.ts` — All shared types, including `CaribbeanState` (the root G shape: `cells`, `ships`, `npcs`, `captainDeck`, `draftHands`, `combat?`, `floatingLoot`, …). Re-exported from `Game.ts` for convenience.
- `hex.ts` — Pure hex-grid math (cube coords, neighbors, distance, `hexToWorld`).
- `constants.ts` — Ship specs/costs, upgrade definitions, repair costs.
- `mapConfig.ts` / `mapGenerator.ts` — Map size presets + procedural map generation (islands, ports, biomes).
- `moves.ts` — Movement helpers (`validMoveTargets`, `findAccessiblePort`).
- `combat.ts` — Ship-vs-ship combat resolution (seamanship, cannons, boarding, flee, damage/loot).
- `economy.ts` — Buy/sell goods, upgrades, repair, buying ships, jury-rig.
- `captains.ts` — Captain deck, drafting, home ports.
- `npcManager.ts` / `npcAI` — NPC merchants/flotillas: spawning and movement.
- `reputation.ts` — Bounties and flotilla escalation.
- `missions.ts` — Mission generation and completion checks (delivery/escort/assassination).
- `scoring.ts` — Gold stashing, combat glory, win condition.
- `scouting.ts` — Scout targeting.
- `terrain.ts` — Terrain/elevation logic used by generation.

**`src/board/`** — All rendering. React components that read `BoardProps<CaribbeanState>` and call `moves.*`. No game logic here.
- `Board.tsx` — R3F `<Canvas>` + postprocessing + Tailwind HUD overlay; maps state to the 3D scene and orchestrates all panels/animations.
- `Ship.tsx` — Ship mesh with per-frame lerp animation (also `SinkingShip`).
- `HexGrid.tsx` — Hex tile geometry.
- `visuals/` — Environment rendering: the terrain height field (`terrainHeightField.ts`, `sharedTerrainField.ts`), the land mesh (`landMesh.ts`, `useLandTerrain.ts`, `LandTerrain.tsx`), `Ocean.tsx` and its wave/water maths, `TerrainDecorations.tsx` with the placement modules, `SunLight.tsx`. See **Terrain System** below.
- Panels & HUD: `PortPanel`, `MarketPanel`, `ShipyardPanel`, `ShipwrightPanel`, `TavernPanel`, `CombatPanel`, `DraftScreen`, `GameOverScreen`, `Hud*`, tooltips, and animation components.

**`src/App.tsx`** — Wires boardgame.io `Client({ game, board })`. Currently local single-client (no explicit transport); production will use the boardgame.io server with socket transport for 6 players.

### Game Flow (phases)

boardgame.io phases in `Game.ts`:
1. **`draft`** (start phase) — each player drafts a captain from a dealt hand (`minMoves/maxMoves: 1`), then advances to `main`.
2. **`main`** — the core loop. Each turn allows up to `MOVES_PER_TURN` (3) moves, adjusted by ship state via `getMaxMoves()`. `onEnd` handles NPC movement/spawning. `endIf` on the game checks the win condition.

### Coordinate System

Hexagonal grid uses **cube coordinates** `(q, r, s)` where `s = -q - r`, flat-top orientation. `hexToWorld()` in `hex.ts` converts to Three.js world space (XZ plane, Y up). All coordinate math lives in `hex.ts`.

### Terrain System

One terrain height field (ADR 0001) drives everything drawn on or under the sea. `terrainHeightField.ts` builds it from `G.cells` and a seed in pure TypeScript: `sampleHeight(x, z)` in world space, a noise-perturbed coastline, `cell.elevation` setting how high land rises, negative under water. `sharedTerrainField.ts` builds it once per map. `landMesh.ts` samples it into one lattice mesh (land above sea level, seabed below); `terrainFieldTexture.ts` bakes it into a texture the ocean, wave displacement and shore foam shaders read; decorations and the port kit sample it on the CPU. Full design and the invariants the tests pin are in **`docs/terrain-system.md`** — read it before changing the field or the terrain/ocean shaders.

### Art Direction and Scale

Photorealism is confined to the water and the light; islands, props, ports and ships are our own stylised mid-poly models authored in code (**ADR 0002**, `docs/adr/0002-art-direction.md`). A hex stands for about 350 m in the picture, with props at 115/350 of their former size, ships at twice true scale and buildings at 1.125 × true scale, while the water keeps 65 m per world unit (**ADR 0003**, `docs/adr/0003-hex-scale-350-metres.md`). The factors are the named constants `PROP_SCALE`, `SHIP_SCALE`, `BUILDING_SCALE` and `PROP_DENSITY` in `src/board/visuals/worldScale.ts`; a new prop takes its factor there. Read both before adding or reshaping anything visible.

### Multiplayer

boardgame.io handles all multiplayer. All game state changes go through boardgame.io moves — never mutate state outside of moves.

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

### Domain docs

Single-context: `docs/adr/` at the repo root, plus a root `CONTEXT.md` glossary once one is written (none exists yet; it is created lazily when domain terms get pinned down, so do not flag its absence). See `docs/agents/domain.md`.
