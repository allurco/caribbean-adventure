import { useMemo } from "react";
import { MeshStandardMaterial, type Texture } from "three";
import { SUN_DIRECTION } from "./atmosphere";
import { ROCK_VARIANT_COUNT } from "./rockGeometry";
import { ROCK_GEOMETRIES, ROCK_MATERIAL } from "./Rocks";
import { RockVariantMesh, type RockInstance } from "./RockVariantMesh";
import { injectSeabedCaustics } from "./seabedCaustics";
import type { ShoreBoulder } from "./shoreBoulders";

interface ShoreBoulderMeshesProps {
  boulders: readonly ShoreBoulder[];
  /**
   * The wave cascades' slope textures (useWaveCascades): the boulders'
   * underwater sunlight is focused through them like the seabed's. Without
   * them the boulders are lit flat, with the plain rock material.
   */
  waveSlopes?: readonly Texture[];
}

/**
 * The boulders' material: the rocks' white (so `instanceColor` is the whole
 * colour) with the seabed caustics patched in (seabedCaustics.ts), as the
 * land material has them: the factor is 1 above the waterline, and below it
 * the waves focus the sun on the submerged boulders and the emergent ones'
 * feet. One per set of wave textures, shared by every world copy and never
 * disposed: like the rock geometries it lives as long as the wave textures,
 * and three caches the compiled program under its key.
 */
const boulderMaterials = new WeakMap<readonly Texture[], MeshStandardMaterial>();
function boulderMaterialFor(waveSlopes: readonly Texture[]): MeshStandardMaterial {
  const cached = boulderMaterials.get(waveSlopes);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => injectSeabedCaustics(shader, { sun: SUN_DIRECTION, waveSlopes });
  material.customProgramCacheKey = () => "shore-boulders-caustics";
  boulderMaterials.set(waveSlopes, material);
  return material;
}

/** The boulders by faceted variant, the emergent and the submerged apart (they draw on different layers). */
function groupBoulders(boulders: readonly ShoreBoulder[]): { emergent: RockInstance[][]; submerged: RockInstance[][] } {
  const groups = () => Array.from({ length: ROCK_VARIANT_COUNT }, (): RockInstance[] => []);
  const emergent = groups();
  const submerged = groups();
  for (const b of boulders) {
    (b.submerged ? submerged : emergent)[b.variation.variant].push({
      worldX: b.worldX,
      worldY: b.worldY,
      worldZ: b.worldZ,
      variation: b.variation,
    });
  }
  return { emergent, submerged };
}

/**
 * Every shore boulder on the map (shoreBoulders.ts), per world copy. The
 * emergent ones draw in the main pass and the seabed prepass (#38), since
 * their feet reach under the waterline; the submerged ones draw in the
 * prepass only, where the water shader tints them by depth and the wash
 * foams over their crowns, with the seabed's caustics on their sunlight.
 */
export function ShoreBoulderMeshes({ boulders, waveSlopes }: ShoreBoulderMeshesProps) {
  const { emergent, submerged } = useMemo(() => groupBoulders(boulders), [boulders]);
  const material = useMemo(() => (waveSlopes ? boulderMaterialFor(waveSlopes) : ROCK_MATERIAL), [waveSlopes]);
  return (
    <>
      {emergent.map((group, variant) => (
        <RockVariantMesh key={`e${variant}`} geometry={ROCK_GEOMETRIES[variant]} material={material} rocks={group} prepass="also" />
      ))}
      {submerged.map((group, variant) => (
        <RockVariantMesh key={`s${variant}`} geometry={ROCK_GEOMETRIES[variant]} material={material} rocks={group} prepass="only" />
      ))}
    </>
  );
}
