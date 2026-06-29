import { describe, expect, it } from "vitest";
import { normalizeSuggestion } from "../../src/generation/normalize.ts";

describe("normalizeSuggestion", () => {
  it("trims whitespace", () => {
    expect(normalizeSuggestion("  hello  ")).toBe("hello");
  });

  it("strips matching double quotes", () => {
    expect(normalizeSuggestion('"hello world"')).toBe("hello world");
  });

  it("strips matching single quotes", () => {
    expect(normalizeSuggestion("'hello world'")).toBe("hello world");
  });

  it("does not strip unbalanced quotes", () => {
    expect(normalizeSuggestion('"hello')).toBe('"hello');
  });

  it("collapses internal newlines to spaces", () => {
    expect(normalizeSuggestion("hello\nworld")).toBe("hello world");
  });

  it("collapses multiple whitespace runs", () => {
    expect(normalizeSuggestion("hello   \t\n  world")).toBe("hello world");
  });

  it("rejects empty strings", () => {
    expect(normalizeSuggestion("")).toBeNull();
  });

  it("rejects whitespace-only strings", () => {
    expect(normalizeSuggestion("   \n  ")).toBeNull();
  });

  it("truncates strings over 240 characters", () => {
    const result = normalizeSuggestion("a".repeat(241));
    expect(result).toBe("a".repeat(240));
  });

  it("accepts strings at exactly 240 characters", () => {
    const max = "a".repeat(240);
    expect(normalizeSuggestion(max)).toBe(max);
  });

  it("accepts mixed case with special chars", () => {
    expect(normalizeSuggestion("Fix the /bug in createUser")).toBe("Fix the /bug in createUser");
  });

  // ── NO_SUGGESTION sentinel ───────────────────────────────

  it("rejects exact NO_SUGGESTION", () => {
    expect(normalizeSuggestion("NO_SUGGESTION")).toBeNull();
  });

  it("rejects lowercase no_suggestion", () => {
    expect(normalizeSuggestion("no_suggestion")).toBeNull();
  });

  it("rejects NO_SUGGESTION with trailing punctuation", () => {
    expect(normalizeSuggestion("NO_SUGGESTION.")).toBeNull();
  });

  it("rejects quoted NO_SUGGESTION", () => {
    expect(normalizeSuggestion('"NO_SUGGESTION"')).toBeNull();
  });

  it("rejects NO SUGGESTION with space", () => {
    expect(normalizeSuggestion("NO SUGGESTION")).toBeNull();
  });

  it("rejects no suggestion with mixed case", () => {
    expect(normalizeSuggestion("No suggestion")).toBeNull();
  });
});
