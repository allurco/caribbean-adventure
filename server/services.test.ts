import { describe, expect, it } from "vitest";
import { newInviteCode, newMapSeed, servicesFromEnv } from "./services";
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
