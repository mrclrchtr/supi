import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { executeFindTool } from "../../src/tool/execute-find.ts";
import { executeGraphTool } from "../../src/tool/execute-graph.ts";
import { emitToolProgress } from "../../src/tool/progress.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

/** Capture text progress beats from an onUpdate callback. */
function captureProgress(): { onUpdate: AgentToolUpdateCallback; beats: string[] } {
  const beats: string[] = [];
  const onUpdate: AgentToolUpdateCallback = (r) => {
    const block = r.content[0];
    if (block && "text" in block) beats.push(block.text);
  };
  return { onUpdate, beats };
}

describe("emitToolProgress", () => {
  it("is a no-op when onUpdate is undefined", () => {
    expect(() => emitToolProgress(undefined, "working...")).not.toThrow();
  });

  it("invokes onUpdate with a text content block and a progress details marker", () => {
    const calls: Array<{ content: Array<{ type: string; text: string }>; details: unknown }> = [];
    const onUpdate: AgentToolUpdateCallback = (r) =>
      calls.push(r as { content: Array<{ type: string; text: string }>; details: unknown });
    emitToolProgress(onUpdate, "working...");
    expect(calls).toHaveLength(1);
    expect(calls[0].content[0]).toMatchObject({ type: "text", text: "working..." });
    expect(calls[0].details).toMatchObject({ progress: "working..." });
  });
});

describe("executor onUpdate progress beats", () => {
  it("code_find emits coarse progress beats (real ripgrep)", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-progress-find-"));
    writeFileSync(path.join(dir, "a.ts"), "export function foo() { return 1; }\n");
    const { onUpdate, beats } = captureProgress();
    try {
      await executeFindTool({ query: "foo" }, { cwd: dir, onUpdate });
      expect(beats.length).toBeGreaterThanOrEqual(1);
      expect(beats.some((b) => b.includes("code_find"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('code_graph emits start + per-relation beats for relations:["all"] (mocked provider)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-progress-graph-"));
    writeFileSync(path.join(dir, "test.ts"), "export function foo() { return 1; }\n");
    registerMockProvider(dir, {
      references: async () => [
        {
          uri: `file://${path.join(dir, "test.ts")}`,
          range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } },
        },
      ],
    });
    const { onUpdate, beats } = captureProgress();
    try {
      await executeGraphTool(
        { file: "test.ts", line: 1, character: 17, relations: ["all"] },
        { cwd: dir, onUpdate },
      );
      expect(beats.length).toBeGreaterThanOrEqual(2);
      expect(beats.some((b) => b.includes("code_graph"))).toBe(true);
      // "all" expands to >1 relation, so per-relation beats fire.
      expect(beats.some((b) => b.includes("references"))).toBe(true);
    } finally {
      clearMockRuntime();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
