import { describe, expect, it } from "vitest";
import { newInviteCode, newMapSeed, newMatchSeed, servicesFromEnv } from "./services";
import { isValidMapSeed } from "../src/game/mapSeed";
import { parseOnlineRoute } from "../src/online/onlineRoute";

describe("servicesFromEnv", () => {
  it("is null without a Supabase URL and secret key, so online routes answer 503", () => {
    expect(servicesFromEnv({})).toBeNull();
    expect(servicesFromEnv({ SUPABASE_URL: "https://example.supabase.co" })).toBeNull();
    // A publishable key is not a server credential.
    expect(servicesFromEnv({ SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" })).toBeNull();
  });

  it("builds the services from the URL and the secret (or legacy service-role) key", () => {
    expect(servicesFromEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sk" })).not.toBeNull();
    expect(servicesFromEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr" })).not.toBeNull();
  });

  it("signals each match's changes over Supabase Realtime (#114)", () => {
    expect(servicesFromEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sk" })?.signals).toBeDefined();
  });
});

describe("servicesFromEnv on a preview deployment (#107)", () => {
  const production = "https://prod-ref.supabase.co";

  it("is null when a preview was handed production's URL, so its online routes answer 503", () => {
    expect(
      servicesFromEnv({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        SUPABASE_URL: production,
        SUPABASE_SECRET_KEY: "sk",
      }),
    ).toBeNull();
  });

  it("builds a preview's services on its own branch, and production's in production", () => {
    expect(
      servicesFromEnv({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        SUPABASE_URL: "https://branch-ref.supabase.co",
        SUPABASE_SECRET_KEY: "sk",
      }),
    ).not.toBeNull();
    expect(
      servicesFromEnv({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        SUPABASE_URL: production,
        SUPABASE_SECRET_KEY: "sk",
      }),
    ).not.toBeNull();
  });
});

describe("newInviteCode", () => {
  it("is 22 base64url characters (128 random bits) that an invite link carries", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newInviteCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(parseOnlineRoute(`?view=join&invite=${code}`)).toEqual({ kind: "join", inviteCode: code });
    }
  });
});

describe("newMapSeed", () => {
  it("is a valid map seed", () => {
    for (let i = 0; i < 100; i++) expect(isValidMapSeed(newMapSeed())).toBe(true);
  });
});

describe("newMatchSeed", () => {
  it("is 128 random bits in hex, different every time, whatever the clock says", () => {
    const seeds = new Set(Array.from({ length: 200 }, () => newMatchSeed()));
    expect(seeds.size).toBe(200);
    for (const seed of seeds) expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });
});
