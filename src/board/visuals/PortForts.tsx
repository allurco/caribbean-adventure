import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { PORT_NATIONS, type MapCell, type PortNation } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import type { FacetGeometryData } from "./facetBuilder";
import { buildFortGeometry, FORT_FLAG_HOIST, type FortColors } from "./fortGeometry";
import { buildNationFlagGeometry } from "./nationFlagGeometry";
import { sharedTerrainField } from "./sharedTerrainField";
import { perMapCache } from "./perMapCache";
import { portHasFort } from "./portFort";
import { BUILDING_SCALE } from "./propScale";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/** The fort's palette: the quay's weathered masonry for the walls, the tower's stone for the cordón, packed sand on the terreplein. */
function fortColors(): FortColors {
  const masonry = rgb("masonry");
  const stone: Rgb = [masonry[0] * 0.95, masonry[1] * 0.88, masonry[2] * 0.76];
  const sand = rgb("drySand");
  return {
    stone,
    cordon: rgb("roughStone"),
    terreplein: [sand[0] * 0.72, sand[1] * 0.68, sand[2] * 0.6],
    mortar: [stone[0] * 0.25, stone[1] * 0.23, stone[2] * 0.21],
    timber: rgb("oldTimber"),
    iron: rgb("ironwork"),
  };
}

function toGeometry(data: FacetGeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  return geometry;
}

const FORT_GEOMETRY = toGeometry(buildFortGeometry(fortColors()));
const FLAG_GEOMETRIES: Readonly<Record<PortNation, BufferGeometry>> = Object.fromEntries(
  PORT_NATIONS.map((nation) => [nation, toGeometry(buildNationFlagGeometry(nation, FORT_FLAG_HOIST))])
) as Record<PortNation, BufferGeometry>;
const STONE_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 });
const FLAG_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0 });

interface PlacedFort {
  x: number;
  y: number;
  z: number;
  yaw: number;
  nation?: PortNation;
  port: string;
}

/** The forts the shared field planned pads for, each with its port's nation. */
const fortsOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap): PlacedFort[] => {
  const field = sharedTerrainField(cells, wrap);
  const forts: PlacedFort[] = [];
  for (const p of field.townPlateaus ?? []) {
    if (!p.fort) continue;
    const port = cells
      .filter((c) => portHasFort(c))
      .reduce<MapCell | undefined>((best, c) => {
        const [x, , z] = hexToWorld(c.hex);
        const [bx, , bz] = best ? hexToWorld(best.hex) : [Infinity, 0, Infinity];
        return Math.hypot(x - p.x, z - p.z) < Math.hypot(bx - p.x, bz - p.z) ? c : best;
      }, undefined);
    forts.push({ x: p.fort.x, y: p.fort.level, z: p.fort.z, yaw: p.fort.yaw, nation: port?.nation, port: port?.portName ?? "?" });
  }
  // The #84 report reads this from the console.
  console.info(`[#84] forts: ${forts.map((f) => `${f.port} at (${f.x.toFixed(2)}, ${f.z.toFixed(2)}) level ${f.y.toFixed(3)}`).join("; ") || "none"}`);
  return forts;
});

const tempObject = new Object3D();

function FortInstances({ geometry, material, forts }: { geometry: BufferGeometry; material: MeshStandardMaterial; forts: readonly PlacedFort[] }) {
  const meshRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    forts.forEach((f, i) => {
      tempObject.position.set(f.x, f.y, f.z);
      tempObject.rotation.set(0, f.yaw, 0);
      tempObject.scale.setScalar(BUILDING_SCALE);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [forts]);
  if (forts.length === 0) return null;
  return <instancedMesh key={forts.length} ref={meshRef} args={[geometry, material, forts.length]} castShadow receiveShadow frustumCulled={false} />;
}

/** The #84 forts on their pads: one instanced draw for the stone, one per nation for the flags (per world copy). */
export function PortForts({ cells, wrap }: { cells: readonly MapCell[]; wrap: MapWrap }) {
  const forts = useMemo(() => fortsOf(cells, wrap), [cells, wrap]);
  const byNation = useMemo(
    () => PORT_NATIONS.map((nation) => ({ nation, forts: forts.filter((f) => f.nation === nation) })).filter((g) => g.forts.length > 0),
    [forts]
  );
  if (forts.length === 0) return null;
  return (
    <>
      <FortInstances geometry={FORT_GEOMETRY} material={STONE_MATERIAL} forts={forts} />
      {byNation.map(({ nation, forts }) => (
        <FortInstances key={nation} geometry={FLAG_GEOMETRIES[nation]} material={FLAG_MATERIAL} forts={forts} />
      ))}
    </>
  );
}
