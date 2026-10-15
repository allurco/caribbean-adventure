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

### 2026-10-15: white sea with only hex lines in headless screenshots

- **Symptom:** the sea drawn flat white (the horizon haze colour) with only the hex outlines, ships and land on it, in headless screenshots, including `snapshot=1` gallery shots. Earlier written off as a software-rendering artifact.
- **Cause:** timing, in our code, not a renderer limit. The ocean mounts only once the sky environment is baked (`useSkyEnvironment`): its irradiance is read back from the GPU asynchronously, then the ocean's shaders compile on its first draw. Until then the scene background (the haze) shows where the sea will be. Timed on main, small map seed 1: on SwiftShader the board mounted at 9.5 s, the sky readback resolved at 18.9 s and the ocean drew its first frame at 26.1 s; on the headless GPU the same steps took 2.3 s, 2.5 s and 2.8 s, so even a real browser showed a white sea for about half a second. The gallery shot was taken 4 s after the board mounted, long before the sea on SwiftShader. Float and half-float targets are supported on both renderers, and there were no WebGL errors.
- **Fixed:** the board now stays behind a loading screen until every asset, the world, the sky, the shaders and a few frames are ready (`sceneReadiness.ts`, `useSceneReadiness.ts`), and `snapshot=1` waits on the same gate. With it the sea is drawn in the first frame shown on both renderers.

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
