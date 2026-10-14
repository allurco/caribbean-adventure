import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./handleApiRequest";

const get = (path: string, env: Record<string, string | undefined> = {}) =>
  handleApiRequest(new Request(`https://game.example${path}`), env);

describe("GET /api/health", () => {
  it("answers ok, with the deployment's commit and environment", async () => {
    const res = await get("/api/health", {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      version: "0123456",
      environment: "preview",
      supabase: { configured: false },
    });
  });

  it("calls a run with no Vercel variables local", async () => {
    expect(await (await get("/api/health")).json()).toMatchObject({ version: "local", environment: "local" });
  });

  it("says whether Supabase is configured, never what with", async () => {
    const res = await get("/api/health", { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret-value" });
    const body = (await res.json()) as { supabase: unknown };
    expect(body.supabase).toEqual({ configured: true });
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(JSON.stringify(body)).not.toContain("example.supabase.co");
  });

  it("is also served with a trailing slash", async () => {
    expect((await get("/api/health/")).status).toBe(200);
  });

  it("refuses other methods", async () => {
    const res = await handleApiRequest(new Request("https://game.example/api/health", { method: "POST" }), {});
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("unknown routes", () => {
  it("are a JSON 404", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not found" });
  });
});
