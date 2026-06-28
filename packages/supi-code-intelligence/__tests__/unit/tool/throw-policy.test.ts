import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeFindTool } from "../../../src/tool/find/execute.ts";
import { executeGraphTool } from "../../../src/tool/graph/execute.ts";
import { executeRefactorApplyTool } from "../../../src/tool/refactor-apply/execute.ts";
import { executeRefactorPlanTool } from "../../../src/tool/refactor-plan/execute.ts";
import { executeResolveTool } from "../../../src/tool/resolve/execute.ts";
import { makeTestCtx } from "../../helpers/execute-action.ts";
import { clearMockRuntime } from "../../helpers/register-mock-runtime.ts";

describe("throw policy: whole-tool-unavailable throws, invalid usage returns text", () => {
  let tmpDir: string;

  beforeEach(() => {
    clearMockRuntime();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "ci-throw-policy-"));
    writeFileSync(path.join(tmpDir, "a.ts"), "export function foo() { return 1; }\n");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Whole-tool capability-unavailable → execute() throws ─────────────

  it("code_graph throws when no analysis provider is available", async () => {
    await expect(executeGraphTool({ symbol: "foo" }, makeTestCtx(tmpDir))).rejects.toThrow(
      "No analysis provider is available",
    );
  });

  it("code_resolve throws for query mode when no semantic provider is active", async () => {
    await expect(executeResolveTool({ query: "foo" }, makeTestCtx(tmpDir))).rejects.toThrow(
      /provider/i,
    );
  });

  it("code_refactor_plan throws when no semantic provider is active", async () => {
    await expect(
      executeRefactorPlanTool(
        { operation: "rename_symbol", file: "a.ts", line: 1, character: 1, newName: "bar" },
        makeTestCtx(tmpDir),
      ),
    ).rejects.toThrow(/provider/i);
  });

  // ── Self-correctable invalid usage → returns error text (no throw) ────

  it("code_graph returns text (not throw) for a missing target", async () => {
    const result = await executeGraphTool({}, makeTestCtx(tmpDir));
    expect(result.content).toContain("At least one of");
  });

  it("code_find returns text (not throw) for an empty query", async () => {
    const result = await executeFindTool({ query: "" }, makeTestCtx(tmpDir));
    expect(result.content).toContain("requires a non-empty");
  });

  it("code_refactor_apply returns text (not throw) for a missing planId", async () => {
    const result = await executeRefactorApplyTool({ planId: "" }, makeTestCtx(tmpDir));
    expect(result.content).toContain("`planId` is required");
  });
});
