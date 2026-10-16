import { HARBOUR_STILL } from "./harbourStillImage";

const STILL_URL = `${import.meta.env.BASE_URL}${HARBOUR_STILL.path}`;

/** Sized like the live scene's camera (harbourView.ts): cover, centred, so the still lines up with it at any aspect. */
const LAYER = "absolute inset-0 bg-cover bg-center bg-no-repeat";

/**
 * The harbour as first painted (#122): the still captured from the live
 * scene's fixed camera, over a tiny blurred copy inlined in the bundle, so
 * the harbour's colours are on screen before the still has downloaded. The
 * shell's first paint (the fallback while its chunk loads) and the backdrop
 * until the live scene has faded in.
 */
export function HarbourStill() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-shell-sea">
      <div className={`${LAYER} scale-105 blur-lg`} style={{ backgroundImage: `url(${HARBOUR_STILL.placeholder})` }} />
      <div className={LAYER} style={{ backgroundImage: `url(${STILL_URL})` }} />
    </div>
  );
}
