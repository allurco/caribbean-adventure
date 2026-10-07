/**
 * Shore boulders (issue #49, slice 2). Pure, no Three.js.
 *
 * Rocks along the waterline and just below it, so the surf (#38 step 7) and
 * the shallows have something to break against. Nothing is stored in G: the
 * boulders are derived from the map's coastal cell edges, the shared terrain
 * field's coast-distance channel and a hash of the terrain seed, so every
 * client draws the same ones. Each boulder is placed once from its canonical
 * cell; the world copies redraw the same instances (#36).
 *
 * Per coastal edge (a land cell's edge onto a water neighbour, the wrap
 * respected): a few points are sampled along it, each offset a little inland
 * or offshore, thinned by the hash, and kept only where the field's signed
 * coast distance falls in a band straddling the waterline, so the boulders
 * follow the noisy coastline rather than the hex edge. The edge a pier faces
 * is left clear. Only the coasts of `SHORE_BOULDER_BIOMES` land cells (rock
 * and grass) get boulders: a sandy beach meets the sea clean, emergent and
 * submerged alike. Each edge hashes on its own, so skipping the sand coasts
 * leaves the boulders on the others exactly where they were.
 *
 * Two placement rules keep the sea lanes open. A ship sits at a water hex's
 * centre, ~0.87 units from the land hex's edge, with a hull ~0.4 units long
 * from its centre; so a boulder's drawn rim may pass the edge by at most
 * `MAX_OFFSHORE_REACH`, and must keep `SHIP_HULL_CLEARANCE` from every water
 * hex centre near it (which also covers the corners, where two water hexes
 * meet). A boulder that would break either is shrunk until it fits.
 *
 * Emergent boulders stand on the ground at their centre. The beach face is
 * ~1:21 (`seabedProfile.ts`), so within the offshore cap the water is under a
 * metre deep and any boulder readable at ship zoom would stand clear of it;
 * a share of the offshore ones are therefore sunk into the seabed until
 * their crown sits `SUBMERGED_CROWN_DEPTH_METRES` under the surface, like
 * half-buried reef rocks: drawn only in the seabed prepass, so the water
 * tints them and the wash foams over them. Anything whose crown breaks the
 * surface counts as emergent.
 */
import { canonicalHex, hexToWorld, nearestImage, neighbors, type Hex, type MapWrap } from "../../game/hex";
import type { Biome, MapCell } from "../../game/types";
import { ROCK_VARIANT_REACH } from "./rockGeometry";
import { rockVariation, type RockSizeClass, type RockVariation } from "./rockVariation";
import { SEA_LEVEL, type TerrainHeightField } from "./terrainHeightField";
import { lerpRange, seedOf, stream } from "./variationStream";
import { metresToUnits } from "./worldScale";
import { PROP_DENSITY, PROP_SCALE } from "./propScale";

/** What the boulders need of the terrain field. */
export type ShoreField = Pick<TerrainHeightField, "sampleHeight" | "sampleCoastDistance">;

export interface ShoreBoulder {
  worldX: number;
  worldY: number;
  worldZ: number;
  variation: RockVariation;
  /** Horizontal reach of the drawn rock from its centre (world units), `boulderReach`. */
  reach: number;
  /** Wholly under water: drawn only in the seabed prepass. */
  submerged: boolean;
  /** The coastal land cell it belongs to. */
  hex: Hex;
  /** The field's signed coast distance at its centre (+ land, − water). */
  coastDistance: number;
}

/** Biomes of the land cells whose coasts get boulders; sandy beaches get none. */
export const SHORE_BOULDER_BIOMES: readonly Biome[] = ["ROCK", "GRASS"];
/**
 * Boulders per allowed coastal edge the layout is tuned to (`BOULDER_KEEP_SHARE`):
 * about 55 on a small map (~93 rock/grass coast edges of ~205) and 270 on a
 * large one (~450 of ~990).
 */
export const BOULDERS_PER_COAST_EDGE = 0.6;
/** Candidate points per coastal edge; `BOULDER_KEEP_SHARE` of them are tried. */
export const BOULDER_SAMPLES_PER_EDGE = 3 * PROP_DENSITY;
/** Share of candidates tried; the rest of the thinning is the coast-distance band. */
export const BOULDER_KEEP_SHARE = 0.22;
/** Fraction of an edge kept clear at each corner, so neighbouring edges' boulders don't pile up. */
export const BOULDER_EDGE_MARGIN = 0.1;
/** Candidate offset from the hex edge, world units, positive offshore. */
export const BOULDER_OFFSET_RANGE: readonly [number, number] = [-0.45, 0.2];
/** Signed coast distance kept (+ land, − water): the waterline with the beach above and the shallows below. */
export const SHORE_BAND: readonly [number, number] = [-0.3, 0.4];
/** Farthest a drawn rim may pass its land hex's edge: a ship at the next hex centre keeps ~0.57 clear. */
export const MAX_OFFSHORE_REACH = 0.3;
/** Least distance from a drawn rim to any water hex centre: a hull (~0.4) plus a margin. */
export const SHIP_HULL_CLEARANCE = 0.55;
/** Decoration scale of a boulder (the rock mesh is ROCK_UNIT_RADIUS at 1, in the small size class). */
export const BOULDER_SCALE_RANGE: readonly [number, number] = [0.55 * PROP_SCALE, 1.2 * PROP_SCALE];
export const BOULDER_SIZE_CLASS: RockSizeClass = "small";
/** A boulder shrunk by the sea-lane rules below this reach is dropped instead. */
export const MIN_BOULDER_REACH = 0.06 * PROP_SCALE;
/** Share of the boulders whose centre is in the water that are sunk under the surface. */
export const SUBMERGED_SHARE = 0.5;
/** How far under the surface a submerged boulder's crown sits, metres: shallow enough to see and foam over. */
export const SUBMERGED_CROWN_DEPTH_METRES: readonly [number, number] = [0.4, 1.2];
/** Coast distance inland over which the wet darkening fades out. */
export const WET_BAND = 0.2;
/** How much darker a wet boulder is at the waterline (fraction of its tint). */
export const WET_DARKENING = 0.35;

const SALT = 0x3b9d2e47;
const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
/** An edge faces the pier when its outward normal is within 30° of the pier's direction. */
const COS_DOCKING_EDGE = Math.cos(Math.PI / 6);
const key = (h: Hex): number => (h.q + 1024) * 2048 + (h.r + 1024);

/** Horizontal reach of a drawn rock: its widest ring times its scale, plus the lean of its top under the tilt. */
export function boulderReach(v: RockVariation): number {
  const reach = ROCK_VARIANT_REACH[v.variant];
  const lean = Math.sin(Math.max(Math.abs(v.tilt[0]), Math.abs(v.tilt[1])));
  return reach.horizontal * Math.max(v.scale[0], v.scale[2]) + reach.top * v.scale[1] * lean;
}

/** Unit direction from a port cell's centre to its docking hex: the pier's rotation, else the docking hex itself. */
function dockingDirection(cell: MapCell, wrap: MapWrap): [number, number] | null {
  const pier = cell.decorations?.find((d) => d.type === "pier");
  if (pier) return [Math.sin(pier.rotation), Math.cos(pier.rotation)];
  if (!cell.dockingHex) return null;
  const [cx, , cz] = hexToWorld(cell.hex);
  const [dx, , dz] = hexToWorld(nearestImage(cell.hex, cell.dockingHex, wrap));
  const len = Math.hypot(dx - cx, dz - cz);
  return len > 0 ? [(dx - cx) / len, (dz - cz) / len] : null;
}

/** The boulders for every coastal edge, on the ground or the seabed; `seed` is the map's terrain seed. */
export function shoreBoulders(cells: readonly MapCell[], field: ShoreField, wrap: MapWrap, seed: number): ShoreBoulder[] {
  const land = new Set<number>();
  for (const cell of cells) if (cell.terrain === "island") land.add(key(cell.hex));
  const isLand = (h: Hex): boolean => land.has(key(canonicalHex(h, wrap)));

  const boulders: ShoreBoulder[] = [];
  for (const cell of cells) {
    if (cell.terrain !== "island") continue;
    // Every edge of a cell shares its biome, so the sand gate is per cell; it
    // comes before any sampling, and each edge's hash stream is its own, so
    // the other coasts' boulders are unaffected.
    if (cell.biome === undefined || !SHORE_BOULDER_BIOMES.includes(cell.biome)) continue;
    const ring = neighbors(cell.hex);
    const waterEdges = ring.map((n) => !isLand(n));
    if (!waterEdges.some(Boolean)) continue;

    const [cx, , cz] = hexToWorld(cell.hex);
    const docking = dockingDirection(cell, wrap);

    // Each water edge's outward unit normal and midpoint, for the offshore cap.
    const edges = ring.map((n, i) => {
      const [nx, , nz] = hexToWorld(n);
      return { water: waterEdges[i], ux: (nx - cx) / SQRT3, uz: (nz - cz) / SQRT3, mx: (cx + nx) / 2, mz: (cz + nz) / 2 };
    });
    // Water hex centres within two hexes: where a ship could sit.
    const waterCentres: [number, number][] = [];
    const seen = new Set<number>([key(cell.hex)]);
    for (const n of ring) {
      for (const m of [n, ...neighbors(n)]) {
        if (seen.has(key(m))) continue;
        seen.add(key(m));
        if (isLand(m)) continue;
        const [x, , z] = hexToWorld(m);
        waterCentres.push([x, z]);
      }
    }
    const pastWaterEdges = (x: number, z: number): number => {
      let past = -Infinity;
      for (const e of edges) {
        if (!e.water) continue;
        past = Math.max(past, (x - e.mx) * e.ux + (z - e.mz) * e.uz);
      }
      return past;
    };
    const nearestWaterCentre = (x: number, z: number): number => {
      let nearest = Infinity;
      for (const [wx, wz] of waterCentres) nearest = Math.min(nearest, Math.hypot(x - wx, z - wz));
      return nearest;
    };

    edges.forEach((edge, edgeIndex) => {
      if (!edge.water) return;
      if (docking && edge.ux * docking[0] + edge.uz * docking[1] > COS_DOCKING_EDGE) return;
      // The seed goes in through the salt: seedOf quantises its values by 4096,
      // which would drop a 32-bit seed's top bits (see smallStones.ts).
      const next = stream(seedOf([cell.hex.q, cell.hex.r, edgeIndex], SALT ^ seed));

      for (let i = 0; i < BOULDER_SAMPLES_PER_EDGE; i++) {
        // Every candidate draws the same numbers, kept or not, so the stream stays aligned.
        const keep = next() < BOULDER_KEEP_SHARE;
        const along = lerpRange([BOULDER_EDGE_MARGIN - 0.5, 0.5 - BOULDER_EDGE_MARGIN], next());
        const offset = lerpRange(BOULDER_OFFSET_RANGE, next());
        const scale = lerpRange(BOULDER_SCALE_RANGE, next());
        const rotation = next() * TAU;
        const sinkRoll = next();
        const crownRoll = next();
        if (!keep) continue;

        // Along the edge (its tangent is the normal turned a quarter), then out along the normal.
        const x = edge.mx - edge.uz * along + edge.ux * offset;
        const z = edge.mz + edge.ux * along + edge.uz * offset;
        const coastDistance = field.sampleCoastDistance(x, z);
        if (coastDistance < SHORE_BAND[0] || coastDistance > SHORE_BAND[1]) continue;

        // The rock's look, from the shared rock variation; its own bury is
        // dropped (the sinking below is explicit) and it darkens where wet.
        const wet = Math.max(0, Math.min(1, 1 - coastDistance / WET_BAND));
        let variation: RockVariation = {
          ...rockVariation({ worldX: x, worldY: 0, worldZ: z, rotation, scale, biome: cell.biome }, BOULDER_SIZE_CLASS),
          bury: 0,
        };
        variation = { ...variation, tint: variation.tint * (1 - wet * WET_DARKENING) };

        // Sea lanes: shrink to the allowed reach, or drop if that leaves nothing to see.
        let reach = boulderReach(variation);
        const allowed = Math.min(MAX_OFFSHORE_REACH - pastWaterEdges(x, z), nearestWaterCentre(x, z) - SHIP_HULL_CLEARANCE);
        if (reach > allowed) {
          if (allowed < MIN_BOULDER_REACH) continue;
          const k = allowed / reach;
          variation = { ...variation, scale: [variation.scale[0] * k, variation.scale[1] * k, variation.scale[2] * k] };
          reach = allowed;
        }

        const ground = field.sampleHeight(x, z);
        const top = ROCK_VARIANT_REACH[variation.variant].top * variation.scale[1];
        let worldY = ground;
        if (ground < SEA_LEVEL && sinkRoll < SUBMERGED_SHARE) {
          const crown = metresToUnits(lerpRange(SUBMERGED_CROWN_DEPTH_METRES, crownRoll));
          worldY = Math.min(ground, SEA_LEVEL - crown - top);
        }
        boulders.push({
          worldX: x,
          worldY,
          worldZ: z,
          variation,
          reach,
          submerged: worldY + top <= SEA_LEVEL,
          hex: cell.hex,
          coastDistance,
        });
      }
    });
  }
  return boulders;
}
