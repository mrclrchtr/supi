/**
 * Compact rows for Pi's `codemode` tool.
 *
 * Collapsed rows show one script summary line, every nested call, one
 * status line, and the first output line. Expanded rows (app.tools.expand)
 * hand off to Pi's own renderer so nothing is hidden. Only a `codemode` tool
 * with Pi's `{ code: string }` input is affected; other tools keep their renderer.
 */
import type {
  ExtensionAPI,
  Theme,
  ThemeColor,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import {
  CODEMODE_VIEW_DEFAULTS,
  loadCodemodeViewConfig,
  registerCodemodeViewSettings,
} from "./codemode-compact-config.ts";

/** Pi does not export `ToolRenderContext`; derive it from the renderer signature. */
type ToolRenderContext = Parameters<NonNullable<ToolRenderers["renderResult"]>>[3];

type NestedStatus = "running" | "ok" | "error" | "cancelled";

/** Nested call as stored in `CodemodeToolDetails.calls`. */
export interface NestedCall {
  name: string;
  args: string;
  status: NestedStatus;
  durationMs?: number;
  error?: string;
  cost?: number;
}

interface ToolResultLike {
  content: ReadonlyArray<{ type: string; text?: string }>;
  details?: unknown;
}

interface CompactState {
  compactStartedAt?: number;
  compactTimer?: ReturnType<typeof setInterval>;
  nativeCall?: Component;
  nativeResult?: Component;
}

/** Shorter nested calls omit their duration to keep rows calm. */
const MIN_SHOWN_CALL_MS = 100;
const ARG_KEYS = ["path", "file", "command", "query", "pattern", "url"] as const;
const SCRIPT_HEADER = /^Script (?:completed|failed)\r?\nWall time [\d.]+ seconds\r?\nOutput:\r?\n$/;
const OUTPUT_MARKER = /^(?:==> text \d+\/\d+ <==|<\/?console_output>)$/;

/** Renders a fixed set of lines, truncated to the available width. */
class Lines implements Component {
  constructor(private readonly build: () => string[]) {}
  render(width: number): string[] {
    return this.build().map((line) => truncateToWidth(line, width, "…"));
  }
  invalidate(): void {}
}

/**
 * Register the compact renderer; it applies only while the row is collapsed.
 * Pi resolves renderers when it builds a row, so toggling the setting affects
 * new rows and rows rebuilt on reload.
 */
export default function codemodeCompact(pi: ExtensionAPI): void {
  let enabled = CODEMODE_VIEW_DEFAULTS.compact;
  let cwd: string | undefined;
  const refresh = () => {
    if (cwd) enabled = loadCodemodeViewConfig(cwd).compact;
  };
  pi.on("session_start", (_event, ctx) => {
    cwd = ctx.sessionManager.getCwd();
    refresh();
  });
  registerCodemodeViewSettings(pi, refresh);

  pi.registerToolRenderer((toolName, next) => {
    const native = next();
    if (!enabled || toolName !== "codemode" || !native?.renderCall || !native.renderResult) {
      return native;
    }
    const tool = pi.getAllTools().find((info) => info.name === toolName);
    return hasCodeInput(tool?.parameters) ? createCodemodeCompactRenderers(native) : native;
  });
}

/**
 * Pi's codemode takes `{ code: string }`. Wrappers around Pi's codemode
 * extension (a user extension re-registering it) keep that schema, so match
 * the input shape rather than the tool source.
 */
function hasCodeInput(parameters: unknown): boolean {
  const code = (parameters as { properties?: { code?: { type?: unknown } } } | undefined)
    ?.properties?.code;
  return code?.type === "string";
}

/**
 * Wrap Pi's codemode renderers with a compact collapsed view.
 *
 * Native components live in their own state slots: Pi passes the last
 * component of a slot back as `lastComponent`, and the native renderer
 * expects its own `Container` there.
 */
export function createCodemodeCompactRenderers(native: ToolRenderers): ToolRenderers {
  return {
    renderShell: native.renderShell,
    renderCall(args, theme, context) {
      const state = context.state as CompactState;
      if (context.executionStarted) state.compactStartedAt ??= Date.now();
      if (context.expanded && native.renderCall) {
        state.nativeCall = native.renderCall(args, theme, {
          ...context,
          lastComponent: state.nativeCall,
        });
        return state.nativeCall;
      }
      const code = (args as { code?: unknown } | undefined)?.code;
      return new Lines(() => [scriptLine(typeof code === "string" ? code : "", theme)]);
    },
    renderResult(result, options, theme, context) {
      const state = context.state as CompactState;
      const partial = options.isPartial && !context.isError;
      syncTimer(state, partial, context);
      // Once shown, the native result also needs the final update to stop its own timer.
      if (native.renderResult && (context.expanded || (!partial && state.nativeResult))) {
        state.nativeResult = native.renderResult(result, options, theme, {
          ...context,
          lastComponent: state.nativeResult,
        });
        if (context.expanded) return state.nativeResult;
      }
      const calls = nestedCalls(result.details);
      const elapsed = elapsedText(state, partial, context);
      return new Lines(() => [
        ...callRows(calls, theme, context.cwd),
        statusLine({ calls, partial, isError: context.isError, elapsed }, theme),
        ...(partial ? [] : outputLine(result, context, theme)),
      ]);
    },
  };
}

// ---- call line ----

function scriptLine(code: string, theme: Theme): string {
  const title = theme.fg("toolTitle", theme.bold("codemode"));
  const lines = code.replace(/\r/g, "").trimEnd().split("\n");
  const first = lines.find((line) => line.trim() && !line.trim().startsWith("// @options"));
  const count = code.trim() ? theme.fg("dim", ` · ${lines.length} lines`) : "";
  return first ? `${title}${count}  ${theme.fg("muted", first.trim())}` : title + count;
}

// ---- nested calls ----

/** Parse `details.calls` defensively; older or foreign results may differ. */
export function nestedCalls(details: unknown): NestedCall[] {
  const calls = (details as { calls?: unknown } | undefined)?.calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter(
    (call): call is NestedCall =>
      typeof call === "object" &&
      call !== null &&
      typeof call.name === "string" &&
      typeof call.args === "string" &&
      ["running", "ok", "error", "cancelled"].includes(call.status),
  );
}

type Args = Record<string, unknown>;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value.split("\n")[0] : undefined;

/** `file:line` for a code-intelligence anchor. */
const anchor = (value: unknown): string | undefined => {
  const { file, line } = (value ?? {}) as Args;
  return text(file) && (typeof line === "number" ? `${file}:${line}` : text(file));
};

/** Code-intelligence target: anchor, symbol query, file, or handle. */
const target = (value: unknown): string | undefined => {
  const t = (value ?? {}) as Args;
  return (
    anchor(t.anchor) ??
    text((t.symbol as Args | undefined)?.query) ??
    text(t.file) ??
    text(t.handle)
  );
};

/** Detail extractors for tools whose key argument is nested or ambiguous. */
const TOOL_DETAILS: Record<string, (args: Args) => string | undefined> = {
  code_resolve: (args) => target(args.target),
  code_graph: (args) => target(args.target),
  code_inspect: (args) => anchor(args.anchor),
  code_orientation: (args) => {
    const focus = (args.focus ?? {}) as Args;
    return text(focus.path) ?? text(focus.module) ?? target(focus.target);
  },
  code_find: (args) => {
    const search = (args.search ?? {}) as Args;
    return (
      text((search.semantic as Args | undefined)?.query) ??
      text((search.ast as Args | undefined)?.query)
    );
  },
};

/** The most telling argument: a path, command, or query; otherwise the raw JSON. */
export function callDetail(args: string, toolName = ""): string {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed === "object" && parsed !== null) {
      const found = TOOL_DETAILS[toolName]?.(parsed as Args) ?? findDetail(parsed, 3);
      if (found) return found;
    }
  } catch {
    // Pi truncates long argument JSON for display.
  }
  return args;
}

/** First known key with a string value, searching nested objects up to `depth` levels. */
function findDetail(value: unknown, depth: number): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Args;
  for (const key of ARG_KEYS) {
    const found = text(record[key]);
    if (found) return found;
  }
  if (depth <= 1) return undefined;
  for (const nested of Object.values(record)) {
    const found = findDetail(nested, depth - 1);
    if (found) return found;
  }
  return undefined;
}

const STATUS_ICON: Record<NestedStatus, [ThemeColor, string]> = {
  running: ["warning", "…"],
  ok: ["success", "✓"],
  error: ["error", "✗"],
  cancelled: ["muted", "⊘"],
};

/** Drop the working directory from error text; paths stay readable relative to it. */
function relativeError(error: string | undefined, cwd: string): string | undefined {
  return cwd ? error?.split(`${cwd}/`).join("") : error;
}

function callRows(calls: NestedCall[], theme: Theme, cwd: string): string[] {
  return calls.map((call) => {
    const [color, icon] = STATUS_ICON[call.status];
    const duration =
      call.durationMs === undefined || call.durationMs < MIN_SHOWN_CALL_MS
        ? ""
        : theme.fg("dim", ` ${formatDuration(call.durationMs)}`);
    const error = call.status === "error" ? relativeError(text(call.error), cwd) : undefined;
    const row = `  ${theme.fg(color, icon)} ${theme.fg("toolTitle", call.name)} ${theme.fg("muted", callDetail(call.args, call.name))}${duration}`;
    return error ? `${row} ${theme.fg("error", error)}` : row;
  });
}

// ---- status line ----

/** `5 calls · 1 failed · $0.004`, without the elapsed time. */
export function callSummary(calls: NestedCall[]): string {
  if (calls.length === 0) return "";
  const parts = [`${calls.length} ${calls.length === 1 ? "call" : "calls"}`];
  const failed = calls.filter((call) => call.status === "error").length;
  const cancelled = calls.filter((call) => call.status === "cancelled").length;
  if (failed) parts.push(`${failed} failed`);
  if (cancelled) parts.push(`${cancelled} cancelled`);
  const cost = calls.reduce((sum, call) => sum + (call.cost ?? 0), 0);
  if (cost > 0) parts.push(`$${cost >= 0.01 ? cost.toFixed(2) : cost.toPrecision(2)}`);
  return parts.join(" · ");
}

function statusLine(
  params: { calls: NestedCall[]; partial: boolean; isError: boolean; elapsed: string },
  theme: Theme,
): string {
  const { calls, partial, isError, elapsed } = params;
  const troubled = calls.some((call) => call.status === "error" || call.status === "cancelled");
  const [color, label]: [ThemeColor, string] = partial
    ? ["warning", "Running"]
    : isError
      ? ["error", "Failed"]
      : [troubled ? "warning" : "success", "Done"];
  const rest = [elapsed, callSummary(calls)].filter(Boolean).join(" · ");
  return theme.fg(color, label) + (rest ? theme.fg("dim", ` · ${rest}`) : "");
}

// ---- output ----

function outputLines(result: ToolResultLike): string[] {
  const [first, ...rest] = result.content;
  const blocks =
    first?.type === "text" && SCRIPT_HEADER.test(first.text ?? "") ? rest : result.content;
  return blocks
    .flatMap((block) => (block.type === "text" ? (block.text ?? "").split("\n") : ["[image]"]))
    .map((line) => line.replace(/\r/g, "").trim())
    .filter((line) => line && !OUTPUT_MARKER.test(line));
}

function outputLine(result: ToolResultLike, context: ToolRenderContext, theme: Theme): string[] {
  const lines = outputLines(result);
  if (context.isError) {
    const marker = lines.indexOf("Script error:");
    const message = (marker >= 0 ? lines[marker + 1] : lines[0]) ?? "Failed";
    return [`  ${theme.fg("error", message)}`];
  }
  const [first] = lines;
  if (!first) return [];
  const more =
    lines.length > 1
      ? theme.fg(
          "dim",
          ` (+${lines.length - 1} ${lines.length === 2 ? "line" : "lines"}, ${context.keyText("app.tools.expand")})`,
        )
      : "";
  return [`  ${theme.fg("toolOutput", first)}${more}`];
}

// ---- timing ----

function syncTimer(state: CompactState, partial: boolean, context: ToolRenderContext): void {
  if (partial && state.compactStartedAt !== undefined && !state.compactTimer) {
    state.compactTimer = setInterval(() => context.invalidate(), 1000);
    state.compactTimer.unref?.();
  }
  if (!partial && state.compactTimer) {
    clearInterval(state.compactTimer);
    state.compactTimer = undefined;
  }
}

function elapsedText(state: CompactState, partial: boolean, context: ToolRenderContext): string {
  if (!partial && context.durationMs !== undefined) return formatDuration(context.durationMs);
  if (state.compactStartedAt === undefined) return "";
  return formatDuration(Date.now() - state.compactStartedAt);
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
