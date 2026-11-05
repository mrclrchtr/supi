import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  type FileEdit,
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
import { sessionCache } from "../../../helpers/execute-action.ts";

let projectDir: string | null = null;

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
  if (projectDir) {
    clearWorkspaceLspRuntime(projectDir);
    rmSync(path.dirname(projectDir), { recursive: true, force: true });
    projectDir = null;
  }
});

function setup(edits: (files: { index: string; other: string }) => FileEdit[]) {
  const root = mkdtempSync(path.join(os.tmpdir(), "code-refactor-identity-"));
  projectDir = path.join(root, "project");
  const files = {
    index: path.join(projectDir, "src", "index.ts"),
    other: path.join(projectDir, "src", "other.ts"),
  };
  mkdirSync(path.dirname(files.index), { recursive: true });
  writeFileSync(files.index, "oldName();\n");
  writeFileSync(files.other, "import { oldName } from './index';\n");
  const provider = {
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async (file: string) =>
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
    rename: async () => ({
      kind: "precise",
      edits: { edits: edits(files) },
      authorizedMutationRoots: [projectDir],
    }),
  } as unknown as SemanticProvider;
  getDefaultWorkspaceRuntime().registerSemantic(projectDir, provider);
  setWorkspaceLspRuntimeState(projectDir, {
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
    } as unknown as WorkspaceLspRuntime,
  });
  const pi = createPiMock();
  codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
  const cwd = projectDir;
  const run = async (tool: string, params: unknown) =>
    (await getTool(pi, tool).execute(tool, params, undefined, undefined, makeCtx({ cwd }))) as {
      structuredContent: Record<string, unknown>;
    };
  return { files, run };
}

const plan = (newName: string) => ({
  target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
  operation: { rename_symbol: { newName } },
});

const range = (line: number, start: number, end: number) => ({
  start: { line, character: start },
  end: { line, character: end },
});

describe("code_refactor_plan identity edits", () => {
  it("does not store an applicable plan when every edit is unchanged text", async () => {
    const { run } = setup((files) => [
      { file: files.index, range: range(0, 0, 7), newText: "oldName" },
      { file: files.other, range: range(0, 9, 16), newText: "oldName" },
    ]);

    const result = await run("code_refactor_plan", plan("oldName"));

    expect(result.structuredContent).toMatchObject({
      kind: "invalid-input",
      message: expect.stringContaining("produces no changes"),
    });
    expect(result.structuredContent).not.toHaveProperty("planId");
  });

  it("keeps only real edits in a mixed plan and applies them", async () => {
    const { files, run } = setup((files) => [
      { file: files.index, range: range(0, 0, 7), newText: "newName" },
      { file: files.other, range: range(0, 9, 16), newText: "oldName" },
    ]);

    const planned = await run("code_refactor_plan", plan("newName"));

    expect(planned.structuredContent).toMatchObject({
      kind: "completed",
      editCount: 1,
      fileCount: 1,
      edits: [{ file: "src/index.ts", newText: "newName" }],
    });
    const applied = await run("code_refactor_apply", {
      planId: planned.structuredContent.planId,
    });
    expect(applied.structuredContent).toMatchObject({ kind: "applied" });
    expect(readFileSync(files.index, "utf8")).toBe("newName();\n");
    expect(readFileSync(files.other, "utf8")).toBe("import { oldName } from './index';\n");
  });
});
