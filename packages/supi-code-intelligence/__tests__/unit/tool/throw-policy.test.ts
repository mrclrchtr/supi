import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeFindTool } from "../../../src/tool/code_find/execute.ts";
import { executeGraphTool } from "../../../src/tool/code_graph/execute.ts";
import { executeRefactorApplyTool } from "../../../src/tool/code_refactor_apply/execute.ts";
import { executeRefactorPlanTool } from "../../../src/tool/code_refactor_plan/execute.ts";
import { executeResolveTool } from "../../../src/tool/code_resolve/execute.ts";
import { makeTestCtx } from "../../helpers/execute-action.ts";
import { clearMockRuntime } from "../../helpers/register-mock-runtime.ts";

describe("throw policy: whole-tool-unavailable throws, invalid usage returns text", () => {
  let tmpDir: string;

  beforeEach(() => {
    clearMockRuntime();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "ci-throw-policy-"));
    writeFileSync(path.join(tmpDir, "a.ts"), "export function foo() { return 1; }\n");
    writeFileSync(path.join(tmpDir, "image.png"), "not-an-image");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Whole-tool capability-unavailable → execute() throws ─────────────

  it("code_graph throws when no analysis provider is available", async () => {
    await expect(
      executeGraphTool({ target: { symbol: { query: "foo" } } }, makeTestCtx(tmpDir)),
    ).rejects.toThrow("No semantic/LSP provider is active");
  });

  it("code_resolve throws for query mode when no semantic provider is active", async () => {
    await expect(
      executeResolveTool({ target: { symbol: { query: "foo" } } }, makeTestCtx(tmpDir)),
    ).rejects.toThrow(/provider/i);
  });

  it("code_refactor_plan throws when no semantic provider is active", async () => {
    await expect(
      executeRefactorPlanTool(
        {
          target: { anchor: { file: "a.ts", line: 1, character: 1 } },
          operation: { rename_symbol: { newName: "bar" } },
        },
        makeTestCtx(tmpDir),
      ),
    ).rejects.toThrow(/provider/i);
  });

  // ── Self-correctable invalid usage → returns error text (no throw) ────

  it("code_resolve returns corrective invalid-input text for an unsupported file", async () => {
    const result = await executeResolveTool({ target: { file: "image.png" } }, makeTestCtx(tmpDir));

    expect(result.content).toContain("PI read or grep");
    expect(result.details).toMatchObject({
      type: "resolve",
      data: { resultKind: "invalid-input" },
    });
  });

  it("code_find returns text (not throw) for an empty query", async () => {
    const result = await executeFindTool({ query: "", mode: "semantic" }, makeTestCtx(tmpDir));
    expect(result.content).toContain("query must not be empty");
  });

  it("code_refactor_apply returns text (not throw) for a missing planId", async () => {
    const result = await executeRefactorApplyTool({ planId: "" }, makeTestCtx(tmpDir));
    expect(result.content).toContain("planId is required");
  });
});
