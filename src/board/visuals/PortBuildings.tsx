import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import { buildBuildingGeometry, BUILDING_KINDS, type BuildingColors, type BuildingKind } from "./buildingGeometry";
import type { PortBuilding } from "./portSettlement";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/**
 * Colours per kind, picked to read against sand and grass at map zoom: a
 * timber warehouse and a stone tower under terracotta, whitewashed tavern
 * and house, the house under dark shingles.
 */
function buildingColors(kind: BuildingKind): BuildingColors {
  const timber = rgb("timber");
  const terracotta = rgb("terracotta");
  const whitewash = rgb("whitewash");
  const masonry = rgb("masonry");
  switch (kind) {
    case "warehouse":
      return { wall: [timber[0] * 1.35, timber[1] * 1.35, timber[2] * 1.35], roof: terracotta, timber, stone: masonry };
    case "house":
      return { wall: whitewash, roof: timber, timber, stone: masonry };
    case "tavern":
    case "watchtower":
      return { wall: whitewash, roof: terracotta, timber, stone: masonry };
  }
}

/** One shared geometry per kind; the buildings never change shape. */
const BUILDING_GEOMETRIES: Readonly<Record<BuildingKind, BufferGeometry>> = Object.fromEntries(
  BUILDING_KINDS.map((kind) => {
    const data = buildBuildingGeometry(kind, buildingColors(kind));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
    return [kind, geometry];
  })
) as Record<BuildingKind, BufferGeometry>;

// White with vertex colours; `instanceColor` carries each building's tint on top.
const BUILDING_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });

const tempObject = new Object3D();
const tempColor = new Color();

/** Every building of one kind in one instanced draw, tinted per instance. */
function BuildingKindMesh({ kind, buildings }: { kind: BuildingKind; buildings: readonly PortBuilding[] }) {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    buildings.forEach((b, i) => {
      tempObject.position.set(b.worldX, b.worldY, b.worldZ);
      tempObject.rotation.set(0, b.yaw, 0);
      tempObject.scale.setScalar(b.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
      mesh.setColorAt(i, tempColor.setScalar(b.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buildings]);

  if (buildings.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={buildings.length}
      ref={meshRef}
      args={[BUILDING_GEOMETRIES[kind], BUILDING_MATERIAL, buildings.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/** Every port's buildings, one instanced draw per kind (per world copy). */
export function PortBuildings({ buildings }: { buildings: readonly PortBuilding[] }) {
  const byKind = useMemo(
    () => BUILDING_KINDS.map((kind) => ({ kind, buildings: buildings.filter((b) => b.kind === kind) })),
    [buildings]
  );
  return (
    <>
      {byKind.map(({ kind, buildings }) => (
        <BuildingKindMesh key={kind} kind={kind} buildings={buildings} />
      ))}
    </>
  );
}
