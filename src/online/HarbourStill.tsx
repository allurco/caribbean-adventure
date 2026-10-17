import { HARBOUR_STILL } from "./harbourStillImage";

const STILL_URL = `${import.meta.env.BASE_URL}${HARBOUR_STILL.path}`;

/** Cover, centred (harbourView.ts): the still fills the viewport at any aspect, cropped evenly. */
const LAYER = "absolute inset-0 bg-cover bg-center bg-no-repeat";

/**
 * The harbour behind the online shell (#122, #418): the still captured from
 * the harbour scene's fixed camera, over a tiny blurred copy inlined in the
 * bundle, so the harbour's colours are on screen before the still has
 * downloaded. The shell's backdrop on every page, its first paint (the
 * fallback while its chunk loads) and the rotate gate's picture.
 */
export function HarbourStill() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-shell-sea">
      <div className={`${LAYER} scale-105 blur-lg`} style={{ backgroundImage: `url(${HARBOUR_STILL.placeholder})` }} />
      <div className={LAYER} style={{ backgroundImage: `url(${STILL_URL})` }} />
    </div>
  );
}
