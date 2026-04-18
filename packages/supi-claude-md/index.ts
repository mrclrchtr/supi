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
import { getArgumentCompletions, handleCommand } from "./commands.ts";
import { loadClaudeMdConfig } from "./config.ts";
import {
  extractPathFromToolEvent,
  filterAlreadyLoaded,
  findSubdirContextFiles,
} from "./discovery.ts";
import {
  formatRefreshContext,
  pruneStaleRefreshMessages,
  readNativeContextFiles,
  shouldRefreshRoot,
} from "./refresh.ts";
import { type ClaudeMdState, createInitialState, reconstructState } from "./state.ts";
import { formatSubdirContext, shouldInjectSubdir } from "./subdirectory.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

let extensionState: ClaudeMdState | null = null;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: extension entry point wires all events
export default function claudeMdExtension(pi: ExtensionAPI) {
  const state: ClaudeMdState = createInitialState();
  extensionState = state;

  // ── Session lifecycle ──────────────────────────────────────

  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    Object.assign(state, createInitialState());
    extensionState = state;

    try {
      const branch =
        (
          ctx.sessionManager as unknown as {
            getBranch?: () => Array<unknown>;
          }
        ).getBranch?.() ?? [];

      if (branch.length > 0) {
        const reconstructed = reconstructState(
          branch as Array<{
            type: string;
            role?: string;
            stopReason?: string;
            customType?: string;
            details?: unknown;
            content?: unknown;
          }>,
        );
        state.completedTurns = reconstructed.completedTurns;
        state.lastRefreshTurn = reconstructed.lastRefreshTurn;
        state.injectedDirs = reconstructed.injectedDirs;
        state.needsRefresh = reconstructed.completedTurns === 0;
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
    const config = loadClaudeMdConfig(_ctx.cwd);
    if (config.compactRefresh) {
      state.needsRefresh = true;
    }
    state.injectedDirs.clear();
  });

  // ── Root refresh (before_agent_start) ──────────────────────

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const config = loadClaudeMdConfig(_ctx.cwd);
    const opts = event as unknown as {
      systemPromptOptions?: { contextFiles?: Array<{ path?: string; content?: string }> };
    };

    captureNativePaths(state, opts);
    if (!shouldRefreshRoot(state, config)) {
      state.currentContextToken = null;
      return;
    }

    const nativeFiles = readNativeContextFiles(opts.systemPromptOptions?.contextFiles ?? []);
    const content = nativeFiles.length > 0 ? formatRefreshContext(nativeFiles) : null;
    if (!content) {
      state.currentContextToken = null;
      return;
    }

    state.currentContextToken = `supi-claude-md-${++state.contextCounter}`;
    state.lastRefreshTurn = state.completedTurns;
    state.needsRefresh = false;

    return {
      message: {
        customType: "supi-claude-md-refresh",
        content,
        display: false,
        details: { contextToken: state.currentContextToken, turn: state.completedTurns },
      },
    };
  });

  // ── Context pruning ────────────────────────────────────────

  pi.on("context", (event) => {
    const messages = pruneStaleRefreshMessages(
      event.messages as Array<{ role?: string; customType?: string; details?: unknown }>,
      state.currentContextToken,
    ) as typeof event.messages;

    if (
      messages.length === event.messages.length &&
      messages.every((m, i) => m === event.messages[i])
    ) {
      return;
    }
    return { messages };
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

    const dirsToInject = collectStaleDirs(
      found,
      state.injectedDirs,
      state.completedTurns,
      config.rereadInterval,
    );
    if (dirsToInject.size === 0) return;

    const filesToInject = Array.from(dirsToInject.values()).flat();
    const contextText = formatSubdirContext(filesToInject, state.completedTurns);
    if (!contextText) return;

    updateInjectedDirTracking(state, dirsToInject);

    return {
      content: [...event.content, { type: "text" as const, text: contextText }],
    };
  });

  // ── Command: /supi-claude-md ───────────────────────────────

  pi.registerCommand("supi-claude-md", {
    description: "Manage supi-claude-md context injection",
    getArgumentCompletions,
    async handler(args: string, ctx) {
      handleCommand(args, ctx, extensionState);
    },
  });

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "resources")],
  }));
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

function collectStaleDirs(
  found: ReturnType<typeof findSubdirContextFiles>,
  injectedDirs: Map<string, { turn: number; file: string }>,
  currentTurn: number,
  rereadInterval: number,
): Map<string, typeof found> {
  const dirsToInject = new Map<string, typeof found>();
  for (const file of found) {
    if (shouldInjectSubdir(file.dir, injectedDirs, currentTurn, rereadInterval)) {
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
