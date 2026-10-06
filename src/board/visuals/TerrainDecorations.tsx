import { PalmTrees } from "./PalmTrees";
import { Rocks } from "./Rocks";
import { Piers } from "./Piers";
import { Quays } from "./Quays";
import { PortBuildings } from "./PortBuildings";
import type { DecorationLayout } from "./useDecorationLayout";

/** Trees, rocks, stones, piers, quays and port buildings for one world copy, from the shared `layout` (`useDecorationLayout`). */
export function TerrainDecorations({ layout: decorationsByType }: { layout: DecorationLayout }) {
  return (
    <>
      <PalmTrees resources={decorationsByType.palms} />

      <Rocks rocks={decorationsByType.rocks} stones={decorationsByType.stones} />

      <Piers piers={decorationsByType.piers} />

      <Quays quays={decorationsByType.quays} />

      <PortBuildings buildings={decorationsByType.buildings} />
    </>
  );
}
