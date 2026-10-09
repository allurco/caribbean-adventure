/**
 * The port villages as one mesh (#87). Pure, no Three.js: every village
 * building (`villageLayout.ts`), every piece of the towns' clutter and their
 * retaining walls and kerbs (`townDetailLayout.ts`) merged into one
 * vertex-coloured soup (`villageMesh.ts`), built once per map and drawn
 * once per world copy (`PortVillage.tsx`).
 */
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import type { FacetGeometryData } from "./facetBuilder";
import type { GroundField } from "./groundPlacement";
import { decorationLayoutOf, type DecorationPlacements } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { perMapCache } from "./perMapCache";
import { sharedTerrainField } from "./sharedTerrainField";
import { townWorks } from "./townDetailLayout";
import { buildTownPiece, TOWN_PIECE_KINDS, TOWN_PIECE_VARIANTS } from "./townPieces";
import { buildVillageBuilding, VILLAGE_VARIANTS } from "./villageBuildingGeometry";
import { townPieceColors, townWorksColors, villageColors } from "./villageColors";
import { mergeVillage, roofTint, type MergeInstance, type MergeSource } from "./villageMesh";
import { BUILDING_SCALE } from "./worldScale";

/** Wear seeds per house kind, so neighbours of one kind differ. */
const WEAR_SEEDS = 2;

/** Every model the village places, built once: each house kind in each wear, then each piece kind's variants. */
let sourcesBuilt: { list: MergeSource[]; index: Map<string, number> } | undefined;
function sources() {
  if (sourcesBuilt) return sourcesBuilt;
  const list: MergeSource[] = [];
  const index = new Map<string, number>();
  for (const variant of VILLAGE_VARIANTS) {
    for (let wear = 0; wear < WEAR_SEEDS; wear++) {
      const g = buildVillageBuilding(variant, villageColors(variant), wear);
      index.set(`${variant}:${wear}`, list.length);
      list.push({ data: g.data, roofFrom: g.roofFrom, roofTo: g.roofTo });
    }
  }
  const colors = townPieceColors();
  for (const kind of TOWN_PIECE_KINDS) {
    for (let variant = 0; variant < TOWN_PIECE_VARIANTS[kind]; variant++) {
      index.set(`${kind}#${variant}`, list.length);
      list.push({ data: buildTownPiece(kind, colors, variant) });
    }
  }
  sourcesBuilt = { list, index };
  return sourcesBuilt;
}

/** The villages of a decoration layout, their works standing on `ground` (the drawn land), as one soup. */
export function villageGeometry(layout: Pick<DecorationPlacements, "village">, ground: GroundField): FacetGeometryData {
  const { list, index } = sources();
  const at = (key: string): number => {
    const i = index.get(key);
    if (i === undefined) throw new Error(`no village model ${key}`);
    return i;
  };
  const { buildings, clutter, ports } = layout.village;
  const instances: MergeInstance[] = [
    ...buildings.map((b, i) => ({
      source: at(`${b.variant}:${i % WEAR_SEEDS}`),
      x: b.worldX,
      y: b.worldY,
      z: b.worldZ,
      yaw: b.yaw,
      scale: b.scale,
      tint: b.tint,
      roofTint: roofTint(b.roofTone),
    })),
    ...clutter.map((c) => ({ source: at(`${c.kind}#${c.variant}`), x: c.x, y: c.y, z: c.z, yaw: c.yaw, scale: c.scale })),
  ];
  return mergeVillage(list, instances, [townWorks(ports, ground, BUILDING_SCALE, townWorksColors())]);
}

/** `villageGeometry` for a map, once per map and wrap (`perMapCache`). */
export const villageGeometryOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap) =>
  villageGeometry(decorationLayoutOf(cells, wrap), landSurface(sharedTerrainField(cells, wrap)))
);
