#!/usr/bin/env node
/**
 * Report what each active tool adds to the request prefix: description, the
 * codemode call signature Pi appends to it, parameter schema, prompt snippet,
 * and prompt guidelines.
 *
 * Loads the extensions Pi would load for the current directory (project and
 * user settings) in an in-memory SDK session, so the numbers reflect this
 * machine's configuration. Tools that need the interactive TUI are absent.
 * Token counts are estimates (characters / 4), for ranking, not for billing.
 *
 * Usage: node scripts/prompt-cost.mjs [--json]
 */
/* biome-ignore-all lint/suspicious/noConsole: CLI report output */
import { homedir } from "node:os";
import { relative } from "node:path";
import { parseArgs } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const CHARS_PER_TOKEN = 4;
const COLUMNS = ["description", "codemode", "parameters", "snippet", "guidelines"];

const tokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);

/** Where a tool comes from: a workspace package, a Pi built-in, or another extension path. */
function sourceOf(sourceInfo, cwd) {
  const path = sourceInfo?.path;
  if (!path || path.startsWith("<")) return sourceInfo?.source ?? "unknown";
  const local = relative(cwd, path);
  if (local.startsWith("..")) return path.replace(homedir(), "~");
  return local.match(/^packages\/([^/]+)/)?.[1] ?? local;
}

/** Character counts per prefix surface for one declared tool. */
function measureTool(declared, definition, source) {
  const base = definition?.description?.trim().length ?? 0;
  const chars = {
    description: base,
    // Pi appends the script call signature to the declared description in codemode "on".
    codemode: Math.max(0, declared.description.length - base),
    parameters: JSON.stringify(declared.parameters ?? {}).length,
    snippet: definition?.promptSnippet?.length ?? 0,
    guidelines: (definition?.promptGuidelines ?? []).join("\n").length,
  };
  const total = COLUMNS.reduce((sum, column) => sum + chars[column], 0);
  return { name: declared.name, source, chars, total };
}

function printTable(rows, systemPromptChars) {
  const header = ["tool", "source", ...COLUMNS, "total", "~tokens"];
  const body = rows.map((row) => [
    row.name,
    row.source,
    ...COLUMNS.map((column) => String(row.chars[column])),
    String(row.total),
    String(tokens(row.total)),
  ]);
  const sums = COLUMNS.map((column) => rows.reduce((sum, row) => sum + row.chars[column], 0));
  const grand = sums.reduce((sum, value) => sum + value, 0);
  body.push(["TOTAL", "", ...sums.map(String), String(grand), String(tokens(grand))]);

  const widths = header.map((_, i) => Math.max(...[header, ...body].map((line) => line[i].length)));
  const format = (line) =>
    line.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  console.log("Characters per prefix surface, largest tool first.\n");
  console.log(format(header));
  for (const line of body) console.log(format(line));
  console.log(
    `\nSystem prompt: ${systemPromptChars} chars (~${tokens(systemPromptChars)} tokens); it already contains the snippet and guidelines columns.`,
  );
}

const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });
const cwd = process.cwd();
const resourceLoader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
await resourceLoader.reload();
const { session } = await createAgentSession({
  resourceLoader,
  sessionManager: SessionManager.inMemory(),
});

let exitCode = 0;
try {
  // Emits session_start, where several extensions register or activate their tools.
  await session.bindExtensions({});
  const sources = new Map(session.getAllTools().map((tool) => [tool.name, tool.sourceInfo]));
  const rows = session.agent.state.tools
    .map((tool) =>
      measureTool(
        tool,
        session.getToolDefinition(tool.name),
        sourceOf(sources.get(tool.name), cwd),
      ),
    )
    .sort((a, b) => b.total - a.total);
  const systemPromptChars = session.systemPrompt.length;
  if (values.json) console.log(JSON.stringify({ systemPromptChars, tools: rows }, null, 2));
  else printTable(rows, systemPromptChars);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  session.dispose();
}
// Extensions keep language servers and timers alive; the report is complete here.
process.exit(exitCode);
