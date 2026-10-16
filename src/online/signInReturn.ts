/**
 * Coming back from a sign-in (#105 email link, #106 Discord and Google).
 * Supabase Auth sends the player back to the page they left, with the
 * session in the URL's hash on success (supabase-js reads it), or an
 * `error`, `error_code` and `error_description` in the query or the hash on
 * failure, which supabase-js only logs. These read and clean that URL. Pure,
 * no React.
 *
 * Anyone can craft such a link, so the page never shows its text: known
 * codes get our own sentences, anything else one generic sentence.
 */

const ERROR_PARAMS = ["error", "error_code", "error_description"] as const;

const GENERIC = "Sign-in did not finish. Please try again.";

/**
 * Our sentence for each `error_code` Supabase Auth sends back
 * (supabase/auth, internal/api/apierrors/errorcode.go).
 */
const MESSAGES_BY_CODE: Readonly<Record<string, string>> = {
  otp_expired: "That sign-in link has expired or was already used. Ask for a new one.",
  provider_email_needs_verification:
    "Your email is not verified with that provider yet. Verify it there (look for a confirmation email), then sign in again.",
  signup_disabled: "New captains cannot sign up just now. Please try again later.",
};

/** A sign-in error as the URL carries it: for the console only, never the page. */
export interface SignInErrorParams {
  error: string;
  code: string;
  description: string;
}

/**
 * Where a sign-in should bring the player back: the page they are on, on
 * whatever host serves it (local, production, a Vercel preview), without a
 * hash or the error of an earlier attempt. Supabase accepts it only when it
 * matches the project's redirect URLs (docs/deploy.md).
 */
export function signInRedirectUrl(href: string): string {
  const url = withoutErrorQuery(href);
  url.hash = "";
  return url.toString();
}

/** The sentence to show when the URL is a failed or cancelled sign-in's return, else null. */
export function signInReturnError(href: string): string | null {
  const params = signInErrorParams(href);
  if (!params) return null;
  const { error, code } = params;
  if (Object.hasOwn(MESSAGES_BY_CODE, code)) return MESSAGES_BY_CODE[code];
  if (error === "access_denied" && !code) return "Sign-in was cancelled. Choose a way to sign in to try again.";
  return GENERIC;
}

/** The URL without a sign-in error in its query or hash, to replace it with; null when there is none. */
export function withoutSignInError(href: string): string | null {
  if (!signInErrorParams(href)) return null;
  const url = withoutErrorQuery(href);
  if (hasError(new URLSearchParams(url.hash.slice(1)))) url.hash = "";
  return url.toString();
}

/** The raw error a sign-in came back with, from the hash or else the query; null when there is none. */
export function signInErrorParams(href: string): SignInErrorParams | null {
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

function withoutErrorQuery(href: string): URL {
  const url = new URL(href);
  for (const name of ERROR_PARAMS) url.searchParams.delete(name);
  return url;
}

function hasError(params: URLSearchParams): boolean {
  return ERROR_PARAMS.some((name) => params.has(name));
}
