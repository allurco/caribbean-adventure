---
status: accepted
---

# Art direction: stylised ambience, photoreal only in the water and the light

The game is a turn-based strategy board. The scene is there to give it ambience and to make the map and ship zooms inviting without competing with the HUD; it is not a photorealistic action game. The first islands and props were flat-faceted low-poly, and once the ocean was rebuilt as physically based water (#38) the two clashed. Toy-like kit styles were tried and read as too toyish; fully realistic props would lose what makes the game look like itself. We decided that **photorealism is confined to the water and the light**, and everything standing in them (islands, rocks, plants, ports, ships) is stylised, in a mid-poly register one notch above pure low-poly.

## Decision

- **Water and light are physically based.** The ocean uses real wave spectra, absorption, Fresnel and sun reflection (#38); the sun, shadows and tone mapping are realistic. Stylised palette ramps for the water are not revisited.
- **Everything else is stylised mid-poly ("notch up").** The silhouette and colour language stay chunky and bold, with exaggerated proportions. Surface fidelity goes one step up from flat facets: denser lattices on organic shapes with smooth normals and a crease angle (about 35°) so only real edges stay hard, bevelled walls and roof slabs, baked ambient occlusion at the ground and under the eaves, and per-piece colour jitter. No photo textures and no PBR realism on terrain or props; colour comes from vertex colours.
- **Our own models, authored in code.** Pieces are built with the facet builder in TypeScript, not downloaded or traced from a kit. A commercial stylised pirate environment pack is the reference for mood and register only; nothing is copied from it. Exporting to GLB is an optional last step, not the source of truth.
- **Ports read as weathered sixteenth-century stone and timber.** Clean, uniform slabs are rejected. Walls carry coursed or worn stone, coral limestone, grime at the foot and moss low down; roofs are terracotta in varied tones; timber is aged.
- **Each port needs a landmark readable at map zoom.** A tall tower, church or fort must stand out of the town's roofline so a port is found from the map view, not only at ship zoom.
- **Ground features are terrain.** Streets, squares, terraces and paths shape the land surface itself and carry their paving with real depth (ADR 0001's one height field). Flat ribbons or decals laid over the land are rejected; if a feature cannot be carved into the field, it is dropped.
- **The camera is fixed.** It looks due north at a fixed pitch of about 47° down and only pans and zooms. Every piece is designed to read from that angle; anything taller than its surroundings on the south side of a port hides the port.
- **Picture scale** is set by ADR 0003.

## Considered options

- **Stylised water to match the low-poly islands.** Rejected: toon ramps, however well tuned, did not give clear turquoise water with a visible seabed, layered waves and sky reflection.
- **Keep pure flat-faceted low-poly for the land.** Rejected: next to the realistic water it reads as cheap.
- **Realistic props and terrain to match the water.** Rejected: it loses the game's own look and competes with the HUD.
- **Toy-style asset kits.** Rejected as too toyish, and bought or traced kits are not our own work.

## Consequences

- Every new prop and building is built at the notch-up setting; older rocks, palms and shrubs get a matching pass (#71).
- Art direction in issues points here instead of being restated per issue.
- The fixed camera means view-line checks (does this hide the port?) are part of placing anything tall near a port.

## Amendments

### (b) All light from one time of day (#158, #169)

All of the scene's light derives from one pure input, the time of day: `lightingFor(timeOfDay)` (`src/board/visuals/lighting.ts`) returns the sun (direction, colour, intensity), the fill, the sky the environment map is baked from, the haze, the exposure and colour grade, bloom and vignette, and the sea's reflection tint. No other module holds a lighting value; a source-scan test keeps it so.

- **V1 and async games are fixed at golden hour** (`GOLDEN_HOUR`) on every client and every seed: a low (~22°), warm (~3200 K) sun ahead and to the right of the camera, faces turned from it kept warm and readable (a warm sand-bounce fill from behind the camera and a warm ambient, near half the light of sunlit ground), turquoise shallows, a warmer grade. Lighting is not a variety axis; a per-seed mood would perturb `lightingFor`'s output, never add a second lighting path.
- **Day and night come later, for live games only**: the time then comes from the shared game clock, never a local one, and only the input changes, not the consumers. Night needs lit windows, port lights and ship lanterns (emissive and bloom), so village and ship pieces export window and lantern positions from the start.
- The sun now sits ahead-right, not ahead-left: its glare lies over the upper-right sea and the shadows fall towards the lower left. The light stays physically based, as decided above; only its time of day is chosen.

### (c) Thatch joins the materials (#158, #181)

The ports' materials are weathered stone, timber and terracotta, and now **thatch**: sun-dried palm and grass thatch, a dull straw (`thatch` in `palette.ts`) darker than the sand, so a thatched roof reads against the beach. The first is the harbour's open-sided market hall (`harbourPieces.ts`); the pirate havens' patched roofs may follow.

- **Vertex colours only**, like every other material: no texture, no PBR maps. The straw reads through the geometry: thick courses laid in steps, each a tone of the colour, a darker underside and drip edge, a bound ridge roll.
- It stays in the village's one material and draw (`PortVillage.tsx`); a thatched piece costs no draw of its own.

### (d) The port town kit is generated by a procedural Blender generator (#392)

The port's buildings, harbour furniture and clutter are built today as code-authored three.js geometry: the facet builder (`src/board/visuals/facetBuilder.ts`) driven by `agedBuildingGeometry.ts`, `villageBuildingGeometry.ts`, `harbourPieces.ts`, `townPieces.ts`, `quayGeometry.ts` and `pierGeometry.ts`. Seen in the prop viewer (`?view=props`, `src/board/propEntries.ts`) the pieces read as primitives, their colour is flat, and the town reads as generic medieval Europe rather than the colonial Caribbean. Getting chunky dressed stone, plank and thatch courses, verandas, shutters and per-nation silhouettes out of hand-written TypeScript vertex lists has proved slow, and every piece costs a review round on geometry defects (#68). The ships hit the same wall and moved to a procedural Blender generator (`boats/`, PRD #130), which now ships four board-variant models held to a budget. We decided that **the town kit moves to a procedural Blender generator too, on the ships' pattern: Python driving Blender, exported as board-variant `.glb` files held to a triangle budget.**

- **Still our own stylised mid-poly models.** The decision above stands: our own models, built in code, at the notch-up register. The "code" is now Python driving Blender rather than TypeScript driving the facet builder. No downloaded, bought, traced or AI-generated models or textures enter the town kit, not even as fittings (unlike the ships' kitbash allowance in `boats/assets/kitbash/README.md`). A reference image sets mood and register only.
- **The generator, not the `.glb`, is the source of truth.** This reverses the line "Exporting to GLB is an optional last step" for the town kit only. Each piece is a `*Params` record (like `FrigateParams` in `boats/frigate/params.py`), validated before a build. The Python sources are tracked. The `.blend` scenes are tracked under the generator's `build/` the way `boats/build/*.blend` are, and the full-size exports, renders and scratch are git-ignored there (`boats/.gitignore`). The board variants the game loads are **committed** under `public/town/`, as the ships' are under `public/ships/`, so neither a clone nor CI needs Blender to build or test the game.
- **Reproducible.** A piece's shape is a pure function of its params and a variant seed (Python's own seeded `random.Random`, never the clock). The generator pins the Blender version it was run with and writes it, with the generator's version and the params' hash, into the glTF `asset.extras`. Re-running an export must reproduce the same triangle count, bounds and named parts. Byte equality is not required, because Blender's exporter does not promise it.
- **Budgets are the game's contract, enforced on both sides.** The generator's pure `board`-style module (on the model of `boats/frigate/board.py`) refuses an export over budget. The game's node test (on the model of `shipAssetCheck.ts` and `shipAssets.node.test.ts`) holds every committed file to the same numbers, to the catalogue, and to the footprint the layout plans with. The per-piece numbers live in the town kit PRD (#392). The whole port layer stays inside #158's budget: at most 4 draws for the map's port layer per world copy (`VILLAGE_DRAWS`), and the triangle and frame budgets measured on the worst seed of a 200-seed sweep.
- **Where the generator lives.** It is a sibling package of the ships' (`boats/town/` beside `boats/frigate/`). It shares their pytest set-up (`boats/conftest.py`, one `uv run --with pytest pytest tests/ -q`), their pure glTF reader (`boats/frigate/gltf.py`), their Blender version and their `build/` rules (`boats/.gitignore`: only `.blend` files tracked, so the town's scenes sit flat as `boats/build/town_*.blend`). That means one toolchain to learn and keep working, not two. The folder's name now undersells it; renaming `boats/` later is a cheap, mechanical change.
- **Vertex colours, one material, no atlas.** Each piece carries its colour as glTF vertex colours (`COLOR_0`), with ambient occlusion at the ground and under the eaves baked into them in Blender. There are no texture images, no atlas and no PBR maps (ADR 0002's "colour comes from vertex colours", and amendment (c)'s thatch rule). Stone, plaster, plank and thatch must read through modelled courses, blocks and boards, each a tone of its colour. That keeps every piece mergeable into the village's one material and draw (`PortVillage.tsx`, `villageMesh.ts`). Per-piece texture sets like the ships' were considered and rejected: they would split the village into a draw per piece.
- **Mixed shading.** Masonry and timber keep hard facets: every block, board and beam edge shows. Thatch rolls, turned posts and balusters are smoothed. The weathering decided above stays on everything: grime at the foot, salt-pale stone, tonal jitter per block, aged timber. The pieces take the reference's chunky diorama proportions, not a toy kit's saturated, clean colour.
- **The layout keeps its job.** The board still decides where every piece stands: the plateau and streets (`townPlateau.ts`), the village (`villageLayout.ts`), the port kit (`portSettlement.ts`), the harbour furniture (`harbourFurniture.ts`) and the clutter (`townDetailLayout.ts`). A model replaces only the geometry a layout already places. Each catalogue entry states the plan footprint, eave reach and height the layout plans with, and the asset check holds the file to them. Origin at the ground contact, real metres, front along glTF +Z (Blender −Y), drawn at the family's factor from `worldScale.ts` (`BUILDING_SCALE`, `LANDMARK_SCALE`, `TOWN_PIECE_SCALE`; ADR 0006).
- **Anchors travel in the file.** Named empty nodes carry what the board reads off a piece: the flag hoist (`Flag_Hoist`) for the tower and the fort, the crane's load pivot, and chimney, window and lantern positions (`Chimney_*`, `Window_*`, `Lantern_*`), which amendment (b) asks every village piece to export for smoke and a later night.
- **Seeded variety survives (ADR 0007).** Variety is split between baked variants and runtime choices:
  - *Baked:* each piece kind ships as a few variant `.glb` files (shape variants and per-nation styles, where the silhouette differs).
  - *Runtime, from `subSeed(G.mapSeed, feature, portId, …)`:* which variant stands where, the yaw jitter, a scale within the kind's band (`PORT_BUILDING_SCALE_RANGE`), and the tints.
  - *Tint channels:* the generator marks the surfaces that take a tint (wall, roof, trim, shutters) in a vertex attribute, and the merge multiplies each by a colour drawn from the port's nation palette (#180). This generalises today's roof range (`roofFrom`/`roofTo` in `villageMesh.ts`).
  - *Unchanged:* the existing feature names in `seedFeatures.ts`, so swapping a mesh reshuffles no placement (S4). Nothing visual enters `G`.
- **The water and the light are untouched.** The photoreal sea (ADR 0004) and the one golden-hour light (amendment (b)) stand. A reference image's faceted water is not adopted.

**Considered options.**
- *Keep authoring in TypeScript and push the facet builder further.* Rejected: it is slow per piece and has not reached the look.
- *Buy or download a stylised town pack, or generate the models with AI.* Rejected: not our own work (ADR 0002), and the look would drift from the ships.
- *Hand-model the pieces in Blender with no generator.* Rejected: no params, no tests, no variants or nation styles without redoing the work, and nothing to hold a budget against.
- *Per-piece baked texture sets, as the ships have.* Rejected for the town: dozens of pieces per port would each need their own material, so the village could no longer be one merged draw.
- *One shared town atlas.* Not adopted: vertex colours with modelled detail are the decision, and an atlas would add UVs and a texture to every merge.
- *A separate top-level generator folder.* Not adopted: it would mean a second pytest set-up, a second glTF reader and a second set of build rules for the same pipeline.

**Consequences.**
- The code-built builders stay as the fallback, used while a model loads or when one fails to load, until every piece of the kit has a model. Then they shrink to plan-sized boxes, like the ship's hull box (`shipHull.ts`).
- Every town model is a scene asset: it is registered in `sceneAssets.ts`, so the loading gate waits for it.
- ADR 0005 (#131, the ships as generated glTF models) is still unwritten. When it lands, it should cover both generators, or this amendment should point to it. #131 also still says the generator "stays outside" the repo, and `boats/` is now inside it. The ADR should say the generators live in the repo.
