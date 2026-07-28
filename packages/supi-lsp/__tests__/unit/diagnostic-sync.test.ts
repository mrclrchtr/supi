import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic } from "../../src/config/types.ts";
import { syncClientFileAndGetDiagnostics } from "../../src/manager/manager-diagnostics.ts";

const range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

describe("syncClientFileAndGetDiagnostics", () => {
  it("returns only requested severities without resetting pull state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "supi-lsp-diagnostics-"));
    const file = join(directory, "broken.ts");
    const content = "const broken: string = 1;\n";
    writeFileSync(file, content);

    const diagnostics = [
      { message: "error", range, severity: 1 },
      { message: "warning", range, severity: 2 },
      { message: "unknown", range },
    ] as Diagnostic[];
    const syncAndWaitForDiagnostics = vi.fn().mockResolvedValue(diagnostics);
    const clearPullResultIds = vi.fn();
    const client = {
      syncAndWaitForDiagnostics,
      clearPullResultIds,
    } as unknown as LspClient;

    try {
      await expect(syncClientFileAndGetDiagnostics(client, file, 1)).resolves.toEqual([
        diagnostics[0],
      ]);
      expect(syncAndWaitForDiagnostics).toHaveBeenCalledWith(file, content);
      expect(clearPullResultIds).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
