/**
 * The `/api` routes (#105, PRD #104): one web-standard handler that the single
 * Vercel Function in `api/index.ts` serves for every `/api/*` path
 * (`vercel.json` rewrites them there), so later slices add routes here, not
 * new functions. Pure apart from what `env` holds; tested with plain Requests.
 */
export type ServerEnv = Readonly<Record<string, string | undefined>>;

export async function handleApiRequest(request: Request, env: ServerEnv): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ ok: false, error: "method not allowed" }, 405, { allow: "GET, HEAD" });
    }
    return json(health(env));
  }
  return json({ ok: false, error: "not found" }, 404);
}

/** Liveness, the commit deployed, and whether the backend is wired, without a single setting's value. */
function health(env: ServerEnv) {
  return {
    ok: true,
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    environment: env.VERCEL_ENV || "local",
    supabase: {
      configured: Boolean(env.SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)),
    },
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
