/**
 * Coming back from a sign-in (#105 email link, #106 Discord and Google).
 * Supabase Auth sends the player back to the page they left, with the
 * session in the URL's hash on success (supabase-js reads it), or an
 * `error`, `error_code` and `error_description` in the query or the hash on
 * failure, which supabase-js only logs. These read and clean that URL. Pure,
 * no React.
 */

const ERROR_PARAMS = ["error", "error_code", "error_description"] as const;
const DESCRIPTION_MAX = 180;

/**
 * Where a sign-in should bring the player back: the page they are on, on
 * whatever host serves it (local, production, a Vercel preview), without a
 * hash or the error of an earlier attempt. Supabase accepts it only when it
 * matches the project's redirect URLs (docs/deploy.md).
 */
export function signInRedirectUrl(href: string): string {
  const url = new URL(href);
  for (const name of ERROR_PARAMS) url.searchParams.delete(name);
  url.hash = "";
  return url.toString();
}

/** The sentence to show when the URL is a failed or cancelled sign-in's return, else null. */
export function signInReturnError(href: string): string | null {
  const params = errorParams(href);
  if (!params) return null;
  const { error, code, description } = params;
  if (code === "otp_expired") return "That sign-in link has expired or was already used. Ask for a new one.";
  if (error === "access_denied" && !code) return "Sign-in was cancelled. Choose a way to sign in to try again.";
  const detail = oneLine(description);
  return detail ? `Sign-in did not finish: ${detail}` : "Sign-in did not finish. Please try again.";
}

/** The URL without a sign-in error in its query or hash, to replace it with; null when there is none. */
export function withoutSignInError(href: string): string | null {
  if (!errorParams(href)) return null;
  const url = new URL(href);
  for (const name of ERROR_PARAMS) url.searchParams.delete(name);
  if (hasError(new URLSearchParams(url.hash.slice(1)))) url.hash = "";
  return url.toString();
}

function errorParams(href: string): { error: string; code: string; description: string } | null {
  const url = new URL(href);
  for (const params of [new URLSearchParams(url.hash.slice(1)), url.searchParams]) {
    if (hasError(params)) {
      return {
        error: params.get("error") ?? "",
        code: params.get("error_code") ?? "",
        description: params.get("error_description") ?? "",
      };
    }
  }
  return null;
}

function hasError(params: URLSearchParams): boolean {
  return ERROR_PARAMS.some((name) => params.has(name));
}

/** Anyone can put a description in a link: it is shown as one short line of plain text. */
function oneLine(text: string): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 1)}…` : flat;
}
