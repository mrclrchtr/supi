import { describe, expect, it } from "vitest";
import {
  normalizeSuggestion,
  normalizeSuggestionDetailed,
} from "../../src/generation/normalize.ts";

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

  it("does not truncate ordinary long strings", () => {
    const text = "a".repeat(241);
    expect(normalizeSuggestion(text)).toBe(text);
  });

  it("safety-caps runaway output at 2,000 graphemes", () => {
    const result = normalizeSuggestionDetailed("😀".repeat(2001));
    expect(result).toEqual({
      text: "😀".repeat(2000),
      wasSafetyCapped: true,
      originalGraphemeCount: 2001,
      graphemeCount: 2000,
    });
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
