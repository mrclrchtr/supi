import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashEvidence } from "../../src/evidence-hash.ts";
import {
  classifyAnswerEvidence,
  isHttpUrl,
  isSafeWorkspacePath,
} from "../../src/tool/consulting_run/evidence.ts";
import { renderConsultingResult } from "../../src/tool/consulting_run/render.ts";
import {
  buildConsultationResult,
  MAX_RESULT_BYTES,
  MAX_RESULT_LINES,
} from "../../src/tool/consulting_run/result.ts";
import type { ConsultationExecutionFacts, ConversationHandleRecord } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

function makeFacts(answer: ConsultationExecutionFacts["answer"]): ConsultationExecutionFacts {
  return {
    answer,
    continuation: "opaque-state",
    usage: { inputTokens: 4, outputTokens: 6 },
    observedActivities: ["web", "workspace"],
    activityCounts: { web: 1, workspace: 1, other: 0 },
    webUsed: true,
    workspaceUsed: true,
    permissionDenials: 0,
    observedSourceHashes: [hashEvidence("https://example.com/docs")],
    observedWorkspacePathHashes: [hashEvidence("src/index.ts")],
    warnings: [],
  };
}

const handle: ConversationHandleRecord = {
  handle: "consult_test",
  agent: "antigravity",
  model: "agent-model-v2",
  continuation: "opaque-state",
  canonicalWorkingDirectory: "/tmp/workspace",
  workspaceAccess: true,
  agentVersion: "agent-4",
  status: "active",
};

describe("Consultation evidence and results", () => {
  it("accepts HTTP sources, keeps safe workspace paths, and splits observed from claimed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "supi-consulting-evidence-"));
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
    const workspace = await mkdtemp(join(tmpdir(), "supi-consulting-path-"));
    const outside = await mkdtemp(join(tmpdir(), "supi-consulting-outside-"));
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

  it("keeps model-visible output within PI limits and excludes continuation details", () => {
    const longAnswer = `${"line\n".repeat(MAX_RESULT_LINES + 100)}${"x".repeat(MAX_RESULT_BYTES)}`;
    const answer = { answer: longAnswer, sources: [], workspaceEvidence: [] };
    const result = buildConsultationResult({ facts: makeFacts(answer), handle, durationMs: 12 });
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(text.split("\n").length).toBeLessThanOrEqual(MAX_RESULT_LINES);
    expect(text).toContain("truncated");
    expect(text).not.toContain("opaque-state");
    expect((result.details as { continuation: string }).continuation).toBe("opaque-state");
    expect(result.usage).toMatchObject({ input: 4, output: 6, totalTokens: 10 });
  });

  it("does not throw when render details are absent or malformed", () => {
    expect(() =>
      renderConsultingResult(
        { content: [{ type: "text", text: "failed" }] },
        { expanded: false, isPartial: false },
        theme,
      ),
    ).not.toThrow();
    expect(() =>
      renderConsultingResult(
        { details: { warnings: [null] } },
        { expanded: true, isPartial: false },
        theme,
      ),
    ).not.toThrow();
  });
});
