import { describe, it, expect } from "vitest";
import { Box3, BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { mergeShipModel } from "./shipModelMerge";
import { flagUvs } from "./flagUvs";

const meshesOf = (object: Object3D): Mesh[] => {
  const meshes: Mesh[] = [];
  object.traverse((child) => {
    if ((child as Mesh).isMesh) meshes.push(child as Mesh);
  });
  return meshes;
};

const triangles = (object: Object3D): number =>
  meshesOf(object).reduce((sum, mesh) => {
    const geometry = mesh.geometry as BufferGeometry;
    return sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  }, 0);

const bounds = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const part = (name: string, material: MeshStandardMaterial, at: [number, number, number], size = 1): Mesh => {
  const mesh = new Mesh(new BoxGeometry(size, size, size), material);
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
};

/** A toy ship as GLTFLoader hands it over: a scene of named parts sharing a few materials. */
const toyShip = () => {
  const timber = new MeshStandardMaterial({ name: "Timber" });
  const iron = new MeshStandardMaterial({ name: "Iron" });
  const canvas = new MeshStandardMaterial({ name: "Canvas" });
  const scene = new Group();
  scene.add(
    part("Hull", timber, [0, 0, 0], 4),
    part("Masts", timber, [0, 3, 0]),
    part("Cannon_00", iron, [1, 0, 2]),
    part("Cannon_01", iron, [-1, 0, 2]),
    part("Sails", canvas, [0, 4, 1], 2),
    part("Jolly_Roger", canvas, [0, 6, 0], 0.5),
  );
  return { scene, timber, iron, canvas };
};

describe("mergeShipModel", () => {
  it("merges the parts into one mesh per material when nothing is tinted", () => {
    const { scene, timber, iron, canvas } = toyShip();
    const merged = mergeShipModel(scene, []);
    const meshes = meshesOf(merged);
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map((mesh) => mesh.material))).toEqual(new Set([timber, iron, canvas]));
  });

  it("keeps the triangle count and the bounds of the model", () => {
    const { scene } = toyShip();
    const before = { triangles: triangles(scene), bounds: bounds(scene) };
    const merged = mergeShipModel(scene, ["Sails"]);
    expect(triangles(merged)).toBe(before.triangles);
    const after = bounds(merged);
    expect(after.min.distanceTo(before.bounds.min)).toBeCloseTo(0, 10);
    expect(after.max.distanceTo(before.bounds.max)).toBeCloseTo(0, 10);
  });

  it("keeps the tinted parts in a mesh of their own, flagged, even when they share a material", () => {
    const { scene, canvas } = toyShip();
    const meshes = meshesOf(mergeShipModel(scene, ["Sails"]));
    expect(meshes).toHaveLength(4);
    const tinted = meshes.filter((mesh) => mesh.userData.tinted);
    expect(tinted).toHaveLength(1);
    expect(tinted[0].material).toBe(canvas);
    // The sails alone (one box, 12 triangles): the flag shares the canvas but is not tinted.
    expect(triangles(tinted[0])).toBe(12);
    expect(meshes.filter((mesh) => mesh.material === canvas && !mesh.userData.tinted)).toHaveLength(1);
  });

  it("keeps tinted parts with their own materials in one tinted mesh per material", () => {
    // The pennant and the hull stripe each carry their own white material (#163).
    const { scene, canvas } = toyShip();
    const pennantWhite = new MeshStandardMaterial({ name: "Pennant" });
    const stripeWhite = new MeshStandardMaterial({ name: "HullStripe" });
    scene.add(part("Pennant", pennantWhite, [0, 7, 0], 0.5), part("Hull_Stripe", stripeWhite, [0, 1, 0]));
    const tinted = meshesOf(mergeShipModel(scene, ["Sails", "Pennant", "Hull_Stripe"])).filter(
      (mesh) => mesh.userData.tinted,
    );
    expect(new Set(tinted.map((mesh) => mesh.material))).toEqual(new Set([canvas, pennantWhite, stripeWhite]));
    expect(tinted).toHaveLength(3);
  });

  it("tints a part whose primitives sit under the named node", () => {
    // GLTFLoader puts a node with several primitives in a group of meshes under the node's name.
    const { scene, canvas } = toyShip();
    const topsails = new Group();
    topsails.name = "Topsails";
    topsails.add(part("Topsails_1", canvas, [0, 5, 1]), part("Topsails_2", canvas, [0, 5, -1]));
    scene.add(topsails);
    const tinted = meshesOf(mergeShipModel(scene, ["Sails", "Topsails"])).filter((mesh) => mesh.userData.tinted);
    expect(tinted).toHaveLength(1);
    expect(triangles(tinted[0])).toBe(36);
  });

  it("keeps the flag in a mesh of its own, flagged, apart from the canvas it shares (#134)", () => {
    const { scene, canvas } = toyShip();
    const meshes = meshesOf(mergeShipModel(scene, ["Sails"], "Jolly_Roger"));
    expect(meshes).toHaveLength(4); // timber, iron, the tinted sails and the flag
    const flags = meshes.filter((mesh) => mesh.userData.flag);
    expect(flags).toHaveLength(1);
    expect(flags[0].userData.tinted).toBe(false);
    expect(flags[0].material).toBe(canvas);
    expect(triangles(flags[0])).toBe(12);
    expect(meshes.filter((mesh) => mesh !== flags[0] && mesh.userData.flag)).toEqual([]);
  });

  it("gives the flag texture coordinates of its own, hoist to fly and foot to head", () => {
    const { scene } = toyShip();
    const flag = meshesOf(mergeShipModel(scene, [], "Jolly_Roger")).find((mesh) => mesh.userData.flag)!;
    const { position, uv } = flag.geometry.attributes;
    expect(Array.from(uv.array)).toEqual(Array.from(flagUvs(position.array)));
    // the loaded flag keeps the atlas coordinates it came with
    const loaded = scene.getObjectByName("Jolly_Roger") as Mesh;
    expect(Array.from(loaded.geometry.attributes.uv.array)).toEqual(Array.from(new BoxGeometry(0.5, 0.5, 0.5).attributes.uv.array));
  });

  it("leaves the loaded model as it was", () => {
    const { scene } = toyShip();
    const hull = scene.getObjectByName("Hull") as Mesh;
    const positions = Array.from(hull.geometry.attributes.position.array);
    mergeShipModel(scene, ["Sails"]);
    expect(scene.children).toHaveLength(6);
    expect(Array.from(hull.geometry.attributes.position.array)).toEqual(positions);
  });

  it("merges parts of one material that carry different attributes", () => {
    // The Frigate's flag has a second UV set the sail patches lack.
    const { scene, canvas } = toyShip();
    const flag = scene.getObjectByName("Jolly_Roger") as Mesh;
    flag.geometry.setAttribute("uv1", flag.geometry.attributes.uv.clone());
    const meshes = meshesOf(mergeShipModel(scene, []));
    expect(meshes).toHaveLength(3);
    const merged = meshes.find((mesh) => mesh.material === canvas)!;
    expect(merged.geometry.attributes.uv1.count).toBe(merged.geometry.attributes.position.count);
  });

  describe("in the wind (#204)", () => {
    const WIND_PARTS = { sails: "Sails", sailDecals: ["Sail_Band"], cloth: ["Jolly_Roger", "Pennant"] };
    const windyShip = () => {
      const { scene, timber, canvas } = toyShip();
      const white = new MeshStandardMaterial({ name: "White" });
      scene.add(part("Sail_Band", white, [0, 4, 0.02], 1), part("Pennant", white, [0, 7, 0], 0.3));
      return { scene, timber, canvas, white };
    };
    const ATTRIBUTES = ["windSail", "windFlagHoist", "windFlagLocal"];

    it("gives the canvas, the flag and the pennant's meshes the wind's attributes, marked, and the timber none", () => {
      const { scene, timber } = windyShip();
      const meshes = meshesOf(mergeShipModel(scene, ["Pennant", "Sail_Band"], "Jolly_Roger", WIND_PARTS));
      for (const mesh of meshes) {
        const windy = mesh.material !== timber && (mesh.material as MeshStandardMaterial).name !== "Iron";
        expect(mesh.userData.wind, mesh.name).toBe(windy);
        for (const name of ATTRIBUTES) expect(mesh.geometry.hasAttribute(name), `${mesh.name} ${name}`).toBe(windy);
      }
    });

    it("bounds each wind mesh wide enough for its cloth to blow the other way", () => {
      const { scene } = windyShip();
      const meshes = meshesOf(mergeShipModel(scene, ["Pennant", "Sail_Band"], "Jolly_Roger", WIND_PARTS));
      for (const mesh of meshes.filter((m) => m.userData.wind)) {
        const tight = mesh.geometry.clone();
        tight.computeBoundingSphere();
        const local = mesh.geometry.attributes.windFlagLocal;
        const longest = Math.max(...Array.from({ length: local.count }, (_, k) => local.getW(k)));
        expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThanOrEqual(tight.boundingSphere!.radius + 2 * longest);
        expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThan(tight.boundingSphere!.radius);
      }
    });

    it("draws no more meshes for it", () => {
      const plain = meshesOf(mergeShipModel(windyShip().scene, ["Pennant", "Sail_Band"], "Jolly_Roger"));
      const windy = meshesOf(mergeShipModel(windyShip().scene, ["Pennant", "Sail_Band"], "Jolly_Roger", WIND_PARTS));
      expect(windy).toHaveLength(plain.length);
    });

    it("marks the flag's and the pennant's vertices as cloth, with a length, and nothing else", () => {
      const { scene, white } = windyShip();
      const meshes = meshesOf(mergeShipModel(scene, ["Pennant", "Sail_Band"], "Jolly_Roger", WIND_PARTS));
      const lengths = (mesh: Mesh) => {
        const local = mesh.geometry.attributes.windFlagLocal;
        return Array.from({ length: local.count }, (_, k) => local.getW(k));
      };
      const flag = meshes.find((mesh) => mesh.userData.flag)!;
      expect(lengths(flag).every((l) => l > 0)).toBe(true);
      const tinted = meshes.find((mesh) => mesh.material === white)!;
      // The pennant's 24 box vertices are cloth; the band's are not.
      expect(lengths(tinted).filter((l) => l > 0)).toHaveLength(24);
      const sails = meshes.find((mesh) => !mesh.userData.flag && !mesh.userData.tinted && mesh.userData.wind)!;
      expect(lengths(sails).every((l) => l === 0)).toBe(true);
    });
  });

  it("keeps a mirrored part's faces turned outward", () => {
    const scene = new Group();
    const box = part("Cannon_00", new MeshStandardMaterial(), [0, 0, 0]);
    box.scale.x = -1;
    scene.add(box);
    expect(outwardFaces(scene)).toBe(0); // the mirror turns the source inside out
    expect(outwardFaces(mergeShipModel(scene, []))).toBe(12);
  });
});

/** How many triangles of a box centred on the origin face away from it, as drawn (counter-clockwise front faces). */
function outwardFaces(object: Object3D): number {
  object.updateMatrixWorld(true);
  let count = 0;
  for (const mesh of meshesOf(object)) {
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index!;
    const corner = (i: number) => new Vector3().fromBufferAttribute(position, index.getX(i)).applyMatrix4(mesh.matrixWorld);
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [corner(i), corner(i + 1), corner(i + 2)];
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      const centre = new Vector3().add(a).add(b).add(c);
      if (normal.dot(centre) > 0) count++;
    }
  }
  return count;
}
