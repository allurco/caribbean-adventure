# The harbour still

The online shell's backdrop is a still of the harbour (#122), and only the still: the shell's pages draw no live scene and create no WebGL context (#418), so a software or weak GPU never holds the menus up. The still is captured from the harbour scene (`src/board/harbour/HarbourScene.tsx`), the board's own sea, land and light on a fixed map, so it shows the game's look. **Capture it again whenever the harbour's map, its camera or the board's look changes**, or it drifts from the game.

## What the still depends on

- **The view** (`src/board/harbour/harbourView.ts`): the map (`HARBOUR_MAP`, size and seed), the camera distance and target offset, the board's field of view (`CAMERA_FOV`), and the still's size (`STILL_WIDTH` × `STILL_HEIGHT`). The capture records these in `src/online/harbourStillImage.ts` (`capturedWith`), and `harbourStillImage.test.ts` fails once they no longer match.
- **The look**: anything that changes how the harbour is drawn. That covers the lighting (`lightingFor`, `GOLDEN_HOUR`), the sea, the terrain field and land mesh, the decorations, the port villages, and the map generator itself (a generator change can move the port). No test catches these, so re-capture after any visual change to the board, and compare the old and new stills by eye.

## Capturing

```bash
npm run capture:harbour
```

`scripts/capture-harbour-still.mjs` starts a Vite dev server, opens the dev-only view `?view=harbour` (the harbour scene alone, full screen, its waves held at their first moment) in headless Chromium on the GPU at the still's size, waits for the scene's settled frame, and writes:

- `public/harbour/harbour-still.webp`: the still;
- `src/online/harbourStillImage.ts`: its path, a tiny inlined placeholder (shown blurred at first paint) and the view it was captured from.

It takes a few seconds on a machine with a GPU. The scene holds all its motion (the wave clock, and through `MotionHeldContext` in `src/board/visuals/motionHold.ts` the surf and the palms' sway), and the capture runs with reduced motion as well, so two runs give byte-identical files. The script prints the WebGL renderer it got. Check that it is a GPU ("ANGLE Metal Renderer: …" on a Mac, where it asks for ANGLE's Metal back end; elsewhere it takes Chromium's default), not "SwiftShader": a software-rendered still lights the water differently from the board the player sees (see `docs/agents/visual-checks-ledger.md`).

Then:

1. Look at the new still, and compare it with the old one if the look changed.
2. Run `npx vitest run src/online/harbourStillImage.test.ts`.
3. Commit both files together.

## Why it lines up

The still is shown with CSS `background-size: cover`, centred, so it fills any viewport, cropped evenly. The scene's camera keeps the board's vertical field of view up to the still's aspect (2.4 : 1) and the still's horizontal field beyond it, so `?view=harbour` opened at any window size frames exactly what the still shows there: `harbourView.test.ts` checks this at desktop, ultrawide and landscape-phone sizes. Changing either rule, or the still's size, breaks the match until the still is captured again.
