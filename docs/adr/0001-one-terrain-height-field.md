---
status: accepted
---

# One terrain height field, driven by cell elevation

Island rendering had three height models that disagreed: `HexTerrain` drew each land hex as its own dome whose height came from distance to the nearest water hex, while `TerrainDecorations` and `HexGrid` placed trees, rocks, port markers and labels from a fixed per-`elevation` table. Because the domes fell to sea level at every hex rim, islands read as clusters of bubbles. Because the islands are small (3 to 10 hexes), distance-to-water never got past about one hex, so every island rendered as flat sand and the game's `elevation`/`biome` never showed. Decorations sank into or floated above the ground. We decided that the rendered height of terrain comes from **one height field**: a pure function of the map cells and a seed that every visual consumer samples, with each land cell's `elevation` (beach, jungle, mountain) setting its target height.

## Decision

- The height field is computed from `G.cells` and a seed by plain TypeScript with no Three.js dependency, so it can be unit-tested. It exposes `sampleHeight(x, z)` in world space.
- `cell.elevation` is the authority for how high land rises; the game decides what is a mountain, the renderer only shapes it. Heights blend smoothly between neighbouring cells, so an island is one continuous landform with no seam at hex edges.
- The coastline comes from a signed distance to the land/water hex boundary, perturbed with simplex noise, so shores stop tracing hex edges. Distance runs negative under water, which gives the ocean its depth.
- GPU consumers (land surface, ocean depth colour, shore foam) read a texture baked from the same field. CPU consumers (decorations, port markers, labels, anything placed on land) call `sampleHeight` directly. A rendered point on land must sit within a small tolerance of `sampleHeight` at that point.
- `HexTerrain` and the per-`elevation` height tables in `TerrainDecorations` and `HexGrid` are removed once their consumers move to the field.

## Considered options

- **Keep distance-to-water heights (the existing `HexTerrain` and `TerrainHeightmap` model).** Rejected: it ignores the game's elevation, and on islands this small it produces flat sand everywhere.
- **Keep per-hex geometry and just fix the decoration heights.** Rejected: hex seams are what make islands look like bubbles, and the ocean would still have no depth to read.
- **Revive `UnifiedTerrain` and `TerrainHeightmap` unchanged.** Rejected: they use the same distance-to-water height rule and pack the field straight into a Three.js texture, so no CPU code can sample it. Their texture layout and shader can be reused, but the height rule is replaced.

## Consequences

- Rendering may still draw a faceted, low-poly look; flat shading is a material choice, not a reason to build geometry per hex.
- `docs/terrain-system.md` and the terrain section of `CLAUDE.md` describe the old model and must be rewritten when this lands.
- Changing the height rule changes every island at once, so the field gets tests for the invariants above (continuity across land hex edges, height ordered by elevation, sea level at the coastline, negative under water).
