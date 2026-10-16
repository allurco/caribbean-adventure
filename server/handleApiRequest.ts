/**
 * The `/api` routes (#105, PRD #104): one web-standard handler that the single
 * Vercel Function in `api/index.ts` serves for every `/api/*` path
 * (`vercel.json` rewrites them there), so later slices add routes here, not
 * new functions. Tested with plain Requests and in-memory `services`.
 *
 * Online play (#112) needs `services`: the database and the sign-in check,
 * built from the server's environment (`services.ts`). Without them (no
 * Supabase configured) those routes answer 503 and only health works.
 */
import { deleteAccount } from "./account";
import { backendStatus, type BackendStatus } from "./backendStatus";
import { bearerToken, fail, json } from "./http";
import type { MatchSignals } from "./matchSignals";
import { isAccountGone, type OnlineStore } from "./onlineStore";
import { getMatch, postAction } from "./matches";
import { createRoom, getRoom, joinRoom, startRoom } from "./rooms";
import { listVoyages } from "./voyages";

export type ServerEnv = Readonly<Record<string, string | undefined>>;

/**
 * Who a Supabase access token belongs to: the user's id, or null for a
 * missing, forged or expired token, or when the token could not be checked.
 * Throws `accountGone()` for a sound token whose account is deleted (#108):
 * /api answers that with its own code, `account_deleted`, so a client can
 * tell a finished deletion from a sign-in problem.
 */
export type AuthVerifier = (accessToken: string) => Promise<string | null>;

export interface ApiServices {
  auth: AuthVerifier;
  store: OnlineStore;
  /** A new room's invite code: unguessable (128 random bits). */
  newInviteCode(): string;
  /** A map seed for a room that names none. */
  newMapSeed(): number;
  /** A new match's random seed: unguessable (128 random bits). */
  newMatchSeed(): string;
  /**
   * Tells a match's seats that it changed (#114): Supabase Realtime in
   * production; left out by the in-memory and e2e backends, whose clients
   * poll.
   */
  signals?: MatchSignals;
  /**
   * Keeps work running after the response is sent (Vercel's `waitUntil`,
   * `vercelHandler.ts`): the realtime signal and a seat's last-seen write, so
   * a move never waits on them. Returns whether it took the work; when it did
   * not, or is left out, the route awaits that work before it answers
   * (`afterResponse.ts`).
   */
  defer?: (work: Promise<unknown>) => boolean;
  /** The clock, in ms since the epoch (#114: when a seat was last seen); `Date.now` when left out. */
  now?: () => number;
}

type Route = (request: Request, userId: string, services: ApiServices) => Promise<Response>;

interface RouteEntry {
  method: string;
  /** The path's parameters when it matches, else null. */
  match(path: string): string[] | null;
  run(request: Request, userId: string, services: ApiServices, params: string[]): Promise<Response>;
}

const exact = (want: string) => (path: string) => (path === want ? [] : null);
const pattern = (re: RegExp) => (path: string) => {
  const m = re.exec(path);
  if (!m) return null;
  try {
    return m.slice(1).map(decodeURIComponent);
  } catch {
    // A malformed escape (`%ZZ`) names nothing: no such route.
    return null;
  }
};

const ROUTES: RouteEntry[] = [
  { method: "GET", match: exact("/api/me/rooms"), run: (_req, user, s) => listVoyages(user, s.store) },
  { method: "POST", match: exact("/api/me/delete"), run: (_req, user, s) => deleteAccount(user, s.store) },
  { method: "POST", match: exact("/api/rooms"), run: (req, user, s) => createRoom(req, user, s) },
  { method: "POST", match: exact("/api/rooms/join"), run: (req, user, s) => joinRoom(req, user, s) },
  { method: "POST", match: pattern(/^\/api\/rooms\/([^/]+)\/start$/), run: (_req, user, s, [id]) => startRoom(id, user, s) },
  {
    method: "GET",
    match: (path) => (path === "/api/rooms/join" ? null : pattern(/^\/api\/rooms\/([^/]+)$/)(path)),
    run: (_req, user, s, [id]) => getRoom(id, user, s),
  },
  { method: "GET", match: pattern(/^\/api\/matches\/([^/]+)$/), run: (req, user, s, [id]) => getMatch(req, id, user, s) },
  {
    method: "POST",
    match: pattern(/^\/api\/matches\/([^/]+)\/actions$/),
    run: (req, user, s, [id]) => postAction(req, id, user, s),
  },
];

export async function handleApiRequest(request: Request, env: ServerEnv, services: ApiServices | null = null): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ ok: false, error: "method not allowed" }, 405, { allow: "GET, HEAD" });
    }
    return json(health(env));
  }

  try {
    const route = findRoute(request.method, path);
    if (route === "not found") return fail(404, "not_found", "not found");
    if (route === "method not allowed") return fail(405, "method_not_allowed", "method not allowed");
    if (!services) return fail(503, "not_configured", "online play is not configured");
    const token = bearerToken(request);
    const userId = token ? await services.auth(token) : null;
    if (!userId) return fail(401, "unauthorized", "sign in first");
    return await route(request, userId, services);
  } catch (error) {
    // The account is deleted (#108): by the token check, or by the store after it.
    if (isAccountGone(error)) return fail(401, "account_deleted", "the account is deleted");
    // The details stay in the function's log, never in the response.
    console.error(error);
    return fail(500, "internal", "something went wrong");
  }
}

function findRoute(method: string, path: string): Route | "not found" | "method not allowed" {
  let pathMatched = false;
  for (const entry of ROUTES) {
    const params = entry.match(path);
    if (!params) continue;
    pathMatched = true;
    if (entry.method === method) return (request, userId, services) => entry.run(request, userId, services, params);
  }
  return pathMatched ? "method not allowed" : "not found";
}

/** Liveness, the commit deployed, and whether the backend is wired, without a single setting's value. */
function health(env: ServerEnv) {
  return {
    ok: true,
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    environment: env.VERCEL_ENV || "local",
    supabase: supabaseHealth(backendStatus(env)),
  };
}

/** A preview refused production's database, or whose guard is not configured, says so (#107). */
function supabaseHealth(status: BackendStatus) {
  switch (status) {
    case "none":
      return { configured: false };
    case "refused":
      return { configured: false, previewOnProduction: true };
    case "unset-guard":
      return { configured: true, guard: "unset" };
    case "ok":
      return { configured: true };
  }
}
