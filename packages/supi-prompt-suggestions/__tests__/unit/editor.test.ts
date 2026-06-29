import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { GhostTextEditor } from "../../src/editor/editor.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCallbacks() {
  return {
    onAccept: vi.fn(),
    onDismiss: vi.fn(),
  };
}

// GhostTextEditor extends CustomEditor which requires real TUI/theme/keybindings.
// We use minimal stubs that satisfy the CustomEditor constructor.
function makeStubs() {
  return {
    tui: {
      terminal: { rows: 40 },
      requestRender: vi.fn(),
    },
    theme: {
      borderColor: (s: string) => `─${s}─`,
      selectList: {
        selectedPrefix: (s: string) => s,
        selectedText: (s: string) => s,
        description: (s: string) => s,
        scrollInfo: (s: string) => s,
        noMatch: (s: string) => s,
        selectedDescription: (s: string) => s,
        selectedScrollInfo: (s: string) => s,
        cursor: ">",
        paddingLeft: 2,
      },
    },
    keybindings: {
      matches: () => false,
      getKeys: () => [],
    },
  };
}

function makeEditor(callbacks = makeCallbacks()) {
  const { tui, theme, keybindings } = makeStubs();
  return new GhostTextEditor(tui as never, theme as never, keybindings as never, { callbacks });
}

// ── Rendering ──────────────────────────────────────────────────────────────

describe("GhostTextEditor rendering", () => {
  it("passes through inner render when no suggestion", () => {
    const editor = makeEditor();

    const result = editor.render(80);
    // Editor with empty text renders cursor line + borders
    expect(result.length).toBeGreaterThan(0);
    // No ghost — no suggestion set
    expect(result.some((l) => l.includes("\x1b[2m"))).toBe(false);
  });

  it("passes through inner render when not focused", () => {
    const editor = makeEditor();
    editor.focused = false;
    editor.setSuggestion("suggest");

    const result = editor.render(80);
    expect(result.some((l) => l.includes("suggest"))).toBe(false);
  });

  it("injects ghost text after CURSOR_MARKER when focused", () => {
    const editor = makeEditor();
    editor.focused = true;
    editor.setSuggestion("suggest");

    const result = editor.render(80);
    const line = result.find((l) => l.includes(CURSOR_MARKER));
    expect(line).toBeDefined();
    // biome-ignore lint/security/noSecrets: ANSI escape in test expectation
    expect(line).toContain("\x1b[2msuggest\x1b[0m");
  });

  it("does not inject ghost when CURSOR_MARKER is absent", () => {
    // Editor is not focused, so no CURSOR_MARKER emitted
    const editor = makeEditor();
    editor.focused = false;
    editor.setSuggestion("suggest");

    const result = editor.render(80);
    expect(result.some((l) => l.includes("suggest"))).toBe(false);
  });
});

// ── Input handling ─────────────────────────────────────────────────────────

describe("GhostTextEditor input handling", () => {
  it("accepts suggestion on Right Arrow", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);
    editor.setSuggestion("suggest");

    editor.handleInput("\x1b[C");
    expect(cbs.onAccept).toHaveBeenCalledWith("suggest");
    expect(cbs.onDismiss).not.toHaveBeenCalled();
  });

  it("accepts suggestion on application Right Arrow", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);
    editor.setSuggestion("suggest");

    editor.handleInput("\x1bOC");
    expect(cbs.onAccept).toHaveBeenCalledWith("suggest");
  });

  it("dismisses suggestion on any other input", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);
    editor.setSuggestion("suggest");

    editor.handleInput("h");
    expect(cbs.onDismiss).toHaveBeenCalled();
    expect(cbs.onAccept).not.toHaveBeenCalled();
  });

  it("forwards all input to super when no suggestion", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);

    // No suggestion set — all input passes through to super (CustomEditor)
    // Just verify no crash and no callbacks called
    expect(() => editor.handleInput("x")).not.toThrow();
    expect(cbs.onAccept).not.toHaveBeenCalled();
    expect(cbs.onDismiss).not.toHaveBeenCalled();

    expect(() => editor.handleInput("\x1b[C")).not.toThrow();
    expect(cbs.onAccept).not.toHaveBeenCalled();
  });
});

// ── Ghost API ──────────────────────────────────────────────────────────────

describe("GhostTextEditor ghost API", () => {
  it("clearGhost removes the suggestion", () => {
    const editor = makeEditor();
    editor.setSuggestion("suggest");
    editor.clearGhost();

    editor.focused = true;
    const result = editor.render(80);
    expect(result.some((l) => l.includes("suggest"))).toBe(false);
  });
});
