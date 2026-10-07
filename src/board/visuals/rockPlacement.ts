/**
 * Where a rock or stone stands on the height field (#53). Pure, no Three.js.
 *
 * Two things set rocks apart from trees in `placeOnGround`:
 *
 * - They stand on the ground at their own centre, not on the lowest probe
 *   under their base. A boulder's base is wide, and on a steep summit the
 *   lowest probe is far below the middle, so the lowest rule buried whole
 *   outcrops. The faceted mesh has a squashed underside below its widest
 *   ring (`ROCK_UNDERSIDE_SQUASH`) plus a bury depth, which covers the
 *   downhill side instead.
 * - The probed footprint is what is actually drawn. A rock's variation
 *   (variant, stretch, extent cap) is a hash of its X, Z, rotation and scale
 *   and never of its Y, so it can be derived for each nudge candidate here,
 *   and `Rocks.tsx` derives the same one again from the placed rock. The
 *   ground is then checked out to the rock's own drawn radius, so a rim can
 *   neither hang over the water nor over a lower neighbour the probe missed.
 */
import type { Biome } from "../../game/types";
import { nudgedTowards, standOnGround, type GroundField, type GroundSpot } from "./groundPlacement";
import { rockDrawnRadius, rockSizeClass, rockVariation, type RockSizeClass } from "./rockVariation";
import { PROP_SCALE } from "./worldScale";

/** How far below the ground at its centre a rock's origin (its widest ring) sits (at `PROP_SCALE`). */
export const ROCK_SINK = 0.02 * PROP_SCALE;
/** Steepest ground (rise over run across the drawn radius) a rock may stand on. */
export const ROCK_MAX_SLOPE = 1.6;

/** A rock to place: the decoration's scale and rotation, and the biome that sizes and colours it. */
export interface RockRequest {
  scale: number;
  rotation: number;
  biome: Biome | undefined;
  /** Sink below the centre ground; `ROCK_SINK` unless given (stones sink a little less). */
  sink?: number;
  /**
   * Size class the rock is drawn at; the biome's (`rockSizeClass`) unless
   * given. Stones pass `"small"`, as `Rocks.tsx` draws them, so the probed
   * footprint is the drawn one and not the biome's medium class on grass.
   */
  sizeClass?: RockSizeClass;
}

/**
 * Where a rock asked for at `spot` stands, nudged towards `anchor` (its cell
 * centre) off water and cliffs like any decoration, or null if nowhere on
 * the way fits its drawn extent.
 */
export function placeRock(
  field: GroundField,
  spot: { x: number; z: number },
  anchor: { x: number; z: number },
  rock: RockRequest
): GroundSpot | null {
  const sizeClass = rock.sizeClass ?? rockSizeClass(rock.biome);
  for (const candidate of nudgedTowards(spot, anchor)) {
    const variation = rockVariation(
      { worldX: candidate.x, worldY: 0, worldZ: candidate.z, rotation: rock.rotation, scale: rock.scale, biome: rock.biome },
      sizeClass
    );
    const stood = standOnGround(field, candidate.x, candidate.z, {
      footprintRadius: rockDrawnRadius(variation),
      sink: rock.sink ?? ROCK_SINK,
      maxSlope: ROCK_MAX_SLOPE,
      standOn: "centre",
    });
    if (stood) return stood;
  }
  return null;
}
