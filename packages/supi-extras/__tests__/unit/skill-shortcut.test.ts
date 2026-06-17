import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import skillShortcut from "../../src/skill-shortcut.ts";

type FallbackProvider = {
  getSuggestions: ReturnType<typeof vi.fn>;
  applyCompletion: ReturnType<typeof vi.fn>;
  shouldTriggerFileCompletion?: ReturnType<typeof vi.fn>;
};

type WrappedProvider = {
  triggerCharacters: string[];
  getSuggestions: (...args: unknown[]) => unknown;
  applyCompletion: (...args: unknown[]) => unknown;
  shouldTriggerFileCompletion: (...args: unknown[]) => unknown;
};

function setupExtension() {
  const pi = createPiMock() as ReturnType<typeof createPiMock> & {
    getCommands: ReturnType<typeof vi.fn>;
  };
  pi.getCommands = vi.fn(() => [
    { name: "skill:agent-browser", source: "skill", description: "Browse the web" },
    { name: "skill:reviewer", source: "skill", description: "Review code" },
    { name: "supi-settings", source: "extension", description: "Settings" },
  ]);

  skillShortcut(pi as unknown as Parameters<typeof skillShortcut>[0]);

  return pi;
}

describe("skillShortcut extension", () => {
  it("registers a $ trigger character for autocomplete", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: vi.fn(),
    });

    expect(provider.triggerCharacters).toEqual(["$"]);
  });

  it("transforms known $skill tokens into /skill commands", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const input = getHandlerOrThrow(pi, "input");

    await sessionStart(
      { reason: "startup" },
      makeCtx({ ui: { addAutocompleteProvider: vi.fn() } }),
    );

    expect(input({ text: "Use $agent-browser then $unknown" })).toEqual({
      action: "transform",
      text: "Use /skill:agent-browser then $unknown",
    });
  });

  it("returns continue when no $skill transform applies", () => {
    const pi = setupExtension();
    const input = getHandlerOrThrow(pi, "input");

    expect(input({ text: "plain text without dollars" })).toEqual({
      action: "continue",
    });
  });

  it("returns skill suggestions inside $ tokens", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: vi.fn(),
    });

    await expect(provider.getSuggestions(["Use $ag"], 0, 7, {})).resolves.toEqual({
      prefix: "$ag",
      items: [
        expect.objectContaining({
          value: "agent-browser",
          label: "agent-browser",
          description: "Browse the web",
        }),
      ],
    });
  });

  it("applies a selected skill completion with trailing space", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: vi.fn(),
    });

    expect(
      provider.applyCompletion(
        ["Use $ag"],
        0,
        7,
        { value: "agent-browser", label: "agent-browser" },
        "$ag",
      ),
    ).toEqual({
      lines: ["Use $agent-browser "],
      cursorLine: 0,
      cursorCol: 19,
    });
  });

  it("delegates applyCompletion when prefix does not start with $", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();
    const fallbackResult = { lines: ["/review "], cursorLine: 0, cursorCol: 8 };
    const fallbackApplyCompletion = vi.fn(() => fallbackResult);

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: fallbackApplyCompletion,
      shouldTriggerFileCompletion: vi.fn(),
    });

    expect(
      provider.applyCompletion(["/re"], 0, 3, { value: "review", label: "review" }, "/re"),
    ).toEqual(fallbackResult);
    expect(fallbackApplyCompletion).toHaveBeenCalledWith(
      ["/re"],
      0,
      3,
      { value: "review", label: "review" },
      "/re",
    );
  });

  it("delegates getSuggestions for $ tokens when no skills match", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();
    const fallbackResult = { items: [{ value: "fallback", label: "fallback" }], prefix: "$zz" };
    const fallbackGetSuggestions = vi.fn(async () => fallbackResult);

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: fallbackGetSuggestions,
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: vi.fn(),
    });

    await expect(provider.getSuggestions(["Use $zz"], 0, 7, {})).resolves.toEqual(fallbackResult);
    expect(fallbackGetSuggestions).toHaveBeenCalledOnce();
  });

  it("delegates autocomplete outside $ tokens", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();
    const fallbackResult = { items: [{ value: "fallback", label: "fallback" }], prefix: "re" };
    const fallbackGetSuggestions = vi.fn(async () => fallbackResult);

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: fallbackGetSuggestions,
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: vi.fn(),
    });

    await expect(provider.getSuggestions(["review this"], 0, 2, {})).resolves.toEqual(
      fallbackResult,
    );
    expect(fallbackGetSuggestions).toHaveBeenCalledOnce();
  });

  it("delegates shouldTriggerFileCompletion to the fallback provider", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();
    const fallbackShouldTriggerFileCompletion = vi.fn(() => false);

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: vi.fn(),
      shouldTriggerFileCompletion: fallbackShouldTriggerFileCompletion,
    });

    expect(provider.shouldTriggerFileCompletion(["Use $ag"], 0, 7)).toBe(false);
    expect(fallbackShouldTriggerFileCompletion).toHaveBeenCalledWith(["Use $ag"], 0, 7);
  });

  it("defaults shouldTriggerFileCompletion to true when the fallback omits it", async () => {
    const pi = setupExtension();
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const addAutocompleteProvider = vi.fn();

    await sessionStart({ reason: "startup" }, makeCtx({ ui: { addAutocompleteProvider } }));

    const wrapper = addAutocompleteProvider.mock.calls[0][0] as (
      current: FallbackProvider,
    ) => WrappedProvider;
    const provider = wrapper({
      getSuggestions: vi.fn(),
      applyCompletion: vi.fn(),
    });

    expect(provider.shouldTriggerFileCompletion(["Use $ag"], 0, 7)).toBe(true);
  });
});
