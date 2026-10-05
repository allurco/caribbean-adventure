import type { WaterGridLines } from "./useWaterGridLines";

/** The water hex grid for one world copy, drawing the shared `lines` (`useWaterGridLines`). */
export function WaterHexOutlines({ lines }: { lines: WaterGridLines }) {
  if (lines.empty) return null;
  return (
    <lineSegments
      geometry={lines.geometry}
      material={lines.material}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
