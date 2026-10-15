# Project Caribbean

A turn-based naval strategy game for up to four players, set in the age of sail. Captain a ship, trade between ports, take on missions, and fight rival captains and NPC flotillas on a procedurally generated archipelago.

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

The game currently runs as a single local client: all players take turns on one screen. Online play is being built on Vercel and Supabase (#104); with no Supabase settings the app stays the local game. Deployment and local backend set-up: [docs/deploy.md](docs/deploy.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |
| `npm run test:db` | Row-level security tests against a local Supabase (`npx supabase start`, needs Docker) |

## Dev URL parameters

Query parameters on the dev server pin what would otherwise be random, so a URL alone reproduces a map and a view (for screenshots and bug reports). They are parsed once in `src/board/devUrlParams.ts`; a missing or invalid value falls back to the normal behaviour, and a bare URL changes nothing.

| Parameter | Effect |
|---|---|
| `size=small\|medium\|large` | Map size (random otherwise) |
| `seed=<integer>` | Map generation seed: a plain decimal integer from -2147483648 to 2147483647 (random otherwise) |
| `cx=<x>&cz=<z>` | Where the camera looks on the first frame, in world units (both needed; the map's middle otherwise) |
| `dist=<positive number>` | How far the camera starts from its target, in world units (the map's iso distance otherwise); the zoom limits still apply: 1.0 (town zoom) to 28. Below 4.32 the target settles onto the ground, so a hilltop is framed without lifting it by hand |
| `view=props` | The prop viewer instead of the game, with `focus=<n>` to start close up on entry n |
| `view=sound` | The sound lab instead of the game: every registered sound with play/stop, a loop toggle, its volume and its source, for approving sounds by ear |
| `view=account` | The sign-in page, or your own captain once signed in (#105). Only with a Supabase backend configured ([docs/deploy.md](docs/deploy.md)); otherwise the game |
| `view=profile&id=<uuid>` | A player's public profile (#105). Only with a Supabase backend configured |
| `skipLogin=1` | Straight to the local hotseat game, past the sign-in screen. With a Supabase backend configured the root URL is the sign-in screen and the game opens once you are signed in; this is the temporary way past it until the online entry (#125). Works in every build, as only deployed builds have a backend |
| `stats=1` | A corner readout of fps, draw calls and triangles per frame (every pass: shadows, wave cascades, postprocessing), averaged over half a second, for the numbers each visual slice reports in its PR (#162). Dev server only: production builds leave it out |
| `buoys=1` | Small orange buoys on the CPU sea surface, on a 9 × 9 grid round the camera focus, to check by eye that it rides the drawn swell (#141) |
| `seedGallery=1` | The 12-seed contact sheet instead of the game (#161): every seed in `SEED_GALLERY_SEEDS` at map zoom and at ship zoom over the port nearest the map's middle (`SEED_GALLERY_VIEWS`, both in `src/lab/seedGalleryShots.ts`), one row a seed. With `size=medium\|large` for that size (small otherwise). The shots render one at a time (about 5 s each); click one to open its view, or **save PNG** for the whole sheet. Dev server only |
| `seats=1` | Every seat of the match on one page, through boardgame.io's local transport (#110): each seat gets only its own view (`playerView`) and acts only on its own turn. A switcher at the top right shows one seat's board at a time. Dev server only |
| `snapshot=1` | One gallery shot: the draft picks itself and the board posts its frame to the gallery. The gallery adds it; you should not need it by hand. Dev server only |

**Seed control.** On the dev server the board shows the map's size and seed at the bottom of the screen. `[` and `]` reload on seed − 1 and seed + 1, `\` on a random seed, each keeping the size and every other parameter (the camera's `cx`, `cz`, `dist`, `stats`, …); **copy URL** copies a URL that reproduces the map on screen. Production builds leave the control out.

The hash `#lab` opens the shader sandbox. For example, `/?size=small&seed=1&cx=22.5&cz=13&dist=3.4` opens the same small map every time, at ship zoom over its middle port (Isla Quieta), and `/?size=small&seed=1&cx=16.5&cz=23.4&dist=1` at town zoom over Île de Sable. The size and seed choose the map the local client generates before its match starts (in a Web Worker, see `src/mapWorker/`); the camera values go to the board. Captains and NPCs stay random.

## Project structure

```
src/
├── game/    Game rules: pure TypeScript, no React or Three.js
├── board/   Rendering: React components, 3D scene, and HUD
├── audio/   Sound: the registry, settings, the state-diff events, three.js playback
├── lab/     Shader experiments (open the app at /#lab) and the sound lab (/?view=sound)
├── mapWorker/  Generates the map in a Web Worker, with a main-thread fallback
├── online/  Sign-in and profile pages, when a Supabase backend is configured
└── App.tsx  Wires the game to the board via boardgame.io
api/         The Vercel Function serving /api/* (routes in server/)
supabase/    Local Supabase config, SQL migrations and database tests
docs/        Design notes (for example, terrain-system.md) and deploy.md
```

Game logic and rendering are kept strictly separate. Everything under `src/game/` is pure functions over a JSON-serializable state, and it is unit-tested. `src/board/` only reads state and dispatches moves.

## Contributing

This is a personal project being built in the open. Ideas and bug reports are welcome in [Issues](../../issues). Open an issue before starting on a pull request, so we can agree on the approach first.

## License

[MIT](LICENSE). Third-party assets (the CC0 sounds under `public/sounds/`) are listed with their sources in [NOTICE](NOTICE).
