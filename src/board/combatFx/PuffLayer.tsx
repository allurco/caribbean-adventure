import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";
import { SCENE_LIGHTING } from "../visuals/sceneLighting";
import type { ParticlePool } from "./particlePool";
import { viewAxis, writePuffs, type PuffShape } from "./frameWriters";
import { SCENE_WIND } from "../visuals/sceneWind";
import { PUFF_FRAGMENT, PUFF_VERTEX } from "./puffShader";

/** How a kind of puff looks. */
export interface PuffLook extends PuffShape {
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

const sunWorld = new Vector3(...SCENE_LIGHTING.sun.direction);
const axis: [number, number] = [1, 0];

/** One pool of puffs, drawn in one instanced call; its buffers are written in place each frame (#263). */
export function PuffLayer({ pool, look }: { pool: ParticlePool; look: PuffLook }) {
  const { geometry, material, buffers } = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const attr = (size: number) => new InstancedBufferAttribute(new Float32Array(pool.capacity * size), size).setUsage(DynamicDrawUsage);
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
  }, [pool, look]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ camera }) => {
    material.uniforms.uSunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
    if (look.alongWind) {
      viewAxis(SCENE_WIND.toward[0], SCENE_WIND.toward[1], camera.matrixWorldInverse, axis);
      material.uniforms.uAxis.value.set(axis[0], axis[1]);
    }
    writePuffs(pool, look, buffers, geometry);
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
