import { describe, expect, it } from "vitest";
import { realtimeSignals } from "./matchSignals";

const MATCH = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

interface Sent {
  url: string;
  init: RequestInit;
}

function fakeFetch(answer: () => Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return answer();
  };
  return { sent, fetch };
}

describe("realtimeSignals (#114)", () => {
  it("broadcasts 'changed' on the match's private channel through Realtime's REST endpoint, with the version alone", async () => {
    const { sent, fetch } = fakeFetch(async () => new Response(null, { status: 202 }));
    const signals = realtimeSignals({ url: "https://project.example/", key: "sb_secret_test", fetch });
    await signals.changed(MATCH, 12);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://project.example/realtime/v1/api/broadcast");
    expect(sent[0].init.method).toBe("POST");
    const headers = new Headers(sent[0].init.headers);
    expect(headers.get("apikey")).toBe("sb_secret_test");
    expect(headers.get("content-type")).toBe("application/json");
    // A secret key is not a JWT: it goes on `apikey` only.
    expect(headers.get("authorization")).toBeNull();
    expect(JSON.parse(String(sent[0].init.body))).toEqual({
      messages: [{ topic: `match:${MATCH}`, event: "changed", payload: { v: 12 }, private: true }],
    });
  });

  it("also sends a legacy service-role JWT as the bearer, as supabase-js does", async () => {
    const { sent, fetch } = fakeFetch(async () => new Response(null, { status: 202 }));
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2ln";
    await realtimeSignals({ url: "http://127.0.0.1:54321", key: jwt, fetch }).changed(MATCH, 3);
    const headers = new Headers(sent[0].init.headers);
    expect(headers.get("apikey")).toBe(jwt);
    expect(headers.get("authorization")).toBe(`Bearer ${jwt}`);
  });

  it("rejects when Realtime refuses, so the move's route can log it", async () => {
    const { fetch } = fakeFetch(async () => new Response("nope", { status: 401 }));
    await expect(realtimeSignals({ url: "https://project.example", key: "k", fetch }).changed(MATCH, 1)).rejects.toThrow(/401/);
  });

  it("gives up after its timeout rather than hold the move's response", async () => {
    const { fetch } = fakeFetch(
      () =>
        new Promise<Response>(() => {
          /* never answers */
        }),
    );
    const signals = realtimeSignals({ url: "https://project.example", key: "k", fetch, timeoutMs: 20 });
    await expect(signals.changed(MATCH, 1)).rejects.toThrow(/timed out/);
  });
});
