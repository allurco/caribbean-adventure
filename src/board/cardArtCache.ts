/**
 * The event cards' art, decoded once by the loading gate (#247) and kept:
 * each image stays alive here for the session, so the browser keeps its
 * decoded picture, and the card's `<img>` of the same URL draws at once,
 * without fetching or decoding it again or flashing empty.
 */
/** Never read: holding each image is what keeps its decoded picture. */
const kept = new Map<string, HTMLImageElement>();

/** Loads and decodes the art at `url`, and keeps it. */
export function preloadCardArt(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => {
    kept.set(url, image);
  });
}
