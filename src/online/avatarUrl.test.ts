import { describe, expect, it } from "vitest";
import { AVATAR_URL_MAX_LENGTH, safeAvatarUrl } from "./avatarUrl";

describe("safeAvatarUrl", () => {
  it("keeps an https URL", () => {
    expect(safeAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png")).toBe("https://cdn.discordapp.com/avatars/1/a.png");
  });

  it("is null for nothing", () => {
    expect(safeAvatarUrl(null)).toBeNull();
    expect(safeAvatarUrl(undefined)).toBeNull();
    expect(safeAvatarUrl("")).toBeNull();
  });

  it("is null for any other scheme", () => {
    for (const url of [
      "http://cdn.example/a.png",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:image/svg+xml;base64,AAAA",
      "//cdn.example/a.png",
      "/a.png",
      "ftp://cdn.example/a.png",
    ]) {
      expect(safeAvatarUrl(url), url).toBeNull();
    }
  });

  it("is null for something that is not a URL, or holds spaces or control characters", () => {
    expect(safeAvatarUrl("https://")).toBeNull();
    expect(safeAvatarUrl("https://cdn.example/a b.png")).toBeNull();
    expect(safeAvatarUrl("https://cdn.example/a\u0000.png")).toBeNull();
    expect(safeAvatarUrl(" https://cdn.example/a.png")).toBeNull();
  });

  it("is null past the length the table allows", () => {
    const base = "https://cdn.example/";
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length))).not.toBeNull();
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length + 1))).toBeNull();
  });
});
