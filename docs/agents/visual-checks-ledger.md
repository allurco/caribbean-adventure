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

## Open

Reports still being chased. Move an entry to "Investigated, not a bug" or close it with its fix once it ends.

### 2026-10-15: the black flicker pinned to the bloom (follow-up to the entry below)

- **Symptom:** the black frames on camera motion stop with `?bloom=0` on the reporter's machine, so they come from the bloom pass. The earlier "all switches at 0 still flicker" was likely a stale preview.
- **Branch and commit:** `fix/bloom-flicker` off `d4b29af` (main, after PR #296).
- **Renderer:** headless Chromium on a real GPU (ANGLE on Metal) at 1280 × 800, DPR 1 and 1.5.
- **View:** `?size=medium&seed=7&skipLogin=1`, also `?size=small&seed=1` and `?size=medium&seed=42`, with the first captain and ship picked; the camera on a scripted path (the target circling 0.08 units a frame, the distance swinging between 1 and 11) for 120 to 300 frames.
- **Measured:** a readback of the composer's input buffer (the scene before the bloom) after every frame found no NaN or Infinity and nothing over about 40, but a few negative pixels per frame, down to about −3, on silhouettes (one found on an instanced, vertex-coloured standard-material prop, with every input positive and with the lights, environment and fog each off). With `?aa=0` there were none: under MSAA a fragment on an edge is shaded at the pixel centre outside its triangle, so its varyings are extrapolated. How far they go depends on the GPU's rasteriser; a NaN or Infinity there would black out the whole frame through the bloom's blur.
- **Changed:** a pass directly before the bloom sanitizes its input (NaN to black, each channel held to `[0, 8192]`, found from the float's bits); a readback after it found no negative, NaN or Infinity, and the same highlights. A/B switches: `?bloomsan=0` (no sanitize pass), `?bloommip=0` (Kawase blur instead of the mipmap blur), `?bloomhalf=0` (full float buffers).
- **Open:** whether the sanitize pass stops the flicker on the reporter's machine, and if not, which of `bloommip=0`, `bloomhalf=0` or `aa=0` does. A fix at the source (centroid interpolation of the varyings) is left for later.

### 2026-10-15: the 3D view flickers black whenever the camera moves (a reporter's machine only)

- **Symptom:** on a reporter's machine, whole 3D frames alternate between a normal render and pure black (0, 0, 0) on any pan, zoom or turn, and stop when the camera stops. The HUD is untouched and the console is empty (no context loss, no GL or shader errors). Medium map, docked at a port, `line` region borders.
- **Branch and commit:** `a04f058` (main) against `894edb4`, branch `fix/black-flicker` (PR #292) and branch `fix/black-flicker-review` (PR #296); also the production deployment.
- **Renderer:** headless Chromium on a real GPU (ANGLE on Metal; also ANGLE on OpenGL) and headless WebKit, at 1280 × 800 (DPR 1 and 2), 1440 × 900 (DPR 2) and 1920 × 1080 (DPR 2).
- **View:** dev builds at `?size=small&seed=1` and `?size=medium` (its seed was not recorded), the production deployment at `?skipLogin=1` (a random map); the medium map docked at a port. Camera: from its default start, stepped zoom to distances 28, 20, 14, 10, 7, 5, 4, 3, 2, 1.5 and 1, ten wheel steps in and ten out, two drag pans of about 320 px and 200 px, and a scripted path of 400 frames (the target circling 0.08 units a frame, the distance swinging between 1 and 11) followed by a 60-step pointer sweep for hover.
- **Not reproduced:** a per-frame pixel readback and a NaN/Infinity scan of every uniform found no black frame and no bad uniform. The A/B switches (`?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`, and `fx=0&ink=0&bloom=0`) all draw a normal picture in motion.
- **Measured, `894edb4` → `a04f058`, medium map, 1440 × 900 at DPR 2, same camera path:** GPU memory the same (about 650 MB: textures 317, buffers 72, renderbuffers 260) and no growth over repeated camera motion or hover. Per frame, about 6 more draw calls and about 440 k more triangles: #281's idle combat layers (shot, splinters, grapples), drawn at zero size even with no fight.
- **Changed in PR #292:** idle instanced layers are not drawn and cast no shadow; the sun glint and the sea's output are held finite; the canvas DPR is capped at 1.5 (about 650 → 480 MB; frame time median 13.4 → 10.1 ms on the test GPU); switches `?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`.
- **Changed in PR #296:** the idle combat layers stay in the scene, empty, while the loading screen is up, so their shaders still compile behind it; NaN and Infinity in the sea's colour are found from the float's bits (fast-math can fold `isnan` and `isinf` away), and the glint's cap is raised to 4096 so no real sparkle is dimmed. More switches for the base scene and the GL context: `?shadows=0`, `?aa=0` (canvas and composer), `?ocean=0`, `?land=0`, `?dpr=1`, `?power=low`, `?pdb=1`, and `?gpuinfo=1`, an on-screen readout of the context, the frame and context losses.
- **Ruled out by the reporter:** the flicker survives `fx=0&ink=0&bloom=0` (and `post=0`), so the combat effects, the region ink and the post-processing are not the cause. **Superseded for the post-processing:** a later check found the flicker stops with `?bloom=0`, so the bloom is the cause after all (see "the black flicker pinned to the bloom" above; the all-switches result was likely a stale preview).
- **Open:** which of PR #296's switches, if any, stops the reporter's flicker, and what `?gpuinfo=1` shows on that machine.

## Investigated, not a bug

One entry per report. Newest first.

### 2026-10-16: the rotate gate's review follow-ups (#123, PR #312)

- **Branch and commit:** `feat/123-landscape-phones` at `83c11b5` (on main at `05fd37e`).
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), Playwright 1.59. Phone emulation: `isMobile` and `hasTouch`, DPR 2; the window and the screen set apart through the DevTools protocol's `Emulation.setDeviceMetricsOverride` (`screenWidth`, `screenHeight`), since Playwright's `setViewportSize` resets the screen to the window. `screen.orientation.lock` deleted before load, as on iOS: headless Chromium has both APIs and would go full screen on the first tap, after which the window cannot be resized (so "Turn it for me" is not in these shots). Safe areas through `Emulation.setSafeAreaInsetsOverride`, turned with the phone: left and right 47 px, bottom 21 sideways; top 47, bottom 34 upright. WebGL draw calls counted by wrapping `drawElements`/`drawArrays` and their instanced forms. No real phone or tablet.
- **View:** `?size=small&seed=1` on a dev server with no Supabase variables; captain and Sloop picked through the draft screen.
- **Findings, all as intended:** a phone at 390×844 gets the gate, with focus inside it, the app's wrapper `inert` and `aria-hidden="true"`, and "Turn your ship" whole at 38 px; at 320×568 whole at 32 px. A split-view tablet (window 375×1024, screen 1024×1366, touch) gets no gate. The board's draw calls: about 65 000 in 1.5 s sideways, 0 under the gate, drawing again at once on turning back, the same canvas element. Enter under the gate: a route picked in landscape (a coarse-pointer device with a 390×844 screen and a 1440×900 window, the window then set to 700×1000 for portrait), Enter pressed twice under the gate, turned back: the route hint still shows and all four moves are left; Enter in landscape then sails it (two moves used). Desktop at 1440×900: no gate, End Turn's right edge at 1420 (20 px in, as before).
- **False alarm, noted for next time:** with the sideways insets (47 px left and right) left on after turning the phone upright, the gate's padding grows to 47 px and the nameboard's title is cut short. A real phone's insets turn with it; set them per orientation.

### 2026-10-16: phones in landscape, the rotate gate and the safe areas (#123)

- **Branch and commit:** `feat/123-landscape-phones` at `89f7547` (on main at `05fd37e`); main at `a93aa4e` for the desktop comparison.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), Playwright 1.59. Phone emulation: `isMobile` and `hasTouch`, DPR 2, so `(pointer: coarse)` matches; a desktop context without them for the narrow window. Safe areas through the DevTools protocol's `Emulation.setSafeAreaInsetsOverride` (left and right 47 px, bottom 21 px, as an iPhone held sideways). No real iPhone or Android phone.
- **View:** `?size=small&seed=1` on a dev server with no Supabase variables (the game, with boardgame.io's debug panel), and the bare root URL on a dev server with dummy Supabase variables (the shell's sign-in screen). Captain and ship picked through the draft screen in landscape, then the viewport turned to 390×844 and back.
- **Findings, all as intended:** at 390×844 the gate covers the game and the shell: `elementFromPoint` at the corners, the centre and the debug panel's tab all land on the gate; the app's wrapper is `inert`. Turned back to 844×390 the gate goes, the canvas is the same element and the page's text matches what it was before turning (draft done, the same captain on the HUD). The phone glyph animates, and has no animation with reduced motion emulated. "Turn it for me" shows in headless Chromium, which has both APIs (not tapped: the lock needs a real phone). With the insets the captain card's left edge moves from 16 to 63 px, the glory panel from 20 to 67, End Turn's right edge from 824 to 777; at 1440×900 without touch, no gate, and the glory panel, the card and End Turn sit at the same pixels as on main. A 390×844 desktop window shows no gate. The manifest is served as `application/manifest+json` by the dev server and `vite preview`.
- **For the maintainer:** at 844×390 and 667×375 the open port panel covers End Turn and the turn bar's purse (#311, not this PR).

### 2026-10-15: the hotseat save (#300, PRs #304 and #305)

- **Branch and commit:** `fix/304-review-followups` at `e115dc2` (on main at `475cb37`, after #304 merged).
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), Playwright 1.59, 1440×900 and 844×390 (phone landscape), dev server with no Supabase variables (the hotseat game), one persistent browser profile so localStorage lives across reloads.
- **View:** the root URL with random maps (a pinned seed or size never saves), then `?players=2`, `?players=3`, `?seed=42`, `?size=medium`, `?size=small&seed=7`, `?snapshot=1`, `?seed=42&players=2`. Draft through the draft screen; sailing through the board's `moves.moveShip` (read from the React tree), market buys and End Turn through the HUD. Corrupt saves made by rewriting the localStorage value.
- **Findings, all as intended:** first visit goes straight to the draft. The save appears after the first action: solo small map about 2.8 KB, two seats on a large map about 3.3 KB, no cell patches. Reload shows the start screen ("Turn 3 · Solo", captains, "Small map · Saved just now"); Continue gives back the same ship hex, turn, moves used, purse and cargo, mid-turn and docked at a port (port panel open). New game asks first; Keep my voyage leaves the save untouched. Save & leave sits right of the sound control at both sizes, overlapping nothing (3 px below the top bar's glory box at 844×390), and returns to the start screen. `?players=2` saves and continues; `?players=3`, or `?players=2` against a solo save, shows the mismatch notice and New game confirms. Pinned URLs and `?snapshot=1` neither show the start screen nor change the save. Garbage and non-save JSON read "could not be read"; version 1 or 3 reads "another version"; a wrong fingerprint or seed fails on Continue, is set aside under `caribbean.hotseatSave.setAside` and shows the "set aside" notice; a save that throws while the board renders does the same. At game over (staged: score 10 in the save, then one sail) Save & leave is gone and the save is removed.
- **Bug found:** a save of the right version whose `state.G` has no `ships` passes `parseHotseatSave`, and `describeHotseatSave` then throws on the start screen ("Cannot read properties of undefined (reading '0')"), outside any error boundary: a blank page on every load until site data is cleared. Hand-made corruption, but the start screen is the one place with no fallback.
- **For the maintainer:** a bare Continue rewrites `savedAt` at once (the restored state is reported and autosaved), so "Saved … ago" tells when the voyage was last opened, not last played. Overwrite and set sail clears the old save before the new game's first action. At 844×390 the start card fills the height with a few pixels to spare, and the open port panel covers End Turn (not from this PR). A burst of `THREE.GLTFLoader: Couldn't load texture blob:` errors came once after navigating away mid-load; not seen on fresh loads.

### 2026-10-15: two browsers play an online match (#113, PR #297)

- **Branch and commit:** `feat/113-async-turns`, the commit that adds `e2e/`.
- **Renderer:** Playwright 1.59's headless Chromium (software WebGL), 1280×800; one browser per captain, because two boards in one headless browser stalled the second page's clicks.
- **View:** `npm run test:e2e` against the e2e dev server (`e2e/e2eBackend.ts`: the real `/api` router over the in-memory store, test tokens, no Docker).
- **Findings:** a room opened, joined by its invite link, started; both seats board; each drafts on its own board in turn, the other showing "Awaiting Orders"; the seat to play presses End Turn and the other seat's End Turn appears within a poll. Passed twice, about four minutes a run, most of it waiting on the software-rendered boards. No screenshots taken; nothing visual was judged.

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

### 2026-10-15: the harbour backdrop, review fixes (#122, PR #310)

- **Branch and commit:** `feat/122-harbour-backdrop` at `a4f6eca`, against `093663c` (the PR's head before the fixes) for the comparisons.
- **Renderer:** headless Chromium on the real GPU (ANGLE Metal), Playwright 1.59, DPR 1, no reduced motion.
- **View:** the e2e dev server (`E2E_BACKEND=1`), signed out at the root, everything but the backdrop hidden. The still shot in phase `mounting` (the scene invisible); the scene's settled frame shot with its layer forced to full opacity and every `requestAnimationFrame` dropped from the moment `harbour:fading` is marked, so the canvas holds the frame the fade starts from; and the same two seconds into the fade.
- **Motion held until the fade:** at 1440×900, still against settled frame, mean absolute difference 3.09 at `093663c` and 2.78 now. The difference map at `093663c` lights up the reef surf patches and the shoreline foam (the surf clock had run through the mounting frames); now they are gone: share of pixels off by more than 16 in the two surf areas 1.6 % and 4.7 % before, 0 % and 0.8 % now. The palms are a few pixels at this zoom and their sway does not show in either map; the pure tests cover them. Two seconds into the fade the surf areas differ by 5.6 and 14.2 from the settled frame, so the motion starts with the fade.
- **Alignment:** still against settled frame, 2.78 / 0.27 % of pixels off by more than 32 at 1440×900, 3.14 / 0.67 % at 2560×1080, 5.43 / 2.06 % at 844×390: in the range of the first check.
- **Brightness:** mean luminance (another hiding of the boards than the first check, so other absolute values) 60.1 through `still` and `mounting`, 60.1 to 59.8 through `fading`, 59.6 to 59.3 once `live`: no blank or dark frame.
- **Leaving the harbour:** `?view=match&id=…` signed out (the `SignInGate`), harbour `live`, then signed in from a second tab (supabase-js shares the session): the board replaces the harbour and three logs "Context Lost" from R3F's forced loss. At `093663c` it also logged "[harbour] the live scene cannot run"; now nothing.
- **Still:** `npm run capture:harbour` re-run after the fixes wrote byte-identical files (the held surf and sway stand where reduced motion already held them), so it was not re-captured.
- **Not checked:** that the harbour's world is collected after unmount (the unit test covers the release, not the heap).

### 2026-10-15: the harbour backdrop, still then live scene (#122)

- **Branch and commit:** `feat/122-harbour-backdrop` off `bfdbd27` (main), before its first commit; the "before" timings on `bfdbd27` itself.
- **Renderer:** headless Chromium on the real GPU (ANGLE Metal), Playwright 1.59, DPR 1.
- **Still:** `npm run capture:harbour` (`?view=harbour`, 2400 × 1000, reduced motion); two runs gave byte-identical files.
- **Alignment:** the e2e dev server (`E2E_BACKEND=1`), signed out, reduced motion, everything but the backdrop hidden. A screenshot in phase `mounting` (the still, the scene mounted but invisible) against one in phase `live` (the frozen scene, the still gone) at 1440×900, 1920×1080, 2560×1080, 3440×1440, 1024×768, 844×390 and 667×375: the mean absolute difference is 2.8 to 5.8 of 255, with 0.3 to 2.3 % of pixels off by more than 32, from resampling and WebP compression. No offset. With the shell's boards left in, the difference was larger only because the web fonts load between the two shots.
- **Fade:** without reduced motion at 1440×900, the mean luminance stays between 72.0 and 73.1 in screenshots taken through `mounting`, `fading` and `live`, so there is no blank or dark frame.
- **Frame rate:** frames drawn to the screen were counted by wrapping `clear` with no framebuffer bound: 30.0 a second once live, and 0 under reduced motion.
- **No remount:** signed in as an e2e captain, Lobby, Party, Ranked, Profile and back to Play by the nav board. The same canvas element stays connected, `harbour:mounting` is marked once, and the page never navigates.
- **Timings:** production builds (`vite build` with a dummy Supabase URL, `vite preview`, signed out), 1440×900, five cold runs each, medians. Before: first contentful paint 768 ms (the dark gradient), sign-in input at 763 ms, no live scene. After: first contentful paint 504 ms (the harbour still, first rendered frame), sign-in input at 807 ms, live scene mounting at about 760 ms and fading in (settled) at about 2.2 s. Building the world after the shell is interactive was one 880 ms task at first; split into per-map builds with the page let in between, the longest task is now about 200 to 250 ms.
- **Not checked:** a real phone, Safari (no idle callback, so the timer fallback), and a GPU with no WebGL (the still should stay; the code path is the error boundary and `webglcontextlost`).

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

### 2026-10-16: delete your account (#108, PR #314 review fixes)

- **Branch and commit:** `feat/108-delete-account` at `f11cac3` (the review fixes, before the merge of main, which touched no UI).
- **Renderer:** headless Chromium (Playwright 1.59), 1280×800 and 844×390, one browser context per captain. The harbour backdrop behind the shell is WebGL: on a loaded machine a page screenshot there can stall past 30 s. Close each context before opening the next, and give screenshots a long timeout.
- **View:** the e2e dev server (`e2e/vite.e2e.config.ts` with `E2E_BACKEND=1` and `VITE_SUPABASE_URL` pointing at its `/e2e-supabase`; without them the root opens the local game), signed in by a stored session for the e2e captains. Steps at each size: `?view=account`, Delete account, type `delete` (lower case), screenshot; then Calico Jack's public profile as Anne. At 844×390, Anne then deletes for real; then her public profile, signed out, at both sizes.
- **Findings:** the confirm button is disabled until something is typed and enabled after `delete`. The confirmation sheet fits at both sizes, with no page scroll. Another captain's profile shows no delete button (0 at both sizes). After the deletion the stored session is gone and the shell shows the sign-in screen. Anne's public profile reads "DP", "Deleted player" and "This captain's account was deleted.", with no delete button and no page scroll. No page errors.
- **Not checked:** `npm run test:e2e` (it fails on main at "Board your ship", being looked into separately; the e2e backend is unchanged here).

### 2026-10-15: the harbour link against the hint band and the port panel (#125, PR #308 second review)

- **Branch and commit:** `fix/125-harbour-link-phone` at `4038e26`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 844×390 and 667×375 (phones held sideways: `isMobile`, touch, DPR 2) and 1440×900.
- **View:** the e2e dev server (`E2E_BACKEND=1`), signed in as a test captain, `?skipLogin=1` (a fresh voyage, random medium map each size), the debug panel hidden (`.`). Steps: the first captain and the Sloop, docked with the port panel open; the hold filled at the market (cargo 2/2); a route selected by clicking open water (the route hint showing); Enter to sail it, undocked with the port panel closed. At each step the bounding rects of the link, Save & leave, the route hint and the port panel, `elementFromPoint` at three points of the link, and Save & leave's scroll size against its box.
- **Findings:** no overlaps, the link on top at every step, Save & leave never overflows its 112×32 box (208–320 × 48–80), no page errors. 844: the link 328–440 × 48–96 on Save & leave's row, docked and undocked (the port panel from x 540); the route hint 261–583 × 144–174, below the link. 667 docked: the link 236–348 × 88–136 under Save & leave (the port panel from x 363); the route hint 173–494 × 144–174, 8 px below it. 667 undocked: the link back on the row, 328–440 × 48–96. Desktop: the link 102×28 at 1322,70 and the route hint 559–881 × 80–110, both unchanged.
- **Not checked:** the attack and spyglass prompts (no target in reach) and the mission toast (no mission completed); they take the same top as the route hint (`hudHintTop`, `hudToastTop`). Combat and game over, as in the entry below. The top-right fallback under 660 px with the port panel open (a narrowed desktop window): `accountLinkPlacement.test.ts` only.
- **For the maintainer:** on phones the port panel already covered the right part of the centred hint at its old top (it runs from y 20 to 355), and still does. The hint's foot (y 174) is now a few pixels above the loaded card's top at 667×375 (about y 178), so a card that grows further would run under it. A click on the ship opens Sloop Details, which the link covers at both phone sizes, as before this PR.

### 2026-10-15: the harbour link on Save & leave's row (#125, PR #308 review)

- **Branch and commit:** `fix/125-harbour-link-phone` at `5acf503`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 844×390 and 667×375 (phones held sideways: `isMobile`, touch, DPR 2) and 1440×900.
- **View:** the e2e dev server (`E2E_BACKEND=1`), signed in as a test captain, `?skipLogin=1` (the local game, saved), a fresh voyage each size, the debug panel hidden (`.`). Steps: "Choose Your Captain"; the first captain and the Sloop, docked at the home port with the port panel open; then the card loaded: goods bought until the hold was full and the affordable upgrades bought at the Shipwright. At each step `elementFromPoint` at three points of the link, and its box checked for overlap against the draft title's text, the turn bar's map label, centre group and End Turn, the sound control, Save & leave, the glory panel, the captain/ship card and the port panel.
- **Findings:** no overlaps and the link on top at every step and size; no page errors. Compact, draft: 112×48 at 716,16 (844) and 539,16 (667). Board at 844: 328–440 × 48–96, on Save & leave's row (208–320 × 48–80), the turn bar's centre group ending at y 48, the port panel from x 540, the glory panel 20–228 × 96–149, the loaded card from y 192. Board at 667: the row would meet the port panel (from x 363), so 236–348 × 88–136, under Save & leave and right of the glory panel; the loaded card (cargo and two upgrades) from y 151. Desktop: 102×28 at 1322,70, unchanged.
- **Not checked:** combat and the game-over screen (no cheap way to reach either in the local game); both take the HUD stack down (`hudStack.test.ts`), so the link goes to the top-right corner, checked earlier against the combat panel's classes. A card with damage and bounties as well was not reached.
- **For the maintainer:** at 667×375 the HUD is crowded whatever the link does: the loaded card's top (y 151) already meets the glory panel's foot (y 149), so a card with damage or bounty rows would cover the glory panel and then reach the link (15 px clear); the port panel covers the card's right part and End Turn there.

### 2026-10-15: the harbour link's phone placement (#125, PR #306)

- **Branch and commit:** `feat/125-online-shell` at `093e771`, the same change as `1742e63` on `fix/125-harbour-link-phone` (cherry-picked once PR #306 had merged).
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 844×390 and 667×375 (phones held sideways: `isMobile`, touch, DPR 2) and 1440×900.
- **View:** the e2e dev server (`E2E_BACKEND=1`), signed in as a test captain, a fresh voyage each size. Steps: Play, Sail alone, wait out the loading screen, the debug panel hidden (`.`); "Choose Your Captain"; the first captain; "Choose Your Ship"; the Sloop, docked at its home port with the port panel open; "The harbour" back to Play. At each step `elementFromPoint` at three points of the link, and its box checked for overlap against the draft's title text, Player line, captain line and cards, or the top bar's items, End Turn, the sound control, Save & leave, the glory panel, the captain/ship card, the port panel and its tabs.
- **Findings:** no overlaps and the link on top at every step and size. Compact: 102×48 at 726,16 (844) and 549,16 (667) in the draft (top right, right 16); at 236,87 on the board, between Save & leave (208–315 × 48–79), the glory panel (20–228 × 96–149), the captain card (from y 214 at 390 tall, 199 at 375) and the port panel (from x 540 at 844, 363 at 667). Desktop: 102×28 at top 70, right 16, unchanged. The link returns to Play from the board at every size. No page errors. In dev, boardgame.io's debug toggle overlaps the link's lower-right corner in the compact draft (dev builds only; ignored).
- **Not checked:** combat (no cheap way to reach a fight in the local game). With the turn bar down the link takes the top-right corner, which by its classes is clear of the combat panel (`w-96` centred, `top-4`: x 141–525 at 667, 230–614 at 844).
- **For the maintainer:** the port panel still covers End Turn (and at 667 the move pips) on phones, separate from this PR. "Choose Your Ship" is taller than a phone: its title starts above the top edge (y −25 at 844×390, −31 at 667×375).

### 2026-10-15: the harbour link over the local game, re-check (#125, PR #306)

- **Branch and commit:** `feat/125-online-shell` at `88b046b`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1440×900 and 844×390 (a phone held sideways: `isMobile`, touch, DPR 2).
- **View:** the e2e dev server (`e2e/vite.e2e.config.ts` with `E2E_BACKEND=1`, in-memory backend), signed in as a test captain. Steps at each size: Play, Sail alone, the loading screen polled every 250 ms, "Choose Your Captain", the debug panel hidden (`.`), a hit test (`elementFromPoint` at the link's centre); the first captain and the Sloop picked, the ship docked at its home port with the port panel open; "The harbour" clicked back to Play; then Sail alone again (New game, overwrite the saved voyage) and the link clicked from the draft itself.
- **Findings:** while the loading screen is up the hit test lands on the loading screen, not the link; in the draft it lands on the link, and a click from the draft returns to Play at both sizes. Desktop placement unchanged: 102×28 at top 70, right 16. At 844×390 the link is 102×48 at top 70, 312 px from the right edge, clear of the port panel (its header included) and of End Turn. No page errors.
- **Not checked:** the game-over screen (no cheap way to reach one in the local game); the layer order against it is pinned by `accountLinkLayer.node.test.ts`.
- **For the maintainer:** at 844×390 the link now sits mid-screen at the top and covers the middle of the draft's "Choose Your Captain" title and its "Player 1" line. Separately (not from this PR), the port panel's top edge covers the lower part of End Turn at that size.

### 2026-10-15: the online shell in the Harbour launcher style (#125, PR #306)

- **Branch and commit:** `feat/125-online-shell` at `0b13760`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal) for the shell, the match board and the local game. The shell itself has no 3D yet (#122 paints the harbour), so its pages are plain HTML over a gradient.
- **View:** the e2e dev server (`e2e/vite.e2e.config.ts` with `E2E_BACKEND=1`: the real `/api` over the in-memory store, the test captains' tokens). Viewports 1280×720, 1280×580, 1440×900, 1920×1080, and 844×390 as a phone held sideways (`isMobile`, touch, DPR 2). Screens: sign-in signed out; Play with no voyage, with a voyage waiting on the player and with a room in its lobby, and with "Your voyage is saved" after Leave to harbour; the Lobby, Party and Ranked "coming" sheets; the own profile with a rename; a public profile signed out; the new-room form, the room lobby and an invite link opened by the second captain; the match board (its draft); Sail alone and back by the corner link. The rename went through a request intercept: the e2e backend answers a profile PATCH with the fixed row, so it would show the old name.
- **Findings:** no overlap between the nav board, nameboard, sheet, party dock and seal at any size, and no page scroll (the sheet scrolls in itself). 1280×720 and 1280×580 get the desktop layout; the party dock shows at 720 and is left off at 580. 844×390 gets the compact layout; the side nav's items are 72×48 and the seal 48×48. A rename shows on the nav board at once. `/?fbclid=1` opens the shell, `/?seed=5` the local game. Back and Forward move between shell pages with no reload, the lit nav item following. No page errors.
- **For the maintainer:** in the local game the corner link "The harbour" (z-40) sits under the captain draft's overlay, so it cannot be clicked until a captain and ship are picked (the match board's "Leave to harbour" is z-60 and stays on top). The link is 102×28 on a phone held sideways, and there it covers the top edge of the port panel. Controls inside the sheets are under 48 px tall on a phone (inputs and selects about 42, buttons 33 to 39, "Your public profile" 21); the 48 px rule in #125 names only the side nav. In dev, boardgame.io's debug panel covers the corner link and End Turn (dev builds only). A first shot of a page can catch the fallback serif before the shell's fonts load.
- **Against prototype D** (the screenshots on `prototype/online-shell`): the frame matches, desktop and compact (nav board, hanging nameboard, sheet, party dock, side nav, seal at the top right). Different: deep water behind the boards instead of the island (#122); the sign-in card without Discord and Google (#106); the nav board's footer without a rank line; the Play sheet's voyage without the time-left seal, five ways in (Sail alone added) with "coming" in place of counts, and the other voyages above them; the party board and seal cluster a placeholder with only the player's seal (#119); the room a list and selects, not D's berths and segmented "Articles of the voyage", under "The room" with no line; Lobby, Party and Ranked "coming" sheets for D's screens.

### 2026-10-15: Leave to harbour and Your voyages (#301, PR #303)

- **Branch and commit:** `feat/online-voyages` at `2079043` (PR #303's review fixes, before it merged), with the short-screen fix to `LeaveToHarbour` (below) uncommitted for the second run. Both moved, unchanged in the app, to `fix/303-review-followups` on `475cb37` (main), with the commit that adds this entry.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), one browser per captain; 1440×900 (desktop), 844×390 (phone held sideways) and 390×844 (phone upright, harbour only).
- **View:** the e2e dev server (`e2e/vite.e2e.config.ts` with `E2E_BACKEND=1`: the real `/api` router over the in-memory store, test tokens, no Docker), signed in as the two e2e captains. Anne opens a room for two (small map, random seed), Jack joins by the invite link, she starts it, both board; each drafts its first captain and a Sloop; the seat to play ends its turn. Shots on the board at the draft and in the main phase (docked at the home port, so the port panel is open), then each seat presses Leave to harbour: the seat whose turn it is comes back with Take your turn, the other with Open on its list. The store keeps rooms between runs, so the second run's harbour lists earlier matches too. Overlap measured from the DOM: every visible button, link, heading and text box meeting the Leave to harbour block.
- **Findings:** at 1440×900 the block (link and "Voyage saved" note) sits under End Turn on the right and meets nothing. At 844×390 the port panel, centred on the right, rises to the top bar, and the block covered its Shipwright and Tavern tabs; fixed by keeping the link compact on screens under 500 px tall and leaving the note to screen readers there (it still describes the link). Re-measured: nothing meets it in the main phase; at the draft only the heading's full-width box does, not its text. The harbour shows the saved notice, the lead block (It is your turn, the captains' names, "2 captains, small map.", wax Take your turn) over a double rule, then "Your other voyages" or "Your voyages" with Open, then the new-room form: the prototype's DHome order (`prototype/online-shell`, `variantD/screens/DHome.tsx`), without its seal of hours left, round, glory and the four ways-in tiles, which the backend lacks (#301). The sheet is the online shell's narrower column, not DHome's wide panel. Both ways back land on the board: Take your turn with End Turn showing, Open with End Turn hidden.
- **For the maintainer (not from this PR):** at 844×390 the board's own HUD is crowded: End Turn is cut by the right edge of the top bar, and the port panel runs up over the top bar.

### 2026-10-15: kerbs along a lane in the shore band (#261)

- **Branch and commit:** `fix/261-town-kerbs`, uncommitted work on `a04f058` (main) that landed as `b359ecf` (PR #295), against `a04f058` unchanged (the fix stashed) for the before shots. A follow-up commit on the same PR then capped how far a stone is stretched to fill its run; it was not re-shot.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1280×800, `snapshot=1`, 5 s after the loading screen went.
- **View:** `?size=small&seed=1&cx=15.64&cz=24.80` at `dist=1.2` and `dist=2.5`: the back lane of the port on plateau 4 where the kerb test failed, the stretch where the lane runs along the shore band. The captain (and so the ship's port in the HUD) is random per load; the camera is pinned, so the view is the same.
- **Findings:** before, the lane's seaward kerb stops short where the street's floor dips into the shore band though its edge stands above it, leaving a gap along the bank; after, the kerb runs on along that edge and ends where the edge goes down onto the beach. The rest of the frame differs only where stones moved (each run is now filled end to end). At `dist=2.5` the kerbs are too small to judge.

### 2026-10-15: NPCs sail once after a fight (#288, PR #293)

- **Branch and commit:** `fix/288-npc-after-fight` at `b717174`.
- **Renderer:** headless Chromium on the GPU (ANGLE Metal), 1280×800, debug panel hidden (`.`).
- **View:** two seats, `?players=2&size=small&seed=1&skipLogin=1&cx=6&cz=19.9&dist=9` (over Thornwood Bay); solo, `?size=small&seed=1&skipLogin=1&cx=8.5&cz=20&dist=11` (over Marisma Bay). The fight camera reframes the two ships once the fight starts; in some runs the view was zoomed out with the mouse wheel to keep the other NPCs in frame.
- **How the fights were set up:** captains and ships drafted through the draft screen. No NPC had spawned yet, so the match state was rewritten in the client's store (an `UPDATE` with a new `G`): a Flute merchant with no cannons beside the player's ship as the prey (hull 1 to sink it, crew 1 to board it, hull 4 for a fight over several rounds), and two or three more merchants nearby, bound for far ports, to watch. The rest went through the UI: Attack!, a click on the red hex, then the combat panel's buttons, and End Turn.
- **Findings:**
  - Two seats, prey sunk: nothing moves while the fight's rounds play. On Apply Damage the turn ends (turn 4 to 5), every other NPC sails once (two hexes, a Flute's moves) with wakes, and the sunk merchant only goes down where she lay. She does not reappear.
  - Solo, prey boarded: the fight resolves on Board (turn 3 to 4). The prize closes alongside while the grapples fly (#263's effect) and then is gone. The others sail once and the camera flies back to the ship.
  - Solo, a fight over five rounds that ends in the merchant's escape (pursuit check and parting shot): no NPC moved in any round. Afterwards each sailed once, the escaped merchant too. A merchant that reached its home port in that step was simply gone during the hand-off, as the PR describes.
  - A turn with no fight, two seats and solo: the NPCs sail during the hand-off as before, then the camera flies to the next captain.
  - No page errors.
- **For the maintainer (not from this PR):** after a two-seat fight the camera stays on the fight and does not fly to the next captain's ship, though the HUD and "Your turn" switch to them. It comes from `announceTurn`'s `combatDirector.holding()` (#263); this PR doesn't touch it.

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
