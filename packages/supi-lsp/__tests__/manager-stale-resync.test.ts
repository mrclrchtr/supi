import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../src/manager/manager.ts";
import { forceResyncStaleModuleFiles } from "../src/manager/manager-stale-resync.ts";
import type { Diagnostic, DiagnosticSeverity } from "../src/types.ts";

function makeDiagnostic(severity: DiagnosticSeverity, message: string, code?: number): Diagnostic {
  return {
    severity,
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    ...(code !== undefined ? { code } : {}),
  };
}

function createMockManager(): {
  manager: LspManager;
  closeFile: ReturnType<typeof vi.fn>;
  ensureFileOpen: ReturnType<typeof vi.fn>;
  refreshOpenDiagnostics: ReturnType<typeof vi.fn>;
} {
  const closeFile = vi.fn();
  const ensureFileOpen = vi.fn().mockResolvedValue(null);
  const refreshOpenDiagnostics = vi.fn().mockResolvedValue(undefined);
  let outstanding: Array<{ file: string; diagnostics: Diagnostic[] }> = [];

  const manager = {
    getOutstandingDiagnostics(_maxSeverity: number) {
      return outstanding;
    },
    setOutstanding(diags: Array<{ file: string; diagnostics: Diagnostic[] }>) {
      outstanding = diags;
    },
    closeFile,
    ensureFileOpen,
    refreshOpenDiagnostics,
  } as unknown as LspManager & {
    setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
  };

  return {
    manager,
    closeFile,
    ensureFileOpen,
    refreshOpenDiagnostics,
  };
}

// biome-ignore lint/security/noSecrets: function name is not a secret, high entropy is coincidental
describe("forceResyncStaleModuleFiles", () => {
  it("returns false when no outstanding diagnostics", async () => {
    const { manager } = createMockManager();
    const result = await forceResyncStaleModuleFiles(manager, "/project");
    expect(result).toBe(false);
  });

  it("returns false when no module-resolution errors", async () => {
    const { manager } = createMockManager();
    (
      manager as LspManager & {
        setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
      }
    ).setOutstanding([
      {
        file: "src/broken.ts",
        diagnostics: [makeDiagnostic(1, "Type 'string' is not assignable to type 'number'")],
      },
    ]);
    const result = await forceResyncStaleModuleFiles(manager, "/project");
    expect(result).toBe(false);
  });

  it("does not call closeFile/ensureFileOpen when no stale diagnostics", async () => {
    const { manager, closeFile, ensureFileOpen, refreshOpenDiagnostics } = createMockManager();
    const result = await forceResyncStaleModuleFiles(manager, "/project");
    expect(result).toBe(false);
    expect(closeFile).not.toHaveBeenCalled();
    expect(ensureFileOpen).not.toHaveBeenCalled();
    expect(refreshOpenDiagnostics).not.toHaveBeenCalled();
  });

  it("re-opens files with module-resolution errors", async () => {
    const { manager, closeFile, ensureFileOpen, refreshOpenDiagnostics } = createMockManager();
    (
      manager as LspManager & {
        setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
      }
    ).setOutstanding([
      {
        file: "src/importer.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module './NewFile'", 2307)],
      },
    ]);

    const result = await forceResyncStaleModuleFiles(manager, "/project");

    expect(result).toBe(true);
    expect(closeFile).toHaveBeenCalledTimes(1);
    // Path should be resolved relative to cwd
    expect(closeFile).toHaveBeenCalledWith("/project/src/importer.ts");
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
    expect(ensureFileOpen).toHaveBeenCalledWith("/project/src/importer.ts");
    expect(refreshOpenDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("processes multiple stale files", async () => {
    const { manager, closeFile, ensureFileOpen } = createMockManager();
    (
      manager as LspManager & {
        setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
      }
    ).setOutstanding([
      {
        file: "src/a.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module 'react'", 2307)],
      },
      {
        file: "src/b.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module 'lodash'", 2307)],
      },
      {
        file: "src/c.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module 'axios'", 2307)],
      },
    ]);

    const result = await forceResyncStaleModuleFiles(manager, "/project");

    expect(result).toBe(true);
    expect(closeFile).toHaveBeenCalledTimes(3);
    expect(ensureFileOpen).toHaveBeenCalledTimes(3);
    expect(closeFile).toHaveBeenCalledWith("/project/src/a.ts");
    expect(closeFile).toHaveBeenCalledWith("/project/src/b.ts");
    expect(closeFile).toHaveBeenCalledWith("/project/src/c.ts");
  });

  it("ignores non-module-resolution diagnostics in same file", async () => {
    const { manager, closeFile, ensureFileOpen } = createMockManager();
    (
      manager as LspManager & {
        setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
      }
    ).setOutstanding([
      {
        file: "src/importer.ts",
        diagnostics: [
          makeDiagnostic(1, "Cannot find module './NewFile'", 2307),
          makeDiagnostic(1, "Type 'string' is not assignable to type 'number'"),
        ],
      },
    ]);

    const result = await forceResyncStaleModuleFiles(manager, "/project");

    // Should still process the file because at least one diagnostic is a module-resolution error
    expect(result).toBe(true);
    expect(closeFile).toHaveBeenCalledTimes(1);
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
  });

  it("handles refreshOpenDiagnostics failure gracefully", async () => {
    const { manager, refreshOpenDiagnostics, ensureFileOpen } = createMockManager();
    refreshOpenDiagnostics.mockRejectedValueOnce(new Error("refresh failed"));
    (
      manager as LspManager & {
        setOutstanding(d: Array<{ file: string; diagnostics: Diagnostic[] }>): void;
      }
    ).setOutstanding([
      {
        file: "src/importer.ts",
        diagnostics: [makeDiagnostic(1, "Cannot find module './NewFile'", 2307)],
      },
    ]);

    // Should not throw despite refresh failure
    const result = await forceResyncStaleModuleFiles(manager, "/project");

    expect(result).toBe(true);
    expect(ensureFileOpen).toHaveBeenCalledTimes(1);
    // The function should not propagate the refresh error
  });
});
