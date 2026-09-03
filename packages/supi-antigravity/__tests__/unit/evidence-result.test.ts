import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashEvidence } from "../../src/process/event-values.ts";
import {
  classifyAnswerEvidence,
  isHttpUrl,
  isSafeWorkspacePath,
} from "../../src/tool/antigravity_run/evidence.ts";
import { renderAntigravityResult } from "../../src/tool/antigravity_run/render.ts";
import {
  buildAntigravityResult,
  MAX_RESULT_BYTES,
  MAX_RESULT_LINES,
} from "../../src/tool/antigravity_run/result.ts";
import type { AntigravityExecutionFacts, ConversationHandleRecord } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

function makeFacts(answer: AntigravityExecutionFacts["answer"]): AntigravityExecutionFacts {
  return {
    answer,
    conversationId: "raw-1",
    observedToolNames: ["search_web", "read_file"],
    observedToolCounts: { search_web: 1, read_file: 1 },
    successfulToolNames: ["search_web", "read_file"],
    permissionDenials: 0,
    observedSourceHashes: [hashEvidence("https://example.com/docs")],
    observedWorkspacePathHashes: [hashEvidence("src/index.ts")],
  };
}

const handle: ConversationHandleRecord = {
  handle: "agy_test",
  rawAntigravityId: "raw-1",
  model: "gemini-3.8-flash-low",
  canonicalWorkingDirectory: "/tmp/workspace",
  workspaceAccess: true,
  cliVersion: "1.1.25",
  status: "active",
};

describe("Antigravity evidence and results", () => {
  it("accepts HTTP sources, keeps safe workspace paths, and splits observed from claimed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "supi-antigravity-evidence-"));
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "index.ts"), "export {};");
    const answer = {
      answer: "answer",
      sources: [
        { title: "Observed", url: "https://example.com/docs" },
        { title: "Claimed", url: "http://example.com/other" },
        { title: "Invalid", url: "file:///secret" },
      ],
      workspaceEvidence: [
        { path: "src/index.ts", summary: "observed" },
        { path: "../outside.ts", summary: "unsafe" },
      ],
    };
    try {
      const result = classifyAnswerEvidence(answer, makeFacts(answer), workspace);
      expect(result.observedSources).toHaveLength(1);
      expect(result.claimedSources).toHaveLength(1);
      expect(result.observedWorkspaceEvidence).toHaveLength(1);
      expect(result.warnings).toHaveLength(2);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects local URLs, absolute paths, and symlink escapes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "supi-antigravity-path-"));
    const outside = await mkdtemp(join(tmpdir(), "supi-antigravity-outside-"));
    try {
      await symlink(outside, join(workspace, "link"));
      expect(isHttpUrl("file:///tmp/a")).toBe(false);
      expect(isSafeWorkspacePath("/tmp/a", workspace)).toBe(false);
      expect(isSafeWorkspacePath("link/secret.txt", workspace)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("keeps the complete model-visible result within PI bounds", () => {
    const longAnswer = `${"line\n".repeat(MAX_RESULT_LINES + 100)}${"x".repeat(MAX_RESULT_BYTES)}`;
    const answer = {
      answer: longAnswer,
      sources: [],
      workspaceEvidence: [],
    };
    const result = buildAntigravityResult({ facts: makeFacts(answer), handle, durationMs: 12 });
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(text.split("\n").length).toBeLessThanOrEqual(MAX_RESULT_LINES);
    expect(text).toContain("truncated");
    expect((result.details as { answer?: unknown }).answer).toBeUndefined();
  });

  it("does not throw when render details are absent or malformed", () => {
    expect(() =>
      renderAntigravityResult(
        { content: [{ type: "text", text: "failed" }] },
        { expanded: false, isPartial: false },
        theme,
      ),
    ).not.toThrow();
    expect(() =>
      renderAntigravityResult(
        { details: { warnings: [null] } },
        { expanded: true, isPartial: false },
        theme,
      ),
    ).not.toThrow();
  });
});
