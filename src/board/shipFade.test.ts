import { describe, it, expect } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";
import { createShipWindUniforms } from "./shipWind";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel } from "./shipDressing";
import { fadeShipModel } from "./shipFade";

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

/** A class's model as the board merges it: canvas, a timber hull, a pennant and the flag, the canvas and cloth in the wind. */
const mergedShip = () => {
  const canvas = new MeshStandardMaterial({ name: "Canvas" });
  const timber = new MeshStandardMaterial({ name: "Timber" });
  const pennant = new MeshStandardMaterial({ name: "Pennant", color: "#ffffff" });
  const scene = new Group();
  scene.add(part("Hull", timber, 0), part("Sails", canvas, 4), part("Jolly_Roger", canvas, 8), part("Pennant", pennant, 9));
  const wind = { sails: "Sails", sailDecals: [], cloth: ["Jolly_Roger", "Pennant"] };
  return { merged: mergeShipModel(scene, ["Pennant"], "Jolly_Roger", wind), loaded: [canvas, timber, pennant] };
};

/** A ship of the class, dressed as the board dresses it, with or without its wind. */
const dressedShip = (merged: Group, flagMaterial: Material, windy = true) => {
  const ship = merged.clone(true);
  const undress = dressShipModel(ship, { colour: "#3b82f6", flagMaterial, wind: windy ? createShipWindUniforms() : undefined });
  return { ship, undress };
};

const materialsOf = (ship: Object3D) => meshesOf(ship).map((mesh) => mesh.material as MeshStandardMaterial);

describe("fadeShipModel (#135)", () => {
  it("fades every part of the ship to the opacity it is given", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial({ name: "England" }));
    const fade = fadeShipModel(ship);
    fade.setOpacity(0.25);
    for (const material of materialsOf(ship)) {
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.25);
    }
  });

  it("starts opaque-looking: opacity 1 until it is told otherwise", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    fadeShipModel(ship);
    for (const material of materialsOf(ship)) expect(material.opacity).toBe(1);
  });

  it("never fades another ship of the class, nor the materials they share", () => {
    const { merged, loaded } = mergedShip();
    const flag = new MeshStandardMaterial({ name: "England" });
    const { ship: sinking } = dressedShip(merged, flag, false);
    const { ship: afloat } = dressedShip(merged, flag, false);
    const afloatBefore = materialsOf(afloat);
    fadeShipModel(sinking).setOpacity(0);
    expect(materialsOf(afloat)).toEqual(afloatBefore);
    for (const material of [...materialsOf(afloat), ...loaded, flag]) {
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
    }
    // No material is shared between the sinking ship and the one afloat.
    const afloatSet = new Set(materialsOf(afloat));
    for (const material of materialsOf(sinking)) expect(afloatSet.has(material)).toBe(false);
  });

  it("keeps the ship's own copies (its colour and its wind) and fades them in place", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    const own = meshesOf(ship).filter((mesh) => mesh.userData.tinted || mesh.userData.wind);
    expect(own.length).toBeGreaterThan(0);
    const before = own.map((mesh) => mesh.material);
    fadeShipModel(ship);
    expect(own.map((mesh) => mesh.material)).toEqual(before);
  });

  it("copies the shared hull and, without a wind, the shared flag, keeping their look", () => {
    const { merged, loaded } = mergedShip();
    const flag = new MeshStandardMaterial({ name: "England" });
    const { ship } = dressedShip(merged, flag, false);
    const shared = new Set<Material>([...loaded, flag]);
    const sharedMeshes = meshesOf(ship).filter((mesh) => shared.has(mesh.material as Material));
    const names = sharedMeshes.map((mesh) => (mesh.material as Material).name);
    expect(names).toContain("England");
    expect(names).toContain("Timber");
    fadeShipModel(ship);
    sharedMeshes.forEach((mesh, k) => {
      expect(shared.has(mesh.material as Material)).toBe(false);
      expect((mesh.material as Material).name).toBe(names[k]);
    });
  });

  it("puts the shared materials back and disposes only its own copies when the ship goes", () => {
    const { merged, loaded } = mergedShip();
    const flag = new MeshStandardMaterial({ name: "England" });
    const { ship, undress } = dressedShip(merged, flag, false);
    const before = materialsOf(ship);
    const disposed: string[] = [];
    for (const material of [...loaded, flag]) material.addEventListener("dispose", () => disposed.push(`loaded ${material.name}`));
    const fade = fadeShipModel(ship);
    const after = materialsOf(ship);
    after.forEach((material, k) => {
      if (material !== before[k]) material.addEventListener("dispose", () => disposed.push("fade copy"));
      else material.addEventListener("dispose", () => disposed.push("dress copy"));
    });
    const fadeCopies = after.filter((material, k) => material !== before[k]).length;
    expect(fadeCopies).toBeGreaterThan(0);
    fade.dispose();
    expect(disposed).toEqual(Array(fadeCopies).fill("fade copy"));
    expect(materialsOf(ship)).toEqual(before);
    // The ship's own copies are the dressing's to dispose.
    undress();
    expect(disposed.filter((d) => d === "dress copy").length).toBe(after.length - fadeCopies);
  });

  it("disposes each copy once, even if disposed twice", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial(), false);
    const fade = fadeShipModel(ship);
    let count = 0;
    for (const material of materialsOf(ship)) material.addEventListener("dispose", () => count++);
    fade.dispose();
    const once = count;
    fade.dispose();
    expect(count).toBe(once);
  });
});
