import { describe, expect, it } from "vitest";
import { confirmsDeletion, DELETE_CONFIRMATION_WORD } from "./deleteConfirmation";

describe("confirmsDeletion (#108)", () => {
  it("asks the player to type a word, not just press a button", () => {
    expect(DELETE_CONFIRMATION_WORD).toBe("DELETE");
    expect(confirmsDeletion("")).toBe(false);
  });

  it("takes the word whatever its case and the spaces round it", () => {
    expect(confirmsDeletion("DELETE")).toBe(true);
    expect(confirmsDeletion("  delete ")).toBe(true);
  });

  it("takes nothing else", () => {
    for (const typed of ["delet", "deleted", "yes", "DELETE ME", "d e l e t e"]) expect(confirmsDeletion(typed), typed).toBe(false);
  });
});
