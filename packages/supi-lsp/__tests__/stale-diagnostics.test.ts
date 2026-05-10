import { describe, expect, it } from "vitest";
import { assessStaleDiagnostics } from "../src/diagnostics/stale-diagnostics.ts";
import type { Diagnostic, DiagnosticSeverity } from "../src/types.ts";

function makeDiagnostic(severity: DiagnosticSeverity, message: string): Diagnostic {
  return {
    severity,
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

describe("assessStaleDiagnostics", () => {
  it("flags clustered missing-module diagnostics as likely stale", () => {
    const assessment = assessStaleDiagnostics([
      {
        file: "src/a.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module '@supabase/ssr'")],
      },
      {
        file: "src/b.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module '@tanstack/react-query'")],
      },
      {
        file: "src/c.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module 'vitest'")],
      },
    ]);

    expect(assessment.suspected).toBe(true);
    expect(assessment.matchedFiles).toHaveLength(3);
    expect(assessment.warning).toContain("stale");
    expect(assessment.warning).toContain("3 files");
  });

  it("does not flag a small cluster of missing-module diagnostics", () => {
    const assessment = assessStaleDiagnostics([
      {
        file: "src/a.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module '@supabase/ssr'")],
      },
      {
        file: "src/b.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module '@tanstack/react-query'")],
      },
    ]);

    expect(assessment.suspected).toBe(false);
    expect(assessment.warning).toBeNull();
  });

  it("ignores ordinary syntax and type diagnostics", () => {
    const assessment = assessStaleDiagnostics([
      {
        file: "src/a.ts",
        diagnostics: [makeDiagnostic(1, "Type 'string' is not assignable to type 'number'")],
      },
      {
        file: "src/b.ts",
        diagnostics: [makeDiagnostic(1, "Property 'map' does not exist on type '{}'")],
      },
      {
        file: "src/c.ts",
        diagnostics: [makeDiagnostic(2, "Unused variable 'x'")],
      },
    ]);

    expect(assessment.suspected).toBe(false);
    expect(assessment.matchedFiles).toHaveLength(0);
  });
});
