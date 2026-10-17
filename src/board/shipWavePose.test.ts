import { beforeAll, describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { ZERO_WAVE_POSE, shipWavePose, wavePoseRotation, type SurfaceHeight, type WavePose } from "./shipWavePose";
import { shipHullBox } from "./shipHull";
import { createSeaSurface } from "./visuals/seaSurface";
import { DISPLACEMENT_FULL_DEPTH_METRES } from "./visuals/waveDisplacement";
import { WAVE_DETAIL_FADE_END } from "./visuals/waveNormalFilter";
import { METRES_PER_UNIT } from "./visuals/worldScale";

const FRIGATE = shipHullBox("Frigate");
const LENGTH = FRIGATE[2];
/** Heading whose bow points along +x (Ship's atan2(dx, dz)). */
const EAST = Math.PI / 2;
const SWEEP = Array.from({ length: 12 }, (_, i) => (i * 2 * Math.PI) / 12);

/** A single long-crested wave A·cos(k·x + φ) travelling along x. */
const waveAlongX =
  (amplitude: number, wavelength: number, phase: number): SurfaceHeight =>
  (x) =>
    amplitude * Math.cos((2 * Math.PI * x) / wavelength + phase);

/** A single long-crested wave A·cos(k·z + φ) travelling along z. */
const waveAlongZ =
  (amplitude: number, wavelength: number, phase: number): SurfaceHeight =>
  (_x, z) =>
    amplitude * Math.cos((2 * Math.PI * z) / wavelength + phase);

describe("ship wave pose on analytic surfaces", () => {
  it("is zero on a flat sea", () => {
    const flat: SurfaceHeight = () => 0;
    expect(shipWavePose(flat, FRIGATE, 3, -2, 0.7)).toEqual({ heave: 0, pitch: 0, roll: 0 });
  });

  it("heaves with a constant raised sea and does not tilt", () => {
    const pose = shipWavePose(() => 0.3, FRIGATE, 3, -2, 0.7);
    expect(pose.heave).toBeCloseTo(0.3, 12);
    expect(pose.pitch).toBeCloseTo(0, 12);
    expect(pose.roll).toBeCloseTo(0, 12);
  });

  it("follows the height and slope of a wave much longer than the hull", () => {
    const amplitude = 0.2;
    const wavelength = 20 * LENGTH;
    const k = (2 * Math.PI) / wavelength;
    const [x, z] = [1.3, 0.4];
    for (const phase of SWEEP) {
      const pose = shipWavePose(waveAlongX(amplitude, wavelength, phase), FRIGATE, x, z, EAST);
      expect(Math.abs(pose.heave - amplitude * Math.cos(k * x + phase))).toBeLessThan(0.01 * amplitude);
      const centreSlope = -amplitude * k * Math.sin(k * x + phase);
      expect(Math.abs(Math.tan(pose.pitch) - centreSlope)).toBeLessThan(0.01 * amplitude * k);
    }
  });

  it("stays near level on a wave much shorter than the hull", () => {
    // The taps sample the wave, so it must be longer than twice their spacing
    // (L/4 along a 5-tap hull): at λ = L/4 every tap lands on the same phase
    // and the hull would heave with the full wave. The real swell's shortest
    // wave is about 23 m against a Frigate tap spacing of about 6.2 m.
    const amplitude = 0.2;
    const wavelength = 0.4 * LENGTH;
    const k = (2 * Math.PI) / wavelength;
    for (const phase of SWEEP) {
      const pose = shipWavePose(waveAlongX(amplitude, wavelength, phase), FRIGATE, 1.3, 0.4, EAST);
      expect(Math.abs(pose.heave)).toBeLessThan(0.1 * amplitude);
      expect(Math.abs(Math.tan(pose.pitch))).toBeLessThan(0.1 * k * amplitude);
    }
  });

  it("pitches and does not roll heading into the waves", () => {
    const wavelength = 20 * LENGTH;
    for (const phase of SWEEP) {
      const pose = shipWavePose(waveAlongZ(0.2, wavelength, phase), FRIGATE, 1.3, 0.4, 0);
      expect(Math.abs(pose.roll)).toBeLessThan(1e-9);
    }
    const sloped = shipWavePose(waveAlongZ(0.2, wavelength, Math.PI / 2), FRIGATE, 0, 0, 0);
    expect(Math.abs(sloped.pitch)).toBeGreaterThan(0.01);
  });

  it("rolls with the slope and does not pitch beam-on to the waves", () => {
    const amplitude = 0.2;
    const wavelength = 20 * LENGTH;
    const k = (2 * Math.PI) / wavelength;
    const z = 0.4;
    for (const phase of SWEEP) {
      // Bow along +x, so the hull's local +X side faces −z.
      const pose = shipWavePose(waveAlongZ(amplitude, wavelength, phase), FRIGATE, 1.3, z, EAST);
      expect(Math.abs(pose.pitch)).toBeLessThan(1e-9);
      const slopeTowardMinusZ = amplitude * k * Math.sin(k * z + phase);
      expect(Math.abs(Math.tan(pose.roll) - slopeTowardMinusZ)).toBeLessThan(0.01 * amplitude * k);
    }
  });

  it("splits a slope between pitch and roll at 45°", () => {
    const slope = 0.05;
    const pose = shipWavePose((x) => slope * x, FRIGATE, 0, 0, Math.PI / 4);
    expect(Math.tan(pose.pitch)).toBeCloseTo(slope / Math.SQRT2, 12);
    expect(Math.tan(pose.roll)).toBeCloseTo(slope / Math.SQRT2, 12);
  });

  it("pitches bow-up where the sea rises ahead", () => {
    const pose = shipWavePose((_x, z) => 0.1 * z, FRIGATE, 0, 0, 0);
    expect(pose.pitch).toBeCloseTo(Math.atan(0.1), 12);
  });

  it("gives the same pose for the same inputs, whatever was posed before", () => {
    const sea = waveAlongX(0.2, 3 * LENGTH, 0.4);
    const first = shipWavePose(sea, FRIGATE, 1.3, 0.4, 0.9);
    expect(shipWavePose(sea, FRIGATE, 1.3, 0.4, 0.9)).toEqual(first);
    shipWavePose(sea, FRIGATE, -7, 12, 2.5);
    expect(shipWavePose(sea, FRIGATE, 1.3, 0.4, 0.9)).toEqual(first);
  });

  it("samples the surface one wrap width away there, without wrapping", () => {
    const width = 50;
    const rising: SurfaceHeight = (x) => 0.01 * x;
    expect(shipWavePose(rising, FRIGATE, 2 + width, 0, 0.3).heave).toBeCloseTo(0.01 * (2 + width), 12);
  });
});

describe("ship wave pose on the sea surface", () => {
  const [x, z] = [3.7, -5.2];
  const seconds = 7.3;
  const near: [number, number, number] = [x, 20, z];
  const poseOn = (seabedHeightAt: (x: number, z: number) => number, enabled = true, camera = near) => {
    const surface = createSeaSurface({ seabedHeightAt, enabled });
    return shipWavePose((px, pz) => surface.heightAt(px, pz, seconds, camera), FRIGATE, x, z, 0.6);
  };
  const OPEN_SEA = () => -10;
  const deep = poseOn(OPEN_SEA);

  const HULLS = { Frigate: FRIGATE, Sloop: shipHullBox("Sloop"), Galleon: shipHullBox("Galleon") };
  /**
   * Each hull's pose over a minute of the sea, every half second. All three
   * ride one surface in one pass: the sea's FFT at each moment is the costly
   * part (#335), and a pass per hull ran it three times over.
   */
  let poses: Record<keyof typeof HULLS, WavePose[]>;
  beforeAll(() => {
    const surface = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true });
    poses = { Frigate: [], Sloop: [], Galleon: [] };
    const names = Object.keys(HULLS) as (keyof typeof HULLS)[];
    for (let i = 0; i < 120; i++) {
      const sea: SurfaceHeight = (px, pz) => surface.heightAt(px, pz, i * 0.5, near);
      for (const name of names) poses[name].push(shipWavePose(sea, HULLS[name], x, z, 0.6));
    }
  });
  const rms = (values: number[]) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);

  it("rides the open sea", () => {
    // One moment can catch the hull near a node; over a minute it heaves and tilts.
    const frigate = poses.Frigate;
    expect(Math.max(...frigate.map((p) => Math.abs(p.heave)))).toBeGreaterThan(1e-3);
    expect(Math.abs(deep.heave)).toBeGreaterThan(0);
    expect(Math.abs(deep.pitch) + Math.abs(deep.roll)).toBeGreaterThan(1e-4);
  });

  it("pitches a longer hull less: it averages more of the swell (ADR 0004, ADR 0006)", () => {
    const { Sloop: sloop, Galleon: galleon } = poses;
    expect(rms(galleon.map((p) => p.pitch))).toBeLessThan(rms(sloop.map((p) => p.pitch)));
    expect(rms(galleon.map((p) => p.heave))).toBeLessThan(rms(sloop.map((p) => p.heave)));
  });

  it("holds still on land", () => {
    expect(poseOn(() => 0.1)).toEqual(ZERO_WAVE_POSE);
  });

  it("holds still on a sea the GPU draws flat", () => {
    expect(poseOn(OPEN_SEA, false)).toEqual(ZERO_WAVE_POSE);
  });

  it("holds still past the wave fade", () => {
    expect(poseOn(OPEN_SEA, true, [x, WAVE_DETAIL_FADE_END + 1, z])).toEqual(ZERO_WAVE_POSE);
  });

  it("heaves less in the shallows than in open water", () => {
    const shallowDepth = DISPLACEMENT_FULL_DEPTH_METRES / 2 / METRES_PER_UNIT;
    const shallow = poseOn(() => -shallowDepth);
    expect(Math.abs(shallow.heave)).toBeGreaterThan(0);
    expect(Math.abs(shallow.heave)).toBeLessThan(Math.abs(deep.heave));
  });
});

describe("wave pose rotation of the ship's inner group", () => {
  const [beam, , length] = shipHullBox("Frigate");
  const turned = (pose: WavePose, point: Vector3) => {
    const [x, y, z] = wavePoseRotation(pose);
    return point.clone().applyEuler(new Euler(x, y, z));
  };

  it("raises the bow of a bow-up pose", () => {
    const bow = turned({ heave: 0, pitch: 0.1, roll: 0 }, new Vector3(0, 0, length / 2));
    expect(bow.y).toBeCloseTo((length / 2) * Math.sin(0.1), 12);
  });

  it("raises the hull's +X side when it rolls positive", () => {
    const side = turned({ heave: 0, pitch: 0, roll: 0.1 }, new Vector3(beam / 2, 0, 0));
    expect(side.y).toBeCloseTo((beam / 2) * Math.sin(0.1), 12);
  });
});
