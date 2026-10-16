/**
 * The guard that keeps a preview deployment off production's database (#107).
 *
 * Each pull request's Vercel preview should talk to its own Supabase branch.
 * The integration writes the branch's URL and keys as branch-scoped Preview
 * variables, but if production's values reach the Preview scope (the
 * integration's Preview box ticked, or a build that ran before the branch's
 * variables were written), the preview would sign players in and write rooms
 * on production. The maintainer names production's public URL once, in
 * `NEXT_PUBLIC_SUPABASE_PRODUCTION_URL`; a preview that was handed that URL
 * then runs with no backend (the browser) and answers 503 (`/api`).
 *
 * Without the production URL set, nothing can be compared: the guard reports
 * itself `unset` (`/api/health`, the preview's marker) rather than refusing
 * every preview, which would take previews offline until the maintainer
 * finishes set-up. Hosts are compared, not whole URLs: case, a trailing slash
 * or a path cannot hide production. Pure: the browser and the server pass
 * their own environment's names.
 */
export const PRODUCTION_URL_NAME = "NEXT_PUBLIC_SUPABASE_PRODUCTION_URL";

export interface PreviewBackend {
  /** Vercel's environment: `VERCEL_ENV` on the server and in the build (`vite.config.ts`). */
  deployEnv: string | undefined;
  /** The Supabase URL this deployment was given. */
  supabaseUrl: string | undefined;
  /** Production's Supabase URL, from `NEXT_PUBLIC_SUPABASE_PRODUCTION_URL`. */
  productionUrl: string | undefined;
}

/**
 * - `not-preview`: production, development or no Vercel at all; the guard does not apply.
 * - `unset`: a preview with no production URL to compare with; nothing is refused.
 * - `refused`: a preview handed production's Supabase URL.
 * - `allowed`: a preview on another Supabase project (its branch).
 */
export type PreviewGuard = "not-preview" | "unset" | "refused" | "allowed";

export function previewGuard({ deployEnv, supabaseUrl, productionUrl }: PreviewBackend): PreviewGuard {
  if (deployEnv?.trim().toLowerCase() !== "preview") return "not-preview";
  const production = host(productionUrl);
  if (production === "") return "unset";
  const own = host(supabaseUrl);
  return own !== "" && own === production ? "refused" : "allowed";
}

/** True when a preview deployment was handed production's Supabase URL. */
export function previewUsesProduction(backend: PreviewBackend): boolean {
  return previewGuard(backend) === "refused";
}

/** The URL's host name, lower-cased; a value that is no URL is compared as written. */
function host(url: string | undefined): string {
  const value = (url ?? "").trim();
  if (value === "") return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.replace(/\/+$/, "").toLowerCase();
  }
}
