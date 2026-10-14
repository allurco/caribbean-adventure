/**
 * An avatar URL fit to put in an `<img src>` (#105), or null: an absolute
 * `https:` URL of at most 2048 characters with no whitespace or control
 * characters, the same rule as the `profiles` table's check. The table
 * already holds it, but the client checks again before rendering anything a
 * player could set. Anything else falls back to the seal.
 */
export const AVATAR_URL_MAX_LENGTH = 2048;

// eslint-disable-next-line no-control-regex
const SPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f-\u009f]/;

export function safeAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > AVATAR_URL_MAX_LENGTH || SPACE_OR_CONTROL.test(raw)) return null;
  if (!raw.startsWith("https://")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname !== "" ? raw : null;
}
