import { Suspense, useEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { PORT_NATIONS, type PortNation } from "../../game/types";
import { BUILDING_KINDS, type BuildingKind } from "./buildingGeometry";
import { AGED_TOWER_FLAG_HOIST, buildAgedBuildingGeometry } from "./agedBuildingGeometry";
import { agedBuildingColors } from "./agedBuildingColors";
import { buildNationFlagGeometry } from "./nationFlagGeometry";
import type { FacetGeometryData } from "./facetBuilder";
import type { PortBuilding } from "./portSettlement";
import { townModelFor, type TownModel } from "../townModels";
import { logTownModelFailure, useTownModelGeometry } from "../useTownModel";

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

/** One geometry per loaded town model, shared by every world copy. */
const MODEL_GEOMETRIES = new WeakMap<FacetGeometryData, BufferGeometry>();

const modelGeometry = (data: FacetGeometryData): BufferGeometry => {
  let geometry = MODEL_GEOMETRIES.get(data);
  if (!geometry) {
    geometry = toGeometry(data);
    MODEL_GEOMETRIES.set(data, geometry);
  }
  return geometry;
};

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
 * A kind drawn from its generated model (#394), in the same instanced draw,
 * at the same transforms, scale and tint as the code-built piece: the model
 * stands in the code-built piece's local frame (`townModelGeometry.ts`).
 */
function ModelPieces({ model, buildings }: { model: TownModel; buildings: readonly PortBuilding[] }) {
  const geometry = modelGeometry(useTownModelGeometry(model));
  return <InstancedPieces geometry={geometry} material={BUILDING_MATERIAL} buildings={buildings} />;
}

/**
 * A kind's buildings: from its model where it has one, else code-built.
 * The code-built piece also stands in while the model loads and for good if
 * it fails (logged), so a port never loses its tavern.
 */
function KindPieces({ kind, buildings }: { kind: BuildingKind; buildings: readonly PortBuilding[] }) {
  const codeBuilt = <InstancedPieces geometry={BUILDING_GEOMETRIES[kind]} material={BUILDING_MATERIAL} buildings={buildings} />;
  const model = townModelFor(kind);
  if (!model) return codeBuilt;
  return (
    <ErrorBoundary fallback={codeBuilt} onError={(error) => logTownModelFailure(model, error)}>
      <Suspense fallback={codeBuilt}>
        <ModelPieces model={model} buildings={buildings} />
      </Suspense>
    </ErrorBoundary>
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
        <KindPieces key={kind} kind={kind} buildings={buildings} />
      ))}
      {flagsByNation.map(({ nation, towers }) => (
        <InstancedPieces key={nation} geometry={FLAG_GEOMETRIES[nation]} material={FLAG_MATERIAL} buildings={towers} tint={false} />
      ))}
    </>
  );
}
