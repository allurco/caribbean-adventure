import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "./supabaseConfig";

describe("readSupabaseConfig", () => {
  it("is null with no Supabase variables: the hotseat game runs with no backend", () => {
    expect(readSupabaseConfig({})).toBeNull();
  });

  it("is null when only the URL or only the key is set", () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co" })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: "key" })).toBeNull();
  });

  it("reads the VITE_ names", () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" }),
    ).toEqual({ url: "https://example.supabase.co", key: "anon" });
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub" }),
    ).toEqual({ url: "https://example.supabase.co", key: "pub" });
  });

  it("reads the names the Vercel Marketplace integration injects", () => {
    expect(
      readSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      }),
    ).toEqual({ url: "https://example.supabase.co", key: "pub" });
    expect(
      readSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }),
    ).toEqual({ url: "https://example.supabase.co", key: "anon" });
  });

  it("prefers the VITE_ names and the publishable key", () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://vite.supabase.co",
        NEXT_PUBLIC_SUPABASE_URL: "https://next.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_PUBLISHABLE_KEY: "pub",
      }),
    ).toEqual({ url: "https://vite.supabase.co", key: "pub" });
  });

  it("treats blank values as absent and trims the rest", () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: "  ", VITE_SUPABASE_ANON_KEY: "anon" })).toBeNull();
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: " https://example.supabase.co/ ", VITE_SUPABASE_ANON_KEY: " anon " }),
    ).toEqual({ url: "https://example.supabase.co", key: "anon" });
  });
});

describe("readSupabaseConfig on a preview deployment (#107)", () => {
  const production = "https://prod-ref.supabase.co";

  it("is null when a preview build was handed production's URL: it never talks to production", () => {
    expect(
      readSupabaseConfig({
        VITE_VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        NEXT_PUBLIC_SUPABASE_URL: "https://PROD-ref.supabase.co/",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      }),
    ).toBeNull();
  });

  it("reads a preview's own branch, and production's URL in a production build", () => {
    expect(
      readSupabaseConfig({
        VITE_VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        NEXT_PUBLIC_SUPABASE_URL: "https://branch-ref.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      }),
    ).toEqual({ url: "https://branch-ref.supabase.co", key: "pub" });
    expect(
      readSupabaseConfig({
        VITE_VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
        NEXT_PUBLIC_SUPABASE_URL: production,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
      }),
    ).toEqual({ url: production, key: "pub" });
  });
});

describe("readSupabaseConfig: where the deploy environment comes from (#107)", () => {
  const production = "https://prod-ref.supabase.co";
  const handedProduction = {
    NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production,
    NEXT_PUBLIC_SUPABASE_URL: production,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
  };

  it("reads VERCEL_ENV, which vite.config.ts bakes in from the build's own environment", () => {
    expect(readSupabaseConfig({ ...handedProduction, VERCEL_ENV: "preview" })).toBeNull();
  });

  it("falls back to VITE_VERCEL_ENV when VERCEL_ENV is empty (a build outside Vercel)", () => {
    expect(readSupabaseConfig({ ...handedProduction, VERCEL_ENV: "", VITE_VERCEL_ENV: "preview" })).toBeNull();
  });

  it("prefers VERCEL_ENV over VITE_VERCEL_ENV", () => {
    expect(readSupabaseConfig({ ...handedProduction, VERCEL_ENV: "production", VITE_VERCEL_ENV: "preview" })).toEqual({
      url: production,
      key: "pub",
    });
  });
});
