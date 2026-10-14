---
status: accepted
---

# One sea surface: the wave spectrum and its clock, drawn on the GPU and sampled on the CPU

The water's waves are an FFT simulation on the GPU (#38): three cascades evaluate one JONSWAP spectrum from seeded initial amplitudes and a looping wave clock, and the swell and chop cascades displace the water's geometry. Nothing on the CPU knew where the surface was, so ships sat at a fixed ride height on a heaving sea. Ships must heave, pitch and roll with the water drawn around them (#130), which needs the surface height under each hull on the CPU, in step with the GPU and without stalling it. We decided that **the sea's source of truth is the spectrum and the wave clock**, not the GPU's textures: the GPU evaluates them to draw the water, the CPU evaluates the same swell band to place what floats on it, and a test pins the two together.

## Decision

- The wave amplitudes (`initialSpectrum`, fixed seeds), the dispersion and the wave clock are the sea's definition. Both sides evaluate the same sum with the same time in a frame; the clock is one shared clock that advances once per frame before either reads it, and freezes under reduced motion.
- **Each client keeps its own wave clock**, advanced from its frame deltas; clients are not synchronised. Everything reads the time through one function, `waveTimeAt()`, so deriving the clock from a time every client shares later is a change in one place.
- The CPU evaluates the swell band only. A band ends at half its grid's Nyquist (`BAND_NYQUIST_SHARE`), so the swell band fits exactly on a grid of half the cascade's size: a 128² inverse FFT reproduces the GPU's 256² swell height at every shared lattice point. It is a pure module (`seaSurface.ts`, `createSeaSurface(...).heightAt`), sampled bilinearly in world space through the cascade's tile rotation and repeat, and damped by `shallowDisplacementDamping` and `waveDetailFade` as the water's displacement is. It reads the full-resolution heights with no horizontal (choppy) shift, where the vertex stage reads a coarser mip level and moves each vertex sideways, so the two differ by a few centimetres.
- The chop and ripple bands stay GPU-only. Under a hull the chop carries a few percent of the motion and the ripple none.
- Where the GPU cannot run the cascades and draws a flat sea, the CPU sea is flat too.
- Anything that rides the sea takes a pose that is a pure function of the sea, its hull footprint and its drawn world position, with no state carried between frames, so it is the same wherever and whenever it is drawn.
- The pose averages the sea over the hull's footprint, so a longer hull averages out more of the swell and heaves and pitches less on the same sea. ADR 0006's diorama-scale ships (×2.3) are long against the swell's shorter waves, and the Galleon rides steadier than the Sloop; the wave pose tests pin both the long-wave and short-wave behaviour with the scaled hull boxes.

## Considered options

- **Read the GPU's displacement back.** Rejected: a synchronous read stalls the pipeline; an asynchronous one lags one to three frames while a moving ship crosses a hex in 0.4 s; float read-back support varies; untestable.
- **Evaluate the spectrum's dominant modes on the CPU** (#38 step 11 as first written). Rejected: the directional spectrum spreads the swell over ~12,800 modes; the 256 strongest keep about 37% of a hull's motion, so the ship visibly disagrees with the water.
- **Replace the swell with a few analytic (Gerstner) waves shared by GLSL and TypeScript.** Rejected: it brings back the periodic swell the 1468 m tile was sized to avoid, and the slopes, whitecaps and filtering built on the swell cascade would all need analytic replacements.
- **Run the swell FFT on the CPU and upload it.** Rejected: the GPU still needs the swell's slopes and whitecaps from its own cascade, so it is two evaluators anyway, plus a per-frame upload.
- **Pose ships in their vertex shaders from the displacement textures.** Rejected: every ship material and its shadow material would need the patch, hit-testing would see the rest pose, the CPU would not know the pose, and the logic would live in untested GLSL.
- **One wave clock shared by every client**, derived from the match's start time on the server plus wall-clock time, wrapped by `WAVE_LOOP_SECONDS`, so every player sees the same sea and the same ship motion. Deferred: reduced motion could no longer freeze the shared clock and would need a per-client freeze on top, a tab back from the background would jump to the current phase instead of resuming, and it needs a shared time source that only exists once online play does (#104, #97). Behind `waveTimeAt()` it remains a one-place change, and its own issue if it is wanted.

## Consequences

- A test keeps the CPU swell field equal to the CPU mirror of the GPU pipeline; changing a cascade's tile, seed, band or the band's Nyquist share either keeps the half-grid contract or fails it.
- The CPU pays one 128² inverse FFT per key time of the wave clock (interpolated between key times), and nothing while the clock is frozen.
- Ships ride the swell only; they do not answer the chop, and they carry no inertia.
- Clients do not share a wave phase: two players see different swell under the same ship. The sea is visual only and not part of `G`, so nothing in the game depends on it.
