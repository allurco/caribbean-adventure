/**
 * The baked terrain field as one GPU texture per map (layout in
 * terrainFieldTexture.ts), shared by the water (Ocean.tsx) and the land's
 * shoreline foam patch (shoreFoamLand.ts, #38 step 7). On a wrapping map it
 * covers one wrap width and repeats in s (#36).
 */
import { useEffect, useMemo } from "react";
import { ClampToEdgeWrapping, DataTexture, HalfFloatType, LinearFilter, RepeatWrapping, RGBAFormat } from "three";
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { perMapCache } from "./perMapCache";
import { createReefMask, createReefOutward } from "./reefMask";
import { sharedTerrainField } from "./sharedTerrainField";
import { reefWindwardWeight } from "./shoreFoam";
import { bakeTerrainField } from "./terrainFieldTexture";
import type { TerrainBounds } from "./terrainHeightField";

export interface TerrainFieldTexture {
  texture: DataTexture;
  bounds: TerrainBounds;
  wrap: MapWrap;
}

/** The bake (CPU side), once per map and wrap. */
const bakedFieldOf = perMapCache((cells, wrap) => {
  const outward = createReefOutward(cells, wrap);
  return bakeTerrainField(sharedTerrainField(cells, wrap), {
    sampleReef: createReefMask(cells, wrap),
    sampleReefWindward: (x, z) => reefWindwardWeight(outward(x, z)),
  });
});

/** The map's terrain field texture; built once per map and disposed when the map changes or the owner unmounts. */
export function useTerrainFieldTexture(cells: readonly MapCell[], wrap: MapWrap): TerrainFieldTexture {
  const field = useMemo(() => {
    const { data, width, height, bounds } = bakedFieldOf(cells, wrap);
    const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = wrap ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return { texture, bounds, wrap };
  }, [cells, wrap]);
  useEffect(() => () => field.texture.dispose(), [field]);
  return field;
}
