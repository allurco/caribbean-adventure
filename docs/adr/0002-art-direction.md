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
