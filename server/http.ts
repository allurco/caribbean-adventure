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
  | "not_your_turn"
  | "stale_state"
  | "match_over"
  | "move_refused"
  | "payload_too_large"
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

export type BoundedBody = { kind: "object"; body: Record<string, unknown> } | { kind: "invalid" } | { kind: "too_large" };

/**
 * The body as a JSON object, read no further than `maxBytes`: a larger body
 * is `too_large` (answer 413) and never parsed. Vercel buffers a request's
 * body before the function runs, so this bounds parsing and the function's
 * memory, not what crosses the network. Web-standard streams only.
 */
export async function readBoundedJsonObject(request: Request, maxBytes: number): Promise<BoundedBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { kind: "too_large" };
  if (!request.body) return { kind: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { kind: "too_large" };
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? { kind: "object", body: body as Record<string, unknown> }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

export { isUuid } from "../src/online/uuid";
