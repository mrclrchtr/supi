import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionLspService } from "../../src/session/service-registry.ts";
import { executeLookup, executeWorkspaceSymbols } from "../../src/tool/service-actions.ts";

function makeService(overrides: Partial<SessionLspService> = {}): SessionLspService {
  return {
    isSupportedSourceFile: vi.fn().mockReturnValue(true),
    hover: vi.fn().mockResolvedValue(null),
    definition: vi.fn().mockResolvedValue(null),
    references: vi.fn().mockResolvedValue(null),
    implementation: vi.fn().mockResolvedValue(null),
    documentSymbols: vi.fn().mockResolvedValue(null),
    workspaceSymbol: vi.fn().mockResolvedValue(null),
    rename: vi.fn().mockResolvedValue(null),
    codeActions: vi.fn().mockResolvedValue(null),
    fileDiagnostics: vi.fn().mockResolvedValue(null),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
    getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
    getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
    recoverDiagnostics: vi.fn().mockResolvedValue({
      refreshedClients: 0,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }),
    ...overrides,
  } as unknown as SessionLspService;
}

describe("workspace symbol service action", () => {
  it("returns unsupported message when no server supports workspace symbols", async () => {
    const service = makeService({ workspaceSymbol: vi.fn().mockResolvedValue(null) });

    const result = await executeWorkspaceSymbols(service, "/project", { query: "test" });
    expect(result).toContain("not supported");
  });

  it("returns no symbols message when query returns empty", async () => {
    const service = makeService({ workspaceSymbol: vi.fn().mockResolvedValue([]) });

    const result = await executeWorkspaceSymbols(service, "/project", { query: "nonexistent" });
    expect(result).toContain("No symbols found");
  });
});

describe("lookup service action", () => {
  it("returns a descriptive failure string when lookup throws unexpectedly", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-lookup-error-"));
    try {
      const sourceDir = path.join(tmpDir, "src");
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, "index.ts"), "export const x = 1;\n");

      const service = makeService({
        hover: vi.fn().mockRejectedValue(new Error("unexpected internal error")),
      });

      const result = await executeLookup(service, tmpDir, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
        character: 1,
      });

      expect(result).toBe("LSP lookup failed: unexpected internal error");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns the normal result when lookup succeeds", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-lookup-success-"));
    try {
      const sourceDir = path.join(tmpDir, "src");
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, "index.ts"), "export const x = 1;\n");

      const service = makeService({
        hover: vi.fn().mockResolvedValue({
          contents: [{ kind: "markdown", value: "**Info:** test" }],
        }),
      });

      const result = await executeLookup(service, tmpDir, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
        character: 1,
      });

      expect(result).toContain("Info:");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("wraps non-Error throws in a descriptive message", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-lookup-string-error-"));
    try {
      const sourceDir = path.join(tmpDir, "src");
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, "index.ts"), "export const x = 1;\n");

      const service = makeService({
        hover: vi.fn().mockRejectedValue("string error"),
      });

      const result = await executeLookup(service, tmpDir, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
        character: 1,
      });

      expect(result).toBe("LSP lookup failed: string error");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
