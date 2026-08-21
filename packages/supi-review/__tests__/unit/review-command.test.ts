import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureReviewTarget: vi.fn(),
  draftReviewTasks: vi.fn(),
  runReview: vi.fn(),
  getSelectableReviewModels: vi.fn(),
  resolveAgentReviewModel: vi.fn(),
  resolveRecoveryReviewModel: vi.fn(),
  loadReviewConfig: vi.fn(),
  registerReviewSettings: vi.fn(),
  syncReviewAgentTools: vi.fn(),
  queuePostReviewTurn: vi.fn(),
  listLocalBranches: vi.fn(),
  listRecentCommits: vi.fn(),
  loaders: [] as Array<{
    message?: string;
    onAbort?: () => void;
    signal: AbortSignal;
  }>,
  runGit: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  BorderedLoader: class {
    readonly signal = new AbortController().signal;
    onAbort?: () => void;

    constructor(
      _tui: unknown,
      _theme: unknown,
      readonly message: string,
    ) {
      mocks.loaders.push(this);
    }
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
  resolveAgentReviewModel: mocks.resolveAgentReviewModel,
  resolveRecoveryReviewModel: mocks.resolveRecoveryReviewModel,
}));
vi.mock("../../src/git-choices.ts", () => ({
  listLocalBranches: mocks.listLocalBranches,
  listRecentCommits: mocks.listRecentCommits,
}));
vi.mock("../../src/git-command.ts", () => ({
  runGit: mocks.runGit,
  runGitAllowExit: (cwd: string, args: string[]) => mocks.runGit(cwd, args),
}));
vi.mock("../../src/tool/review_run/post-policy.ts", async (original) => ({
  ...(await original()),
  queuePostReviewTurn: mocks.queuePostReviewTurn,
}));
vi.mock("../../src/tool/review_run/workflow.ts", () => ({
  captureReviewTarget: mocks.captureReviewTarget,
  draftReviewTasks: mocks.draftReviewTasks,
  runReview: mocks.runReview,
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import reviewExtension from "../../src/review.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const head = "a".repeat(40);
const model = { canonicalId: "provider/reviewer", model: {} } as ReviewModelSelection;
const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { workingTree: { from: head } },
  target: { fromCommit: head, toCommit: head, includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const planning = {
  modelId: "provider/planner",
  promptVersion: "6",
  draft: {
    tasks: [
      { id: "change", instructions: "Draft change task.", mode: "change" as const },
      { id: "state", instructions: "Draft state task.", mode: "state" as const },
    ],
  },
};

function commandContext(selects: Array<string | undefined>, editors: Array<string | undefined>) {
  const select = vi.fn(async () => selects.shift());
  const editor = vi.fn(async () => editors.shift());
  const custom = vi.fn(
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
  );
  const ctx = makeCtx({
    hasUI: true,
    ui: { ...makeCtx().ui, select, editor, confirm: vi.fn(async () => true), custom },
    sessionManager: { getEntries: vi.fn(() => []), getLeafId: vi.fn(() => null) },
  });
  return { ctx, custom, editor, select };
}

async function runCommand(command: ReturnType<typeof commandContext>) {
  const pi = createPiMock();
  reviewExtension(pi as unknown as ExtensionAPI);
  const handler = pi.getCommandHandler("supi-review") as (
    args: string,
    context: typeof command.ctx,
  ) => Promise<void>;
  await handler("", command.ctx);
  return pi;
}

function selectCurrentManual(...modes: string[]) {
  return [
    "Current work",
    "provider/reviewer",
    "Repository-wide review",
    "Write my own tasks",
    String(modes.length),
    ...modes,
  ];
}

describe("/supi-review task editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loaders.length = 0;
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
    mocks.resolveAgentReviewModel.mockReturnValue(model);
    mocks.runGit.mockResolvedValue(head);
    mocks.captureReviewTarget.mockResolvedValue({ kind: "captured", snapshot });
    mocks.draftReviewTasks.mockResolvedValue({ kind: "planned", snapshot, planning });
    mocks.runReview.mockResolvedValue({ kind: "invalid", reason: "review target changed" });
  });

  it("asks for each manual task mode after its instructions and passes mixed modes directly", async () => {
    const command = commandContext(selectCurrentManual("change", "state"), [
      "Change task.",
      "State task.",
      "",
    ]);

    await runCommand(command);

    expect(command.editor.mock.invocationCallOrder[0]).toBeLessThan(
      command.select.mock.invocationCallOrder[5] ?? Number.POSITIVE_INFINITY,
    );
    expect(command.select).toHaveBeenCalledWith("Review Mode for general", ["change", "state"]);
    expect(command.select).toHaveBeenCalledWith("Review Mode for task-2", ["change", "state"]);
    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workingTree: { from: head } },
        review: {
          tasks: [
            { id: "general", instructions: "Change task.", mode: "change" },
            { id: "task-2", instructions: "State task.", mode: "state" },
          ],
        },
        provenance: "caller-supplied",
      }),
    );
  });

  it("shows the selected Review Scope while the interactive Review runs", async () => {
    const command = commandContext(
      [
        "Current work",
        "provider/reviewer",
        "Path focus (one path per line)",
        "Write my own tasks",
        "1",
        "state",
      ],
      ["src/a.ts", "State task.", ""],
    );

    await runCommand(command);

    expect(mocks.loaders.at(-1)).toMatchObject({ message: "Reviewing… (path focus: src/a.ts)" });
  });

  it("keeps Planner modes as visible choices and retains Planner-assisted provenance after edits", async () => {
    const command = commandContext(
      [
        "Current work",
        "provider/reviewer",
        "Repository-wide review",
        "AI suggests tasks",
        "Edit planner draft",
        "change",
        "state",
      ],
      ["Edited change task.", "Edited state task.", ""],
    );

    await runCommand(command);

    expect(command.select).toHaveBeenCalledWith("Review Mode for change (current: change)", [
      "change",
      "state",
    ]);
    expect(command.select).toHaveBeenCalledWith("Review Mode for state (current: state)", [
      "state",
      "change",
    ]);
    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSnapshot: snapshot,
        expectedSnapshotTarget: { workingTree: { from: head } },
        planning,
        provenance: "planner-assisted",
        review: {
          tasks: [
            { id: "change", instructions: "Edited change task.", mode: "change" },
            { id: "state", instructions: "Edited state task.", mode: "state" },
          ],
        },
      }),
    );
  });

  it("marks a discarded Planner Draft as caller-supplied", async () => {
    const command = commandContext(
      [
        "Current work",
        "provider/reviewer",
        "Repository-wide review",
        "AI suggests tasks",
        "Discard draft and write my own tasks",
        "1",
        "state",
      ],
      ["Caller task.", ""],
    );

    await runCommand(command);

    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: "caller-supplied",
        review: { tasks: [{ id: "general", instructions: "Caller task.", mode: "state" }] },
      }),
    );
    expect(mocks.runReview.mock.calls[0]?.[0]).not.toHaveProperty("planning");
  });

  it.each([
    ["invalid output", { kind: "planner-failed", result: { kind: "failed" } }],
    ["failure", { kind: "planner-failed", result: { kind: "failed" } }],
    ["cancellation", { kind: "planner-failed", result: { kind: "canceled" } }],
    ["timeout", { kind: "planner-failed", result: { kind: "timeout" } }],
  ])("stops before editing and reviewers after Planner %s", async (_name, outcome) => {
    mocks.draftReviewTasks.mockResolvedValueOnce(outcome);
    const command = commandContext(
      ["Current work", "provider/reviewer", "Repository-wide review", "AI suggests tasks"],
      [],
    );

    await runCommand(command);

    expect(command.editor).not.toHaveBeenCalled();
    expect(mocks.runReview).not.toHaveBeenCalled();
  });

  it("stops target capture when Escape closes its side-effect-free loader", async () => {
    mocks.captureReviewTarget.mockReturnValue(new Promise(() => {}));
    const command = commandContext(
      ["Current work", "provider/reviewer", "Repository-wide review", "Write my own tasks"],
      [],
    );
    command.ctx.ui.custom = vi.fn(async (...args: unknown[]) => {
      const factory = args[0] as (
        _tui: unknown,
        _theme: unknown,
        _keys: unknown,
        done: (value: unknown) => void,
      ) => unknown;
      return new Promise((resolve) => {
        factory({ requestRender: vi.fn() }, {}, {}, resolve);
        mocks.loaders.at(-1)?.onAbort?.();
      });
    });

    await runCommand(command);

    expect(mocks.captureReviewTarget).toHaveBeenCalledOnce();
    expect(mocks.captureReviewTarget.mock.calls[0]?.[2]).toBe(mocks.loaders.at(-1)?.signal);
    expect(mocks.runReview).not.toHaveBeenCalled();
    expect(command.editor).not.toHaveBeenCalled();
  });

  it("passes the selected snapshot to the Review workflow so drift stops before reviewer work", async () => {
    const command = commandContext(selectCurrentManual("change"), ["Task.", ""]);

    const pi = await runCommand(command);

    expect(mocks.runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSnapshot: snapshot,
        expectedSnapshotTarget: { workingTree: { from: head } },
      }),
    );
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });
});
