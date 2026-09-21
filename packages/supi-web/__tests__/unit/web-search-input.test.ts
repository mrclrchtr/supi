import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { buildBxContextArgs } from "../../src/tool/web_search/bx.ts";
import {
  isValidFreshness,
  validateWebSearchInput,
  webSearchParameters,
} from "../../src/tool/web_search/input.ts";

describe("web_search input", () => {
  it("accepts the documented freshness codes and real ordered dates", () => {
    for (const value of ["pd", "pw", "pm", "py"]) {
      expect(isValidFreshness(value)).toBe(true);
    }
    expect(isValidFreshness("2024-02-29to2024-03-01")).toBe(true);
    expect(isValidFreshness("2024-03-01to2024-03-01")).toBe(true);
  });

  it("rejects invalid, impossible, and reversed date ranges", () => {
    for (const value of [
      "2023-02-29to2023-03-01",
      "2024-04-31to2024-05-01",
      "2024-03-02to2024-03-01",
      "2024-01-01-2024-01-02",
      "pw ",
    ]) {
      expect(isValidFreshness(value)).toBe(false);
    }
  });

  it("requires a non-empty query and preserves a leading hyphen", () => {
    expect(validateWebSearchInput({ query: "  -dash query  " })).toEqual({
      query: "-dash query",
    });
    expect(() => validateWebSearchInput({ query: "   " })).toThrow("query");
    expect(() => validateWebSearchInput({ query: "query", freshness: "tomorrow" })).toThrow(
      "freshness",
    );
  });

  it("exposes only query and optional freshness in the provider schema", () => {
    expect(Value.Check(webSearchParameters, { query: "query", freshness: "pw" })).toBe(true);
    expect(Value.Check(webSearchParameters, { query: "query", timeout: 10 })).toBe(false);
    expect(Value.Check(webSearchParameters, { freshness: "pw" })).toBe(false);
    expect(Value.Check(webSearchParameters, { query: "" })).toBe(false);

    const schema = webSearchParameters as {
      properties?: { freshness?: { description?: string } };
    };
    expect(schema.properties?.freshness?.description).toContain("pd (24 hours)");
    expect(schema.properties?.freshness?.description).toContain("pw (7 days)");
    expect(schema.properties?.freshness?.description).toContain("pm (31 days)");
    expect(schema.properties?.freshness?.description).toContain("py (365 days)");
    expect(schema.properties?.freshness?.description).toContain("publication or modification date");
  });

  it("places the query after the argument terminator", () => {
    expect(buildBxContextArgs("-query", undefined)).toEqual(["context", "--", "-query"]);
    expect(buildBxContextArgs("query", "2024-01-01to2024-01-31")).toEqual([
      "context",
      "--extra",
      "freshness=2024-01-01to2024-01-31",
      "--",
      "query",
    ]);
  });
});
