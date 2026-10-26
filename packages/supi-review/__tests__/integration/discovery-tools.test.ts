import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  getCurrentTools,
  type Model,
  type Provider,
  type ToolCall,
} from "@earendil-works/pi-ai";
import { afterEach, expect, it, vi } from "vitest";
import { runReview } from "../../src/tool/review_run/workflow.ts";

const model: Model<"openai-completions"> = {
  id: "discovery-reviewer",
  name: "Discovery reviewer",
  provider: "discovery-test",
  api: "openai-completions",
  baseUrl: "https://unused.example",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 2_000,
};
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.each([false, true])(
  "executes Reviewer discovery tools in the frozen workspace with codemode=%s",
  async (reviewerCodemodeEnabled) => {
    const cwd = await mkdtemp(join(tmpdir(), "supi-review-discovery-"));
    roots.push(cwd);
    vi.stubEnv("PI_CODING_AGENT_DIR", join(cwd, "agent"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    git("init", "--quiet");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "core.hooksPath", "/dev/null");
    git("config", "commit.gpgsign", "false");
    await writeFile(join(cwd, "references.md"), "# References\nlegacy/settings\n");
    await writeFile(join(cwd, "migration.sql"), "-- Migration\nselect discovery_marker();\n");
    git("add", "references.md", "migration.sql");
    git("commit", "--quiet", "-m", "base");

    const calls: Pick<ToolCall, "name" | "arguments">[] = [
      { name: "grep", arguments: { pattern: "legacy/settings", literal: true, glob: "*.md" } },
      { name: "find", arguments: { pattern: "*.sql" } },
      { name: "ls", arguments: { path: "." } },
    ];
    if (reviewerCodemodeEnabled) {
      calls.push({
        name: "codemode",
        arguments: {
          code: `return JSON.stringify({
  matches: await tools.grep({ pattern: "discovery_marker", literal: true, glob: "*.sql" }),
  files: await tools.find({ pattern: "*.md" }),
  entries: await tools.ls({ path: "." }),
  submissionExposed: ALL_TOOLS.some((tool) => tool.name === "submit_review"),
  recoveryExposed: ALL_TOOLS.some((tool) => tool.name === "decline_review_recovery")
});`,
        },
      });
    }
    calls.push({
      name: "submit_review",
      arguments: {
        summary: "Discovery verified",
        findings: [],
        criteriaCoverage: { status: "complete" },
      },
    });
    const results = new Map<string, { text: string; isError: boolean }>();
    let requests = 0;
    const provider: Provider = {
      id: model.provider,
      name: "Discovery Test Provider",
      auth: { apiKey: { name: "Test", resolve: async () => ({ auth: { apiKey: "test" } }) } },
      getModels: () => [model],
      stream: () => createAssistantMessageEventStream(),
      streamSimple: (_model, context) => {
        const tools = getCurrentTools(context.messages).map((tool) => tool.name);
        expect(tools).toEqual(expect.arrayContaining(["grep", "find", "ls", "submit_review"]));
        expect(tools.includes("codemode")).toBe(reviewerCodemodeEnabled);
        for (const message of context.messages) {
          if (message.role === "toolResult") {
            results.set(message.toolCallId, {
              text: message.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n"),
              isError: message.isError,
            });
          }
        }
        const index = requests++;
        const call = calls[index];
        if (!call) throw new Error("Unexpected Reviewer request after submission.");
        const message: AssistantMessage = {
          role: "assistant",
          content: [{ type: "toolCall", id: `discovery-${index}`, ...call }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        const stream = createAssistantMessageEventStream();
        queueMicrotask(() => stream.push({ type: "done", reason: "toolUse", message }));
        return stream;
      },
    };
    const result = await runReview({
      cwd,
      target: {},
      review: { tasks: [{ id: "discovery", mode: "state", instructions: "Inspect the files." }] },
      reviewerModel: {
        canonicalId: `${model.provider}/${model.id}`,
        model,
        provider: model.provider,
        id: model.id,
        label: model.name,
        isCurrent: true,
      },
      providerAuthority: {
        getProvider: () => provider,
        getProviderAuth: async () => ({ auth: { apiKey: "test" } }),
      },
      reviewerCodemodeEnabled,
    });

    expect(result).toMatchObject({
      kind: "completed",
      details: { results: [{ status: "completed" }] },
    });
    expect(results.size).toBe(calls.length - 1);
    expect([...results.values()].every((entry) => !entry.isError)).toBe(true);
    expect(results.get("discovery-0")?.text).toContain("references.md:2:");
    expect(results.get("discovery-0")?.text).toContain("legacy/settings");
    expect(results.get("discovery-1")?.text).toContain("migration.sql");
    expect(results.get("discovery-2")?.text).toContain("references.md");
    expect(results.get("discovery-2")?.text).toContain("migration.sql");
    if (reviewerCodemodeEnabled) {
      expect(results.get("discovery-3")?.text).toContain("migration.sql:2:");
      expect(results.get("discovery-3")?.text).toContain("discovery_marker");
      expect(results.get("discovery-3")?.text).toContain("references.md");
      expect(results.get("discovery-3")?.text).toContain('"submissionExposed":false');
      expect(results.get("discovery-3")?.text).toContain('"recoveryExposed":false');
    }
  },
  20_000,
);
