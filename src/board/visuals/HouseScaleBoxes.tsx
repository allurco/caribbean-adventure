import { useMemo } from "react";
import type { MapCell } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { perMapCache } from "./perMapCache";
import { terrainSeedFromCells } from "./terrainHeightField";
import { landSurface } from "./landMesh";
import { decorationLayoutOf } from "./decorationLayout";
import { portTown } from "./houseBoxLayout";
import { PortBuildings } from "./PortBuildings";
import { HEX_METRES } from "./propScale";

const townOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap) => {
  const field = sharedTerrainField(cells, wrap);
  const layout = decorationLayoutOf(cells, wrap);
  const kit = { buildings: layout.buildings, quays: layout.quays, piers: layout.piers, plateaus: field.townPlateaus };
  const started = performance.now();
  const town = portTown(cells, landSurface(field), wrap, kit, terrainSeedFromCells(cells));
  const ports = cells.filter((c) => c.hasPort).length;
  const houses = town.filter((b) => b.kind === "house").length;
  // The #84 report reads this from the console.
  console.info(
    `[#84] hexMetres=${HEX_METRES}: ${houses} houses + ${town.length - houses} warehouses on ${ports} ports ` +
      `(${(houses / Math.max(1, ports)).toFixed(1)} + ${((town.length - houses) / Math.max(1, ports)).toFixed(1)} a port), laid out in ${(performance.now() - started).toFixed(0)} ms`
  );
  for (const port of cells.filter((c) => c.hasPort)) {
    const [x, , z] = hexToWorld(port.hex);
    const mine = (b: { worldX: number; worldZ: number }) => Math.hypot(b.worldX - x, b.worldZ - z) < 1;
    const here = town.filter(mine);
    const h = here.filter((b) => b.kind === "house").length;
    console.info(`[#84] ${port.portName}: ${h} houses, ${here.length - h} warehouses; kit ${layout.buildings.filter(mine).map((b) => b.kind).join(", ")}`);
  }
  return town;
});

/** The #83/#84 prototypes' packed port town: the aged kit's house and warehouse, one instanced draw per kind per world copy. */
export function HouseScaleBoxes({ cells, wrap }: { cells: readonly MapCell[]; wrap: MapWrap }) {
  const town = useMemo(() => townOf(cells, wrap), [cells, wrap]);
  return <PortBuildings buildings={town} />;
}
