import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import askUserExtension from "../../src/ask-user.ts";

type PiApi = ReturnType<typeof createPiMock> & ExtensionAPI;

type BaseUi = Omit<ReturnType<typeof makeCtx>["ui"], "custom">;

type UnsupportedCtx = Omit<ReturnType<typeof makeCtx>, "ui"> & {
  abort: ReturnType<typeof vi.fn>;
  ui: BaseUi & {
    custom?: undefined;
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

function makeUnsupportedCtx(): UnsupportedCtx {
  const ctx = makeCtx({ hasUI: true, abort: vi.fn() }) as unknown as UnsupportedCtx;
  ctx.ui.custom = undefined;
  ctx.ui.setWorkingVisible = vi.fn();
  return ctx;
}

function makeOverlayCtx(result: unknown): OverlayCtx {
  const ctx = makeCtx({ hasUI: true, abort: vi.fn() }) as unknown as OverlayCtx;
  ctx.ui.setWorkingVisible = vi.fn();
  ctx.ui.custom = vi.fn(
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
        () => {},
      );
      return result;
    },
  ) as OverlayCtx["ui"]["custom"];
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
      makeUnsupportedCtx(),
    )) as { content: { type: string; text: string }[]; details: { kind?: string } };

    expect(result.content[0]?.text).toContain("supports 1-4 questions only");
    expect(result.details.kind).toBe("error");
  });

  it("returns an error when custom overlay support is unavailable", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeUnsupportedCtx();

    const result = (await tool.execute("tc-2", request, undefined, undefined, ctx)) as {
      content: { type: string; text: string }[];
      details: { kind?: string };
    };

    expect(result.details.kind).toBe("error");
    expect(result.content[0]?.text).toContain("requires a TUI with custom overlay support");
  });

  it("records successful overlay submissions without aborting", async () => {
    const pi = createPiMock({ sessionName: "My Session" }) as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeOverlayCtx({
      status: "submitted",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "biome", label: "Biome", note: "Use repo defaults" }],
        },
      },
      missingQuestionIds: [],
    });

    const result = (await tool.execute("tc-3", request, undefined, undefined, ctx)) as {
      content: { type: string; text: string }[];
      details: { status: string; answersById: Record<string, unknown> };
    };

    expect(result.details.status).toBe("submitted");
    expect(result.details.answersById).toMatchObject({
      formatter: {
        kind: "choice",
        selections: [{ value: "biome", label: "Biome", note: "Use repo defaults" }],
      },
    });
    expect(result.content[0]?.text).toContain("Formatter: Biome (note: Use repo defaults)");
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.entries[0]?.type).toContain("ask_user");
  });

  it("aborts the turn when the overlay result is cancelled", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");
    const ctx = makeOverlayCtx({
      status: "cancelled",
      answersById: {},
      missingQuestionIds: ["formatter"],
    });

    const result = (await tool.execute("tc-4", request, undefined, undefined, ctx)) as {
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
          () => {},
        );
        return await new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    ) as OverlayCtx["ui"]["custom"];

    const secondCtx = makeUnsupportedCtx();

    const pending = tool.execute("tc-5", request, undefined, undefined, firstCtx);
    const second = (await tool.execute("tc-6", request, undefined, undefined, secondCtx)) as {
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

  it("emits start and end events around successful overlay interaction", async () => {
    const pi = createPiMock() as unknown as PiApi;
    askUserExtension(pi);
    const tool = getTool(pi, "ask_user");

    await tool.execute(
      "tc-7",
      request,
      undefined,
      undefined,
      makeOverlayCtx({ status: "submitted", answersById: {}, missingQuestionIds: [] }),
    );

    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:start", {
      source: "supi-ask-user",
    });
    expect(pi.events.emit).toHaveBeenCalledWith("supi:ask-user:end", {
      source: "supi-ask-user",
    });
  });
});
