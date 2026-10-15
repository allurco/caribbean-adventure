# Visual Checks Ledger

What agents (and people) have learned from checking the game in a browser: reports that turned out not to be bugs, the limits of headless screenshots, and where each batch of screenshots came from. Read it before chasing something that "looks wrong" in a screenshot; add to it when an investigation ends.

The repo is public: no local paths, names or private notes here. Refer to branches, commits, PRs and issues.

## Headless capture limits

Headless Chromium usually has no GPU, so WebGL runs on a software renderer (SwiftShader). That is good enough for layout, HUD and geometry checks, and not good enough to judge light.

- **Don't judge lighting, glow or bloom from a software-rendered screenshot.** A bright or invalid pixel can come out differently there, and bloom smears it into a disc. Confirm any lighting finding in a browser on a real GPU before filing or fixing it.
- Say which renderer a screenshot used when reporting it (see Screenshot provenance below).

## Investigated, not a bug

One entry per report. Newest first.

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

## Screenshot provenance

When an agent reports screenshots, it states for the batch:

- **Branch and commit** the server was running (`git rev-parse --short HEAD` in its worktree).
- **Renderer:** headless software (SwiftShader), headless GPU, or a real browser.
- **View:** map size and seed (URL parameters) and roughly where the camera was.

That is enough to answer "which PR is this from?" later without guessing.
