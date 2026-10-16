import { environmentMarker } from "./environmentMarker";

// Read once: Vite bakes these values into the build.
const marker = environmentMarker(import.meta.env);

/**
 * A small tag on preview deployments only (#107): which database this build
 * talks to. Never on production or in local development. It takes no clicks.
 */
export function PreviewMarker() {
  if (marker === null) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-1 left-1/2 z-[1000] -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 font-mono text-[11px] text-amber-200"
    >
      {marker}
    </div>
  );
}
