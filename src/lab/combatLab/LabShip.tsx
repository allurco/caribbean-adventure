import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Object3D } from "three";
import { SHIP_SINK_DEPTH, shipWaterline } from "../../board/shipHull";
import { type ShipModel, shipModel, shipModelPlacement, shipModelUrl } from "../../board/shipModels";
import { mergeShipModel } from "../../board/shipModelMerge";
import { dressShipModel } from "../../board/shipDressing";
import { shipFlagMaterial } from "../../board/shipFlagMaterials";
import type { ShipFlag } from "../../board/shipFlags";
import { createShipWindUniforms, shipWindPose, writeShipWindPose } from "../../board/shipWind";
import { useShipWavePose } from "../../board/useShipWavePose";
import { shipFoamSources, type ShipFoamSource } from "../../board/shipFoamSources";
import { SHIP_POSE_PRIORITY } from "../../board/visuals/frameOrder";
import { SCENE_WIND } from "../../board/visuals/sceneWind";
import { useSeaSurface } from "../../board/visuals/seaSurfaceContext";
import { mainMastCut, mastStations, splitTriangles } from "./mastSplit";
import { toShipLocalScale, type Director, type ShipKey } from "./combatDirector";
import type { Vec3 } from "./broadside";
import { poseTopmast } from "./frameWriters";

/**
 * PROTOTYPE (combat animation lab): a ship the director moves. Like Ship.tsx
 * (an outer group that sails and turns, an inner one riding the swell), with
 * a group inside that sinks, and the model split at the mainmast so its top
 * can fall (mastSplit.ts). Reads its state from the director every frame.
 */
export function LabShip({ director, shipKey, colour, flag }: { director: Director; shipKey: ShipKey; colour: string; flag: ShipFlag | null }) {
  const outer = useRef<Group>(null);
  const sinkGroup = useRef<Group>(null);
  const ship = () => director.ships[shipKey];
  const initial = ship();
  const model = shipModel(initial.shipClass);
  const lean = useCallback(() => ({ pitch: director.ships[shipKey].pitch, roll: director.ships[shipKey].heel }), [director, shipKey]);
  const inner = useShipWavePose(initial.hull, lean);
  const foamId = `combat-lab-${shipKey}`;
  const foamRef = useRef<ShipFoamSource>({ x: 0, z: 0, headingX: 0, headingZ: 1, hullLength: 0, beam: 0, roundness: 0, speed: 0, player: true });
  useEffect(() => () => shipFoamSources.remove(foamId), [foamId]);

  useFrame(() => {
    const s = ship();
    const g = outer.current;
    if (!g || !sinkGroup.current) return;
    g.position.set(s.pose.x, 0, s.pose.z);
    g.rotation.y = s.pose.heading;
    g.visible = !s.sunk;
    sinkGroup.current.position.y = -s.drop * SHIP_SINK_DEPTH;
    director.attach(shipKey, sinkGroup.current);
    if (s.sunk || s.drop > 0.3) {
      shipFoamSources.remove(foamId);
      return;
    }
    const w = shipWaterline(s.shipClass);
    const foam = foamRef.current;
    foam.x = s.pose.x;
    foam.z = s.pose.z;
    foam.headingX = Math.sin(s.pose.heading);
    foam.headingZ = Math.cos(s.pose.heading);
    foam.hullLength = w.length;
    foam.beam = w.beam;
    foam.roundness = w.roundness;
    foam.speed = s.speed;
    shipFoamSources.set(foamId, foam);
  });

  const box = (
    <mesh position-y={initial.hull[1] / 2}>
      <boxGeometry args={[...initial.hull]} />
      <meshStandardMaterial color={colour} />
    </mesh>
  );
  return (
    <group ref={outer}>
      <group ref={inner}>
        <group ref={sinkGroup}>
          {model ? (
            <Suspense fallback={box}>
              <LabShipModel director={director} shipKey={shipKey} model={model} colour={colour} flag={flag} />
            </Suspense>
          ) : (
            box
          )}
        </group>
      </group>
    </group>
  );
}

interface SplitModel {
  /** The whole ship, with the topmast's triangles under `pivot`. */
  group: Group;
  pivot: Group;
  guns: Vec3[];
  mastBreak: { y: number; z: number; length: number };
}

const merged = new WeakMap<Object3D, Group>();

function mergedOf(scene: Object3D, model: ShipModel): Group {
  let m = merged.get(scene);
  if (!m) {
    const wind = { sails: model.parts.sails, sailDecals: model.sailDecals, cloth: [model.parts.flag, model.parts.pennant] };
    m = mergeShipModel(scene, model.tintedParts, model.parts.flag, wind);
    merged.set(scene, m);
  }
  return m;
}

/** Points (xyz) of every mesh under `node`, in `scene`'s frame. */
function pointsIn(node: Object3D, toScene: Matrix4): number[] {
  const out: number[] = [];
  const v = new Vector3();
  node.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(toScene);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

function sharing(source: BufferGeometry, index: Uint32Array): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) g.setAttribute(name, attribute);
  g.setIndex(new BufferAttribute(index, 1));
  if (!source.boundingSphere) source.computeBoundingSphere();
  g.boundingSphere = source.boundingSphere!.clone();
  return g;
}

function splitModel(scene: Object3D, model: ShipModel): SplitModel {
  scene.updateMatrixWorld(true);
  const toScene = new Matrix4().copy(scene.matrixWorld).invert();
  const deckY = model.depthMetres - model.draftMetres;
  const masts = scene.getObjectByName("Masts");
  const stations = masts ? mastStations(pointsIn(masts, toScene), deckY + 1) : [];
  const top = stations.length > 0 ? Math.max(...stations.map((s) => s.top)) : model.mastheadMetres;
  const cut = stations.length > 0 ? mainMastCut(stations, { deckY, breakShare: 0.42 }) : { zMin: -6, zMax: 6, yBreak: deckY + 0.42 * (top - deckY), pivot: [0, deckY + 0.42 * (top - deckY), 0] as [number, number, number] };

  const group = mergedOf(scene, model).clone(true);
  const pivot = new Group();
  pivot.position.set(...cut.pivot);
  const holder = new Group();
  holder.position.set(-cut.pivot[0], -cut.pivot[1], -cut.pivot[2]);
  pivot.add(holder);
  for (const child of [...group.children]) {
    const mesh = child as Mesh;
    if (!mesh.isMesh) continue;
    const g = mesh.geometry;
    const index = g.index ? g.index.array : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    const { kept, cut: cutIndex } = splitTriangles(g.attributes.position.array, index, cut);
    if (cutIndex.length === 0) continue;
    mesh.geometry = sharing(g, kept);
    const piece = new Mesh(sharing(g, cutIndex), mesh.material);
    piece.name = `${mesh.name}_topmast`;
    piece.userData = { ...mesh.userData };
    holder.add(piece);
  }
  group.add(pivot);
  group.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });

  const guns: Vec3[] = [];
  const v = new Vector3();
  scene.traverse((o) => {
    if (!/^Cannon_\d+$/.test(o.name)) return;
    o.getWorldPosition(v).applyMatrix4(toScene);
    guns.push(toShipLocalScale(v.x, v.y, v.z));
  });
  const brk = toShipLocalScale(0, cut.yBreak, cut.pivot[2]);
  return { group, pivot, guns, mastBreak: { y: brk.y, z: brk.z, length: toShipLocalScale(0, top - cut.yBreak, 0).y } };
}

function LabShipModel({ director, shipKey, model, colour, flag }: { director: Director; shipKey: ShipKey; model: ShipModel; colour: string; flag: ShipFlag | null }) {
  const { scene } = useGLTF(shipModelUrl(model, import.meta.env.BASE_URL), false, false);
  const split = useMemo(() => splitModel(scene, model), [scene, model]);
  const [wind] = useState(createShipWindUniforms);
  const sea = useSeaSurface();
  useLayoutEffect(() => dressShipModel(split.group, { colour, flagMaterial: shipFlagMaterial(flag), wind }), [split, colour, flag, wind]);
  useFrame(() => {
    const s = director.ships[shipKey];
    if (s.guns !== split.guns) director.fit(shipKey, split.guns, split.mastBreak);
    poseTopmast(split.pivot, s.mast);
    const seconds = sea?.clock.waveTimeAt() ?? 0;
    writeShipWindPose(wind, shipWindPose({ heading: s.pose.heading, wind: SCENE_WIND, seconds, reducedMotion: false, sinking: s.sink !== null }));
  }, SHIP_POSE_PRIORITY);
  const { y, rotationY, scale } = shipModelPlacement();
  return (
    <group position-y={y} rotation-y={rotationY} scale={scale}>
      <primitive object={split.group} />
    </group>
  );
}
