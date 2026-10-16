import { describe, expect, it } from "vitest";
import { previewGuard, previewUsesProduction } from "./previewGuard";

const production = "https://prod-ref.supabase.co";
const preview = (supabaseUrl: string | undefined, ...productionUrl: [string | undefined] | []) => ({
  deployEnv: "preview",
  supabaseUrl,
  productionUrl: productionUrl.length === 0 ? production : productionUrl[0],
});

describe("previewGuard (#107)", () => {
  it("refuses a preview handed production's URL", () => {
    expect(previewGuard(preview(production))).toBe("refused");
  });

  it("compares hosts: case, a trailing slash, surrounding space and a path do not hide production", () => {
    expect(previewGuard(preview("https://PROD-REF.supabase.co"))).toBe("refused");
    expect(previewGuard(preview("https://prod-ref.supabase.co/"))).toBe("refused");
    expect(previewGuard(preview("  https://prod-ref.supabase.co  "))).toBe("refused");
    expect(previewGuard(preview("https://prod-ref.supabase.co/rest/v1"))).toBe("refused");
    expect(previewGuard(preview(production, "https://Prod-Ref.supabase.co/"))).toBe("refused");
  });

  it("allows a preview its own branch", () => {
    expect(previewGuard(preview("https://branch-ref.supabase.co"))).toBe("allowed");
  });

  it("says the guard is unset when a preview has no production URL to compare with", () => {
    expect(previewGuard(preview(production, undefined))).toBe("unset");
    expect(previewGuard(preview(production, ""))).toBe("unset");
    expect(previewGuard(preview(production, "   "))).toBe("unset");
  });

  it("does not apply outside a preview: production, development, no Vercel at all", () => {
    for (const deployEnv of ["production", "development", "", undefined]) {
      expect(previewGuard({ deployEnv, supabaseUrl: production, productionUrl: production })).toBe("not-preview");
    }
  });

  it("reads the deploy environment trimmed and in any case", () => {
    expect(previewGuard({ deployEnv: " Preview ", supabaseUrl: production, productionUrl: production })).toBe("refused");
  });

  it("previewUsesProduction is true only when refused", () => {
    expect(previewUsesProduction(preview(production))).toBe(true);
    expect(previewUsesProduction(preview(production, undefined))).toBe(false);
    expect(previewUsesProduction(preview("https://branch-ref.supabase.co"))).toBe(false);
  });
});
