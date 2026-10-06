import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { SunLight } from "./visuals/SunLight";
import { useSkyEnvironment } from "./visuals/useSkyEnvironment";
import {
  BLOOM_INTENSITY,
  BLOOM_SMOOTHING,
  BLOOM_THRESHOLD,
  HAZE_COLOR,
  HAZE_FAR,
  HAZE_NEAR,
  SHADOW_MAP_TYPE,
  SUN_COLOR,
  SUN_DIRECTION,
  SUN_INTENSITY,
  SUN_OFFSET,
  SUN_SHADOW,
  VIGNETTE_DARKNESS,
  VIGNETTE_OFFSET,
} from "./visuals/atmosphere";
import { CAMERA_FOV, CAMERA_OFFSET } from "./cameraBounds";
import { paletteColor } from "./visuals/palette";
import { PROP_ENTRIES, type PropEntry, type PropGeometryData } from "./propEntries";
import { layoutRow, propExtent, propLabelOffset } from "./propLayout";

/**
 * The prop viewer (issue #59): `?view=props` shows hand-built props side
 * by side under the game's own sun, sky, haze, shadows and post-processing,
 * at ship zoom, so a fidelity choice is made on what the game will draw.
 * No game state, no boardgame.io client. The list lives in `propEntries.ts`.
 */

/** Ship zoom: MapControls bottoms out at 3.5–4.3 units from the target on the small and medium maps. */
const CAMERA_DISTANCE = 3.8;
const TARGET: [number, number, number] = [0, 0.08, 0];
const LABEL_SIZE = 0.04;
const LABEL_COLOR = "#2b2117";

function toGeometry(data: PropGeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors ?? new Float32Array(data.vertexCount * 3).fill(1), 3));
  return geometry;
}

interface PlacedProp {
  entry: PropEntry;
  data: PropGeometryData;
  x: number;
  /** Where the label starts in front of the origin, clear of the piece's measured radius. */
  labelZ: number;
}

/** Builds every entry once and spaces the row (and each label) by what was built. */
function placeProps(entries: readonly PropEntry[]): PlacedProp[] {
  const data = entries.map((entry) => entry.build());
  const extents = data.map((d, i) => propExtent(d, entries[i].scale ?? 1));
  const xs = layoutRow(extents);
  return entries.map((entry, i) => ({ entry, data: data[i], x: xs[i], labelZ: propLabelOffset(extents[i]) }));
}

function Prop({ entry, data, x, labelZ }: PlacedProp) {
  const { geometry, material } = useMemo(
    () => ({
      geometry: toGeometry(data),
      material: new MeshStandardMaterial({ color: entry.color, vertexColors: true, roughness: entry.roughness ?? 0.9, metalness: 0 }),
    }),
    [entry, data]
  );
  const triangles = data.vertexCount / 3;
  const scale = entry.scale ?? 1;
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={geometry} material={material} scale={[scale, scale, scale]} castShadow receiveShadow />
      {/* Flat on the sand in front of the prop, reading the right way up from the game's southward camera. */}
      <Text
        position={[0, 0.002, labelZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={LABEL_SIZE}
        color={LABEL_COLOR}
        anchorX="center"
        anchorY="top"
        textAlign="center"
      >
        {`${entry.label}\n${triangles} tris`}
      </Text>
    </group>
  );
}

function Scene({ props, target }: { props: readonly PlacedProp[]; target: [number, number, number] }) {
  // The game's sky as image-based lighting (sets scene.environment).
  useSkyEnvironment(SUN_DIRECTION);
  const sand = useMemo(() => paletteColor("drySand"), []);
  return (
    <>
      <color attach="background" args={[HAZE_COLOR]} />
      <fog attach="fog" args={[HAZE_COLOR, HAZE_NEAR, HAZE_FAR]} />
      <SunLight color={SUN_COLOR} intensity={SUN_INTENSITY} offset={SUN_OFFSET} shadow={SUN_SHADOW} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color={sand} roughness={1} metalness={0} />
      </mesh>

      {props.map((p) => (
        <Prop key={p.entry.label} {...p} />
      ))}

      <OrbitControls makeDefault target={target} minDistance={0.3} maxDistance={30} />

      <EffectComposer>
        <Bloom intensity={BLOOM_INTENSITY} luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={BLOOM_SMOOTHING} />
        <Vignette darkness={VIGNETTE_DARKNESS} offset={VIGNETTE_OFFSET} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

interface PropViewerProps {
  entries?: readonly PropEntry[];
  /** Index of an entry to start on, close up (`?focus=n`); the whole row otherwise. */
  focus?: number;
}

export function PropViewer({ entries = PROP_ENTRIES, focus }: PropViewerProps) {
  const props = useMemo(() => placeProps(entries), [entries]);
  const focused = focus !== undefined && Number.isInteger(focus) && focus >= 0 && focus < props.length;
  const target: [number, number, number] = focused ? [props[focus].x, TARGET[1], 0] : TARGET;
  const distance = focused ? CAMERA_DISTANCE / 4 : CAMERA_DISTANCE;
  // Along the game's fixed view direction, at ship zoom.
  const length = Math.hypot(...CAMERA_OFFSET);
  const position: [number, number, number] = [
    target[0] + (CAMERA_OFFSET[0] / length) * distance,
    target[1] + (CAMERA_OFFSET[1] / length) * distance,
    target[2] + (CAMERA_OFFSET[2] / length) * distance,
  ];
  return (
    <div className="relative w-screen h-screen font-body bg-[#0a1929]">
      <Canvas shadows={{ type: SHADOW_MAP_TYPE }} camera={{ position, fov: CAMERA_FOV, near: 0.1, far: 1000 }} style={{ background: "#0a1929" }}>
        <Scene props={props} target={target} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-black/50 px-3 py-2 text-xs leading-relaxed text-white/80 backdrop-blur">
        <div className="font-semibold text-white">Prop viewer · fidelity probe (#59)</div>
        Ship-zoom camera under the game&rsquo;s light. Drag to orbit, wheel to zoom; <code>&amp;focus=n</code> starts close up on one prop.
      </div>
    </div>
  );
}
