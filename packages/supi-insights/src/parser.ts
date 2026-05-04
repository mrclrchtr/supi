// Session parser — extract metadata and transcripts from PI session entries.

import { readFile } from "node:fs/promises";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { FileEntry, SessionEntry, SessionHeader } from "@mariozechner/pi-coding-agent";
import { migrateSessionEntries, parseSessionEntries } from "@mariozechner/pi-coding-agent";
import { diffLines } from "diff";
import type { SessionMeta } from "./types.ts";
import { countCharInString, getLanguageFromPath } from "./utils.ts";

// Local type shims for pi-coding-agent message types not re-exported from index
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  timestamp: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | Array<{ type: "text"; text: string }>;
  display: boolean;
  timestamp: number;
}

type AgentMessage = Message | BashExecutionMessage | CustomMessage;

// Tool names that indicate special features
const TASK_AGENT_TOOLS = new Set(["agent", "subagent"]);
const MCP_PREFIX = "mcp__";
const WEB_SEARCH_TOOL = "web_search";
const WEB_FETCH_TOOL = "web_fetch";

export async function parseSessionFile(path: string): Promise<FileEntry[]> {
  const content = await readFile(path, { encoding: "utf-8" });
  const entries = parseSessionEntries(content);
  migrateSessionEntries(entries);
  return entries;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: metadata extraction handles many independent session counters.
export function extractSessionMeta(
  entries: FileEntry[],
  sessionId: string,
  projectPath: string,
): SessionMeta {
  const header = entries.find((e): e is SessionHeader => e.type === "session");
  const sessionEntries = getActiveBranchEntries(entries);

  const startTime = header?.timestamp ?? new Date().toISOString();
  const startDate = new Date(startTime);

  // Find last entry timestamp for duration
  let endDate = startDate;
  for (const entry of sessionEntries) {
    if (entry.timestamp) {
      const d = new Date(entry.timestamp);
      if (!Number.isNaN(d.getTime()) && d > endDate) {
        endDate = d;
      }
    }
  }

  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 1000 / 60);

  const stats = extractToolStats(sessionEntries);

  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let firstPrompt = "";

  for (const entry of sessionEntries) {
    if (entry.type !== "message") continue;
    const msg = entry.message as AgentMessage;
    if (msg.role === "assistant") {
      assistantMessageCount++;
    } else if (msg.role === "user") {
      const text = extractUserText(msg as UserMessage);
      if (text.trim()) {
        userMessageCount++;
        if (!firstPrompt) firstPrompt = text.slice(0, 200);
      }
    }
  }

  return {
    sessionId,
    projectPath,
    startTime,
    durationMinutes: Math.max(0, durationMinutes),
    userMessageCount,
    assistantMessageCount,
    toolCounts: stats.toolCounts,
    languages: stats.languages,
    gitCommits: stats.gitCommits,
    gitPushes: stats.gitPushes,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    firstPrompt,
    userInterruptions: stats.userInterruptions,
    userResponseTimes: stats.userResponseTimes,
    toolErrors: stats.toolErrors,
    toolErrorCategories: stats.toolErrorCategories,
    usesTaskAgent: stats.usesTaskAgent,
    usesMcp: stats.usesMcp,
    usesWebSearch: stats.usesWebSearch,
    usesWebFetch: stats.usesWebFetch,
    linesAdded: stats.linesAdded,
    linesRemoved: stats.linesRemoved,
    filesModified: stats.filesModified.size,
    messageHours: stats.messageHours,
    userMessageTimestamps: stats.userMessageTimestamps,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tool stats are extracted in one session-entry pass for performance.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: keeping related counters together avoids repeated tree walks.
function extractToolStats(entries: SessionEntry[]) {
  const toolCounts: Record<string, number> = {};
  const languages: Record<string, number> = {};
  let gitCommits = 0;
  let gitPushes = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  let userInterruptions = 0;
  const userResponseTimes: number[] = [];
  let toolErrors = 0;
  const toolErrorCategories: Record<string, number> = {};
  let usesTaskAgent = false;
  let usesMcp = false;
  let usesWebSearch = false;
  let usesWebFetch = false;

  let linesAdded = 0;
  let linesRemoved = 0;
  const filesModified = new Set<string>();
  const messageHours: number[] = [];
  const userMessageTimestamps: string[] = [];
  let lastAssistantTimestamp: string | null = null;

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message as AgentMessage;
    const msgTimestamp =
      "timestamp" in msg && msg.timestamp ? new Date(msg.timestamp).toISOString() : entry.timestamp;

    if (msg.role === "assistant") {
      if (msgTimestamp) lastAssistantTimestamp = msgTimestamp;
      const usage = (msg as AssistantMessage).usage;
      if (usage) {
        inputTokens += usage.input ?? 0;
        outputTokens += usage.output ?? 0;
      }

      const content = msg.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "toolCall" && "name" in block) {
            const toolName = block.name as string;
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;

            if (TASK_AGENT_TOOLS.has(toolName)) usesTaskAgent = true;
            if (toolName.startsWith(MCP_PREFIX)) usesMcp = true;
            if (toolName === WEB_SEARCH_TOOL) usesWebSearch = true;
            if (toolName === WEB_FETCH_TOOL) usesWebFetch = true;

            const input = block.arguments as Record<string, unknown> | undefined;
            if (input) {
              const filePath = (input.file_path as string) || (input.path as string) || "";
              if (filePath) {
                const lang = getLanguageFromPath(filePath);
                if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
                if (toolName === "edit" || toolName === "write") {
                  filesModified.add(filePath);
                }
              }

              if (
                toolName === "edit" &&
                typeof input.old_string === "string" &&
                typeof input.new_string === "string"
              ) {
                for (const change of diffLines(input.old_string, input.new_string)) {
                  if (change.added) linesAdded += change.count || 0;
                  if (change.removed) linesRemoved += change.count || 0;
                }
              }

              if (toolName === "write" && typeof input.content === "string") {
                linesAdded += countCharInString(input.content, "\n") + 1;
              }

              const command = (input.command as string) || "";
              if (command.includes("git commit")) gitCommits++;
              if (command.includes("git push")) gitPushes++;
            }
          }
        }
      }
    }

    if (msg.role === "user") {
      const isHuman = isHumanMessage(msg as UserMessage);
      if (isHuman && msgTimestamp) {
        try {
          const msgDate = new Date(msgTimestamp);
          messageHours.push(msgDate.getUTCHours());
          userMessageTimestamps.push(msgTimestamp);
        } catch {
          // skip invalid timestamps
        }

        if (lastAssistantTimestamp) {
          const assistantTime = new Date(lastAssistantTimestamp).getTime();
          const userTime = new Date(msgTimestamp).getTime();
          const responseTimeSec = (userTime - assistantTime) / 1000;
          if (responseTimeSec > 2 && responseTimeSec < 3600) {
            userResponseTimes.push(responseTimeSec);
          }
        }
      }

      // Check for interruptions in content
      const text = extractUserText(msg as UserMessage);
      if (text.includes("[Request interrupted by user")) {
        userInterruptions++;
      }
    }

    if (msg.role === "toolResult") {
      const tr = msg as ToolResultMessage;
      if (tr.isError) {
        toolErrors++;
        const text = extractBlockText(tr.content);
        const category = categorizeToolError(text);
        toolErrorCategories[category] = (toolErrorCategories[category] ?? 0) + 1;
      }
    }
  }

  return {
    toolCounts,
    languages,
    gitCommits,
    gitPushes,
    inputTokens,
    outputTokens,
    userInterruptions,
    userResponseTimes,
    toolErrors,
    toolErrorCategories,
    usesTaskAgent,
    usesMcp,
    usesWebSearch,
    usesWebFetch,
    linesAdded,
    linesRemoved,
    filesModified,
    messageHours,
    userMessageTimestamps,
  };
}

function isHumanMessage(msg: UserMessage | CustomMessage): boolean {
  if (msg.role === "custom") return false;
  const content = msg.content;
  if (typeof content === "string" && content.trim()) return true;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && "text" in block && block.text.trim()) {
        return true;
      }
    }
  }
  return false;
}

function extractUserText(msg: UserMessage | CustomMessage): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return "";
}

function extractBlockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } => c?.type === "text")
      .map((c) => c.text)
      .join(" ");
  }
  return "";
}

function categorizeToolError(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("exit code")) return "Command Failed";
  if (lower.includes("rejected") || lower.includes("doesn't want")) return "User Rejected";
  if (lower.includes("string to replace not found") || lower.includes("no changes"))
    return "Edit Failed";
  if (lower.includes("modified since read")) return "File Changed";
  if (lower.includes("exceeds maximum") || lower.includes("too large")) return "File Too Large";
  if (lower.includes("file not found") || lower.includes("does not exist")) return "File Not Found";
  return "Other";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transcript formatting mirrors PI message block shapes.
export function formatTranscriptForFacets(entries: FileEntry[], sessionMeta: SessionMeta): string {
  const lines: string[] = [];

  lines.push(`Session: ${sessionMeta.sessionId.slice(0, 8)}`);
  lines.push(`Date: ${sessionMeta.startTime}`);
  lines.push(`Project: ${sessionMeta.projectPath}`);
  lines.push(`Duration: ${sessionMeta.durationMinutes} min`);
  lines.push("");

  const sessionEntries = getActiveBranchEntries(entries);

  for (const entry of sessionEntries) {
    if (entry.type !== "message") continue;
    const msg = entry.message as AgentMessage;

    if (msg.role === "user") {
      const text = extractUserText(msg as UserMessage);
      if (text.trim()) {
        lines.push(`[User]: ${text.slice(0, 500)}`);
      }
    } else if (msg.role === "assistant") {
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && "text" in block) {
            lines.push(`[Assistant]: ${(block.text as string).slice(0, 300)}`);
          } else if (block.type === "toolCall" && "name" in block) {
            lines.push(`[Tool: ${block.name}]`);
          }
        }
      }
    }
  }

  return lines.join("\n");
}

export function hasValidDates(entries: FileEntry[]): boolean {
  const header = entries.find((e) => e.type === "session");
  if (!header?.timestamp) return false;
  const start = new Date(header.timestamp);
  if (Number.isNaN(start.getTime())) return false;

  for (const entry of getActiveBranchEntries(entries)) {
    const d = new Date(entry.timestamp);
    if (!Number.isNaN(d.getTime())) return true;
  }
  return false;
}

/** Resolve the active branch path using PI's append-only tree semantics (last entry is current leaf). */
function getActiveBranchEntries(entries: FileEntry[]): SessionEntry[] {
  const sessionEntries = entries.filter((e): e is SessionEntry => e.type !== "session");
  const byId = new Map(sessionEntries.map((entry) => [entry.id, entry]));
  const leaf = sessionEntries.at(-1);
  if (!leaf) return [];

  const path: SessionEntry[] = [];
  const visited = new Set<string>();
  let current: SessionEntry | undefined = leaf;
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
