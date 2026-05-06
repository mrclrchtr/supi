/**
 * Prompt stash extension for pi.
 *
 * Provides `Alt+S` to stash the current editor text, `Ctrl+Shift+S` to copy
 * it to the system clipboard, and `/supi-stash` for browsing and managing
 * stashed drafts with a keyboard-driven overlay picker.
 *
 * Stashes are persisted to ~/.pi/agent/supi/prompt-stash.json so they survive
 * pi restarts. On I/O errors the stash falls back to in-memory-only operation.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@mariozechner/pi-tui";

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

/** A stash-specific action result from the picker. */
type StashActionResult = { action: "restore" | "copy" | "delete"; stash: Stash };

/** Result returned from the stash picker overlay. */
type StashPickerResult = StashActionResult | { action: "clear-all" } | null;

/**
 * Handle a single-key action shortcut for a selected stash item.
 * Returns true if the key was consumed, false to fall through to SelectList.
 */
function handleActionKey(
  item: SelectItem,
  data: string,
  doneFn: (r: StashPickerResult) => void,
): boolean {
  if (item.value === "__clear-all__") {
    if (data !== "d") return false;
    doneFn({ action: "clear-all" });
    return true;
  }

  const stash = STASHES.get(item.value);
  if (!stash) return false;

  if (data === "r") {
    doneFn({ action: "restore", stash });
    return true;
  }
  if (data === "c") {
    doneFn({ action: "copy", stash });
    return true;
  }
  if (data === "d") {
    doneFn({ action: "delete", stash });
    return true;
  }
  return false;
}

/**
 * Build the custom overlay component for the stash picker.
 *
 * Returns a promise that resolves to the selected action + stash,
 * or null if cancelled.
 */
function showStashPickerOverlay(
  items: SelectItem[],
  ctx: ExtensionContext,
): Promise<StashPickerResult> {
  return ctx.ui.custom<StashPickerResult>(
    (tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold("  Stashed Prompts"))));
      container.addChild(new Spacer(1));

      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (text: string) => theme.fg("accent", text),
        selectedText: (text: string) => theme.fg("accent", text),
        description: (text: string) => theme.fg("muted", text),
        scrollInfo: (text: string) => theme.fg("dim", text),
        noMatch: (text: string) => theme.fg("warning", text),
      });

      selectList.onSelect = (item) => {
        if (item.value === "__clear-all__") {
          done({ action: "clear-all" });
          return;
        }
        const stash = STASHES.get(item.value);
        if (stash) done({ action: "restore", stash });
      };

      selectList.onCancel = () => done(null);

      container.addChild(selectList);
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg("dim", "  r:restore  c:copy  d:delete  enter:restore  esc:cancel")),
      );
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          const item = selectList.getSelectedItem();
          if (item && handleActionKey(item, data, done)) return;
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    },
    { overlay: true },
  );
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

  async function executeStashResult(
    result: StashActionResult,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (result.action === "restore") {
      ctx.ui.setEditorText(result.stash.text);
      ctx.ui.notify(`Restored: "${result.stash.name}"`, "info");
      return;
    }

    if (result.action === "copy") {
      const ok = await copyToClipboard(result.stash.text, ctx.cwd, pi);
      ctx.ui.notify(
        ok ? `Copied "${result.stash.name}" to clipboard` : "Failed to copy to clipboard",
        ok ? "info" : "error",
      );
      return;
    }

    // delete
    STASHES.delete(result.stash.id);
    saveStashesToDisk(STASHES);
    ctx.ui.notify(`Deleted: "${result.stash.name}"`, "info");
  }

  pi.registerCommand("supi-stash", {
    description: "Browse, restore, copy, delete, or clear all stashed prompts",
    handler: async (_args, ctx) => {
      const sorted = Array.from(STASHES.values()).sort((a, b) => b.createdAt - a.createdAt);
      if (sorted.length === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const items: SelectItem[] = [
        { value: "__clear-all__", label: "✕ Clear all stashes" },
        ...sorted.map((s) => ({ value: s.id, label: s.name })),
      ];

      const result = await showStashPickerOverlay(items, ctx);
      if (!result) return;

      if (result.action === "clear-all") {
        const ok = await ctx.ui.confirm("Clear all?", `Delete ${sorted.length} stashed prompt(s)?`);
        if (!ok) return;
        STASHES.clear();
        saveStashesToDisk(STASHES);
        ctx.ui.notify("All stashes cleared", "info");
        return;
      }

      await executeStashResult(result, ctx);
    },
  });

  pi.on("session_shutdown", () => {
    saveStashesToDisk(STASHES);
  });
}
