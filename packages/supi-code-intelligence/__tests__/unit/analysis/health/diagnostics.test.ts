import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { describe, expect, it, vi } from "vitest";
import { collectCodeActions } from "../../../../src/analysis/health/diagnostics.ts";

describe("collectCodeActions", () => {
  it("marks suggestions partial when the diagnostic-file safety cap is reached", async () => {
    const outstanding = Array.from({ length: 6 }, (_, index) => ({
      file: `src/file-${index}.ts`,
      diagnostics: [
        {
          severity: 1,
          range: {
            start: { line: index, character: 0 },
            end: { line: index, character: 1 },
          },
        },
      ],
    }));
    const codeActions = vi.fn().mockResolvedValue([{ title: "Fix issue", kind: "quickfix" }]);
    const runtime = {
      codeActions,
      getOutstandingDiagnostics: vi.fn().mockReturnValue(outstanding),
    } as unknown as WorkspaceLspRuntime;

    const result = await collectCodeActions(runtime, null, "/project");

    expect(codeActions).toHaveBeenCalledTimes(5);
    expect(result.items).toHaveLength(5);
    expect(result.evidence).toEqual({
      key: "health.codeActions",
      totalCount: null,
      shownCount: 5,
      omittedCount: null,
      partialReason: "safety-limit",
    });
  });

  it("discloses provider-limited suggestions when a code-action request fails", async () => {
    const runtime = {
      codeActions: vi.fn().mockRejectedValue(new Error("server unavailable")),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([
        {
          file: "src/file.ts",
          diagnostics: [
            {
              severity: 1,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ],
        },
      ]),
    } as unknown as WorkspaceLspRuntime;

    const result = await collectCodeActions(runtime, null, "/project");

    expect(result.items).toEqual([]);
    expect(result.evidence.partialReason).toBe("provider-limited");
  });
});
