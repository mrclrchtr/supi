// supi-claude-md — subdirectory context injection and root context refresh for pi.
//
// Two capabilities:
// 1. Subdirectory discovery: inject CLAUDE.md/AGENTS.md from subdirectories
//    below cwd when the agent accesses files there (via tool_result augmentation).
// 2. Root refresh: periodically re-inject root/ancestor context files that
//    pi loaded natively (via before_agent_start persistent messages).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionCompactEvent,
  SessionStartEvent,
  TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { pruneAndReorderContextMessages, restorePromptContent } from "@mrclrchtr/supi-core";
import { loadClaudeMdConfig } from "./config.ts";
import {
  extractPathFromToolEvent,
  filterAlreadyLoaded,
  findSubdirContextFiles,
} from "./discovery.ts";
import type { ContextUsage } from "./refresh.ts";
import { formatRefreshContext, readNativeContextFiles, shouldRefreshRoot } from "./refresh.ts";
import { registerClaudeMdSettings } from "./settings-registration.ts";
import { type ClaudeMdState, createInitialState, reconstructState } from "./state.ts";
import type { InjectionCheckOptions } from "./subdirectory.ts";
import { formatSubdirContext, shouldInjectSubdir } from "./subdirectory.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: extension entry point wires all events
export default function claudeMdExtension(pi: ExtensionAPI) {
  registerClaudeMdSettings();
  const state: ClaudeMdState = createInitialState();

  // ── Session lifecycle ──────────────────────────────────────

  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    Object.assign(state, createInitialState());

    try {
      const branch = ctx.sessionManager.getBranch();

      if (branch.length > 0) {
        const reconstructed = reconstructState(branch);
        state.completedTurns = reconstructed.completedTurns;
        state.lastRefreshTurn = reconstructed.lastRefreshTurn;
        state.injectedDirs = reconstructed.injectedDirs;
        state.contextCounter = reconstructed.contextCounter;
      }
    } catch {
      // Reconstruction failed — start fresh
    }
  });

  // ── Turn tracking ──────────────────────────────────────────

  pi.on("turn_end", async (event: TurnEndEvent, _ctx: ExtensionContext) => {
    const msg = event.message as { stopReason?: string };
    if (msg?.stopReason === "stop") {
      state.completedTurns++;
    }
  });

  // ── Compaction ─────────────────────────────────────────────

  pi.on("session_compact", async (_event: SessionCompactEvent, _ctx: ExtensionContext) => {
    state.injectedDirs.clear();
  });

  // ── Root refresh (before_agent_start) ──────────────────────

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const config = loadClaudeMdConfig(_ctx.cwd);
    const eventWithOpts = event as BeforeAgentStartEvent & {
      systemPromptOptions?: { contextFiles?: Array<{ path?: string; content?: string }> };
    };

    captureNativePaths(state, eventWithOpts);
    const contextUsage = _ctx.getContextUsage() as ContextUsage | undefined;
    if (!shouldRefreshRoot(state, config, contextUsage)) {
      state.currentContextToken = null;
      return;
    }

    const nativeFiles = readNativeContextFiles(
      eventWithOpts.systemPromptOptions?.contextFiles ?? [],
      _ctx.cwd,
    );
    const content = nativeFiles.length > 0 ? formatRefreshContext(nativeFiles) : null;
    if (!content) {
      state.currentContextToken = null;
      return;
    }

    state.currentContextToken = `supi-claude-md-${++state.contextCounter}`;
    state.lastRefreshTurn = state.completedTurns;

    return {
      message: {
        customType: "supi-claude-md-refresh",
        content: formatRefreshDisplayContent(nativeFiles.length),
        display: true,
        details: {
          contextToken: state.currentContextToken,
          promptContent: content,
          turn: state.completedTurns,
          fileCount: nativeFiles.length,
          files: nativeFiles.map((file) => file.path),
        },
      },
    };
  });

  // ── Context pruning ────────────────────────────────────────

  pi.on("context", (event) => {
    const messages = pruneAndReorderContextMessages(
      event.messages as Array<{
        role?: string;
        customType?: string;
        content?: unknown;
        details?: unknown;
      }>,
      "supi-claude-md-refresh",
      state.currentContextToken,
    );
    const contextMessages = restorePromptContent(
      messages,
      "supi-claude-md-refresh",
      state.currentContextToken,
    ) as typeof event.messages;

    if (
      contextMessages.length === event.messages.length &&
      contextMessages.every((m, i) => m === event.messages[i])
    ) {
      return;
    }
    return { messages: contextMessages };
  });

  // ── Subdirectory injection (tool_result) ───────────────────

  pi.on("tool_result", async (event, _ctx) => {
    const config = loadClaudeMdConfig(_ctx.cwd);
    if (!config.subdirs) return;
    if (event.isError) return;

    const filePath = extractPathFromToolEvent(
      event.toolName,
      event.input as Record<string, unknown>,
    );
    if (!filePath) return;

    const found = filterAlreadyLoaded(
      findSubdirContextFiles(filePath, _ctx.cwd, config.fileNames),
      state.nativeContextPaths,
    );
    if (found.length === 0) return;

    const dirsToInject = collectStaleDirs(found, {
      injectedDirs: state.injectedDirs,
      currentTurn: state.completedTurns,
      rereadInterval: config.rereadInterval,
      contextThreshold: config.contextThreshold,
      contextUsage: _ctx.getContextUsage() as ContextUsage | undefined,
    });
    if (dirsToInject.size === 0) return;

    const filesToInject = Array.from(dirsToInject.values()).flat();
    const contextText = formatSubdirContext(filesToInject, state.completedTurns);
    if (!contextText) return;

    updateInjectedDirTracking(state, dirsToInject);

    return {
      content: [...event.content, { type: "text" as const, text: contextText }],
    };
  });

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "resources")],
  }));

  // ── Message renderer ────────────────────────────────────────

  pi.registerMessageRenderer("supi-claude-md-refresh", (message, { expanded }, theme) => {
    const details = message.details as
      | { contextToken?: string; turn?: number; fileCount?: number; files?: string[] }
      | undefined;
    const fileCount = details?.fileCount;
    const token = details?.contextToken;
    const files = details?.files ?? [];

    const icon = theme.fg("accent", "\u{1F4C4}");
    let text = `${icon} CLAUDE.md refreshed`;
    if (fileCount != null && fileCount > 0) {
      text += ` (${fileCount} file${fileCount === 1 ? "" : "s"})`;
    }

    if (expanded) {
      const detailLines = files.map((file) => theme.fg("dim", `  ${file}`));
      if (token) detailLines.push(theme.fg("dim", `  token: ${token}`));
      if (detailLines.length > 0) text += `\n${detailLines.join("\n")}`;
    }

    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(text, 0, 0));
    return box;
  });
}

function captureNativePaths(
  state: ClaudeMdState,
  opts: { systemPromptOptions?: { contextFiles?: Array<{ path?: string; content?: string }> } },
): void {
  if (!state.firstAgentStart) return;
  state.firstAgentStart = false;
  const contextFiles = opts.systemPromptOptions?.contextFiles ?? [];
  for (const file of contextFiles) {
    if (file.path) {
      state.nativeContextPaths.add(file.path);
    }
  }
}

function formatRefreshDisplayContent(fileCount: number): string {
  return `CLAUDE.md refreshed (${fileCount} file${fileCount === 1 ? "" : "s"})`;
}

function collectStaleDirs(
  found: ReturnType<typeof findSubdirContextFiles>,
  injectionOpts: InjectionCheckOptions,
): Map<string, typeof found> {
  const dirsToInject = new Map<string, typeof found>();
  for (const file of found) {
    if (shouldInjectSubdir(file.dir, injectionOpts)) {
      const existing = dirsToInject.get(file.dir) ?? [];
      existing.push(file);
      dirsToInject.set(file.dir, existing);
    }
  }
  return dirsToInject;
}

function updateInjectedDirTracking(
  state: ClaudeMdState,
  dirsToInject: Map<string, Array<{ dir: string; relativePath: string }>>,
): void {
  for (const [dir, files] of dirsToInject) {
    const firstFile = files[0];
    if (firstFile) {
      state.injectedDirs.set(dir, { turn: state.completedTurns, file: firstFile.relativePath });
    }
  }
}
