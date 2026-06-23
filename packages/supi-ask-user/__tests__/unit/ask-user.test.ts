import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
// We import the extension factory but we also export executeAskUser for direct testing
import askUserExtension from "../../src/ask-user.ts";
import type { AskUserInteractionResult } from "../../src/types.ts";

type PiApi = ReturnType<typeof createPiMock> & ExtensionAPI;

type BaseUi = Omit<ReturnType<typeof makeCtx>["ui"], "custom">;

type UnsupportedCtx = Omit<ReturnType<typeof makeCtx>, "ui"> & {
  abort: ReturnType<typeof vi.fn>;
  ui: BaseUi & {
    custom?: undefined;
    setWorkingVisible: ReturnType<typeof vi.fn>;
  };
};

type FormCtx = Omit<ReturnType<typeof makeCtx>, "ui"> & {
  abort: ReturnType<typeof vi.fn>;
  ui: BaseUi & {
    custom: (
      factory: (
        tui: unknown,
        theme: unknown,
        kb: unknown,
        done: (value: unknown) => void,
      ) => unknown,
    ) => Promise<unknown>;
    setWorkingVisible: ReturnType<typeof vi.fn>;
  };
};

const request = {
  title: "Formatter decision",
  questions: [
    {
      type: "choice" as const,
      id: "formatter",
      header: "Formatter",
      prompt: "Which formatter should I use?",
      options: [
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
      ],
      recommendation: "biome",
    },
  ],
};

function makeUnsupportedCtx(): UnsupportedCtx {
  const ctx = makeCtx({ hasUI: true, mode: "tui", abort: vi.fn() }) as unknown as UnsupportedCtx;
  ctx.ui.custom = undefined;
  ctx.ui.setWorkingVisible = vi.fn();
  return ctx;
}

function makeFormCtx(result: unknown): FormCtx {
  const ctx = makeCtx({ hasUI: true, mode: "tui", abort: vi.fn() }) as unknown as FormCtx;
  ctx.ui.setWorkingVisible = vi.fn();
  ctx.ui.custom = (async () => result) as unknown as FormCtx["ui"]["custom"];
  return ctx;
}

describe("ask_user tool", () => {
  it("registers the ask_user tool with blocking guidance metadata", () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    expect(tool.label).toBe("Ask User");
    expect((tool as { executionMode?: string }).executionMode).toBe("sequential");
    expect(tool.description).toContain("interactive TUI decision form");
    expect(tool.description).toContain("truncated");
    expect(tool.promptSnippet).toContain("ask_user");
    expect(tool.promptGuidelines?.every((guideline) => guideline.includes("ask_user"))).toBe(true);
  });

  it("throws for invalid forms", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    await expect(
      tool.execute("tc-1", { questions: [] }, undefined, undefined, makeUnsupportedCtx()),
    ).rejects.toThrow("supports 1-10 questions only");
  });

  it("throws when custom form support is unavailable", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeUnsupportedCtx();

    await expect(tool.execute("tc-2", request, undefined, undefined, ctx)).rejects.toThrow(
      "requires a TUI with custom form support",
    );
  });

  it("throws in RPC mode even though ctx.hasUI is true", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeFormCtx(undefined);
    const rpcCtx = { ...ctx, hasUI: true, mode: "rpc" };

    await expect(tool.execute("tc-2b", request, undefined, undefined, rpcCtx)).rejects.toThrow(
      "requires an interactive TUI session",
    );
  });

  it("records successful form submissions with outcome and responses", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeFormCtx({
      outcome: "submitted",
      comment: "Form-level note",
      responses: [
        {
          questionId: "formatter",
          questionComment: "Need to be careful",
          answer: {
            kind: "choice",
            answered: true,
            options: [
              { value: "biome", label: "Biome", selected: true, comment: "Use repo defaults" },
              { value: "prettier", label: "Prettier", selected: false, comment: "Avoid here" },
            ],
          },
        },
      ],
    });

    const result = (await tool.execute("tc-3", request, undefined, undefined, ctx)) as {
      content: { type: string; text: string }[];
      details: {
        outcome: string;
        comment?: string;
        responses: Array<{ questionId: string }>;
      };
    };

    expect(result.details.outcome).toBe("submitted");
    expect(result.details.comment).toBe("Form-level note");
    expect(result.details.responses).toHaveLength(1);
    expect(result.details.responses[0].questionId).toBe("formatter");
    expect(result.content[0]?.text).toContain("Form-level note");
    expect(result.content[0]?.text).toContain("Need to be careful");
    expect(result.content[0]?.text).toContain("Biome");
    expect(result.content[0]?.text).toContain("Use repo defaults");
    expect(result.content[0]?.text).toContain("Prettier");
    expect(result.content[0]?.text).toContain("Avoid here");
    expect(ctx.abort).not.toHaveBeenCalled();
  });

  it("aborts the turn when the form returns an internal cancel result", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeFormCtx({ kind: "cancel" } as AskUserInteractionResult);

    await expect(tool.execute("tc-4", request, undefined, undefined, ctx)).rejects.toThrow(
      "interaction was cancelled",
    );

    expect(ctx.abort).toHaveBeenCalledTimes(1);
  });

  it("aborts the turn when the form returns an internal abort result", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeFormCtx({ kind: "abort" } as AskUserInteractionResult);

    await expect(tool.execute("tc-4b", request, undefined, undefined, ctx)).rejects.toThrow(
      "interaction was cancelled",
    );

    expect(ctx.abort).toHaveBeenCalledTimes(1);
  });

  it("rejects a second concurrent ask_user call", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstCtx = makeCtx({ hasUI: true, mode: "tui", abort: vi.fn() }) as unknown as FormCtx;
    firstCtx.ui.setWorkingVisible = vi.fn();
    firstCtx.ui.custom = (async () =>
      await new Promise<unknown>((resolve) => {
        resolveFirst = resolve;
      })) as unknown as FormCtx["ui"]["custom"];

    const secondCtx = makeUnsupportedCtx();

    const pending = tool.execute("tc-5", request, undefined, undefined, firstCtx);
    await expect(tool.execute("tc-6", request, undefined, undefined, secondCtx)).rejects.toThrow(
      "already in flight",
    );

    resolveFirst?.({
      outcome: "submitted",
      comment: "Done",
      responses: [
        {
          questionId: "formatter",
          answer: {
            kind: "choice",
            answered: true,
            options: [{ value: "biome", label: "Biome", selected: true }],
          },
        },
      ],
    });
    await pending;
  });

  it("emits start and end events around successful form interaction", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    await tool.execute(
      "tc-7",
      request,
      undefined,
      undefined,
      makeFormCtx({
        outcome: "submitted",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice",
              answered: true,
              options: [{ value: "biome", label: "Biome", selected: true }],
            },
          },
        ],
      }),
    );

    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:start", {
      source: "supi-ask-user",
    });
    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:end", {
      source: "supi-ask-user",
    });
  });

  it("handles needs_discussion outcome without aborting", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeFormCtx({
      outcome: "needs_discussion",
      comment: "Need more context",
      responses: [
        {
          questionId: "formatter",
          questionComment: "Need formatter trade-offs",
          answer: {
            kind: "choice",
            answered: false,
            options: [
              {
                value: "prettier",
                label: "Prettier",
                selected: false,
                comment: "May fit the team better",
              },
            ],
          },
        },
      ],
    });

    const result = (await tool.execute("tc-8", request, undefined, undefined, ctx)) as {
      content: { type: string; text: string }[];
      details: { outcome: string };
    };

    expect(result.details.outcome).toBe("needs_discussion");
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toMatch(/unanswered|Unanswered/);
    expect(result.content[0]?.text).toContain("Need more context");
    expect(result.content[0]?.text).toContain("Need formatter trade-offs");
    expect(result.content[0]?.text).toContain("May fit the team better");
  });
});
