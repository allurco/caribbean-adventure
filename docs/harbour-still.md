# The harbour still

The online shell paints a still of the harbour first, then fades the live scene in over it (#122). The two only match while the still shows what the live scene shows, so **capture the still again whenever the harbour's map, its camera or its look changes**.

## What the still depends on

- **The view** (`src/board/harbour/harbourView.ts`): the map (`HARBOUR_MAP`, size and seed), the camera distance and target offset, the board's field of view (`CAMERA_FOV`), and the still's size (`STILL_WIDTH` × `STILL_HEIGHT`). The capture records these in `src/online/harbourStillImage.ts` (`capturedWith`), and `harbourStillImage.test.ts` fails once they no longer match.
- **The look**: anything that changes how the harbour is drawn. That covers the lighting (`lightingFor`, `GOLDEN_HOUR`), the sea, the terrain field and land mesh, the decorations, the port villages, and the map generator itself (a generator change can move the port). No test catches these, so re-capture after any visual change to the board, and compare the old and new stills by eye.

## Capturing

```bash
npm run capture:harbour
```

`scripts/capture-harbour-still.mjs` starts a Vite dev server, opens the dev-only view `?view=harbour` (the backdrop's live scene alone, full screen, its waves held at their first moment) in headless Chromium on the GPU at the still's size, waits for the scene's settled frame, and writes:

- `public/harbour/harbour-still.webp`: the still;
- `src/online/harbourStillImage.ts`: its path, a tiny inlined placeholder (shown blurred at first paint) and the view it was captured from.

It takes a few seconds on a machine with a GPU. It runs with reduced motion, so the palms and the surf are held too, and two runs give byte-identical files. The script prints the WebGL renderer it got. Check that it is a GPU ("ANGLE Metal Renderer: …" on a Mac), not "SwiftShader": a software-rendered still lights the water differently from the live scene the player sees (see `docs/agents/visual-checks-ledger.md`).

Then:

1. Look at the new still, and compare it with the old one if the look changed.
2. Run `npx vitest run src/online/harbourStillImage.test.ts`.
3. Commit both files together.

## Why it lines up

The live camera keeps the board's vertical field of view up to the still's aspect (2.4 : 1) and the still's horizontal field beyond it. The still is shown with CSS `background-size: cover`, centred. Under that pair of rules, every world point lands on the same pixel in both, at any viewport size: `harbourView.test.ts` checks this at desktop, ultrawide and landscape-phone sizes. Changing either rule, or the still's size, breaks the match until the still is captured again.
