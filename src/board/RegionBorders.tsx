import type { RegionBorderLines } from "./useRegionBorders";

/** The borders between regions for one world copy (#239), drawing the shared `lines` (`useRegionBorders`). */
export function RegionBorders({ lines }: { lines: RegionBorderLines }) {
  if (lines.empty) return null;
  return (
    <lineSegments geometry={lines.geometry} material={lines.material} frustumCulled={false} raycast={() => null} />
  );
}
