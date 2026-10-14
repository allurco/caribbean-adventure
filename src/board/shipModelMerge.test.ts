import { describe, it, expect } from "vitest";
import { Box3, BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { mergeShipModel } from "./shipModelMerge";

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
