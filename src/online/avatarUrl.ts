/**
 * An avatar URL fit to put in an `<img src>` (#105), or null: an absolute
 * `https:` URL of at most 2048 characters with no whitespace or control
 * characters, the same rule as the `profiles` table's check, on one of the
 * sign-in providers' image hosts (#106). The table already holds the first
 * rule, but a player can set their own avatar URL, so the client checks again
 * before rendering it: the host list keeps a profile from making every
 * viewer's browser call a server of the player's choosing. Anything else
 * falls back to the seal.
 */
export const AVATAR_URL_MAX_LENGTH = 2048;

/** Discord's avatar CDN. */
const AVATAR_HOSTS: readonly string[] = ["cdn.discordapp.com"];
/** Google's profile pictures are served from lh3, lh4… under this domain. */
const AVATAR_HOST_SUFFIXES: readonly string[] = [".googleusercontent.com"];

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
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return isAvatarHost(url.hostname) ? raw : null;
}

function isAvatarHost(hostname: string): boolean {
  return AVATAR_HOSTS.includes(hostname) || AVATAR_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}
