import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  clearWorkspaceLspRuntime,
  setWorkspaceLspRuntimeState,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { executeRefactorApplyTool } from "../../../../src/tool/code_refactor_apply/execute.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";

let temporaryDirectory: string | null = null;
const lspCwds = new Set<string>();

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
  for (const cwd of lspCwds) clearWorkspaceLspRuntime(cwd);
  lspCwds.clear();
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

function makeDirectory(prefix: string): string {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), prefix));
  return temporaryDirectory;
}

function writeSource(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "oldName();\n", "utf-8");
}

function createSemanticProvider(rename: NonNullable<SemanticProvider["rename"]>): SemanticProvider {
  return {
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async (file) =>
      completedCodeQuery([
        {
          name: "oldName",
          kind: "Function",
          file,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 1 },
          container: null,
          nesting: "top-level",
        },
      ]),
    workspaceSymbols: async () => completedCodeQuery([]),
    rename,
  } as SemanticProvider;
}

function registerSemantic(
  cwd: string,
  provider: SemanticProvider,
  runtimeOverrides: Partial<WorkspaceLspRuntime> = {},
): void {
  getDefaultWorkspaceRuntime().registerSemantic(cwd, provider);
  lspCwds.add(cwd);
  setWorkspaceLspRuntimeState(cwd, {
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
      ...runtimeOverrides,
    } as unknown as WorkspaceLspRuntime,
  });
}

function extractPlanId(content: string): string {
  const match = content.match(/\*\*Plan ID:\*\* `([^`]+)`/);
  if (!match) throw new Error(`Plan ID not found in content:\n${content}`);
  return match[1];
}

describe("semantic refactor mutation authority", () => {
  it("rejects a provider edit outside the routed mutation root", async () => {
    const root = makeDirectory("code-refactor-authority-");
    const project = path.join(root, "project");
    const target = path.join(project, "src", "index.ts");
    const outside = path.join(root, "outside.ts");
    writeSource(target);
    writeSource(outside);
    registerSemantic(
      project,
      createSemanticProvider(async () => ({
        kind: "precise",
        edits: {
          edits: [
            {
              file: outside,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
              newText: "newName",
            },
          ],
        },
        authorizedMutationRoots: [project],
      })),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    await expect(
      tool.execute(
        "workflow-refactor-outside-root",
        {
          target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
          operation: { rename_symbol: { newName: "newName" } },
        },
        undefined,
        undefined,
        makeCtx({ cwd: project }),
      ),
    ).rejects.toThrow("outside the authorized provider roots");
  });

  it("applies a multi-file plan for an explicit external target inside its provider root", async () => {
    const root = makeDirectory("code-refactor-external-");
    const sessionRoot = path.join(root, "session");
    const externalProject = path.join(root, "external-project");
    const target = path.join(externalProject, "src", "index.ts");
    const sibling = path.join(externalProject, "src", "usage.ts");
    mkdirSync(sessionRoot, { recursive: true });
    writeSource(target);
    writeSource(sibling);
    registerSemantic(
      sessionRoot,
      createSemanticProvider(async () => ({
        kind: "precise",
        edits: {
          edits: [target, sibling].map((file) => ({
            file,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
            newText: "newName",
          })),
        },
        authorizedMutationRoots: [externalProject],
      })),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const session = sessionCache.getOrCreate(sessionRoot);
    const planOutcome = await session.planRefactor({
      target: { anchor: { file: target, line: 1, character: 1 } },
      operation: { rename_symbol: { newName: "newName" } },
    });
    expect(planOutcome.kind).toBe("completed");
    if (planOutcome.kind !== "completed") throw new Error("Expected a completed plan.");
    expect(planOutcome.plan.authorizedMutationRoots).toEqual([realpathSync(externalProject)]);
    const applyTool = getTool(pi, "code_refactor_apply");

    await applyTool.execute(
      "workflow-refactor-external-apply",
      { planId: planOutcome.plan.id },
      undefined,
      undefined,
      makeCtx({ cwd: sessionRoot }),
    );

    expect(readFileSync(target, "utf-8")).toBe("newName();\n");
    expect(readFileSync(sibling, "utf-8")).toBe("newName();\n");
  });

  it("does not apply a plan after its open-document version changes", async () => {
    const root = makeDirectory("code-refactor-version-");
    const project = path.join(root, "project");
    const file = path.join(project, "src", "index.ts");
    writeSource(file);
    let openVersion = 1;
    registerSemantic(
      project,
      createSemanticProvider(async () => ({
        kind: "precise",
        edits: {
          edits: [
            {
              file,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
              newText: "newName",
            },
          ],
          documentPreconditions: [{ file, kind: "open-document-version", version: 1 }],
        },
        authorizedMutationRoots: [project],
      })),
      { getOpenDocumentVersion: () => openVersion },
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const refactorTool = getTool(pi, "code_refactor_plan");
    const planResult = (await refactorTool.execute(
      "workflow-refactor-version-plan",
      {
        target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
        operation: { rename_symbol: { newName: "newName" } },
      },
      undefined,
      undefined,
      makeCtx({ cwd: project }),
    )) as { content: Array<{ type: string; text: string }> };
    openVersion = 2;

    await expect(
      executeRefactorApplyTool(
        { planId: extractPlanId(planResult.content[0].text) },
        { cwd: project, session: sessionCache.getOrCreate(project) },
      ),
    ).rejects.toThrow("open document version has changed");
    expect(readFileSync(file, "utf-8")).toBe("oldName();\n");
  });
});
