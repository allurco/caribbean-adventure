import { describe, expect, it } from "vitest";
import { backendStatus } from "./backendStatus";

const production = "https://prod-ref.supabase.co";
const branch = "https://branch-ref.supabase.co";

describe("backendStatus (#107)", () => {
  it("is none without both a Supabase URL and a secret key", () => {
    expect(backendStatus({})).toBe("none");
    expect(backendStatus({ SUPABASE_URL: branch })).toBe("none");
    expect(backendStatus({ SUPABASE_SECRET_KEY: "sk" })).toBe("none");
  });

  it("is ok with a URL and either key name outside a preview", () => {
    expect(backendStatus({ SUPABASE_URL: production, SUPABASE_SECRET_KEY: "sk" })).toBe("ok");
    expect(
      backendStatus({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production, SUPABASE_URL: production, SUPABASE_SERVICE_ROLE_KEY: "sr" }),
    ).toBe("ok");
  });

  it("refuses a preview handed production's URL, and allows its own branch", () => {
    const env = { VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_PRODUCTION_URL: production, SUPABASE_SECRET_KEY: "sk" };
    expect(backendStatus({ ...env, SUPABASE_URL: `${production}/` })).toBe("refused");
    expect(backendStatus({ ...env, SUPABASE_URL: branch })).toBe("ok");
  });

  it("is unset-guard on a preview with no production URL to compare with", () => {
    expect(backendStatus({ VERCEL_ENV: "preview", SUPABASE_URL: production, SUPABASE_SECRET_KEY: "sk" })).toBe("unset-guard");
  });
});
