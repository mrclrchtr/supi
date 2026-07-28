import { describe, expect, it } from "vitest";
import {
  assertFullDiffCharacters,
  joinDiffParts,
  MAX_FULL_DIFF_CHARACTERS,
} from "../../src/target/diff.ts";

describe("target diff assembly", () => {
  it("joins non-empty patch parts with canonical trailing newlines", () => {
    expect(joinDiffParts(["first", "", "second\n"])).toBe("first\nsecond\n");
  });

  it("rejects oversized aggregate full-diff materialization", () => {
    expect(() => assertFullDiffCharacters(MAX_FULL_DIFF_CHARACTERS + 1)).toThrow(
      /read changed paths individually/,
    );
  });
});
