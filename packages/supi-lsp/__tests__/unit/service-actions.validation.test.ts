import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionLspService } from "../../src/session/service-registry.ts";
import {
  executeDiagnostics,
  executeDocumentSymbols,
  executeLookup,
  executeRefactor,
  executeWorkspaceSymbols,
} from "../../src/tool/service-actions.ts";

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
    fileDiagnostics: vi.fn().mockResolvedValue([]),
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

describe("service action validation", () => {
  it("lookup: returns validation error when line is missing", async () => {
    const result = await executeLookup(makeService(), "/project", {
      kind: "hover",
      file: "src/index.ts",
      line: undefined as unknown as number,
      character: 1,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("`line`");
  });

  it("lookup: returns validation error when character is missing", async () => {
    const result = await executeLookup(makeService(), "/project", {
      kind: "hover",
      file: "src/index.ts",
      line: 1,
      character: undefined as unknown as number,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("`character`");
  });

  it("lookup: returns validation error when line is not a positive integer", async () => {
    const result = await executeLookup(makeService(), "/project", {
      kind: "hover",
      file: "src/index.ts",
      line: 0,
      character: 1,
    });
    expect(result).toContain("Validation error");
    expect(result).toContain("positive 1-based integer");
  });

  it("lookup: returns file-not-found when the file is missing", async () => {
    const result = await executeLookup(makeService(), "/project", {
      kind: "definition",
      file: "src/index.ts",
      line: 1,
      character: 1,
    });
    expect(result).toContain("File not found");
  });

  it("document symbols: returns validation error via file check when file is missing", async () => {
    const result = await executeDocumentSymbols(makeService(), "/project", {
      file: "src/index.ts",
    });
    expect(result).toContain("File not found");
  });

  it("refactor: returns validation error when newName is missing for rename", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refactor-validate-"));
    try {
      const file = path.join(tmpDir, "src", "index.ts");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "export const x = 1;\n");

      const result = await executeRefactor(makeService(), tmpDir, {
        kind: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
      });
      expect(result).toContain("Validation error");
      expect(result).toContain("`newName`");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("workspace symbols: returns validation error when query is empty", async () => {
    const result = await executeWorkspaceSymbols(makeService(), "/project", { query: "   " });
    expect(result).toContain("Validation error");
    expect(result).toContain("`query`");
  });
});

describe("service action relative path resolution", () => {
  it("resolves relative file paths from the session cwd", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-relative-path-"));
    try {
      const file = path.join(tmpDir, "src", "index.ts");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "export const x = 1;\n");

      const service = makeService({
        hover: vi.fn().mockResolvedValue({ contents: "hover result" }),
      });

      const result = await executeLookup(service, tmpDir, {
        kind: "hover",
        file: "src/index.ts",
        line: 1,
        character: 1,
      });

      expect(result).toContain("hover result");
      expect(service.hover).toHaveBeenCalledWith("src/index.ts", {
        line: 0,
        character: 0,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("resolves absolute paths unchanged", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-absolute-path-"));
    try {
      const absoluteFile = path.join(tmpDir, "src", "index.ts");
      fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
      fs.writeFileSync(absoluteFile, "export const x = 1;\n");

      const service = makeService({
        hover: vi.fn().mockResolvedValue({ contents: "hover result" }),
      });

      await executeLookup(service, tmpDir, {
        kind: "hover",
        file: absoluteFile,
        line: 1,
        character: 1,
      });

      expect(service.hover).toHaveBeenCalledWith(absoluteFile, { line: 0, character: 0 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("service action diagnostics behavior", () => {
  it("diagnostics: returns file-not-found message when the file does not exist", async () => {
    const result = await executeDiagnostics(makeService(), "/repo", { file: "src/missing.ts" });
    expect(result).toContain("File not found");
  });

  it("diagnostics: formats relative file paths from the session cwd", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-diagnostics-path-"));
    try {
      const file = path.join(tmpDir, "src", "index.ts");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "const value: number = 'bad';\n");

      const service = makeService({
        fileDiagnostics: vi.fn().mockResolvedValue([
          {
            severity: 1,
            message: "Type 'string' is not assignable to type 'number'.",
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
          },
        ]),
      });

      const result = await executeDiagnostics(service, tmpDir, { file: "src/index.ts" });

      expect(result).toContain("**src/index.ts**:");
      expect(result).not.toContain("..");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
