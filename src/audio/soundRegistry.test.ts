import { describe, it, expect } from "vitest";
import notice from "../../NOTICE?raw";
import { SOUNDS, soundById, soundUrl } from "./soundRegistry";

/** The files under public/sounds (the keys only; nothing is imported). */
const SHIPPED = Object.keys(import.meta.glob("../../public/sounds/*")).map((path) => path.split("/").pop());

describe("sound registry", () => {
  it("has unique ids and files", () => {
    expect(new Set(SOUNDS.map((s) => s.id)).size).toBe(SOUNDS.length);
    expect(new Set(SOUNDS.map((s) => s.file)).size).toBe(SOUNDS.length);
  });

  it("finds every entry by its id", () => {
    for (const sound of SOUNDS) expect(soundById(sound.id)).toBe(sound);
  });

  it("keeps base volumes within 0..1", () => {
    for (const sound of SOUNDS) {
      expect(sound.volume).toBeGreaterThan(0);
      expect(sound.volume).toBeLessThanOrEqual(1);
    }
  });

  it("loops ambience and nothing else", () => {
    for (const sound of SOUNDS) expect(sound.loop).toBe(sound.kind === "ambience");
  });

  it("ships only CC0 OGG files that exist under public/sounds", () => {
    for (const sound of SOUNDS) {
      expect(sound.file).toMatch(/^[a-z0-9-]+\.ogg$/);
      expect(sound.credit.licence).toBe("CC0");
      expect(sound.credit.url).toMatch(/^https:\/\//);
      expect(SHIPPED).toContain(sound.file);
    }
  });

  it("registers every file it ships", () => {
    expect([...SHIPPED].sort()).toEqual(SOUNDS.map((s) => s.file).sort());
  });

  it("lists every file with its source in NOTICE", () => {
    for (const sound of SOUNDS) {
      expect(notice).toContain(`public/sounds/${sound.file}`);
      expect(notice).toContain(sound.credit.url);
    }
  });

  it("builds the served URL under the app's base path", () => {
    const sound = SOUNDS[0];
    expect(soundUrl(sound, "/")).toBe(`/sounds/${sound.file}`);
    expect(soundUrl(sound, "/caribbean/")).toBe(`/caribbean/sounds/${sound.file}`);
  });
});
