import { describe, expect, it } from "vitest";
import { DELETED_PLAYER_NAME, DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from "./displayName";

describe("validateDisplayName", () => {
  it("accepts a plain name", () => {
    expect(validateDisplayName("Anne Bonny")).toEqual({ ok: true, value: "Anne Bonny" });
  });

  it("trims the ends and collapses runs of whitespace", () => {
    expect(validateDisplayName("  Calico \t  Jack ")).toEqual({ ok: true, value: "Calico Jack" });
  });

  it("rejects an empty or blank name", () => {
    expect(validateDisplayName("")).toMatchObject({ ok: false });
    expect(validateDisplayName("   ")).toMatchObject({ ok: false });
  });

  it("allows up to the maximum length, counted in characters not UTF-16 units", () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(32);
    expect(validateDisplayName("a".repeat(32))).toMatchObject({ ok: true });
    expect(validateDisplayName("a".repeat(33))).toMatchObject({ ok: false });
    expect(validateDisplayName("⚓".repeat(32))).toMatchObject({ ok: true });
    expect(validateDisplayName("🏴‍☠️")).toMatchObject({ ok: true });
  });

  it("rejects control characters", () => {
    expect(validateDisplayName("Black\u0000beard")).toMatchObject({ ok: false });
    expect(validateDisplayName("Black\u007fbeard")).toMatchObject({ ok: false });
  });

  it("keeps the deleted player's placeholder name for deleted accounts alone (#108)", () => {
    expect(validateDisplayName(DELETED_PLAYER_NAME)).toMatchObject({ ok: false });
    expect(validateDisplayName("  deleted   PLAYER ")).toMatchObject({ ok: false });
    expect(validateDisplayName("Deleted players")).toMatchObject({ ok: true });
  });
});
