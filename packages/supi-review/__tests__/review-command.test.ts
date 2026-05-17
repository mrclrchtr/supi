import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadReviewSettings: vi.fn(() => ({
    reviewModel: "",
    maxDiffBytes: 100_000,
    autoFix: false,
  })),
  registerReviewSettings: vi.fn(),
  setReviewModelChoices: vi.fn(),
  registerReviewRenderer: vi.fn(),
  runReviewer: vi.fn(),
  // UI functions
  selectReviewMode: vi.fn(),
  selectProfile: vi.fn(),
  collectDynamicInputs: vi.fn(),
  approveBriefViaEditor: vi.fn(),
  selectPreset: vi.fn(),
  selectAutoFix: vi.fn(),
  selectBranch: vi.fn(),
  selectCommit: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  BorderedLoader: class MockBorderedLoader {
    onAbort: (() => void) | undefined;
    readonly controller = new AbortController();
    readonly signal = this.controller.signal;

    abort() {
      this.controller.abort();
      this.onAbort?.();
    }
  },
  ModelRegistry: {
    create: () => ({
      getAvailableModels: () => undefined,
    }),
  },
}));

vi.mock("../src/settings", () => ({
  filterByEnabledModels: vi.fn((_patterns, available) => available),
  loadReviewSettings: mockFns.loadReviewSettings,
  readPiEnabledModels: vi.fn(() => undefined),
  registerReviewSettings: mockFns.registerReviewSettings,
  setReviewModelChoices: mockFns.setReviewModelChoices,
}));

vi.mock("../src/renderer", () => ({
  registerReviewRenderer: mockFns.registerReviewRenderer,
}));

vi.mock("../src/runner", () => ({
  runReviewer: mockFns.runReviewer,
}));

vi.mock("../src/progress-widget", () => ({
  ReviewProgressWidget: class MockReviewProgressWidget {
    private _controller = new AbortController();
    onAbort: (() => void) | undefined;
    constructor() {
      this.onAbort = undefined;
    }
    get signal() {
      return this._controller.signal;
    }
    abort() {
      this.onAbort?.();
      this._controller.abort();
    }
    updateProgress() {}
    render() {
      return ["Review running…"];
    }
    invalidate() {}
    handleInput() {}
  },
}));

vi.mock("../src/ui", () => ({
  selectReviewMode: mockFns.selectReviewMode,
  selectProfile: mockFns.selectProfile,
  collectDynamicInputs: mockFns.collectDynamicInputs,
  approveBriefViaEditor: mockFns.approveBriefViaEditor,
  selectPreset: mockFns.selectPreset,
  selectAutoFix: mockFns.selectAutoFix,
  selectBranch: mockFns.selectBranch,
  selectCommit: mockFns.selectCommit,
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import reviewExtension from "../src/review.ts";

describe("/supi-review command — new brief-driven flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadReviewSettings.mockReturnValue({
      reviewModel: "",
      maxDiffBytes: 100_000,
      autoFix: false,
    });

    // Default mock behavior
    mockFns.selectAutoFix.mockResolvedValue(false);
    mockFns.selectReviewMode.mockResolvedValue("dynamic");
    mockFns.selectPreset.mockResolvedValue("custom");
    mockFns.collectDynamicInputs.mockResolvedValue({
      summary: "Added auth middleware",
      intent: "Secure the API with JWT",
      focus: "Token validation, error handling",
    });
    mockFns.approveBriefViaEditor.mockImplementation(async (_ctx: unknown, draft: string) => draft);
  });

  function createPi(): ExtensionAPI {
    return {
      registerCommand: vi.fn(),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
      events: { emit: vi.fn(), on: vi.fn() },
    } as unknown as ExtensionAPI;
  }

  function getHandler(pi: ExtensionAPI) {
    const registerMock = pi.registerCommand as ReturnType<typeof vi.fn>;
    if (registerMock.mock.calls.length === 0) return undefined;
    return registerMock.mock.calls[0]?.[1]?.handler;
  }

  function makeCtx(overrides?: Record<string, unknown>) {
    return {
      cwd: "/project",
      hasUI: true,
      modelRegistry: {
        find: (provider: string, id: string) =>
          provider === "github-copilot" && id === "session-model" ? { id, provider } : undefined,
      },
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async (_title: string, _default: string) => "edited prompt"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
      ...overrides,
    };
  }

  it("starts with mode selection", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.selectReviewMode.mockResolvedValue(undefined);

    await handler("", makeCtx());

    expect(mockFns.selectReviewMode).toHaveBeenCalledTimes(1);
    expect(mockFns.selectPreset).not.toHaveBeenCalled();
    expect(mockFns.runReviewer).not.toHaveBeenCalled();
  });

  it("starts the reviewer with the approved brief in dynamic mode", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "Review auth middleware" },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.7,
      },
    });

    await handler("", makeCtx());

    expect(mockFns.selectReviewMode).toHaveBeenCalledTimes(1);
    expect(mockFns.collectDynamicInputs).toHaveBeenCalledTimes(1);
    expect(mockFns.approveBriefViaEditor).toHaveBeenCalledTimes(1);
    expect(mockFns.runReviewer).toHaveBeenCalledTimes(1);
  });

  it("runs a standard review when mode is standard", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.selectReviewMode.mockResolvedValue("standard");
    mockFns.selectPreset.mockResolvedValue("custom");
    mockFns.selectProfile.mockResolvedValue("security");
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "test" },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.7,
      },
    });

    await handler("", makeCtx());

    expect(mockFns.selectReviewMode).toHaveBeenCalledWith(expect.anything());
    expect(mockFns.selectProfile).toHaveBeenCalledTimes(1);
    expect(mockFns.runReviewer).toHaveBeenCalledTimes(1);
  });

  it("does not run the reviewer when brief approval is cancelled", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.approveBriefViaEditor.mockResolvedValue(undefined);

    await handler("", makeCtx());

    expect(mockFns.runReviewer).not.toHaveBeenCalled();
  });

  it("does not run the reviewer when dynamic inputs are cancelled", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.collectDynamicInputs.mockResolvedValue(undefined);

    await handler("", makeCtx());

    expect(mockFns.runReviewer).not.toHaveBeenCalled();
  });

  it("does not run the reviewer when profile selection is cancelled", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.selectReviewMode.mockResolvedValue("standard");
    mockFns.selectProfile.mockResolvedValue(undefined);

    await handler("", makeCtx());

    expect(mockFns.runReviewer).not.toHaveBeenCalled();
  });

  it("sends a follow-up user message when auto-fix is enabled and findings exist", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.selectAutoFix.mockResolvedValue(true);
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "test" },
      output: {
        findings: [
          {
            title: "Bug",
            body: "Something is wrong",
            confidence_score: 0.9,
            priority: 2,
            code_location: {
              absolute_file_path: "/project/src/x.ts",
              line_range: { start: 1, end: 1 },
            },
          },
        ],
        overall_correctness: "mostly correct",
        overall_explanation: "One issue found",
        overall_confidence_score: 0.8,
      },
    });

    await handler("", makeCtx());

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).toHaveBeenCalledWith("Fix all findings from the review above.");
  });

  it("aborts when the in-flight reviewer is canceled", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.runReviewer.mockImplementation(
      ({ signal, target }: { signal?: AbortSignal; target: { type: string } }) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () => resolve({ kind: "canceled", target }), {
            once: true,
          });
        }),
    );

    const ctx = makeCtx({
      ui: {
        ...makeCtx().ui,
        custom: vi.fn((factory: (...args: unknown[]) => unknown) => {
          return new Promise((resolve) => {
            const loader = factory({}, {}, undefined, resolve) as { abort: () => void };
            queueMicrotask(() => loader.abort());
          });
        }),
      },
    });

    await handler("", ctx);

    expect(mockFns.runReviewer).toHaveBeenCalledTimes(1);
    const invocation = mockFns.runReviewer.mock.calls[0]?.[0] as { signal?: AbortSignal };
    expect(invocation.signal?.aborted).toBe(true);
  });
});
