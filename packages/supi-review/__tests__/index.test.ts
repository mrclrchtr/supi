import { describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadReviewSettings: vi.fn(() => ({
    reviewFastModel: "",
    reviewDeepModel: "",
    maxDiffBytes: 100_000,
  })),
  registerReviewSettings: vi.fn(),
  registerReviewRenderer: vi.fn(),
  runReviewer: vi.fn(),
  selectPreset: vi.fn(async () => "custom"),
  selectDepth: vi.fn(async () => "inherit"),
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
}));

vi.mock("../settings.ts", () => ({
  loadReviewSettings: mockFns.loadReviewSettings,
  registerReviewSettings: mockFns.registerReviewSettings,
}));

vi.mock("../renderer.ts", () => ({
  registerReviewRenderer: mockFns.registerReviewRenderer,
}));

vi.mock("../runner.ts", () => ({
  runReviewer: mockFns.runReviewer,
}));

vi.mock("../ui.ts", () => ({
  selectPreset: mockFns.selectPreset,
  selectDepth: mockFns.selectDepth,
  selectBranch: vi.fn(),
  selectCommit: vi.fn(),
}));

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import reviewExtension from "../index.ts";

describe("/review command", () => {
  it("aborts the in-flight reviewer when the loader is canceled", async () => {
    let commandHandler: ((args: string, ctx: Record<string, unknown>) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((name: string, spec: { handler: typeof commandHandler }) => {
        expect(name).toBe("review");
        commandHandler = spec.handler;
      }),
      sendMessage: vi.fn(),
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
    if (!commandHandler) throw new Error("/review handler was not registered");

    const ctx = {
      cwd: "/project",
      hasUI: true,
      model: { id: "session-model" },
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
});
