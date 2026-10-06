# Unified Terrain System - Technical Documentation

## Overview

The terrain system renders islands and seafloor using GPU shaders with a heightmap texture.

```
┌─────────────────────────────────────────────────────────────┐
│  1. TerrainHeightmap.ts                                     │
│     CPU-side: Generates a texture from hex cell data        │
│     Uses SDF (Signed Distance Field) for clean boundaries   │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    DataTexture (1024x1024)
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌───────────────────────┐           ┌───────────────────────┐
│  2. UnifiedTerrain    │           │  3. Ocean.tsx         │
│     Vertex shader:    │           │     Fragment shader   │
│     - Squash water    │           │     reads heightmap   │
│       vertices        │           │     for depth & foam  │
│     - Displace land Y │           │                       │
│     Fragment shader:  │           │                       │
│     - Noisy biome     │           │                       │
│       transitions     │           │                       │
└───────────────────────┘           └───────────────────────┘
```

---

## Key Design Decisions

### 1. SDF-Based Land Mask (Not IDW)

**Problem with IDW (Inverse Distance Weighting):**
IDW never reaches zero - it creates infinite "ghosting" tails causing scattered land patches in water.

**Solution: Signed Distance Field**
- For each pixel, find the **single closest** hex center
- Use a **hard cutoff** for the land mask
- Use **smooth falloff** only for height (creates domed islands)

```typescript
const dist = distance(pixelPos, closestHexCenter);
const hexRadius = 1.0;

// Hard cutoff for mask (prevents ghost islands)
const isLand = closestHex.terrain === "island" && dist < hexRadius * 1.1;

// Smooth falloff for height (makes island domed, not flat-topped)
const shapeMask = smoothstep(hexRadius * 1.1, hexRadius * 0.5, dist);
finalHeight = baseElevation * shapeMask;
```

### 2. Vertex Squashing (Not Fragment Discard)

**Problem with `discard`:**
- Disables Early-Z testing on GPU
- Forces fragment shader to run for ALL pixels, even water
- 70% of GPU work thrown away

**Solution: Degenerate Vertices**
```glsl
// In vertex shader - squash water vertices to nothing
if (texture2D(heightmap, uv).a < 0.5) {
    gl_Position = vec4(0.0, 0.0, 0.0, 0.0); // Degenerate
    return;
}
```
The rasterizer skips degenerate triangles entirely - zero fragment shader cost.

### 3. High Resolution Texture (1024x1024+)

| Resolution | Pixels per Hex | VRAM | Quality |
|------------|----------------|------|---------|
| 512x512 | ~10px | 4MB | Blurry, pixelated transitions |
| **1024x1024** | ~20px | 16MB | Good for most cases |
| 2048x2048 | ~40px | 64MB | High detail, large maps |

### 4. Noisy Biome Transitions (Not Linear Mix)

**Problem with linear `mix(SAND, GRASS, t)`:**
- 50% blend = muddy brownish-green
- Looks artificial

**Solution: Noisy Smoothstep**
```glsl
float noiseVal = noise(worldPos.xz * 20.0) * 0.1;
float mask = smoothstep(0.4, 0.45, terrainType + noiseVal);
vec3 color = mix(SAND, GRASS, mask);
```
Creates organic "dithered" boundary - sand penetrating into grass patches.

---

## 1. Heightmap Generation (TerrainHeightmap.ts)

### Texture Format

**1024x1024 DataTexture** with RGBA Float32:

| Channel | Name | Description |
|---------|------|-------------|
| R | height | Terrain height with SDF falloff |
| G | terrainType | Elevation indicator (0.33=beach, 0.66=jungle, 1.0=mountain) |
| B | coastDist | Distance from shoreline (for foam) |
| A | landMask | Hard cutoff: 1=land, 0=water |

### Algorithm (SDF Approach)

```
For each pixel (x, y) in 1024x1024:
  1. Convert to world coordinates
  2. Find the SINGLE CLOSEST hex center
  3. Calculate distance to that center
  4. If closest hex is land AND dist < hexRadius * 1.1:
       - landMask = 1
       - shapeMask = smoothstep(radius*1.1, radius*0.5, dist)
       - height = ELEVATION[hex.elevation] * shapeMask + noise
       - terrainType = hex.elevation / 3
     Else:
       - landMask = 0
       - height = seafloor depth based on distance to any land
```

---

## 2. Unified Terrain Shader (UnifiedTerrain.tsx)

### Vertex Shader

```glsl
uniform sampler2D heightmap;

void main() {
    vec4 hm = texture2D(heightmap, uv);

    // OPTIMIZATION: Squash water vertices (skip rasterization)
    if (hm.a < 0.5) {
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Displace land vertices
    vec3 pos = position;
    pos.y = hm.r;

    // Compute normal from heightmap gradient
    // ...

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### Fragment Shader

```glsl
// Biome colors
const vec3 SAND = vec3(0.93, 0.87, 0.70);
const vec3 GRASS = vec3(0.22, 0.55, 0.28);
const vec3 ROCK = vec3(0.45, 0.42, 0.38);

void main() {
    // Noisy transitions (not linear mud)
    float n = noise(vWorldPos.xz * 15.0) * 0.08;

    vec3 color;
    if (vTerrainType + n < 0.45) {
        float t = smoothstep(0.25, 0.45, vTerrainType + n);
        color = mix(SAND, GRASS, t);
    } else {
        float t = smoothstep(0.45, 0.75, vTerrainType + n);
        color = mix(GRASS, ROCK, t);
    }

    // Lighting
    // ...
}
```

---

## 3. Ocean Shader (Ocean.tsx)

> Updated for ADR 0001 (issue #6). The ocean no longer uses `TerrainHeightmap.ts`.

> Updated for #38 (steps 2–3): the seabed is in metres and the water colour
> comes from the seabed itself.

**Seabed.** Below the waterline the height field follows `seabedProfile.ts`,
in metres at the render scale of `worldScale.ts` (65 m per unit): a ~1:21
beach face, a 2–15 m shelf about a hex wide, and a drop-off at ~175 m offshore
to a ~122 m floor. Reef hexes rise to a noisy 1–3 m crest. The land mesh
(`landMesh.ts`) covers this seabed around islands and reefs down to
`VISIBLE_SEABED_DEPTH` (~90 m), derived in `waterOptics.ts`: the depth from
which the seabed's light, through Beer–Lambert along the shortest path (2 ×
depth) and the shader's 70–95 m fade, is under 1% in every channel.
Faces above sea level draw in the main pass as before, flat-shaded. Faces
wholly under water are seabed (coral sand, algal deep seabed and coral
patches, with albedos in `palette.ts`), drawn only on `SEABED_LAYER`,
indexed and smooth-shaded with per-vertex colours, on the same lattice as
the land. (A per-edge split of steep seabed triangles was removed: with
smooth shading and the wide drop-off it was visually redundant, and it cost
about 380k triangles and ~95 ms on the large map.)

**Map shape and wrap (#36).** Maps are rectangles of flat-top hexes in
odd-q offset rows (see `mapConfig.ts`), with the corner cell at the world
origin, not the centre. The game's maps wrap east–west (`G.wrap`, a cylinder
as wide as the map's columns). Given the wrap, the whole terrain field
repeats exactly every wrap width `W` (1.5 units per column):

- its coast, relief and reef-crest noise come from `periodicNoise.ts`, which
  samples 3D simplex noise on a cylinder of circumference `W`;
- it is built over one **seam strip** (`seamStrip.ts`): x from −0.75 (half a
  column west of column 0) to −0.75 + W, from the cells plus copies of the
  cells within a few units of either edge, shifted one wrap across
  (`withSeamImages`), so coasts, reefs and the elevation blend carry on across
  the seam; every sampler first moves its x into the strip (`wrapIntoStrip`);
- `field.bounds` is that strip in x (no padding needed), and `field.periodX`
  is `W`. The reef mask (`createReefMask(cells, wrap)`) works the same way.

**Drawing the wrap.** The land mesh lattice fits a whole number of steps into
`W` (0.15 units divides 1.5 exactly), so copies of the mesh one wrap apart
share their edge vertices; its occlusion ring, seabed normals and the
band/coral colour noise also wrap round (the noise is periodic). The field
texture covers exactly the strip, so it tiles: `Ocean.tsx` gives it repeat
wrapping in s and defines `TERRAIN_FIELD_WRAP_X`, which makes every x count
as inside the field. Grid edges on the seam are emitted once
(`buildHexGridEdges(hexes, wrap)`), so copies don't draw them twice.

The board draws land, decorations, the grid, ports and ships in **copies**,
one wrap width apart (`WorldCopies.tsx`), moved each frame by whole wrap
widths to stay around the camera focus; the camera pans east or west
forever with no teleport, so the world-space waves, caustics and surf noise
never jump. How many copies: `wrapCopyRange` from the view's ground footprint
at full zoom-out (`CAMERA_MAX_DISTANCE`): at 16:9, five (−2…+2) on the small
map and three (−1…+1) on the medium and large; a 4:1 super-ultrawide needs up
to seven on the small map.
The camera looks **due north** (`CAMERA_OFFSET` in `cameraBounds.ts`: due
south of its focus, pitched ~46.7° down, no yaw), so screen-horizontal is
world x, the wrap axis, and screen-vertical is world z: a horizontal drag
pans along the wrap only and never changes which rows are on screen, a
vertical drag runs north or south until the focus clamp below stops it, and
the map's north and south edges are horizontal on screen. The first cut kept
the old diagonal "iso" view (`[0.4, 0.6, 0.4]`, 45° of yaw), under which a
horizontal drag moved the focus in both x and z, hit the clamp and slid
along the edge, and the edges showed as diagonals. Everything placed
relative to the view turned with the camera: the sun (`atmosphere.ts` keeps
its elevation and azimuth from the view direction, so the glint and shadows
sit where they did on screen), the wave wind (`oceanWaves.ts`, 25° to screen
left of the view direction) and the port labels, which face +z.
The copies only draw: the land mesh, decoration placement, palm geometry and
grid lines are built once per map above them (`useLandTerrain`,
`useDecorationLayout`, `usePalmTrees`, `useHexGrid`/`useWaterGridLines`) and
every copy's meshes share those geometries and materials, so a copy costs no
build time or GPU upload. The hex hover is shared too (`sharedHover.ts`), so
the hovered hex lights up in every copy. Tooltips are drawn once, in the
copy under the pointer (`PointerCopy`): a very wide view can show the same
ship twice. The ocean is still **one** plane, centred under the camera
focus and following it (all its shading is in world space, so moving it
changes no pixel); the seabed prepass draws the land copies like the main
pass. The zoom-out cap is `CAMERA_MAX_DISTANCE` (28) on every map size, Civ
style. North and south, `wrapView.ts` clamps the **focus point** (the centre
of the view, on the sea plane) to the band every column covers,
z ∈ [0, √3·(rows − ½)] (`clampFocusToBand`), at every zoom and whatever the
screen's shape: the player can always pan until the top or bottom row reaches
the screen centre, and the rest of the view is open sea, where Civ shows the
void past the poles. Clamping the view instead of the focus (the first cut)
pinned the focus at any zoom where the view was taller than the rows (a
small map at distance 28 on a 16:9 screen: ~61 units of view against 30 of
rows), so only east–west panning worked. The ocean plane is centred under
the focus and sized for the view's reach at full zoom-out on the widest
screen, so its edge stays off screen with the focus anywhere in the band.
The sea past the rows needs nothing drawn: the ocean shader treats
everything outside the field's bounds as open sea (the field texture clamps
in t but every read is guarded by `terrainFieldInside`; the seabed prepass
has no mesh there, so the water is deep water), and the grid lines are built
from the water cells' edges, so they end at the map.
A ship whose move crosses the seam starts its animation a wrap width over
(`seamAwareStart`), so it sails straight across.

Cost: the copies add ~25 draw calls and roughly double the triangle count
(palms, rocks, piers and the grid lines are not frustum-culled), with no
measurable change in frame time on an Apple M4.

**Field texture.** `terrainFieldTexture.ts` bakes the field once per map into
an RGBA **half-float** texture over `field.bounds` (12 texels per world unit,
capped at 1280 per side; the bounds pad the outermost cell centres by the
coast-distance clamp plus a hex radius, so an island on the map's edge keeps its
whole shelf and drop-off (in z; in x a wrapping field covers exactly the seam
strip); texel centres sampled, rows from `minZ` up, so
`uv = (xz - min) / (max - min)` with no flip):

| Channel | Contents |
|---------|----------|
| R | Height (world Y); 0 is sea level. Depths to 10 m round to under 1 cm |
| G | Coast signed distance (+ land, - water), world units, clamped near ±4, for shore foam (#10) |
| B | Reef mask (#11), 0 … 1: 1 inside a reef hex, 0 everywhere else, ramping over a 0.2-unit rim just inside the reef outline (`reefMask.ts`) |
| A | Reserved, 1 |

`TERRAIN_FIELD_GLSL` holds the matching read helpers.

**Water colour.** Each frame `seabedPrepass.ts` renders `SEABED_LAYER` (the
land mesh plus the sun) into a half-resolution HDR colour + depth target,
without fog or background. `Ocean.tsx` then, per pixel:

1. rebuilds the seabed's world height from the four nearest prepass depth
   texels and interpolates it bilinearly (the raw half-res depth steps and
   banded);
2. **refracts** (#38 step 6): bends the view ray at the wave facet with
   Snell's law in vector form (`refract`, n = 1.333, the facet's slopes
   scaled by `WAVE_SHADING_GAIN`), finds where the bent ray meets the seabed
   plane at the depth just read, projects that point back into the prepass
   (`cameraViewProjection`), reads the depth there and traces once more to
   it, so a ray leaving a shelf for deep water ends on the seabed it would
   really meet. The look-up falls back to the straight sample when the hit
   is behind the camera, off screen, on land above sea level or where no
   seabed was drawn. Instead of a fixed pixel cap, the bend is bounded by
   physics: the refracted ray's horizontal travel per unit depth is held at
   the critical angle's (`MAX_REFRACTED_TRAVEL`, tan(asin(1/n)) ≈ 1.135, the
   most oblique a level sea bends any ray), and the depth it is traced to at
   `SEABED_FADE_END`, past which the seabed is invisible. The waves wobble
   the seabed, and the seabed reads shallower than it is, as through real
   water;
3. attenuates the lit seabed by Beer–Lambert along the refracted sun path
   down and the refracted view path up, and adds deep-water radiance
   `R∞ · downwelling irradiance` as the seabed fades (`waterOptics.ts` holds
   the coefficients and their sources);
4. mixes in the sky PMREM by Schlick Fresnel (F0 = 0.02), adds the GGX sun
   glint, then the shore surf.

**Waves (#38 steps 4–5).** The surface normal comes from three FFT cascades
(`useWaveCascades.ts`) of one JONSWAP sea (`oceanWaves.ts`: 7 m/s over
100 km, Hs ≈ 1.6 m, blowing away from the camera and 25° to screen left so
the crests run across the screen off both hex axes) with Mitsuyasu
spreading. Each is 256² modes on its own
tile, turned against the others: 1468 m (swell, the spectral peak),
202.5 m (chop) and 26.1 m (ripple). `waveCascadeBands.ts` gives them
end-to-end bands in k-space, each stopping at half its grid's Nyquist
(four texels per wave), so every wave from the longest down to 0.41 m is
carried by exactly one cascade. The tile ratios (~7.25 and ~7.76) do not
line up within three repeats, so the summed sea does not tile. Each
frame the GPU evolves each spectrum (frequencies rounded to whole cycles per
`WAVE_LOOP_SECONDS`, so the clock wraps seamlessly) and runs a Stockham inverse
FFT (`fftButterfly.ts`, 8 row + 8 column passes) into a mipmapped half-float
texture of (∂h/∂x, ∂h/∂z, |∇h|²). The three are batched side by side in one
atlas (`waveCascadeAtlas.ts`), so all of them take 20 draws a frame. The
cascades are run by the board (`useWaveCascades`) and their textures handed
to both the water and the seabed; the look-up that sums them lives in one
place, `waveSlopeGlsl.ts`. The water shader samples each texture once, sums
the filtered mean slopes into the normal and the filtered variances into
roughness. A cascade fades out once its band's longest wave spans under four
pixels (gone at two), and all of them fade to flat between 45 and 90 units
from the camera; faded slope goes into the roughness too
(`waveNormalFilter.ts`), so the highlight keeps its energy instead of
shimmering. The glint is GGX with Smith masking and Schlick Fresnel
(`sunGlint.ts`), HDR so bloom picks up the sparkles. The sky reflection, the
refracted seabed look-up, the facet-lit in-scatter (`facetSunlight`) and the
caustics see the slopes scaled up to Cox–Munk's measured slope
(`WAVE_SHADING_GAIN`, ≈ 1.7), so the waves read across the whole sea; the
glint keeps the drawn slopes so its path stays narrow.

**Caustics (#38 step 6).** Caustics are light, so they are made where the
seabed is lit: the seabed and land materials (`useLandTerrain.ts`) patch
three's standard shader (`seabedCaustics.ts`, via `onBeforeCompile`) so
that, in the prepass, each fragment's *directional* light is scaled by the
intensity from `causticFocus.ts`; the sky term is not focused, and
Beer–Lambert stays in the water shader. The land material carries the patch
because the shoreline triangles (any vertex above sea level) reach a few
metres below the waterline, where the caustics are sharpest; above the
waterline the factor is 1. Per fragment: the surface point the
sun's refracted ray crosses is the seabed point moved up and back by its
depth along the level-sea refracted sun (`refractedSunTravel`); the summed
cascade slope is read there and one footprint step away along each screen
axis, and the differences give the wave Hessian H
(`hessianFromSlopeDifferences`); the light that a patch of surface carries
lands on |det J| of seabed, J = I + depth · G · H, where G
(`refractionFocusMatrix`) is how the refracted travel per unit depth changes
with slope, diag(c / cos²φ, c) in the sun's azimuth frame with
c = 1 − cos θ / (n cos φ) and sin φ = sin θ / n (overhead, (1 − 1/n) · I); the
intensity is 1 / |det J| with a C¹ knee (`CAUSTIC_KNEE`) that holds a fold
(det J = 0) at four times the mean light. The maths is mirrored on the CPU
and tested: a flat sea gives 1, a sinusoid matches the closed form
1 − d · c · a k² sin(kx), and the mean over the seabed is 1 (energy is only
moved). Three look-ups per cascade, nine reads per half-res fragment, no
extra pass, and the lines are per fragment rather than per 2×2 quad as
`dFdx` of a sampled slope would be.

Level of detail. The look-ups are read `CAUSTIC_LOD_BIAS` mip levels
coarser than the pixel, with the difference steps widened to match, so waves
shorter than `CAUSTIC_MIN_WAVE_TEXELS` (6) prepass texels are smoothed out:
cells of a few texels draw as grain, not dappled light. Each band's share of
H then fades out where its longest wave spans under 4–8 of those texels
(`causticLodFade`), and between one and three of its mean wavelengths of
depth (`causticDepthFade`): a wave focuses sharpest within about its own
wavelength of depth and folds beyond it, where the single sheet no longer
describes the light. So the ripple band (0.41–3.2 m) lights the first
1–3.5 m, the chop band (3.2–23 m) the shelf and the drop-off, and the swell
never fades (its curvature is slight). At map zoom nothing short enough to
show a line survives the smoothing, so the shelf is evenly lit; at ship zoom
the chop's 3–6 m cells dapple the shelf and the ripple's lines show in the
shallows. The caustics move with the wave textures themselves, so they
share the wave clock and freeze with the waves under
`prefers-reduced-motion`.

The shallow-water saturation boost scales with the red the water has
absorbed, so sand under near-clear water keeps its colour instead of
turning orange. Wet sand is dry sand at half albedo. Surf is limited to water
shallower than 0.6 m on the drawn seabed, so it stays at the waterline (a
stopgap until step 7; the outer breaker line is off until then).

Where the prepass has no seabed (below the mesh cut-off, or off the mesh) the
shader reads `NO_SEABED_DEPTH` (105 m, past the fade), so the water is deep
water.

---

## 4. Sun Shadows (SunLight.tsx, shadowFit.ts)

One directional sun (`atmosphere.ts`: 55° up, 48° to screen left, 70 units
from the camera target) casts every shadow from one 4096² map through an
orthographic shadow camera. Islands, ships, palms and rocks cast; the land
and seabed meshes, ships and rocks receive (palms don't: their thin
double-sided fronds shadow themselves into acne). The seabed receives in the
prepass too, so hull shadows show through the water.

**Fit (#48).** The shadow box follows the camera target and is sized to the
view each frame by the pure maths in `shadowFit.ts`. Its half-extent is the
furthest visible point of the sea plane (`groundViewReach` in
`cameraBounds.ts`, for the live camera distance and viewport aspect) plus a
margin for receivers above the sea (`SHADOW_CASTER_HEIGHT` × cos elevation,
their displacement across the box), clamped to `[SHADOW_EXTENT_MIN,
SHADOW_EXTENT]` = [4, 25]. A caster and its shadow lie on the same light ray,
so covering the receivers on screen covers the casters that matter; tall
things only widen the depth range, which `shadowDepthRange` checks against
the near and far planes (0.5 and 150) in `atmosphere.test.ts`. At full
zoom-out (distance 28) the 16:9 view reaches ~43 units, so the box sits at
the 25-unit cap, as before: 50 units across, a 0.79 m texel. At ship zoom
(distance 3.5–4.3; 4.3 is as close as the small map's `minDistance` allows)
it fits to 6.8–8.1 units, a 0.22–0.26 m texel, 3–3.7× finer. From there up
to distance 16, where the cap takes over, the texel tracks the screen pixel
at the focus (1.1–1.2 px), so the PCF disc smooths what is left at every
zoom. The fixed box was sized for the cap at every zoom, which is why hull
and palm shadows stepped close up. Because the cap sets the map-zoom texel,
the map stays at 4096: 2048 would double it. One box covers mid zoom too,
so there are no cascades.

**Refit and snap.** The box is rebuilt (`shadow.camera.left/right/top/bottom`
and its projection matrix) as soon as the fitted extent grows, by however
little: a box smaller than the view needs drops the shadows of receivers at
the far screen corners, and that is worse than a re-snapped texel grid. It
shrinks only once the fitted extent has fallen more than
`SHADOW_FIT_HYSTERESIS` (5%) of the current one below it. A wheel tick zooms
5% but moves the extent by less, because the caster margin does not zoom, so
zooming in shrinks the box about every second tick, and the easing between
ticks (sub-5% drift) never re-snaps the grid. The light's target is snapped
to whole texels of the live box (texel = 2 × extent / 4096), as the fixed
box was for #13, so edges don't shimmer while panning.

**Bias.** three's `shadow.bias` is in the map's [0, 1] depth, spread linearly
over near…far by the orthographic camera, and `normalBias` is in world units;
neither follows the box. Both cover a texel's worth of slope, so they are
given in texels (`SHADOW_BIAS_TEXELS` 1.2, `SHADOW_NORMAL_BIAS_TEXELS` 1.6,
the old −0.0001 and 0.02 at the 25-unit box) and converted from the live
texel on each refit, so acne and hull-shadow contact behave the same at every
zoom.

**Filter.** `SHADOW_MAP_TYPE` is `PCFShadowMap`: five Vogel-disc samples per
pixel, each a hardware 4-tap compare, rotated per pixel by interleaved
gradient noise, within `SHADOW_RADIUS` (1) texels. three 0.182 deprecated
`PCFSoftShadowMap` and substituted this filter with a console warning, so it
is what the scene was already drawn with; naming it drops the warning.
`VSMShadowMap` (the map is blurred, so the penumbra is smooth at any width)
is the alternative, untried on screen: it makes every receiver cast as well
and leaks light where casters overlap, palms over slopes and rigging over
hulls. To A/B it: `VSMShadowMap`, `SHADOW_RADIUS` 4, `shadow.blurSamples` 8,
both biases 0. Keep it only if nothing leaks under the palms and hulls.

---

## File Locations

| File | Purpose |
|------|---------|
| `src/board/visuals/TerrainHeightmap.ts` | SDF-based heightmap generation |
| `src/board/visuals/UnifiedTerrain.tsx` | Land shader with vertex squashing |
| `src/board/visuals/Ocean.tsx` | Water: refraction, water colour, waves, glint, surf |
| `src/board/visuals/waterOptics.ts` | Water optics: absorption, Fresnel, vector Snell, the refraction bound |
| `src/board/visuals/waveSlopeGlsl.ts` | The cascade slope look-up shared by the water and the seabed |
| `src/board/visuals/causticFocus.ts` | Caustic maths: focus matrix, Hessian, intensity, depth and LOD fades |
| `src/board/visuals/seabedCaustics.ts` | Patches the seabed material so its sunlight is focused by the waves |
| `src/board/visuals/useLandTerrain.ts` | Land and seabed mesh and materials, once per map |
| `src/board/visuals/SunLight.tsx` | The shadow-casting sun: fits, refits and snaps its shadow box to the view |
| `src/board/shadowFit.ts` | Shadow box maths: extent from the view's reach, texel, biases, refit hysteresis, depth range |
| `src/board/visuals/atmosphere.ts` | Sun, sky, haze, shadow and post-processing constants |
| `src/board/Board.tsx` | Scene composition |
| `src/board/HexGrid.tsx` | Click detection (invisible meshes) |

---

## Elevation Constants

```typescript
ELEVATION_HEIGHTS = {
  0: -0.15,  // Water/seafloor
  1: 0.12,   // Beach
  2: 0.4,    // Jungle
  3: 0.7,    // Mountain
}
```

---

## Performance Notes

| Technique | Before | After |
|-----------|--------|-------|
| Water pixels | Fragment discard (run shader, throw away) | Vertex squash (skip entirely) |
| Land mask | IDW blending (ghost patches) | SDF closest-hex (clean boundaries) |
| Resolution | 512x512 (blurry) | 1024x1024 (crisp) |
| Biome colors | Linear mix (muddy) | Noisy smoothstep (organic) |
