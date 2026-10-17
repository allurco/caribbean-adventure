/**
 * Where every decoration stands, worked out once per map and shared by
 * every world copy (#36). Pure: the hook in `useDecorationLayout.ts` adds
 * the palm and shrub GPU resources on top of this.
 */
import type { Biome, MapCell, Decoration } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { perMapCache } from "./perMapCache";
import { sharedTerrainField } from "./sharedTerrainField";
import { placeOnGround, type GroundPlacementOptions, type GroundSpot } from "./groundPlacement";
import { ROCK_UNIT_RADIUS } from "./rockGeometry";
import { placeRock } from "./rockPlacement";
import { smallStones } from "./smallStones";
import { pierOrigin, pierStretch } from "./pierPlacement";
import { portBuildings, type PortBuilding } from "./portSettlement";
import { portQuays, type QuayPlacement } from "./quayPlacement";
import { landSurface } from "./landMesh";
import { placeShrubs } from "./shrubPlacement";
import { shoreBoulders, type ShoreBoulder } from "./shoreBoulders";
import { mapCellId } from "./islands";
import { boulderFactor, islandLooksOf, lookOfCell, shrubFactor, treeFactor, type IslandLook } from "./islandLook";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";
import { lerpRange } from "./variationStream";
import { PROP_DENSITY, PROP_SCALE, TOWN_PIECE_SCALE } from "./worldScale";
import { planPortTowns, type PortTownPlan, type VillageBuilding } from "./villageLayout";
import { townClutter, townKeepOut, type PiecePlacement } from "./townDetailLayout";
import { furnishedPlans, harbourFurniture, type PortFurniture } from "./harbourFurniture";
import { townAnchors, type TownAnchors } from "./townAnchors";
import { SHRUB_FOOTPRINT_RADIUS } from "./shrubGeometry";

/** Rock radius at scale 1 (the rock mesh's unit radius). */
export const ROCK_RADIUS = ROCK_UNIT_RADIUS;

// Ground fit at scale 1 (the sink at `PROP_SCALE`; the footprint is scaled per tree). The footprint covers the trunk base plus its lean.
const TREE_PLACEMENT: GroundPlacementOptions = { footprintRadius: 0.06, sink: 0.03 * PROP_SCALE, maxSlope: 0.9 };

/**
 * The generator's trees and rocks are drawn at `PROP_SCALE`, so each on a
 * non-port cell gets `PROP_DENSITY - 1` companions spread over its cell (out
 * to this radius from the centre), and the land is as covered as it was with
 * props that much bigger. The companions draw from the sub-seed of the cell
 * and the decoration's index (`SEED_FEATURES.companions`).
 */
export const COMPANION_SPREAD = 0.75;
/** A companion's scale, as a share of its decoration's. */
export const COMPANION_SCALE_RANGE: readonly [number, number] = [0.8, 1.2];

interface PropSpot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

/**
 * The decoration's own spot and scale, then its companions' (none on a port
 * cell): `PROP_DENSITY - 1` of them times `factor` (its island's look, #177),
 * the first of the stream, so a lower factor only drops the last ones.
 */
function withCompanions(cell: MapCell, index: number, worldSeed: number, own: PropSpot, factor = 1): PropSpot[] {
  const out = [own];
  if (PROP_DENSITY <= 1 || cell.hasPort) return out;
  const [hexX, , hexZ] = hexToWorld(cell.hex);
  const next = stream(subSeed(worldSeed, SEED_FEATURES.companions, mapCellId(cell), index));
  const companions = Math.round((PROP_DENSITY - 1) * factor);
  for (let j = 1; j <= companions; j++) {
    const angle = next() * Math.PI * 2;
    const distance = Math.sqrt(next()) * COMPANION_SPREAD;
    out.push({
      x: hexX + Math.cos(angle) * distance,
      z: hexZ + Math.sin(angle) * distance,
      scale: own.scale * lerpRange(COMPANION_SCALE_RANGE, next()),
      rotation: next() * Math.PI * 2,
    });
  }
  return out;
}

export interface DecorationData {
  type: Decoration["type"];
  worldX: number;
  worldY: number;
  worldZ: number;
  rotation: number;
  scale: number;
  /** Biome of the decoration's cell (rocks size themselves by it). */
  biome?: Biome;
  /**
   * The prop's own sub-seed of the world seed, its look's stream (`palmVariation`,
   * `rockVariation`): keyed by its cell and indices (ADR 0007). 0 on a pier, whose look is fixed.
   */
  seed: number;
  /** A pier's deck length over its authored one, so it reaches the water (`pierStretch`, #176); 1 when absent. */
  stretch?: number;
}

/** Where every decoration stands, worked out once per map and shared by every world copy. */
export interface DecorationPlacements {
  trees: DecorationData[];
  /** The generator's rocks: outcrops sized by their cell's biome. */
  rocks: DecorationData[];
  /** Derived small stones, `PROP_DENSITY` per sand or grass cell without a rock (#49). */
  stones: DecorationData[];
  /** Derived boulders along the waterline, emergent and submerged (#49). */
  shoreBoulders: ShoreBoulder[];
  /** Piers, with the origin at the land end where the beach meets the water (#49): each port's own, then the further ones its harbour gained (#181). */
  piers: DecorationData[];
  /** Derived stone quays, one at each pier's root (#59). */
  quays: QuayPlacement[];
  /** Derived port buildings and watchtowers, from the port flag and the `pier`/`fort` decorations (#49). */
  buildings: PortBuilding[];
  /** Derived bushes and dry tufts on sand and grass cells (#49). */
  shrubs: ReturnType<typeof placeShrubs>;
  /** Each port's village on its town plateau (#87): its houses, its clutter and each port's plan. */
  village: VillageLayout;
}

/** A port village as laid out: the houses, the town's clutter and each port's plan (streets, footprints, plateau). */
export interface VillageLayout {
  buildings: VillageBuilding[];
  clutter: PiecePlacement[];
  /** Each port's plan, its harbour furniture among what it has taken (`furnishedPlans`). */
  ports: PortTownPlan[];
  /** Each port's harbour furniture (#181): further piers, cranes, the market hall, flags. */
  furniture: PortFurniture[];
  /** Where the towns' smoke and lights will be (#181): chimneys, windows, lanterns. */
  anchors: TownAnchors;
}

/** Radii a prop keeps from a town (`townKeepOut`), at scale 1: a tree's crown (so it does not grow through a roof), a rock's body, a shrub's foliage. */
const TREE_TOWN_RADIUS = 0.15;
const ROCK_TOWN_RADIUS = ROCK_UNIT_RADIUS * 1.5;

/** Where each decoration stands on a map (and wrap), seeded from `worldSeed` (`G.mapSeed`, ADR 0007). */
export function decorationLayout(cells: readonly MapCell[], wrap: MapWrap, worldSeed: number): DecorationPlacements {
  const trees: DecorationData[] = [];
  const rocks: DecorationData[] = [];
  const piers: DecorationData[] = [];
  const field = sharedTerrainField(cells, wrap, worldSeed);
  // The port kit stands on the ground as the land mesh draws it (the lattice
  // surface, up to a few hundredths off the smooth field between lattice
  // points), so a wall is never cut into by the drawn sand, and the pier, its
  // quay and the settlement's reserve round the pier root all find the shore
  // on the same surface (#59).
  const drawn = landSurface(field);
  // Each island's look scales its palms, shrubs and shore boulders (#177).
  const looks = islandLooksOf(cells, wrap, worldSeed);
  const byLook = (factor: (look: IslandLook) => number) => (cell: MapCell) => {
    const look = lookOfCell(looks, cell);
    return look ? factor(look) : 1;
  };
  const treesOf = byLook(treeFactor);

  for (const cell of cells) {
    if (!cell.decorations || cell.decorations.length === 0) continue;
    const id = mapCellId(cell);

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const anchor = { x: hexX, z: hexZ };

    cell.decorations.forEach((deco, index) => {
      const scale = (deco.scale ?? 1) * PROP_SCALE;
      const own: PropSpot = { x: hexX + deco.position[0], z: hexZ + deco.position[2], scale, rotation: deco.rotation };

      // Trees and rocks stand on the height field: nudged off water and
      // cliffs towards the cell centre, or dropped if nowhere fits.
      const standing = (ground: GroundSpot | null, p: PropSpot, seed: number): DecorationData | null =>
        ground && {
          type: deco.type,
          worldX: ground.x,
          worldY: ground.y + deco.position[1] * PROP_SCALE,
          worldZ: ground.z,
          rotation: p.rotation,
          scale: p.scale,
          biome: cell.biome,
          seed,
        };

      switch (deco.type) {
        case "tree": {
          withCompanions(cell, index, worldSeed, own, treesOf(cell)).forEach((p, j) => {
            // A trunk rests on the lowest ground under its base so it never floats.
            const tree = standing(
              placeOnGround(field, p, anchor, { ...TREE_PLACEMENT, footprintRadius: TREE_PLACEMENT.footprintRadius * p.scale }),
              p,
              subSeed(worldSeed, SEED_FEATURES.palmLook, id, index, j)
            );
            if (tree) trees.push(tree);
          });
          break;
        }
        case "rock": {
          withCompanions(cell, index, worldSeed, own).forEach((p, j) => {
            // Rocks stand on the centre height, probed out to their drawn radius (#53).
            const seed = subSeed(worldSeed, SEED_FEATURES.rockLook, id, index, j);
            const rock = standing(placeRock(field, p, anchor, { scale: p.scale, rotation: p.rotation, biome: cell.biome, seed }), p, seed);
            if (rock) rocks.push(rock);
          });
          break;
        }
        // The fort becomes a watchtower among the port buildings (`portBuildings`, below).
        case "pier": {
          // Piers sit at water level; the land end starts where the drawn beach meets the water. A pier is a town piece (#176).
          const origin = pierOrigin(drawn, own, deco.rotation);
          const pierScale = (deco.scale ?? 1) * TOWN_PIECE_SCALE;
          piers.push({
            type: deco.type,
            worldX: origin.x,
            worldY: 0,
            worldZ: origin.z,
            rotation: deco.rotation,
            scale: pierScale,
            seed: 0,
            stretch: pierStretch(drawn, own, origin, deco.rotation, pierScale),
          });
          break;
        }
      }
    });
  }

  const plateaus = field.townPlateaus;
  const buildings = portBuildings(cells, drawn, worldSeed, plateaus);
  const quays = portQuays(cells, drawn, worldSeed);
  // The village gathers round the port kit on its town plateau (#87), and its clutter round both.
  const town = planPortTowns(cells, drawn, { buildings, quays, piers, plateaus }, worldSeed);
  // The harbour's furniture round the houses (#181), then the clutter round both.
  const furniture = harbourFurniture(town.ports, cells, wrap, drawn, buildings, worldSeed);
  const ports = furnishedPlans(town.ports, furniture);
  const clutter = townClutter(ports, drawn, TOWN_PIECE_SCALE, worldSeed);
  const village: VillageLayout = { buildings: town.buildings, clutter, ports, furniture, anchors: townAnchors(town.buildings, furniture) };
  for (const f of furniture) for (const p of f.piers) piers.push({ type: "pier", worldX: p.worldX, worldY: 0, worldZ: p.worldZ, rotation: p.rotation, scale: p.scale, seed: 0, stretch: p.stretch });
  // Trees, rocks, stones, shrubs and boulders stay out of the town's plan, its buildings and its clutter.
  const inTown = townKeepOut(ports, clutter, field.periodX);
  const outside = <T extends { worldX: number; worldZ: number; scale: number }>(items: readonly T[], radius: number) =>
    items.filter((d) => !inTown(d.worldX, d.worldZ, radius * d.scale));
  const keptTrees = outside(trees, TREE_TOWN_RADIUS);
  const keptRocks = outside(rocks, ROCK_TOWN_RADIUS);
  const stones = outside(smallStones(cells, field, worldSeed), ROCK_TOWN_RADIUS);
  // The port kit is placed first so the shrubs keep off it.
  const shrubs = placeShrubs(cells, field, worldSeed, { trees: keptTrees, rocks: keptRocks, stones, piers, quays, buildings }, byLook(shrubFactor)).filter(
    (s) => !inTown(s.worldX, s.worldZ, SHRUB_FOOTPRINT_RADIUS[s.kind] * s.scale)
  );
  const boulders = shoreBoulders(cells, field, wrap, worldSeed, byLook(boulderFactor)).filter((b) => !inTown(b.worldX, b.worldZ, b.reach));

  return { trees: keptTrees, rocks: keptRocks, stones, shoreBoulders: boulders, piers, shrubs, quays, buildings, village };
}

/** `decorationLayout`, once per map, wrap and world seed (`perMapCache`). */
export const decorationLayoutOf = perMapCache(decorationLayout);
