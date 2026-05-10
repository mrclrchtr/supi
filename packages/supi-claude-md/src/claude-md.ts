// supi-claude-md — subdirectory context injection for pi.
//
// Subdirectory discovery: inject CLAUDE.md/AGENTS.md from subdirectories
// below cwd when the agent accesses files there (via tool_result augmentation).
// Root/ancestor context files are owned by pi's native system prompt and are
// never re-injected by this extension.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionCompactEvent,
  SessionStartEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { loadClaudeMdConfig } from "./config.ts";
import {
  extractPathFromToolEvent,
  filterAlreadyLoaded,
  findSubdirContextFiles,
} from "./discovery.ts";
import { registerClaudeMdSettings } from "./settings-registration.ts";
import { type ClaudeMdState, createInitialState, reconstructState } from "./state.ts";
import type { ContextUsage, InjectionCheckOptions } from "./subdirectory.ts";
import { formatSubdirContext, shouldInjectSubdir } from "./subdirectory.ts";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

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
        state.injectedDirs = reconstructed.injectedDirs;
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

  // ── Native context path capture (before_agent_start) ───────

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const eventWithOpts = event as BeforeAgentStartEvent & {
      systemPromptOptions?: { contextFiles?: Array<{ path?: string; content?: string }> };
    };

    captureNativePaths(state, eventWithOpts);
    // Root/ancestor context files are owned by pi's system prompt.
    // SuPi never re-injects them; subdirectory injection handles directories below cwd.
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
    skillPaths: [join(baseDir, "skills")],
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
