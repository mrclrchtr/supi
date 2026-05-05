import { describe, expect, it } from "vitest";
import { findCascadeDiagnosticEntries } from "../src/manager/manager-diagnostics.ts";
import type { Diagnostic, DiagnosticSeverity } from "../src/types.ts";

function makeDiagnostic(severity: DiagnosticSeverity, message: string): Diagnostic {
  return {
    severity,
    message,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
  };
}

describe("findCascadeDiagnosticEntries", () => {
  it("returns files with newer timestamps than the pre-sync snapshot", () => {
    const before = new Map([
      ["file:///project/a.ts", { receivedAt: 100, diagnostics: [makeDiagnostic(1, "a")] }],
      ["file:///project/b.ts", { receivedAt: 100, diagnostics: [] }],
    ]);

    const after = new Map([
      ["file:///project/a.ts", { receivedAt: 100, diagnostics: [makeDiagnostic(1, "a")] }],
      ["file:///project/b.ts", { receivedAt: 200, diagnostics: [makeDiagnostic(2, "b")] }],
      ["file:///project/c.ts", { receivedAt: 150, diagnostics: [makeDiagnostic(1, "c")] }],
    ]);

    expect(findCascadeDiagnosticEntries(before, after, "file:///project/a.ts", 2)).toEqual([
      {
        uri: "file:///project/b.ts",
        diagnostics: [makeDiagnostic(2, "b")],
      },
      {
        uri: "file:///project/c.ts",
        diagnostics: [makeDiagnostic(1, "c")],
      },
    ]);
  });

  it("excludes the edited file from cascade results", () => {
    const before = new Map<string, { receivedAt: number; diagnostics: Diagnostic[] }>();
    const after = new Map([
      ["file:///project/a.ts", { receivedAt: 150, diagnostics: [makeDiagnostic(1, "a")] }],
      ["file:///project/b.ts", { receivedAt: 150, diagnostics: [makeDiagnostic(2, "b")] }],
    ]);

    const result = findCascadeDiagnosticEntries(before, after, "file:///project/a.ts", 2);
    expect(result.every((entry: { uri: string }) => entry.uri !== "file:///project/a.ts")).toBe(
      true,
    );
  });

  it("filters cascade diagnostics by severity threshold", () => {
    const before = new Map<string, { receivedAt: number; diagnostics: Diagnostic[] }>();
    const after = new Map([
      [
        "file:///project/b.ts",
        {
          receivedAt: 200,
          diagnostics: [makeDiagnostic(3, "info"), makeDiagnostic(1, "error")],
        },
      ],
    ]);

    expect(findCascadeDiagnosticEntries(before, after, "file:///project/a.ts", 1)).toEqual([
      {
        uri: "file:///project/b.ts",
        diagnostics: [makeDiagnostic(1, "error")],
      },
    ]);
  });

  it("returns no entries when timestamps are unchanged", () => {
    const before = new Map([
      ["file:///project/b.ts", { receivedAt: 100, diagnostics: [makeDiagnostic(2, "b")] }],
    ]);
    const after = new Map([
      ["file:///project/b.ts", { receivedAt: 100, diagnostics: [makeDiagnostic(2, "b")] }],
    ]);

    expect(findCascadeDiagnosticEntries(before, after, "file:///project/a.ts", 2)).toEqual([]);
  });
});
