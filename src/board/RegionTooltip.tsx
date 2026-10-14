import { Html } from "@react-three/drei";
import type { Region } from "../game/types";
import { NationFlag } from "./NationFlag";

/** The region a hovered sea hex lies in (#239): its flag and name, small, just above the hex. */
export function RegionTooltip({ position, region }: { position: [number, number, number]; region: Region }) {
  return (
    <Html position={[position[0], position[1] + 0.6, position[2]]} center>
      <div className="flex items-center gap-1.5 bg-stone-900/85 text-amber-100 px-2 py-1 rounded-md text-[11px] shadow border border-amber-800/30 whitespace-nowrap pointer-events-none">
        <NationFlag nation={region.nation} size="sm" />
        <span className="font-heading">{region.name}</span>
      </div>
    </Html>
  );
}
