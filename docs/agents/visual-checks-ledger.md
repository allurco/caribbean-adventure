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

## Batches

### 2026-10-15: combat effects on the board (#263)

- **Branch and commit:** `feat/combat-effects`, shot from 6648a28 to 2ac6893 as the smoke, foam, flash and camera were tuned.
- **Renderer:** headless Chromium on the real GPU (ANGLE Metal, `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`), not SwiftShader, at 1440×900, with boardgame.io's debug panel hidden (`.`).
- **View:** `?size=small&seed=4242`. Each seat drafts its first captain; the match state is then rewritten in the client's store (an `UPDATE` with a new `G`): player 0 a Frigate on open water, the target one hex off (player 1's Galleon at hull 1, or a Spanish Flute merchant at hull 1). The fight is started with `attackShip`/`attackNPC` and played with the real combat buttons (Roll Seamanship, Fire!/Flee/Board, Fire Cannons!, Apply Damage). Rolls are random, so who fires, hits and sinks varies run to run.
- **Learned:** the flat foam quads drew nothing until they faced up (a plane laid onto x/z with its y on +z faces down and is culled). The hull foam lay where a ship was before the fight turned her until it was written from the fight's pose. The turn change after a combat phase starts flew the camera off the fight (it now stays while the fight plays). A muzzle flash lives a quarter of a second, so stills catch it only now and then; judge the flash by eye in a live browser. The "your turn" banner that shows when the combat phase starts is the existing turn hand-off, not this work.

## Screenshot provenance

When an agent reports screenshots, it states for the batch:

- **Branch and commit** the server was running (`git rev-parse --short HEAD` in its worktree).
- **Renderer:** headless software (SwiftShader), headless GPU, or a real browser.
- **View:** map size and seed (URL parameters) and roughly where the camera was.

That is enough to answer "which PR is this from?" later without guessing.

## Screenshot batches

### 2026-10-15: kerbs along a lane in the shore band (#261)

- **Branch and commit:** `fix/261-town-kerbs`, uncommitted work on `a04f058` (main), against `a04f058` unchanged (the fix stashed) for the before shots.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1280×800, `snapshot=1`, 5 s after the loading screen went.
- **View:** `?size=small&seed=1&cx=15.64&cz=24.80` at `dist=1.2` and `dist=2.5`: the back lane of the port on plateau 4 where the kerb test failed, the stretch where the lane runs along the shore band. The captain (and so the ship's port in the HUD) is random per load; the camera is pinned, so the view is the same.
- **Findings:** before, the lane's seaward kerb stops short where the street's floor dips into the shore band though its edge stands above it, leaving a gap along the bank; after, the kerb runs on along that edge and ends where the edge goes down onto the beach. The rest of the frame differs only where stones moved (each run is now filled end to end). At `dist=2.5` the kerbs are too small to judge.

### 2026-10-15: players out of the game (#265, PR #283)

- **Branch and commit:** `feat/265-captains-out` at `52c0fbb`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1280×800.
- **View:** `?seats=1&size=small&seed=1` (two seats on this branch: #278's solo and `?players=` are on main, not merged in), camera where each seat's board puts it. Both seats drafted through `pickCaptain`. States staged by writing a deep copy of the local transport's stored match state and syncing: on seat 0's turn, seat 1's ship moved to `lostShips` with glory 4 and the captain deck emptied; then seat 0's End Turn sent as an event.
- **Findings:** seat 1's turn came, no captain was left to deal, it went out and the turn came straight back to seat 0 (turn 3 to 5, and 5 to 6 on the next End Turn, always seat 0). The glory board keeps the out seat's glory, struck through and dimmed with an "OUT" tag, on both seats' boards. Seat 1's board shows "You are out of the game / No captain is left to take command. Your glory stands; you watch the table from here.", with "Waiting for <rival>" at the top. With seat 0's ship then lost too (staged) and End Turn, every seat was out and the game ended: the game-over card on both boards, "Captain Blackbeard … Final glory 4", the dead captain of the seat with most glory. No page errors.
- **Not checked:** a true solo game (needs main's #278 merged in; the all-out ending is the same `endIf` path). Deleting a seat's ship mid-turn without ending it shows the "Awaiting orders" overlay; a staging artifact, real losses end the turn.
- **For the maintainer:** the out seat is listed as "Player 2", not its last captain's name; the all-out game-over card reads "VICTORY! … has conquered the Caribbean!" on every seat's board, though no one reached the winning glory.

### 2026-10-15: captain death on main (#265, PR #277)

- **Branch and commit:** detached `origin/main` at `894edb4` (after #276, #277 and #279 merged).
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1280×800.
- **View:** `?seats=1&size=small&seed=1`, camera left where each seat's board puts it. Fights staged by writing a deep copy of the local transport's stored match state (the stored state is frozen, so it must be copied, edited and set back, then synced): seat 1 moved next to seat 0, hulls and cannons set so one side sinks. "Attack!" pressed, then the `attackShip` move sent from the client (no canvas hex click). Seat 0's End Turn was sent to the shared master as seat 0's event while seat 1's board was mounted, so seat 1 could be watched as its turn came.
- **Findings:** seat 1 sunk: "Your ship is lost" card, the sinking ship lists and goes under, seat 0 sees "Waiting for Player 2 to pick a new captain"; on seat 1's turn the captain screen comes up, the new captain's sloop is at that captain's home port with 4 moves and sails. The glory board keeps the lost seat's glory ("Player 2 3"). A sunk attacker passes the turn on. A mutual sinking (both ships lost) passed the turn too.
- **For the maintainer:** on seat 1's turn the "<rival>'s turn ends" banner shows dimmed under the captain screen, across its title; no "Your turn" banner shows for the new captain, and after the pick the camera stays on the map overview instead of going to the new ship. In combat the turn banner announces the defender ("Your turn, <defender>") on the attacker's board, as the combat phase makes the defender current.

### 2026-10-15: region ink printed over the sea's light (#239, follow-up to PR #279)

- **Branch and commit:** `feat/239-region-ink`, uncommitted work on `3f910ae` (main), against `3f910ae` unchanged for the before shots.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1440×900, `snapshot=1`, about 4 s after the loading screen faded.
- **View:** the eight views in PR #279's description, each with `regionBorder=water` and `regionBorder=line`. Diagnostic runs swapped shader lines through a request intercept (no source change): the raw ink painted as colour to find the names and seams, each lighting term alone, and the ink forced to zero as a baseline.
- **Findings:** at the overview the sky's reflection is a small part of a sea pixel (about 4 grey levels against about 45 for the water body); the haze lifts the rest, and gamma and haze cut a darkening in the shader to well under half on screen. Measured against the zero-ink baseline, the shipped ink darkened the names by 4% (unreadable). Dimming the reflection alone barely moved it. What works: the ink darkens the water body, the reflection and the sun's glint together, at `REGION_NAME_INK` 0.9 and `REGION_SEAM_INK` 0.55 with a deep-blue `REGION_INK_SHADE`, and the wobble cut from 0.35 to 0.12, which had scrambled 7-px letters. Names are then about 33% darker on the small overview and read on all three overviews, including in the sun's path; the far names fade into the haze. Nothing at distance 5; `line` mode draws no seams in the water. The dark blotches in the shallows near Crescent Harbor are seabed, in the before shots too.

### 2026-10-15: region names in the sea (#239, PR #279)

- **Branch and commit:** detached `origin/main` at `894edb4`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1440×900, `snapshot=1` added to each URL.
- **View:** the eight views in PR #279's description (small 1, medium 7, large 3; distances 26/28, 11 to 13, and 5), each with the default `regionBorder=water` and with `regionBorder=line`.
- **Findings:** no region name and no seam can be seen in any shot, even with the contrast pushed. The chart is drawn (all five names and the seams, in the canvas), uploaded, and `regionNameInk` reaches 0.42 at distance 20 and over. With the ink forced to full in the shader (a request intercept, no source change) the names and seams show, in the water, off the land and the port labels, readable on the large map. So the pipeline works and the shipped strength is too weak: the ink darkens only the water body, and from this pitch the sky's reflection is most of what the sea shows. At distance 5 nothing shows, as intended. The `line` borders were not seen to stand out from the grid either.

### 2026-10-15: wind in the game, weather gauge (#264, PR #276)

- **Branch and commit:** detached `origin/main` at `894edb4`, against `81901b4` (main before #276) for the comparison.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1440×900 (1280×800 for the fight).
- **View:** `?size=small&seed=1&snapshot=1` at `cx=18.75&cz=16.9&dist=26`, and at `cx=3.6&cz=19.2&dist=3.2` (Thornwood Bay: a sloop, palms, reef foam); `?seats=1&size=small&seed=1` for the fight, staged as in the captain-death entry.
- **Findings:** waves, palms, reef foam, sails and flags look the same before and after; the only difference in the overview is #255's floating region labels, gone with #279. The combat panel shows "Weather gauge: …" under "Distance: 1 hex", both as a captain's name and as "neither, square to the wind".

### 2026-10-15: region borders and labels (#239, PR #255)

- **Branch and commit:** `feat/239-regions` at `715fc44`.
- **Renderer:** headless software (SwiftShader, ANGLE/Vulkan), 1440×900, `snapshot=1`.
- **View:** `size=small&seed=1`, `size=small&seed=4`, `size=medium&seed=7`, `size=large&seed=3`; the camera at full zoom-out (distance 28) over the map's middle, plus distances 10, 8 and 6, and a hover on a reachable sea hex. Some shots recoloured the border lines red or hid the grid at runtime, to tell the two apart; those are marked as such.
- **Findings:** borders follow the channels and open sea separates every region on all four maps; the region tooltip shows on hover. Where the water grid shows at full strength, the parchment border at 30% reads as one more grid line. Some labels run over islands and port names. Colour, opacity and label size are judgement calls for a real GPU, not this renderer.
