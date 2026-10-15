# Visual Checks Ledger

What agents (and people) have learned from checking the game in a browser: reports that turned out not to be bugs, the limits of headless screenshots, and where each batch of screenshots came from. Read it before chasing something that "looks wrong" in a screenshot; add to it when an investigation ends.

The repo is public: no local paths, names or private notes here. Refer to branches, commits, PRs and issues.

## Headless capture limits

Headless Chromium usually has no GPU, so WebGL runs on a software renderer (SwiftShader). That is good enough for layout, HUD and geometry checks, and not good enough to judge light. It is also slow: on SwiftShader the board takes about 40 s from page load to a fully drawn first frame, on a GPU about 3 s.

### Recommended setup: headless Chromium on the real GPU

On macOS, Playwright's headless Chromium can render through the machine's GPU (ANGLE on Metal). Use it by default for browser checks; fall back to SwiftShader only where there is no GPU, and say so.

```js
const browser = await chromium.launch({
  headless: true,
  channel: "chromium", // the new headless mode (the full browser, not the headless shell)
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
```

Check which renderer you got: `WEBGL_debug_renderer_info`'s `UNMASKED_RENDERER_WEBGL` reads "ANGLE Metal Renderer: Apple …" on the GPU path and "SwiftShader" on the software one. Both support float and half-float render targets (`EXT_color_buffer_float`, `EXT_color_buffer_half_float`), so the wave cascades run on either.

Wait for the board's loading screen to go (the progress bar `[role=progressbar]` is gone or its veil at opacity 0) before taking a screenshot; `snapshot=1` already waits on it.

- **Don't judge lighting, glow or bloom from a software-rendered screenshot.** A bright or invalid pixel can come out differently there, and bloom smears it into a disc. Confirm any lighting finding in a browser on a real GPU before filing or fixing it.
- Say which renderer a screenshot used when reporting it (see Screenshot provenance below).

## Investigated, not a bug

One entry per report. Newest first.

### 2026-10-15: `?seats=1` behind the loading screen (merge of main into PR #262)

- **Batch:** branch `feat/loading-screen` with main (#245) merged in; headless Chromium on the GPU (ANGLE Metal); `?size=small&seed=1&snapshot=1` at 1280×800 and `?seats=1&size=small&seed=1` at 1024×640, camera at its default start.
- **Seen:** each seat's board shows the loading screen until its own scene is ready, again on every seat switch (the switcher remounts the client); then the draft over the scene, then the board with End Turn on the seat to play and "Waiting for …" on the other. No debug panel in either view, and no screenshot timeouts on the GPU.
- **Found and fixed in the merge:** the draft now sits over the scene at z-55, which covered the seat switcher (z-50) so no other seat could be picked during the draft. The switcher now sits above the draft and the loading screen.

### 2026-10-15: white sea with only hex lines in headless screenshots

- **Symptom:** the sea drawn flat white (the horizon haze colour) with only the hex outlines, ships and land on it, in headless screenshots, including `snapshot=1` gallery shots. Earlier written off as a software-rendering artifact.
- **Cause:** timing, in our code, not a renderer limit. The ocean mounts only once the sky environment is baked (`useSkyEnvironment`): its irradiance is read back from the GPU asynchronously, then the ocean's shaders compile on its first draw. Until then the scene background (the haze) shows where the sea will be. Timed on main, small map seed 1: on SwiftShader the board mounted at 9.5 s, the sky readback resolved at 18.9 s and the ocean drew its first frame at 26.1 s; on the headless GPU the same steps took 2.3 s, 2.5 s and 2.8 s, so even a real browser showed a white sea for about half a second. The gallery shot was taken 4 s after the board mounted, long before the sea on SwiftShader. Float and half-float targets are supported on both renderers, and there were no WebGL errors.
- **Fixed:** the board now stays behind a loading screen until every asset, the world, the sky, the shaders and a few frames are ready (`sceneReadiness.ts`, `useSceneReadiness.ts`), and `snapshot=1` waits on the same gate. With it the sea is drawn in the first frame shown on both renderers.

### 2026-10-15: `?seats=1` checks with one seat per page (#110, PR #245 at `afe2cb6`)

- **Batch:** branch `feat/110-seat-aware-board`, commit `afe2cb6`; headless Chromium, software renderer (SwiftShader); `?seats=1&size=small&seed=1`, 1024×640, camera left at its default start over each seat's own ship.
- **Screenshots did not time out this time.** `LocalSeats` mounts only the shown seat's board, and with a small viewport each shot took 10 to 20 s. The earlier 90 s timeouts were likely the larger viewport, not several scenes on one page.
- **How the fights were set up:** the harness wrote to the local transport's stored match state (positions next to each other, an NPC added, a ship deleted to stand in for a sinking), then pressed the board's own buttons. Ships and NPCs placed this way can sit on land, and a white sea is the known capture artifact; neither is a bug.

### 2026-10-15: screenshots time out in `?seats=1` (#110 re-check)

- **Symptom:** while re-checking PR #245's fixes, headless `page.screenshot` calls timed out after 90 s once a game was under way in `?seats=1&size=small&seed=1`. The draft and the first in-game shots worked.
- **Ruled out:** this is not a game hang. Earlier shots in the same session rendered, and the unit tests cover the combat gating.
- **Conclusion:** the software renderer (SwiftShader) can't keep up with several full scenes mounted on one page. Check combat flows in `?seats=1` on a real GPU, or with one seat's client per page.

### 2026-10-14: sea drawn white, or a dark patch round a docked ship (#110 check)

- **Symptom:** in headless screenshots taken while checking PR #245 (`?seats=1` and hotseat, `size=small&seed=1`), the sea sometimes came out flat white with only hex lines, and once a dark blue polygon of water lay round a seat's docked ship while it was another seat's turn.
- **Ruled out:** both showed with the same code from frame to frame and run to run, and the dark patch is not the reach: off-turn the board gets no moves and is locked, so no reach is built.
- **Conclusion:** taken as an artifact of the software-rendered capture (water shader timing), not checked on a real GPU. Recheck there before filing anything.

### 2026-10-14: white glare blob beside the player's ship

- **Symptom:** a large blown-out white disc on the water right beside the active ship, in close-up headless screenshots taken while checking #231, #232 and #233.
- **Ruled out:** each PR was merged to main one at a time and checked on a real GPU (with the reach showing for #213's overlay): no blob. None of the three touches lights, materials or post-processing. The sun glint (#38), the golden-hour light (#169) and the reach overlay (#215, #220) were suspected and ruled out the same way.
- **Conclusion:** an artifact of the headless software-rendered capture, not of the game. No change made.
- **Confirmed 2026-10-15:** the same view (small map, seed 1, opening ship zoom) in headless Chromium on the GPU (setup above) shows no blob; on SwiftShader it is still there.

## Screenshot provenance

When an agent reports screenshots, it states for the batch:

- **Branch and commit** the server was running (`git rev-parse --short HEAD` in its worktree).
- **Renderer:** headless software (SwiftShader), headless GPU, or a real browser.
- **View:** map size and seed (URL parameters) and roughly where the camera was.

That is enough to answer "which PR is this from?" later without guessing.

## Screenshot batches

### 2026-10-15: region borders and labels (#239, PR #255)

- **Branch and commit:** `feat/239-regions` at `715fc44`.
- **Renderer:** headless software (SwiftShader, ANGLE/Vulkan), 1440×900, `snapshot=1`.
- **View:** `size=small&seed=1`, `size=small&seed=4`, `size=medium&seed=7`, `size=large&seed=3`; the camera at full zoom-out (distance 28) over the map's middle, plus distances 10, 8 and 6, and a hover on a reachable sea hex. Some shots recoloured the border lines red or hid the grid at runtime, to tell the two apart; those are marked as such.
- **Findings:** borders follow the channels and open sea separates every region on all four maps; the region tooltip shows on hover. Where the water grid shows at full strength, the parchment border at 30% reads as one more grid line. Some labels run over islands and port names. Colour, opacity and label size are judgement calls for a real GPU, not this renderer.
