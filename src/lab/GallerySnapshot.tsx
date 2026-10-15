import { useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { SEED_GALLERY_SETTLE_MS, type SeedGalleryMessage } from "./seedGalleryShots";

/**
 * One seed-gallery shot (#161), mounted in the board's Canvas under
 * `snapshot=1`: once the scene is ready (the board's loading gate,
 * useSceneReadiness.ts) and has settled, it takes the frame just drawn
 * (right after the render, before the drawing buffer is cleared) and posts
 * it to the gallery that opened this page in its frame.
 */
export function GallerySnapshot({ ready }: { ready: boolean }) {
  const gl = useThree((state) => state.gl);
  const done = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let unsubscribe: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      unsubscribe = addAfterEffect(() => {
        if (done.current) return;
        done.current = true;
        const message: SeedGalleryMessage = { type: "seed-gallery-shot", image: gl.domElement.toDataURL("image/jpeg", 0.88) };
        window.parent.postMessage(message, window.location.origin);
        unsubscribe?.();
      });
    }, SEED_GALLERY_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, [gl, ready]);

  return null;
}
