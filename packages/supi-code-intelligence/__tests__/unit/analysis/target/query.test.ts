import { describe, expect, it } from "vitest";
import { normalizeQuery } from "../../../../src/analysis/target/query.ts";

describe("normalizeQuery", () => {
  it("returns anchored query when file + line + character are present", () => {
    const result = normalizeQuery({
      file: "src/index.ts",
      line: 42,
      character: 10,
    });
    expect(result.kind).toBe("anchored");
    if (result.kind === "anchored") {
      expect(result.file).toContain("index.ts");
      expect(result.line).toBe(42);
      expect(result.character).toBe(10);
    }
  });

  it("returns file query when file is present without coordinates", () => {
    const result = normalizeQuery({ file: "src/index.ts" });
    expect(result.kind).toBe("file");
    if (result.kind === "file") {
      expect(result.file).toContain("index.ts");
    }
  });

  it("returns symbol query when symbol is present without file", () => {
    const result = normalizeQuery({ symbol: "Widget" });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol") {
      expect(result.symbol).toBe("Widget");
    }
  });

  it("returns symbol query with path scope when symbol + path are present", () => {
    const result = normalizeQuery({ symbol: "Widget", path: "src/" });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol") {
      expect(result.symbol).toBe("Widget");
      expect(result.path).toBe("src/");
    }
  });

  it("returns symbol query with kind filter when provided", () => {
    const result = normalizeQuery({ symbol: "Widget", kind: "class" });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol") {
      expect(result.symbolKind).toBe("class");
    }
  });

  it("returns symbol query with exportedOnly when provided", () => {
    const result = normalizeQuery({ symbol: "Widget", exportedOnly: true });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol" && "exportedOnly" in result) {
      expect(result.exportedOnly).toBe(true);
    }
  });

  it("returns invalid query when neither file nor symbol is present", () => {
    const result = normalizeQuery({});
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.reason).toContain("file");
      expect(result.reason).toContain("symbol");
    }
  });

  it("returns anchored query when all three are present alongside other fields", () => {
    const result = normalizeQuery({
      file: "src/main.ts",
      line: 1,
      character: 1,
      path: "src/",
      symbol: "Widget",
    });
    expect(result.kind).toBe("anchored");
  });

  it("returns symbol query scoped to file when file + symbol are present without coordinates", () => {
    const result = normalizeQuery({
      file: "src/index.ts",
      symbol: "Widget",
    });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol") {
      expect(result.symbol).toBe("Widget");
      expect(result.path).toContain("index.ts");
    }
  });

  it("uses symbol path when file + symbol + path are all present without coordinates", () => {
    const result = normalizeQuery({
      file: "src/index.ts",
      symbol: "Widget",
      path: "src/components/",
    });
    expect(result.kind).toBe("symbol");
    if (result.kind === "symbol") {
      expect(result.symbol).toBe("Widget");
      // file overrides the explicit path as the scope
      expect(result.path).toContain("index.ts");
    }
  });
});
