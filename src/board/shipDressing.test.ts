import { describe, it, expect } from "vitest";
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";
import { createShipWindUniforms } from "./shipWind";
import { mergeShipModel } from "./shipModelMerge";
import { dressShipModel, isShipOwnMaterial } from "./shipDressing";

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

  describe("in the wind (#204)", () => {
    const windyShip = () => {
      const canvas = new MeshStandardMaterial({ name: "Canvas" });
      const timber = new MeshStandardMaterial({ name: "Timber" });
      const pennant = new MeshStandardMaterial({ name: "Pennant", color: "#ffffff" });
      const scene = new Group();
      scene.add(part("Hull", timber, 0), part("Sails", canvas, 4), part("Jolly_Roger", canvas, 8), part("Pennant", pennant, 9));
      const wind = { sails: "Sails", sailDecals: [], cloth: ["Jolly_Roger", "Pennant"] };
      return { merged: mergeShipModel(scene, ["Pennant"], "Jolly_Roger", wind), canvas, timber };
    };
    /** The uniforms a material's patched shader binds, compiled as three.js would. */
    const boundUniforms = (material: Material) => {
      const shader = { vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "", uniforms: {} as Record<string, unknown> };
      material.onBeforeCompile(shader as never, null as never);
      return shader.uniforms;
    };

    it("moves the canvas, the flag and the pennant in the ship's own wind, through its own copies, and leaves the timber be", () => {
      const { merged, canvas, timber } = windyShip();
      const ship = merged.clone(true);
      const wind = createShipWindUniforms();
      const flag = new MeshStandardMaterial({ name: "England" });
      dressShipModel(ship, { colour: "#3b82f6", flagMaterial: flag, wind });
      for (const mesh of meshesOf(ship)) {
        const material = mesh.material as Material;
        if (mesh.userData.wind) {
          expect([canvas, flag]).not.toContain(material);
          expect(boundUniforms(material).uWindDown).toBe(wind.uWindDown);
          expect(boundUniforms(mesh.customDepthMaterial!).uSailFullness).toBe(wind.uSailFullness);
        } else {
          expect(material).toBe(timber);
          expect(mesh.customDepthMaterial).toBeUndefined();
        }
      }
      // The flag's copy still flies the flag.
      expect((flagOf(ship).material as MeshStandardMaterial).name).toBe("England");
    });

    it("gives each ship its own wind: two ships' cloth never share a material", () => {
      const { merged } = windyShip();
      const [a, b] = [merged.clone(true), merged.clone(true)];
      const flag = new MeshStandardMaterial();
      dressShipModel(a, { colour: "#3b82f6", flagMaterial: flag, wind: createShipWindUniforms() });
      dressShipModel(b, { colour: "#3b82f6", flagMaterial: flag, wind: createShipWindUniforms() });
      const windy = (ship: Object3D) => meshesOf(ship).filter((mesh) => mesh.userData.wind);
      windy(a).forEach((mesh, k) => {
        expect(mesh.material).not.toBe(windy(b)[k].material);
        expect(mesh.geometry).toBe(windy(b)[k].geometry);
      });
    });

    it("puts the loaded canvas back and disposes its copies when the ship goes", () => {
      const { merged, canvas } = windyShip();
      const ship = merged.clone(true);
      const undress = dressShipModel(ship, { colour: "#3b82f6", flagMaterial: new MeshStandardMaterial(), wind: createShipWindUniforms() });
      const sails = meshesOf(ship).find((mesh) => mesh.userData.wind && !mesh.userData.flag && !mesh.userData.tinted)!;
      let disposed = false;
      (sails.material as Material).addEventListener("dispose", () => (disposed = true));
      undress();
      expect(disposed).toBe(true);
      expect(sails.material).toBe(canvas);
      expect(sails.customDepthMaterial).toBeUndefined();
    });
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

  it("marks the copies it made as the ship's own, and nothing it shares (#135)", () => {
    const { merged, canvas, timber, pennant, band } = mergedShip();
    const ship = merged.clone(true);
    const flag = new MeshStandardMaterial();
    dressShipModel(ship, { colour: "#3b82f6", flagMaterial: flag });
    for (const mesh of tintedOf(ship)) expect(isShipOwnMaterial(mesh.material as Material)).toBe(true);
    for (const material of [canvas, timber, pennant, band, flag]) expect(isShipOwnMaterial(material)).toBe(false);
  });

  it("puts the loaded materials back on every part it dressed, so the ship can be dressed again (#135)", () => {
    const { merged } = mergedShip();
    const ship = merged.clone(true);
    const loaded = meshesOf(ship).map((mesh) => mesh.material);
    const undress = dressShipModel(ship, { colour: "#3b82f6", flagMaterial: new MeshStandardMaterial(), wind: createShipWindUniforms() });
    undress();
    meshesOf(ship).forEach((mesh, k) => expect(mesh.material).toBe(loaded[k]));
  });
});
