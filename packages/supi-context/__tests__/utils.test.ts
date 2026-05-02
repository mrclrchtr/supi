import { describe, expect, it } from "vitest";
import { formatTokens, pluralize } from "../utils.ts";

describe("formatTokens", () => {
  it("formats values under 1k as-is", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats values in thousands with one decimal", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(45231)).toBe("45.2k");
    expect(formatTokens(999499)).toBe("999.5k");
  });

  it("formats values in millions with one decimal", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("pluralize", () => {
  it("returns singular for count of 1", () => {
    expect(pluralize(1, "turn", "turns")).toBe("1 turn");
  });

  it("returns plural for counts other than 1", () => {
    expect(pluralize(0, "turn", "turns")).toBe("0 turns");
    expect(pluralize(2, "turn", "turns")).toBe("2 turns");
  });
});
