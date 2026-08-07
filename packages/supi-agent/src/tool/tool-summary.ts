import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { MAX_BASH_PREVIEW_CHARS } from "./bounds.ts";

/** Tool summary returned per known capability. */
export interface AgentToolSummary {
  toolName: string;
  /** Human-readable argument summary; undefined for unknown tools (name/status only). */
  summary: string | undefined;
  /** Bash first-line preview (redacted, control-stripped, whitespace-collapsed, capped); undefined for non-bash tools. */
  bashPreview: string | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: tool call arguments are provider-dependent
type ToolArgs = Record<string, any>;

interface ToolSummarizer {
  summarize(args: ToolArgs, toolName: string): AgentToolSummary;
}

function pathSummary(toolName: string, args: ToolArgs): AgentToolSummary {
  const path = typeof args.path === "string" ? args.path : "";
  return { toolName, summary: path ? `${toolName} ${path}` : toolName, bashPreview: undefined };
}

const summarizers: Record<string, ToolSummarizer> = {
  read: { summarize: (args, name) => pathSummary(name, args) },
  edit: {
    summarize: (args, name) => {
      const path = typeof args.path === "string" ? args.path : "";
      const editCount = Array.isArray(args.edits) ? args.edits.length : 0;
      const label = path
        ? editCount > 0
          ? `${name} ${path} (${editCount} edit${editCount === 1 ? "" : "s"})`
          : `${name} ${path}`
        : name;
      return { toolName: name, summary: label, bashPreview: undefined };
    },
  },
  write: { summarize: (args, name) => pathSummary(name, args) },
  bash: {
    summarize: (args) => {
      const command = typeof args.command === "string" ? args.command : "";
      const preview = firstLineBashPreview(command);
      const summary = preview ? `bash ${preview}` : "bash";
      return { toolName: "bash", summary, bashPreview: preview };
    },
  },
  code_resolve: {
    summarize: (args, name) => {
      const query = typeof args?.target?.symbol?.query === "string" ? args.target.symbol.query : "";
      return { toolName: name, summary: query ? `${name} ${query}` : name, bashPreview: undefined };
    },
  },
  code_inspect: {
    summarize: (args, name) => {
      const file = typeof args?.point?.file === "string" ? args.point.file : "";
      return { toolName: name, summary: file ? `${name} ${file}` : name, bashPreview: undefined };
    },
  },
  code_orientation: {
    summarize: (args, name) => {
      const focus = args?.focus;
      const path = typeof focus?.path === "string" ? focus.path : "";
      const sym = typeof focus?.target?.symbol?.query === "string" ? focus.target.symbol.query : "";
      const label = path || sym;
      return { toolName: name, summary: label ? `${name} ${label}` : name, bashPreview: undefined };
    },
  },
  code_graph: {
    summarize: (args, name) => {
      const query = typeof args?.target?.symbol?.query === "string" ? args.target.symbol.query : "";
      return { toolName: name, summary: query ? `${name} ${query}` : name, bashPreview: undefined };
    },
  },
  code_find: {
    summarize: (args, name) => {
      const query = typeof args.query === "string" ? args.query : "";
      const mode = typeof args.mode === "string" ? args.mode : "";
      const label = mode ? `${query} (${mode})` : query;
      return { toolName: name, summary: label ? `${name} ${label}` : name, bashPreview: undefined };
    },
  },
  code_health: {
    summarize: (_args, name) => ({ toolName: name, summary: name, bashPreview: undefined }),
  },
};

/** Return an allowlisted tool summary for a known tool, or name-only for unknown tools. */
export function summarizeToolCall(toolName: string, args: unknown): AgentToolSummary {
  const summarizer = summarizers[toolName];
  if (!summarizer) return { toolName, summary: undefined, bashPreview: undefined };
  const safeArgs =
    args !== null && typeof args === "object" && !Array.isArray(args) ? (args as ToolArgs) : {};
  return summarizer.summarize(safeArgs, toolName);
}

const MAX_LIVE_ACTIVITY_CHARS = 160;

/** Return one safe live activity label from a child session event. */
export function summarizeToolActivity(event: AgentSessionEvent): string | undefined {
  if (event.type === "turn_start") return "turn:start";
  if (event.type === "turn_end") return "turn:end";
  if (event.type === "message_end") {
    return event.message.role === "assistant" ? "assistant:end" : undefined;
  }
  if (event.type !== "tool_execution_start" && event.type !== "tool_execution_end")
    return undefined;

  const suffix =
    event.type === "tool_execution_start" ? "start" : event.isError ? "end:error" : "end";
  const summary =
    event.type === "tool_execution_start"
      ? (summarizeToolCall(event.toolName, event.args).summary ?? event.toolName)
      : event.toolName;
  const activity = `tool:${suffix}:${summary}`;
  return activity.length <= MAX_LIVE_ACTIVITY_CHARS
    ? activity
    : `${activity.slice(0, MAX_LIVE_ACTIVITY_CHARS - 1)}…`;
}

// ── Bash preview ─────────────────────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape detection.
const ANSI_ESCAPE_RE = /(\x1b\[[0-?]*[ -/]*[@-~])/g;
const SECRET_ASSIGNMENT_RE =
  /(\b(?:token|password|passwd|secret|api[_-]?key|authorization|credential)\s*=\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s;&|]+)/gi;
const SECRET_FLAG_RE = /(\b(?:--password|--passwd|--token|--api-key|--secret)\s*=\s*)([^\s;&|]+)/gi;
const API_KEY_ENV_RE =
  /(\b(?:[A-Z][A-Z0-9_]*?(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD))\s*=\s*)([^\s;&|]+)/gi;
const EXPORT_SECRET_RE =
  /(export\s+[A-Z][A-Z0-9_]*?(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD)\s*=\s*)([^\s;&|]+)/gi;
const HEADER_SECRET_RE =
  /(\b(?:authorization|proxy-authorization|x-api-key|api-key|x-auth-token|x-access-token)\s*[:=]\s*(?:(?:bearer|basic)\s+)?)([^\s;&|'"`]+)/gi;
const AUTH_SCHEME_RE = /(\b(?:bearer|basic)\s+)([^\s;&|'"`]+)/gi;
const USER_CREDENTIAL_RE =
  /((?:^|\s)(?:-u|--user)(?:\s+|=))(?:(?:"[^"]*:[^"]*")|(?:'[^']*:[^']*')|(?:[^\s;&|'"`]+:[^\s;&|'"`]+))/gi;

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  }).join("");
}

function redactSecrets(value: string): string {
  return value
    .replace(ANSI_ESCAPE_RE, "")
    .replace(SECRET_ASSIGNMENT_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(SECRET_FLAG_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(API_KEY_ENV_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(EXPORT_SECRET_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(HEADER_SECRET_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(AUTH_SCHEME_RE, (_m, prefix: string) => `${prefix}[REDACTED]`)
    .replace(USER_CREDENTIAL_RE, (_m, prefix: string) => `${prefix}[REDACTED]`);
}

/** Return one safe, control-stripped, secret-redacted, whitespace-collapsed first-line preview. */
export function firstLineBashPreview(command: string): string | undefined {
  if (!command.trim()) return undefined;
  // Extract first line before stripping control characters (so newline is preserved).
  const firstLineRaw = command.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLineRaw.trim()) return undefined;
  const stripped = stripControlCharacters(firstLineRaw);
  const redacted = redactSecrets(stripped);
  const collapsed = redacted.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  if (collapsed.length <= MAX_BASH_PREVIEW_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_BASH_PREVIEW_CHARS - 1)}…`;
}
