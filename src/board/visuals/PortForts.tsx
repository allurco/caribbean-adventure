import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { PORT_NATIONS, type MapCell, type PortNation } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import type { FacetGeometryData } from "./facetBuilder";
import { buildFortGeometry, FORT_FLAG_HOIST, fortFlag, type FortColors } from "./fortGeometry";
import { buildNationFlagGeometry } from "./nationFlagGeometry";
import { sharedTerrainField } from "./sharedTerrainField";
import { perMapCache } from "./perMapCache";
import { portHasFort } from "./portFort";
import { BUILDING_SCALE } from "./propScale";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/** sRGB hex to linear RGB. */
const hex = (h: number): Rgb => {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [toLinear((h >> 16) & 255), toLinear((h >> 8) & 255), toLinear(h & 255)];
};

/**
 * The fort's palette (#84 detail pass): pale coral limestone, the stone the
 * Spanish forts of the Caribbean were built of, weathered to a warm grey,
 * so the fort stands out light against the green hill; a paler cordón;
 * packed earth on the terreplein; the barracks whitewashed under tiles.
 */
function fortColors(): FortColors {
  const stone = hex(0xcfc2a5);
  const sand = rgb("drySand");
  return {
    stone,
    cordon: hex(0xe2d8c0),
    terreplein: [sand[0] * 0.62, sand[1] * 0.56, sand[2] * 0.46],
    mortar: [stone[0] * 0.2, stone[1] * 0.19, stone[2] * 0.17],
    timber: rgb("oldTimber"),
    iron: rgb("ironwork"),
    whitewash: rgb("limewash"),
    roof: rgb("oldTerracotta"),
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
  PORT_NATIONS.map((nation) => [nation, toGeometry(fortFlag(buildNationFlagGeometry(nation, FORT_FLAG_HOIST)))])
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
