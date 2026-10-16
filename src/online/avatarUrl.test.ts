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
      "https://anything.googleusercontent.com/a.png",
      "https://storage.googleusercontent.com/a.png",
      "https://lh7.googleusercontent.com/a.png",
      "https://lh3.googleusercontent.com.evil.example/a.png",
    ]) {
      expect(safeAvatarUrl(url), url).toBeNull();
    }
  });

  it("is null when the URL carries credentials, even on an avatar host", () => {
    for (const url of [
      "https://user@cdn.discordapp.com/avatars/1/a.png",
      "https://user@lh3.googleusercontent.com/a/x",
      // user, then ":", then a secret, then "@": built from parts so it reads as no real credential.
      ["https://user", "x@lh3.googleusercontent.com/a/x"].join(":"),
      ["https://", "x@cdn.discordapp.com/avatars/1/a.png"].join(":"),
    ]) {
      expect(safeAvatarUrl(url), url).toBeNull();
    }
  });

  it("keeps only Discord's avatar paths, its default avatars included", () => {
    expect(safeAvatarUrl("https://cdn.discordapp.com/embed/avatars/3.png")).toBe("https://cdn.discordapp.com/embed/avatars/3.png");
    for (const url of [
      "https://cdn.discordapp.com/attachments/1/2/pic.png",
      "https://cdn.discordapp.com/emojis/1.png",
      "https://cdn.discordapp.com/avatars/abc/a.png",
      "https://cdn.discordapp.com/avatars/1",
      "https://cdn.discordapp.com/x/avatars/1/a.png",
    ]) {
      expect(safeAvatarUrl(url), url).toBeNull();
    }
  });

  it("keeps Google's lh3 to lh6 picture hosts", () => {
    for (const host of ["lh3", "lh4", "lh5", "lh6"]) {
      expect(safeAvatarUrl(`https://${host}.googleusercontent.com/a/x`)).toBe(`https://${host}.googleusercontent.com/a/x`);
    }
  });

  it("gives back the URL as the browser parses it, not the string it was given", () => {
    expect(safeAvatarUrl("https://CDN.DiscordApp.com/avatars/1/a.png")).toBe("https://cdn.discordapp.com/avatars/1/a.png");
    expect(safeAvatarUrl("https://cdn.discordapp.com:443/avatars/1/a.png")).toBe("https://cdn.discordapp.com/avatars/1/a.png");
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
    expect(safeAvatarUrl("https://cdn.discordapp.com/avatars/1/a b.png")).toBeNull();
    expect(safeAvatarUrl("https://cdn.discordapp.com/avatars/1/a\u0000.png")).toBeNull();
    expect(safeAvatarUrl(" https://cdn.discordapp.com/avatars/1/a.png")).toBeNull();
  });

  it("is null past the length the table allows", () => {
    const base = "https://cdn.discordapp.com/avatars/1/";
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length))).not.toBeNull();
    expect(safeAvatarUrl(base + "a".repeat(AVATAR_URL_MAX_LENGTH - base.length + 1))).toBeNull();
  });
});
