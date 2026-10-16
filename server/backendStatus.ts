/**
 * What the server's environment makes of the online backend, read once for
 * both `servicesFromEnv` and `/api/health` (#107):
 *
 * - `none`: no Supabase URL and secret key; the online routes answer 503.
 * - `refused`: a preview handed production's Supabase URL (`previewGuard.ts`); 503 too.
 * - `unset-guard`: a preview whose guard has no production URL to compare
 *   with (`NEXT_PUBLIC_SUPABASE_PRODUCTION_URL` unset). It runs, and health says so.
 * - `ok`: configured, and not refused.
 */
import type { ServerEnv } from "./handleApiRequest";
import { PRODUCTION_URL_NAME, previewGuard } from "../src/online/previewGuard";

export type BackendStatus = "none" | "refused" | "unset-guard" | "ok";

export function backendStatus(env: ServerEnv): BackendStatus {
  const url = env.SUPABASE_URL;
  if (!url || !serviceKey(env)) return "none";
  switch (previewGuard({ deployEnv: env.VERCEL_ENV, supabaseUrl: url, productionUrl: env[PRODUCTION_URL_NAME] })) {
    case "refused":
      return "refused";
    case "unset":
      return "unset-guard";
    default:
      return "ok";
  }
}

/** The service-role key, under its current name or the older one. */
export function serviceKey(env: ServerEnv): string | undefined {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}
