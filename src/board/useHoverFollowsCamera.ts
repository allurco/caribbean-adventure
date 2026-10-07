import { useEffect } from "react";
import type { RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { MapControls } from "three-stdlib";

/**
 * Re-test what is under a still pointer whenever the camera moves (#75).
 *
 * R3F raycasts only on pointer events, so a wheel zoom, the damping after a
 * drag or the camera gliding to a ship moved the scene under a resting
 * pointer without re-testing it: a port's tooltip (or a ship's, or a hex's
 * highlight) stayed up after the port had slid out from under the pointer,
 * until the pointer next moved. After every controls change this replays the
 * last pointer move against the new view. Only while the pointer is over the
 * canvas: R3F keeps that last event after the pointer leaves, and replaying
 * it then would hover whatever is under the spot where it left.
 */
export function useHoverFollowsCamera(controlsRef: RefObject<MapControls | null>): void {
  const events = useThree((s) => s.events);

  useEffect(() => {
    const controls = controlsRef.current;
    const source = events.connected;
    if (!controls || !(source instanceof HTMLElement)) return;
    let inside = source.matches(":hover");
    const enter = () => {
      inside = true;
    };
    const leave = () => {
      inside = false;
    };
    const retest = () => {
      if (!inside) return;
      // The controls have moved the camera but its world matrix, which the
      // raycast reads, is only refreshed at the next render
      controls.object.updateMatrixWorld();
      events.update?.();
    };
    source.addEventListener("pointerenter", enter);
    source.addEventListener("pointerleave", leave);
    controls.addEventListener("change", retest);
    return () => {
      source.removeEventListener("pointerenter", enter);
      source.removeEventListener("pointerleave", leave);
      controls.removeEventListener("change", retest);
    };
  }, [controlsRef, events]);
}
