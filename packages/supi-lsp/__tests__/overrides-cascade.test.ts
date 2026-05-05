import { describe, expect, it } from "vitest";
import { buildInlineDiagnosticsMessage } from "../src/overrides.ts";
import type { Diagnostic } from "../src/types.ts";

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 1,
    message: "some error",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    ...overrides,
  };
}

describe("buildInlineDiagnosticsMessage", () => {
  it("formats primary and cascade diagnostics", () => {
    const text = buildInlineDiagnosticsMessage(
      [
        {
          file: "/project/src/edited.ts",
          diagnostics: [makeDiagnostic({ source: "ts", message: "edited error" })],
        },
        {
          file: "/project/src/importer.ts",
          diagnostics: [makeDiagnostic({ source: "ts", message: "importer error" })],
        },
      ],
      "/project",
    );

    expect(text).toContain("⚠️ LSP Diagnostics — review before continuing:");
    expect(text).toContain("**src/edited.ts**:");
    expect(text).toContain("edited error");
    expect(text).toContain("**src/importer.ts**:");
    expect(text).toContain("importer error");
  });

  it("separates stale suppression cleanup from regular diagnostics", () => {
    const text = buildInlineDiagnosticsMessage(
      [
        {
          file: "/project/src/edited.ts",
          diagnostics: [
            makeDiagnostic({ source: "ts", message: "real error" }),
            makeDiagnostic({
              severity: 2,
              source: "biome",
              message:
                "Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.",
            }),
          ],
        },
      ],
      "/project",
    );

    expect(text).toContain("real error");
    expect(text).toContain("🗑️ Stale suppressions — cleanup available:");
    expect(text).toContain("Suppression comment has no effect");
  });
});
