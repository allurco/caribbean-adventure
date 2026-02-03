import { hexGrid } from "./hex";
import type { Terrain } from "./terrain";
import type { MapCell } from "./types";
import { NATIONS } from "./types";
import { generatePortMarket } from "./economy";

export type { MapCell } from "./types";

const ISLAND_CHANCE = 0.25;
const PORT_CHANCE = 0.4;

/** Simple seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(radius: number, seed?: number): MapCell[] {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  const grid = hexGrid(radius);

  let portIndex = 0;
  return grid.map((hex) => {
    const isCenter = hex.q === 0 && hex.r === 0;
    const terrain: Terrain = isCenter
      ? "water"
      : rng() < ISLAND_CHANCE
        ? "island"
        : "water";
    const hasPort = terrain === "island" && rng() < PORT_CHANCE;
    const cell: MapCell = { hex, terrain, hasPort };
    if (hasPort) {
      cell.market = generatePortMarket(rng);
      cell.nation = NATIONS[portIndex % NATIONS.length];
      portIndex++;
    }
    return cell;
  });
}
