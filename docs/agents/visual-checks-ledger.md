# Visual Checks Ledger

What agents (and people) have learned from checking the game in a browser: reports that turned out not to be bugs, the limits of headless screenshots, and where each batch of screenshots came from. Read it before chasing something that "looks wrong" in a screenshot; add to it when an investigation ends.

The repo is public: no local paths, names or private notes here. Refer to branches, commits, PRs and issues.

## Headless capture limits

Headless Chromium usually has no GPU, so WebGL runs on a software renderer (SwiftShader). That is good enough for layout, HUD and geometry checks, and not good enough to judge light.

- **Don't judge lighting, glow or bloom from a software-rendered screenshot.** A bright or invalid pixel can come out differently there, and bloom smears it into a disc. Confirm any lighting finding in a browser on a real GPU before filing or fixing it.
- Say which renderer a screenshot used when reporting it (see Screenshot provenance below).

## Investigated, not a bug

One entry per report. Newest first.

### 2026-10-14: white glare blob beside the player's ship

- **Symptom:** a large blown-out white disc on the water right beside the active ship, in close-up headless screenshots taken while checking #231, #232 and #233.
- **Ruled out:** each PR was merged to main one at a time and checked on a real GPU (with the reach showing for #213's overlay): no blob. None of the three touches lights, materials or post-processing. The sun glint (#38), the golden-hour light (#169) and the reach overlay (#215, #220) were suspected and ruled out the same way.
- **Conclusion:** an artifact of the headless software-rendered capture, not of the game. No change made.

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
