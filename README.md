# Project Caribbean

A turn-based naval strategy game for up to six players, set in the age of sail. Captain a ship, trade between ports, take on missions, and fight rival captains and NPC flotillas on a procedurally generated archipelago.

Inspired by classic age-of-sail board games, rebuilt as a 3D browser game.

> **Status: early development, built in public.** Expect rough edges, half-finished features, and breaking changes. Progress is tracked in [GitHub Issues](../../issues).

## Features

What exists today:

- **Captain draft.** Each player drafts a captain from a dealt hand before the game starts.
- **Hex-based sailing.** Up to three actions per turn on a hex map, adjusted by your ship's condition.
- **Procedural maps.** Islands, ports, and biomes are generated from noise, with several map-size presets.
- **Trading and shipyards.** Buy and sell goods, repair, jury-rig, buy upgrades, or buy a new ship.
- **Ship combat.** Seamanship, cannon fire, boarding, fleeing, damage, and loot.
- **NPCs and reputation.** NPC merchants and flotillas roam the map, and bounties escalate as your reputation drops.
- **Missions.** Delivery, escort, and assassination contracts.
- **Scoring.** Stash gold and earn glory to win.
- **3D rendering.** Shader-driven terrain and ocean built with React Three Fiber.

## Tech stack

- [React 19](https://react.dev) + [Vite](https://vite.dev) + TypeScript (strict)
- [boardgame.io](https://boardgame.io) for game state, turns, phases, and multiplayer
- [Three.js](https://threejs.org) via [React Three Fiber](https://r3f.docs.pmnd.rs) and [drei](https://github.com/pmndrs/drei)
- [Tailwind CSS v4](https://tailwindcss.com) for the HUD
- [Vitest](https://vitest.dev) for tests

## Getting started

You need Node.js 20.19 or newer (Vite 7 requires it).

```bash
git clone https://github.com/allurco/caribbean-adventure.git
cd caribbean-adventure
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

The game currently runs as a single local client: all players take turns on one screen. Networked multiplayer through a boardgame.io server is planned.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |

## Dev URL parameters

Query parameters on the dev server pin what would otherwise be random, so a URL alone reproduces a map and a view (for screenshots and bug reports). They are parsed once in `src/board/devUrlParams.ts`; a missing or invalid value falls back to the normal behaviour, and a bare URL changes nothing.

| Parameter | Effect |
|---|---|
| `size=small\|medium\|large` | Map size (random otherwise) |
| `seed=<integer>` | Map generation seed: a plain decimal integer from -2147483648 to 2147483647 (random otherwise) |
| `cx=<x>&cz=<z>` | Where the camera looks on the first frame, in world units (both needed; the map's middle otherwise) |
| `dist=<positive number>` | How far the camera starts from its target (the map's iso distance otherwise); the zoom limits still apply |
| `view=props` | The prop viewer instead of the game, with `focus=<n>` to start close up on entry n |

The hash `#lab` opens the shader sandbox. For example, `/?size=small&seed=1&cx=12&cz=13.9&dist=4.3` opens the same small map every time, at ship zoom over its middle port. The size and seed become the game's boardgame.io `setupData` (merged over whatever match creation passes, so a pin overrides only the keys it sets); the camera values go to the board. Captains and NPCs stay random.

## Project structure

```
src/
├── game/    Game rules: pure TypeScript, no React or Three.js
├── board/   Rendering: React components, 3D scene, and HUD
├── lab/     Shader experiments (open the app at /#lab)
└── App.tsx  Wires the game to the board via boardgame.io
docs/        Design notes (for example, terrain-system.md)
```

Game logic and rendering are kept strictly separate. Everything under `src/game/` is pure functions over a JSON-serializable state, and it is unit-tested. `src/board/` only reads state and dispatches moves.

## Contributing

This is a personal project being built in the open. Ideas and bug reports are welcome in [Issues](../../issues). Open an issue before starting on a pull request, so we can agree on the approach first.

## License

[MIT](LICENSE)
