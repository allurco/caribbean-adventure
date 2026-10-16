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
 * Without the production URL set, nothing can be compared and nothing is
 * refused. Pure: the browser and the server pass their own environment's names.
 */
export const PRODUCTION_URL_NAME = "NEXT_PUBLIC_SUPABASE_PRODUCTION_URL";

export interface PreviewBackend {
  /** Vercel's environment: `VERCEL_ENV` on the server, `VITE_VERCEL_ENV` in the build. */
  deployEnv: string | undefined;
  /** The Supabase URL this deployment was given. */
  supabaseUrl: string | undefined;
  /** Production's Supabase URL, from `NEXT_PUBLIC_SUPABASE_PRODUCTION_URL`. */
  productionUrl: string | undefined;
}

/** True when a preview deployment was handed production's Supabase URL. */
export function previewUsesProduction({ deployEnv, supabaseUrl, productionUrl }: PreviewBackend): boolean {
  if (deployEnv?.trim() !== "preview") return false;
  const url = normalise(supabaseUrl);
  return url !== "" && url === normalise(productionUrl);
}

function normalise(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}
