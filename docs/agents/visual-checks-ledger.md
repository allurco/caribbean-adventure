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

### 2026-10-15: combat animation lab (`?view=combatlab`, #259)

- **Branch and commit:** `proto/combat-anim` at 39a30f6, then re-shot after fixes up to 1fd9b23.
- **Renderer:** headless Chromium on the real GPU (ANGLE Metal, `--use-angle=metal --enable-gpu`), not SwiftShader, so the light can be judged.
- **View:** the lab's default site on a small map, default seed; Frigate vs Galleon one hex apart (and Sloop vs Galleon two apart), the lab's game-direction camera after Declare; 1440×900 and 390×844.
- **Timing:** `play=` starts its first beat 1.5 s after load, with 0.9 s between beats; shots were keyed to the beat's start read off the lab's status line, not to wall-clock time after load.
- **Learned:** for about the first 3 s after load the sea is not drawn yet (the sky environment is still baking), so the opening frame shows grey haze; wait 6 to 8 s for a fair opening shot. A fallen topmast that is hard to find was really hanging at the break's height (fixed); the sink taking the hull under in 2 s was the board's sink depth (fixed); the declare frame cutting off the near ship was the framing fitting width only (fixed).

## Screenshot provenance

When an agent reports screenshots, it states for the batch:

- **Branch and commit** the server was running (`git rev-parse --short HEAD` in its worktree).
- **Renderer:** headless software (SwiftShader), headless GPU, or a real browser.
- **View:** map size and seed (URL parameters) and roughly where the camera was.

That is enough to answer "which PR is this from?" later without guessing.
