import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureReviewTarget: vi.fn(),
  runReview: vi.fn(),
  getSelectableReviewModels: vi.fn(),
  loadReviewConfig: vi.fn(),
  registerReviewSettings: vi.fn(),
  syncReviewAgentTools: vi.fn(),
  listLocalBranches: vi.fn(),
  listRecentCommits: vi.fn(),
  runGit: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  BorderedLoader: class {
    readonly signal = new AbortController().signal;
    onAbort?: () => void;
  },
  buildSessionContext: () => ({ messages: [] }),
  getAgentDir: () => "/agent",
}));
vi.mock("../../src/config.ts", () => ({
  loadReviewConfig: mocks.loadReviewConfig,
  registerReviewSettings: mocks.registerReviewSettings,
  syncReviewAgentTools: mocks.syncReviewAgentTools,
}));
vi.mock("../../src/model.ts", () => ({
  CURRENT_SESSION_REVIEW_MODEL: "current",
  getSelectableReviewModels: mocks.getSelectableReviewModels,
  resolveAgentReviewModel: vi.fn(),
  resolveRecoveryReviewModel: vi.fn(),
}));
vi.mock("../../src/git-choices.ts", () => ({
  listLocalBranches: mocks.listLocalBranches,
  listRecentCommits: mocks.listRecentCommits,
}));
vi.mock("../../src/git-command.ts", () => ({
  runGit: mocks.runGit,
  runGitAllowExit: (cwd: string, args: string[]) => mocks.runGit(cwd, args),
}));
vi.mock("../../src/tool/review_run/workflow.ts", () => ({
  captureReviewTarget: mocks.captureReviewTarget,
  draftReviewTasks: vi.fn(),
  runReview: mocks.runReview,
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import reviewExtension from "../../src/review.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const head = "a".repeat(40);
const base = "b".repeat(40);
const commit = "c".repeat(40);
const parent = "d".repeat(40);
const root = "e".repeat(40);
const model = { canonicalId: "provider/reviewer", model: {} } as ReviewModelSelection;
const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: {},
  target: { fromCommit: head, toCommit: head, includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
  diffHash: "f".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};

function commandContext(selects: Array<string | undefined>) {
  const notify = vi.fn();
  const select = vi.fn(async () => selects.shift());
  const ctx = makeCtx({
    hasUI: true,
    ui: {
      ...makeCtx().ui,
      notify,
      select,
      editor: vi.fn(async () => "Task."),
      confirm: vi.fn(async () => true),
      custom: vi.fn(
        async (
          factory: (
            _tui: unknown,
            _theme: unknown,
            _keys: unknown,
            done: (value: unknown) => void,
          ) => unknown,
        ) =>
          new Promise((resolve) => {
            factory({ requestRender: vi.fn() }, {}, {}, resolve);
          }),
      ),
    },
    sessionManager: { getEntries: vi.fn(() => []), getLeafId: vi.fn(() => null) },
  });
  return { ctx, notify, select };
}

async function runCommand(command: ReturnType<typeof commandContext>) {
  const pi = createPiMock();
  reviewExtension(pi as unknown as ExtensionAPI);
  const handler = pi.getCommandHandler("supi-review") as (
    args: string,
    context: typeof command.ctx,
  ) => Promise<void>;
  await handler("", command.ctx);
}

describe("/supi-review exact target picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviewConfig.mockReturnValue({
      agentToolEnabled: false,
      agentModel: "current",
      plannerModel: "provider/planner",
      recoveryModel: "disabled",
      auditEnabled: false,
      bootstrapCommand: "",
      postReviewPolicy: "report",
    });
    mocks.getSelectableReviewModels.mockReturnValue([model]);
    mocks.listLocalBranches.mockResolvedValue([{ commit: base, label: "main" }]);
    mocks.listRecentCommits.mockResolvedValue([{ commit, label: "commit" }]);
    mocks.captureReviewTarget.mockResolvedValue({ kind: "captured", snapshot });
    mocks.runReview.mockResolvedValue({ kind: "invalid", reason: "stop" });
    mocks.runGit.mockImplementation(async (_cwd, args: string[]) => {
      if (args[0] === "rev-parse") return `${head}\n`;
      if (args[0] === "merge-base") return `${base}\n`;
      if (args[0] === "cat-file" && args[1] === "-p") return `tree ${head}\nparent ${parent}\n\n`;
      if (args[0] === "cat-file" && args[1] === "-t") return "commit\n";
      throw new Error(`Unexpected Git call: ${args.join(" ")}`);
    });
  });

  it("shows unexpected picker errors and stops", async () => {
    mocks.runGit.mockRejectedValueOnce(new Error("Git is unavailable."));
    const command = commandContext(["Current work"]);

    await runCommand(command);

    expect(command.notify).toHaveBeenCalledWith("Git is unavailable.", "error");
    expect(mocks.runReview).not.toHaveBeenCalled();
  });

  it("offers only the four final target choices and maps Current work to exact change state", async () => {
    const command = commandContext([
      "Current work",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "change",
    ]);

    await runCommand(command);

    expect(command.select.mock.calls[0]).toEqual([
      "Review target",
      [
        "Current work",
        "Current work against a base branch",
        "Committed work against a base branch",
        "One commit",
      ],
    ]);
    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workingTree: { from: head } },
        expectedSnapshotTarget: { workingTree: { from: head } },
      }),
    );
    expect(mocks.runGit.mock.calls.some(([, args]) => args[0] === "merge-base")).toBe(false);
  });

  it("resolves merge-base only for current work against a base branch", async () => {
    const command = commandContext([
      "Current work against a base branch",
      "main",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "change",
    ]);

    await runCommand(command);

    expect(mocks.runGit).toHaveBeenCalledWith("/project", ["merge-base", base, head]);
    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workingTree: { from: base } },
        expectedSnapshotTarget: { workingTree: { from: base } },
      }),
    );
  });

  it("removes the before endpoint for an all-state committed base-branch Review", async () => {
    const command = commandContext([
      "Committed work against a base branch",
      "main",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "state",
    ]);

    await runCommand(command);

    expect(mocks.runGit).toHaveBeenCalledWith("/project", ["merge-base", base, head]);
    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { committed: { to: head } },
        expectedSnapshotTarget: { committed: { from: base, to: head } },
      }),
    );

    const changeCommand = commandContext([
      "Committed work against a base branch",
      "main",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "change",
    ]);
    await runCommand(changeCommand);

    expect(mocks.runReview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { committed: { from: base, to: head } },
      }),
    );
  });

  it("uses a commit first parent for change mode and permits a root commit only in state mode", async () => {
    const commitCommand = commandContext([
      "One commit",
      "commit",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "change",
    ]);

    await runCommand(commitCommand);

    expect(mocks.runReview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { committed: { from: parent, to: commit } },
      }),
    );

    mocks.listRecentCommits.mockResolvedValueOnce([{ commit: root, label: "root" }]);
    mocks.runGit
      .mockImplementationOnce(async (_cwd, args: string[]) => {
        if (args[0] === "rev-parse") return `${head}\n`;
        throw new Error(`Unexpected Git call: ${args.join(" ")}`);
      })
      .mockImplementationOnce(async (_cwd, args: string[]) => {
        if (args[0] === "cat-file" && args[1] === "-p") return `tree ${root}\n\n`;
        throw new Error(`Unexpected Git call: ${args.join(" ")}`);
      });
    const rootCommand = commandContext([
      "One commit",
      "root",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "state",
    ]);

    await runCommand(rootCommand);

    expect(rootCommand.select).toHaveBeenCalledWith("Review Mode for general", ["state"]);
    expect(mocks.runReview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { committed: { to: root } },
        expectedSnapshotTarget: { committed: { to: root } },
      }),
    );

    mocks.listRecentCommits.mockResolvedValueOnce([{ commit: root, label: "root" }]);
    mocks.runGit
      .mockImplementationOnce(async (_cwd, args: string[]) => {
        if (args[0] === "rev-parse") return `${head}\n`;
        throw new Error(`Unexpected Git call: ${args.join(" ")}`);
      })
      .mockImplementationOnce(async (_cwd, args: string[]) => {
        if (args[0] === "cat-file" && args[1] === "-p") return `tree ${root}\n\n`;
        throw new Error(`Unexpected Git call: ${args.join(" ")}`);
      });
    const rejectedChange = commandContext([
      "One commit",
      "root",
      "provider/reviewer",
      "Repository-wide review",
      "Write my own tasks",
      "1",
      "change",
    ]);
    const callsBefore = mocks.runReview.mock.calls.length;

    await runCommand(rejectedChange);

    expect(rejectedChange.select).toHaveBeenCalledWith("Review Mode for general", ["state"]);
    expect(mocks.runReview).toHaveBeenCalledTimes(callsBefore);
  });
});
