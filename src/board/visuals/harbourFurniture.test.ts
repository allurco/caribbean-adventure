/**
 * The harbour's furniture on a few maps (#181); the 200-seed sweep of every
 * map size is `src/testSupport/villagePlacementSweep.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld, neighbors, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { decorationLayout, type DecorationPlacements } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { sharedTerrainField } from "./sharedTerrainField";
import { SEA_LEVEL } from "./terrainHeightField";
import { cellId } from "./islands";
import { townCellsBound } from "./townCells";
import { pieceClearRadius, circleHitsRect } from "./townDetailLayout";
import { PIER_END_DEPTH } from "./pierPlacement";
import { QUAY_DECK } from "./quayGeometry";
import { overlaps, pierRect, polylineDistance, quayRect, VILLAGE_DRY_HEIGHT, villageWalls, wallGround } from "./villageLayout";
import { craneFoot, hallFoot, harbourFurniture, pierLine, PIER_SHIP_CLEARANCE, PORT_CRANES, PORT_PIERS, QUAY_FLAG_SPOT, type PortFurniture } from "./harbourFurniture";
import { CRANE_FOOT, CRANE_JIB_TIP } from "./harbourPieces";
import { townAnchors } from "./townAnchors";
import { villageAnchors, VILLAGE_PLAN, VILLAGE_EAVE } from "./villageBuildingGeometry";

/** A map laid out as the board lays it out. */
interface Laid {
  size: MapSizeId;
  seed: number;
  wrap: MapWrap;
  cells: MapCell[];
  ground: ReturnType<typeof landSurface>;
  layout: DecorationPlacements;
}

function laid(size: MapSizeId, seed: number): Laid {
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  return { size, seed, wrap, cells, ground: landSurface(sharedTerrainField(cells, wrap, seed)), layout: decorationLayout(cells, wrap, seed) };
}

/** Each port's furniture with its plan and its cell. */
function portsOf(m: Laid) {
  return m.layout.village.furniture.map((f) => {
    const plan = m.layout.village.ports.find((p) => p.portId === f.portId)!;
    const cell = m.cells.find((c) => c.hasPort && cellId(c.hex, null) === f.portId)!;
    return { f, plan, cell };
  });
}

/** The world centres of the water hexes round a town's cells. */
function waterRound(m: Laid, hexes: readonly { q: number; r: number; s: number }[]): [number, number][] {
  const byId = new Map(m.cells.map((c) => [cellId(c.hex, m.wrap), c]));
  const out: [number, number][] = [];
  for (const h of hexes) {
    for (const n of neighbors(h)) {
      if (byId.get(cellId(n, m.wrap))?.terrain === "island") continue;
      const [x, , z] = hexToWorld(n);
      out.push([x, z]);
    }
  }
  return out;
}

const TIMEOUT = 30_000;

describe("the harbour's furniture (#181)", () => {
  let maps: Laid[];
  beforeAll(() => {
    maps = [laid("small", 1), laid("small", 2), laid("small", 3), laid("medium", 1)];
  }, 60_000);

  it("gives every port its own pier and one to three more where its shore allows: two to four in all", () => {
    let ports = 0;
    for (const m of maps) {
      for (const { f } of portsOf(m)) {
        ports++;
        if (f.room.piers === 0) continue;
        expect(1 + f.piers.length).toBeGreaterThanOrEqual(PORT_PIERS[0]);
        expect(1 + f.piers.length).toBeLessThanOrEqual(PORT_PIERS[1]);
      }
    }
    expect(ports).toBeGreaterThan(20);
  });

  it("starts every further pier on the town's cells at the shore, runs it out over the water and keeps it clear of every ship's hex", () => {
    for (const m of maps) {
      for (const { f, plan } of portsOf(m)) {
        const bound = townCellsBound(plan.town);
        const ships = waterRound(m, plan.town.cells);
        for (const p of f.piers) {
          const [from, to] = pierLine(p);
          expect(bound.contains(from[0], from[1], 0)).toBe(true);
          expect(m.ground.sampleHeight(from[0], from[1])).toBeGreaterThan(SEA_LEVEL);
          expect(m.ground.sampleHeight(to[0], to[1])).toBeLessThan(SEA_LEVEL - PIER_END_DEPTH);
          for (const [x, z] of ships) expect(polylineDistance(x, z, [from, to])).toBeGreaterThanOrEqual(PIER_SHIP_CLEARANCE - 1e-9);
        }
      }
    }
  });

  it("keeps the piers off one another, the quay and every building", () => {
    for (const m of maps) {
      for (const { f, plan } of portsOf(m)) {
        const decks = [plan.pier, ...f.piers].map(pierRect);
        for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) expect(overlaps(decks[i], decks[j], 0)).toBe(false);
        for (const deck of decks.slice(1)) {
          for (const q of plan.quays) expect(overlaps(deck, quayRect(q), 0)).toBe(false);
          for (const w of plan.walls) expect(overlaps(deck, w, 0)).toBe(false);
        }
      }
    }
  });

  it("stands one or two cranes where a pier has room beside it, on dry ground on the town's cells, the jib out over the water", () => {
    let withCranes = 0;
    let ports = 0;
    for (const m of maps) {
      for (const { f, plan } of portsOf(m)) {
        ports++;
        if (f.room.cranes > 0) {
          expect(f.cranes.length).toBeGreaterThanOrEqual(PORT_CRANES[0]);
          withCranes++;
        }
        expect(f.cranes.length).toBeLessThanOrEqual(PORT_CRANES[1]);
        const bound = townCellsBound(plan.town);
        const roots = [plan.pier, ...f.piers].map((p) => pierLine(p)[0]);
        for (const c of f.cranes) {
          const foot = craneFoot(c);
          expect(bound.contains(c.x, c.z, Math.hypot(foot.halfW, foot.halfD))).toBe(true);
          const { bottom, top } = wallGround(m.ground, foot);
          // Not on water: the whole foot on dry ground, standing on it.
          expect(bottom).toBeGreaterThan(VILLAGE_DRY_HEIGHT);
          // On it: a hair under its highest ground, its footing reaching under its lowest.
          expect(c.y).toBeLessThanOrEqual(top);
          expect(top - c.y).toBeLessThan(0.01 * c.scale);
          expect(c.y - CRANE_FOOT.depth * c.scale).toBeLessThan(bottom);
          // Beside a pier's root, its jib's tip further out than its foot.
          expect(Math.min(...roots.map(([x, z]) => Math.hypot(x - c.x, z - c.z)))).toBeLessThan(0.6);
          expect(c.tip[1] - c.y).toBeCloseTo(CRANE_JIB_TIP[1] * c.scale, 9);
          for (const b of m.layout.village.buildings) expect(overlaps(villageWalls(b), foot, 0)).toBe(false);
        }
      }
    }
    expect(withCranes / ports).toBeGreaterThan(0.9);
  });

  it("raises a market hall at nearly every port, on dry ground on the town's cells, off the streets and clear of every building", () => {
    let halls = 0;
    let ports = 0;
    for (const m of maps) {
      for (const { f, plan } of portsOf(m)) {
        ports++;
        if (!f.hall) continue;
        halls++;
        const foot = hallFoot(f.hall);
        const posts = hallFoot(f.hall, false);
        expect(townCellsBound(plan.town).contains(f.hall.x, f.hall.z, Math.hypot(foot.halfW, foot.halfD))).toBe(true);
        expect(wallGround(m.ground, posts).bottom).toBeGreaterThan(VILLAGE_DRY_HEIGHT);
        for (const s of plan.streets) expect(polylineDistance(f.hall.x, f.hall.z, s.line)).toBeGreaterThan(s.halfWidth);
        for (const b of m.layout.village.buildings) {
          if (Math.hypot(b.worldX - plan.cx, b.worldZ - plan.cz) > 2) continue;
          const eaves = { x: b.worldX, z: b.worldZ, fx: Math.sin(b.yaw), fz: Math.cos(b.yaw), halfW: (VILLAGE_PLAN[b.variant].halfW + VILLAGE_EAVE[b.variant]) * b.scale, halfD: (VILLAGE_PLAN[b.variant].halfD + VILLAGE_EAVE[b.variant]) * b.scale };
          expect(overlaps(eaves, foot, 0)).toBe(false);
        }
      }
    }
    expect(halls / ports).toBeGreaterThan(0.85);
  });

  it("flies the port's nation over its watchtower and its quay, the black flag only at a pirate haven, and stores nothing in G", () => {
    let pirates = 0;
    for (const m of maps) {
      const before = JSON.stringify(m.cells);
      for (const { f, cell, plan } of portsOf(m)) {
        expect(f.flags.map((g) => g.mount).sort()).toEqual(["quay", "tower"]);
        for (const g of f.flags) {
          expect(g.nation).toBe(cell.nation);
          expect(g.nation === "Pirate").toBe(cell.nation === "Pirate");
        }
        if (cell.nation === "Pirate") pirates++;
        // The quay's pole stands on its deck, over dry ground.
        const quay = plan.quays[0];
        const pole = f.flags.find((g) => g.mount === "quay")!;
        expect(pole.foot![1]).toBeCloseTo(quay.top, 9);
        expect(QUAY_FLAG_SPOT[0]).toBeGreaterThan(QUAY_DECK.minX);
        expect(QUAY_FLAG_SPOT[1]).toBeGreaterThan(QUAY_DECK.minZ);
        expect(m.ground.sampleHeight(pole.foot![0], pole.foot![2])).toBeGreaterThan(SEA_LEVEL);
      }
      expect(JSON.stringify(m.cells)).toBe(before);
    }
    expect(pirates).toBeGreaterThan(0);
  });

  it("keeps the town's clutter clear of every crane, hall and further pier", () => {
    for (const m of maps) {
      for (const { f } of portsOf(m)) {
        const rects = [...f.piers.map(pierRect), ...f.cranes.map(craneFoot), ...(f.hall ? [hallFoot(f.hall)] : [])];
        for (const c of m.layout.village.clutter) for (const r of rects) expect(circleHitsRect(r, c.x, c.z, pieceClearRadius(c) * 0.5)).toBe(false);
      }
    }
  });

  it("S1: the same seed lays the same furniture, from fresh caches", () => {
    const again = laid("small", 1);
    expect(again.layout.village.furniture).toEqual(maps[0].layout.village.furniture);
    const m = maps[0];
    expect(harbourFurniture(m.layout.village.ports, m.cells, m.wrap, m.ground, m.layout.buildings, m.seed).map((f) => f.portId)).toEqual(m.layout.village.furniture.map((f) => f.portId));
  }, TIMEOUT);

  it("S2: crane and pier counts vary across the ports of a map and between seeds", () => {
    const counts = (fs: readonly PortFurniture[]) => fs.map((f) => `${f.piers.length}:${f.cranes.length}`);
    for (const m of maps) {
      const c = counts(m.layout.village.furniture);
      expect(new Set(c.map((x) => x.split(":")[0])).size).toBeGreaterThan(1);
      expect(new Set(c.map((x) => x.split(":")[1])).size).toBeGreaterThan(1);
    }
    expect(counts(maps[1].layout.village.furniture)).not.toEqual(counts(maps[0].layout.village.furniture));
  });

  describe("the anchors (#181)", () => {
    it("puts every house's chimneys, windows and lantern, and every hall's lanterns, on the drawn building", () => {
      const m = maps[0];
      const { buildings, furniture, anchors } = m.layout.village;
      const sum = (k: "chimneys" | "windows" | "lanterns") => buildings.reduce((n, b) => n + villageAnchors(b.variant)[k].length, 0);
      const hallLanterns = furniture.filter((f) => f.hall).length * 2;
      expect(anchors.chimneys.length).toBe(sum("chimneys"));
      expect(anchors.windows.length).toBe(sum("windows"));
      expect(anchors.lanterns.length).toBe(sum("lanterns") + hallLanterns);
      expect(townAnchors(buildings, furniture)).toEqual(anchors);
      // Each chimney stands within its house's eaves and above its walls.
      for (const [x, y, z] of anchors.chimneys) {
        const owner = buildings.find((b) => Math.hypot(b.worldX - x, b.worldZ - z) < (VILLAGE_PLAN[b.variant].halfW + VILLAGE_EAVE[b.variant]) * b.scale * 1.5);
        expect(owner).toBeDefined();
        expect(y).toBeGreaterThan(owner!.worldY + 0.1 * owner!.scale);
      }
    });
  });
});
