import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getTool } from "@mrclrchtr/supi-test-utils";
import { type BackgroundHarness, backgroundHarness } from "@mrclrchtr/supi-test-utils/background";
import { afterEach, describe, expect, it, vi } from "vitest";
import reviewExtension from "../../src/review.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

vi.setConfig({ testTimeout: 30_000 });

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Linked worktrees besides the main checkout: Review Workspaces that still exist in Git. */
function reviewWorktrees(cwd: string): string[] {
  return git(cwd, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .slice(1);
}

/** Initialize the parent directory as a Git repository with an uncommitted change. */
function prepareRepository(cwd: string, review: Record<string, unknown> = {}): void {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  // The harness keeps its agent directory, home, and Pi project config inside the repository.
  writeFileSync(join(cwd, ".gitignore"), "agent/\nhome/\n.pi/\n");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
  writeFileSync(join(cwd, "tracked.txt"), "frozen\n");
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      review: {
        agentModel: "current",
        recoveryModel: "disabled",
        reviewerCodemodeEnabled: false,
        reviewerWebEnabled: false,
        auditEnabled: false,
        bootstrapCommand: "",
        postReviewPolicy: "verify",
        ...review,
      },
    }),
  );
}

const task = (id: string, mode: "change" | "state" = "change") => ({
  id,
  mode,
  instructions: `Review ${id} carefully.`,
});

const finding = {
  title: "Frozen value is wrong",
  description: "tracked.txt should not say frozen.",
  blocksAcceptance: true,
  impact: "medium",
  effort: "small",
  confidence: 0.8,
};

const theme = {
  fg: (_color: string, value: string) => value,
  bg: (_color: string, value: string) => value,
  bold: (value: string) => value,
  italic: (value: string) => value,
} as unknown as Theme;

interface RegisteredRenderer {
  renderResult(
    result: unknown,
    options: { expanded: boolean; isPartial: boolean },
    theme: Theme,
  ): { render(width: number): string[] };
}

let harness: BackgroundHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function reviewHarness(review: Record<string, unknown> = {}): Promise<BackgroundHarness> {
  harness = await backgroundHarness({
    sdk,
    extension: reviewExtension,
    childPrompt: (id) => `Review ${id} carefully.`,
    prepare: ({ directory }) => prepareRepository(directory, review),
  });
  return harness;
}

/** The SDK inputs of one controlled Reviewer Session. */
function reviewerInputs(current: BackgroundHarness, id: string) {
  const child = current.child(id);
  const call = sdk.createAgentSession.mock.calls.find(
    ([inputs]) => inputs.sessionManager === child.session.sessionManager,
  );
  if (!call) throw new Error(`Missing SDK inputs for ${id}.`);
  return { child, inputs: call[0] as { cwd: string; customTools: ToolDefinition[] } };
}

/** Submit a structured review through the child's real submit tool, then end its prompt. */
async function submitReview(current: BackgroundHarness, id: string, findings: unknown[] = []) {
  const { child, inputs } = reviewerInputs(current, id);
  const submit = inputs.customTools.find((tool) => tool.name === "submit_review");
  if (!submit) throw new Error("Missing submit_review.");
  await submit.execute(
    "submit",
    { summary: `Reviewed ${id}.`, findings, criteriaCoverage: { status: "complete" } } as never,
    undefined,
    undefined,
    undefined as never,
  );
  child.finish(`Submitted ${id}.`);
}

async function waitForReviewers(current: BackgroundHarness, count: number) {
  await vi.waitFor(() =>
    expect(current.children.filter((child) => child.session.isStreaming)).toHaveLength(count),
  );
}

const text = (result: { content: { type: string; text?: string }[] }) =>
  result.content.map((part) => part.text ?? "").join("\n");

describe("Background Review through registered tools", () => {
  it("returns a start handle before Reviewers finish and collects the report once", async () => {
    const current = await reviewHarness();
    const cwd = current.ctx.cwd;
    const started = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("alpha"), task("beta")],
    });
    expect(started.usage).toBeUndefined();
    expect(started.details).toMatchObject({
      mode: "background",
      batchId: expect.any(String),
      tasks: [
        { taskId: "alpha", mode: "change", status: "running" },
        { taskId: "beta", mode: "change", status: "running" },
      ],
      workspaceReceipt: { status: "verified", changedPathCount: 1 },
    });
    expect(text(started)).toContain("agent_result");
    expect(text(started)).not.toContain("Post-Review Policy");
    const batchId = (started.details as { batchId: string }).batchId;

    // An edit after the start returns stays out of the frozen Review Workspace.
    writeFileSync(join(cwd, "tracked.txt"), "edited after start\n");
    await waitForReviewers(current, 2);
    const { inputs } = reviewerInputs(current, "alpha");
    expect(readFileSync(join(inputs.cwd, "tracked.txt"), "utf8")).toBe("frozen\n");
    expect(reviewWorktrees(cwd)).toHaveLength(1);

    await submitReview(current, "alpha", [finding]);
    await vi.waitFor(() =>
      expect(current.children.filter((child) => child.session.isStreaming)).toHaveLength(1),
    );
    // One Completion Notice only after the last Review Task is terminal.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(current.pi.messages).toHaveLength(0);

    await submitReview(current, "beta");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
    const notice = current.pi.messages[0] as { content: string; details: unknown };
    expect(notice.content).toContain(batchId);
    expect(notice.content).not.toContain("Frozen value is wrong");
    expect(notice.content).not.toMatch(/token|usage|cost/i);
    expect(notice.details).toMatchObject({ batchId, taskIds: ["alpha", "beta"] });
    // The Review Workspace is gone before collection.
    expect(reviewWorktrees(cwd)).toHaveLength(0);

    const collected = await current.invoke("agent_result", { batchId });
    const report = text(collected);
    expect(report).toContain("## alpha");
    expect(report).toContain("Verdict: ISSUES");
    expect(report).toContain("## beta");
    expect(report).toContain("Verdict: PASS");
    expect(report).toContain("Frozen value is wrong");
    expect(report).toContain("Workspace receipt: verified");
    expect(report).toContain("live checkout may differ");
    expect(report).toContain("The configured Post-Review Policy is `verify`");
    expect(collected.usage?.totalTokens).toBe(30);
    expect(collected.details).toMatchObject({
      batchId,
      tasks: [{ taskId: "alpha" }, { taskId: "beta" }],
    });

    // Stored start, notice, and collection render through their registered renderers.
    const options = { expanded: true, isPartial: false };
    const render = (component: { render(width: number): string[] }) =>
      component.render(120).join("\n");
    const reviewRun = getTool(current.pi, "review_run") as unknown as RegisteredRenderer;
    expect(render(reviewRun.renderResult(started, options, theme))).toContain(batchId);
    const agentResult = getTool(current.pi, "agent_result") as unknown as RegisteredRenderer;
    expect(render(agentResult.renderResult(collected, options, theme))).toContain("alpha");

    const repeated = await current.invoke("agent_result", { batchId });
    expect(repeated.usage).toBeUndefined();
    expect(text(repeated)).toContain("## alpha");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
  });

  it("keeps a Foreground Review awaited when mode is foreground", async () => {
    const current = await reviewHarness();
    let returned = false;
    const running = current
      .invoke("review_run", { mode: "foreground", tasks: [task("alpha")] })
      .then((result) => {
        returned = true;
        return result;
      });
    await waitForReviewers(current, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(returned).toBe(false);
    await submitReview(current, "alpha", [finding]);
    const result = await running;
    expect(text(result)).toContain("Verdict: ISSUES");
    expect(text(result)).toContain("The configured Post-Review Policy is `verify`");
    expect(text(result)).not.toContain("live checkout may differ");
    expect(result.usage?.totalTokens).toBe(15);
    expect(current.pi.messages).toHaveLength(0);
  });

  it.each([
    {
      name: "invalid input",
      review: {},
      params: { mode: "background", tasks: [] },
      error: "Invalid review execution input.",
    },
    {
      name: "an unresolvable target",
      review: {},
      params: {
        mode: "background",
        target: { committed: { from: "missing", to: "HEAD" } },
        tasks: [task("alpha")],
      },
      error: "Review Target from does not resolve",
    },
    {
      name: "a failed Dependency Bootstrap",
      review: { bootstrapCommand: "exit 3" },
      params: { mode: "background", tasks: [task("alpha")] },
      error: "Configured Dependency Bootstrap failed.",
    },
  ])("fails the call for $name and leaves no batch or Review Workspace", async (example) => {
    const current = await reviewHarness(example.review);
    await expect(current.invoke("review_run", example.params)).rejects.toThrow(example.error);
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(0);
    expect(current.children).toHaveLength(0);
    expect(sdk.createAgentSession).not.toHaveBeenCalled();
  });

  it("rejects a background start whose launch is not on the active branch", async () => {
    const current = await reviewHarness();
    const tool = getTool(current.pi, "review_run") as unknown as {
      execute: (...args: unknown[]) => Promise<unknown>;
    };
    await expect(
      tool.execute(
        "unlaunched",
        { mode: "background", tasks: [task("alpha")] },
        undefined,
        undefined,
        current.ctx,
      ),
    ).rejects.toThrow("The background launch is not on the active branch.");
    expect(reviewWorktrees(current.ctx.cwd)).toHaveLength(0);
    expect(current.children).toHaveLength(0);
  });

  it("records Local Reviewer Replays as a Foreground Review does", async () => {
    const current = await reviewHarness({ auditEnabled: true });
    const started = await current.invoke("review_run", {
      mode: "background",
      tasks: [task("alpha")],
    });
    await waitForReviewers(current, 1);
    await submitReview(current, "alpha");
    await vi.waitFor(() => expect(current.pi.messages).toHaveLength(1));
    const audits = readdirSync(join(current.agentDir, "supi-review", "audits")).filter((name) =>
      name.endsWith(".json"),
    );
    expect(audits).toHaveLength(1);
    const collected = await current.invoke("agent_result", {
      batchId: (started.details as { batchId: string }).batchId,
    });
    expect(text(collected)).toContain(`Local replay: ${audits[0]?.replace(/\.json$/, "")}`);
  });
});
