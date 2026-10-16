import { describe, it, expect } from "vitest";
import { createWrap, hexRect, offsetToHex, type MapWrap } from "./hex";
import type { CaribbeanState, MapCell, ShipClass, ShipState } from "./types";
import { createShipState } from "./economy";
import type { Terrain } from "./terrain";
import { DEEP_SEA_DISTANCE, isDeepSea, seaWillWear } from "./deepSea";

/**
 * A map `columns` wide and `rows` tall whose columns listed in `land` are
 * island (or `landTerrain`), the rest open water.
 */
function strip(columns: number, land: number[], rows = 9, landTerrain: Terrain = "island"): MapCell[] {
  return hexRect(columns, rows).map((h) => {
    const terrain: Terrain = land.includes(h.q) ? landTerrain : "water";
    return { hex: h, terrain, hasPort: false, elevation: terrain === "island" ? 1 : 0 };
  });
}

const at = (col: number, row = 4) => offsetToHex(col, row);

describe("deep sea (#340)", () => {
  it("lies at least three hexes from any island", () => {
    expect(DEEP_SEA_DISTANCE).toBe(3);
  });

  it("is not the middle of a channel three hexes wide", () => {
    const cells = strip(5, [0, 4]);
    for (const col of [1, 2, 3]) expect(isDeepSea(cells, at(col), null)).toBe(false);
  });

  it("is the middle of a channel five hexes wide, and only the middle", () => {
    const cells = strip(7, [0, 6]);
    expect(isDeepSea(cells, at(3), null)).toBe(true);
    for (const col of [1, 2, 4, 5]) expect(isDeepSea(cells, at(col), null)).toBe(false);
  });

  it("counts a reef as land", () => {
    // Reefs alone at the edges leave the middle deep; one reef in it does not
    expect(isDeepSea(strip(7, [0, 6], 9, "reef"), at(3), null)).toBe(true);
    const cells = strip(7, [0, 6]).map((c) => (c.hex.q === 2 && c.hex.r === at(2).r ? { ...c, terrain: "reef" as const } : c));
    expect(isDeepSea(cells, at(3), null)).toBe(false);
  });

  it("is never land, nor a hex off the map", () => {
    const cells = strip(7, [0, 6]);
    expect(isDeepSea(cells, at(0), null)).toBe(false);
    expect(isDeepSea(cells, at(30), null)).toBe(false);
  });

  it("is open water anywhere on a map with no land at all", () => {
    expect(isDeepSea(strip(5, []), at(2), null)).toBe(true);
  });

  it("measures round the east–west seam on a wrapping map", () => {
    // Land in column 1 only: column 7 is 6 columns east of it, but 2 west across the seam
    const wrap: MapWrap = createWrap(8);
    const cells = strip(8, [1]);
    expect(isDeepSea(cells, at(4), wrap)).toBe(true);
    expect(isDeepSea(cells, at(7), wrap)).toBe(false);
    expect(isDeepSea(cells, at(7), null)).toBe(true);
  });
});

describe("whether the sea will wear a ship as its turn ends (#340)", () => {
  // Open water five hexes across: column 3 is deep, column 1 lies by the coast
  const cells = strip(7, [0, 6]);
  const sea = (combat = false) =>
    ({ cells, wrap: null, ...(combat ? { combat: {} as CaribbeanState["combat"] } : {}) }) as Pick<CaribbeanState, "cells" | "wrap" | "combat">;
  const shipAt = (col: number, shipClass: ShipClass): ShipState => createShipState(at(col), shipClass);

  it("wears a Sloop or a Flute on deep sea", () => {
    expect(seaWillWear(sea(), shipAt(3, "Sloop"))).toBe(true);
    expect(seaWillWear(sea(), shipAt(3, "Flute"))).toBe(true);
  });

  it("leaves a Frigate or a Galleon alone: they are ocean-going", () => {
    expect(seaWillWear(sea(), shipAt(3, "Frigate"))).toBe(false);
    expect(seaWillWear(sea(), shipAt(3, "Galleon"))).toBe(false);
  });

  it("leaves a coaster by the coast alone", () => {
    expect(seaWillWear(sea(), shipAt(1, "Sloop"))).toBe(false);
  });

  it("never takes a ship's last hull point", () => {
    const ship = shipAt(3, "Sloop");
    ship.stats!.hull.current = 1;
    expect(seaWillWear(sea(), ship)).toBe(false);
  });

  it("leaves a ship in a fight alone", () => {
    expect(seaWillWear(sea(true), shipAt(3, "Sloop"))).toBe(false);
  });
});
