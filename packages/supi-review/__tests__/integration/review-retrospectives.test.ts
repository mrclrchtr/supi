import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  getCurrentTools,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  subscribeDebugPersistence,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, expect, it, vi } from "vitest";
import { runReview } from "../../src/tool/review_run/workflow.ts";

const model: Model<"openai-completions"> = {
  id: "retro-reviewer",
  name: "Retrospective reviewer",
  provider: "retro-test",
  api: "openai-completions",
  baseUrl: "https://unused.example",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 2_000,
};
const usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
let cwd: string;
let detach: (() => void) | undefined;
const registry = new AgentRunRegistry();
afterEach(async () => {
  await registry.clear();
  detach?.();
  configureDebugRegistry({ enabled: false, agentRunRetrospectivesEnabled: false });
  vi.unstubAllEnvs();
  if (cwd) await rm(cwd, { recursive: true, force: true });
});

it("returns a Review and task-only audit while its tool-free retrospective remains registry-owned", async () => {
  cwd = await mkdtemp(join(tmpdir(), "supi-review-retro-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(cwd, "agent"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "core.hooksPath", "/dev/null");
  git("config", "commit.gpgsign", "false");
  await writeFile(join(cwd, "source.ts"), "export const source = 1;\n");
  git("add", "source.ts");
  git("commit", "-m", "base");
  registry.openSession();
  configureDebugRegistry({ enabled: true, agentRunRetrospectivesEnabled: true });
  detach = subscribeDebugPersistence(vi.fn());
  let releaseRetrospective: (() => void) | undefined;
  const send = (
    content: AssistantMessage["content"],
    stopReason: AssistantMessage["stopReason"],
  ): AssistantMessage => ({
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    timestamp: Date.now(),
  });
  let requests = 0;
  const provider: Provider = {
    id: model.provider,
    name: "Test",
    auth: { apiKey: { name: "Test", resolve: async () => ({ auth: { apiKey: "test" } }) } },
    getModels: () => [model],
    stream: () => createAssistantMessageEventStream(),
    streamSimple: (_model, context) => {
      requests++;
      const stream = createAssistantMessageEventStream();
      if (requests === 1) {
        const message = send(
          [
            {
              type: "toolCall",
              id: "submission",
              name: "submit_review",
              arguments: {
                summary: "Review complete",
                findings: [],
                criteriaCoverage: { status: "complete" },
              },
            },
          ],
          "toolUse",
        );
        queueMicrotask(() => stream.push({ type: "done", reason: "toolUse", message }));
      } else {
        expect(getCurrentTools(context.messages)).toHaveLength(0);
        releaseRetrospective = () =>
          stream.push({
            type: "done",
            reason: "stop",
            message: send(
              [{ type: "text", text: "Observed: the task needed no further context." }],
              "stop",
            ),
          });
      }
      return stream;
    },
  };
  const createAudit = vi.fn(async () => ({ artifactId: "review-audit-test", expiresAt: "later" }));
  const result = await runReview({
    cwd,
    target: {},
    review: { tasks: [{ id: "state", mode: "state", instructions: "Inspect the source." }] },
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
    registry,
    auditStore: { create: createAudit } as never,
  });

  expect(result).toMatchObject({
    kind: "completed",
    usage: { totalTokens: 15 },
    details: { results: [{ status: "completed" }] },
  });
  await vi.waitFor(() => expect(releaseRetrospective).toBeDefined());
  expect(registry.hasActive()).toBe(true);
  const workspace = registry.snapshot().runs[0]?.cwd;
  expect(workspace && existsSync(workspace)).toBe(false);
  expect(createAudit).toHaveBeenCalledOnce();
  expect(JSON.stringify(createAudit.mock.calls)).not.toContain("Reflect briefly");
  releaseRetrospective?.();
  await vi.waitFor(() => expect(registry.hasActive()).toBe(false));
  expect(requests).toBe(2);
  expect(
    getDebugEvents({ category: "agent-run-retrospective", source: "supi-review" }).events[0]?.data,
  ).toMatchObject({
    status: "completed",
    text: "Observed: the task needed no further context.",
    usage: { total: 15 },
  });
}, 20_000);
