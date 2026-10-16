/**
 * Supabase applies `config.toml`'s `[auth]` to the local stack and to every
 * pull request's preview branch (#107). An allowed redirect with a wildcard
 * in its host, such as `https://<project>-*.vercel.app/**`, is an open
 * redirect: anyone can host a page on a matching name, start a magic link
 * or OAuth sign-in with `redirect_to` pointing there, and receive the
 * session tokens. Only the loopback dev hosts may carry wildcards, and only
 * in the path. Read from the file; needs no database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Every URL listed in an `additional_redirect_urls` array, `[remotes.*]` blocks included. */
function redirectUrls(toml: string): string[] {
  const withoutComments = toml.replace(/#.*$/gm, "");
  return [...withoutComments.matchAll(/additional_redirect_urls\s*=\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]*)"/g)].map((q) => q[1]),
  );
}

/** The host of a redirect URL, port and credentials stripped. */
function hostOf(url: string): string {
  const authority = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
  return authority.replace(/^.*@/, "").replace(/:[^:]*$/, "").toLowerCase();
}

/** Why a redirect URL is unsafe to allow, or null when it is fine. */
function unsafeRedirect(url: string): string | null {
  const host = hostOf(url);
  if (/[*?[\]{}]/.test(host)) return `wildcard in host ${host}`;
  if (!/^https:\/\//i.test(url) && !LOOPBACK_HOSTS.has(host)) return "not https";
  return null;
}

describe("auth redirect URLs in supabase/config.toml (#107)", () => {
  const urls = redirectUrls(readFileSync(join(import.meta.dirname, "..", "config.toml"), "utf8"));

  it("lists the local dev server", () => {
    expect(urls).toContain("http://localhost:5173/**");
  });

  it("allows no host wildcard and nothing but https off the loopback hosts", () => {
    expect(urls.map((url) => [url, unsafeRedirect(url)]).filter(([, why]) => why !== null)).toEqual([]);
  });

  it("would catch a wildcard preview host", () => {
    expect(unsafeRedirect("https://caribbean-adventure-*.vercel.app/**")).toMatch(/wildcard in host/);
    expect(unsafeRedirect("https://*-team.vercel.app/**")).toMatch(/wildcard in host/);
    expect(unsafeRedirect("http://example.com/**")).toBe("not https");
    expect(unsafeRedirect("http://localhost:5173/**")).toBeNull();
    expect(unsafeRedirect("https://game.example.com/**")).toBeNull();
  });
});
