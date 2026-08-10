import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runReviewer: vi.fn() }));
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
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { runReviewCommand } from "../../src/tui/review-command.ts";
import type { ReviewBatchDetails } from "../../src/types.ts";

vi.setConfig({ testTimeout: 20_000 });

const PATH_FOCUS_REVIEW = "Path focus (one path per line)";
const REPOSITORY_WIDE_REVIEW = "Repository-wide review";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeRepository(cwd: string): void {
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
  writeFileSync(join(cwd, "tracked.txt"), "feature\n");
  git(cwd, "commit", "-am", "feature");
}

interface Script {
  editors: Array<string | undefined>;
  selects: Array<string | undefined>;
}

type ReviewCommandContext = Parameters<typeof runReviewCommand>[0];

function scriptedContext(cwd: string, script: Script) {
  const select = vi.fn(async (_title: string, choices: string[]) => {
    const value = script.selects.shift();
    if (value === undefined) return undefined;
    if (!choices.includes(value)) throw new Error(`Scripted choice ${value} is not available.`);
    return value;
  });
  const editor = vi.fn(async () => script.editors.shift());
  const confirm = vi.fn(async () => true);
  const notify = vi.fn();
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
  const base = makeCtx();
  const ctx = makeCtx({
    cwd,
    hasUI: true,
    model,
    modelRegistry: {
      getApiKeyAndHeaders: vi.fn(async () => ({ ok: false, error: "Not used by fake sessions." })),
      getAvailable: vi.fn(() => [model]),
      getProvider: vi.fn(),
      getProviderAuth: vi.fn(),
    },
    sessionManager: { getEntries: vi.fn(() => []), getLeafId: vi.fn(() => null) },
    ui: { ...base.ui, confirm, custom, editor, notify, select },
  });
  return { confirm, ctx: ctx as unknown as ReviewCommandContext, editor, notify };
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

function scopeFailureScript(path: string): Script {
  return {
    selects: [
      "Current work",
      "test/reviewer",
      PATH_FOCUS_REVIEW,
      "Write my own tasks",
      "1",
      "state",
    ],
    editors: [path, "Review the state.", ""],
  };
}

describe("/supi-review Review Scope", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "supi-review-command-scope-"));
    initializeRepository(cwd);
    vi.clearAllMocks();
    successfulReviewer();
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("runs repository-wide review and shows the focus in confirmation and output", async () => {
    const command = scriptedContext(cwd, {
      selects: [
        "Current work",
        "test/reviewer",
        REPOSITORY_WIDE_REVIEW,
        "Write my own tasks",
        "1",
        "state",
      ],
      editors: ["Review the state.", ""],
    });

    const pi = await runCommand(command.ctx, cwd);

    expect(reviewDetails(pi).scope).toBeUndefined();
    expect(command.confirm).toHaveBeenCalledWith(
      "Run review?",
      "1 task(s) using test/reviewer\nFocus: repository-wide review",
    );
    expect(String(pi.messages[0]?.content)).toContain("Focus: repository-wide review");
  });

  it("passes current-filesystem paths to the frozen batch", async () => {
    writeFileSync(join(cwd, "untracked.txt"), "new\n");
    const command = scriptedContext(cwd, {
      selects: [
        "Current work",
        "test/reviewer",
        PATH_FOCUS_REVIEW,
        "Write my own tasks",
        "1",
        "state",
      ],
      editors: ["tracked.txt\nuntracked.txt", "Review the state.", ""],
    });

    const pi = await runCommand(command.ctx, cwd);

    expect(reviewDetails(pi).scope).toEqual({ paths: ["tracked.txt", "untracked.txt"] });
    expect(mocks.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('- "untracked.txt"'),
      }),
    );
  });

  it("accepts a historical path that is absent from the caller checkout", async () => {
    writeFileSync(join(cwd, "historical.txt"), "historical\n");
    git(cwd, "add", "historical.txt");
    git(cwd, "commit", "-m", "historical");
    const historical = git(cwd, "rev-parse", "HEAD");
    unlinkSync(join(cwd, "historical.txt"));
    git(cwd, "rm", "historical.txt");
    git(cwd, "commit", "-m", "remove historical");
    const command = scriptedContext(cwd, {
      selects: [
        "One commit",
        `${historical.slice(0, 7)}  historical`,
        "test/reviewer",
        PATH_FOCUS_REVIEW,
        "Write my own tasks",
        "1",
        "state",
      ],
      editors: ["historical.txt", "Review the historical state.", ""],
    });

    const pi = await runCommand(command.ctx, cwd);

    expect(reviewDetails(pi).scope).toEqual({ paths: ["historical.txt"] });
    expect(mocks.runReviewer).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing.txt", 'Review Scope path "missing.txt" does not exist in the frozen after state.'],
    ["../outside", "Review path must stay inside the repository: ../outside"],
  ])("stops invalid scope %j before a Reviewer Session", async (path, reason) => {
    const before = git(cwd, "worktree", "list", "--porcelain");
    const command = scriptedContext(cwd, scopeFailureScript(path));

    await runCommand(command.ctx, cwd);

    expect(command.notify).toHaveBeenCalledWith(reason, "error");
    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(git(cwd, "worktree", "list", "--porcelain")).toBe(before);
  });

  it("stops ignored scope content and removes its Review Workspace", async () => {
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    git(cwd, "add", ".gitignore");
    git(cwd, "commit", "-m", "ignore");
    writeFileSync(join(cwd, "ignored.txt"), "ignored\n");
    const before = git(cwd, "worktree", "list", "--porcelain");

    await runCommand(scriptedContext(cwd, scopeFailureScript("ignored.txt")).ctx, cwd);

    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(git(cwd, "worktree", "list", "--porcelain")).toBe(before);
  });

  it("normalizes duplicate paths and gives the same scope to mixed tasks", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    const command = scriptedContext(cwd, {
      selects: [
        "Current work",
        "test/reviewer",
        PATH_FOCUS_REVIEW,
        "Write my own tasks",
        "2",
        "change",
        "state",
      ],
      editors: [" ./tracked.txt \ntracked.txt", "Review the change.", "Review the state.", ""],
    });

    const pi = await runCommand(command.ctx, cwd);
    const prompts = mocks.runReviewer.mock.calls.map(
      (call) => (call[0] as { prompt: string }).prompt,
    );

    expect(reviewDetails(pi).scope).toEqual({ paths: ["tracked.txt"] });
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt.match(/- "tracked\.txt"/g)).toHaveLength(1);
    }
  });

  it("stops when the scope selector or editor is canceled", async () => {
    const selectorCancel = scriptedContext(cwd, {
      selects: ["Current work", "test/reviewer", undefined],
      editors: [],
    });
    await runCommand(selectorCancel.ctx, cwd);

    const editorCancel = scriptedContext(cwd, {
      selects: ["Current work", "test/reviewer", PATH_FOCUS_REVIEW],
      editors: [undefined],
    });
    await runCommand(editorCancel.ctx, cwd);

    expect(mocks.runReviewer).not.toHaveBeenCalled();
    expect(editorCancel.editor).toHaveBeenCalledWith(
      "Review Scope paths (one workspace-relative path per line)",
      "",
    );
  });
});
