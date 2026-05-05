import { describe, expect, it } from "vitest";
import {
  isStaleSuppressionDiagnostic,
  splitSuppressionDiagnostics,
} from "../src/diagnostics/suppression-diagnostics.ts";
import type { Diagnostic } from "../src/types.ts";

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 2,
    message: "some warning",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    ...overrides,
  };
}

describe("stale suppression diagnostics", () => {
  it("detects biome unused suppression diagnostics", () => {
    expect(
      isStaleSuppressionDiagnostic(
        makeDiagnostic({
          source: "biome",
          message:
            "Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.",
        }),
      ),
    ).toBe(true);
  });

  it("detects unused @ts-expect-error diagnostics", () => {
    expect(
      isStaleSuppressionDiagnostic(
        makeDiagnostic({
          source: "ts",
          message: "Unused '@ts-expect-error' directive.",
        }),
      ),
    ).toBe(true);
  });

  it("does not flag regular diagnostics", () => {
    expect(
      isStaleSuppressionDiagnostic(
        makeDiagnostic({
          source: "ts",
          severity: 1,
          message: "Type 'number' is not assignable to type 'string'.",
        }),
      ),
    ).toBe(false);
  });

  it("keeps stale suppression warnings even when regular severity is error-only", () => {
    const diagnostics = [
      makeDiagnostic({
        source: "ts",
        severity: 1,
        message: "Type 'number' is not assignable to type 'string'.",
      }),
      makeDiagnostic({
        source: "biome",
        severity: 2,
        message:
          "Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.",
      }),
      makeDiagnostic({
        source: "ts",
        severity: 2,
        message: "Unused variable 'x'.",
      }),
    ];

    expect(splitSuppressionDiagnostics(diagnostics, 1)).toEqual({
      regular: [diagnostics[0]],
      suppressions: [diagnostics[1]],
    });
  });
});
