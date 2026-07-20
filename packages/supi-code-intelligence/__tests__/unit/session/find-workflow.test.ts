import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import type { FindWorkflowOutcome } from "../../../src/session/find-types.ts";
import { runFindWorkflow } from "../../../src/session/find-workflow.ts";
import { renderFindResult } from "../../../src/tool/find/render.ts";
import { assembleFindWorkflowResult } from "../../../src/tool/result/find.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "find-workflow-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function deps() {
  return { cwd: tmpDir, capability: new TestCapabilityAdapter({}) };
}

describe("runFindWorkflow", () => {
  it("collects all ripgrep matches before result assembly applies maxResults", async () => {
    const source = Array.from({ length: 100 }, (_, index) => `const needle${index} = 1;`).join(
      "\n",
    );
    writeFileSync(path.join(tmpDir, "matches.ts"), source);

    const outcome = await runFindWorkflow({ query: "needle", maxResults: 7 }, deps());

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed" || outcome.data.kind !== "text") return;
    expect(outcome.data.matches).toHaveLength(100);

    const assembly = assembleFindWorkflowResult(outcome);
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "find.textMatches",
      totalCount: 100,
      shownCount: 7,
      omittedCount: 93,
      partialReason: null,
    });
    expect(renderFindResult(assembly)).toContain("_(showing 7 of 100; 93 omitted)_");
  });

  it("marks timed-out ripgrep output as partial in details and Markdown", () => {
    const outcome: Extract<FindWorkflowOutcome, { kind: "completed" }> = {
      kind: "completed",
      query: "needle",
      mode: "text",
      scopeLabel: ".",
      maxResults: 8,
      data: {
        kind: "text",
        matches: [{ file: "src/a.ts", line: 1, text: "const needle = 1;" }],
        partialReason: "timeout",
      },
    };

    const assembly = assembleFindWorkflowResult(outcome);

    expect(assembly.details.evidenceLists).toContainEqual({
      key: "find.textMatches",
      totalCount: null,
      shownCount: 1,
      omittedCount: null,
      partialReason: "timeout",
    });
    expect(renderFindResult(assembly)).toContain("_(showing 1; more may exist — timeout)_");
  });

  it("returns invalid-input instead of throwing for a non-string query", async () => {
    const outcome = await runFindWorkflow({ query: 42 } as never, deps());

    expect(outcome).toEqual({ kind: "invalid-input", message: "query must be a string." });
  });

  it("rejects an unknown mode instead of silently performing a text search", async () => {
    const outcome = await runFindWorkflow({ query: "needle", mode: "not-a-mode" } as never, deps());

    expect(outcome).toEqual({
      kind: "invalid-input",
      message: "mode must be one of text, regex, ast, or semantic.",
    });
  });

  it("rejects the removed test AST kind before structural execution", async () => {
    const outcome = await runFindWorkflow(
      { query: "registerCodeIntelligenceTools", mode: "ast", kind: "test" } as never,
      deps(),
    );

    expect(outcome).toEqual({ kind: "invalid-input", message: "Unsupported AST kind." });
  });
});
