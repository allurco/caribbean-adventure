import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { buildRockGeometry, ROCK_VARIANT_COUNT } from "./rockGeometry";
import { rockVariation } from "./rockVariation";
import { RockVariantMesh, type RockInstance } from "./RockVariantMesh";
import type { DecorationData } from "./useDecorationLayout";

/** One shared geometry per faceted variant; the rocks never change shape. */
const ROCK_GEOMETRIES: readonly BufferGeometry[] = Array.from({ length: ROCK_VARIANT_COUNT }, (_, i) => {
  const data = buildRockGeometry(i);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  return geometry;
});

// White, so `instanceColor` (the biome's base colour times the rock's tint) is the whole colour.
const ROCK_MATERIAL = new MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.95,
  metalness: 0,
});

interface RocksProps {
  rocks: readonly DecorationData[];
  stones: readonly DecorationData[];
}

/** Groups the generator's rocks and the derived stones by faceted variant. */
function groupByVariant(rocks: readonly DecorationData[], stones: readonly DecorationData[]): RockInstance[][] {
  const groups: RockInstance[][] = Array.from({ length: ROCK_VARIANT_COUNT }, () => []);
  const add = (d: DecorationData, variation: RockInstance["variation"]) =>
    groups[variation.variant].push({ worldX: d.worldX, worldY: d.worldY, worldZ: d.worldZ, variation });
  for (const rock of rocks) add(rock, rockVariation(rock));
  for (const stone of stones) add(stone, rockVariation(stone, "small"));
  return groups;
}

/** Every rock and stone on the map, one instanced draw per variant (per world copy). */
export function Rocks({ rocks, stones }: RocksProps) {
  const groups = useMemo(() => groupByVariant(rocks, stones), [rocks, stones]);
  return (
    <>
      {groups.map((group, variant) => (
        <RockVariantMesh key={variant} geometry={ROCK_GEOMETRIES[variant]} material={ROCK_MATERIAL} rocks={group} />
      ))}
    </>
  );
}
