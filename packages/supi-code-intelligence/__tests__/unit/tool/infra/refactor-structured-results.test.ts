import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;
const original = `export function widget() {}\n${"widget();\n".repeat(6)}`;
const input = {
  target: { anchor: { file: "index.ts", line: 1, character: 17 } },
  operation: { rename_symbol: { newName: "gadget" } },
};
interface Tool {
  outputSchema: TSchema;
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
    details: { data: { changedFiles?: string[] } };
  }>;
}
function tools() {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
  return {
    plan: getTool(pi, "code_refactor_plan") as unknown as Tool,
    apply: getTool(pi, "code_refactor_apply") as unknown as Tool,
  };
}
async function call(tool: Tool, args: unknown, signal?: AbortSignal) {
  const result = await tool.execute("call", args, signal, undefined, makeCtx({ cwd }));
  const json = JSON.parse(JSON.stringify(result.structuredContent));
  expect(json).toEqual(result.structuredContent);
  expect(Value.Check(tool.outputSchema, json)).toBe(true);
  return result;
}
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "refactor-structured-"));
  writeFileSync(join(cwd, "index.ts"), original);
});
afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

describe("registered refactor structured results", () => {
  it("returns every exact edit independently of the preview and applies the stored plan", async () => {
    const file = join(cwd, "index.ts");
    const otherFile = join(cwd, "other.ts");
    writeFileSync(otherFile, "widget();\n");
    const edits = [
      ...Array.from({ length: 6 }, (_, i) => ({
        file,
        range: { start: { line: i + 1, character: 0 }, end: { line: i + 1, character: 6 } },
        newText: `gadget${i}`,
      })),
      {
        file: otherFile,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        newText: "other",
      },
    ];
    registerMockProvider(cwd, {
      refactor: async () => ({ kind: "precise", edits: { edits }, authorizedMutationRoots: [cwd] }),
    });
    const { plan, apply } = tools();
    const planned = await call(plan, input);
    expect(planned.structuredContent).toMatchObject({
      kind: "completed",
      operation: "rename_symbol",
      target: { file: "index.ts", line: 1, character: 17 },
      editCount: 7,
      fileCount: 2,
      provenance: "semantic",
      nextAction: { tool: "code_refactor_apply" },
      edits: edits.map((edit) => ({ ...edit, file: edit.file === file ? "index.ts" : "other.ts" })),
    });
    expect(planned.content[0].text).toContain("**Shown edits:** 5");
    expect(planned.content[0].text).not.toContain("gadget5");
    expect(JSON.stringify(planned.structuredContent)).not.toMatch(
      /fingerprint|precondition|authority|authorizedMutationRoots|createdAt|operationId/i,
    );
    expect(readFileSync(file, "utf8")).toBe(original);
    const invalid = structuredClone(planned.structuredContent);
    delete invalid.edits;
    expect(Value.Check(plan.outputSchema, invalid)).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(
      call(apply, { planId: planned.structuredContent.planId }, controller.signal),
    ).rejects.toThrow();
    expect(readFileSync(file, "utf8")).toBe(original);
    const applied = await call(apply, { planId: planned.structuredContent.planId });
    expect(applied.structuredContent).toMatchObject({
      kind: "applied",
      files: [
        { file: "index.ts", editCount: 6 },
        { file: "other.ts", editCount: 1 },
      ],
      fileCount: 2,
      editCount: 7,
    });
    expect(applied.details.data.changedFiles).toEqual([file, otherFile]);
    expect(readFileSync(file, "utf8")).toContain("gadget5();");
    expect(readFileSync(otherFile, "utf8")).toBe("other();\n");
    const reused = await call(apply, { planId: planned.structuredContent.planId });
    expect(reused.structuredContent).toMatchObject({
      kind: "invalid-input",
      message: expect.any(String),
    });
  });
  it("returns typed ambiguity and corrective invalid-input results", async () => {
    registerMockProvider(cwd, {
      refactor: async () => ({
        kind: "ambiguous",
        candidates: [
          { description: "choice", file: join(cwd, "index.ts"), line: 1, character: 17 },
        ],
      }),
    });
    const { plan, apply } = tools();
    expect((await call(plan, input)).structuredContent).toMatchObject({
      kind: "ambiguous",
      candidates: [{ description: "choice", file: "index.ts", line: 1, character: 17 }],
    });
    expect(
      (await call(plan, { target: { handle: "bad" }, operation: input.operation }))
        .structuredContent,
    ).toMatchObject({ kind: "invalid-input", message: expect.any(String) });
    expect((await call(apply, { planId: "missing" })).structuredContent).toMatchObject({
      kind: "invalid-input",
      message: expect.any(String),
    });
  });
  it("keeps freshness failures and capability failures distinct", async () => {
    const file = join(cwd, "index.ts");
    registerMockProvider(cwd, {
      refactor: async () => ({
        kind: "precise",
        edits: {
          edits: [
            {
              file,
              range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
              newText: "gadget",
            },
          ],
        },
        authorizedMutationRoots: [cwd],
      }),
    });
    const { plan, apply } = tools();
    const planned = await call(plan, input);
    writeFileSync(file, `${original}// changed\n`);
    expect(
      (await call(apply, { planId: planned.structuredContent.planId })).structuredContent,
    ).toMatchObject({ kind: "invalid-input", message: expect.any(String) });
    expect(readFileSync(file, "utf8")).toBe(`${original}// changed\n`);
    registerMockProvider(cwd, {
      refactor: async () => ({ kind: "unavailable", reason: "provider unavailable" }),
    });
    await expect(call(plan, input)).rejects.toThrow("provider unavailable");
    const controller = new AbortController();
    controller.abort();
    await expect(call(plan, input, controller.signal)).rejects.toThrow();
  });
});
