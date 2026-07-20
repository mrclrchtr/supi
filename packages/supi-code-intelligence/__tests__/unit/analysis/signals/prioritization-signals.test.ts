import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizePrioritySignalsForFiles } from "../../../../src/analysis/signals/project.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-priority-signals-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("prioritization signals", () => {
  it("ignores ambient coverage and unused-code reports", () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    mkdirSync(path.join(tmpDir, "coverage"), { recursive: true });
    const paymentFile = path.join(tmpDir, "src", "payment.ts");
    writeFileSync(paymentFile, "export const paymentLoader = 1;\n");
    writeFileSync(
      path.join(tmpDir, "coverage", "coverage-summary.json"),
      JSON.stringify({
        "src/payment.ts": { lines: { pct: 10 }, statements: { pct: 15 } },
      }),
    );
    writeFileSync(
      path.join(tmpDir, "knip.json"),
      JSON.stringify({
        files: ["src/payment.ts"],
        exports: [{ file: "src/payment.ts", name: "paymentLoader" }],
      }),
    );

    const summary = summarizePrioritySignalsForFiles(tmpDir, [paymentFile], {
      kind: "unavailable",
      reason: "No LSP in test env",
    });

    expect(summary).toBeNull();
  });

  it("maps diagnostic summaries from a ready LSP session", () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src", "payment.ts"), "export const paymentLoader = 1;\n");

    const lspRuntime = {
      kind: "ready" as const,
      runtime: {
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
    };

    const summary = summarizePrioritySignalsForFiles(
      tmpDir,
      [path.join(tmpDir, "src", "payment.ts")],
      lspRuntime as unknown as WorkspaceLspRuntimeState,
    );

    expect(summary).not.toBeNull();
    expect(summary?.diagnosticsCount).toBe(2);
    expect(summary?.warnings.join("\n")).toContain("Diagnostics:");
    expect(summary?.warnings.join("\n")).toContain("1 errors");
    expect(summary?.warnings.join("\n")).toContain("1 warnings");
  });
});
