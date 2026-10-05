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
at full zoom-out (`CAMERA_MAX_DISTANCE`): at 16:9, four (−2…+1) on the small
map and three (−1…+1) on the medium and large; a 4:1 super-ultrawide needs up
to six on the small map.
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
2. attenuates the lit seabed by Beer–Lambert along the refracted sun path
   down and the view path up, and adds deep-water radiance
   `R∞ · downwelling irradiance` as the seabed fades (`waterOptics.ts` holds
   the coefficients and their sources);
3. mixes in the sky PMREM by Schlick Fresnel (F0 = 0.02), adds the GGX sun
   glint, then the shore surf.

**Waves (#38 step 4).** The surface normal comes from one FFT cascade
(`useWaveCascade.ts`): a JONSWAP sea (`oceanWaves.ts`: 7 m/s over 100 km,
Hs ≈ 1.6 m) with Mitsuyasu spreading, 256² modes over a 500 m tile. Each
frame the GPU evolves the spectrum (frequencies rounded to whole cycles per
`WAVE_LOOP_SECONDS`, so the clock wraps seamlessly) and runs a Stockham inverse
FFT (`fftButterfly.ts`, 8 row + 8 column passes) into a mipmapped half-float
texture of (∂h/∂x, ∂h/∂z, |∇h|²). The water shader samples it twice: the
500 m tile, and a stopgap detail look-up 4.37× smaller and turned 0.93 rad
(`waveDetailLayer.ts`, replaced by step 5's cascades). It turns the
combined filtered mean slope into the normal and the filtered variance into
roughness, fading the normal to flat between 45 and 90 units from the camera
(`waveNormalFilter.ts`). The glint is GGX with Smith masking and Schlick
Fresnel (`sunGlint.ts`), HDR so bloom picks up the sparkles. The sky
reflection, the refracted seabed look-up (`refractedSeabedShift`, a precursor
of step 6) and the facet-lit in-scatter (`facetSunlight`) see the slopes
scaled up to Cox–Munk's measured slope (`WAVE_SHADING_GAIN`, ≈ 1.7), so
the waves read across the whole sea; the glint keeps the drawn slopes so its
path stays narrow.

At the coast, the sunlight on the seabed is also scaled by the wave facet
above it, so the waves continue into the shallows as light and shade on the
sand (a stopgap that step 6's refraction and caustics replace). The
shallow-water saturation boost scales with the red the water has absorbed,
so sand under near-clear water keeps its colour instead of turning orange.
Wet sand is dry sand at half albedo. Surf is limited to water shallower than
0.6 m on the drawn seabed, so it stays at the waterline (a stopgap until
step 7; the outer breaker line is off until then).

Where the prepass has no seabed (below the mesh cut-off, or off the mesh) the
shader reads `NO_SEABED_DEPTH` (105 m, past the fade), so the water is deep
water. Caustics brighten the seabed term before it is attenuated; they
are driven by `causticTime`, a wrapped CPU clock in `causticMotion.ts` that
stops under `prefers-reduced-motion`.

---

## File Locations

| File | Purpose |
|------|---------|
| `src/board/visuals/TerrainHeightmap.ts` | SDF-based heightmap generation |
| `src/board/visuals/UnifiedTerrain.tsx` | Land shader with vertex squashing |
| `src/board/visuals/Ocean.tsx` | Water with depth/foam effects |
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
