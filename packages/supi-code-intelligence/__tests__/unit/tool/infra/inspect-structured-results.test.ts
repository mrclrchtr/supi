import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { setWorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "inspect-structured-"));
  writeFileSync(join(cwd, "index.ts"), "export function widget() {}\n");
  registerMockProvider(cwd);
});
afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});
interface Tool {
  outputSchema: TSchema;
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
  }>;
}
function tool() {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
  return getTool(pi, "code_inspect") as unknown as Tool;
}
async function execute(registered: Tool, args: unknown, signal?: AbortSignal) {
  const result = await registered.execute("inspect", args, signal, undefined, makeCtx({ cwd }));
  expect(
    Value.Check(registered.outputSchema, result.structuredContent),
    JSON.stringify([...Value.Errors(registered.outputSchema, result.structuredContent)]),
  ).toBe(true);
  expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual(result.structuredContent);
  return result;
}
const point = { file: "index.ts", line: 1, character: 17 };

describe("registered inspect structured results", () => {
  it("distinguishes completed-empty, partial-empty and unavailable sections", async () => {
    registerMockProvider(cwd, {
      hover: async () => completedCodeQuery(null),
      definition: async () => ({ kind: "partial", data: [], reason: "Index warming" }),
    });
    const result = await execute(tool(), { point });
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      sections: {
        node: { kind: "unavailable", reason: expect.any(String) },
        enclosingSymbol: { kind: "unavailable", reason: expect.any(String) },
        hover: { kind: "completed", data: null },
        definition: { kind: "partial", data: [], reason: "Index warming" },
        diagnostics: { kind: "completed", data: [] },
      },
      evidenceLists: [
        { totalCount: null, shownCount: 0, partialReason: "provider-limited" },
        { totalCount: 0, shownCount: 0, omittedCount: 0 },
      ],
    });
  });

  it("preserves exact diagnostic selection counts and separates corrective input from thrown failures", async () => {
    setWorkspaceLspRuntimeState(cwd, {
      kind: "ready",
      runtime: {
        waitUntilReadyForFile: async () => ({ kind: "ready" }),
        fileDiagnostics: async () =>
          completedCodeQuery(
            ["First", "Second"].map((message) => ({
              severity: 1,
              message,
              range: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
            })),
          ),
      } as never,
    });
    const registered = tool();
    const selected = await execute(registered, { point, maxResults: 1 });
    expect(selected.structuredContent).toMatchObject({
      sections: {
        diagnostics: { kind: "completed", data: [{ message: "First", line: 1, character: 17 }] },
      },
      evidenceLists: [
        { key: "inspect.diagnostics", totalCount: 2, shownCount: 1, omittedCount: 1 },
      ],
    });
    for (const invalidPoint of [
      { ...point, file: "missing.ts" },
      { ...point, character: 999 },
      { ...point, line: 0 },
    ]) {
      expect((await execute(registered, { point: invalidPoint })).structuredContent).toMatchObject({
        kind: "invalid-input",
        message: expect.any(String),
      });
    }
    const controller = new AbortController();
    controller.abort();
    await expect(execute(registered, { point }, controller.signal)).rejects.toThrow();
    registerMockProvider(cwd, { hover: async () => unavailableCodeQuery("Not available") });
    setWorkspaceLspRuntimeState(cwd, { kind: "unavailable", reason: "Offline" });
    await expect(execute(registered, { point })).rejects.toThrow(
      "No semantic, structural, or diagnostic provider",
    );
  });
  it("retains point-local facts, partial recovery and bounded evidence independently of presentation", async () => {
    const range = { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } };
    registerMockProvider(cwd, {
      nodeAt: async () => ({
        kind: "partial",
        file: "index.ts",
        reason: "Recovered syntax",
        errorRanges: [range],
        data: {
          type: "identifier",
          text: "widget",
          startLine: 1,
          startCharacter: 17,
          endLine: 1,
          endCharacter: 23,
          ancestry: [],
        },
      }),
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "function",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 28,
            children: [],
          },
        ],
      }),
      hover: async () => completedCodeQuery({ contents: "function widget(): void" }),
      definition: async () => ({
        kind: "partial",
        reason: "Index warming",
        data: [0, 1].map((line) => ({
          uri: pathToFileURL(join(cwd, `definition${line}.ts`)).href,
          range,
        })),
      }),
    });
    const result = await execute(tool(), { point, maxResults: 1 });
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      point,
      diagnosticWindow: { startLine: 1, endLine: 2 },
      sections: {
        node: {
          kind: "partial",
          reason: "Recovered syntax",
          data: { type: "identifier", text: "widget" },
          recovery: { file: "index.ts", errorRanges: [range] },
        },
        enclosingSymbol: { kind: "completed", data: { name: "widget", kind: "function" } },
        hover: { kind: "completed", data: "function widget(): void" },
        definition: {
          kind: "partial",
          reason: "Index warming",
          data: [{ file: "definition0.ts", line: 1, character: 17 }],
        },
        diagnostics: { kind: "completed", data: [] },
      },
      evidenceLists: [
        { shownCount: 1, totalCount: null, partialReason: "provider-limited" },
        { shownCount: 0, totalCount: 0, omittedCount: 0 },
      ],
      provenance: expect.arrayContaining([
        { source: "semantic", capability: "LSP" },
        { source: "structural", capability: "tree-sitter" },
      ]),
      nextQueries: expect.any(Array),
    });
    expect(result.content[0].text).toContain("widget");
    expect(JSON.stringify(result.structuredContent)).not.toMatch(
      /operationId|fileFingerprint|spanId/,
    );
  });
});
