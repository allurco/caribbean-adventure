import { useState } from "react";
import { MapLoadingScreen } from "./MapLoadingScreen";
import type { ReadinessView } from "./sceneReadiness";

/** The loading screen over the board until its scene is ready, then faded out (at once under reduced motion). */
export function BoardLoadingVeil({ view }: { view: ReadinessView }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div
      className={`absolute inset-0 z-[60] transition-opacity duration-700 motion-reduce:transition-none ${view.ready ? "pointer-events-none opacity-0" : "opacity-100"}`}
      onTransitionEnd={() => {
        if (view.ready) setGone(true);
      }}
    >
      <MapLoadingScreen stage={view.label} fraction={view.fraction} />
    </div>
  );
}
