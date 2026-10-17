import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  PlaneGeometry,
  type Mesh,
  ShaderMaterial,
  Vector2,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";
import { SCENE_LIGHTING } from "../visuals/sceneLighting";
import type { ParticlePool } from "./particlePool";
import { showLayer, viewAxis, writePuffs, writeUniform, type PuffBuffers, type PuffShape } from "./frameWriters";
import { SCENE_WIND } from "../visuals/sceneWind";
import { PUFF_FRAGMENT, PUFF_VERTEX } from "./puffShader";

/** How a kind of puff is shaded: what the layer's material reads. */
export interface PuffMaterialLook {
  /** Lit colour (sRGB), and the colour of its shadowed side. */
  color: string;
  shade: string;
  /** 0: flat colour (a flash), 1: lit by the sun from its side. */
  lit: number;
  /** Colour multiplier, above 1 to bloom. */
  intensity: number;
  additive: boolean;
  /** How much longer than wide, for a low bank of smoke. */
  stretch: number;
  /** Stretched along the wind as the camera sees it (smoke); else along the screen's x. */
  alongWind: boolean;
  /** Lies on the sea instead of facing the camera (foam). */
  flat: boolean;
}

/** How a kind of puff looks: its shading, and how `writePuffs` grows and fades it. */
export interface PuffLook extends PuffShape, PuffMaterialLook {}

const sunWorld = new Vector3(...SCENE_LIGHTING.sun.direction);
const axis: [number, number] = [1, 0];

/** One pool of puffs, drawn in one instanced call; its buffers are written in place each frame (#263). */
/** A scale the layer's puffs are drawn at, written each frame by its owner (the camera's zoom, fxTuning.ts). */
export interface PuffZoom {
  scale: number;
}

/**
 * Fills the instance buffers itself instead of `writePuffs` and returns how
 * many it wrote (the ships' foam flecks, which wrap and ride the sea,
 * ShipFoamFlecks.tsx).
 */
export type PuffWriter = (buffers: PuffBuffers, geometry: InstancedBufferGeometry) => number;

/** What a layer draws: a pool's puffs through `writePuffs`, or `capacity` instances its own `write` fills. */
type PuffSource = { pool: ParticlePool; look: PuffLook; write?: never; capacity?: never } | { write: PuffWriter; capacity: number; look: PuffMaterialLook; pool?: never };

export function PuffLayer({
  zoom,
  warm,
  priority = 0,
  ...source
}: PuffSource & {
  zoom?: PuffZoom;
  warm: boolean;
  /** Its frame callback's priority (frameOrder.ts); the combat's layers keep the default. */
  priority?: number;
}) {
  const { look, pool } = source;
  const capacity = pool ? pool.capacity : source.capacity;
  const { geometry, material, buffers } = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const attr = (size: number) => new InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(DynamicDrawUsage);
    const buffers = { offset: attr(3), size: attr(1), alpha: attr(1), seed: attr(1) };
    g.setAttribute("iOffset", buffers.offset);
    g.setAttribute("iSize", buffers.size);
    g.setAttribute("iAlpha", buffers.alpha);
    g.setAttribute("iSeed", buffers.seed);
    g.instanceCount = 0;
    const m = new ShaderMaterial({
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uColor: { value: new Color(look.color).multiplyScalar(look.intensity) },
          uShade: { value: new Color(look.shade) },
          uSunView: { value: new Vector3() },
          uLit: { value: look.lit },
          uStretch: { value: look.stretch },
          uScale: { value: 1 },
          uAxis: { value: new Vector2(1, 0) },
          uFlat: { value: look.flat ? 1 : 0 },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: look.additive ? AdditiveBlending : NormalBlending,
    });
    return { geometry: g, material: m, buffers };
  }, [capacity, look]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const mesh = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    material.uniforms.uSunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
    if (zoom) writeUniform(material.uniforms.uScale, zoom.scale);
    if (look.alongWind) {
      viewAxis(SCENE_WIND.toward[0], SCENE_WIND.toward[1], camera.matrixWorldInverse, axis);
      material.uniforms.uAxis.value.set(axis[0], axis[1]);
    }
    const live = source.write ? source.write(buffers, geometry) : writePuffs(source.pool, source.look, buffers, geometry);
    // An empty pool draws nothing at all, once the loading gate has compiled its shader (frameWriters.ts)
    if (mesh.current) showLayer(mesh.current, live, { warm });
  }, priority);
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} visible={warm} />;
}
