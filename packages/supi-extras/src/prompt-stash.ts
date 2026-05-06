/**
 * Prompt stash extension for pi.
 *
 * Provides `Alt+S` to stash the current editor text, `Ctrl+Shift+S` to copy
 * it to the system clipboard, and `/stash`, `/stash-copy`, `/stash-clear`
 * commands for browsing and managing stashed drafts.
 *
 * Stashes are persisted to ~/.pi/agent/supi/prompt-stash.json so they survive
 * pi restarts. On I/O errors the stash falls back to in-memory-only operation.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** In-memory stash entry. */
interface Stash {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

/** Storage directory relative to the user's home directory. */
const STORAGE_RELATIVE_DIR = ".pi/agent/supi";
const STASH_FILE = "prompt-stash.json";

/** Resolve the absolute path to the stash persistence file. */
function getStashFilePath(): string {
  return join(homedir(), STORAGE_RELATIVE_DIR, STASH_FILE);
}

/** Attempt to parse stashes from a raw JSON value. Returns null on failure. */
function parseStashEntries(raw: unknown): Map<string, Stash> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const map = new Map<string, Stash>();
  for (const [id, entry] of Object.entries(raw)) {
    if (entry && typeof entry === "object") {
      map.set(id, entry as Stash);
    }
  }
  return map.size > 0 ? map : null;
}

/**
 * Load stashes from disk. Returns an empty map when the file does not exist
 * or cannot be parsed — the stash degrades gracefully to in-memory-only.
 */
function loadStashesFromDisk(): Map<string, Stash> {
  let content: string;
  try {
    content = readFileSync(getStashFilePath(), "utf-8");
  } catch (err) {
    // ENOENT on first run is expected — warn on all other errors
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      // biome-ignore lint/suspicious/noConsole: deliberate degradation warning
      console.warn("[supi-extras] Failed to load prompt stash from disk, starting fresh:", err);
    }
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: deliberate degradation warning
    console.warn("[supi-extras] Failed to parse prompt stash file, starting fresh:", err);
    return new Map();
  }

  const root =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  if (!root) return new Map();

  return parseStashEntries(root.stashes) ?? new Map();
}

/**
 * Save stashes to disk. Silently ignores write errors so a read-only
 * filesystem never breaks the stash in-memory.
 */
function saveStashesToDisk(stashes: Map<string, Stash>): void {
  try {
    const filePath = getStashFilePath();
    mkdirSync(dirname(filePath), { recursive: true });

    const data: Record<string, Stash> = {};
    for (const [id, stash] of stashes) {
      data[id] = stash;
    }

    writeFileSync(filePath, `${JSON.stringify({ stashes: data }, null, 2)}\n`, "utf-8");
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: deliberate degradation warning
    console.warn(
      "[supi-extras] Failed to persist prompt stash to disk, continuing in-memory:",
      err,
    );
  }
}

/** Persisted stash store. Loaded from disk at module init. */
const STASHES = loadStashesFromDisk();

/** Reset stashes — intended for tests only. Also clears the persisted file. */
export function _resetStashes(): void {
  STASHES.clear();
  saveStashesToDisk(STASHES);
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

/**
 * Build action-prefixed entries for the stash picker, newest first.
 *
 * Each stash appears three times — once per action — with a short prefix:
 *   [R] My prompt
 *   [C] My prompt
 *   [D] My prompt
 *
 * Duplicate names get a counter appended for disambiguation.
 */
interface StashPickerEntry {
  label: string;
  stashId: string;
  action: "restore" | "copy" | "delete";
}

function getStashPicker(): StashPickerEntry[] {
  const sorted = Array.from(STASHES.values()).sort((a, b) => b.createdAt - a.createdAt);

  // Track how many times each name has been used to handle duplicates
  const nameCount = new Map<string, number>();
  const entries: StashPickerEntry[] = [];

  for (const stash of sorted) {
    const count = (nameCount.get(stash.name) ?? 0) + 1;
    nameCount.set(stash.name, count);

    const baseName = count === 1 ? stash.name : `${stash.name} (${count})`;

    for (const action of ["restore", "copy", "delete"] as const) {
      const prefix = action === "restore" ? "R" : action === "copy" ? "C" : "D";
      entries.push({ label: `[${prefix}] ${baseName}`, stashId: stash.id, action });
    }
  }

  return entries;
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
      saveStashesToDisk(STASHES);
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

  async function confirmAndClearAll(
    ctx: import("@mariozechner/pi-coding-agent").ExtensionCommandContext,
  ): Promise<void> {
    const stashCount = STASHES.size;
    const ok = await ctx.ui.confirm("Clear all?", `Delete ${stashCount} stashed prompt(s)?`);
    if (!ok) return;
    STASHES.clear();
    saveStashesToDisk(STASHES);
    ctx.ui.notify("All stashes cleared", "info");
  }

  async function runStashAction(
    stash: Stash,
    action: "restore" | "copy" | "delete",
    ctx: import("@mariozechner/pi-coding-agent").ExtensionCommandContext,
  ): Promise<void> {
    if (action === "restore") {
      ctx.ui.setEditorText(stash.text);
      ctx.ui.notify(`Restored: "${stash.name}"`, "info");
    } else if (action === "copy") {
      const ok = await copyToClipboard(stash.text, ctx.cwd, pi);
      ctx.ui.notify(
        ok ? `Copied "${stash.name}" to clipboard` : "Failed to copy to clipboard",
        ok ? "info" : "error",
      );
    } else if (action === "delete") {
      STASHES.delete(stash.id);
      saveStashesToDisk(STASHES);
      ctx.ui.notify(`Deleted: "${stash.name}"`, "info");
    }
  }

  pi.registerCommand("supi-stash", {
    description: "Browse, restore, copy, delete, or clear all stashed prompts",
    handler: async (_args, ctx) => {
      const entries = getStashPicker();
      if (entries.length === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const labelMap = new Map(entries.map((e) => [e.label, e] as const));
      const pickList = ["[clear-all] ✕ Clear all stashes", ...entries.map((e) => e.label)];
      const label = await ctx.ui.select("Pick a stash:", pickList);
      if (!label) return;

      if (label.startsWith("[clear-all]")) {
        await confirmAndClearAll(ctx);
        return;
      }

      const entry = labelMap.get(label);
      if (!entry) {
        ctx.ui.notify("Stash not found", "error");
        return;
      }

      const stash = STASHES.get(entry.stashId);
      if (!stash) {
        ctx.ui.notify("Stash not found", "error");
        return;
      }

      await runStashAction(stash, entry.action, ctx);
    },
  });

  pi.on("session_shutdown", () => {
    saveStashesToDisk(STASHES);
  });
}
