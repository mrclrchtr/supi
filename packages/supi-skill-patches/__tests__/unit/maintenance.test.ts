import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePatchBundle } from "../../src/patch-bundle.ts";
import { validateSkillMirror } from "../../src/skill-mirror.ts";

const root = join(import.meta.dirname, "../../../..");

describe("skill patch maintenance", () => {
  it("keeps the combined pnpm patch equal to its per-file fragments", () => {
    expect(validatePatchBundle()).toEqual([]);
  });

  it("keeps root skills synchronized with the patched dependency", () => {
    expect(validateSkillMirror()).toEqual([]);
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
