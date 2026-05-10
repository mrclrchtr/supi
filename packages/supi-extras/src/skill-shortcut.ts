import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";

/**
 * Extension: `$` as a shortcut prefix for skills.
 *
 * - `$agent-browser` expands to `/skill:agent-browser`
 * - Autocomplete triggers on `$` showing only skill names
 * - Works anywhere in the prompt (after space or at start)
 */

const DELIMITERS = new Set([" ", "\t", "\n"]);

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

// ── Extension entry point ─────────────────────────────────────────

/**
 * Register `$skill-name` → `/skill:skill-name` expansion and autocomplete.
 *
 * ## Behavior gotchas
 *
 * - Installed skill names are snapshotted at `session_start` via
 *   `pi.getCommands()`; after adding or removing skills, use `/reload` or
 *   start a new session before testing expansion behavior.
 * - Outside `$...` tokens, autocomplete must delegate back to the current
 *   provider so built-in completion and file completion continue to work.
 *
 * ## Testing
 *
 * If behavior changes, test both:
 * - expansion inside `$...` tokens
 * - normal autocomplete everywhere else
 */
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

    // Stack skill autocomplete on top of the built-in provider.
    // addAutocompleteProvider takes a wrapper callback: (current) => provider.
    ctx.ui.addAutocompleteProvider((current) => ({
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const textBeforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
        const dollarPrefix = extractDollarPrefix(textBeforeCursor);

        if (!dollarPrefix || dollarPrefix.includes(" ")) {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }

        const query = dollarPrefix.slice(1);
        const items = skillCommands.map((c) => ({
          name: c.name,
          description: c.description,
        }));
        const filtered = fuzzyFilter(items, query, (i) => i.name).map((i) => ({
          value: i.name,
          label: i.name,
          ...(i.description && { description: i.description }),
        }));
        return filtered.length
          ? { items: filtered, prefix: dollarPrefix }
          : current.getSuggestions(lines, cursorLine, cursorCol, options);
      },
      // biome-ignore lint/complexity/useMaxParams: AutocompleteProvider interface
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
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
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      },
      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
      },
    }));
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
