import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FindWorkflowOutcome } from "../../../src/session/find-types.ts";
import { runFindWorkflow } from "../../../src/session/find-workflow.ts";
import { renderFindResult } from "../../../src/tool/code_find/render.ts";
import { assembleFindWorkflowResult } from "../../../src/tool/code_find/result.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "find-workflow-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function deps(structural?: StructuralProvider) {
  return { cwd: tmpDir, capability: new TestCapabilityAdapter({ structural }) };
}

function structuralProvider(): StructuralProvider {
  return {
    imports: async () => ({
      kind: "success",
      data: [
        {
          moduleSpecifier: "target",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 2,
        },
      ],
    }),
  } as unknown as StructuralProvider;
}

describe("runFindWorkflow", () => {
  it("uses a registered semantic provider when crashed routes make readiness recoverable", async () => {
    const workspaceSymbols = vi.fn<NonNullable<SemanticProvider["workspaceSymbols"]>>(async () =>
      completedCodeQuery([]),
    );
    const semantic = { workspaceSymbols } as unknown as SemanticProvider;

    const outcome = await runFindWorkflow(
      { query: "target", mode: "semantic" },
      {
        cwd: tmpDir,
        capability: new TestCapabilityAdapter({
          semantic,
          readiness: { kind: "unavailable", reason: "No active ready routes" },
          lspRuntime: {
            kind: "ready",
            runtime: {
              getProjectServers: () => [
                {
                  status: "error",
                  statusReason: "process-crashed",
                },
              ],
            },
          } as never,
        }),
      },
    );

    expect(outcome).toMatchObject({ kind: "completed" });
    expect(workspaceSymbols).toHaveBeenCalledOnce();
  });

  it("keeps waiting for normal startup when a pending provider is registered", async () => {
    const workspaceSymbols = vi.fn<NonNullable<SemanticProvider["workspaceSymbols"]>>(async () =>
      completedCodeQuery([]),
    );
    const outcome = await runFindWorkflow(
      { query: "target", mode: "semantic" },
      {
        cwd: tmpDir,
        capability: new TestCapabilityAdapter({
          semantic: { workspaceSymbols } as unknown as SemanticProvider,
          readiness: { kind: "timeout" },
          lspRuntime: { kind: "pending" },
        }),
      },
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Semantic provider did not become ready within the wait window; retry shortly.",
    });
    expect(workspaceSymbols).not.toHaveBeenCalled();
  });

  it("reports a readiness timeout when no semantic provider is registered", async () => {
    const outcome = await runFindWorkflow(
      { query: "target", mode: "semantic" },
      {
        cwd: tmpDir,
        capability: new TestCapabilityAdapter({ readiness: { kind: "timeout" } }),
      },
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Semantic provider did not become ready within the wait window; retry shortly.",
    });
  });

  it("keeps a completed-empty semantic search as a valid no-data result", async () => {
    const semantic = {
      workspaceSymbols: async () => completedCodeQuery([]),
    } as unknown as SemanticProvider;

    const outcome = await runFindWorkflow(
      { query: "missing", mode: "semantic" },
      {
        cwd: tmpDir,
        capability: new TestCapabilityAdapter({ semantic }),
      },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: { kind: "semantic", symbols: [], partialReason: null },
    });
    if (outcome.kind !== "completed") return;

    const rendered = renderFindResult(assembleFindWorkflowResult(outcome));
    expect(rendered).toContain("No LSP workspace-symbol results found");
    expect(rendered).not.toContain("did not become ready within the wait window");
  });

  it("forwards the resolved semantic scope set to workspace discovery", async () => {
    const scopeA = path.join(tmpDir, "a");
    const scopeB = path.join(tmpDir, "b");
    mkdirSync(scopeA);
    mkdirSync(scopeB);
    const workspaceSymbols = vi.fn<SemanticProvider["workspaceSymbols"]>(async () =>
      completedCodeQuery([]),
    );

    await runFindWorkflow(
      { query: "target", mode: "semantic", scope: ["a", "b"] },
      {
        cwd: tmpDir,
        capability: new TestCapabilityAdapter({
          semantic: { workspaceSymbols } as unknown as SemanticProvider,
        }),
      },
    );

    expect(workspaceSymbols).toHaveBeenCalledWith("target", undefined, [scopeA, scopeB]);
  });

  it("reports an expired caller AST deadline as a timeout partial", async () => {
    writeFileSync(path.join(tmpDir, "alpha.ts"), "import target from 'target';\n");
    const imports = vi.fn<StructuralProvider["imports"]>(async () => ({
      kind: "success" as const,
      data: [],
    }));

    const outcome = await runFindWorkflow(
      { query: "target", mode: "ast", kind: "import" },
      deps({ imports } as unknown as StructuralProvider),
      { deadline: Date.now() - 1 },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        kind: "ast",
        result: {
          partialReason: "timeout",
          scan: { complete: false, limitations: [expect.objectContaining({ reason: "timeout" })] },
        },
      },
    });
    expect(imports).not.toHaveBeenCalled();
  });

  it("forwards the caller absolute deadline into AST structural work", async () => {
    writeFileSync(path.join(tmpDir, "alpha.ts"), "import target from 'target';\n");
    const imports = vi.fn<StructuralProvider["imports"]>(async () => ({
      kind: "success" as const,
      data: [],
    }));
    const signal = new AbortController().signal;

    await runFindWorkflow(
      { query: "target", mode: "ast", kind: "import" },
      deps({ imports } as unknown as StructuralProvider),
      { signal, deadline: Date.now() + 60_000 },
    );

    expect(imports.mock.calls[0]?.[1]).toEqual({
      signal,
      deadline: expect.any(Number),
    });
    expect(imports.mock.calls[0]?.[1]?.deadline).toBeLessThanOrEqual(Date.now() + 10_000);
  });

  it("collects every AST match before result assembly applies maxResults", async () => {
    writeFileSync(path.join(tmpDir, "alpha.ts"), "export const alpha = 1;\n");
    writeFileSync(path.join(tmpDir, "beta.ts"), "export const beta = 1;\n");
    writeFileSync(path.join(tmpDir, "gamma.sql"), "select alpha;\n");

    const outcome = await runFindWorkflow(
      { query: "a", mode: "ast", kind: "import", maxResults: 1 },
      deps(structuralProvider()),
    );

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed" || outcome.data.kind !== "ast") return;
    expect(outcome.data.result.matches).toHaveLength(2);
    expect(outcome.data.result.scan).toMatchObject({
      eligibleFileCount: 2,
      analyzedFileCount: 2,
      complete: true,
      exclusions: [{ reason: "unsupported-operation", pathCount: 1, examples: ["gamma.sql"] }],
    });

    const assembly = assembleFindWorkflowResult(outcome);
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "find.astMatches",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
    expect(assembly.details.omittedCount).toBe(1);
    const rendered = renderFindResult(assembly);
    expect(rendered).toContain("_(showing 1 of 2; 1 omitted)_");
    expect(rendered).toContain("AST Scan policy excluded 1 file");
    expect(rendered).not.toContain("Duplicate Definitions");
    expect(rendered).not.toContain("beta.ts");
  });

  it("counts display-hidden matches but not incomplete-scan paths as omitted Evidence", () => {
    const outcome: Extract<FindWorkflowOutcome, { kind: "completed" }> = {
      kind: "completed",
      query: "target",
      mode: "ast",
      scopeLabel: ".",
      maxResults: 1,
      data: {
        kind: "ast",
        astKind: "definition",
        result: {
          matches: [
            { file: "src/a.ts", line: 1, name: "targetA", kind: "variable" },
            { file: "src/b.ts", line: 1, name: "targetB", kind: "variable" },
          ],
          failures: [],
          partialReason: "safety-limit",
          scan: {
            universe: "structural-operation-supported-files",
            roots: ["."],
            policy: {
              operation: "outline",
              supportedExtensions: [".ts"],
              excludedDirectories: ["node_modules"],
              hiddenEntries: "excluded",
              ignoreFiles: false,
              symlinks: "explicit-roots-only",
              maxFiles: 1,
              timeoutMs: 10_000,
            },
            eligibleFileCount: null,
            analyzedFileCount: 2,
            complete: false,
            exclusions: [],
            limitations: [{ reason: "safety-limit", pathCount: null, examples: ["c.ts"] }],
          },
        },
      },
    };

    const assembly = assembleFindWorkflowResult(outcome);

    expect(assembly.details.evidenceLists).toContainEqual({
      key: "find.astMatches",
      totalCount: null,
      shownCount: 1,
      omittedCount: 1,
      partialReason: "safety-limit",
    });
    expect(assembly.details.omittedCount).toBe(1);
    if (outcome.data.kind !== "ast") throw new Error("expected AST outcome");
    expect(assembly.details.scan).toEqual(outcome.data.result.scan);
    expect(renderFindResult(assembly)).toContain(
      "_(showing 1; 1 collected omitted; more may exist — safety-limit)_",
    );
    expect(renderFindResult(assembly)).toContain("AST Scan incomplete");
    expect(renderFindResult(assembly)).toContain("safety-limit: unknown paths");
  });

  it("returns invalid-input instead of throwing for a non-string query", async () => {
    const outcome = await runFindWorkflow({ query: 42, mode: "semantic" } as never, deps());

    expect(outcome).toEqual({ kind: "invalid-input", message: "query must be a string." });
  });

  it.each([undefined, "text", "regex", "not-a-mode"])(
    "rejects removed or unknown mode %j",
    async (mode) => {
      const outcome = await runFindWorkflow(
        { query: "needle", ...(mode === undefined ? {} : { mode }) } as never,
        deps(),
      );

      expect(outcome).toEqual({
        kind: "invalid-input",
        message: "mode is required and must be one of ast or semantic.",
      });
    },
  );

  it("rejects the removed test AST kind before structural execution", async () => {
    const outcome = await runFindWorkflow(
      { query: "registerCodeIntelligenceTools", mode: "ast", kind: "test" } as never,
      deps(),
    );

    expect(outcome).toEqual({ kind: "invalid-input", message: "Unsupported AST kind." });
  });
});
