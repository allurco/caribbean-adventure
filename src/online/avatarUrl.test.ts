import { describe, expect, it } from "vitest";
import { AVATAR_URL_MAX_LENGTH, safeAvatarUrl } from "./avatarUrl";

describe("safeAvatarUrl", () => {
  it("keeps an https URL on Discord's or Google's image hosts (#106)", () => {
    expect(safeAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png")).toBe("https://cdn.discordapp.com/avatars/1/a.png");
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/ACg8oc=s96-c")).toBe("https://lh3.googleusercontent.com/a/ACg8oc=s96-c");
  });

  it("is null on any other host, so a profile cannot point viewers' browsers anywhere", () => {
    for (const url of [
      "https://cdn.example/a.png",
      "https://tracker.example/pixel.gif",
      "https://cdn.discordapp.com.evil.example/a.png",
      "https://evil-googleusercontent.com/a.png",
      "https://googleusercontent.com.evil.example/a.png",
      "https://user@cdn.discordapp.com/a.png",
      "https://cdn.discordapp.com:8443/a.png",
    ]) {
      expect(safeAvatarUrl(url), url).toBeNull();
    }
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
    expect(safeAvatarUrl("https://cdn.discordapp.com/a b.png")).toBeNull();
    expect(safeAvatarUrl("https://cdn.discordapp.com/a\u0000.png")).toBeNull();
    expect(safeAvatarUrl(" https://cdn.discordapp.com/a.png")).toBeNull();
  });

  it("is null past the length the table allows", () => {
    const base = "https://cdn.discordapp.com/";
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length))).not.toBeNull();
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length + 1))).toBeNull();
  });
});
