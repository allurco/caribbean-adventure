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
