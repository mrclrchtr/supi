/**
 * Prompt stash extension for pi.
 *
 * Provides `Alt+S` to stash the current editor text, `Ctrl+Shift+S` to copy
 * it to the system clipboard, and `/stash`, `/stash-copy`, `/stash-clear`
 * commands for browsing and managing stashed drafts.
 *
 * Stashes are kept in-memory (session-scoped, not persisted).
 */
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** In-memory stash entry. */
interface Stash {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

/** Session-scoped stash store. Cleared on session shutdown or `/stash-clear`. */
const STASHES = new Map<string, Stash>();

/** Reset stashes — intended for tests only. */
export function _resetStashes(): void {
  STASHES.clear();
}

/** Generate a unique stash id. */
function generateId(): string {
  return `stash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Derive a default name from the first line of the prompt text.
 * Falls back to "Untitled" for empty input.
 */
function generateName(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 40) return firstLine;
  if (firstLine.length > 40) return `${firstLine.slice(0, 37)}...`;
  return "Untitled";
}

/** Build selectable labels for the TUI `select` dialog, newest first. */
function getStashLabels(): string[] {
  return Array.from(STASHES.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => `[${s.id}] ${s.name}`);
}

/** Extract the stash id from a label formatted as `[id] name`. */
function parseStashId(label: string): string | undefined {
  const match = label.match(/^\[([^\]]+)\]/);
  return match?.[1];
}

/**
 * Copy text to the system clipboard using the best available tool for the
 * current platform (macOS `pbcopy`, Linux `wl-copy`/`xclip`, Windows
 * `powershell Set-Clipboard`). Writes to a temp file and pipes it in.
 */
async function copyToClipboard(text: string, cwd: string, pi: ExtensionAPI): Promise<boolean> {
  const tmpFile = join(tmpdir(), `pi-stash-clipboard-${Date.now()}.txt`);

  try {
    writeFileSync(tmpFile, text, "utf8");

    const platform = process.platform;
    let result: { code: number; stdout: string; stderr: string };

    if (platform === "darwin") {
      result = await pi.exec("sh", ["-c", `pbcopy < "${tmpFile}"`], {
        timeout: 2000,
        cwd,
      });
    } else if (platform === "linux") {
      result = await pi.exec(
        "sh",
        [
          "-c",
          `if command -v wl-copy >/dev/null 2>&1; then wl-copy < "${tmpFile}"; elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard < "${tmpFile}"; else exit 1; fi`,
        ],
        { timeout: 3000, cwd },
      );
    } else if (platform === "win32") {
      result = await pi.exec(
        "powershell",
        ["-Command", `Get-Content -Path '${tmpFile.replace(/'/g, "''")}' -Raw | Set-Clipboard`],
        { timeout: 5000, cwd },
      );
    } else {
      return false;
    }

    return result.code === 0;
  } catch {
    return false;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore temp file cleanup errors */
    }
  }
}

/** Register the prompt-stash shortcuts and commands. */
export default function promptStash(pi: ExtensionAPI) {
  pi.registerShortcut("alt+s", {
    description: "Stash current editor text",
    handler: async (ctx) => {
      const text = ctx.ui.getEditorText();
      if (!text.trim()) {
        ctx.ui.notify("Editor is empty — nothing to stash", "warning");
        return;
      }

      const defaultName = generateName(text);
      const name = await ctx.ui.input("Stash name:", defaultName);
      if (name === undefined) return;

      const id = generateId();
      STASHES.set(id, {
        id,
        name: name || defaultName,
        text,
        createdAt: Date.now(),
      });
      ctx.ui.setEditorText("");
      ctx.ui.notify(`Stashed: "${name || defaultName}"`, "info");
    },
  });

  pi.registerShortcut("ctrl+shift+s", {
    description: "Copy current editor text to clipboard",
    handler: async (ctx) => {
      const text = ctx.ui.getEditorText();
      if (!text) {
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

  pi.registerCommand("stash", {
    description: "Browse and restore stashed prompts",
    handler: async (_args, ctx) => {
      const labels = getStashLabels();
      if (labels.length === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const label = await ctx.ui.select("Restore stash:", labels);
      if (!label) return;

      const id = parseStashId(label);
      if (!id) return;

      const stash = STASHES.get(id);
      if (!stash) {
        ctx.ui.notify("Stash not found", "error");
        return;
      }

      ctx.ui.setEditorText(stash.text);
      ctx.ui.notify(`Restored: "${stash.name}"`, "info");
    },
  });

  pi.registerCommand("stash-copy", {
    description: "Copy a stashed prompt to clipboard",
    handler: async (_args, ctx) => {
      const labels = getStashLabels();
      if (labels.length === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const label = await ctx.ui.select("Copy stash to clipboard:", labels);
      if (!label) return;

      const id = parseStashId(label);
      if (!id) return;

      const stash = STASHES.get(id);
      if (!stash) {
        ctx.ui.notify("Stash not found", "error");
        return;
      }

      const ok = await copyToClipboard(stash.text, ctx.cwd, pi);
      ctx.ui.notify(
        ok ? `Copied "${stash.name}" to clipboard` : "Failed to copy to clipboard",
        ok ? "info" : "error",
      );
    },
  });

  pi.registerCommand("stash-clear", {
    description: "Clear all stashed prompts",
    handler: async (_args, ctx) => {
      const labels = getStashLabels();
      if (labels.length === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const ok = await ctx.ui.confirm("Clear all?", `Delete ${labels.length} stashed prompt(s)?`);
      if (!ok) return;

      STASHES.clear();
      ctx.ui.notify("All stashes cleared", "info");
    },
  });
}
