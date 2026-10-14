/**
 * An island's look (#177, #158): its archetype (`islandArchetypes.ts`) and the
 * continuous parameters drawn within that archetype's bands. Pure, board-side.
 *
 * Each parameter draws from its own sub-seed of the world seed,
 * `stream(subSeed(G.mapSeed, "islandLook", islandId, parameter))`, so adding
 * or retuning one never reshuffles another (ADR 0007). Nothing is stored in
 * `G`, and nothing here changes a cell's `terrain` or `elevation`.
 *
 * Wired in this slice to what the board already draws: the rock tint and the
 * beach width (the land mesh's colour, `landLookAt`), the vegetation density
 * and species mix (palm companions and shrub counts, `treeFactor`,
 * `shrubFactor`) and the boulder count (shore boulders, `boulderFactor`).
 * The rest are drawn now so the stream is locked, for the slices that consume
 * them: the peak height, summit offset and ruggedness for the field's peak
 * and landform terms (#171, #182), the broadleaf and mangrove shares for the
 * canopy and the mangrove fringe (#172, #182), the reef extent and lagoon
 * tint for the reef ring (#182, #173), and the archetype itself for the
 * waterfalls (#183: volcanic peaks and jungle highlands only).
 */
import { canonicalHex, hexToWorld, worldToHex, type Hex, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { islandArchetypes, type IslandArchetype } from "./islandArchetypes";
import { cellId, findIslands, type CellId, type IslandId } from "./islands";
import { NEUTRAL_LAND_LOOK, type LandLook } from "./landMesh";
import { perMapCache } from "./perMapCache";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";
import { lerpRange } from "./variationStream";

type Band = readonly [number, number];
type Rgb = readonly [number, number, number];

/** The vegetation an island grows, as shares that sum to 1. */
export interface SpeciesMix {
  palm: number;
  /** Broadleaf jungle canopy (#172); until it lands, palms stand in for it. */
  broadleaf: number;
  shrub: number;
  /** The mangrove fringe (#182); until it lands, palms stand in for it. */
  mangrove: number;
}

export interface IslandLook {
  id: IslandId;
  archetype: IslandArchetype;
  /** Scale on the island's peak height (#171, #182). */
  peakHeight: number;
  /** Where the summit sits off its cell's centre: an angle (radians) and a share of the hex inradius (#171). */
  summitOffset: { angle: number; distance: number };
  /** 0 smooth … 1 rugged relief (#182). */
  ruggedness: number;
  /** 0 warm brown … 1 grey rock (`rockTintRgb`). */
  rockTint: number;
  /** Scale on how much grows on the island, with `speciesMix` (`treeFactor`, `shrubFactor`). */
  vegetationDensity: number;
  speciesMix: SpeciesMix;
  /** Scale on how far up the shore the sand reaches before the green (`LandLook.beachWidth`). */
  beachWidth: number;
  /** 0 … 1: how far the reef ring reaches round the island (#182, #173). */
  reefExtent: number;
  /** 0 muddy green … 1 bright turquoise shallows (#182, #173). */
  lagoonTint: number;
  /** Scale on the shore boulders along its rocky and grassy coasts (`boulderFactor`). */
  boulderCount: number;
}

/** Each archetype's bands, from decision 11's "Look" column. */
export interface LookBands {
  peakHeight: Band;
  /** The summit offset's distance, as a share of the hex inradius. */
  summitOffset: Band;
  ruggedness: Band;
  rockTint: Band;
  vegetationDensity: Band;
  /** Each species' raw weight, normalised into the mix. */
  species: Readonly<Record<keyof SpeciesMix, Band>>;
  beachWidth: Band;
  reefExtent: Band;
  lagoonTint: Band;
  boulderCount: Band;
}

export const ISLAND_LOOK_BANDS: Readonly<Record<IslandArchetype, LookBands>> = {
  // Sharp ridged summit, dark warm rock, jungle flanks.
  volcanic: {
    peakHeight: [1.1, 1.35],
    summitOffset: [0, 0.35],
    ruggedness: [0.7, 1],
    rockTint: [0, 0.3],
    vegetationDensity: [0.9, 1.15],
    species: { palm: [0.25, 0.4], broadleaf: [0.35, 0.5], shrub: [0.15, 0.25], mangrove: [0, 0.05] },
    beachWidth: [0.9, 1.1],
    reefExtent: [0.3, 0.6],
    lagoonTint: [0.4, 0.6],
    boulderCount: [1, 1.3],
  },
  // Rounded hills under dense canopy, mangrove fringe, muddy-green shallows.
  jungle: {
    peakHeight: [0.8, 1],
    summitOffset: [0, 0.35],
    ruggedness: [0.3, 0.55],
    rockTint: [0.25, 0.55],
    vegetationDensity: [1.2, 1.4],
    species: { palm: [0.15, 0.3], broadleaf: [0.4, 0.55], shrub: [0.1, 0.2], mangrove: [0.1, 0.2] },
    beachWidth: [0.85, 1],
    reefExtent: [0.2, 0.5],
    lagoonTint: [0.1, 0.35],
    boulderCount: [0.6, 0.9],
  },
  // Wide white beach, palms only, broad reef ring and lagoon tint.
  atoll: {
    peakHeight: [0.6, 0.8],
    summitOffset: [0, 0.2],
    ruggedness: [0.1, 0.3],
    rockTint: [0.45, 0.75],
    vegetationDensity: [0.75, 1],
    species: { palm: [0.7, 0.85], broadleaf: [0, 0], shrub: [0.15, 0.3], mangrove: [0, 0.05] },
    beachWidth: [1.3, 1.6],
    reefExtent: [0.8, 1],
    lagoonTint: [0.75, 1],
    boulderCount: [0.2, 0.5],
  },
  // Flat-topped table, sheer banded cliffs, thin beaches, sparse scrub.
  mesa: {
    peakHeight: [0.9, 1.05],
    summitOffset: [0, 0.2],
    ruggedness: [0.5, 0.8],
    rockTint: [0.05, 0.4],
    vegetationDensity: [0.4, 0.65],
    species: { palm: [0.15, 0.3], broadleaf: [0.05, 0.15], shrub: [0.55, 0.75], mangrove: [0, 0] },
    beachWidth: [0.8, 0.9],
    reefExtent: [0.1, 0.3],
    lagoonTint: [0.45, 0.65],
    boulderCount: [1.2, 1.6],
  },
  // Bare grey rock, wind-bent scrub; no ruin meshes in V1 (decision 9).
  rocky: {
    peakHeight: [0.8, 1],
    summitOffset: [0, 0.35],
    ruggedness: [0.6, 0.9],
    rockTint: [0.6, 1],
    vegetationDensity: [0.15, 0.35],
    species: { palm: [0.05, 0.15], broadleaf: [0, 0], shrub: [0.85, 0.95], mangrove: [0, 0] },
    beachWidth: [0.8, 0.9],
    reefExtent: [0.2, 0.4],
    lagoonTint: [0.4, 0.6],
    boulderCount: [1.5, 2],
  },
};

/** The most any count may be scaled by an island's look, so no seed blows a family's budget. */
export const MAX_PROP_FACTOR = 2;
/**
 * The tree share of the vegetation (palm, broadleaf and mangrove) at which an
 * island keeps the palms it had before archetypes, at density 1. Set so the
 * map's mean palm factor over the sweep stays a little under 1.
 */
export const TREE_REFERENCE = 0.8;
/** The shrub share at which an island keeps the shrubs it had before archetypes, at density 1. */
export const SHRUB_REFERENCE = 0.25;

const TAU = Math.PI * 2;
const clampFactor = (f: number) => Math.min(MAX_PROP_FACTOR, Math.max(0, f));

/**
 * The palm companions an island grows, as a share of the old count: its
 * density times its tree share (palms, with broadleaf and mangrove standing
 * in as palms until #172 and #182 give them their own meshes).
 */
export const treeFactor = (look: IslandLook): number =>
  clampFactor((look.vegetationDensity * (1 - look.speciesMix.shrub)) / TREE_REFERENCE);
/** The shrubs an island grows, as a share of the old count. */
export const shrubFactor = (look: IslandLook): number => clampFactor((look.vegetationDensity * look.speciesMix.shrub) / SHRUB_REFERENCE);
/** The shore boulders along an island's coasts, as a share of the old count. */
export const boulderFactor = (look: IslandLook): number => clampFactor(look.boulderCount);

/** Warm brown (rock tint 0) and grey (1), as multipliers on the palette's rock. */
const WARM_ROCK: Rgb = [1.14, 0.95, 0.76];
const GREY_ROCK: Rgb = [0.93, 0.96, 1.0];

/** The multiplier a rock tint puts on the palette's rock colour: warm brown at 0, grey at 1. */
export function rockTintRgb(t: number): [number, number, number] {
  return [WARM_ROCK[0] + (GREY_ROCK[0] - WARM_ROCK[0]) * t, WARM_ROCK[1] + (GREY_ROCK[1] - WARM_ROCK[1]) * t, WARM_ROCK[2] + (GREY_ROCK[2] - WARM_ROCK[2]) * t];
}

export { NEUTRAL_LAND_LOOK };

/** The first number of a parameter's own stream, within its band. */
const draw = (worldSeed: number, id: IslandId, parameter: string) => stream(subSeed(worldSeed, SEED_FEATURES.islandLook, id, parameter));

function lookOf(id: IslandId, archetype: IslandArchetype, worldSeed: number): IslandLook {
  const bands = ISLAND_LOOK_BANDS[archetype];
  const value = (parameter: keyof Omit<LookBands, "species">) => lerpRange(bands[parameter], draw(worldSeed, id, parameter)());
  const summit = draw(worldSeed, id, "summitOffset");
  const summitAngle = summit() * TAU;
  const summitDistance = lerpRange(bands.summitOffset, summit());
  const species = draw(worldSeed, id, "speciesMix");
  const raw = { palm: 0, broadleaf: 0, shrub: 0, mangrove: 0 };
  for (const s of ["palm", "broadleaf", "shrub", "mangrove"] as const) raw[s] = lerpRange(bands.species[s], species());
  const total = raw.palm + raw.broadleaf + raw.shrub + raw.mangrove;
  return {
    id,
    archetype,
    peakHeight: value("peakHeight"),
    summitOffset: { angle: summitAngle, distance: summitDistance },
    ruggedness: value("ruggedness"),
    rockTint: value("rockTint"),
    vegetationDensity: value("vegetationDensity"),
    speciesMix: { palm: raw.palm / total, broadleaf: raw.broadleaf / total, shrub: raw.shrub / total, mangrove: raw.mangrove / total },
    beachWidth: value("beachWidth"),
    reefExtent: value("reefExtent"),
    lagoonTint: value("lagoonTint"),
    boulderCount: value("boulderCount"),
  };
}

/** Every island's look on a map, ordered as `findIslands`, and each land cell's. */
export interface IslandLooks {
  islands: IslandLook[];
  byCell: ReadonlyMap<CellId, IslandLook>;
  wrap: MapWrap;
}

/** Every island's look on a map (and wrap) seeded by `worldSeed` (`G.mapSeed`). */
export function islandLooks(cells: readonly MapCell[], wrap: MapWrap, worldSeed: number): IslandLooks {
  const archetypes = islandArchetypes(cells, wrap, worldSeed);
  const byCell = new Map<CellId, IslandLook>();
  const islands = findIslands(cells, wrap).map((island) => {
    const look = lookOf(island.id, archetypes.get(island.id)!, worldSeed);
    for (const h of island.cells) byCell.set(cellId(h, wrap), look);
    return look;
  });
  return { islands, byCell, wrap };
}

/** `islandLooks`, once per map, wrap and world seed (`perMapCache`). */
export const islandLooksOf = perMapCache(islandLooks);

/** The look of a cell's island; undefined on water. */
export const lookOfCell = (looks: IslandLooks, cell: { hex: Hex }): IslandLook | undefined => looks.byCell.get(cellId(cell.hex, looks.wrap));

const hexKey = (h: Hex): number => (h.q + 4096) * 8192 + (h.r + 4096);
/** The six neighbour offsets of a hex. */
const AROUND: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/**
 * The look the land mesh paints a world point with (`buildLandMesh`'s
 * `lookAt`): its hex's island's, or, on a water hex the noisy coast reaches
 * into, the island of the nearest land centre beside it; `NEUTRAL_LAND_LOOK`
 * in open water. The same in every world copy.
 */
export function landLookAt(looks: IslandLooks, wrap: MapWrap): (x: number, z: number) => LandLook {
  const byKey = new Map<number, LandLook>();
  const landLooks = new Map<IslandLook, LandLook>();
  for (const look of looks.islands) landLooks.set(look, { rockTint: rockTintRgb(look.rockTint), beachWidth: look.beachWidth });
  // Each land cell under the key of its canonical hex.
  for (const [id, look] of looks.byCell) {
    const [q, r] = id.split(",").map(Number);
    byKey.set(hexKey({ q, r, s: -q - r }), landLooks.get(look)!);
  }
  const ownLook = (h: Hex) => byKey.get(hexKey(canonicalHex(h, wrap)));
  let lastKey = NaN;
  let lastLook: LandLook | undefined;
  return (x, z) => {
    const h = worldToHex(x, z);
    const key = hexKey(h);
    if (key === lastKey && lastLook) return lastLook;
    let look = ownLook(h);
    if (!look) {
      // A water hex: the nearest land centre beside it (the coast noise stays under the inradius).
      let best = Infinity;
      for (const [dq, dr] of AROUND) {
        const n = { q: h.q + dq, r: h.r + dr, s: -h.q - dq - h.r - dr };
        const nLook = ownLook(n);
        if (!nLook) continue;
        const [nx, , nz] = hexToWorld(n);
        const d = (nx - x) ** 2 + (nz - z) ** 2;
        if (d < best) {
          best = d;
          look = nLook;
        }
      }
      // A point in a water hex only depends on its own position here, so it is not memoised.
      return look ?? NEUTRAL_LAND_LOOK;
    }
    lastKey = key;
    lastLook = look;
    return look;
  };
}
