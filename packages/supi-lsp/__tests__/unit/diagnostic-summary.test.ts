import { describe, expect, it } from "vitest";
import {
  accumulateOutstandingDiagnostics,
  collectDiagnosticSummaryCounts,
  createOutstandingDiagnosticSummary,
  relativeFilePathFromUri,
} from "../../src/diagnostics/diagnostic-summary.ts";

describe("relativeFilePathFromUri", () => {
  it("decodes percent-encoded paths before relativizing", () => {
    expect(relativeFilePathFromUri("file:///project/src/my%20file.ts", "/project")).toBe(
      "src/my file.ts",
    );
  });

  it("preserves absolute paths for tracked out-of-tree files", () => {
    expect(relativeFilePathFromUri("file:///other/project/file.ts", "/project")).toBe(
      "/other/project/file.ts",
    );
  });
});

describe("diagnostic severity defaults", () => {
  const diagnostic = {
    message: "unspecified severity",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };

  it("counts an omitted severity as Error", () => {
    const counts = new Map<string, { errors: number; warnings: number }>();

    collectDiagnosticSummaryCounts(
      counts,
      { uri: "file:///project/src/app.ts", diagnostics: [diagnostic] },
      "/project",
      () => true,
    );

    expect(counts.get("src/app.ts")).toEqual({ errors: 1, warnings: 0 });
  });

  it("includes an omitted severity in the default outstanding threshold", () => {
    expect(
      accumulateOutstandingDiagnostics(
        createOutstandingDiagnosticSummary("src/app.ts"),
        [diagnostic],
        1,
      ),
    ).toMatchObject({ total: 1, errors: 1 });
  });
});
