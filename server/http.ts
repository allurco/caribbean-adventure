/** Small Request/Response helpers shared by the `/api` routes. */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/**
 * A refusal: `code` is stable, for clients to act on (`ApiErrorCode`);
 * `error` is a sentence for people and logs, and may change.
 */
export function fail(status: number, code: ApiErrorCode, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, code, error, ...extra }, status);
}

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "rate_limited"
  | "room_full"
  | "match_started"
  | "match_starting"
  | "seats_free"
  | "not_host"
  | "not_configured"
  | "internal";

/** The bearer token of the request's Authorization header, if any. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** The body as a JSON object, or null for anything else (absent, malformed, an array, a string). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export { isUuid } from "../src/online/uuid";
