import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizePrioritySignalsForFiles } from "../src/prioritization-signals.ts";

const mockLspFns = vi.hoisted(() => ({
  getSessionLspService: vi.fn<(cwd: string) => unknown>(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: mockLspFns.getSessionLspService,
  };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-priority-signals-"));
  mockLspFns.getSessionLspService.mockReturnValue({
    kind: "unavailable",
    reason: "No LSP in test env",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("prioritization signals", () => {
  it("summarizes low coverage and knip signals for relevant files", () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    mkdirSync(path.join(tmpDir, "coverage"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src", "payment.ts"), "export const paymentLoader = 1;\n");
    writeFileSync(path.join(tmpDir, "src", "unused.ts"), "export const oldThing = 1;\n");
    writeFileSync(
      path.join(tmpDir, "coverage", "coverage-summary.json"),
      JSON.stringify(
        {
          total: { lines: { pct: 90 }, statements: { pct: 90 } },
          "src/payment.ts": { lines: { pct: 10 }, statements: { pct: 15 } },
          "src/unused.ts": { lines: { pct: 100 }, statements: { pct: 100 } },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(tmpDir, "knip.json"),
      JSON.stringify(
        {
          files: ["src/unused.ts"],
          exports: [{ file: "src/payment.ts", name: "paymentLoader" }],
        },
        null,
        2,
      ),
    );

    const summary = summarizePrioritySignalsForFiles(tmpDir, [
      path.join(tmpDir, "src", "payment.ts"),
      path.join(tmpDir, "src", "unused.ts"),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.lowCoverageCount).toBe(1);
    expect(summary?.unusedCount).toBe(2);
    expect(summary?.warnings.join("\n")).toContain("Low coverage");
    expect(summary?.warnings.join("\n")).toContain("Unused file");
    expect(summary?.warnings.join("\n")).toContain("Unused export");
  });

  it("maps diagnostic summaries from a ready LSP session", () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src", "payment.ts"), "export const paymentLoader = 1;\n");

    mockLspFns.getSessionLspService.mockReturnValue({
      kind: "ready",
      service: {
        getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([
          {
            file: "src/payment.ts",
            total: 2,
            errors: 1,
            warnings: 1,
            information: 0,
            hints: 0,
          },
        ]),
      },
    });

    const summary = summarizePrioritySignalsForFiles(tmpDir, [
      path.join(tmpDir, "src", "payment.ts"),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.diagnosticsCount).toBe(2);
    expect(summary?.warnings.join("\n")).toContain("Diagnostics:");
    expect(summary?.warnings.join("\n")).toContain("1 errors");
    expect(summary?.warnings.join("\n")).toContain("1 warnings");
  });
});
