import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runPlanner: vi.fn(), runReviewer: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (original) => {
  const actual = await original<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    BorderedLoader: class {
      readonly signal = new AbortController().signal;
      onAbort?: () => void;
    },
  };
});
vi.mock("../../src/tool/planner-runner.ts", async (original) => ({
  ...(await original()),
  runPlanner: mocks.runPlanner,
}));
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { runReviewCommand } from "../../src/tui/review-command.ts";
import type { ReviewBatchDetails } from "../../src/types.ts";

vi.setConfig({ testTimeout: 20_000 });

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

interface Repository {
  base: string;
  cwd: string;
  root: string;
  tip: string;
}

function initializeRepository(cwd: string): Repository {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "tag.gpgSign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), '{"enabledModels":["test/reviewer"]}\n');
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    '{"review":{"plannerModel":"current","postReviewPolicy":"report"}}\n',
  );
  writeFileSync(join(cwd, "tracked.txt"), "root\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "root");
  const root = git(cwd, "rev-parse", "HEAD");
  git(cwd, "branch", "base", root);
  writeFileSync(join(cwd, "tracked.txt"), "feature\n");
  git(cwd, "commit", "-am", "feature");
  return { base: root, cwd, root, tip: git(cwd, "rev-parse", "HEAD") };
}

interface Script {
  editors: string[];
  selects: Array<string | undefined>;
  onConfirm?: () => void;
}

type ReviewCommandContext = Parameters<typeof runReviewCommand>[0];

function scriptedContext(cwd: string, script: Script) {
  const select = vi.fn(async (_title: string, choices: string[]) => {
    const value = script.selects.shift();
    if (value === undefined) return undefined;
    if (!choices.includes(value)) {
      throw new Error(`Scripted choice ${value} is not available.`);
    }
    return value;
  });
  const editor = vi.fn(async () => script.editors.shift());
  const confirm = vi.fn(async () => {
    script.onConfirm?.();
    return true;
  });
  const custom = vi.fn(
    async (
      factory: (
        tui: { requestRender: () => void },
        theme: Record<string, unknown>,
        keys: Record<string, unknown>,
        done: (value: unknown) => void,
      ) => unknown,
    ) =>
      new Promise((resolve) => {
        factory({ requestRender: vi.fn() }, {}, {}, resolve);
      }),
  );
  const model = { provider: "test", id: "reviewer", name: "Test reviewer" };
  const modelRegistry = {
    getApiKeyAndHeaders: vi.fn(async () => ({ ok: false, error: "Not used by fake sessions." })),
    getAvailable: vi.fn(() => [model]),
    getProvider: vi.fn(),
    getProviderAuth: vi.fn(),
  };
  const base = makeCtx();
  const notify = vi.fn();
  const ctx = makeCtx({
    cwd,
    hasUI: true,
    model,
    modelRegistry,
    sessionManager: { getEntries: vi.fn(() => []), getLeafId: vi.fn(() => null) },
    ui: { ...base.ui, confirm, custom, editor, notify, select },
  });
  return { confirm, ctx: ctx as unknown as ReviewCommandContext, editor, notify, select };
}

async function runCommand(ctx: ReviewCommandContext, cwd: string) {
  const pi = createPiMock();
  await runReviewCommand(ctx, {
    pi: pi as never,
    artifactStore: new ReviewArtifactStore(),
    auditStore: new LocalReviewAuditStore({ agentDir: join(cwd, ".agent") }),
  });
  return pi;
}

function reviewDetails(pi: ReturnType<typeof createPiMock>): ReviewBatchDetails {
  const details = pi.messages[0]?.details;
  if (!details) throw new Error("The command did not send a completed review message.");
  return details as ReviewBatchDetails;
}

function successfulReviewer(): void {
  mocks.runReviewer.mockImplementation(async (invocation) => ({
    kind: "success",
    modelId: invocation.model.canonicalId,
    reviewerExtensionSetStatus: "active",
    value: { summary: "Done.", findings: [], criteriaCoverage: { status: "complete" } },
  }));
}

describe("/supi-review command workflow", () => {
  let repository: Repository;

  beforeEach(() => {
    repository = initializeRepository(mkdtempSync(join(tmpdir(), "supi-review-command-")));
    vi.clearAllMocks();
    successfulReviewer();
  });

  afterEach(() => rmSync(repository.cwd, { recursive: true, force: true }));

  it("maps a base branch through its merge base and retains Planner provenance", async () => {
    mocks.runPlanner.mockResolvedValue({
      kind: "success",
      value: { tasks: [{ id: "change", instructions: "Review the draft.", mode: "change" }] },
    });
    const command = scriptedContext(repository.cwd, {
      selects: [
        "Committed work against a base branch",
        "base",
        "test/reviewer",
        "Repository-wide review",
        "AI suggests tasks",
        "Edit planner draft",
        "change",
      ],
      editors: ["Review the committed change.", ""],
    });

    const pi = await runCommand(command.ctx, repository.cwd);
    const details = reviewDetails(pi);

    expect(mocks.runPlanner).toHaveBeenCalledOnce();
    expect(mocks.runReviewer).toHaveBeenCalledOnce();
    expect(details.provenance).toBe("planner-assisted");
    expect(details.snapshot.target).toEqual({
      fromCommit: repository.base,
      toCommit: repository.tip,
      includeUncommittedChanges: false,
    });
    expect(details.planning?.draft.tasks[0]?.mode).toBe("change");
  });

  it("runs Current work against a base branch in a frozen filesystem workspace", async () => {
    writeFileSync(join(repository.cwd, "tracked.txt"), "current filesystem\n");
    const command = scriptedContext(repository.cwd, {
      selects: [
        "Current work against a base branch",
        "base",
        "test/reviewer",
        "Repository-wide review",
        "Write my own tasks",
        "1",
        "change",
      ],
      editors: ["Review current work.", ""],
    });

    const details = reviewDetails(await runCommand(command.ctx, repository.cwd));

    expect(details.snapshot.target).toEqual({
      fromCommit: repository.base,
      toCommit: repository.tip,
      includeUncommittedChanges: true,
    });
    expect(details.results[0]).toMatchObject({ mode: "change", status: "completed" });
  });

  it("uses the first parent for a normal One commit change Review", async () => {
    const tipLabel = `${repository.tip.slice(0, 7)}  feature`;
    const command = scriptedContext(repository.cwd, {
      selects: [
        "One commit",
        tipLabel,
        "test/reviewer",
        "Repository-wide review",
        "Write my own tasks",
        "1",
        "change",
      ],
      editors: ["Review one commit.", ""],
    });

    const details = reviewDetails(await runCommand(command.ctx, repository.cwd));

    expect(details.snapshot.target).toEqual({
      fromCommit: repository.root,
      toCommit: repository.tip,
      includeUncommittedChanges: false,
    });
  });

  it("uses an available first parent through a shallow marker", async () => {
    writeFileSync(join(repository.cwd, ".git", "shallow"), `${repository.tip}\n`);
    try {
      const tipLabel = `${repository.tip.slice(0, 7)}  feature`;
      const command = scriptedContext(repository.cwd, {
        selects: [
          "One commit",
          tipLabel,
          "test/reviewer",
          "Repository-wide review",
          "Write my own tasks",
          "1",
          "change",
        ],
        editors: ["Review one commit.", ""],
      });

      const details = reviewDetails(await runCommand(command.ctx, repository.cwd));

      expect(details.snapshot.target).toEqual({
        fromCommit: repository.root,
        toCommit: repository.tip,
        includeUncommittedChanges: false,
      });
    } finally {
      unlinkSync(join(repository.cwd, ".git", "shallow"));
    }
  });

  it("marks a discarded Planner Draft as caller-supplied", async () => {
    mocks.runPlanner.mockResolvedValue({
      kind: "success",
      value: { tasks: [{ id: "draft", instructions: "Draft task.", mode: "state" }] },
    });
    const command = scriptedContext(repository.cwd, {
      selects: [
        "Current work",
        "test/reviewer",
        "Repository-wide review",
        "AI suggests tasks",
        "Discard draft and write my own tasks",
        "1",
        "state",
      ],
      editors: ["Caller task.", ""],
    });

    const details = reviewDetails(await runCommand(command.ctx, repository.cwd));

    expect(details.provenance).toBe("caller-supplied");
    expect(details.review.tasks).toEqual([
      { id: "general", instructions: "Caller task.", mode: "state" },
    ]);
  });

  it.each([
    [
      "invalid",
      { kind: "success", value: { tasks: [{ id: "bad", instructions: "Bad.", mode: "invalid" }] } },
    ],
    [
      "canceled",
      {
        kind: "canceled",
        diagnostics: { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 0, toolUses: 0 },
      },
    ],
    [
      "timeout",
      {
        kind: "timeout",
        timeoutMs: 1,
        diagnostics: { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 0, toolUses: 0 },
      },
    ],
  ])("stops after Planner %s before task editing and Reviewer Sessions", async (_name, result) => {
    mocks.runPlanner.mockResolvedValue(result);
    const command = scriptedContext(repository.cwd, {
      selects: ["Current work", "test/reviewer", "Repository-wide review", "AI suggests tasks"],
      editors: [],
    });

    const pi = await runCommand(command.ctx, repository.cwd);

    expect(command.editor).not.toHaveBeenCalled();
    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(pi.messages).toHaveLength(0);
  });

  it("permits root state review and blocks root change review in the task editor", async () => {
    const rootLabel = `${repository.root.slice(0, 7)}  root`;
    const state = scriptedContext(repository.cwd, {
      selects: [
        "One commit",
        rootLabel,
        "test/reviewer",
        "Repository-wide review",
        "Write my own tasks",
        "1",
        "state",
      ],
      editors: ["Review the root state.", ""],
    });

    const pi = await runCommand(state.ctx, repository.cwd);
    expect(reviewDetails(pi).results[0]).toMatchObject({ mode: "state", status: "completed" });
    mocks.runReviewer.mockClear();

    const change = scriptedContext(repository.cwd, {
      selects: [
        "One commit",
        rootLabel,
        "test/reviewer",
        "Repository-wide review",
        "Write my own tasks",
        "1",
        undefined,
      ],
      editors: ["Review the root change."],
    });
    await runCommand(change.ctx, repository.cwd);

    expect(change.select).toHaveBeenCalledWith("Review Mode for general", ["state"]);
    expect(mocks.runReviewer).not.toHaveBeenCalled();
  });

  it("stops after Planner failure before task editing and Reviewer Sessions", async () => {
    mocks.runPlanner.mockResolvedValue({ kind: "failed", failureCode: "session-creation-failed" });
    const command = scriptedContext(repository.cwd, {
      selects: ["Current work", "test/reviewer", "Repository-wide review", "AI suggests tasks"],
      editors: [],
    });

    const pi = await runCommand(command.ctx, repository.cwd);

    expect(command.editor).not.toHaveBeenCalled();
    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(pi.messages).toHaveLength(0);
  });

  it("stops target drift before Reviewer Sessions", async () => {
    writeFileSync(join(repository.cwd, "tracked.txt"), "captured\n");
    const command = scriptedContext(repository.cwd, {
      selects: [
        "Current work",
        "test/reviewer",
        "Repository-wide review",
        "Write my own tasks",
        "1",
        "change",
      ],
      editors: ["Review the filesystem change.", ""],
      onConfirm: () => writeFileSync(join(repository.cwd, "tracked.txt"), "newer\n"),
    });

    const pi = await runCommand(command.ctx, repository.cwd);

    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(pi.messages).toHaveLength(0);
    expect(command.notify).toHaveBeenCalledWith(
      "The review target changed while tasks were edited. Start a new review.",
      "error",
    );
  });
});
