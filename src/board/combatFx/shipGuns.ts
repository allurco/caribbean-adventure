/**
 * A ship's guns and size in its own frame (#263): the frame of the group a
 * Ship's model rides in (bow along +z, starboard toward -x, the waterline at
 * y = 0, world units). The guns are the model's own `Cannon_*` nodes, read
 * once per class when its model loads (Ship.tsx) and kept here for the
 * fight's effects. Pure apart from that one per-class table.
 */
import type { ShipClass } from "../../game/types";
import { shipDeckHeight, shipHullBox } from "../shipHull";
import { shipModel, shipModelScale } from "../shipModels";
import type { TargetSize, Vec3 } from "./broadside";

/** A model point (metres, bow along -z) in the ship's frame: turned half round and scaled, as Ship.tsx places it. */
export function modelToShipLocal(x: number, y: number, z: number): Vec3 {
  const s = shipModelScale();
  return { x: -x * s, y: y * s, z: -z * s };
}

const CANNON = /^Cannon_\d+$/;

/** The guns among a model's nodes (name and position in the model's frame, metres), in the ship's frame. */
export function gunsFromNodes(nodes: readonly { name: string; x: number; y: number; z: number }[]): Vec3[] {
  return nodes.filter((n) => CANNON.test(n.name)).map((n) => modelToShipLocal(n.x, n.y, n.z));
}

/**
 * How big a ship of `shipClass` is, its frame's units: from its model, else
 * from its hull box. Its freeboard is `shipDeckHeight`, the deck the sinking
 * fade also reads (#135): for a box, the top of the box as it is drawn,
 * riding above the waterline.
 */
export function shipSize(shipClass: ShipClass | undefined): TargetSize {
  const model = shipModel(shipClass);
  const hull = shipHullBox(shipClass);
  const freeboard = shipDeckHeight(shipClass);
  if (!model) return { length: hull[2], beam: hull[0], freeboard, masthead: hull[1] * 3 };
  const s = shipModelScale();
  return {
    length: model.lengthMetres * s,
    beam: model.beamMetres * s,
    freeboard,
    masthead: model.mastheadMetres * s,
  };
}

const gunsByClass = new Map<ShipClass, Vec3[]>();

/** Keeps a class's guns once its model has loaded. */
export function registerShipGuns(shipClass: ShipClass, guns: Vec3[]): void {
  if (!gunsByClass.has(shipClass)) gunsByClass.set(shipClass, guns);
}

/** A class's guns, or a row of stand-ins along each side while its model loads (or for a box). */
export function shipGuns(shipClass: ShipClass | undefined): readonly Vec3[] {
  const known = shipClass ? gunsByClass.get(shipClass) : undefined;
  if (known && known.length > 0) return known;
  const size = shipSize(shipClass);
  const row = [-0.3, -0.15, 0, 0.15, 0.3];
  return [1, -1].flatMap((side) => row.map((u) => ({ x: (side * size.beam) / 2, y: size.freeboard * 0.7, z: u * size.length })));
}
