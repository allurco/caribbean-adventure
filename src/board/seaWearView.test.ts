import { describe, it, expect } from "vitest";
import { hexKey, hexRect, offsetToHex } from "../game/hex";
import { deepSeaHexes } from "../game/deepSea";
import type { CombatState, MapCell, ShipState } from "../game/types";
import { createShipState } from "../game/economy";
import { deepReach, endTurnSeaWarning, freshSeaWears, seaWearNotices, seaWearToastTop, targetSeaWarning } from "./seaWearView";
import { hudToastTop } from "./hudLayout";

// Open water seven hexes across: columns 3 to 5 are deep sea
const cells: MapCell[] = hexRect(9, 9).map((h) => {
  const land = h.q === 0 || h.q === 8;
  return { hex: h, terrain: land ? "island" : "water", hasPort: false, elevation: land ? 1 : 0 };
});
const at = (col: number) => offsetToHex(col, 4);
const deep = new Set(deepSeaHexes(cells, null).map(hexKey));

describe("the open sea's warnings on the HUD (#340)", () => {
  it("warns a Sloop on deep sea before it ends its turn", () => {
    expect(endTurnSeaWarning({}, createShipState(at(4), "Sloop"), deep)).toBe("Open ocean: your Sloop will lose 1 hull");
  });

  it("says nothing by the coast, nor to an ocean-going ship, nor in a fight", () => {
    expect(endTurnSeaWarning({}, createShipState(at(1), "Sloop"), deep)).toBeNull();
    expect(endTurnSeaWarning({}, createShipState(at(4), "Galleon"), deep)).toBeNull();
    expect(endTurnSeaWarning({ combat: {} as CombatState }, createShipState(at(4), "Sloop"), deep)).toBeNull();
  });

  it("warns of a deep target the coaster would end its turn on", () => {
    const flute = createShipState(at(1), "Flute");
    expect(targetSeaWarning({}, flute, at(4), deep)).toBe("Open ocean: end your turn there and your Flute loses 1 hull");
    expect(targetSeaWarning({}, flute, at(2), deep)).toBeNull();
  });
});

describe("telling the table the sea wore a ship (#340)", () => {
  it("finds the seats worn since the board last looked", () => {
    expect(freshSeaWears(undefined, { "0": 3 })).toEqual(["0"]);
    expect(freshSeaWears({ "0": 3 }, { "0": 3 })).toEqual([]);
    // Online, two turns can arrive in one update: both seats are news
    expect(freshSeaWears({ "0": 3 }, { "0": 5, "1": 6 })).toEqual(["0", "1"]);
    expect(freshSeaWears({ "0": 3 }, undefined)).toEqual([]);
  });

  const ships = { "0": { captain: { name: "Anne Bonny" } }, "1": { captain: { name: "Calico Jack" } } } as unknown as Record<string, ShipState>;

  it("speaks to a seat's own captain online, and names the others", () => {
    expect(seaWearNotices(["0", "1"], { playerID: "1", numPlayers: 2, ships })).toEqual([
      "The open sea strains Anne Bonny’s hull: −1 hull",
      "The open sea strains your hull: −1 hull",
    ]);
  });

  it("speaks to the solo captain, and names the captain in hotseat", () => {
    expect(seaWearNotices(["0"], { playerID: null, numPlayers: 1, ships })).toEqual(["The open sea strains your hull: −1 hull"]);
    expect(seaWearNotices(["0"], { playerID: undefined, numPlayers: 2, ships })).toEqual(["The open sea strains Anne Bonny’s hull: −1 hull"]);
  });

  it("sits under the mission toast when both are up", () => {
    expect(seaWearToastTop("desktop", false)).toBe(hudToastTop("desktop"));
    expect(seaWearToastTop("desktop", true)).toBeGreaterThan(hudToastTop("desktop") + 80);
  });
});

describe("the deep sea marked in a coaster's reach (#340)", () => {
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
