import { describe, expect, it } from "vitest";
import { environmentMarker } from "./environmentMarker";

const production = "https://prod-ref.supabase.co";
const preview = { VITE_VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub" };

describe("environmentMarker (#107)", () => {
  it("is nothing in production, in local development and in a build with no Vercel at all", () => {
    expect(environmentMarker({ VITE_VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: production, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub" })).toBeNull();
    expect(environmentMarker({ VITE_VERCEL_ENV: "development" })).toBeNull();
    expect(environmentMarker({ VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_ANON_KEY: "anon" })).toBeNull();
  });

  it("names the Supabase project a preview talks to, so a reviewer can see it is the branch", () => {
    expect(environmentMarker({ ...preview, NEXT_PUBLIC_SUPABASE_URL: "https://branch-ref.supabase.co" })).toBe(
      "Preview · database branch-ref",
    );
  });

  it("says a preview handed production's database is offline instead", () => {
    expect(environmentMarker({ ...preview, NEXT_PUBLIC_SUPABASE_URL: production })).toBe(
      "Preview · online play off: this build was given production's database",
    );
  });

  it("says a preview with no database at all is offline", () => {
    expect(environmentMarker({ VITE_VERCEL_ENV: "preview" })).toBe("Preview · online play off: no database");
  });
});
