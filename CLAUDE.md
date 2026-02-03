# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Caribbean is a turn-based multiplayer naval strategy game (spiritual successor to Merchants & Marauders) for 6 players. Built with React + Vite + boardgame.io + React Three Fiber.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint (flat config, v9)
npm run preview    # Preview production build
npx tsc --noEmit   # Type-check only (no emit)
```

Testing is not yet configured. When adding a test framework, use Vitest (aligns with Vite). Tests must be written **before** implementation (TDD). If a feature cannot be tested first, explain why before proceeding.

## Architecture

### Strict Separation: Game State vs. Visuals

**`src/game/`** — All game logic. No rendering, no React, no Three.js. Only boardgame.io moves and pure functions.
- `Game.ts` — boardgame.io `Game` definition. State type (`CaribbeanState`), `setup()`, and all moves live here. Boardgame.io uses Immer internally, so moves mutate `G` directly.
- `hex.ts` — Pure hex-grid math. Cube coordinates `(q, r, s)` where `s = -q - r`. Provides neighbors, grid generation, equality checks, and hex-to-world-position conversion.

**`src/board/`** — All rendering. React components that read `BoardProps<CaribbeanState>` and call `moves.*`. No game logic here.
- `Board.tsx` — R3F `<Canvas>` + Tailwind HUD overlay. Receives boardgame.io props, maps state to 3D scene.
- `HexTile.tsx` — 3D hex geometry (extruded flat-top hexagon) and outline.
- `Ship.tsx` — Ship mesh with per-frame lerp animation between hex positions.

**`src/App.tsx`** — Wires boardgame.io `Client()` with game definition, board component, and multiplayer transport.

### Coordinate System

Hexagonal grid uses **cube coordinates** `(q, r, s)`. Flat-top orientation. `hexToWorld()` converts to Three.js world space (XZ plane, Y up). Grid radius is currently 3 (37 cells at radius 3... actually 37 for radius 3). All coordinate math is in `src/game/hex.ts`.

### Multiplayer

boardgame.io handles multiplayer. Currently using `Local()` transport (same browser). Production will use boardgame.io server with socket transport for 6 concurrent players. All game state changes go through boardgame.io moves — never mutate state outside of moves.

### Styling

All HUD/overlay UI uses **TailwindCSS v4** (imported via `@tailwindcss/vite` plugin). No CSS modules, no styled-components. 3D visuals use Three.js materials directly.

## Code Conventions

- **Functional TypeScript Only:** No classes. Use interfaces/types for data structures and pure functions for logic.
- **State Serialization:** Game state (G) must remain JSON-serializable at all times (no methods, no non-primitive objects inside G).
- **Separation of Concerns:**
  - `/game`: Pure game logic (boardgame.io moves). NO imports from React or Three.js here.
  - `/components`: Visuals only. They receive data as props and dispatch moves.
- **Strict Mode:** TypeScript strict mode enabled. No `any` types.
- **Single Responsibility:** Small files. One component per file.
- **Absolute Imports:** Use `@/` alias (e.g., `import { Hex } from '@/game/types'`) to avoid relative path confusion.

## Key Dependencies

| Package | Role |
|---|---|
| `boardgame.io` | Game framework — state, moves, turns, multiplayer |
| `three` | 3D engine |
| `@react-three/fiber` | React renderer for Three.js |
| `@react-three/drei` | R3F helpers (OrbitControls, etc.) |
| `tailwindcss` | Utility-first CSS for HUD overlays |
