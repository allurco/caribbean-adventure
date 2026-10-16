/**
 * The line a preview deployment shows in its corner (#107): which Supabase
 * project it talks to, so a reviewer can tell at a glance that a pull
 * request's preview reads its own branch database and not production's.
 * Production, local development and builds outside Vercel show nothing.
 */
import { deployEnvOf, readSupabaseBackend, type EnvLike } from "./supabaseConfig";

export function environmentMarker(env: EnvLike): string | null {
  if (deployEnvOf(env)?.toLowerCase() !== "preview") return null;
  const backend = readSupabaseBackend(env);
  switch (backend.status) {
    case "none":
      return "Preview · online play off: no database";
    case "refused":
      // previewGuard.ts kept it off production.
      return "Preview · online play off: this build was given production's database";
    case "ok": {
      const database = `database ${projectName(backend.config.url)}`;
      // NEXT_PUBLIC_SUPABASE_PRODUCTION_URL unset: nothing was compared, so say so.
      return backend.guard === "unset" ? `Preview · guard not configured · ${database}` : `Preview · ${database}`;
    }
  }
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
