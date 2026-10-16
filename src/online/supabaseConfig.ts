/**
 * Where the online backend lives (#105), read from the build's environment.
 * Null when it is not configured: the game then runs as the local hotseat
 * client with no sign-in at all.
 *
 * Both the `VITE_` names (set by hand, or by the Supabase CLI locally) and the
 * `NEXT_PUBLIC_` names the Vercel Marketplace integration injects are read;
 * `vite.config.ts` exposes both prefixes to the client. Only the project URL
 * and its publishable (anon) key are read here: both are public by design,
 * row-level security guards the data.
 *
 * A preview build handed production's URL gets no backend at all
 * (`previewGuard.ts`, #107): it must talk to its own Supabase branch or none.
 * The deploy environment is `VERCEL_ENV`, which `vite.config.ts` bakes in from
 * the build's own environment, or else `VITE_VERCEL_ENV` (Vercel's exposed
 * system variable, or one set by hand).
 */
import { PRODUCTION_URL_NAME, previewGuard, type PreviewGuard } from "./previewGuard";

export interface SupabaseConfig {
  url: string;
  key: string;
}

export type EnvLike = Readonly<Record<string, string | boolean | undefined>>;

const URL_NAMES = ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const KEY_NAMES = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Defined by `vite.config.ts` from the build's `process.env.VERCEL_ENV`; empty outside Vercel. */
export const BUILD_VERCEL_ENV_NAME = "VERCEL_ENV";
/** The fallback: Vercel's system variable when exposed to the build, or set by hand. */
export const VITE_VERCEL_ENV_NAME = "VITE_VERCEL_ENV";

/**
 * The backend this build may use: none configured, refused (a preview handed
 * production's URL), or a config, with what the preview guard made of it.
 */
export type SupabaseBackend =
  | { status: "none" }
  | { status: "refused" }
  | { status: "ok"; config: SupabaseConfig; guard: PreviewGuard };

export function readSupabaseBackend(env: EnvLike): SupabaseBackend {
  const url = firstSet(env, URL_NAMES);
  const key = firstSet(env, KEY_NAMES);
  if (url === undefined || key === undefined) return { status: "none" };
  const guard = previewGuard({ deployEnv: deployEnvOf(env), supabaseUrl: url, productionUrl: firstSet(env, [PRODUCTION_URL_NAME]) });
  if (guard === "refused") return { status: "refused" };
  return { status: "ok", config: { url: url.replace(/\/+$/, ""), key }, guard };
}

export function readSupabaseConfig(env: EnvLike): SupabaseConfig | null {
  const backend = readSupabaseBackend(env);
  return backend.status === "ok" ? backend.config : null;
}

/** Vercel's environment for this build (`preview`, `production`, …), if any. */
export function deployEnvOf(env: EnvLike): string | undefined {
  return firstSet(env, [BUILD_VERCEL_ENV_NAME, VITE_VERCEL_ENV_NAME]);
}

function firstSet(env: EnvLike, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}
