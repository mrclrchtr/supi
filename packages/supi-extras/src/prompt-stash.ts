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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@mariozechner/pi-tui";
import { copyToClipboard } from "./clipboard.ts";

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

/** Result returned from the stash picker overlay. */
type StashPickerResult =
  | { action: "restore" | "copy"; stash: Stash }
  | { action: "cleared" }
  | null;

/**
 * Build the custom overlay component for the stash picker.
 *
 * Returns a promise that resolves when the user picks an action
 * (restore, copy, clear-all) or cancels (null).
 *
 * The overlay stays open on single-delete (`d`) and refreshes the list
 * in-place. Close actions: Enter (restore), `c` (copy), `D` (clear-all),
 * Escape (cancel).
 */
function showStashPickerOverlay(ctx: ExtensionContext): Promise<StashPickerResult> {
  return ctx.ui.custom<StashPickerResult>(
    (tui, theme, _kb, done) => {
      const container = new Container();
      let selectList: SelectList;

      function buildItems(): SelectItem[] {
        return Array.from(STASHES.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((s) => ({ value: s.id, label: s.name }));
      }

      function createSelectList(items: SelectItem[], selectedIndex?: number): SelectList {
        const list = new SelectList(items, Math.min(items.length, 10), {
          selectedPrefix: (text: string) => theme.fg("accent", text),
          selectedText: (text: string) => theme.fg("accent", text),
          description: (text: string) => theme.fg("muted", text),
          scrollInfo: (text: string) => theme.fg("dim", text),
          noMatch: (text: string) => theme.fg("warning", text),
        });

        list.onSelect = (item) => {
          const stash = STASHES.get(item.value);
          if (stash) done({ action: "restore", stash });
        };
        list.onCancel = () => done(null);

        if (selectedIndex !== undefined) {
          list.setSelectedIndex(selectedIndex);
        }
        return list;
      }

      function refresh(preferredIndex?: number) {
        const items = buildItems();
        if (items.length === 0) {
          done(null);
          return;
        }

        container.clear();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(theme.fg("accent", theme.bold("  Stashed Prompts"))));
        container.addChild(new Spacer(1));

        selectList = createSelectList(items, preferredIndex);
        container.addChild(selectList);

        container.addChild(new Spacer(1));
        container.addChild(
          new Text(theme.fg("dim", "  c:copy  d:delete  D:clear-all  enter:restore  esc:cancel")),
        );
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        tui.requestRender();
      }

      // Initial build
      refresh();

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          const item = selectList.getSelectedItem();
          if (!item) {
            selectList.handleInput(data);
            tui.requestRender();
            return;
          }

          const stash = STASHES.get(item.value);
          if (!stash) {
            selectList.handleInput(data);
            tui.requestRender();
            return;
          }

          if (data === "c") {
            done({ action: "copy", stash });
            return;
          }

          if (data === "d") {
            const currentItems = buildItems();
            const oldIndex = currentItems.findIndex((i) => i.value === item.value);
            STASHES.delete(stash.id);
            saveStashesToDisk(STASHES);
            refresh(oldIndex);
            return;
          }

          if (data === "D") {
            STASHES.clear();
            saveStashesToDisk(STASHES);
            done({ action: "cleared" });
            return;
          }

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

  pi.registerCommand("supi-stash", {
    description: "Browse, restore, copy, delete, or clear all stashed prompts",
    handler: async (_args, ctx) => {
      if (STASHES.size === 0) {
        ctx.ui.notify("No stashed prompts", "info");
        return;
      }

      const result = await showStashPickerOverlay(ctx);
      if (!result) return;

      if (result.action === "cleared") {
        ctx.ui.notify("All stashes cleared", "info");
        return;
      }

      if (result.action === "restore") {
        ctx.ui.setEditorText(result.stash.text);
        ctx.ui.notify(`Restored: "${result.stash.name}"`, "info");
        return;
      }

      // copy
      const ok = await copyToClipboard(result.stash.text, ctx.cwd, pi);
      ctx.ui.notify(
        ok ? `Copied "${result.stash.name}" to clipboard` : "Failed to copy to clipboard",
        ok ? "info" : "error",
      );
    },
  });

  pi.on("session_shutdown", () => {
    saveStashesToDisk(STASHES);
  });
}
