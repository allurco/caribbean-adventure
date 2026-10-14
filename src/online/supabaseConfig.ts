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
 */
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

export function readSupabaseConfig(env: EnvLike): SupabaseConfig | null {
  const url = firstSet(env, URL_NAMES);
  const key = firstSet(env, KEY_NAMES);
  if (url === undefined || key === undefined) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

function firstSet(env: EnvLike, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}
