import { describe, it, expect } from "vitest";
import { hexKey, hexRect, offsetToHex } from "../game/hex";
import { deepSeaHexes } from "../game/deepSea";
import type { MapCell } from "../game/types";
import { createShipState } from "../game/economy";
import { deepReach, endTurnSeaWarning, freshSeaWear, seaWearNotice, targetSeaWarning } from "./seaWearView";

// Open water seven hexes across: columns 3 to 5 are deep sea
const cells: MapCell[] = hexRect(9, 9).map((h) => {
  const land = h.q === 0 || h.q === 8;
  return { hex: h, terrain: land ? "island" : "water", hasPort: false, elevation: land ? 1 : 0 };
});
const at = (col: number) => offsetToHex(col, 4);
const sea = { cells, wrap: null };

describe("the open sea's warnings on the HUD (#340)", () => {
  it("warns a Sloop on deep sea before it ends its turn", () => {
    expect(endTurnSeaWarning(sea, createShipState(at(4), "Sloop"))).toBe("Open ocean: your Sloop will lose 1 hull");
  });

  it("says nothing by the coast, nor to an ocean-going ship", () => {
    expect(endTurnSeaWarning(sea, createShipState(at(1), "Sloop"))).toBeNull();
    expect(endTurnSeaWarning(sea, createShipState(at(4), "Galleon"))).toBeNull();
  });

  it("warns of a deep target the coaster would end its turn on", () => {
    const flute = createShipState(at(1), "Flute");
    expect(targetSeaWarning(sea, flute, at(4))).toBe("Open ocean: end your turn there and your Flute loses 1 hull");
    expect(targetSeaWarning(sea, flute, at(2))).toBeNull();
  });
});

describe("telling the table the sea wore a ship (#340)", () => {
  it("is news only when the record changes", () => {
    const wear = { player: "0", turn: 3 };
    expect(freshSeaWear(undefined, wear)).toEqual(wear);
    expect(freshSeaWear({ player: "0", turn: 3 }, wear)).toBeNull();
    expect(freshSeaWear(wear, { player: "1", turn: 4 })).toEqual({ player: "1", turn: 4 });
    expect(freshSeaWear(wear, undefined)).toBeNull();
  });

  it("speaks to the worn captain, and of them to the others", () => {
    expect(seaWearNotice({ you: true, captainName: "Anne Bonny" })).toBe("The open sea strains your hull: −1 hull");
    expect(seaWearNotice({ you: false, captainName: "Anne Bonny" })).toBe("The open sea strains Anne Bonny’s hull: −1 hull");
  });
});

describe("the deep sea marked in a coaster's reach (#340)", () => {
  const deep = new Set(deepSeaHexes(cells, null).map(hexKey));
  const reach = [at(2), at(3), at(4), at(5)];

  it("marks the deep hexes a coaster could end its turn on", () => {
    expect(deepReach({}, createShipState(at(1), "Sloop"), reach, deep)).toEqual([at(3), at(4), at(5)]);
  });

  it("marks none for an ocean-going ship, or a coaster on its last hull point", () => {
    expect(deepReach({}, createShipState(at(1), "Frigate"), reach, deep)).toEqual([]);
    const worn = createShipState(at(1), "Sloop");
    worn.stats!.hull.current = 1;
    expect(deepReach({}, worn, reach, deep)).toEqual([]);
  });
});
