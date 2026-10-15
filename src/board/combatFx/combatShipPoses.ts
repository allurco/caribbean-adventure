/**
 * Where the ships are, and where a fight puts them (#263). A rendering-side
 * registry like shipFoamSources.ts, never game state: each Ship reports its
 * animated pose from the canonical copy of the world, and while a fight
 * holds a ship (combatDirector.ts) the Ship draws the fight's pose instead
 * of its own sailing: turned to bear, recoiling, lurching, fleeing, closing
 * alongside, sinking. Written in place every frame, so it allocates nothing.
 */
import type { Object3D } from "three";

/** A ship's pose on the sea, canonical copy: world x and z, heading (bow along (sin h, cos h)). */
export interface SeaPose {
  x: number;
  z: number;
  heading: number;
}

export interface ReportedPose extends SeaPose {
  /** The group its model rides in (under its wave pose), whose world matrix places its guns. */
  anchor: Object3D | null;
  /** The x offset of the copy of the world it was reported from (WorldCopies.tsx). */
  copyX: number;
}

/** The pose a fight gives a ship: where it is, its heading, and the roll, pitch and sinking on top of its wave pose. */
export interface HeldPose extends SeaPose {
  /** Roll, radians: positive lifts the port side (the ship's local +X). */
  heel: number;
  /** Bow up, radians. */
  pitch: number;
  /** How far it has gone down, world units. */
  drop: number;
  /** It has gone under: nothing more to draw. */
  gone: boolean;
}

export interface CombatShipPoses {
  report: (id: string, pose: ReportedPose) => void;
  reported: (id: string) => Readonly<ReportedPose> | undefined;
  /** Holds `id` for the fight, starting from `from` unless it is held already; returns its pose to write. */
  hold: (id: string, from: SeaPose) => HeldPose;
  held: (id: string) => Readonly<HeldPose> | undefined;
  heldIds: () => Iterable<string>;
  release: (id: string) => void;
  releaseAll: () => void;
}

export function createCombatShipPoses(): CombatShipPoses {
  const reports = new Map<string, ReportedPose>();
  const holds = new Map<string, HeldPose>();
  return {
    report: (id, pose) => {
      const r = reports.get(id);
      if (!r) reports.set(id, { ...pose });
      else Object.assign(r, pose);
    },
    reported: (id) => reports.get(id),
    hold: (id, from) => {
      let pose = holds.get(id);
      if (!pose) holds.set(id, (pose = { x: from.x, z: from.z, heading: from.heading, heel: 0, pitch: 0, drop: 0, gone: false }));
      return pose;
    },
    held: (id) => holds.get(id),
    heldIds: () => holds.keys(),
    release: (id) => void holds.delete(id),
    releaseAll: () => holds.clear(),
  };
}

/** The board's one registry: the Ships report to it and the fight's director holds them in it. */
export const combatShipPoses = createCombatShipPoses();
