/**
 * Island massifs (#83, prototype): a seeded set of flat-topped, steep-flanked
 * rock bodies per island, a term in the one terrain height field (ADR 0001),
 * never a separate mesh. Pure, no Three.js.
 *
 * Each massif is a rounded polygon in plan (a radius modulated by a few
 * cosine facets), a plateau over the inner MASSIF_PLATEAU of that radius and
 * a smoothstep flank down to nothing at the rim. Massifs sit on elevation 2–3
 * hexes, keep MASSIF_PORT_CLEARANCE from every port centre so the port hex
 * stays the flat beach the quay and buildings need, and respect the camera's
 * view line: the camera looks due north (−z) pitched CAMERA_PITCH down, so a
 * massif south of a port, inside a cone behind it, has its top capped under
 * the line of sight from the port's beach to the camera, and is dropped if
 * that leaves it no rise worth drawing.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, wrapWorldWidth, type MapWrap } from "../../game/hex";
import { CAMERA_OFFSET } from "../cameraBounds";
import { ELEVATION_HEIGHTS } from "./elevationHeights";

export interface Massif {
  x: number;
  z: number;
  /** Mean plan radius (world units). */
  radius: number;
  /** Absolute top height (world Y) of the plateau at the centre. */
  top: number;
  /** Rotation of the facet pattern (radians). */
  yaw: number;
  /** Number of cosine facets round the rim. */
  facets: number;
  /** Elevation of the host hex (2 or 3). */
  elevation: number;
}

/** Massifs per island with at least one elevation 2–3 hex. */
export const MASSIF_COUNT = { min: 2, max: 5 } as const;
/** Plan radius range (world units); the hex inradius is 0.866. */
export const MASSIF_RADIUS = { min: 0.45, max: 0.8 } as const;
/** Rise of the plateau above the host hex's elevation height, by elevation. */
export const MASSIF_RISE: Readonly<Record<2 | 3, { min: number; max: number }>> = {
  2: { min: 0.35, max: 0.65 },
  3: { min: 0.45, max: 0.9 },
};
/** Fraction of the radius that is flat top; the flank takes the rest. */
export const MASSIF_PLATEAU = 0.5;
/** Amplitude of the plan facets, as a fraction of the radius. */
export const MASSIF_FACET_AMPLITUDE = 0.14;
/** How far a massif centre may wander from its host hex centre. */
const MASSIF_CENTRE_JITTER = 0.4;
/** Least distance from a port centre to a massif's rim: a hex circumradius plus a little. */
export const MASSIF_PORT_CLEARANCE = 1.05;
/** The shore ramp beside a massif pulls in to this (world units; the normal ramp is 0.9). */
export const MASSIF_SHORE_RAMP = 0.4;
/** How far past its rim a massif pulls the shore ramp in (fades to nothing). */
export const MASSIF_SHORE_REACH = 0.9;
/** A massif's own ramp from the coast: it reaches full height this far inland. */
export const MASSIF_COAST_RAMP = 0.45;
/** Smooth-max width where a massif meets the relief (world units). */
export const MASSIF_BLEND = 0.1;
/** Below this rise over the host hex's elevation height a capped massif is dropped. */
export const MASSIF_MIN_RISE = 0.25;

/** View line: tan of the camera pitch (rise per unit of ground towards the camera, +z). */
export const VIEW_LINE_SLOPE = CAMERA_OFFSET[1] / Math.hypot(CAMERA_OFFSET[0], CAMERA_OFFSET[2]);
/** Half-width of the cone south of a port that the cap applies in, at the port. */
export const VIEW_CONE_HALF_WIDTH = 1.0;
/** How much wider the cone gets per unit south of the port. */
export const VIEW_CONE_SPREAD = 0.35;
/** Margin kept under the line of sight (world units). */
export const VIEW_MARGIN = 0.15;
/** Height the line of sight starts at over the port centre: the beach's elevation height. */
export const VIEW_EYE_HEIGHT = ELEVATION_HEIGHTS[1];

const HEX_DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const key = (q: number, r: number) => `${q},${r}`;

const smoothstep = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

/**
 * Cap on a massif's top under every port's view line, or null if no port
 * cone contains it. The line runs from VIEW_EYE_HEIGHT over the port centre
 * up towards the camera (+z) at VIEW_LINE_SLOPE; the whole massif stays under
 * it if its top is under the line's height at the massif's near rim.
 */
export function viewLineCap(
  massif: { x: number; z: number; radius: number },
  ports: readonly { x: number; z: number }[]
): number | null {
  let cap: number | null = null;
  for (const port of ports) {
    const south = massif.z - port.z;
    if (south <= 0) continue;
    const across = Math.abs(massif.x - port.x);
    if (across > VIEW_CONE_HALF_WIDTH + south * VIEW_CONE_SPREAD + massif.radius) continue;
    const nearRim = Math.max(0, south - massif.radius);
    const line = VIEW_EYE_HEIGHT + nearRim * VIEW_LINE_SLOPE - VIEW_MARGIN;
    cap = cap === null ? line : Math.min(cap, line);
  }
  return cap;
}

/**
 * Lay out the massifs of a map from the land cells and a PRNG. Islands are
 * the connected components of land hexes; each with an elevation 2–3 hex gets
 * MASSIF_COUNT massifs (more on islands with more high ground), centred on
 * those hexes with jitter, kept MASSIF_PORT_CLEARANCE from every port and
 * capped or dropped under the ports' view lines. With a wrap, each massif is
 * repeated one wrap width to either side so the seam strip sees it.
 */
export function placeMassifs(cells: readonly MapCell[], rng: () => number, wrap: MapWrap = null): Massif[] {
  const land = new Map<string, MapCell>();
  for (const cell of cells) if (cell.terrain === "island") land.set(key(cell.hex.q, cell.hex.r), cell);
  const ports: { x: number; z: number }[] = [];
  const width = wrap ? wrapWorldWidth(wrap) : 0;
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [x, , z] = hexToWorld(cell.hex);
    ports.push({ x, z });
    if (wrap) ports.push({ x: x - width, z }, { x: x + width, z });
  }

  const massifs: Massif[] = [];
  const seen = new Set<string>();
  // Cells in a stable order so the same map and seed give the same layout.
  for (const start of cells) {
    const k0 = key(start.hex.q, start.hex.r);
    if (!land.has(k0) || seen.has(k0)) continue;
    const island: MapCell[] = [];
    const queue = [k0];
    seen.add(k0);
    while (queue.length > 0) {
      const k = queue.pop()!;
      const cell = land.get(k)!;
      island.push(cell);
      for (const [dq, dr] of HEX_DIRS) {
        const nk = key(cell.hex.q + dq, cell.hex.r + dr);
        if (land.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    const hosts = island.filter((c) => c.elevation >= 2 && !c.hasPort);
    if (hosts.length === 0) continue;
    const count = Math.min(MASSIF_COUNT.max, Math.max(MASSIF_COUNT.min, hosts.length + 1));
    let placed = 0;
    for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
      // Mountains host more often than jungle.
      const weighted = hosts.filter((c) => c.elevation >= 3);
      const host = weighted.length > 0 && rng() < 0.6 ? weighted[Math.floor(rng() * weighted.length)] : hosts[Math.floor(rng() * hosts.length)];
      const [hx, , hz] = hexToWorld(host.hex);
      const angle = rng() * Math.PI * 2;
      const reach = Math.sqrt(rng()) * MASSIF_CENTRE_JITTER;
      const x = hx + Math.cos(angle) * reach;
      const z = hz + Math.sin(angle) * reach;
      const radius = MASSIF_RADIUS.min + rng() * (MASSIF_RADIUS.max - MASSIF_RADIUS.min);
      const elevation = host.elevation >= 3 ? 3 : 2;
      const rise = MASSIF_RISE[elevation];
      let top = ELEVATION_HEIGHTS[elevation] + rise.min + rng() * (rise.max - rise.min);
      const yaw = rng() * Math.PI * 2;
      const facets = 5 + Math.floor(rng() * 3);
      // Port clearance: the rim (with its facets) stays clear of every port centre.
      const rim = radius * (1 + MASSIF_FACET_AMPLITUDE);
      let clear = true;
      for (const port of ports) {
        if (Math.hypot(x - port.x, z - port.z) < rim + MASSIF_PORT_CLEARANCE) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      // View line: cap the top, or drop the massif if the cap leaves it flat.
      const cap = viewLineCap({ x, z, radius: rim }, ports);
      if (cap !== null) {
        if (cap < ELEVATION_HEIGHTS[elevation] + MASSIF_MIN_RISE) continue;
        top = Math.min(top, cap);
      }
      const massif: Massif = { x, z, radius, top, yaw, facets, elevation };
      massifs.push(massif);
      if (wrap) massifs.push({ ...massif, x: x - width }, { ...massif, x: x + width });
      placed++;
    }
  }
  return massifs;
}

/** Plan radius of a massif in direction `theta` from its centre. */
function facetedRadius(m: Massif, theta: number): number {
  return m.radius * (1 + MASSIF_FACET_AMPLITUDE * Math.cos(m.facets * (theta - m.yaw)));
}

/**
 * The massif's body height at (x, z): the plateau's top over the inner
 * MASSIF_PLATEAU of the faceted radius, a steep smoothstep flank to 0 at the
 * rim, 0 outside. The top tilts a few percent with the facets so it is not
 * dead flat.
 */
export function massifHeight(m: Massif, x: number, z: number): number {
  const dx = x - m.x;
  const dz = z - m.z;
  const r = Math.hypot(dx, dz);
  const outer = m.radius * (1 + MASSIF_FACET_AMPLITUDE);
  if (r >= outer) return 0;
  const theta = Math.atan2(dz, dx);
  const u = r / facetedRadius(m, theta);
  if (u >= 1) return 0;
  const flank = u <= MASSIF_PLATEAU ? 1 : 1 - smoothstep((u - MASSIF_PLATEAU) / (1 - MASSIF_PLATEAU));
  const tilt = 1 - 0.05 * u * (1 + 0.5 * Math.cos(theta - m.yaw));
  return m.top * tilt * flank;
}

/**
 * How much a massif pulls the shore ramp in at (x, z): 1 inside its rim,
 * fading to 0 MASSIF_SHORE_REACH past it.
 */
export function massifInfluence(m: Massif, x: number, z: number): number {
  const r = Math.hypot(x - m.x, z - m.z);
  const outer = m.radius * (1 + MASSIF_FACET_AMPLITUDE);
  return smoothstep(1 - (r - outer) / MASSIF_SHORE_REACH);
}
