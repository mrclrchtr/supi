import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePatchText, validatePatchBundle } from "../../src/patch-bundle.ts";
import { validateSkillMirror } from "../../src/skill-mirror.ts";

const root = join(import.meta.dirname, "../../../..");

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

  it("keeps SuPi-owned skill licenses separate from upstream licenses", () => {
    const skill = join(root, "skills/engineering/commit");

    expect(readFileSync(join(skill, "LICENSE.mrclrchtr"), "utf8")).toContain(
      "Copyright (c) 2026 Marcel Richter",
    );
    expect(existsSync(join(skill, "LICENSE.mattpocock"))).toBe(false);
  });

  it("uses Ask User for grilling rounds", () => {
    const skill = readFileSync(join(root, "skills/productivity/grilling/SKILL.md"), "utf8");

    expect(skill).toContain("Use `ask_user` for each round");
    expect(skill).toContain("- `title`:");
    expect(skill).toContain("- `questions`:");
    expect(skill).toContain("- `id`: Use the question number, such as `Q1`");
    expect(skill).toContain("- `header`: Start with the question number and add a title");
    expect(skill).toContain("- `details`:");
    expect(skill).toContain("It can also contain a sketch");
    expect(skill).toContain("- `recommendation`:");
    expect(skill).toContain("dispatch a sub-agent");
    expect(skill).not.toContain("If `ask_user` is unavailable");
    expect(skill).not.toContain("❓");
  });
});
