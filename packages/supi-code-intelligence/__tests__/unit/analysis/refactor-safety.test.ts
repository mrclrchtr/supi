import { describe, expect, it } from "vitest";
import { validateEdit } from "../../../src/analysis/refactor/safety.ts";

/**
 * Refactor safety tests for the canonical analysis/refactor/safety.ts.
 */
describe("analysis refactor safety", () => {
  it("rejects empty edit set", () => {
    const result = validateEdit({ edits: [] });
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.reason).toContain("empty");
    }
  });

  it("accepts valid single edit", () => {
    const result = validateEdit({
      edits: [
        {
          file: "test.ts",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: "hello",
        },
      ],
    });
    expect(result.safe).toBe(true);
  });

  it("rejects negative line", () => {
    const result = validateEdit({
      edits: [
        {
          file: "test.ts",
          range: { start: { line: -1, character: 0 }, end: { line: 0, character: 5 } },
          newText: "hello",
        },
      ],
    });
    expect(result.safe).toBe(false);
  });

  it("rejects negative character", () => {
    const result = validateEdit({
      edits: [
        {
          file: "test.ts",
          range: { start: { line: 0, character: -1 }, end: { line: 0, character: 5 } },
          newText: "hello",
        },
      ],
    });
    expect(result.safe).toBe(false);
  });

  it("rejects end before start", () => {
    const result = validateEdit({
      edits: [
        {
          file: "test.ts",
          range: { start: { line: 5, character: 0 }, end: { line: 3, character: 0 } },
          newText: "hello",
        },
      ],
    });
    expect(result.safe).toBe(false);
  });

  it("validates multiple edits", () => {
    const result = validateEdit({
      edits: [
        {
          file: "a.ts",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          newText: "x",
        },
        {
          file: "b.ts",
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } },
          newText: "y",
        },
      ],
    });
    expect(result.safe).toBe(true);
  });
});
