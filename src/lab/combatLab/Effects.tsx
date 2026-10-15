import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";
import { SCENE_LIGHTING } from "../../board/visuals/sceneLighting";
import type { ParticlePool } from "./particlePool";
import { ropePoint, writePuffs } from "./frameWriters";
import type { Director } from "./combatDirector";
import { shotArc, type Vec3 } from "./broadside";

/**
 * PROTOTYPE (combat animation lab): the effects, each one instanced draw
 * over a pool the director fills (combatDirector.ts). Nothing here allocates
 * per frame: the instance buffers are written in place.
 */

export interface PuffLook {
  /** Lit colour (sRGB), and the colour of its shadowed side. */
  color: string;
  shade: string;
  /** 0: flat (a flash), 1: lit by the sun from its side. */
  lit: number;
  /** Colour multiplier, above 1 to bloom. */
  intensity: number;
  additive: boolean;
  opacity: number;
  /** Size grows by this factor over `growSeconds` (exponential approach). */
  grow: number;
  growSeconds: number;
  fadeIn: number;
  fadeOut: number;
}

const PUFF_VERTEX = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iSize;
  attribute float iAlpha;
  attribute float iSeed;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vAlpha = iAlpha;
    vSeed = iSeed;
    vec4 mvPosition = modelViewMatrix * vec4(iOffset, 1.0);
    float a = iSeed * 6.2831;
    vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy;
    mvPosition.xy += p * iSize;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const PUFF_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uSunView;
  uniform float uLit;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    // A lumpy edge, different for each puff, so the clouds read as billows rather than discs.
    float lump = 0.09 * sin(ang * 3.0 + vSeed * 31.0) + 0.06 * sin(ang * 5.0 - vSeed * 17.0) + 0.04 * sin(ang * 9.0 + vSeed * 7.0);
    float body = 1.0 - smoothstep(0.35 + lump, 0.95 + lump * 0.5, r);
    if (body <= 0.002) discard;
    // A sphere's normal across the puff, lit from the sun's side.
    vec3 n = normalize(vec3(p, sqrt(max(0.0, 1.0 - r * r)) + 0.35));
    float light = clamp(dot(n, uSunView) * 0.6 + 0.5, 0.0, 1.0);
    vec3 colour = mix(uColor, mix(uShade, uColor, light), uLit);
    gl_FragColor = vec4(colour, body * vAlpha);
    #include <fog_fragment>
  }
`;

const sunWorld = new Vector3(...SCENE_LIGHTING.sun.direction);

/** Billboard puffs (smoke, flash, spray, mist, dust) over one pool. */
export function PuffLayer({ pool, look }: { pool: ParticlePool; look: PuffLook }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material, attrs } = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const attr = (size: number) => new InstancedBufferAttribute(new Float32Array(pool.capacity * size), size).setUsage(DynamicDrawUsage);
    const attrs = { offset: attr(3), size: attr(1), alpha: attr(1), seed: attr(1) };
    g.setAttribute("iOffset", attrs.offset);
    g.setAttribute("iSize", attrs.size);
    g.setAttribute("iAlpha", attrs.alpha);
    g.setAttribute("iSeed", attrs.seed);
    g.instanceCount = 0;
    const colour = new Color(look.color).multiplyScalar(look.intensity);
    const m = new ShaderMaterial({
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { uColor: { value: colour }, uShade: { value: new Color(look.shade) }, uSunView: { value: new Vector3() }, uLit: { value: look.lit } },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: look.additive ? AdditiveBlending : NormalBlending,
    });
    return { geometry: g, material: m, attrs };
  }, [pool, look]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ camera }) => {
    material.uniforms.uSunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
    writePuffs(pool, look, attrs, geometry);
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

const dummy = new Object3D();

/**
 * Tumbling debris (splinters, crates) over one pool: one instance per slot,
 * a dead slot drawn at zero size. Floating pieces sit low in the water and
 * rock with it.
 */
export function DebrisLayer({ pool, shape, colours }: { pool: ParticlePool; shape: "splinter" | "crate"; colours: readonly string[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new BoxGeometry(1, 1, 1),
      material: new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
    }),
    []
  );
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new Color();
    for (let i = 0; i < pool.capacity; i++) m.setColorAt(i, c.set(colours[i % colours.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [pool, colours]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.state[i] === 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const size = pool.size[i];
      const floating = pool.state[i] === 2;
      const seed = pool.seed[i];
      // Sinking out of sight over the last tenth of its life.
      const sinkAway = Math.max(0, (pool.age[i] / pool.life[i] - 0.9) / 0.1);
      if (shape === "splinter") {
        dummy.scale.set(0.005 * size, 0.005 * size, (0.022 + 0.02 * seed) * size);
        dummy.position.set(pool.px[i], pool.py[i] - sinkAway * 0.02, pool.pz[i]);
        dummy.rotation.set(floating ? 0.1 * Math.sin(t * 1.3 + seed * 9) : pool.rot[i], seed * 6.28 + (floating ? 0 : pool.rot[i] * 0.7), floating ? 0 : pool.rot[i] * 0.4);
      } else {
        dummy.scale.set(size, size * 0.8, size * 1.15);
        const bob = floating ? -size * 0.25 : 0;
        dummy.position.set(pool.px[i], pool.py[i] + bob - sinkAway * size, pool.pz[i]);
        dummy.rotation.set(
          floating ? 0.18 * Math.sin(t * 1.1 + seed * 7) : pool.rot[i],
          seed * 6.28 + pool.rot[i] * 0.3,
          floating ? 0.15 * Math.cos(t * 0.9 + seed * 5) : pool.rot[i] * 0.6
        );
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, pool.capacity]} castShadow frustumCulled={false} />;
}

/** Round shot in flight. */
export function ShotLayer({ director }: { director: Director }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({ geometry: new SphereGeometry(0.007, 8, 6), material: new MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.5, metalness: 0.6 }) }),
    []
  );
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    director.shots.forEach((shot, i) => {
      dummy.position.copy(shot.pos);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(shot.active ? 1 : 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, material, director.shots.length]} frustumCulled={false} />;
}

const ROPE_SEGMENTS = 10;
const UP = new Vector3(0, 1, 0);

/** The grapples: an iron hook flying on its line, then the line hauled taut between the ships. */
export function GrappleLayer({ director }: { director: Director }) {
  const ropes = useRef<InstancedMesh>(null);
  const hooks = useRef<InstancedMesh>(null);
  const count = director.grapples.length;
  const parts = useMemo(
    () => ({
      rope: new CylinderGeometry(1, 1, 1, 5, 1, true),
      ropeMaterial: new MeshStandardMaterial({ color: "#8a7350", roughness: 0.95 }),
      hook: new ConeGeometry(0.006, 0.014, 4),
      hookMaterial: new MeshStandardMaterial({ color: "#2a2724", roughness: 0.6, metalness: 0.5 }),
    }),
    []
  );
  const scratch = useMemo(
    () => ({ from: new Vector3(), to: new Vector3(), hook: new Vector3(), a: new Vector3(), b: new Vector3(), dir: new Vector3(), arc: { x: 0, y: 0, z: 0 } as Vec3 }),
    []
  );

  useFrame(() => {
    const r = ropes.current;
    const h = hooks.current;
    if (!r || !h) return;
    const actor = director.ships[director.actor];
    const target = director.ships[director.actor === "a" ? "b" : "a"];
    const { from, to, hook, a, b, dir, arc } = scratch;
    director.grapples.forEach((g, gi) => {
      const s = (director.time - g.throwAt) / g.flight;
      const shown = g.active && s >= 0 && actor.anchor !== null && target.anchor !== null;
      if (shown) {
        from.set(g.from.x, g.from.y, g.from.z).applyMatrix4(actor.anchor!.matrixWorld);
        to.set(g.to.x, g.to.y, g.to.z).applyMatrix4(target.anchor!.matrixWorld);
        if (s < 1) {
          shotArc(from, to, s, 0.06, arc);
          hook.set(arc.x, arc.y, arc.z);
        } else hook.copy(to);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.position.copy(hook);
      dummy.scale.setScalar(shown ? 1 : 0);
      dummy.updateMatrix();
      h.setMatrixAt(gi, dummy.matrix);
      // Slack while it flies (the line follows the hook's arc), then hauled in, a little sag left.
      const sag = s < 1 ? 0 : 0.012 + 0.02 * Math.exp(-(s - 1) * 2);
      for (let k = 0; k < ROPE_SEGMENTS; k++) {
        const index = gi * ROPE_SEGMENTS + k;
        if (!shown) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          r.setMatrixAt(index, dummy.matrix);
          continue;
        }
        ropePoint(from, to, k / ROPE_SEGMENTS, s, sag, arc, a);
        ropePoint(from, to, (k + 1) / ROPE_SEGMENTS, s, sag, arc, b);
        dir.subVectors(b, a);
        const length = dir.length();
        dummy.position.addVectors(a, b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(UP, dir.normalize());
        dummy.scale.set(0.0014, length, 0.0014);
        dummy.updateMatrix();
        r.setMatrixAt(index, dummy.matrix);
      }
    });
    r.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={ropes} args={[parts.rope, parts.ropeMaterial, count * ROPE_SEGMENTS]} frustumCulled={false} />
      <instancedMesh ref={hooks} args={[parts.hook, parts.hookMaterial, count]} frustumCulled={false} />
    </>
  );
}
