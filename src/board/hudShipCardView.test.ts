import { describe, expect, it } from "vitest";
import type { ShipState } from "../game/types";
import { meterPercent, shipCardView } from "./hudShipCardView";

const ship = (over: Partial<ShipState> = {}): ShipState => ({
  position: { q: 0, r: 0, s: 0 },
  cargo: { Wood: 0, Sugar: 0, Rum: 0, Spice: 0 },
  gold: 0,
  maxCargo: 4,
  shipClass: "Sloop",
  stats: {
    maneuverability: 3,
    scouting: 2,
    cannons: 1,
    crew: { current: 2, max: 3 },
    hull: { current: 3, max: 3 },
    cargo: 4,
    shallowDraft: true,
  },
  upgrades: [],
  damage: { hull: 0, crew: 0, masts: 0 },
  bounties: { England: 0, France: 0, Spain: 0, Netherlands: 0 },
  score: 0,
  stashedGold: 0,
  scoutedShips: [],
  ...over,
});

describe("meterPercent", () => {
  it("is the filled share of the bar", () => {
    expect(meterPercent(2, 4)).toBe(50);
  });
  it("is empty when there is no maximum, and clamped to 0–100", () => {
    expect(meterPercent(3, 0)).toBe(0);
    expect(meterPercent(5, 4)).toBe(100);
    expect(meterPercent(-1, 4)).toBe(0);
  });
});

describe("shipCardView", () => {
  it("titles the card with the ship class, or 'Ship' without one", () => {
    expect(shipCardView(ship()).title).toBe("Sloop");
    expect(shipCardView(ship({ shipClass: undefined })).title).toBe("Ship");
  });

  it("gives hull and crew meters and the stat grid", () => {
    const view = shipCardView(ship({ cargo: { Wood: 1, Sugar: 0, Rum: 2, Spice: 0 } }));
    expect(view.meters).toEqual([
      { label: "Hull", current: 3, max: 3, percent: 100 },
      { label: "Crew", current: 2, max: 3, percent: (2 / 3) * 100 },
    ]);
    expect(view.stats).toEqual([
      { label: "Cannons", value: "1" },
      { label: "Scouting", value: "2" },
      { label: "Moves", value: "3" },
      { label: "Cargo", value: "3/4" },
    ]);
  });

  it("has no meters or stats for a ship without stats", () => {
    const view = shipCardView(ship({ stats: undefined }));
    expect(view.meters).toEqual([]);
    expect(view.stats).toEqual([]);
  });

  it("lists only damaged parts, in hull, crew, masts order", () => {
    expect(shipCardView(ship()).damage).toEqual([]);
    expect(shipCardView(ship({ damage: { hull: 0, crew: 1, masts: 2 } })).damage).toEqual([
      { label: "Crew", amount: 1 },
      { label: "Masts", amount: 2 },
    ]);
  });

  it("lists the nations that want the ship, with their bounty", () => {
    const view = shipCardView(ship({ bounties: { England: 0, France: 3, Spain: 1, Netherlands: 0 } }));
    expect(view.wanted).toEqual([
      { nation: "France", bounty: 3 },
      { nation: "Spain", bounty: 1 },
    ]);
  });

  it("lists the goods in the hold and names the upgrades", () => {
    const view = shipCardView(
      ship({ cargo: { Wood: 0, Sugar: 2, Rum: 0, Spice: 1 }, upgrades: ["chain_shot", "unknown_upgrade"] }),
    );
    expect(view.cargo).toEqual([
      { good: "Sugar", amount: 2 },
      { good: "Spice", amount: 1 },
    ]);
    expect(view.upgrades).toEqual(["Chain Shot", "unknown_upgrade"]);
  });
});
