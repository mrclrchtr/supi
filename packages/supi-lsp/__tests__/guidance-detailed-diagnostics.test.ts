import { describe, expect, it } from "vitest";
import { formatDiagnosticsContext } from "../guidance.ts";

describe("formatDiagnosticsContext detailed diagnostics", () => {
  it("includes diagnostic messages when detailed diagnostics are provided and total is small", () => {
    const content = formatDiagnosticsContext(
      [
        {
          file: "src/app.ts",
          total: 2,
          errors: 1,
          warnings: 1,
          information: 0,
          hints: 0,
        },
      ],
      3,
      [
        {
          file: "src/app.ts",
          diagnostics: [
            {
              severity: 1,
              message: "Cannot find module 'typebox'",
              range: { start: { line: 4, character: 21 }, end: { line: 4, character: 30 } },
              source: "ts",
            },
            {
              severity: 2,
              message: "Unused variable 'x'",
              range: { start: { line: 10, character: 5 }, end: { line: 10, character: 6 } },
            },
          ],
        },
      ],
    );

    expect(content).toContain('<extension-context source="supi-lsp">');
    expect(content).toContain("src/app.ts: 1 error, 1 warning");
    expect(content).toContain("L5 C22 ts: Cannot find module 'typebox'");
    expect(content).toContain("L11 C6: Unused variable 'x'");
    expect(content).toContain("</extension-context>");
  });

  it("omits diagnostic messages when total exceeds threshold", () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      file: `src/file${i}.ts`,
      total: 1,
      errors: 1,
      warnings: 0,
      information: 0,
      hints: 0,
    }));

    const content = formatDiagnosticsContext(entries, 3, [
      {
        file: "src/file0.ts",
        diagnostics: [
          {
            severity: 1,
            message: "some error",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          },
        ],
      },
    ]);

    expect(content).toContain("src/file0.ts: 1 error");
    expect(content).not.toContain("L1 C1");
    expect(content).not.toContain("some error");
  });

  it("truncates detail lines per file to max 3", () => {
    const diags = Array.from({ length: 5 }, (_, i) => ({
      severity: 1 as const,
      message: `error ${i}`,
      range: { start: { line: i, character: 0 }, end: { line: i, character: 1 } },
    }));

    const content = formatDiagnosticsContext(
      [{ file: "src/big.ts", total: 5, errors: 5, warnings: 0, information: 0, hints: 0 }],
      3,
      [{ file: "src/big.ts", diagnostics: diags }],
    );

    expect(content).toContain("L1 C1: error 0");
    expect(content).toContain("L3 C1: error 2");
    expect(content).toContain("+2 more");
    expect(content).not.toContain("error 3");
  });

  it("omits details when detailed array is empty", () => {
    const content = formatDiagnosticsContext(
      [{ file: "src/app.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 }],
      3,
      [],
    );

    expect(content).toContain("src/app.ts: 1 error");
    expect(content).not.toContain("L");
  });
});
