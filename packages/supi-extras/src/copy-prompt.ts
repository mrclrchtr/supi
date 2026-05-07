/**
 * Copy-prompt extension for pi.
 *
 * Provides `Alt+C` (Option+C) to copy the current editor text to the system
 * clipboard, with a visual notification on success or failure.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyToClipboard } from "./clipboard.ts";

/** Register the Alt+C copy-prompt shortcut. */
export default function copyPrompt(pi: ExtensionAPI) {
  pi.registerShortcut("alt+c", {
    description: "Copy current editor text to clipboard",
    handler: async (ctx) => {
      const text = ctx.ui.getEditorText();
      if (!text.trim()) {
        ctx.ui.notify("Editor is empty — nothing to copy", "warning");
        return;
      }

      const ok = await copyToClipboard(text, ctx.cwd, pi);
      ctx.ui.notify(
        ok ? "Copied to clipboard" : "Failed to copy to clipboard",
        ok ? "info" : "error",
      );
    },
  });
}
