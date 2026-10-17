import { describe, it, expect } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";
import { createShipWindUniforms } from "./shipWind";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel, isShipOwnMaterial } from "./shipDressing";
import { fadeShipModel, setMaterialFade } from "./shipFade";

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

describe("setMaterialFade (#135)", () => {
  it("stays opaque at full opacity, asking for no recompile", () => {
    const material = new MeshStandardMaterial();
    const version = material.version;
    setMaterialFade(material, 1);
    expect(material.transparent).toBe(false);
    expect(material.version).toBe(version);
  });

  it("turns transparent once, as the fade begins, and asks for one recompile only then", () => {
    const material = new MeshStandardMaterial();
    const version = material.version;
    setMaterialFade(material, 0.9);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.9);
    expect(material.version).toBe(version + 1);
    setMaterialFade(material, 0.5);
    setMaterialFade(material, 0.2);
    expect(material.opacity).toBe(0.2);
    expect(material.version).toBe(version + 1);
  });

  it("goes back to opaque if she is drawn at full opacity again", () => {
    const material = new MeshStandardMaterial();
    setMaterialFade(material, 0.5);
    setMaterialFade(material, 1);
    expect(material.transparent).toBe(false);
  });

  it("keeps a material that was transparent afloat transparent at full opacity", () => {
    const material = new MeshStandardMaterial({ transparent: true });
    const version = material.version;
    setMaterialFade(material, 1, true);
    setMaterialFade(material, 0.5, true);
    setMaterialFade(material, 1, true);
    expect(material.transparent).toBe(true);
    expect(material.version).toBe(version);
  });

  it("stops drawing once she has faded out, and draws again above nothing", () => {
    const material = new MeshStandardMaterial();
    setMaterialFade(material, 0);
    expect(material.visible).toBe(false);
    setMaterialFade(material, 0.01);
    expect(material.visible).toBe(true);
  });
});

describe("fadeShipModel (#135)", () => {
  it("stops drawing every part of her once she has faded out", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    const fade = fadeShipModel(ship);
    fade.setOpacity(0);
    for (const material of materialsOf(ship)) expect(material.visible).toBe(false);
  });

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

  it("stays opaque, and compiles nothing new, until she starts to fade", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    const fade = fadeShipModel(ship);
    fade.setOpacity(1);
    for (const material of materialsOf(ship)) {
      expect(material.opacity).toBe(1);
      expect(material.transparent).toBe(false);
    }
  });

  it("turns transparent once, as the fade begins, and asks for one recompile only then", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    const fade = fadeShipModel(ship);
    fade.setOpacity(1);
    const versions = materialsOf(ship).map((material) => material.version);
    fade.setOpacity(0.9);
    const turned = materialsOf(ship).map((material) => material.version);
    turned.forEach((version, k) => expect(version).toBe(versions[k] + 1));
    fade.setOpacity(0.5);
    fade.setOpacity(0.1);
    expect(materialsOf(ship).map((material) => material.version)).toEqual(turned);
    for (const material of materialsOf(ship)) expect(material.transparent).toBe(true);
  });

  it("fades the wind copies the dressing owns too: her canvas and cloth go transparent", () => {
    const { merged } = mergedShip();
    const { ship } = dressedShip(merged, new MeshStandardMaterial());
    const windy = meshesOf(ship).filter((mesh) => mesh.userData.wind);
    expect(windy.length).toBeGreaterThan(0);
    for (const mesh of windy) expect(isShipOwnMaterial(mesh.material as Material)).toBe(true);
    fadeShipModel(ship).setOpacity(0.4);
    for (const mesh of windy) {
      const material = mesh.material as Material;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.4);
    }
  });

  it("survives a re-dress mid-sink: fade, undress, dress in a new colour, fade again, leaving nothing behind", () => {
    const { merged, loaded } = mergedShip();
    const flag = new MeshStandardMaterial({ name: "England" });
    const ship = merged.clone(true);
    const loadedMaterials = materialsOf(ship);
    const disposed = new Set<Material>();
    const track = () => materialsOf(ship).forEach((material) => material.addEventListener("dispose", () => disposed.add(material)));

    let undress = dressShipModel(ship, { colour: "#3b82f6", flagMaterial: flag, wind: createShipWindUniforms() });
    let fade = fadeShipModel(ship);
    fade.setOpacity(0.6);
    const first = materialsOf(ship);
    track();
    fade.dispose();
    undress();
    materialsOf(ship).forEach((material, k) => expect(material).toBe(loadedMaterials[k]));
    for (const material of first) expect(disposed.has(material)).toBe(true);

    undress = dressShipModel(ship, { colour: "#ef4444", flagMaterial: flag, wind: createShipWindUniforms() });
    fade = fadeShipModel(ship);
    fade.setOpacity(0.3);
    const second = materialsOf(ship);
    for (const material of second) {
      expect(first).not.toContain(material);
      expect(material.opacity).toBe(0.3);
      expect(material.transparent).toBe(true);
    }
    track();
    fade.dispose();
    undress();
    materialsOf(ship).forEach((material, k) => expect(material).toBe(loadedMaterials[k]));
    for (const material of second) expect(disposed.has(material)).toBe(true);
    // The shared materials were never faded, nor disposed.
    for (const material of [...loaded, flag]) {
      expect(disposed.has(material)).toBe(false);
      expect(material.transparent).toBe(false);
    }
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
    materialsOf(ship).forEach((material, k) => expect(material).toBe(before[k]));
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
