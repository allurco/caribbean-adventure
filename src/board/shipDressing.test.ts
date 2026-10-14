import { describe, it, expect } from "vitest";
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel } from "./shipDressing";

const meshesOf = (object: Object3D): Mesh[] => {
  const meshes: Mesh[] = [];
  object.traverse((child) => {
    if ((child as Mesh).isMesh) meshes.push(child as Mesh);
  });
  return meshes;
};

const part = (name: string, material: MeshStandardMaterial, y: number): Mesh => {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.y = y;
  return mesh;
};

/** A class's model as the board merges it: canvas, a timber hull, a white pennant and band, and the flag. */
const mergedShip = () => {
  const canvas = new MeshStandardMaterial({ name: "Canvas" });
  const timber = new MeshStandardMaterial({ name: "Timber" });
  const pennant = new MeshStandardMaterial({ name: "Pennant", color: "#ffffff" });
  const band = new MeshStandardMaterial({ name: "SailBand", color: "#ffffff" });
  const scene = new Group();
  scene.add(part("Hull", timber, 0), part("Sails", canvas, 4), part("Jolly_Roger", canvas, 8), part("Pennant", pennant, 9), part("Sail_Band", band, 4));
  return { merged: mergeShipModel(scene, ["Pennant", "Sail_Band"], "Jolly_Roger"), canvas, timber, pennant, band };
};

const tintedOf = (ship: Object3D) => meshesOf(ship).filter((mesh) => mesh.userData.tinted);
const flagOf = (ship: Object3D) => meshesOf(ship).find((mesh) => mesh.userData.flag)!;
const colourOf = (mesh: Mesh) => (mesh.material as MeshStandardMaterial).color.getHexString();

describe("dressShipModel", () => {
  it("colours each tinted part in the owner's colour and nothing else", () => {
    const { merged, canvas, timber } = mergedShip();
    const ship = merged.clone(true);
    dressShipModel(ship, { colour: "#3b82f6", flagMaterial: new MeshStandardMaterial() });
    expect(tintedOf(ship)).toHaveLength(2);
    for (const mesh of tintedOf(ship)) expect(colourOf(mesh)).toBe(new Color("#3b82f6").getHexString());
    const plain = meshesOf(ship).filter((mesh) => !mesh.userData.tinted && !mesh.userData.flag);
    expect(new Set(plain.map((mesh) => mesh.material))).toEqual(new Set([canvas, timber]));
  });

  it("flies the flag's material on the flag", () => {
    const { merged } = mergedShip();
    const ship = merged.clone(true);
    const flag = new MeshStandardMaterial({ name: "England" });
    dressShipModel(ship, { colour: "#3b82f6", flagMaterial: flag });
    expect(flagOf(ship).material).toBe(flag);
  });

  it("never changes another ship's colour: each ship tints its own material copies, sharing the geometry", () => {
    const { merged, pennant, band } = mergedShip();
    const blue = merged.clone(true);
    const red = merged.clone(true);
    dressShipModel(blue, { colour: "#3b82f6", flagMaterial: new MeshStandardMaterial() });
    dressShipModel(red, { colour: "#ef4444", flagMaterial: new MeshStandardMaterial() });
    const [blueParts, redParts] = [tintedOf(blue), tintedOf(red)];
    blueParts.forEach((mesh, k) => {
      expect(mesh.material).not.toBe(redParts[k].material);
      expect(mesh.geometry).toBe(redParts[k].geometry);
      expect(colourOf(mesh)).not.toBe(colourOf(redParts[k]));
    });
    // the loaded white materials stay white for the next ship
    expect(pennant.color.getHexString()).toBe("ffffff");
    expect(band.color.getHexString()).toBe("ffffff");
  });

  it("disposes only the copies it made when the ship goes", () => {
    const { merged, pennant } = mergedShip();
    const ship = merged.clone(true);
    const flag = new MeshStandardMaterial();
    const disposed: string[] = [];
    pennant.addEventListener("dispose", () => disposed.push("loaded"));
    flag.addEventListener("dispose", () => disposed.push("flag"));
    const copies = tintedOf(ship);
    const undress = dressShipModel(ship, { colour: "#3b82f6", flagMaterial: flag });
    for (const mesh of tintedOf(ship)) (mesh.material as MeshStandardMaterial).addEventListener("dispose", () => disposed.push("copy"));
    undress();
    expect(disposed).toEqual(copies.map(() => "copy"));
  });
});
