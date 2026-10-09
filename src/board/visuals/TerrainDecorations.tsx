import type { Texture } from "three";
import { PalmTrees } from "./PalmTrees";
import { Rocks } from "./Rocks";
import { Shrubs } from "./Shrubs";
import { ShoreBoulderMeshes } from "./ShoreBoulderMeshes";
import { Piers } from "./Piers";
import { Quays } from "./Quays";
import { PortBuildings } from "./PortBuildings";
import { PortVillage } from "./PortVillage";
import type { DecorationLayout } from "./useDecorationLayout";

/**
 * Trees, rocks, stones, shrubs, shore boulders, piers, quays and port
 * buildings for one world copy, from the shared `layout`
 * (`useDecorationLayout`); `waveSlopes` light the submerged boulders through
 * the waves (ShoreBoulderMeshes).
 */
export function TerrainDecorations({ layout: decorationsByType, waveSlopes }: { layout: DecorationLayout; waveSlopes?: readonly Texture[] }) {
  return (
    <>
      <PalmTrees resources={decorationsByType.palms} />

      <Rocks rocks={decorationsByType.rocks} stones={decorationsByType.stones} />

      <Shrubs resources={decorationsByType.shrubs} />

      <ShoreBoulderMeshes boulders={decorationsByType.shoreBoulders} waveSlopes={waveSlopes} />

      <Piers piers={decorationsByType.piers} />

      <Quays quays={decorationsByType.quays} />

      <PortBuildings buildings={decorationsByType.buildings} />

      <PortVillage geometry={decorationsByType.villageGeometry} />
    </>
  );
}
