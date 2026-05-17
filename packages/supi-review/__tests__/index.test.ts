import { describe, expect, it, vi } from "vitest";

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
  selectReviewMode: vi.fn(),
  selectProfile: vi.fn(),
  collectDynamicInputs: vi.fn(),
  approveBriefViaEditor: vi.fn(),
  selectPreset: vi.fn(async () => "custom"),
  selectAutoFix: vi.fn(async () => false),
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
  selectBranch: vi.fn(),
  selectCommit: vi.fn(),
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
      reason: "Reviewer session error",
      target: { type: "custom" as const, instructions: "test" },
    };
    expect(formatReviewContent(result)).toBe("Review failed: Reviewer session error");
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
    expect(formatReviewContent(result)).toContain("Review timed out");
  });

  it("formats timeout result with partial output", () => {
    const result = {
      kind: "timeout" as const,
      target: { type: "custom" as const, instructions: "test" },
      timeoutMs: 900000,
      partialOutput: "I reviewed the code and found...",
    };
    const content = formatReviewContent(result);
    expect(content).toContain("Review timed out");
    expect(content).toContain("Partial output:");
    expect(content).toContain("I reviewed the code and found...");
  });

  it("includes brief context in success output", () => {
    const result = {
      kind: "success" as const,
      target: { type: "custom" as const, instructions: "test" },
      brief: {
        mode: "dynamic" as const,
        title: "Review: auth middleware",
        summary: "Added JWT authentication",
        intent: "Secure the API endpoints",
        focus: "Token validation, error handling",
        finalPrompt: "review this",
      },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.9,
      },
    };
    const content = formatReviewContent(result);
    expect(content).toContain("### Review Requested");
    expect(content).toContain("Added JWT authentication");
    expect(content).toContain("Secure the API endpoints");
    expect(content).toContain("Token validation, error handling");
    expect(content).toContain("**Mode:** Dynamic");
  });

  it("shows profile id for standard mode", () => {
    const result = {
      kind: "success" as const,
      target: { type: "custom" as const, instructions: "test" },
      brief: {
        mode: "standard" as const,
        title: "Security Review",
        summary: "Security-focused review",
        intent: "Check for security issues",
        focus: "Security",
        profileId: "security",
        finalPrompt: "review this",
      },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "No issues",
        overall_confidence_score: 0.95,
      },
    };
    const content = formatReviewContent(result);
    expect(content).toContain("**Mode:** Standard (security)");
    expect(content).toContain("**Summary:** Security-focused review");
  });
});

describe("/supi-review command registration", () => {
  it("registers the /supi-review command and session listeners", () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      sendMessage: vi.fn(),
      events: { emit: vi.fn(), on: vi.fn() },
    } as unknown as ExtensionAPI;

    reviewExtension(pi);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "supi-review",
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("model_select", expect.any(Function));
  });
});
