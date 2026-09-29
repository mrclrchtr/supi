import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GhostTextEditor } from "../../src/editor/editor.ts";
import { createSuggestionWarning } from "../../src/generation/failure.ts";
import type {
  GenerationStatus,
  SuggestionCallbacks,
  SuggestionGenerator,
} from "../../src/generation/generator.ts";
import { SessionLifecycle } from "../../src/session.ts";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

class ControlledGenerator {
  readonly start = vi.fn(
    (_ctx: ExtensionContext, _text: string, callbacks: SuggestionCallbacks) => {
      this.callbacks = callbacks;
    },
  );
  readonly dismiss = vi.fn();
  readonly reset = vi.fn();
  callbacks: SuggestionCallbacks | undefined;
}

function makeFixture() {
  const generator = new ControlledGenerator();
  const baseContext = makeCtx();
  const ctx = makeCtx({
    hasUI: true,
    mode: "tui",
    ui: {
      ...baseContext.ui,
      setEditorComponent: vi.fn(),
    },
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            stopReason: "stop",
            content: [{ type: "text", text: "assistant answer" }],
          },
        },
      ],
      getSessionId: () => "pi-session",
    },
  }) as unknown as ExtensionContext;
  const lifecycle = new SessionLifecycle(generator as unknown as SuggestionGenerator);
  lifecycle.onStart(ctx);
  lifecycle.onAgentSettled(ctx);
  if (!generator.callbacks) throw new Error("Missing generator callbacks");
  return { ctx, generator, lifecycle, callbacks: generator.callbacks };
}

function emit(callbacks: SuggestionCallbacks, status: GenerationStatus): void {
  callbacks.onStatus(status);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionLifecycle suggestion notifications", () => {
  it("keeps ghost ownership and history on the main editor when a form creates an editor", () => {
    const generator = new ControlledGenerator();
    const base = makeCtx();
    const branch = [
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "seeded editor history" }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "assistant answer" }],
        },
      },
    ];
    let editorFactory: EditorFactory | undefined;
    const ctx = makeCtx({
      hasUI: true,
      mode: "tui",
      ui: {
        ...base.ui,
        setEditorComponent: (factory: EditorFactory | undefined) => {
          editorFactory = factory;
        },
      },
      sessionManager: {
        getBranch: () => branch,
        getSessionId: () => "pi-session",
      },
    }) as unknown as ExtensionContext;
    const lifecycle = new SessionLifecycle(generator as unknown as SuggestionGenerator);
    lifecycle.onStart(ctx);
    if (!editorFactory) throw new Error("Missing custom editor factory");

    const tui = { terminal: { rows: 40 }, requestRender: vi.fn() };
    const editorTheme = {
      borderColor: (text: string) => text,
      selectList: {
        selectedPrefix: (text: string) => text,
        selectedText: (text: string) => text,
        description: (text: string) => text,
        scrollInfo: (text: string) => text,
        noMatch: (text: string) => text,
        selectedDescription: (text: string) => text,
        selectedScrollInfo: (text: string) => text,
        cursor: ">",
        paddingLeft: 2,
      },
    };
    const keybindings = { matches: () => false, getKeys: () => [] };
    const mainEditor = editorFactory(
      tui as never,
      editorTheme as never,
      keybindings as never,
    ) as GhostTextEditor;
    const embeddedEditor = editorFactory(
      tui as never,
      editorTheme as never,
      keybindings as never,
    ) as GhostTextEditor;
    lifecycle.onAgentSettled(ctx);
    generator.callbacks?.onStatus({ kind: "ready", suggestion: "main editor suggestion" });

    mainEditor.focused = true;
    embeddedEditor.focused = true;
    expect(mainEditor.render(80).join("\n")).toContain("main editor suggestion");
    expect(embeddedEditor.render(80).join("\n")).not.toContain("main editor suggestion");

    embeddedEditor.handleInput("\u001b[A");
    mainEditor.handleInput("\u001b[A");
    expect(embeddedEditor.getText()).toBe("");
    expect(mainEditor.getText()).toBe("seeded editor history");
  });

  it("renders one bounded warning and clears the spinner", () => {
    const { ctx, callbacks } = makeFixture();
    const warning = createSuggestionWarning("provider/model", "authentication");

    emit(callbacks, { kind: "generating" });
    emit(callbacks, { kind: "error", warning });

    expect(ctx.ui.notify).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Prompt suggestion unavailable for provider/model: authentication failed",
      "warning",
    );
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-prompt-suggestions", "");
  });

  it("formats a safe HTTP status in a warning", () => {
    const { ctx, callbacks } = makeFixture();

    emit(callbacks, {
      kind: "error",
      warning: createSuggestionWarning("provider/model", {
        kind: "billing",
        httpStatus: 401,
        summary: "billing failed",
      }),
    });

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Prompt suggestion unavailable for provider/model: billing failed (HTTP 401)",
      "warning",
    );
  });

  it("keeps empty, idle, and cancellation statuses quiet", () => {
    const { ctx, callbacks } = makeFixture();

    emit(callbacks, { kind: "generating" });
    emit(callbacks, { kind: "idle" });
    emit(callbacks, { kind: "ready", suggestion: "" });

    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it.each([
    [
      "session start",
      (fixture: ReturnType<typeof makeFixture>) => fixture.lifecycle.onStart(fixture.ctx),
    ],
    [
      "settings change",
      (fixture: ReturnType<typeof makeFixture>) => fixture.lifecycle.onSettingsChanged(),
    ],
    ["agent start", (fixture: ReturnType<typeof makeFixture>) => fixture.lifecycle.onAgentStart()],
    ["shutdown", (fixture: ReturnType<typeof makeFixture>) => fixture.lifecycle.onShutdown()],
  ])("ignores a late status after %s", (_name, invalidate) => {
    const fixture = makeFixture();
    invalidate(fixture);
    emit(fixture.callbacks, {
      kind: "error",
      warning: createSuggestionWarning("provider/model", "request"),
    });

    expect(fixture.ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("resets the generator on session start, shutdown, and settings change", () => {
    const fixture = makeFixture();
    fixture.lifecycle.onSettingsChanged();
    fixture.lifecycle.onShutdown();
    fixture.lifecycle.onStart(fixture.ctx);

    expect(fixture.generator.reset).toHaveBeenCalledTimes(4);
  });
});
