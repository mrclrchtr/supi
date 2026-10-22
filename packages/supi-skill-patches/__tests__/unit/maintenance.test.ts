import { describe, expect, it } from "vitest";
import { normalizePatchText, validatePatchBundle } from "../../src/patch-bundle.ts";
import { validateSkillMirror } from "../../src/skill-mirror.ts";

describe("skill patch maintenance", () => {
  it("normalizes patch text to match the repo whitespace hook", () => {
    expect(
      normalizePatchText("diff --git a/f b/f\nindex 1..2 100644\n@@ -1 +1 @@\n-a \n+a\n \n"),
    ).toBe("diff --git a/f b/f\nindex 1..2 100644\n@@ -1 +1 @@\n-a\n+a\n\n");
    // Stable across repeated calls: composing regenerates identical bytes.
    expect(normalizePatchText(normalizePatchText(" a \nb \n"))).toBe(
      normalizePatchText(" a \nb \n"),
    );
  });
  it("keeps the combined pnpm patch equal to its per-file fragments", () => {
    expect(validatePatchBundle()).toEqual([]);
  });

  it("keeps root skills synchronized with the patched dependency", () => {
    expect(validateSkillMirror()).toEqual([]);
  });
});
