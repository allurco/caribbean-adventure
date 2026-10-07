# Terrain System

## Overview

Islands, seabed, water and shore are all drawn from **one terrain height
field** (ADR 0001, `docs/adr/0001-one-terrain-height-field.md`): a pure
function of the map's cells and a seed that every visual consumer samples,
on the CPU directly or on the GPU through a texture baked from it. The game's
`cell.elevation` decides how high land rises; the renderer only shapes it.
Read this before changing the field, the land mesh or the ocean and shadow
shaders: §1 and §2 cover the field and the land drawn from it, §3 the water,
§4 the sun's shadows.

```
G.cells + seed ──▶ terrainHeightField.ts   sampleHeight(x, z), sampleCoastDistance,
                   (one per map, through    sampleElevation, isNearLand, isNearSeabed
                    sharedTerrainField.ts)
        ┌───────────────┼──────────────────────────┐
        ▼               ▼                          ▼
  landMesh.ts     terrainFieldTexture.ts     CPU samplers
  lattice mesh    RGBA half-float bake       groundPlacement.ts: trees, rocks, stones, shrubs
  useLandTerrain  useTerrainFieldTexture     landSurface (landMesh.ts): buildings, quay, pier
  LandTerrain           │                    useHexGrid.ts: port labels and hover volumes
        │               ▼                    shoreBoulders.ts, useWaterGridLines.ts
        ▼         Ocean.tsx: reef bands
  seabed prepass  waveDisplacement.ts: shallow damping
  → water depth   shoreFoamLand.ts: wash up the sand
```

---

## 1. The Height Field (terrainHeightField.ts)

**What it is.** `createTerrainHeightField(cells, seed, options)` returns a
`TerrainHeightField`: `sampleHeight(x, z)` is the terrain's world Y at any
world XZ (flat-top hexes, `hexToWorld`); `sampleCoastDistance` the
noise-perturbed signed distance to the coast, positive on land, negative
over water, clamped at ±`MAX_COAST_DISTANCE` (4 units); `sampleElevation`
the blended land elevation (1 beach … 3 mountain); and `isNearLand` /
`isNearSeabed` cheap per-hex tests that let consumers skip open water
without sampling. Plain TypeScript with no Three.js, so it is unit-tested.
Building it is linear in the number of coastline edges and a sample is O(1):
a hex look-up and a scan of the coast segments indexed to that hex, sorted
by a lower bound on their distance so the scan stops early and the result is
exact. The seed is `terrainSeedFromCells(cells)`, a hash of the land cells'
positions and elevations, so every client and every consumer gets the same
coastline without a seed stored in `G`.

**Coast.** The land/water boundary is the set of hex edges between a land
hex and a non-land neighbour (water and reef alike). The coast distance `d`
at a point is its distance to the nearest such edge, signed by whether its
own hex is land, plus two octaves of simplex noise
(`COAST_NOISE_AMPLITUDE` 0.25 units at 1.3 cycles per unit, from
`periodicNoise.ts`). The amplitude stays under the hex inradius (√3/2), so
the noisy shore never reaches a hex centre; `coastNoiseAmplitude: 0` makes
the coast trace the hex edges exactly, which the tests use. Land/land edges
are never boundary edges, so adjacent land hexes never dip towards each
other.

**Under water (d ≤ 0).** The seabed is `seabedProfile.ts` in metres at the
render scale (`worldScale.ts`, 65 m per unit): a ~1:21 beach face, a 2–15 m
shelf about a hex wide and a drop-off at ~175 m offshore to a ~122 m floor
(§3 *Seabed*). Reef hexes rise to a noisy crest `REEF_CREST_DEPTH` ±
`REEF_CREST_VARIATION` (2 ± 0.9 m) below the surface; the rise starts
`REEF_FOOT` (0.6 units) outside the reef outline and is complete `REEF_TOP`
(0.4) inside it, joined to an already shallow shelf by a smooth max so there
is no crease. The depth is a function of coast distance alone: a land cell's
biome does not change the seabed off its shore.

**On land (d > 0).** `height = target · ramp(d) + relief · ramp(d)²`. The
target is a kernel-weighted blend (radius `BLEND_RADIUS` 2, which reaches
the adjacent centres and no further) of nearby land cells' `ELEVATION_HEIGHTS`
({1: 0.3, 2: 0.75, 3: 1.4} world units for beach, jungle, mountain), so an
island is one landform with no seam at hex edges, stepping smoothly from a
beach ring up to a mountain core. `ramp` rises from 0 at the coast to 1
over `SHORE_RAMP` (0.9 units) inland; on beaches a soft toe (`SHORE_TOE`
0.18, gone by jungle) leaves the waterline at zero slope, so sand meets the
water tangentially while rocky coasts still rise steeply. Relief is
non-negative multi-octave noise, rolling on low ground and ridged (sharp
crests, broad valleys) from jungle up to mountain, with peak amplitude
`RELIEF_AMPLITUDES` ({1: 0.05, 2: 0.16, 3: 0.5}) interpolated on the blended
elevation. Because it only ever raises the ground and is scaled by ramp², it
cannot cut a dip between land hexes, reorder beach < jungle < mountain at
the cell centres, or lift the waterline. Both branches are 0 at d = 0, so
the coast sits exactly at `SEA_LEVEL` (0).

**Bounds and wrap.** Without a wrap `field.bounds` pads the outermost cell
centres by `BOUNDS_PADDING` (5 units: the 4-unit coast-distance clamp plus a
hex circumradius), so an island on the map's edge keeps its whole shelf and
drop-off and nothing samples outside the field. With the game's east–west
wrap (`G.wrap`, #36) the field is built over one seam strip
(`seamStrip.ts`) exactly one wrap width wide, from the cells plus their
images just past either edge (`withSeamImages`), with periodic noise, and
every sampler first moves its x into the strip; `field.periodX` is the wrap
width. §3 *Map shape and wrap* covers what the mesh, the texture and the
world copies make of that.

**One per map.** `sharedTerrainField(cells, wrap)` (`sharedTerrainField.ts`)
builds the field once per `cells` array (a `WeakMap` on the array, so a new
map is a new field) and every consumer asks it, never
`createTerrainHeightField` directly. Builds derived from the field (the bake
below, the land mesh, the decoration layout) go through `perMapCache.ts` for
the same reason: the board's tree is rendered more than once per map and
every world copy would otherwise rebuild them.

**GPU consumers: the baked texture.** `terrainFieldTexture.ts` samples the
field at every texel centre over `field.bounds` into an RGBA half-float
image (height, coast distance, reef mask, reef windward weight; the channel
table and the texel density are under *Field texture* in §3) and
`useTerrainFieldTexture.ts` wraps it in one `DataTexture` per map.
`TERRAIN_FIELD_GLSL` is the matching read helper, pasted into each shader
that has a `mapBounds` uniform. Three shaders read it: `Ocean.tsx`, for the
reef mask and windward weight behind the reef foam band;
`waveDisplacement.ts`, for the height that damps the wave displacement in
the shallows; and `shoreFoamLand.ts`, for the coast distance that runs the
wash up the sand. The water's depth itself does not come from the texture:
the land mesh (§2) is drawn into the seabed prepass and the water shader
reads that depth back, so the colour follows the drawn seabed exactly.

**CPU consumers.** Everything placed on land asks the field for its ground:
`groundPlacement.ts` probes a footprint's centre and rim for trees, rocks,
stones and shrubs (`decorationLayout.ts`, once per map); the port kit
(`portSettlement.ts`, `quayPlacement.ts`, `pierPlacement.ts`) stands on the
drawn lattice surface instead (`landSurface`, §2); `useHexGrid.ts` lifts each
port's label and hover volume to `groundTopY`; `shoreBoulders.ts` keeps
boulders where the coast distance straddles the waterline;
`useWaterGridLines.ts` fades the water hex grid's lines by coast distance as
they approach the shore. A rendered point on land must sit within a small
tolerance of `sampleHeight` there. The shadow box (§4) does not sample the
field: it is sized from the view's reach and fixed caster and receiver
depths.

**Invariants the tests pin (`terrainHeightField.test.ts`).**

- *Determinism.* The same cells and seed give identical heights, a different
  seed a different coastline, and `terrainSeedFromCells` is stable for a map
  and differs between maps.
- *Continuity across land hex edges.* Along the segment between two adjacent
  land centres the height never jumps (0.004-unit steps move it by under
  0.01–0.02; under 0.06 on every land/land edge of a generated map) and
  never dips to sea level.
- *Height ordered by elevation.* `ELEVATION_HEIGHTS` increase; a volcano's
  mountain centre is above its jungle ring, which is above its beach ring;
  on generated maps every jungle centre is higher than every beach centre
  and every mountain centre higher than every jungle one.
- *Coastline and sea.* With no coast noise the land/water edge midpoint is
  exactly 0 in height and coast distance; with it, the sea-level crossing
  between a land and a water centre lies within `COAST_NOISE_AMPLITUDE` of
  the hex edge. Every water cell centre, every reef centre and open ocean
  are below 0; the sea deepens away from the shore; wherever `isNearLand`
  is false the coast distance is at most −(1 − amplitude).
- *Seabed in metres (#38).* The first ring of water hexes round an island
  lies on a 2–15 m shelf; three hexes off it, and in open ocean, the water is
  ≥ 65 m deep; a reef hex in open water sits 1–3 m down, its front never
  steeper than 3:1, with deep water two hexes away; a beach leaves the
  waterline at under 0.05 slope and stays under 0.45 through its first 3 m
  of height; every point `isNearSeabed` rejects is deeper than 100 m; a reef
  next to land leaves the land's heights untouched.
- *Interior relief.* Its spread grows from beach to jungle to mountain (each
  more than double the last, mountains over 0.08) and it vanishes at the
  coast with zero slope.
- *Bounds.* Every cell centre is inside, and the whole rim of the bounds is
  deeper than `VISIBLE_SEABED_DEPTH`, for an island on the outer ring and
  for the large map.
- *Wrap (#36).* Coast distance and height repeat exactly every wrap width,
  the strip's two edges meet without a step, and an island straddling the
  seam is land on both sides.
- *Performance.* Building the large map's field and sampling it at the land
  mesh's resolution takes under 2 s.

`terrainFieldTexture.test.ts` pins the bake: sea level encodes exactly;
heights round-trip within 0.1% (under a centimetre over the first 10 m of
depth) and the coast distance keeps its land/water sign; texel centres are
laid out as GL samples them (x along a row, rows from `minZ` up); each
channel holds the right sampler and the reef channels leave the others
untouched; every texel matches `sampleHeight` within half-float precision;
the texel pitch is no coarser than `LAND_MESH_SPACING`, so the shallows
follow the mesh's coastline; the waterline lands on the noisy coast, not the
hex outline; reef hex centres are full reef and no texel outside a reef hex
is; and the default density survives the size cap on the large map.

---

## 2. The Land Mesh (landMesh.ts, useLandTerrain.ts, LandTerrain.tsx)

**Lattice.** `buildLandMesh(field)` samples the field on a triangular lattice
over `field.bounds` (`LAND_MESH_SPACING` 0.15 units, fine enough to resolve
the relief; on a wrapping map the spacing is adjusted so a whole number of
steps fits the wrap width) and keeps the triangles that reach above
−`LAND_MESH_SKIRT_DEPTH` (`VISIBLE_SEABED_DEPTH`, ~90 m, `waterOptics.ts`),
the depth below which the water hides the seabed anyway. Lattice vertices in
open water (`isNearSeabed` false) are never sampled, which is why the large
map's ~400k triangles build in about 0.2 s. Pure, no Three.js:
`useLandTerrain.ts` wraps the arrays in `BufferGeometry`s once per map
(`perMapCache`) and disposes them when the map changes; `LandTerrain.tsx`
draws them, one instance per world copy, all sharing the same geometry and
materials.

**Two surfaces.** Triangles with any vertex above sea level are *land*:
emitted unindexed, one face normal and one colour per triangle, under a
flat-shaded `MeshStandardMaterial`, for the faceted low-poly look. Triangles
wholly under water are *seabed*: indexed, one vertex per lattice point with
the field's own smooth normal (central differences on the lattice) and a
colour per vertex, so no facets show through clear water. Land draws in the
main pass and the seabed prepass; the seabed only in the prepass
(`SEABED_LAYER`, `seabedPrepass.ts`), which is how the water learns its depth
(§3 *Water colour*). There is no shader displacement: the heights are in the
vertex positions, so the mesh and every CPU sample agree.

**Colour.** `landFaceColor` bands each face by its mean height: wet sand at
the waterline drying over the first `WET_SAND_TOP` (0.03), dry sand fading
to jungle over 0.42–0.55 and jungle to highland over 1.0–1.2, each boundary
shifted by a fixed-seed noise so no contour shows; rock blended in by
steepness (~50–62°) at any height; and a cheap occlusion term that darkens a
face sitting below the mean of a ring of lattice points round it. Under
water: wet sand to clean seabed sand within half a metre, the deep seabed
colour down the drop-off (10–30 m), and coral in noisy patches where the
reef mask is set. Albedos come from `palette.ts` through `useLandTerrain.ts`.
Both materials are patched for caustics (`seabedCaustics.ts`) and the land
one for the shore wash (`shoreFoamLand.ts`); §3 covers both.

**The drawn surface for placement.** Between lattice points the drawn ground
is the triangle's plane, not the smooth field, and the two differ by up to a
few hundredths. Props that stand on the field through `groundPlacement.ts`
(trees, rocks, stones, shrubs) tolerate that; the port kit does not, so
`landSurface(field)` exposes the emitted triangulation as a `GroundField`
(`sampleHeight` plus `creasesWithin`, the lattice vertices and edge crossings
under a footprint) and `decorationLayout.ts` hands it to the settlement, the
quay and the pier (§3 *Standing on the ground*).

**Tests (`landMesh.test.ts`).** Every vertex lies on the field; land is whole
flat triangles and the seabed indexed with shared vertices, smooth normals
and one colour per vertex; the mesh covers land and the seabed down to the
cut-off and nothing else, with no cracks (no corner on another triangle's
edge) on reefs and drop-offs; every triangle faces up; a lone beach island is
wet and dry sand only, steep faces are rock, flat high ground is not, hollows
are darker, reef seabed is coral; skipping open water yields exactly the
full-lattice mesh; on a wrapping map the lattice repeats every wrap width and
a point and its copy share height, normal and colour; `landSurface` matches
the emitted triangles and samples each vertex once; and the large map builds
within budget.

---

## 3. Ocean Shader (Ocean.tsx)

> Updated for ADR 0001 (issue #6): the ocean reads the terrain through the
> baked field texture (§1) and the seabed prepass of the land mesh (§2).

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
The camera looks **due north** (`CAMERA_DIRECTION` in `cameraBounds.ts`: due
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
ship twice. The ocean is still **one** mesh, the ring grid of
`oceanGrid.ts` (see *Geometry* below), centred under the camera focus and
following it (all its shading is in world space, so moving it changes no
pixel); the seabed prepass draws the land copies like the main pass. The zoom-out cap is `CAMERA_MAX_DISTANCE` (28) on every map size, Civ
style. North and south, `wrapView.ts` clamps the **focus point** (the centre
of the view, on the sea plane) to the band every column covers,
z ∈ [0, √3·(rows − ½)] (`clampFocusToBand`), at every zoom and whatever the
screen's shape: the player can always pan until the top or bottom row reaches
the screen centre, and the rest of the view is open sea, where Civ shows the
void past the poles. Clamping the view instead of the focus (the first cut)
pinned the focus at any zoom where the view was taller than the rows (a
small map at distance 28 on a 16:9 screen: ~61 units of view against 30 of
rows), so only east–west panning worked. The ocean grid is centred under
the focus and reaches past the view's reach at full zoom-out on the widest
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
measurable change in frame time on an Apple M4. The faceted rocks (#49)
added two instanced draws per copy (three rock variants where there was one
sphere).

**Props: rocks (#49).** Like the palms, rocks are hand-built faceted
geometry, placed from the existing decoration data; `src/game/` is
untouched. `rockGeometry.ts` builds three variants (a rounded boulder, a
long low slab and a tall angular spur: 36, 42 and 40 triangles) as jittered
polar lattices, non-indexed with face normals; the widest ring sits at the
origin and the underside is squashed to a shallow buried base, so a rock
placed on a slope sinks in instead of floating. `rockVariation.ts` derives
each rock's look from a hash of its placement (the `palmVariation.ts`
pattern): variant, a base colour by biome with a tint within ±15% of it, a
per-axis stretch, a small tilt, a bury depth and a size class by the cell's
biome (large outcrops on `ROCK`, medium on `GRASS`, small on `SAND`). The
hash covers the rock's X, Z, rotation and scale but never its Y, so the
placement can derive the same variation before it knows the ground height.
`smallStones.ts` adds one derived stone per `SAND`/`GRASS` cell without a
rock or port, from a per-cell hash of its coordinates and the terrain seed;
the densities are named constants. `Rocks.tsx` draws one `InstancedMesh`
per variant on a white material, with `instanceColor` carrying the base
colour times the tint. Instance counts (10-seed average, generator rocks +
stones): small 26 + 32, medium 61 + 81, large 124 + 152.

**Rock placement (#53).** Rocks and stones go through `rockPlacement.ts`,
not straight through `placeOnGround`, and differ from trees in two ways.
They stand on the ground at their own **centre** (`standOn: "centre"` in
`groundPlacement.ts`; trees and port markers keep the default lowest-probe
rule, since a trunk must not float): a boulder's base is wide, and on a
summit the lowest probe under it was so far below the middle that most
large outcrops, and about half the grass rocks, ended up fully below the
surface. The squashed underside and the bury depth cover the downhill side
instead. And the probed footprint is the rock's **drawn radius**: `placeRock`
derives the variation at each nudge candidate (so a candidate that re-hashes
to a smaller rock may fit where the requested one would not) and probes the
ground out to `rockDrawnRadius` (per-axis scale × the variant's ellipsoid
radii × the unit radius), at the centre and 16 points round the rim, so a
slab can neither hang over the water nor over a lower neighbour the probe
missed. Stones ask for the small class they are drawn at (`sizeClass` on
the request), not their cell's; a grass stone probed at the medium class
was pushed back from edges it fitted on. `ROCK_MAX_EXTENT` (0.85, just inside the hex inradius of 0.87) caps
that radius: a rock that would reach further is shrunk uniformly in
`rockVariation`, which only touches the biggest slabs (a large slab at the
generator's top scale would otherwise reach 1.31 units). Probe over small-map
seeds 11-13: fully buried rocks went from 30/33 on `ROCK`, 27/44 on `GRASS`,
1/15 on `SAND` and 43/101 stones to 0 everywhere; rims over water from 9 to
1 (`ROCK`) and 2 to 0 (`GRASS`). The cost of the centre rule is on ridges:
`ROCK` summits are knife-edged (the ground falls about a unit on both flanks
within a large rock's radius while the rock is about half a unit tall), so a
rock perched on the crest shows air under its flanks. The cross-probe slope
check is blind to that symmetric drop, and sinking the rock halfway back only
trades the gap for the burial, so it is left as it is for the visual review.

Size and colour were retuned after an A/B at ship zoom where the rocks could
not be found. `ROCK_UNIT_RADIUS` is 0.22 (was 0.12; a palm canopy is ~0.24),
the size classes are large 2.2 / medium 1.5 / small 1 (were 1.5 / 1 / 0.65)
and stones scale within [0.6, 1] (was [0.3, 0.5]). The rocks used to be
painted with `highlandRock`, the summit's own colour, so outcrops vanished on
the ground they sat on; `ROCK_BASE_COLOR` now gives each biome a colour
darker and less warm than its ground: grey-brown 0x665f55 on sand, a neutral
grey 0x5a5c5a on grass and a slate 0x565c64 on `ROCK` (a darker slate read
as a hole beside the summit's shaded faces).

**Props: vegetation (#49).** Between the palms the islands grow two kinds of
derived ground cover, hand-built and faceted like the palms and placed on
the board, with `src/game/` untouched. `shrubGeometry.ts` builds a **bush**
for `GRASS` cells (four overlapping jittered polar-lattice blobs on a short
square stem, 0.18 units tall, 88 triangles) and a dry **tuft** for `SAND`
cells (nine folded blades splaying out of a low mound of dry earth, 0.1
units tall, 32 triangles). Both carry the palms' `palm` vec2 attribute, so
`injectPalmSway` displaces them unchanged: the sway weight rises with height
from 0 at the base to `SHRUB_MAX_SWAY` (0.5 for a bush, 0.65 for a tuft;
the shader bends by weight², so a bush top moves about 5% of its height and
a blade tip about 15%, against a frond tip's weight of 1), and the crown
mask is 0 throughout, so the palm's crown twist and frond flutter leave
shrubs alone. `shrubPlacement.ts` derives one to three shrubs per `SAND`/`GRASS`
cell (`SHRUBS_PER_GRASS_CELL`, `SHRUBS_PER_SAND_CELL`, both `[1, 3]`) from a
per-cell hash of the cell's coordinates and the whole terrain seed, as the
stones do, within `SHRUB_SPREAD` (0.68) of the centre: wider than the
stones' 0.55 because the generator keeps its trees and rocks within ±0.35
of the centre, so the outer ring is where a grass cell has room left.
Each shrub goes through `placeOnGround` with a probe the size of its stem
or mound (`SHRUB_GROUND_FOOTPRINT`, 0.04), not its foliage, since the
placement buries a prop to the lowest ground under the probe and probing
the foliage radius sank bushes past their leaves on slopes. It must then
clear the cell's trees, rocks, stones and pier deck by its foliage radius
plus `SHRUB_CLEARANCE` (0.05), stay `SHRUB_PORT_CLEARANCE` (0.45, the port
marker's 0.35 plus a margin) from a port cell's centre, and not overlap the
cell's other shrubs; `SHRUB_ATTEMPTS` (5) spots are tried per shrub before
it is given up. Rock clearance uses the rock's nominal radius, not its
stretched one, so foliage may brush a long slab but is never rooted inside
one. `shrubVariation.ts` hashes each placement into a width and a height
stretch, a per-channel tint (±12% luminance with a ±5% green-against-red
hue nudge) and a sway phase; the colours are chosen against the ground
each kind stands on (a warm light green 0x6aa23f for bush leaves on the
jungle floor, a dry olive straw 0xa89f58 for blades on the beach). The sway
clock is shared: `useSwayClock` owns the angle uniform, advances it once per
frame and holds it still under `prefers-reduced-motion`, and `usePalmTrees`
and `useShrubs` both bind their materials to it, so one setting stops every
plant. `Shrubs.tsx` draws one `InstancedMesh` per kind on a vertex-coloured
material with `instanceColor` carrying the tint, casting shadows and not
frustum-culled, as the palms are: two more instanced draws per world copy.
Instance counts (10-seed average, bushes + tufts): small 42 + 52 (94),
medium 103 + 117 (220), large 188 + 241 (428).

**Props: shore boulders (#49).** `shoreBoulders.ts` derives rocks along the
waterline and just below it, so the wash and the breaker line (above) and
the shallows have something to break against; nothing is stored in G and
`src/game/` is untouched. Only the coasts of `SHORE_BOULDER_BIOMES` land
cells (`ROCK` and `GRASS`) get boulders: a sandy beach meets the sea clean,
emergent and submerged alike (the generator's land rocks and small stones on
`SAND` cells are unchanged). The gate is per cell, before any sampling, and
each edge hashes on its own, so skipping the sand coasts leaves the boulders
on the others exactly where they were. For every allowed coastal edge (a
land cell's edge onto a water neighbour, the wrap respected so a seam edge
onto land across it is not a coast) it samples `BOULDER_SAMPLES_PER_EDGE` (3)
points along the edge,
each offset `BOULDER_OFFSET_RANGE` (−0.45 inland … +0.2 offshore) from it,
tries `BOULDER_KEEP_SHARE` (0.22) of them by a hash of the cell, edge and the
whole terrain seed (`variationStream.ts`, the seed through the salt), and
keeps those whose signed coast distance in the field is within `SHORE_BAND`
(−0.3 … +0.4), so they follow the noisy coastline, not the hex edge; the
edge a pier faces (its rotation points at the docking hex) is left clear.
That is `BOULDERS_PER_COAST_EDGE` ≈ 0.6 per allowed edge. Ports sit on
beach cells, so no port coast has them. About 45% of the coast edges are
rock or grass (10-seed averages: 93 of 206 on the small map, 240 of 515 on
the medium, 448 of 992 on the large), giving 10-seed averages of 55 boulders
on the small map (45 emergent, 10 submerged), 145 on the medium (123 / 22)
and 269 on the large (223 / 46), about 17–18% of them submerged; before the
sand rule the same seeds gave 122 / 301 / 583 (101 / 250 / 484 emergent,
21 / 51 / 99 submerged). Each boulder takes the shared rock look (`rockVariation`, the
small size class at scale 0.55–1.2, its cell's biome colour) darkened by up
to `WET_DARKENING` (35%) within `WET_BAND` (0.2) of the water.

*Sea lanes.* A ship sits at a water hex's centre, ~0.87 units from the land
hex's edge, with a hull ~0.4 units from its centre, so a boulder's drawn rim
(`boulderReach`: the variant's widest ring from `ROCK_VARIANT_REACH` times
its scale, plus the lean of its top under the tilt) may pass the edge by at
most `MAX_OFFSHORE_REACH` (0.3) and must keep `SHIP_HULL_CLEARANCE` (0.55)
from every water hex centre within two hexes, which covers the corners where
two water hexes meet. A boulder that would break either is shrunk to fit
(dropped under `MIN_BOULDER_REACH`, which never happens within the offset
range).

*Layers.* Emergent boulders stand on the ground at their centre and draw in
the main pass and the seabed prepass (`prepass="also"` on `RockVariantMesh`),
since their feet reach under the waterline. The beach face is ~1:21
(`seabedProfile.ts`) whatever the land cell's biome (the seabed is a function
of coast distance alone; only the land side steepens from beach to jungle),
so within the offshore cap the water is under a metre deep on rock and grass
coasts too (10-seed mean 0.9 m at the cap past an edge's midpoint, 0.35 m
under the offshore boulders themselves) and any boulder readable at ship
zoom (≥ 4 m tall) would stand clear of it; `SUBMERGED_SHARE` (half) of the
boulders whose centre is in the water
are therefore sunk into the seabed until their crown is
`SUBMERGED_CROWN_DEPTH_METRES` (0.4–1.2 m) under the surface, like
half-buried reef rocks, and draw in the prepass only (`prepass="only"`,
`SEABED_LAYER`), where the water tints them by depth, the wash foams over
their crowns and nothing shows through the surface. A boulder whose crown
breaks the surface is emergent whatever its centre. Both sets share one
material per set of wave textures (`ShoreBoulderMeshes.tsx`): the rocks' white
with `injectSeabedCaustics`, as the land material has it, so the sun on the
submerged boulders and on the emergent ones' feet is focused by the waves
(the factor is 1 above the waterline). The layout is built once per map in
`useDecorationLayout` (`DecorationLayout.shoreBoulders`) and drawn per world
copy: up to three emergent and three submerged instanced draws per copy.

**Props: port buildings and pier (#49).** A port is identified at map zoom
by a small faceted settlement, all derived on the board from the existing
`pier` and `fort` decorations and the port flag; `src/game/` is untouched.
`pierGeometry.ts` replaces the single box with a plank pier (six posts,
two stringers, eight banded planks; 192 triangles) built with the shared
`facetBuilder.ts`: the deck top sits at +0.07, the posts reach to −0.3, and
`Piers.tsx` draws the one instanced mesh on the seabed prepass layer as
well as the main pass, so the posts show through the shallows. The old
pier was pushed a fixed 0.7 units towards the docking hex, which buried
it in the beach wherever the coast noise pulled the shoreline out (the
shore lies 0.6–1.1 units from the centre along that line);
`pierPlacement.ts` now walks the ground along the pier's line and
starts the deck 0.12 inland of where the ground drops to the shore
(clamped to 0.5–0.85 from the centre, so a 0.6 deck stays clear of a
docked galleon). The ground it walks is the drawn land surface
(`landSurface`, as the quay and the settlement's pier-root reserve
walk it, #59): on the smooth field the shore step landed 0.025–0.075
away on about half of generated ports, which started the deck past
the quay's coping or stood its first posts inside the quay body. `buildingGeometry.ts` builds four kinds, origin at the
ground contact and the door on +z: a timber warehouse (gable to the
water, ridge 0.24), a whitewashed two-storey tavern (0.27), a gabled
house under dark shingles (0.19) and a masonry watchtower with a parapet
and terracotta pyramid roof (0.46), all under a 0.5 cap so the label at
0.6 stays clear; walls carry on 0.12 below ground as a footing. (Those
are the faceted kit's heights; the aged kit below raises the house and
the warehouse.)
`portSettlement.ts` places a watchtower on the fort's side and up to three
other buildings (kind order, scale ±8%, tint ±8% and yaw jitter ±8° from
a hash of the cell and the whole terrain seed) on the landward half of the
hex, facing the docking hex. The `PortMarker` is an invisible hover volume
(#59: `visible` false, no shadow; R3F still raycasts it, like the water
hexes) sized by `portHover.ts` to the settlement as placed: the
settlement radius in plan, and in height from the lowest building's foot
to the tallest building's top (at least the 0.5 cap over the probed
ground), with 0.05 to spare either way. A fixed cap's worth of air over
the centre's ground was not enough: the buildings stand on the drawn
surface out to 0.62, and on a beach rising inland a tower there can top
out 0.7 above the ground probed round the centre, so hovering its upper
half showed no tooltip. The buildings use the whole hex: they form a
crescent round an open square of radius
0.15 at the centre (a knot of buildings on the centre hid the ones
behind the tower from the camera), each trying rings outwards from the
square (0.06 apart, the first with its near corner on the square's edge,
the last at 0.62 so the widest building stays inside the hex's 0.866
inradius) and keeping a reserve round `pierOrigin`, the pier's land end,
where the quay stands (see **settlement on the quay** below). A port hex is a small
beach with water on one
to three sides and a shore ramp down to each, and higher jungle neighbours
pull its field up, so a footprint commonly spans 0.1–0.2 in height; a
fixed arc of slots lost half the buildings. Each building instead looks
round the arc (7.5° steps) and outwards in rings 0.04 apart for the ground
nearest its preferred slot that `placeOnGround` accepts, that overlaps no
neighbour, and whose footprint the building's footing can cover (see
**standing on the ground** below). The ground the buildings probe goes
through one function, `settlementGround`, which lays the quay's flat top
over the ground as it is drawn. `PortBuildings.tsx` draws one
`InstancedMesh` per kind on a white `vertexColors` material with
`instanceColor` carrying the tint, plus one per nation present for the
flags over the towers (same matrices, untinted).

**The aged settlement (#59).** The faceted kinds looked like fresh-cut
toys ("biscuits"), so the settlement now draws aged pieces from
`agedBuildingGeometry.ts`, built on `agedKit.ts` and `agedRoof.ts` with
the same local-space contract and footprints (the aged half-diagonals,
0.165–0.215, are what `portSettlement.ts` probes). Walls are lime render
grimed over the lowest fifth (`tintColors`), an irregular grid of cells
of which a hash flakes some darker, with staining streaks under windows
and eave corners, corners cut unequally top and bottom (never a uniform
chamfer), and the whole piece leaning a degree or two through the
builder's `shear`, which puts the normals through the inverse transpose
so they stay exact. Roofs are two thick slabs under rows of raised
terracotta strips of unequal length (uneven eaves), a couple slipped down
the slope, a ridge cap that sags 0.006 in the middle, one slope mossy and
the other salt-pale. Doors are three planks in alternating tones under a
tapering lintel with a near-black iron strap; shutters hang open by
different angles; the warehouse has a loft hatch and the tavern a sign.
The watchtower is the port's landmark: a 0.2-square body tapering to
0.17, its mortar body covered in rough-cut blocks of unequal widths in
wobbling courses (a quarter proud and bevelled, one corner chipped, some
with an ochre cast), a string course, a parapet with eight merlons (one
chipped), and a flagpole to 0.49, under the 0.5 cap, flying the owning
nation's flag (`nationFlagGeometry.ts`: a two-sided rippled 3 × 3 grid in
the HUD's bands, 0.1 × 0.055, converted from sRGB without three). Every
port gets its tower, fort decoration or not, at the end of the crescent
on the fort's side (the slot nearest the water); if the landward arc has
no room it takes any direction, and failing that the hex centre, so it is
never dropped. The gabled kinds keep the faceted footprints but not all
the heights: the house's eave is at 0.14 under a 0.23 ridge (it was
0.10 / 0.19, and read at ship zoom as a hut sunk to its sills) and the
warehouse's at 0.16 under 0.27 (was 0.13 / 0.24), each at its old pitch;
the tavern stays at 0.17 / 0.27. The warehouse's walls are
`bleachedPlank` (sun-bleached, salt-greyed softwood) so they read apart
from the dark timber of its door and hatch; the house and tavern keep
the lime render. Every kind stands on a stone plinth: the footing
(0.16 deep) in the stone colour, with a course standing 0.004 proud of
the wall line from 0.03 to 0.012 below ground contact whose top 0.006 is
a paler cap, so where the ground falls away under a piece on a slope the
exposed footing reads as a raised platform with a crisp pale line at the
wall's foot rather than a wall sinking out of sight. Triangles:
warehouse 466, tavern 618, house 466, watchtower 580 (+36 flag), budget
1000. Honest judgement from the
screenshots: at ship zoom the pieces read as an old stone-and-tile port;
at map zoom the tower is a small pale upright with a dot of flag colour,
findable beside the label but not yet unmistakable on its own, because
the 0.5 cap keeps it to about twenty pixels tall at the default zoom. Instance counts (10-seed average):
small 5 piers + 17.3 buildings (every port gets its tower; 3.5 per port,
up from 2.9 while the marker held them to the outer ring), medium 10 +
34.6, large 15 + 50.6 (before the church, below). Draw calls: five
instanced meshes per copy where the pier box was one; the marker's
32-triangle cylinder per port is no longer drawn.

**The church (#59).** Every port now gets a parish church of the early
colonial type, the fifth `BuildingKind` (`AGED_CHURCH` in
`agedBuildingGeometry.ts`): a single nave 0.2 across by 0.3 long, ridge
along z and the door on +z, in the aged kit's worn panelled walls under
the aged tile roof (eave 0.18, ridge 0.3), whitewashed a coat fresher
than the houses' lime render (`churchLime`, warm, not a clean cool
white) with grey-ochre quoin blocks at the corners in alternating
courses, a tall planked door (0.085) in a stone surround of two jambs
and a three-facet round arch over a dark tympanum, and three slit
windows high on each long wall as deep recesses with their staining
runs; no shutters. The front wall rises above the roof as an espadaña:
a full-width base to 0.215, shoulders sloping parallel to the roof
(0.03 above the tiles) to a screen 0.14 wide and 0.035 thick, pierced
by two round-headed openings (sill 0.31, crown 0.361, the arch heads in
two facets) each holding a bronze bell, under a band, a small pediment
and an iron cross whose top at 0.42 is the church's height. The roof
tucks into the screen at the front (it ends a hair inside the screen's
back plane, so the eaves' end faces sit flush with the gable) and
overhangs the back gable as usual. The height rule: the tower stays the
port's one tallest landmark, so the church has its own scale range,
`CHURCH_SCALE_RANGE` 0.96–1.04, and `portSettlement.test.ts` pins its
top at the largest scale (0.437) under the cap and more than 0.02 under
the smallest tower's pole (0.466). Placement: a fifth slot straight
landward of the square is the church's (under the Laws of the Indies
the church fronts the plaza); it is placed second, after the tower and
before the shuffled others, looks round the whole hex if the landward
arc has no room, and is dropped only where no ground takes its walls'
plan. The slots either side of it moved from ±0.45 to ±0.8 so a house
beside the church clears it on flat ground; the ring search makes the
exact value immaterial to how many buildings fit.

The church is also why the ground is probed under the walls and not
over the plan circle. Under the stand-on-top rule a spot is taken only
if the ground under the footprint spans less than the footing covers
(about 0.14); the church's plan circle is 0.23 (the roof's rear eave
corner), spans 0.46 and on a 0.33 beach ramp alone takes up the whole
allowance, so with the circle as the footprint only 60–68 % of ports
got a church (8 seeds of each size) and settlements stood at
2.42 / 2.64 / 2.67 buildings per port. `planFootprint(kind, scale, yaw)`
is the walls' rectangle (`AGED_BUILDING_PLAN`: 0.1 × 0.15 for the church,
the gabled kinds' and the tower's half-widths otherwise) with
`PLAN_FOOTPRINT_MARGIN` (0.02, over the plinth course and the lean,
under the eave's 0.025 overhang) round it, turned to the building's yaw.
The rectangle with its margin stays inside the plan circle, since the
creases probed are those within the circle and the circle is what keeps
neighbours and the pier root clear: the tower's square plan has no room
for the full margin under its 0.15 reach (its corner would stand at
0.17), so `planMargin` gives it the largest margin whose corner lies on
the circle, about 0.006, still past its plinth course.
`footprintGround` probes it on a 9 × 13 grid plus the drawn surface's
creases inside it, and the same rectangle decides the quay stance. The
plan circle still keeps buildings apart, off the pier root and inside
the hex, and still drives `placeOnGround`'s wet/steep check. With it,
97–100 % of ports get a church and settlements stand at
3.08 / 3.00 / 2.97 buildings per port (small / medium / large, 8 seeds
each), above the 2.42 / 2.58 / 2.64 the rule gave before the church
existed; every tower stays on its arc. The church's cross comes no
nearer than 0.077 to the label (a church standing high on a slope).
Triangles: 787 (budget 1000), the roof's 332 the largest share, the
plinth's 28 (course and cap) included. `facetVisibility.ts` guards
the whole aged kit against inside-out or missing facets by casting rays
from forty-nine directions and requiring every first hit to face the
viewer; it caught the screen's side strips and the bells wound inside
out during the build. A ray tie with a sound coplanar face passes that
test, so a sibling check lists any exposed pair of coplanar triangles
that face opposite ways and overlap, which is what a concave outline
fanned from the wrong corner leaves; it caught the arches' left
spandrels, whose fan had to start at the outer corner. Honest
judgement from the screenshots: at ship
zoom the pale screen rising above the ridge reads as a church beside
the tower, the cross a nub; at map zoom it is one more white block with
a red roof and does not compete with the tower's dark upright and flag.
Instance counts (10-seed average): small 5 piers + 13.9 buildings,
medium 10 + 26.9, large 15 + 41.4; six instanced meshes per copy.

**Port kit: the stone quay (#59, slice 3).** `quayGeometry.ts` builds a
stone platform at the pier root in the pier's local frame (749 triangles,
budget 1000; one per port, so cheap), in the port kit's art direction: an
old Spanish-Caribbean port that has stood a century in salt air, still
in the stylised mid-poly register (faceted, vertex colour only, no
textures), with nothing on a perfect grid. The mesh is shared by every
port but `quayAt` lifts each instance by its own amount (0 on a low
beach, 0.085 at the cap, a median of 0.055 over generated maps), so the
mesh's waterline is modelled `QUAY_TYPICAL_LIFT` (0.055) below the sea
and the lift lands the tide mark, the course line and the stair foot at
the water on a typical port, a little under it on a low beach and at
most 0.03 above it at the cap (`quayPlacement.test.ts` pins the lift to
the maps). A footing from as deep as the pier posts up to that waterline;
above it two tall battered courses (each 0.0075
further out than the one above, the foot flush with the base's edge, an
up-facing ledge at the course line) whose sea face and seaward sides are
a near-black mortar plane set with rough-cut blocks laid out once from
the variation stream (`QUAY_WALL_BLOCKS`): unequal widths, joints of
0.004–0.010, each block proud by its own 0.002–0.010 (0.007 on the lower
course so it stays under the base's edge), beds that wobble, a few
chipped corners, two blocks missing to show the rubble behind, tones
±15 % with an ochre drift, and the blocks under the bollards and the
mooring ring stained dark. A green-black wet band over three quarters of
the lower course (a `tintColors` gradient to the waterline). The deck is a
square-edged stone base 0.018 thick overhanging the wall by 0.015, its
top the mortar the paving's joints show, carrying twelve unbevelled
paving stones in three rows of 4/3/5 (`QUAY_PAVING`): unequal widths,
joints of 0.004–0.010, every corner at its own height within ±0.003 of
`QUAY_TOP`, a fifth of them sunk 0.004, and the five that carry a prop
flat; sand drifts over the landward row, a damp patch darkens the
middle, and the outer edge is salt-pale. A step down a coping's thickness
behind z = −0.2 so the back reads as a stair into the beach; a
three-tread stair on the +x end of the sea wall with uneven rises and a
chipped top tread, a hair seaward of the proudest block so it touches
nothing. Props: two tapered octagonal timber posts leaning 4° (the top
ring pushed over, the foot flat on its stone) and worn dark at the foot,
an iron mooring ring on the upper course, a rope coil, an aged crate and
a barrel with alternating stave tones and two iron hoops. `QUAY_TOP`,
the footprint and the placement are unchanged from the first slice. The sea face stands 0.04 seaward of the pier's
land end, so the pier's root is embedded in it. Parts meet on shared
planes with the hidden face dropped (the body open on top, the coping open
underneath with its exposed overhang drawn as three strips, the bollards
open at their feet); the tests check that no face overlaps another in its
plane and none passes through another, and that the top is flat at
`QUAY_TOP` (0.085, a 0.015 lip above the pier deck). Occlusion is baked
along the waterline and under the coping, the stone carries a 5 % colour
jitter. `quayPlacement.ts` puts one at every pier origin, turned with the
pier: the beach at a pier root is anything from the waterline to 0.15
high and higher to either side, so the deck is lifted until it stands
0.04 above the highest sand along its sea face, between the lip and
0.1 above the pier deck (past that the back is left buried). The body's
footprint is probed as `placeOnGround` does and the whole quay is lowered
onto the lowest point should the ground fall away, so it never floats
(on generated maps it never has to). Width and depth vary ±10–15 % per
port from a hash of the cell and the whole terrain seed, as instance
scale. `Quays.tsx` draws one `InstancedMesh` per world copy, on the seabed
prepass layer too. `quayTopAt(quay, point)` is the seam for the
settlement: the deck or step height under a world point over a placed
quay, or undefined off it; `quayTopY(cell, field, seed, point)` is the
same for a cell, placing the quay first.

**Standing on the ground (#59).** A building stands ON the ground, never
cut into it. Two things make that true. First, what it stands on is the
ground as drawn: the land is a lattice mesh (`landMesh.ts`, 0.15 steps)
whose vertices sample the field, so between lattice points the drawn
surface is the triangle's plane, not the smooth field. Measured at the
buildings' footprints over 12 generated maps (328 buildings, 5,576
probes) the two differ by 0.006 on average, 0.013 at the 90th percentile
and up to 0.039 (the drawn surface lies under the field two times in
three, the lattice cutting the relief's bumps). A rule evaluated on the
field would therefore still let the drawn sand rise through a wall by a
few hundredths, so `useDecorationLayout` hands the settlement and the
quays `landSurface(field)`: the lattice surface as a `GroundField`, the
same triangulation `buildLandMesh` emits (pinned against its triangles),
with each lattice vertex sampled once. Second, the standing rule in
`standBuilding`: the footprint is probed at its centre, 24 rim points,
two inner rings, and at every crease of the drawn surface under it (`creasesWithin`: the
lattice vertices inside the footprint and the lattice edges' crossings of
its rim, where a piecewise-flat surface takes its extremes; a ring of
probes alone missed kinks by up to 5 mm). The ground contact is set
`BUILDING_SINK` (0.002) under the HIGHEST probe, so the high side meets
the wall and nothing cuts in, and the spot is only taken if the spread of
the probes is at most `buildingMaxSpread(footing)` = footing − sink −
`BUILDING_FOOTING_MARGIN` (0.01), so the footing (`BUILDING_FOOTING` × the
building's scale) reaches under the lowest point with the margin to spare
and nothing floats. On a
slope the footing shows on the downhill side, so the aged kinds' footing
is a stone plinth: the stone colour (not the wall's render) with a course
0.004 proud of the wall line just below ground contact (`PLINTH_COURSE`),
10 triangles per kind, so the exposed part reads as a raised platform, as
colonial houses on slopes were built. The footing is 0.16 deep: at 0.12
the allowed spread (about 0.1) refused most beach-ramp spots and the
settlements fell from 2.65 / 2.65 / 2.76 buildings per port
(small / medium / large, 8 seeds each) to 1.85 / 1.78 / 1.88 even with the
finer search, warehouses all but vanished and one tower fell back to its
hex centre; at 0.16 they stand at 2.45 / 2.54 / 2.65 with every tower on
its arc, and at about 3.0 once the footprint probed is the walls' plan
rather than the plan circle (see the church, above). (Before this rule the contact sat half a footing above the lowest
probe and the high side was buried up to 0.1, which cut the back walls of
houses into rising sand; 320 of those 328 buildings had ground above their
contact, by up to 0.12.)

**Settlement on the quay (#59).** `settlementGround(cell, field, seed)`
in `portSettlement.ts` is the ground the buildings probe: it places the
port's quay once and answers each probe with the quay's flat top (the
deck, or the rear step 0.03 lower) wherever the point is on the quay and
the terrain elsewhere, so `placeOnGround` and the footprint probes see a
building on the quay standing on its deck, not on the sand under it; where
the sand drifts over the quay's back the sand is the visible surface and
wins. Two rules go with it, in `standBuilding`. A footprint is wholly on
the quay or wholly off it: one straddling the edge would step a wall down
the quay's side (the 0.04–0.1 step is inside the 0.16 spread the sand rule
allows, so the spread rule alone would take it). And the reserve round
the pier's land end is one pier width (`PIER_ROOT_RESERVE`, 0.16) for a
footprint on the sand but only the pier's mouth, half its width
(`PIER_MOUTH_RESERVE`, 0.08), for one on the quay, so the deck is
buildable but where the pier meets the quay stays walkable. With the
present kit nothing fits: the smallest footprint circle, the tower's
(0.285–0.3 across), is about as wide as the deck is deep (0.29–0.35) and
cannot keep the mouth clear, so on generated maps no building stands on
the quay and none moved when the rule landed; the seam is in place for
smaller quay pieces (a crane, a customs shed, stacked cargo).

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
| A | Reef windward weight (#38 step 7), 0 … 1: 1 where the reef faces into the wind, least in its lee, from the nearest rim edge's outward normal (`createReefOutward`) and `reefWindwardWeight` (`shoreFoam.ts`); 1 off reef |

`TERRAIN_FIELD_GLSL` holds the matching read helpers. The texture is built
once per map by `useTerrainFieldTexture.ts` and shared by the water and the
land's shoreline foam.

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
   glint, then the foam (below).

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
texture of (∂h/∂x, ∂h/∂z, |∇h|², J), J being the whitecaps' Jacobian
(below). The three are batched side by side in one atlas
(`waveCascadeAtlas.ts`), with one more block per displacing cascade for the
height and choppy pull (*Geometry* below), so all of them take 24 draws a
frame: one spectrum, 16 FFT stages, three slope and two displacement
outputs, two whitecap accumulators. The
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
turning orange. Wet sand is dry sand at half albedo.

**Distance recession (#77, stylistic).** Close up the shelf is clear
turquoise over sunlit sand; at map zoom the same shelf read as a bright
ring the eye landed on before the island. So the shelf recedes as the
camera pulls out: a weight in the camera's real distance from its focus
point (0 up to `SHELF_RECEDE_NEAR_DISTANCE`, 1 from
`SHELF_RECEDE_FAR_DISTANCE`, eased in log distance; `waterOptics.ts`) makes
the water more opaque rather than veiling it. The water body is evaluated
at an effective depth, real × `SHELF_FAR_DEPTH_SCALE` plus
`SHELF_FAR_DEPTH_OFFSET` metres (ramping in over the first
`SHELF_OFFSET_RAMP` of real depth so the waterline stays continuous), both
scaled by the weight, and every depth-driven term reads it: absorption on
both legs, the seabed fade, the deep lift and the saturation boost. The sand
shows through less and the shelf collapses toward the water's own colour
along the gradient it already has, so no new hue appears and open water,
already opaque, is identical at every zoom. The deep lift, added on top of
the seabed close up, is composited under it by (1 − transmittance) as the
shelf recedes, since added it drew a blue band brighter than both sides. The
shore foam (wash, breaker and reef bands, on the sea and up the sand) fades
ahead of the water, reaching `SHORE_FOAM_FAR_SHARE` by
`SHORE_FOAM_FADE_END` of the weight, so the breaker line is gone before the
shelf is, and the far coastline is a faint line, not a white rim; whitecaps
and hull foam are untouched. A milky
veil and a mix toward the open-sea tone were tried first and rejected: both
added light, so the shelf went pale grey instead of sinking into the blue.
The weight reaches the land's shore wash through `cameraDistanceUniform`,
a shared uniform object like the surf clock.

Where the prepass has no seabed (below the mesh cut-off, or off the mesh) the
shader reads `NO_SEABED_DEPTH` (105 m, past the fade), so the water is deep
water.

**Foam (#38 step 7).** Three coverages, unioned (1 − Π(1 − cᵢ), so they
saturate rather than add past white), each broken into lace by a
world-space noise churned on the surf clock (`surfMotion.ts`; the lace
fades back to its smooth mean where its features fall under a few pixels,
so at map zoom the shore reads as a thin bright line), and all fading with
distance like the waves. The foam replaces the water under it, sky
reflection and glint included, as a Lambertian of albedo ≈ 0.88, slightly
warm (`FOAM_ALBEDO`, `foamShading.ts`), lit by the sun and the sky in the
water body's own irradiance units, so it stays HDR-consistent (about as
bright as dry sand). `PALETTE_SURF` is gone.

- *Whitecaps* (`whitecapFoam.ts`). The spectrum pass fills the working
  textures' spare BA pair with the choppy displacement's stretch along and
  across the wind (λ = `WAVE_CHOPPINESS`, 1.2, the same pull that moves
  the geometry in step 8), riding the same FFT as the slopes; the output
  pass writes the surface Jacobian J = (1 + ∂Du/∂u)(1 + ∂Dv/∂v) into the
  slope texture's A channel. The shear ∂Du/∂v, which would need a third
  real signal, is dropped: measured in the wind frame it enters J only
  squared, and the CPU test shows the chop cascade's J changes by under
  0.03 anywhere on the tile and its coverage by ~3% of itself. Each
  whitecapping cascade (the swell and the chop, `WHITECAP_CASCADES`; the
  ripple is too short to foam) then has one more draw into a 256²
  half-float ping-pong pair in its own tile space that adds
  max(0, `WHITECAP_FOLD_THRESHOLD` (0.77) − J) and decays with a 5 s time
  constant, as the exact step of f' = −f/τ + g·fold over the frame's
  wave-time step (frame-rate independent; frozen with the waves under
  reduced motion). At that threshold the chop foams on about 1.4% of its
  tile at any moment, the swell on a few hundredths of a percent: a
  Beaufort 4 sea's "fairly frequent white horses". The water sums the
  accumulators through the same tile transforms and fades as the slopes
  (`sumCascadeWhitecaps`, `waveSlopeGlsl.ts`); the pair swaps every frame,
  so the water rebinds it after the cascades draw.
- *Shore and reef bands* (`shoreFoam.ts`), from the prepass depth in
  metres, so they follow the drawn seabed exactly: the **wash** at the
  waterline (full at 0, gone by 0.35–0.9 m, reaching deeper at the flood
  of the pulse); the **breaker line** where waves of the sea's significant
  height break, by McCowan's H / 0.78 (`jonswapSignificantHeight`,
  ≈ 2.05 m for Hs ≈ 1.6 m), peaking on that contour and fading faster
  seaward than shoreward (the bore runs on), pulsed so sets arrive a
  little ahead of the wash; on the ~1:21 beach face it sits ~40 m off the
  wash, and where the seabed drops fast they merge; and the **reef band**
  wherever the reef mask is set and the crest is within ~3–4.5 m of the
  surface, weighted by the field's windward channel so the line is
  densest on the face that meets the wind (`REEF_WINDWARD_BIAS`).
- *Hull foam* (`hullFoam.ts`, `shipFoamSources.ts`). `Ship.tsx` writes
  each ship's animated position, heading, hull length (the mesh's) and
  speed into a rendering-side registry from its frame callback (only in
  the canonical world copy; a sinking ship is a different component and
  stops); `Ocean.tsx` reads it into a uniform array of at most
  `SHIP_FOAM_CAP` (24) ships. Nothing bounds the NPC count in the game, so
  the fill order is fixed by id (players first, then NPCs) and the registry
  warns once when ships are left out. The hull is a segment of half the hull
  length along the heading; foam falls off to nothing half a hull length
  out, extends astern with speed as a wake, and a ship at anchor keeps a
  light ring. Distances wrap east–west.

*Foam above the island.* The water plane stops showing where the land mesh
rises above the waterline, so on its own the wash was cut off at the beach.
The land material (`useLandTerrain.ts`) therefore carries a second patch
after the caustics one (`shoreFoamLand.ts`): the same wash, by the baked
coast distance (`beachWashBand`, up to ~6 m of sand at the flood, and none
where the field still reads water: there it cannot say how far the real
waterline is, and the field and the mesh disagree in places), on the
shared surf-clock uniform, with the same lace, only above sea level, put in
as the fragment's diffuse albedo so three's own lighting shades it like the
sand. No extra pass and no change to the water's depth test. The field
texture is built once per map (`useTerrainFieldTexture.ts`) and handed to
both.

**Geometry (#38 step 8).** Until this step the sea was a flat plane whose
waves were all in the normals. It is now a mesh that the large cascades
displace.

- *Grid* (`oceanGrid.ts`). Five concentric level-of-detail rings under the
  camera focus: a square of 0.1-unit cells (6.5 m, about one texel of the
  swell cascade) out to 8 units, then annuli to 16 / 32 / 64 / 96 units with
  0.2 / 0.4 / 0.8 / 1.6-unit cells; 25.9k + 20k + 20k + 20k + 8.7k = 94.6k
  vertices, 184k triangles, one mesh per ring on one material so the rings
  off screen at ship zoom are frustum-culled. The outer ring reaches 95.2
  units from the focus after snapping, against the 80.5 the camera can see
  at full zoom-out on a 4:1 screen (`oceanGridReach`); the inner ring 7.2
  against the 6.6 of the closest ship zoom at 16:9. Where a ring meets the
  finer ring inside it, its edge cells are split into fans through the finer
  ring's boundary vertices, so there are no T-junctions and the displaced
  mesh cannot crack (the test counts every inner edge in two triangles and
  every boundary edge in one). Every vertex is an integer number of base
  cells converted once, so a shared vertex is the same float in both rings.
- *Snapping.* The grid moves only in whole multiples of the coarsest cell
  (1.6 units, `snapToCell`); every finer cell divides it, so after a pan each
  ring's vertices land on the same world lattice they left and sample the
  same displacement: nothing swims. Each ring is built half a coarse cell
  larger than it needs. On a wrapping map the one grid serves every copy of
  the world, as the plane did.
- *Displacement* (`waveDisplacement.ts`). The swell and the chop
  (`DISPLACEMENT_CASCADES`, 83% and 16% of the height variance) move the
  mesh; the ripple (0.3%, waves under 3.2 m and a few centimetres high)
  keeps contributing normals only. Each displacing cascade's FFT carries two
  more packed spectra in its own blocks of the working atlas, P = h̃ (1 −
  λ kx/|k|) and Q = i λ kz/|k| h̃ (`waveCascade.ts`), and a second output
  pass writes (h, Dx, Dz) in metres into a mipmapped tile texture: the
  height and Tessendorf's choppy pull toward the crests with the whitecaps'
  λ, so the sharpened crests and the foam on them agree. A vertex reads each
  texture with `textureLod` at log2(cell / texel) + 0.5 (`displacementLod`),
  so waves the mesh cannot carry are averaged away rather than aliased; a
  band whose longest wave spans under four cells fades out as it does for
  the normals, and everything fades to flat with distance like the normals.
  Vertices two rings share carry the finer ring's cell in the `gridCell`
  attribute, so both sample them alike. The height is drawn as it is
  (`WAVE_HEIGHT_GAIN` = 1): the displaced bands' significant height is 1.56 m
  (`DISPLACED_SIGNIFICANT_HEIGHT_METRES`), 0.024 units
  (`WAVE_CREST_BOUND_UNITS`), which pads the rings' culling bounds. At the
  closest ship zoom (~0.003 units per pixel) typical crests move the surface
  2–4 pixels: the water laps a static hull as it would round a ship that is
  not yet heaving (step 11).
- *Shallows.* The displacement is scaled by `shallowDisplacementDamping` of
  the seabed's depth from the terrain field: a smoothstep from nothing at the
  waterline (and on land) to full at twice the breaking depth
  (`DISPLACEMENT_FULL_DEPTH_METRES`, ≈ 4 m). Shoreward of the breaker line
  the real sea is a broken bore whose height is bounded by the depth; the
  test keeps the damped significant height under the depth all the way in
  (0.07 m at 0.5 m, 0.24 m at 1 m, 0.78 m at 2 m), so a trough never reaches
  the sand and the surface never lifts over the beach.
- *Fragment side.* `vWorld` is the displaced point: the view ray, the
  refraction trace and the Beer–Lambert path measure the water's depth from
  it (a crest looks through more water than a trough). The wave slope and
  whitecap look-ups keep the rest point (`vRestXZ`), so the slope and foam
  textures stay attached to the surface the displacement moved. The shore
  bands keep the seabed's depth below sea level: the breaker line and the
  wash are contours of the bathymetry and hold still while the surface
  heaves over them, and the damping is zero at the waterline, so they still
  meet the land's wash there.
- *Grid lines.* The water hex grid sits 0.01 units (0.65 m) above sea level,
  lower than most swell crests, so its lines ride the same displacement
  (`hexOutlineMaterial.ts`; edges went from 4 to 8 segments, so a line
  follows the swell between its vertices). Each line vertex reads it at the
  level of detail of the sea ring under it (`oceanGridCellAt`, from the
  rings' snapped origin), not of its own 8 m segment: a coarse ring averages
  away the swell its cell cannot carry (the 0.8-unit ring keeps about a
  quarter of a 48 m wave's height, an 8 m segment nine tenths), so a line
  read at its own segment rode a swell the water there
  did not draw, dipped under the opaque surface in the troughs and floated
  above it on the crests at map zoom. Reduced motion freezes the wave clock,
  which freezes the cascade textures, and with them the displacement.
- *Shadows.* The sea neither casts nor receives, and the crest bound is
  under a tenth of the shadow box's caster and receiver margins
  (`atmosphere.test.ts`), so `shadowFit.ts` is unchanged.

---

## 4. Sun Shadows (SunLight.tsx, shadowFit.ts)

One directional sun (`atmosphere.ts`: 55° up, 48° to screen left, 70 units
from the camera target) casts every shadow from one 4096² map through an
orthographic shadow camera. Islands, ships, palms and rocks cast; the land
and seabed meshes, ships and rocks receive (palms don't: their thin
double-sided fronds shadow themselves into acne). The seabed receives in the
prepass too, so hull shadows show through the water.

**Fit (#48).** The shadow box follows the camera target and is sized to the
view each frame by the pure maths in `shadowFit.ts`. A caster and its shadow
lie on the same light ray, so covering the receivers on screen covers the
casters that matter, and a receiver `y` off the sea plane is displaced
across the box by |y| × cos elevation. Two layers of receiver bound the
half-extent, and the larger wins: the furthest visible point of the sea
plane (`groundViewReach` in `cameraBounds.ts`, for the live camera distance
and viewport aspect) plus `SHADOW_CASTER_HEIGHT` × cos elevation for hill
tops and decks; and the furthest visible point of the deepest seabed that
can be seen (`groundViewReach` followed on to a plane `SHADOW_RECEIVER_DEPTH`
down, without refraction, so on the safe side) plus that depth × cos
elevation, because the seabed receives too and lies beyond the sea along
the far top-corner ray. That depth is the water's `SEABED_FADE_END` (95 m,
~1.46 units, §3), where the shader has fully faded the seabed out, not the
seabed floor (~1.9 units): a shadow on seabed deeper than the fade end can
never be seen (the seabed mesh stops shallower still, at
`VISIBLE_SEABED_DEPTH`), and covering it would cost ship-zoom texels for
nothing. The partly faded seabed above the fade end is covered. The result
is clamped to `[SHADOW_EXTENT_MIN, SHADOW_EXTENT]` = [4, 25]. Tall and deep
things also widen the depth range, which `shadowDepthRange` checks against
the near and far planes (0.5 and 150) in `atmosphere.test.ts`. At full
zoom-out (distance 28) the 16:9 view reaches ~43 units across the sea, so
the box sits at the 25-unit cap, as before: 50 units across, a 0.79 m texel.
From ship zoom (distance 3.5–4.3; `CAMERA_MIN_DISTANCE`, 4.32, is as close
as the zoom allows on every map size) the seabed term sets the box: it fits to 10.2–11.4
units, a 0.32–0.36 m texel, 2.2–2.5× finer than the cap. The top-corner ray
descends at only ~24°, so the 1.46 units of seabed depth add ~4 units of
reach; without the seabed the box would be 6.8–8.1 units. From ship zoom up
to distance ~13, where the cap takes over, the texel is 1.2–1.9 screen
pixels at the focus (1080 rows), and the PCF disc smooths what is left at
every zoom. The fixed box was sized for the cap
at every zoom, which is why hull and palm shadows stepped close up. Because
the cap sets the map-zoom texel, the map stays at 4096: 2048 would double
it. One box covers mid zoom too, so there are no cascades.

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
| `docs/adr/0001-one-terrain-height-field.md` | The decision: one height field, driven by cell elevation |
| `src/board/visuals/terrainHeightField.ts` | The height field: coast distance, seabed, blended elevation, relief; `sampleHeight` |
| `src/board/visuals/sharedTerrainField.ts` | The map's one field, built once per `cells` array and wrap |
| `src/board/visuals/perMapCache.ts` | Once-per-map builds derived from the field (bake, land mesh, decoration layout) |
| `src/board/visuals/seamStrip.ts` | The one-wrap-wide strip a wrapping map's field and meshes are built over |
| `src/board/visuals/periodicNoise.ts` | Simplex noise for the coast, relief and reef crest; periodic on a wrapping map |
| `src/board/visuals/seabedProfile.ts` | The seabed's depth by coast distance, in metres: beach face, shelf, drop-off |
| `src/board/visuals/reefMask.ts` | Reef mask and outward normal, for the bake and the coral |
| `src/board/visuals/worldScale.ts` | Metres per world unit (65) and the conversions |
| `src/board/visuals/terrainFieldTexture.ts` | Bakes the field to RGBA half-float texels; `TERRAIN_FIELD_GLSL` read helpers |
| `src/board/visuals/useTerrainFieldTexture.ts` | The terrain field texture, once per map, for the water and the land |
| `src/board/visuals/landMesh.ts` | The land and seabed lattice mesh, face colours, `landSurface` |
| `src/board/visuals/useLandTerrain.ts` | Land and seabed geometry and materials, once per map |
| `src/board/visuals/LandTerrain.tsx` | Draws the land and seabed meshes for one world copy |
| `src/board/visuals/seabedPrepass.ts` | The seabed layer and the prepass the water reads its depth from |
| `src/board/visuals/groundPlacement.ts` | Standing props on the field: footprint probes, nudging, `groundTopY` |
| `src/board/visuals/decorationLayout.ts` | Where every decoration and port piece stands, once per map |
| `src/board/visuals/useDecorationLayout.ts` | The layout plus the palms' and shrubs' GPU resources |
| `src/board/visuals/TerrainDecorations.tsx` | Draws the decorations for one world copy |
| `src/board/visuals/portSettlement.ts` | Port buildings on the drawn land surface and the quay |
| `src/board/visuals/quayPlacement.ts` | The stone quay at each pier root |
| `src/board/visuals/pierPlacement.ts` | Where the pier meets the drawn beach |
| `src/board/visuals/shoreBoulders.ts` | Boulders along the noisy waterline, from the coast distance |
| `src/board/useHexGrid.ts` | Port labels and hover volumes lifted to the field's ground |
| `src/board/useWaterGridLines.ts` | The water hex grid's lines, faded by coast distance near the shore |
| `src/board/visuals/Ocean.tsx` | Water: the displaced ring grid, refraction, water colour, waves, glint, foam |
| `src/board/visuals/oceanGrid.ts` | The sea's mesh: stitched level-of-detail rings, snapping, coverage |
| `src/board/visuals/waveDisplacement.ts` | Which cascades displace, the height gain, shallow damping, the vertex-stage GLSL |
| `src/board/visuals/waterOptics.ts` | Water optics: absorption, Fresnel, vector Snell, the refraction bound |
| `src/board/visuals/waveSlopeGlsl.ts` | The cascade slope and whitecap look-ups shared by the water and the seabed |
| `src/board/visuals/waveCascade.ts` | One FFT cascade: spectrum, slopes, stretch and displacement spectra |
| `src/board/visuals/waveCascadeShaders.ts` | The cascades' GPU passes: spectrum, FFT stage, slope, displacement and whitecap outputs |
| `src/board/visuals/useWaveCascades.ts` | Runs the FFT cascades, the displacement outputs and the whitecap accumulators on the GPU |
| `src/board/hexOutlineMaterial.ts` | The water hex grid's lines, floating on the displaced sea |
| `src/board/visuals/whitecapFoam.ts` | Whitecap maths: Jacobian, fold threshold, accumulation step |
| `src/board/visuals/shoreFoam.ts` | Shore, breaker and reef bands; the wash up the beach; windward weight |
| `src/board/visuals/shoreFoamLand.ts` | Patches the land material so the wash runs up the sand |
| `src/board/visuals/hullFoam.ts` | Contact foam around a hull |
| `src/board/shipFoamSources.ts` | Ships' animated positions for the hull foam |
| `src/board/visuals/foamShading.ts` | Foam union, lace, detail fade, radiance; the surf pulse and churn noise |
| `src/board/visuals/causticFocus.ts` | Caustic maths: focus matrix, Hessian, intensity, depth and LOD fades |
| `src/board/visuals/seabedCaustics.ts` | Patches the seabed material so its sunlight is focused by the waves |
| `src/board/visuals/SunLight.tsx` | The shadow-casting sun: fits, refits and snaps its shadow box to the view |
| `src/board/shadowFit.ts` | Shadow box maths: extent from the view's reach, texel, biases, refit hysteresis, depth range |
| `src/board/visuals/atmosphere.ts` | Sun, sky, haze, shadow and post-processing constants |
| `src/board/Board.tsx` | Scene composition |
| `src/board/HexGrid.tsx` | Water hex hit-testing, hover highlights, port labels and hover volumes for one world copy |

---

## Terrain Constants

World units unless stated; a hex is 1 unit in circumradius, 65 m per unit
(`worldScale.ts`). All are exported from the file named.

| Constant | Value | Where |
|----------|-------|-------|
| `SEA_LEVEL` | 0 | `terrainHeightField.ts` |
| `ELEVATION_HEIGHTS` | {1: 0.3, 2: 0.75, 3: 1.4} (beach, jungle, mountain) | `terrainHeightField.ts` |
| `RELIEF_AMPLITUDES` | {1: 0.05, 2: 0.16, 3: 0.5} | `terrainHeightField.ts` |
| `COAST_NOISE_AMPLITUDE` | 0.25 (must stay under the hex inradius, √3/2) | `terrainHeightField.ts` |
| `LAND_MESH_SPACING` | 0.15 | `landMesh.ts` |
| `LAND_MESH_SKIRT_DEPTH` | `VISIBLE_SEABED_DEPTH` (~90 m) in units | `landMesh.ts`, `waterOptics.ts` |
| `TERRAIN_TEXELS_PER_UNIT` | 12 (~5.4 m per texel) | `terrainFieldTexture.ts` |
| `TERRAIN_TEXTURE_MAX_SIZE` | 1280 per side | `terrainFieldTexture.ts` |
| `MIN_GROUND_HEIGHT` | `SEA_LEVEL` + 0.03 | `groundPlacement.ts` |

The shore ramp (0.9), the beach toe (0.18), the coast-distance clamp (4), the
bounds padding (5), the reef crest (2 ± 0.9 m) and the relief noise are
module-private in `terrainHeightField.ts`; §1 gives their meaning.
