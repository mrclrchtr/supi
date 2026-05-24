// Custom message renderer for LSP diagnostic context messages.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const LSP_CONTEXT_TYPE = "lsp-context";

/**
 * Register the custom message renderer for LSP diagnostic context messages.
 */
export function registerLspMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(
    LSP_CONTEXT_TYPE,
    // biome-ignore lint/suspicious/noExplicitAny: theme types are not publicly exported
    (message: any, _options: { expanded: boolean }, theme: any) => {
      const content = String(message.content ?? "");
      const lines = content.split("\n");
      const summary =
        lines.length > 1
          ? theme.fg("accent", `🧪 LSP: ${lines[1] ?? "diagnostics"}`)
          : theme.fg("accent", "🧪 LSP diagnostics");
      const display = [summary];
      for (let i = 2; i < Math.min(lines.length, 8); i++) {
        display.push(theme.fg("dim", lines[i]));
      }
      return new Text(display.join("\n"), 0, 0);
    },
  );
}
