import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { GhostTextEditor } from "../../src/editor/editor.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCallbacks() {
  return {
    onAccept: vi.fn(),
    onDismiss: vi.fn(),
    onInput: vi.fn(),
  };
}

// GhostTextEditor extends CustomEditor which requires real TUI/theme/keybindings.
// We use minimal stubs that satisfy the CustomEditor constructor.
function makeStubs(matches: (data: string, action: string) => boolean = () => false) {
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
      matches,
      getKeys: () => [],
    },
  };
}

function makeEditor(
  callbacks = makeCallbacks(),
  matches?: (data: string, action: string) => boolean,
) {
  const { tui, theme, keybindings } = makeStubs(matches);
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

  it("wraps a long suggestion and renders all of it", () => {
    const editor = makeEditor();
    editor.focused = true;
    const suggestion = "alpha beta gamma delta epsilon";
    editor.setSuggestion(suggestion);

    const result = editor.render(20);

    expect(result.length).toBeGreaterThan(3);
    for (const word of suggestion.split(" ")) {
      expect(result.some((line) => line.includes(word))).toBe(true);
    }
    expect(result.some((line) => line.includes("…"))).toBe(false);
    expect(result.slice(1, -1).every((line) => visibleWidth(line) <= 20)).toBe(true);
  });

  it("renders explicit suggestion line breaks", () => {
    const editor = makeEditor();
    editor.focused = true;
    editor.setSuggestion("first line\nsecond line");

    const result = editor.render(80);
    const firstLine = result.findIndex((line) => line.includes("first line"));
    const secondLine = result.findIndex((line) => line.includes("second line"));

    expect(firstLine).toBeGreaterThan(0);
    expect(secondLine).toBe(firstLine + 1);
    expect(result.some((line) => line.includes("\n"))).toBe(false);
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

  it("inserts the full suggestion after a wrapped preview", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);
    const suggestion = "alpha beta gamma delta epsilon";
    editor.setSuggestion(suggestion);

    editor.handleInput("\x1b[C");

    expect(cbs.onAccept).toHaveBeenCalledWith(suggestion);
  });

  it("suppresses a suggestion during edits and restores it when the editor is empty", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);
    editor.focused = true;
    editor.setSuggestion("suggest");

    editor.handleInput("h");
    expect(editor.render(80).some((line) => line.includes("suggest"))).toBe(false);
    expect(cbs.onDismiss).not.toHaveBeenCalled();

    editor.handleInput("\x7f");
    expect(editor.render(80).some((line) => line.includes("suggest"))).toBe(true);

    editor.setText("draft");
    expect(editor.render(80).some((line) => line.includes("suggest"))).toBe(false);

    editor.setText("");
    expect(editor.render(80).some((line) => line.includes("suggest"))).toBe(true);
  });

  it("consumes Escape after dismissing a suggestion", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs, (data, action) => data === "\x1b" && action === "app.interrupt");
    const onEscape = vi.fn();
    editor.onEscape = onEscape;
    editor.setSuggestion("suggest");

    editor.handleInput("\x1b");

    expect(cbs.onDismiss).toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("notifies and forwards all input to super when no suggestion", () => {
    const cbs = makeCallbacks();
    const editor = makeEditor(cbs);

    // No suggestion set — all input passes through to super (CustomEditor).
    // The lifecycle uses onInput to abort any pending generation.
    expect(() => editor.handleInput("x")).not.toThrow();
    expect(cbs.onInput).toHaveBeenCalledTimes(1);
    expect(cbs.onAccept).not.toHaveBeenCalled();
    expect(cbs.onDismiss).not.toHaveBeenCalled();

    expect(() => editor.handleInput("\x1b[C")).not.toThrow();
    expect(cbs.onInput).toHaveBeenCalledTimes(2);
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
