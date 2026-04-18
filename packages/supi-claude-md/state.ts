// Internal state types for supi-claude-md.
//
// State is reconstructed from session history on session_start
// and mutated in-place during the session lifecycle.

export interface InjectedDir {
  /** Turn number when this directory's context was last injected */
  turn: number;
  /** Relative path of the context file that was injected */
  file: string;
}

export interface ClaudeMdState {
  /** Count of completed assistant turns (stopReason: "stop") */
  completedTurns: number;
  /** Turn number of the last root context refresh */
  lastRefreshTurn: number;
  /** Map of directory path → injection info */
  injectedDirs: Map<string, InjectedDir>;
  /** Set after compaction or manual refresh to force re-injection */
  needsRefresh: boolean;
  /** Token of the current active root refresh message (for pruning) */
  currentContextToken: string | null;
  /** Counter for generating unique context tokens */
  contextCounter: number;
  /** Set of paths already loaded by pi natively (dedup) */
  nativeContextPaths: Set<string>;
  /** Whether this is the first before_agent_start (for native path capture) */
  firstAgentStart: boolean;
}

export function createInitialState(): ClaudeMdState {
  return {
    completedTurns: 0,
    lastRefreshTurn: 0,
    injectedDirs: new Map(),
    needsRefresh: true,
    currentContextToken: null,
    contextCounter: 0,
    nativeContextPaths: new Set(),
    firstAgentStart: true,
  };
}

const CONTEXT_TAG_REGEX =
  /<extension-context\s+source="supi-claude-md"\s+file="([^"]+)"\s+turn="(\d+)">/g;

const REFRESH_CUSTOM_TYPE = "supi-claude-md-refresh";

type BranchEntry = {
  type: string;
  role?: string;
  stopReason?: string;
  customType?: string;
  details?: unknown;
  content?: unknown;
};

export function reconstructState(branch: BranchEntry[]): {
  completedTurns: number;
  lastRefreshTurn: number;
  injectedDirs: Map<string, InjectedDir>;
} {
  let completedTurns = 0;
  let lastRefreshTurn = 0;
  const injectedDirs = new Map<string, InjectedDir>();

  for (const entry of branch) {
    if (isCompletedAssistantTurn(entry)) completedTurns++;
    if (isRefreshMessage(entry)) lastRefreshTurn = getRefreshTurn(entry.details);
    if (entry.type === "toolResult") extractInjectedDirs(entry.content, injectedDirs);
  }

  return { completedTurns, lastRefreshTurn, injectedDirs };
}

function isCompletedAssistantTurn(entry: BranchEntry): boolean {
  return entry.type === "assistant" && entry.stopReason === "stop";
}

function isRefreshMessage(entry: BranchEntry): boolean {
  return entry.customType === REFRESH_CUSTOM_TYPE;
}

function getRefreshTurn(details: unknown): number {
  const d = details as { turn?: number } | undefined;
  return d?.turn ?? 0;
}

function extractInjectedDirs(content: unknown, injectedDirs: Map<string, InjectedDir>): void {
  const parts = content as Array<{ type?: string; text?: string }> | undefined;
  if (!parts) return;

  for (const part of parts) {
    if (part.type === "text" && part.text) {
      parseContextTags(part.text, injectedDirs);
    }
  }
}

function parseContextTags(text: string, injectedDirs: Map<string, InjectedDir>): void {
  const matches = text.matchAll(CONTEXT_TAG_REGEX);
  for (const match of matches) {
    const file = match[1];
    const turn = Number.parseInt(match[2] ?? "0", 10);
    if (file) {
      const lastSlash = file.lastIndexOf("/");
      const dir = lastSlash >= 0 ? file.substring(0, lastSlash) : ".";
      injectedDirs.set(dir, { turn, file });
    }
  }
}
