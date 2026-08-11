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

  it("retains the SuPi compatibility adaptations", () => {
    expect(readFileSync(join(root, "skills/code-review/SKILL.md"), "utf8")).toContain(
      "supi_review_run",
    );
    expect(readFileSync(join(root, "skills/research/SKILL.md"), "utf8")).toContain(
      "current session",
    );
    expect(readFileSync(join(root, "skills/grilling/SKILL.md"), "utf8")).toContain("ask_user");
  });
});
