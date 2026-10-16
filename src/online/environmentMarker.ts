/**
 * The line a preview deployment shows in its corner (#107): which Supabase
 * project it talks to, so a reviewer can tell at a glance that a pull
 * request's preview reads its own branch database and not production's.
 * Production, local development and builds outside Vercel show nothing.
 */
import { readSupabaseConfig, type EnvLike } from "./supabaseConfig";

export function environmentMarker(env: EnvLike): string | null {
  if (env.VITE_VERCEL_ENV !== "preview") return null;
  const config = readSupabaseConfig(env);
  if (config) return `Preview · database ${projectName(config.url)}`;
  // Configured, yet refused: previewGuard.ts kept it off production.
  const refused = readSupabaseConfig({ ...env, VITE_VERCEL_ENV: undefined }) !== null;
  return refused
    ? "Preview · online play off: this build was given production's database"
    : "Preview · online play off: no database";
}

/** `https://<ref>.supabase.co` → `<ref>`; any other URL → its host. */
function projectName(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : host;
  } catch {
    return url;
  }
}
