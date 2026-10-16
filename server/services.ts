/**
 * The online services built from the server's environment (#112): the
 * Supabase-backed store and sign-in check, created lazily on first use. The
 * secret (service-role) key is read here, on the server, and nowhere else;
 * it never has a `VITE_` or `NEXT_PUBLIC_` name, so no build ships it.
 */
import { randomBytes, randomInt } from "node:crypto";
import type { ApiServices, ServerEnv } from "./handleApiRequest";
import { PRODUCTION_URL_NAME, previewUsesProduction } from "../src/online/previewGuard";
import { createSupabaseOnlineStore, supabaseAuthVerifier, type ServiceClient } from "./supabaseOnlineStore";

/** The services, or null when Supabase is not configured (the routes then answer 503). */
export function servicesFromEnv(env: ServerEnv): ApiServices | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // A preview handed production's database answers 503 rather than write there (#107).
  if (previewUsesProduction({ deployEnv: env.VERCEL_ENV, supabaseUrl: url, productionUrl: env[PRODUCTION_URL_NAME] })) {
    return null;
  }

  let client: Promise<ServiceClient> | undefined;
  const service = () =>
    (client ??= import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
    ));
  return {
    auth: supabaseAuthVerifier(service),
    store: createSupabaseOnlineStore(service),
    newInviteCode,
    newMapSeed,
    newMatchSeed,
  };
}

/** 128 random bits as 22 base64url characters. */
export function newInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

/** A random int32 map seed (`isValidMapSeed`). */
export function newMapSeed(): number {
  return randomInt(-(2 ** 31), 2 ** 31 - 1);
}

/**
 * A new match's random seed (#112 review): 128 random bits. boardgame.io's own
 * default is the clock in base 36, which a player could guess from the
 * match's creation time and replay to learn every hand and die roll.
 */
export function newMatchSeed(): string {
  return randomBytes(16).toString("hex");
}
