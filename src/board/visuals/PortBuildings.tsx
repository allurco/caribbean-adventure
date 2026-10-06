import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { PORT_NATIONS, type PortNation } from "../../game/types";
import { BUILDING_KINDS, type BuildingKind } from "./buildingGeometry";
import { AGED_TOWER_FLAG_HOIST, buildAgedBuildingGeometry } from "./agedBuildingGeometry";
import { agedBuildingColors } from "./agedBuildingColors";
import { buildNationFlagGeometry } from "./nationFlagGeometry";
import type { FacetGeometryData } from "./facetBuilder";
import type { PortBuilding } from "./portSettlement";

function toGeometry(data: FacetGeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  return geometry;
}

/** One shared geometry per kind; the buildings never change shape. */
const BUILDING_GEOMETRIES: Readonly<Record<BuildingKind, BufferGeometry>> = Object.fromEntries(
  BUILDING_KINDS.map((kind) => [kind, toGeometry(buildAgedBuildingGeometry(kind, agedBuildingColors(kind)))])
) as Record<BuildingKind, BufferGeometry>;

/** One flag geometry per nation, built at the tower's pole top so it shares the tower's instance matrix. */
const FLAG_GEOMETRIES: Readonly<Record<PortNation, BufferGeometry>> = Object.fromEntries(
  PORT_NATIONS.map((nation) => [nation, toGeometry(buildNationFlagGeometry(nation, AGED_TOWER_FLAG_HOIST))])
) as Record<PortNation, BufferGeometry>;

// White with vertex colours; `instanceColor` carries each building's tint on top.
const BUILDING_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
// Flags are cloth: a little less rough, and never tinted.
const FLAG_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0 });

const tempObject = new Object3D();
const tempColor = new Color();

/** Every instance in one instanced draw, placed by the buildings' transforms, tinted per instance unless `tint` is off. */
function InstancedPieces({
  geometry,
  material,
  buildings,
  tint = true,
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  buildings: readonly PortBuilding[];
  tint?: boolean;
}) {
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
      mesh.setColorAt(i, tempColor.setScalar(tint ? b.tint : 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buildings, tint]);

  if (buildings.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={buildings.length}
      ref={meshRef}
      args={[geometry, material, buildings.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/**
 * Every port's buildings, one instanced draw per kind (per world copy),
 * and the nation flags over the watchtowers, one draw per nation present.
 */
export function PortBuildings({ buildings }: { buildings: readonly PortBuilding[] }) {
  const byKind = useMemo(
    () => BUILDING_KINDS.map((kind) => ({ kind, buildings: buildings.filter((b) => b.kind === kind) })),
    [buildings]
  );
  const flagsByNation = useMemo(
    () =>
      PORT_NATIONS.map((nation) => ({
        nation,
        towers: buildings.filter((b) => b.kind === "watchtower" && b.nation === nation),
      })).filter((f) => f.towers.length > 0),
    [buildings]
  );
  return (
    <>
      {byKind.map(({ kind, buildings }) => (
        <InstancedPieces key={kind} geometry={BUILDING_GEOMETRIES[kind]} material={BUILDING_MATERIAL} buildings={buildings} />
      ))}
      {flagsByNation.map(({ nation, towers }) => (
        <InstancedPieces key={nation} geometry={FLAG_GEOMETRIES[nation]} material={FLAG_MATERIAL} buildings={towers} tint={false} />
      ))}
    </>
  );
}
