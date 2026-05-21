import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import askUserExtension from "../../src/ask-user.ts";

type PiApi = ReturnType<typeof createPiMock> & ExtensionAPI;

type BaseUi = Omit<ReturnType<typeof makeCtx>["ui"], "custom">;

type DialogCtx = Omit<ReturnType<typeof makeCtx>, "ui"> & {
  abort: ReturnType<typeof vi.fn>;
  ui: BaseUi & {
    custom?: undefined;
    select: ReturnType<typeof vi.fn>;
    input: ReturnType<typeof vi.fn>;
    editor: ReturnType<typeof vi.fn>;
    setWorkingVisible: ReturnType<typeof vi.fn>;
  };
};

type OverlayCtx = Omit<ReturnType<typeof makeCtx>, "ui"> & {
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
      initial: "biome",
    },
  ],
};

function makeDialogCtx(): DialogCtx {
  const ctx = makeCtx({ hasUI: true, abort: vi.fn() }) as unknown as DialogCtx;
  ctx.ui.custom = undefined;
  ctx.ui.select = vi.fn(async () => "1. Biome");
  ctx.ui.input = vi.fn(async () => undefined);
  ctx.ui.editor = vi.fn(async () => undefined);
  ctx.ui.setWorkingVisible = vi.fn();
  return ctx;
}

describe("ask_user tool", () => {
  it("registers the ask_user tool", () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    expect(tool.label).toBe("Ask User");
  });

  it("returns an error result for invalid forms", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    const result = (await tool.execute(
      "tc-1",
      { questions: [] },
      undefined,
      undefined,
      makeDialogCtx(),
    )) as { content: { type: string; text: string }[]; details: { kind?: string } };

    expect(result.content[0]?.text).toContain("supports 1-4 questions only");
    expect(result.details.kind).toBe("error");
  });

  it("uses dialog fallback when custom UI is unavailable", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeDialogCtx();

    const result = (await tool.execute("tc-2", request, undefined, undefined, ctx)) as {
      content: { type: string; text: string }[];
      details: { status: string; answersById: Record<string, unknown> };
    };

    expect(result.details.status).toBe("submitted");
    expect(result.details.answersById).toMatchObject({
      formatter: {
        kind: "choice",
        selections: [{ value: "biome", label: "Biome" }],
      },
    });
    expect(result.content[0]?.text).toContain("Formatter: Biome");
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.entries[0]?.type).toContain("ask_user");
  });

  it("aborts the turn when the user cancels", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeDialogCtx();
    ctx.ui.select = vi.fn(async () => undefined);

    const result = (await tool.execute("tc-3", request, undefined, undefined, ctx)) as {
      details: { status: string };
    };

    expect(result.details.status).toBe("cancelled");
    expect(ctx.abort).toHaveBeenCalledTimes(1);
  });

  it("rejects a second concurrent ask_user call", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstCtx = makeCtx({ hasUI: true, abort: vi.fn() }) as unknown as OverlayCtx;
    firstCtx.ui.setWorkingVisible = vi.fn();
    firstCtx.ui.custom = vi.fn(
      async (
        factory: (
          tui: unknown,
          theme: unknown,
          kb: unknown,
          done: (value: unknown) => void,
        ) => unknown,
      ) => {
        factory(
          { requestRender: () => {} },
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          undefined,
          (value) => resolveFirst?.(value),
        );
        return await new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    ) as OverlayCtx["ui"]["custom"];

    const secondCtx = makeDialogCtx();

    const pending = tool.execute("tc-4", request, undefined, undefined, firstCtx);
    const second = (await tool.execute("tc-5", request, undefined, undefined, secondCtx)) as {
      details: { kind?: string };
      content: { type: string; text: string }[];
    };

    expect(second.details.kind).toBe("error");
    expect(second.content[0]?.text).toContain("already in flight");

    resolveFirst?.({
      status: "submitted",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "biome", label: "Biome" }],
        },
      },
      missingQuestionIds: [],
    });
    await pending;
  });

  it("emits start and end events around the interaction", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    await tool.execute("tc-6", request, undefined, undefined, makeDialogCtx());

    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:start", {
      source: "supi-ask-user",
    });
    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:end", {
      source: "supi-ask-user",
    });
  });
});
