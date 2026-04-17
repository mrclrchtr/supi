import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  fuzzyFilter,
} from "@mariozechner/pi-tui";

/**
 * Extension: `$` as a shortcut prefix for skills.
 *
 * - `$agent-browser` expands to `/skill:agent-browser`
 * - Autocomplete triggers on `$` showing only skill names
 * - Works anywhere in the prompt (after space or at start)
 */

const DELIMITERS = new Set([" ", "\t", "\n"]);

type EditorInternals = {
  autocompleteState?: unknown;
  state?: {
    lines?: string[];
    cursorLine?: number;
    cursorCol?: number;
  };
  tryTriggerAutocomplete?: () => void;
};

/** Find the `$token` at the cursor, or null if not in one. */
function extractDollarPrefix(textBeforeCursor: string): string | null {
  // Walk backwards to find the start of the current token
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const char = textBeforeCursor[i];
    if (char && DELIMITERS.has(char)) {
      // Hit a delimiter — the token starts at i+1
      const token = textBeforeCursor.slice(i + 1);
      return token.startsWith("$") ? token : null;
    }
  }
  // Reached start of line
  return textBeforeCursor.startsWith("$") ? textBeforeCursor : null;
}

// ── Autocomplete wrapper ────────────────────────────────────────────

class SkillShortcutAutocomplete implements AutocompleteProvider {
  constructor(
    private inner: AutocompleteProvider,
    private skillCommands: { name: string; description?: string }[],
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
    const dollarPrefix = extractDollarPrefix(textBeforeCursor);

    if (dollarPrefix && !dollarPrefix.includes(" ")) {
      const query = dollarPrefix.slice(1); // strip "$"
      const items = this.skillCommands.map((c) => ({
        name: c.name,
        description: c.description,
      }));
      const filtered = fuzzyFilter(items, query, (i) => i.name).map((i) => ({
        value: i.name,
        label: i.name,
        ...(i.description && { description: i.description }),
      }));
      return filtered.length ? { items: filtered, prefix: dollarPrefix } : null;
    }

    return this.inner.getSuggestions(lines, cursorLine, cursorCol, options);
  }

  // biome-ignore lint/complexity/useMaxParams: This method must match the AutocompleteProvider interface.
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ) {
    if (prefix.startsWith("$")) {
      const line = lines[cursorLine] || "";
      const before = line.slice(0, cursorCol - prefix.length);
      const after = line.slice(cursorCol);
      const newLine = `${before}$${item.value} ${after}`;
      return {
        lines: [...lines.slice(0, cursorLine), newLine, ...lines.slice(cursorLine + 1)],
        cursorLine,
        cursorCol: before.length + 1 + item.value.length + 1,
      };
    }
    return this.inner.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }
}

// ── Custom editor ───────────────────────────────────────────────────

class SkillShortcutEditor extends CustomEditor {
  private _skillCommands: { name: string; description?: string }[] = [];

  setSkillCommands(cmds: { name: string; description?: string }[]) {
    this._skillCommands = cmds;
  }

  override setAutocompleteProvider(provider: AutocompleteProvider) {
    super.setAutocompleteProvider(new SkillShortcutAutocomplete(provider, this._skillCommands));
  }

  override handleInput(data: string): void {
    const self = this as unknown as EditorInternals;
    const wasShowingAutocomplete = !!self.autocompleteState;

    super.handleInput(data);

    // Don't interfere when autocomplete is already active —
    // super already handled arrow keys / updateAutocomplete.
    if (wasShowingAutocomplete) return;

    // After a printable character, check if we're now in a $ context.
    // Skip for control sequences (arrows, enter, escape, etc.)
    if (data.length !== 1 || data.charCodeAt(0) < 32) return;

    // biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals
    const lines: string[] | undefined = (self as any).state?.lines;
    // biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals
    const cursorLine: number | undefined = (self as any).state?.cursorLine;
    // biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals
    const cursorCol: number | undefined = (self as any).state?.cursorCol;
    if (!lines || cursorLine === undefined || cursorCol === undefined) return;

    const textBeforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
    const dollarPrefix = extractDollarPrefix(textBeforeCursor);

    if (dollarPrefix) {
      self.tryTriggerAutocomplete?.();
    }
  }
}

// ── Extension entry point ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let skillNames: string[] = [];
  let skillCommands: { name: string; description?: string }[] = [];

  pi.on("session_start", (_event, ctx) => {
    const commands = pi.getCommands();
    skillCommands = commands
      .filter((c) => c.source === "skill")
      .map((c) => ({
        name: c.name.replace(/^skill:/, ""),
        description: c.description,
      }));
    skillNames = skillCommands.map((c) => c.name);

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new SkillShortcutEditor(tui, theme, keybindings);
      editor.setSkillCommands(skillCommands);
      return editor;
    });
  });

  // Transform $skill-name → /skill:skill-name before agent processing
  pi.on("input", (event) => {
    const text = event.text.trim();

    // Find all $skill-name tokens and replace them
    const transformed = text.replace(/(?:^|(?<=\s))\$([a-z0-9][-a-z0-9]*)/g, (_match, name) => {
      return skillNames.includes(name) ? `/skill:${name}` : _match;
    });

    if (transformed !== text) {
      return { action: "transform" as const, text: transformed };
    }
    return { action: "continue" as const };
  });
}
