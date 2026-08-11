import { describe, expect, it } from "vitest";
import { validatePatchBundle } from "../../src/patch-bundle.ts";
import { validateSkillMirror } from "../../src/skill-mirror.ts";

describe("skill patch maintenance", () => {
  it("accepts an upstream dependency with no active patches", () => {
    expect(validatePatchBundle()).toEqual([]);
  });

  it("keeps root skills synchronized with the pinned dependency", () => {
    expect(validateSkillMirror()).toEqual([]);
  });
});
