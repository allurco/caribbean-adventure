import { Vector3 } from "three";

/** The default controls' target (set by MapControls `makeDefault`), or null before they exist. */
export function controlsTarget(controls: unknown): Vector3 | null {
  if (
    typeof controls === "object" &&
    controls !== null &&
    "target" in controls &&
    controls.target instanceof Vector3
  ) {
    return controls.target;
  }
  return null;
}
