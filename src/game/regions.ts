import { canonicalHex, wrappedDistance, wrappedNeighbors } from "./hex";
import type { Hex, MapWrap } from "./hex";
import type { MapCell, PortNation, Region, RegionId } from "./types";
import { NATIONS } from "./types";

/**
 * Regions (#239): the map is cut into one region per nation plus one for the
 * Pirates, five on every map size. Region `i` flies `REGION_NATIONS[i]`.
 */
export const REGION_NATIONS: readonly PortNation[] = [...NATIONS, "Pirate"];

/** The pirate region's id. */
export const PIRATE_REGION: RegionId = REGION_NATIONS.indexOf("Pirate");

/**
 * The least hex distance between land in two different regions: the channel
 * of open water between their clusters is at least `REGION_CHANNEL - 1` = 3
 * hexes wide.
 */
export const REGION_CHANNEL = 4;

/** Each region's name is drawn by the map seed from its nation's list. */
export const REGION_NAMES: Readonly<Record<PortNation, readonly string[]>> = {
  England: ["the Windward Reach", "the King's Sound", "Albion Waters", "the Leeward Banks"],
  France: ["the Golden Lily Sea", "the Gulf of Saint-Louis", "the Antilles Reach", "the Bay of Lilies"],
  Spain: ["the Spanish Main", "the Silver Coast", "the Mar de Castilla", "the Treasure Lanes"],
  Netherlands: ["the Orange Shoals", "Zeeland Waters", "the Free Sound", "the Merchants' Reach"],
  Pirate: ["Tortuga Waters", "the Brethren's Sea", "the Devil's Reach", "Blackwater Shoals"],
};

const hexKey = (h: Hex): string => `${h.q},${h.r}`;

/**
 * The region of every hex in `grid`, given the land's: each hex takes the
 * region of the nearest land (by hex steps round the seam), so a channel is
 * split between the regions either side and the border runs down its middle.
 * A region with no land grows from its `centres` hex instead. Ties go to the
 * source reached first, in the order of `land` then `centres`: deterministic.
 */
export function assignRegions(
  grid: readonly Hex[],
  land: ReadonlyMap<string, RegionId>,
  centres: readonly Hex[],
  wrap: MapWrap
): Map<string, RegionId> {
  const onGrid = new Set(grid.map(hexKey));
  const region = new Map<string, RegionId>();
  const queue: Hex[] = [];
  const byKey = new Map(grid.map((h) => [hexKey(h), h]));
  for (const [key, id] of land) {
    region.set(key, id);
    queue.push(byKey.get(key)!);
  }
  const landed = new Set(land.values());
  centres.forEach((centre, id) => {
    const key = hexKey(centre);
    if (landed.has(id) || region.has(key)) return;
    region.set(key, id);
    queue.push(centre);
  });
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const id = region.get(hexKey(current))!;
    for (const n of wrappedNeighbors(current, wrap)) {
      const key = hexKey(canonicalHex(n, wrap));
      if (!onGrid.has(key) || region.has(key)) continue;
      region.set(key, id);
      queue.push(byKey.get(key)!);
    }
  }
  return region;
}

/**
 * Which regions neighbour which: two regions are neighbours when a hex of one
 * touches a hex of the other. Symmetric; each list ascending.
 */
export function regionNeighbours(cells: readonly MapCell[], regionCount: number, wrap: MapWrap): RegionId[][] {
  const byKey = new Map(cells.map((c) => [hexKey(c.hex), c.region]));
  const touching = Array.from({ length: regionCount }, () => new Set<RegionId>());
  for (const cell of cells) {
    if (cell.region === undefined) continue;
    for (const n of wrappedNeighbors(cell.hex, wrap)) {
      const other = byKey.get(hexKey(n));
      if (other === undefined || other === cell.region) continue;
      touching[cell.region].add(other);
      touching[other].add(cell.region);
    }
  }
  return touching.map((set) => [...set].sort((a, b) => a - b));
}

/** The region table for `cells`, with each region's name drawn by `rng`. */
export function buildRegionTable(cells: readonly MapCell[], wrap: MapWrap, rng: () => number): Region[] {
  const neighbours = regionNeighbours(cells, REGION_NATIONS.length, wrap);
  return REGION_NATIONS.map((nation, id) => {
    const names = REGION_NAMES[nation];
    return { id, nation, name: names[Math.floor(rng() * names.length)], neighbours: neighbours[id] };
  });
}

/**
 * `count` region centres spread across `candidates` (seeded): the first at
 * random, each next the best of a few random tries, the one farthest from the
 * centres already placed (Mitchell's best-candidate sampling), measured round
 * the seam.
 */
export function placeRegionCentres(
  candidates: readonly Hex[],
  count: number,
  rng: () => number,
  wrap: MapWrap,
  tries = 16
): Hex[] {
  const pick = () => candidates[Math.floor(rng() * candidates.length)];
  const centres: Hex[] = [pick()];
  while (centres.length < count) {
    let best = pick();
    let bestDistance = -1;
    for (let t = 0; t < tries; t++) {
      const candidate = t === 0 ? best : pick();
      const nearest = Math.min(...centres.map((c) => wrappedDistance(c, candidate, wrap)));
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    centres.push(best);
  }
  return centres;
}
