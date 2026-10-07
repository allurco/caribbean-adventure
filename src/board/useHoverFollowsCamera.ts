import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MapControls } from "three-stdlib";

/**
 * Re-test what is under a still pointer whenever the camera moves (#75).
 *
 * R3F raycasts only on pointer events, so a wheel zoom, the damping after a
 * drag or the camera gliding to a ship moved the scene under a resting
 * pointer without re-testing it: a port's tooltip (or a ship's, or a hex's
 * highlight) stayed up after the port had slid out from under the pointer,
 * until the pointer next moved. A controls change only marks the hover stale;
 * the next frame replays the last pointer move against the view, so every
 * other change listener (the map-bounds clamp in Board.tsx) has settled the
 * camera first, whatever order the listeners were registered in. Only while
 * the pointer is over the canvas: R3F keeps that last event after the pointer
 * leaves, and replaying it then would hover whatever is under the spot where
 * it left.
 */
export function useHoverFollowsCamera(controlsRef: RefObject<MapControls | null>): void {
  const events = useThree((s) => s.events);
  const inside = useRef(false);
  const stale = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    const source = events.connected;
    if (!controls || !(source instanceof HTMLElement)) return;
    inside.current = source.matches(":hover");
    const enter = () => {
      inside.current = true;
    };
    const leave = () => {
      inside.current = false;
    };
    const markStale = () => {
      stale.current = true;
    };
    source.addEventListener("pointerenter", enter);
    source.addEventListener("pointerleave", leave);
    controls.addEventListener("change", markStale);
    return () => {
      source.removeEventListener("pointerenter", enter);
      source.removeEventListener("pointerleave", leave);
      controls.removeEventListener("change", markStale);
    };
  }, [controlsRef, events]);

  useFrame(({ camera }) => {
    if (!stale.current) return;
    stale.current = false;
    if (!inside.current) return;
    // The camera has moved but its world matrix, which the raycast reads, is
    // only refreshed when this frame renders
    camera.updateMatrixWorld();
    events.update?.();
  });
}
