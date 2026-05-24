import * as path from "node:path";
import { pruneAndReorderContextMessages } from "@mrclrchtr/supi-core/api";
import { beforeEach, describe, expect, it } from "vitest";
import { clearTsconfigCache } from "../../src/config/tsconfig-scope.ts";
import { DiagnosticSeverity } from "../../src/config/types.ts";
import {
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
} from "../../src/diagnostics/diagnostic-context.ts";
import { LspManager } from "../../src/manager/manager.ts";
import {
  buildLspToolPromptSurfaces,
  defaultLspToolPromptSurfaces,
} from "../../src/tool/guidance.ts";
import {
  LSP_CODE_ACTIONS_TOOL,
  LSP_DEFINITION_TOOL,
  LSP_DIAGNOSTICS_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_HOVER_TOOL,
  LSP_IMPLEMENTATION_TOOL,
  LSP_RECOVER_TOOL,
  LSP_REFERENCES_TOOL,
  LSP_RENAME_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
} from "../../src/tool/names.ts";

beforeEach(() => {
  clearTsconfigCache();
});

describe("LSP prompt guidance", () => {
  it("exports prompt surfaces for every expert LSP tool", () => {
    const hover = defaultLspToolPromptSurfaces[LSP_HOVER_TOOL];
    const definition = defaultLspToolPromptSurfaces[LSP_DEFINITION_TOOL];
    const references = defaultLspToolPromptSurfaces[LSP_REFERENCES_TOOL];
    const implementation = defaultLspToolPromptSurfaces[LSP_IMPLEMENTATION_TOOL];
    const documentSymbols = defaultLspToolPromptSurfaces[LSP_DOCUMENT_SYMBOLS_TOOL];
    const workspaceSymbols = defaultLspToolPromptSurfaces[LSP_WORKSPACE_SYMBOLS_TOOL];
    const diagnostics = defaultLspToolPromptSurfaces[LSP_DIAGNOSTICS_TOOL];
    const rename = defaultLspToolPromptSurfaces[LSP_RENAME_TOOL];
    const codeActions = defaultLspToolPromptSurfaces[LSP_CODE_ACTIONS_TOOL];
    const recover = defaultLspToolPromptSurfaces[LSP_RECOVER_TOOL];

    expect(hover.description).toContain("hover");
    expect(hover.promptSnippet).toContain("lsp_hover");
    expect(hover.promptGuidelines.every((guideline) => guideline.includes("lsp"))).toBe(true);
    expect(definition.description).toContain("definition");
    expect(definition.promptSnippet).toContain("lsp_definition");
    expect(references.description).toContain("references");
    expect(references.promptSnippet).toContain("lsp_references");
    expect(implementation.description).toContain("implementation");
    expect(implementation.promptSnippet).toContain("lsp_implementation");
    expect(rename.description).toContain("rename");
    expect(rename.promptSnippet).toContain("lsp_rename");
    expect(codeActions.description).toContain("code");
    expect(codeActions.promptSnippet).toContain("lsp_code_actions");
    expect(documentSymbols.promptGuidelines[0]).toContain("lsp_document_symbols");
    expect(workspaceSymbols.promptGuidelines[0]).toContain("lsp_workspace_symbols");
    expect(diagnostics.promptGuidelines[0]).toContain("lsp_diagnostics");
    expect(recover.promptGuidelines[0]).toContain("lsp_recover");
  });

  it("builds lookup guidance with dynamic server coverage lines", () => {
    const surfaces = buildLspToolPromptSurfaces(
      [
        {
          name: "typescript",
          status: "running",
          root: process.cwd(),
          fileTypes: ["ts", "tsx"],
          supportedActions: ["diagnostics", "hover", "definition", "implementation"],
          openFiles: [],
        },
        {
          name: "python",
          status: "unavailable",
          root: process.cwd(),
          fileTypes: ["py"],
          supportedActions: ["diagnostics"],
          openFiles: [],
        },
      ],
      process.cwd(),
    );

    const hoverGuidelines = surfaces[LSP_HOVER_TOOL].promptGuidelines;
    const definitionGuidelines = surfaces[LSP_DEFINITION_TOOL].promptGuidelines;
    const referencesGuidelines = surfaces[LSP_REFERENCES_TOOL].promptGuidelines;
    const implementationGuidelines = surfaces[LSP_IMPLEMENTATION_TOOL].promptGuidelines;
    const renameGuidelines = surfaces[LSP_RENAME_TOOL].promptGuidelines;
    const codeActionsGuidelines = surfaces[LSP_CODE_ACTIONS_TOOL].promptGuidelines;

    for (const guidelines of [
      hoverGuidelines,
      definitionGuidelines,
      referencesGuidelines,
      implementationGuidelines,
      renameGuidelines,
      codeActionsGuidelines,
    ]) {
      expect(guidelines.some((g) => g.startsWith("lsp server coverage:"))).toBe(true);
    }
    expect(
      hoverGuidelines.some((guideline) => guideline.startsWith("lsp server coverage: typescript")),
    ).toBe(true);
    expect(
      hoverGuidelines.some((guideline) => guideline.startsWith("lsp server unavailable: python")),
    ).toBe(true);
  });

  it("formats diagnostics as xml extension context", () => {
    const content = formatDiagnosticsContext([
      {
        file: "packages/supi-lsp/lsp.ts",
        total: 2,
        errors: 1,
        warnings: 1,
        information: 0,
        hints: 0,
      },
      {
        file: "packages/supi-lsp/manager.ts",
        total: 1,
        errors: 1,
        warnings: 0,
        information: 0,
        hints: 0,
      },
    ]);

    expect(content).toContain('<extension-context source="supi-lsp">');
    expect(content).toContain("Outstanding diagnostics — fix these before proceeding:");
    expect(content).toContain("packages/supi-lsp/lsp.ts: 1 error, 1 warning");
    expect(content).toContain("packages/supi-lsp/manager.ts: 1 error");
    expect(content).toContain("</extension-context>");
  });

  it("includes stale suppression cleanup when detailed diagnostics contain suppressions", () => {
    const content = formatDiagnosticsContext(
      [
        {
          file: "src/app.ts",
          total: 2,
          errors: 1,
          warnings: 1,
          information: 0,
          hints: 0,
        },
      ],
      3,
      [
        {
          file: "src/app.ts",
          diagnostics: [
            {
              severity: 1,
              message: "Type 'number' is not assignable to type 'string'.",
              range: { start: { line: 4, character: 0 }, end: { line: 4, character: 1 } },
              source: "ts",
            },
            {
              severity: 2,
              message: "Unused '@ts-expect-error' directive.",
              range: { start: { line: 10, character: 0 }, end: { line: 10, character: 1 } },
              source: "ts",
            },
          ],
        },
      ],
    );

    expect(content).toContain("Outstanding diagnostics — fix these before proceeding:");
    expect(content).toContain("src/app.ts: 1 error, 1 warning");
    expect(content).toContain("Stale suppression comments — clean these up:");
    expect(content).toContain("Unused '@ts-expect-error' directive.");
  });

  it("returns null for empty diagnostics context", () => {
    expect(formatDiagnosticsContext([])).toBeNull();
    expect(diagnosticsContextFingerprint(null)).toBeNull();
  });

  it("fingerprints diagnostics from the exact content", () => {
    const content =
      '<extension-context source="supi-lsp">\nOutstanding diagnostics:\n- a.ts: 1 error\n</extension-context>';
    expect(diagnosticsContextFingerprint(content)).toBe(content);
  });

  it("reorders current lsp-context before the last user message and drops stale ones", () => {
    const messages = [
      { role: "user", content: "older prompt" },
      { role: "custom", customType: "lsp-context", details: { contextToken: "old" } },
      { role: "assistant", content: "working" },
      { role: "user", content: "current prompt" },
      { role: "custom", customType: "lsp-context", details: { contextToken: "current" } },
    ];

    expect(pruneAndReorderContextMessages(messages, "lsp-context", "current")).toEqual([
      { role: "user", content: "older prompt" },
      { role: "assistant", content: "working" },
      { role: "custom", customType: "lsp-context", details: { contextToken: "current" } },
      { role: "user", content: "current prompt" },
    ]);
  });

  it("drops all lsp-context messages when there is no active token", () => {
    const messages = [
      { role: "user", content: "prompt" },
      { role: "custom", customType: "lsp-context", details: { contextToken: "old" } },
    ];

    expect(pruneAndReorderContextMessages(messages, "lsp-context", null)).toEqual([
      { role: "user", content: "prompt" },
    ]);
  });

  it("leaves messages alone when there is no user message to prepend before", () => {
    const messages = [
      { role: "assistant", content: "working" },
      { role: "custom", customType: "lsp-context", details: { contextToken: "current" } },
    ];

    expect(pruneAndReorderContextMessages(messages, "lsp-context", "current")).toEqual(messages);
  });
});

describe("LspManager inactive coverage summaries", () => {
  it("omits active coverage summaries before any server is active", () => {
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "typescript-language-server",
            args: ["--stdio"],
            fileTypes: ["ts", "tsx", "js", "jsx"],
            rootMarkers: ["package.json"],
          },
          python: {
            command: "pyright-langserver",
            args: ["--stdio"],
            fileTypes: ["py", "pyi"],
            rootMarkers: ["pyproject.toml"],
          },
        },
      },
      process.cwd(),
    );

    expect(manager.getCoverageSummaryText()).toBeNull();
  });
});

describe("LspManager relevant coverage summaries", () => {
  it("filters active coverage summaries to relevant directories", () => {
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "typescript-language-server",
            args: ["--stdio"],
            fileTypes: ["ts", "tsx", "js", "jsx"],
            rootMarkers: ["package.json"],
          },
        },
      },
      process.cwd(),
    );

    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            name: string;
            status: "running" | "error";
            root: string;
            openFiles: string[];
            getAllDiagnostics(): Array<{ uri: string; diagnostics: unknown[] }>;
            pruneMissingFiles(): string[];
          }
        >;
      }
    ).clients;

    clients.set("typescript:/tmp/project", {
      name: "typescript",
      status: "running",
      root: "/tmp/project",
      openFiles: [
        path.join(process.cwd(), "src/lsp/coverage.ts"),
        path.join(process.cwd(), "src/util.ts"),
      ],
      getAllDiagnostics: () => [],
      pruneMissingFiles: () => {
        // Mock: files exist (don't prune them)
        return [];
      },
    });

    const summary = manager.getRelevantCoverageSummaryText(["lsp"]);
    expect(summary).toContain("src/lsp/coverage.ts");
    expect(summary).not.toContain("src/util.ts");
  });
});

describe("LspManager diagnostic summaries", () => {
  it("filters outstanding diagnostics to relevant files", () => {
    const manager = new LspManager({ servers: {} }, process.cwd());
    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            getAllDiagnostics(): Array<{
              uri: string;
              diagnostics: Array<{ severity?: number; message: string }>;
            }>;
            pruneMissingFiles(): string[];
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${path.join(process.cwd(), "src/lsp/manager-sync.ts")}`,
          diagnostics: [{ severity: DiagnosticSeverity.Error, message: "type error" }],
        },
        {
          uri: `file://${path.join(process.cwd(), "src/util.ts")}`,
          diagnostics: [{ severity: DiagnosticSeverity.Error, message: "doc error" }],
        },
      ],
      pruneMissingFiles: () => [],
    });

    const summary = manager.getRelevantOutstandingDiagnosticsSummaryText(["lsp"], 1);
    expect(summary).toContain("src/lsp/manager-sync.ts");
    expect(summary).not.toContain("src/util.ts");
  });
});

describe("LspManager getOutstandingDiagnostics", () => {
  it("returns detailed diagnostics per file with messages and line numbers", () => {
    const manager = new LspManager({ servers: {} }, process.cwd());
    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            getAllDiagnostics(): Array<{
              uri: string;
              diagnostics: Array<{
                severity?: number;
                message: string;
                range: { start: { line: number; character: number } };
              }>;
            }>;
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${path.join(process.cwd(), "src/app.ts")}`,
          diagnostics: [
            {
              severity: DiagnosticSeverity.Error,
              message: "Cannot find module 'typebox'",
              range: { start: { line: 4, character: 21 } },
            },
            {
              severity: DiagnosticSeverity.Warning,
              message: "Unused import",
              range: { start: { line: 1, character: 0 } },
            },
          ],
        },
      ],
    });

    const detailed = manager.getOutstandingDiagnostics(2);
    expect(detailed).toHaveLength(1);
    expect(detailed[0]?.file).toBe("src/app.ts");
    expect(detailed[0]?.diagnostics).toHaveLength(2);
    expect(detailed[0]?.diagnostics[0]?.message).toBe("Cannot find module 'typebox'");
    expect(detailed[0]?.diagnostics[0]?.range.start.line).toBe(4);
  });

  it("filters diagnostics by severity threshold", () => {
    const manager = new LspManager({ servers: {} }, process.cwd());
    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            getAllDiagnostics(): Array<{
              uri: string;
              diagnostics: Array<{
                severity?: number;
                message: string;
                range: { start: { line: number; character: number } };
              }>;
            }>;
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${path.join(process.cwd(), "src/app.ts")}`,
          diagnostics: [
            {
              severity: DiagnosticSeverity.Error,
              message: "type error",
              range: { start: { line: 0, character: 0 } },
            },
            {
              severity: DiagnosticSeverity.Hint,
              message: "hint",
              range: { start: { line: 0, character: 0 } },
            },
          ],
        },
      ],
    });

    const errorsOnly = manager.getOutstandingDiagnostics(1);
    expect(errorsOnly[0]?.diagnostics).toHaveLength(1);
    expect(errorsOnly[0]?.diagnostics[0]?.message).toBe("type error");
  });
});

describe("LspManager semantic support checks", () => {
  it("allows explicit semantic serving for dependency files while keeping runtime guidance filtered", () => {
    const manager = new LspManager(
      {
        servers: {
          typescript: {
            command: "node",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["package.json"],
          },
        },
      },
      process.cwd(),
    );

    expect(manager.canServeFile("node_modules/example/index.ts")).toBe(true);
    expect(manager.isSupportedSourceFile("node_modules/example/index.ts")).toBe(false);
  });
});

describe("LspManager detected root reuse", () => {
  it("reuses the detected logical root for nested files so lazy startup does not spawn duplicate roots", () => {
    const manager = new LspManager(
      {
        servers: {
          "node-based": {
            command: "node",
            args: [],
            fileTypes: ["ts"],
            rootMarkers: ["tsconfig.json", "package.json"],
          },
        },
      },
      process.cwd(),
    );

    manager.registerDetectedServers([
      {
        name: "node-based",
        root: process.cwd(),
        fileTypes: ["ts"],
      },
    ]);

    (
      manager as unknown as {
        unavailable: Map<string, "missing-command" | "start-failed" | "runtime-error">;
      }
    ).unavailable.set(`node-based:${process.cwd()}`, "start-failed");

    expect(manager.isSupportedSourceFile("packages/supi-lsp/ui.ts")).toBe(false);
  });
});
