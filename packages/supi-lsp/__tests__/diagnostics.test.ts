import { describe, expect, it } from "vitest";
import {
  filterBySeverity,
  formatDiagnostic,
  formatDiagnostics,
  severityLabel,
} from "../diagnostics.ts";
import type { Diagnostic } from "../types.ts";

function makeDiag(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    message: "test error",
    severity: 1,
    ...overrides,
  };
}

describe("severityLabel", () => {
  it.each([
    [1, "error"],
    [2, "warning"],
    [3, "info"],
    [4, "hint"],
    [undefined, "unknown"],
    [99, "unknown"],
  ])("maps severity %s to %s", (sev, label) => {
    expect(severityLabel(sev)).toBe(label);
  });
});

describe("formatDiagnostic", () => {
  it("formats error with source and code", () => {
    const diag = makeDiag({ source: "ts", code: 2345, message: "Type mismatch" });
    const result = formatDiagnostic(diag);
    expect(result).toContain("❌");
    expect(result).toContain("error");
    expect(result).toContain("[ts]");
    expect(result).toContain("(2345)");
    expect(result).toContain("(1:1)");
    expect(result).toContain("Type mismatch");
  });

  it("formats warning without source", () => {
    const diag = makeDiag({ severity: 2, message: "Unused variable" });
    const result = formatDiagnostic(diag);
    expect(result).toContain("⚠️");
    expect(result).toContain("warning");
    expect(result).toContain("Unused variable");
    expect(result).not.toContain("[");
  });

  it("uses 1-based line numbers", () => {
    const diag = makeDiag({
      range: { start: { line: 9, character: 4 }, end: { line: 9, character: 10 } },
    });
    const result = formatDiagnostic(diag);
    expect(result).toContain("(10:5)");
  });
});

describe("formatDiagnostics", () => {
  it("returns no-diagnostics message for empty array", () => {
    expect(formatDiagnostics("file.ts", [])).toBe("No diagnostics.");
  });

  it("includes file path and all diagnostics", () => {
    const diags = [
      makeDiag({ message: "Error 1" }),
      makeDiag({ severity: 2, message: "Warning 1" }),
    ];
    const result = formatDiagnostics("/project/src/file.ts", diags);
    expect(result).toContain("file.ts");
    expect(result).toContain("Error 1");
    expect(result).toContain("Warning 1");
  });
});

describe("filterBySeverity", () => {
  const diags = [
    makeDiag({ severity: 1, message: "error" }),
    makeDiag({ severity: 2, message: "warning" }),
    makeDiag({ severity: 3, message: "info" }),
    makeDiag({ severity: 4, message: "hint" }),
  ];

  it("filters errors only (severity 1)", () => {
    const result = filterBySeverity(diags, 1);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("error");
  });

  it("filters errors + warnings (severity 2)", () => {
    const result = filterBySeverity(diags, 2);
    expect(result).toHaveLength(2);
  });

  it("includes all with severity 4", () => {
    const result = filterBySeverity(diags, 4);
    expect(result).toHaveLength(4);
  });

  it("excludes diagnostics without severity", () => {
    const withUndefined = [makeDiag({ severity: undefined })];
    expect(filterBySeverity(withUndefined, 4)).toHaveLength(0);
  });
});
