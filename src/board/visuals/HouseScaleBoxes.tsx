import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import type { MapCell } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { perMapCache } from "./perMapCache";
import { terrainSeedFromCells } from "./terrainHeightField";
import { landSurface } from "./landMesh";
import { decorationLayoutOf } from "./decorationLayout";
import { planPortTowns, villageRejects } from "./houseBoxLayout";
import { BUILDING_SCALE, HEX_METRES } from "./propScale";
import { buildVillageBuilding, VILLAGE_VARIANTS } from "./villageBuildingGeometry";
import { buildTownPiece, TOWN_PIECE_KINDS, TOWN_PIECE_VARIANTS } from "./townPieces";
import { townClutter, townWorks } from "./townDetailLayout";
import { mergeVillage, roofTint, type MergeInstance, type MergeSource } from "./villageMesh";
import { townPieceColors, townWorksColors, villageColors } from "./villageColors";

/** The village's sources: each building variant, then each piece kind's variants, with their indices. */
const sources = (() => {
  const list: MergeSource[] = [];
  const variantIndex = new Map<string, number>();
  for (const v of VILLAGE_VARIANTS) {
    // Two wear seeds per kind, so neighbours differ.
    for (const seed of [0, 1]) {
      const g = buildVillageBuilding(v, villageColors(v), seed);
      variantIndex.set(`${v}:${seed}`, list.length);
      list.push({ data: g.data, roofFrom: g.roofFrom, roofTo: g.roofTo });
    }
  }
  const pieceColors = townPieceColors();
  for (const kind of TOWN_PIECE_KINDS) {
    for (let variant = 0; variant < TOWN_PIECE_VARIANTS[kind]; variant++) {
      variantIndex.set(`${kind}#${variant}`, list.length);
      list.push({ data: buildTownPiece(kind, pieceColors, variant) });
    }
  }
  return { list, variantIndex };
})();

const villageOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap) => {
  const field = sharedTerrainField(cells, wrap);
  const layout = decorationLayoutOf(cells, wrap);
  const kit = { buildings: layout.buildings, quays: layout.quays, piers: layout.piers, plateaus: field.townPlateaus };
  const started = performance.now();
  const ground = landSurface(field);
  const seed = terrainSeedFromCells(cells);
  const { buildings, ports } = planPortTowns(cells, ground, kit, seed);
  const hasPlateaus = (field.townPlateaus?.length ?? 0) > 0;
  const clutter = hasPlateaus ? townClutter(ports, ground, BUILDING_SCALE, seed) : [];
  const works = hasPlateaus ? [townWorks(ports, ground, BUILDING_SCALE, townWorksColors())] : [];
  const instances: MergeInstance[] = [
    ...buildings.map((b, i) => ({
      source: sources.variantIndex.get(`${b.variant}:${i % 2}`) ?? 0,
      x: b.worldX,
      y: b.worldY,
      z: b.worldZ,
      yaw: b.yaw,
      scale: b.scale,
      tint: b.tint,
      roofTint: roofTint(b.roofTone),
    })),
    ...clutter.map((c) => ({ source: sources.variantIndex.get(`${c.kind}#${c.variant}`) ?? 0, x: c.x, y: c.y, z: c.z, yaw: c.yaw, scale: c.scale })),
  ];
  const merged = mergeVillage(sources.list, instances, works);
  const houses = buildings.filter((b) => b.kind === "house").length;
  const count = (kind: string) => clutter.filter((c) => c.kind === kind).length;
  // The #84 report reads these from the console.
  console.info(
    `[#84] hexMetres=${HEX_METRES}: ${houses} houses + ${buildings.length - houses} warehouses on ${ports.length} ports, ` +
      `${clutter.length} clutter pieces, ${(merged.vertexCount / 3).toFixed(0)} village triangles (works ${((works[0]?.vertexCount ?? 0) / 3).toFixed(0)}), laid out in ${(performance.now() - started).toFixed(0)} ms`
  );
  console.info(`[#84] village spots refused: ${JSON.stringify(villageRejects)}`);
  console.info(
    `[#84] variants: ${VILLAGE_VARIANTS.map((v) => `${v} ${buildings.filter((b) => b.variant === v).length}`).join(", ")}; clutter: ${TOWN_PIECE_KINDS.map((k) => `${k} ${count(k)}`).join(", ")}`
  );
  for (const port of cells.filter((c) => c.hasPort)) {
    const [x, , z] = hexToWorld(port.hex);
    const mine = (b: { worldX: number; worldZ: number }) => Math.hypot(b.worldX - x, b.worldZ - z) < 1;
    const here = buildings.filter(mine);
    const h = here.filter((b) => b.kind === "house").length;
    console.info(`[#84] ${port.portName}: ${h} houses, ${here.length - h} warehouses; kit ${layout.buildings.filter(mine).map((b) => b.kind).join(", ")}`);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(merged.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(merged.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(merged.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
});

const VILLAGE_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });

/** The #83/#84 prototypes' port village: every building, its clutter and the town's walls and kerbs, one merged draw per world copy. */
export function HouseScaleBoxes({ cells, wrap }: { cells: readonly MapCell[]; wrap: MapWrap }) {
  const geometry = useMemo(() => villageOf(cells, wrap), [cells, wrap]);
  return <mesh geometry={geometry} material={VILLAGE_MATERIAL} castShadow receiveShadow />;
}
