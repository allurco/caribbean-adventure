/**
 * The port villages as one mesh (#87). Pure, no Three.js: every village
 * building (`villageLayout.ts`), every piece of the towns' clutter and their
 * retaining walls and kerbs (`townDetailLayout.ts`), and the harbours'
 * cranes, market halls and quay flags (`harbourFurniture.ts`, #181) merged
 * into one vertex-coloured soup (`villageMesh.ts`); the cranes' loads, which
 * sway, in a second mesh of their own (`craneSway.ts`). Built once per map
 * and drawn once per world copy (`PortVillage.tsx`): `VILLAGE_DRAWS` draws.
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
import { PORT_NATIONS } from "../../game/types";
import { buildCrane, buildCraneLoad, buildMarketHall, buildQuayFlag } from "./harbourPieces";
import { harbourPieceColors } from "./villageColors";
import { craneLoadGeometry, type CraneLoadGeometry } from "./craneSway";

/** The village layer's meshes, one draw each per world copy (#158: at most 4 for the whole map's port layer). */
export interface VillageMeshes {
  /** Houses, clutter, works, cranes, market halls, quay flags. */
  village: FacetGeometryData;
  /** The cranes' loads, swung in the vertex shader. */
  loads: CraneLoadGeometry;
}
/** How many draws the village layer costs per world copy, whatever the map. */
export const VILLAGE_DRAWS = 2;

/** Wear seeds per house kind, so neighbours of one kind differ. */
const WEAR_SEEDS = 2;

/** Every model the village places, built once: each house kind in each wear, then each piece kind's variants. */
let sourcesBuilt: { list: MergeSource[]; index: Map<string, number>; load: FacetGeometryData } | undefined;
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
  const harbour = harbourPieceColors();
  index.set("crane", list.length);
  list.push({ data: buildCrane(harbour) });
  index.set("marketHall", list.length);
  list.push({ data: buildMarketHall(harbour) });
  for (const nation of PORT_NATIONS) {
    index.set(`flag:${nation}`, list.length);
    list.push({ data: buildQuayFlag(nation, harbour) });
  }
  sourcesBuilt = { list, index, load: buildCraneLoad(harbour) };
  return sourcesBuilt;
}

/** The villages of a decoration layout, their works standing on `ground` (the drawn land) and seeded from `worldSeed` (`G.mapSeed`): the soup and the loads. */
export function villageGeometry(layout: Pick<DecorationPlacements, "village">, ground: GroundField, worldSeed: number): VillageMeshes {
  const { list, index, load } = sources();
  const at = (key: string): number => {
    const i = index.get(key);
    if (i === undefined) throw new Error(`no village model ${key}`);
    return i;
  };
  const { buildings, clutter, ports, furniture } = layout.village;
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
    ...furniture.flatMap((f) => [
      ...f.cranes.map((c) => ({ source: at("crane"), x: c.x, y: c.y, z: c.z, yaw: c.yaw, scale: c.scale })),
      ...(f.hall ? [{ source: at("marketHall"), ...f.hall }] : []),
      // The quay's flag; the tower's flies with the tower (`PortBuildings.tsx`).
      ...f.flags.flatMap((g) => (g.mount === "quay" && g.foot ? [{ source: at(`flag:${g.nation}`), x: g.foot[0], y: g.foot[1], z: g.foot[2], yaw: g.yaw, scale: g.scale }] : [])),
    ]),
  ];
  return {
    village: mergeVillage(list, instances, [townWorks(ports, ground, BUILDING_SCALE, townWorksColors(), worldSeed)]),
    loads: craneLoadGeometry(
      furniture.flatMap((f) => f.cranes),
      load
    ),
  };
}

/** `villageGeometry` for a map, once per map, wrap and world seed (`perMapCache`). */
export const villageGeometryOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap, worldSeed: number) =>
  villageGeometry(decorationLayoutOf(cells, wrap, worldSeed), landSurface(sharedTerrainField(cells, wrap, worldSeed)), worldSeed)
);
