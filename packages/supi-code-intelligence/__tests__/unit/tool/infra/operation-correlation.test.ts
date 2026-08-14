import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  recordDebugEvent,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toWorkflowControl } from "../../../../src/tool/infra/workflow-control.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import type { CodeIntelligenceToolDefinitionSpec } from "../../../../src/tool/specs.ts";

const RAW_CALL_IDS = ["raw-public-call-alpha", "raw-public-call-beta"] as const;

function fakeSession() {
  return { setProjectTrusted() {} };
}

function fakeSpec(
  run: CodeIntelligenceToolDefinitionSpec["run"],
): CodeIntelligenceToolDefinitionSpec {
  return {
    name: "code_find",
    label: "Fake Find",
    parameters: Type.Object({}, { additionalProperties: false }),
    purpose: "test operation correlation",
    schemaDocs: "test schema",
    substrates: ["search"],
    nonGoals: ["not production"],
    run,
  };
}

function register(run: CodeIntelligenceToolDefinitionSpec["run"]) {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => fakeSession() as never, undefined, [
    fakeSpec(run),
  ]);
  return getTool(pi, "code_find") as {
    execute: (...args: unknown[]) => Promise<unknown>;
  };
}

function operationEvents() {
  return getDebugEvents({ source: "code-intelligence" }).events;
}

describe("public code operation correlation", () => {
  beforeEach(() => {
    resetDebugRegistry();
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
  });

  afterEach(() => resetDebugRegistry());

  it("uses one opaque ID across the public boundary and explicit workflow control", async () => {
    let controlOperationId: string | undefined;
    const tool = register((_params, ctx) => {
      controlOperationId = toWorkflowControl(ctx).operationId;
      recordDebugEvent({
        source: "code-intelligence",
        level: "debug",
        category: "workflow.outcome",
        message: "Workflow completed",
        operationId: controlOperationId,
        data: { outcome: "completed" },
      });
      return { content: "ok" };
    });

    await tool.execute(RAW_CALL_IDS[0], {}, undefined, undefined, makeCtx({ cwd: "/repo" }));

    const events = operationEvents();
    const ids = new Set(events.map((event) => event.operationId));
    expect(ids).toEqual(new Set([controlOperationId]));
    expect(controlOperationId).toMatch(/^op-[A-Za-z0-9_-]{22}$/);
    expect(
      events.map((event) => event.category).sort((left, right) => left.localeCompare(right)),
    ).toEqual([
      "code-operation.finish",
      "code-operation.start",
      "workflow.outcome",
      "workflow.timing",
    ]);
    expect(events.find((event) => event.category === "code-operation.finish")?.data).toEqual({
      tool: "code_find",
      outcome: "completed",
    });
    // Every production code-intelligence event carries the workspace root as
    // event-level cwd; the synthetic workflow.outcome fixture does not.
    const productionEvents = events.filter(
      (event) =>
        event.category.startsWith("code-operation.") || event.category === "workflow.timing",
    );
    expect(productionEvents.every((event) => event.cwd === "/repo")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(RAW_CALL_IDS[0]);
    expect(JSON.stringify(events)).not.toContain("query");
    expect(JSON.stringify(events)).not.toContain("file.ts");
  });

  it("supplies a bounded absolute deadline for every public tool call", async () => {
    let controlDeadline: number | undefined;
    const tool = register((_params, ctx) => {
      controlDeadline = toWorkflowControl(ctx).deadline;
      return { content: "ok" };
    });

    await tool.execute(RAW_CALL_IDS[0], {}, undefined, undefined, makeCtx({ cwd: "/repo" }));

    expect(typeof controlDeadline).toBe("number");
    const deadline = controlDeadline ?? 0;
    expect(deadline).toBeGreaterThan(Date.now());
    expect(deadline - Date.now()).toBeLessThan(120_000);
  });

  it("propagates the exact ID through semantic, AST, and Structural Worker producers", async () => {
    const tool = register(async (_params, ctx) => {
      const control = toWorkflowControl(ctx);
      const semantic = {
        workspaceSymbols: async (_query: string, requestControl?: { operationId?: string }) => {
          recordDebugEvent({
            operationId: requestControl?.operationId,
            source: "lsp",
            level: "debug",
            category: "request.timing",
            message: "LSP semantic request completed",
            data: { methodClass: "semantic", outcome: "completed" },
          });
          return completedCodeQuery([]);
        },
      };
      const structural = {
        outline: async (_file: string, requestControl?: { operationId?: string }) => {
          recordDebugEvent({
            operationId: requestControl?.operationId,
            source: "tree-sitter",
            level: "debug",
            category: "structural.parse.timing",
            message: "Tree-sitter parse completed",
            data: { outcome: "completed" },
          });
          return { kind: "success" as const, data: [] };
        },
      };
      await semantic.workspaceSymbols("query", control);
      await structural.outline("file.ts", control);
      recordDebugEvent({
        operationId: control.operationId,
        source: "code-intelligence",
        level: "debug",
        category: "ast-scan.timing",
        message: "AST scan completed",
        data: { complete: true },
      });
      return { content: "unchanged public result" };
    });

    const result = (await tool.execute(
      RAW_CALL_IDS[0],
      {},
      undefined,
      undefined,
      makeCtx({ cwd: "/repo" }),
    )) as { content: Array<{ text: string }> };
    const events = getDebugEvents().events;
    const operationId = events.find(
      (event) => event.category === "code-operation.start",
    )?.operationId;

    expect(result.content[0]?.text).toBe("unchanged public result");
    expect(JSON.stringify(events)).not.toContain("file.ts");
    expect(JSON.stringify(events)).not.toContain('"query"');
    expect(operationId).toBeDefined();
    expect(
      events
        .filter((event) =>
          ["request.timing", "ast-scan.timing", "structural.parse.timing"].includes(event.category),
        )
        .every((event) => event.operationId === operationId),
    ).toBe(true);
  });

  it("isolates concurrent calls and records failed and canceled outcomes", async () => {
    const waiting = new Map<string, () => void>();
    const entered: string[] = [];
    const tool = register(
      (_params, ctx) =>
        new Promise((resolve, reject) => {
          const operationId = toWorkflowControl(ctx).operationId as string;
          entered.push(operationId);
          waiting.set(operationId, () => {
            if (ctx.signal?.aborted) reject(ctx.signal.reason);
            else if (entered.length === 2) reject(new Error("controlled failure"));
            else resolve({ content: "ok" });
          });
        }),
    );
    const canceled = new AbortController();
    const first = tool.execute(
      RAW_CALL_IDS[0],
      {},
      canceled.signal,
      undefined,
      makeCtx({ cwd: "/repo" }),
    );
    const second = tool.execute(
      RAW_CALL_IDS[1],
      {},
      undefined,
      undefined,
      makeCtx({ cwd: "/repo" }),
    );
    await Promise.resolve();
    expect(entered).toHaveLength(2);
    expect(new Set(entered).size).toBe(2);

    canceled.abort(new DOMException("Stopped", "AbortError"));
    waiting.get(entered[0] as string)?.();
    waiting.get(entered[1] as string)?.();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toThrow("controlled failure");

    const finishes = operationEvents().filter(
      (event) => event.category === "code-operation.finish",
    );
    expect(finishes).toHaveLength(2);
    expect(
      finishes
        .map((event) => event.operationId)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual([...entered].sort((left, right) => left.localeCompare(right)));
    expect(
      finishes
        .map((event) => (event.data as { outcome: string }).outcome)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(["canceled", "failed"]);
    const retained = JSON.stringify(operationEvents());
    expect(retained).not.toContain(RAW_CALL_IDS[0]);
    expect(retained).not.toContain(RAW_CALL_IDS[1]);
    expect(retained).not.toContain("controlled failure");
  });
});
