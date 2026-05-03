import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadReviewSettings: vi.fn(() => ({
    reviewFastModel: "",
    reviewDeepModel: "",
    maxDiffBytes: 100_000,
    autoFix: false,
  })),
  registerReviewSettings: vi.fn(),
  setReviewModelChoices: vi.fn(),
  getReviewModelChoices: vi.fn(() => ["session-model"]),
  registerReviewRenderer: vi.fn(),
  runReviewer: vi.fn(),
  selectPreset: vi.fn(async () => "custom"),
  selectDepth: vi.fn(async () => "inherit"),
  selectAutoFix: vi.fn(async () => false),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  BorderedLoader: class MockBorderedLoader {
    onAbort: (() => void) | undefined;
    readonly controller = new AbortController();
    readonly signal = this.controller.signal;

    abort() {
      this.controller.abort();
      this.onAbort?.();
    }
  },
  SettingsManager: {
    create: () => ({
      getEnabledModels: () => undefined,
    }),
  },
}));

vi.mock("../src/settings.ts", () => ({
  loadReviewSettings: mockFns.loadReviewSettings,
  registerReviewSettings: mockFns.registerReviewSettings,
  setReviewModelChoices: mockFns.setReviewModelChoices,
}));

vi.mock("../src/model-choices.ts", () => ({
  getReviewModelChoices: mockFns.getReviewModelChoices,
}));

vi.mock("../src/renderer.ts", () => ({
  registerReviewRenderer: mockFns.registerReviewRenderer,
}));

vi.mock("../src/runner.ts", () => ({
  runReviewer: mockFns.runReviewer,
}));

vi.mock("../src/ui.ts", () => ({
  selectPreset: mockFns.selectPreset,
  selectDepth: mockFns.selectDepth,
  selectAutoFix: mockFns.selectAutoFix,
  selectBranch: vi.fn(),
  selectCommit: vi.fn(),
}));

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatReviewContent } from "../src/format-content.ts";
import reviewExtension from "../src/review.ts";

describe("formatReviewContent", () => {
  it("formats success with findings", () => {
    const result = {
      kind: "success" as const,
      target: { type: "custom" as const, instructions: "test" },
      output: {
        findings: [
          {
            title: "Missing null check",
            body: "The value could be undefined when accessed.",
            confidence_score: 0.9,
            priority: 2 as const,
            code_location: {
              absolute_file_path: "/project/src/foo.ts",
              line_range: { start: 42, end: 45 },
            },
          },
          {
            title: "Unused import",
            body: "`lodash` is imported but never used.",
            confidence_score: 0.7,
            priority: 1 as const,
            code_location: {
              absolute_file_path: "/project/src/bar.ts",
              line_range: { start: 3, end: 3 },
            },
          },
        ],
        overall_correctness: "mostly correct",
        overall_explanation: "The patch is mostly correct with two issues worth addressing.",
        overall_confidence_score: 0.85,
      },
    };

    const content = formatReviewContent(result);
    expect(content).toContain("## Code Review Result");
    expect(content).toContain("Verdict: mostly correct (confidence: 85%)");
    expect(content).toContain("#1 [major] Missing null check");
    expect(content).toContain("   /project/src/foo.ts:42-45");
    expect(content).toContain("   The value could be undefined when accessed.");
    expect(content).toContain("#2 [minor] Unused import");
    expect(content).toContain("   /project/src/bar.ts:3");
    expect(content).toContain(
      "Overall: The patch is mostly correct with two issues worth addressing.",
    );
  });

  it("formats success with no findings", () => {
    const result = {
      kind: "success" as const,
      target: { type: "custom" as const, instructions: "test" },
      output: {
        findings: [],
        overall_correctness: "correct",
        overall_explanation: "Looks good to me.",
        overall_confidence_score: 0.95,
      },
    };

    const content = formatReviewContent(result);
    expect(content).toContain("## Code Review Result");
    expect(content).toContain("Verdict: correct (confidence: 95%)");
    expect(content).not.toContain("### Findings");
    expect(content).toContain("Overall: Looks good to me.");
  });

  it("formats failed result", () => {
    const result = {
      kind: "failed" as const,
      reason: "Reviewer subprocess crashed",
      target: { type: "custom" as const, instructions: "test" },
    };
    expect(formatReviewContent(result)).toBe("Review failed: Reviewer subprocess crashed");
  });

  it("formats canceled result", () => {
    const result = {
      kind: "canceled" as const,
      target: { type: "custom" as const, instructions: "test" },
    };
    expect(formatReviewContent(result)).toBe("Review canceled");
  });

  it("formats timeout result", () => {
    const result = {
      kind: "timeout" as const,
      target: { type: "custom" as const, instructions: "test" },
      timeoutMs: 900000,
    };
    expect(formatReviewContent(result)).toBe("Review timed out");
  });
});

describe("/supi-review command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadReviewSettings.mockReturnValue({
      reviewFastModel: "",
      reviewDeepModel: "",
      maxDiffBytes: 100_000,
      autoFix: false,
    });
    mockFns.selectAutoFix.mockResolvedValue(false);
  });

  it("starts the reviewer with the resolved session model", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "Focus on correctness" },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.7,
      },
    });

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
    };

    await commandHandler("", ctx);

    expect(mockFns.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "github-copilot/session-model",
      }),
    );
    expect(mockFns.runReviewer).not.toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.anything(),
      }),
    );
  });

  it("aborts the in-flight reviewer when the loader is canceled", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.runReviewer.mockImplementation(
      ({ signal, target }: { signal?: AbortSignal; target: { type: string } }) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () => resolve({ kind: "canceled", target }), {
            once: true,
          });
        }),
    );

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn((factory: (...args: unknown[]) => unknown) => {
          return new Promise((resolve) => {
            const loader = factory({}, {}, undefined, resolve) as { abort: () => void };
            queueMicrotask(() => loader.abort());
          });
        }),
      },
    };

    await commandHandler("", ctx);

    expect(mockFns.runReviewer).toHaveBeenCalledTimes(1);
    const invocation = mockFns.runReviewer.mock.calls[0]?.[0] as { signal?: AbortSignal };
    expect(invocation.signal?.aborted).toBe(true);
    expect(
      (pi as unknown as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { result: expect.objectContaining({ kind: "canceled" }) },
      }),
    );
  });

  it("sends follow-up user message when auto-fix is enabled and findings exist", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.selectAutoFix.mockResolvedValue(true);
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "Focus on correctness" },
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

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
    };

    await commandHandler("", ctx);

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).toHaveBeenCalledWith("Fix all findings from the review above.");
  });

  it("does not send follow-up when auto-fix is disabled", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.selectAutoFix.mockResolvedValue(false);
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "Focus on correctness" },
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

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
    };

    await commandHandler("", ctx);

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).not.toHaveBeenCalled();
  });

  it("prints the tmux session announcement immediately in non-interactive mode", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    let startSession: ((sessionName: string) => void) | undefined;
    let resolveReview:
      | ((value: { kind: "canceled"; target: { type: "custom"; instructions: string } }) => void)
      | undefined;
    mockFns.runReviewer.mockImplementation(
      async (invocation: {
        onSessionStart?: (sessionName: string) => void;
        target: { type: "custom"; instructions: string };
      }) => {
        startSession = invocation.onSessionStart;
        return new Promise((resolve) => {
          resolveReview = resolve;
        });
      },
    );

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const ctx = {
      cwd: "/project",
      hasUI: false,
      model: { provider: "github-copilot", id: "session-model" },
      ui: undefined,
    };

    const pending = commandHandler("custom -- Focus on correctness", ctx);
    await Promise.resolve();
    startSession?.("supi-review-deadbeef");

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Review running in tmux session supi-review-deadbeef"),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Attach: tmux attach -t supi-review-deadbeef"),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Kill:   tmux kill-session -t supi-review-deadbeef"),
    );

    resolveReview?.({
      kind: "canceled",
      target: { type: "custom", instructions: "Focus on correctness" },
    });
    await pending;
    stderrSpy.mockRestore();
  });

  it("does not send follow-up when there are no findings", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.selectAutoFix.mockResolvedValue(true);
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      target: { type: "custom", instructions: "Focus on correctness" },
      output: {
        findings: [],
        overall_correctness: "correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.95,
      },
    });

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
    };

    await commandHandler("", ctx);

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).not.toHaveBeenCalled();
  });

  it("does not send follow-up when result is non-success", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

    mockFns.selectAutoFix.mockResolvedValue(true);
    mockFns.runReviewer.mockResolvedValue({
      kind: "failed",
      reason: "Reviewer crashed",
      target: { type: "custom", instructions: "Focus on correctness" },
    });

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { provider: "github-copilot", id: "session-model" },
      ui: {
        editor: vi.fn(async () => "Focus on correctness"),
        notify: vi.fn(),
        custom: vi.fn(
          (factory: (...args: unknown[]) => unknown) =>
            new Promise((resolve) => {
              factory({}, {}, undefined, resolve);
            }),
        ),
      },
    };

    await commandHandler("", ctx);

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).not.toHaveBeenCalled();
  });

  it("sends follow-up in non-interactive mode when --auto-fix is set", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("supi-review");
        commandHandler = spec.handler;
      }),
      on: vi.fn(),
      sendMessage: vi.fn(),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;

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

    reviewExtension(pi);
    if (!commandHandler) throw new Error("/supi-review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: false,
      model: { provider: "github-copilot", id: "session-model" },
    };

    await commandHandler("custom --auto-fix -- test", ctx);

    expect(
      (pi as unknown as { sendUserMessage: ReturnType<typeof vi.fn> }).sendUserMessage,
    ).toHaveBeenCalledWith("Fix all findings from the review above.");
  });
});
