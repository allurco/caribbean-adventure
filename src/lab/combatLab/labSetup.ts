/**
 * PROTOTYPE (combat animation lab, PRD #259): what the lab's URL asks for,
 * and where on a real map the two ships lie.
 */
import { SHIP_CLASSES, type ShipClass, type MapCell } from "../../game/types";
import { hex, hexToWorld, neighbors, wrappedDistance, type Hex, type MapWrap } from "../../game/hex";
import { BEAT_IDS, type BeatId } from "./beatTiming";
import { downwindHeading, type Point } from "./shipPaths";

export interface LabParams {
  a: ShipClass;
  b: ShipClass;
  /** Hexes between the ships. */
  gap: 1 | 2;
  /** Which ship acts (fires, rakes, closes, bears away); the other takes the hits. */
  actor: "a" | "b";
  /** Beats to play in turn once the scene is up (for screenshots). */
  play: BeatId[];
  /** The map the lab's sea and islands come from. */
  seed: number;
}

const isClass = (v: string | null): v is ShipClass => v !== null && (SHIP_CLASSES as readonly string[]).includes(v);

export function parseLabParams(search: string): LabParams {
  const p = new URLSearchParams(search);
  const seed = Number(p.get("seed"));
  return {
    a: isClass(p.get("a")) ? (p.get("a") as ShipClass) : "Frigate",
    b: isClass(p.get("b")) ? (p.get("b") as ShipClass) : "Galleon",
    gap: p.get("gap") === "2" ? 2 : 1,
    actor: p.get("actor") === "b" ? "b" : "a",
    play: (p.get("play") ?? "").split(",").filter((id): id is BeatId => (BEAT_IDS as string[]).includes(id)),
    seed: p.get("seed") !== null && Number.isInteger(seed) && seed >= 0 ? seed : 4242,
  };
}

export interface CombatSite {
  a: Hex;
  b: Hex;
  /** The heading both ships lie at: across the wind. */
  heading: number;
}

/**
 * Two hexes of open water `gap` apart, the second downwind of the first (the
 * first holds the weather gauge), with land in sight but not close: the
 * water hex nearest the map's middle that is 3 or more hexes from land
 * (both ships), within 6.
 */
export function combatSite(cells: readonly MapCell[], wrap: MapWrap, toward: Point, gap: 1 | 2): CombatSite {
  const key = (h: Hex) => `${h.q},${h.r}`;
  const water = new Set(cells.filter((c) => c.terrain === "water").map((c) => key(c.hex)));
  const land = cells.filter((c) => c.terrain !== "water").map((c) => c.hex);
  const landDistance = (h: Hex) => Math.min(...land.map((l) => wrappedDistance(h, l, wrap)));
  const [cx, cz] = middleOf(cells);
  // The neighbour step that points most nearly downwind.
  const origin = hex(0, 0);
  const step = neighbors(origin).reduce((best, n) => (along(n, toward) > along(best, toward) ? n : best));
  const partner = (h: Hex) => hex(h.q + gap * step.q, h.r + gap * step.r);
  const candidates = cells
    .filter((c) => water.has(key(c.hex)) && water.has(key(partner(c.hex))))
    .map((c) => ({ h: c.hex, d: Math.min(landDistance(c.hex), landDistance(partner(c.hex))) }))
    .filter(({ d }) => d >= 3 && d <= 6)
    .sort((p, q) => dist2(p.h, cx, cz) - dist2(q.h, cx, cz));
  const a = candidates[0]?.h ?? cells[0].hex;
  return { a, b: partner(a), heading: downwindHeading(toward) + Math.PI / 2 };
}

function along(h: Hex, toward: Point): number {
  const [x, , z] = hexToWorld(h);
  return (x * toward[0] + z * toward[1]) / Math.hypot(x, z);
}

function middleOf(cells: readonly MapCell[]): [number, number] {
  let x = 0, z = 0;
  for (const c of cells) {
    const [wx, , wz] = hexToWorld(c.hex);
    x += wx;
    z += wz;
  }
  return [x / cells.length, z / cells.length];
}

function dist2(h: Hex, cx: number, cz: number): number {
  const [x, , z] = hexToWorld(h);
  return (x - cx) ** 2 + (z - cz) ** 2;
}
