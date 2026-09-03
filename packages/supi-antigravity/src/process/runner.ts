import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IsolatedAntigravityPaths, prepareIsolatedAntigravityHome } from "../isolated-home.ts";
import type { AntigravityExecutionFacts, AntigravityProgressCallback } from "../types.ts";
import { eventType, toolName } from "./event-values.ts";
import { AntigravityEventAccumulator } from "./events.ts";
import { MAX_STREAM_EVENTS, parseNdjsonLine, StreamLimitError } from "./ndjson.ts";
import type { AntigravityProbeResult } from "./subprocess.ts";
import { AntigravityProcessError, runBoundedChildProcess } from "./subprocess.ts";

const DEFAULT_RUN_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_PROBE_TIMEOUT_MS = 15 * 1_000;

export type { AntigravityProbeResult } from "./subprocess.ts";
export { AntigravityProcessError } from "./subprocess.ts";

/** Build the fixed paid-run argument list. */
export function buildAntigravityRunArguments(
  schemaPath: string,
  model: string,
  conversationId?: string,
): string[] {
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--json-schema",
    schemaPath,
    "--model",
    model,
    "--print-timeout",
    "5m",
    "--sandbox",
    "--disable-slash-commands",
    ...(conversationId ? ["--conversation", conversationId] : []),
  ];
}

/** Fixed arguments for the pre-run project hook probe. */
export const PROJECT_HOOK_PROBE_ARGUMENTS = Object.freeze([
  "-p",
  "/hooks",
  "--output-format",
  "json",
  "--print-timeout",
  "15s",
]);

/** Run a bounded structured Antigravity conversation. */
export async function runAntigravityConversation(options: {
  paths: IsolatedAntigravityPaths;
  cwd: string;
  prompt: string;
  model: string;
  conversationId?: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Override the temporary schema parent for isolated integration tests. */
  schemaDirectoryParent?: string;
  onActivity?: AntigravityProgressCallback;
  onProcessStart?: () => void;
}): Promise<AntigravityExecutionFacts> {
  await prepareIsolatedAntigravityHome(options.paths);
  const schemaDirectory = await mkdtemp(
    join(options.schemaDirectoryParent ?? tmpdir(), "supi-antigravity-schema-"),
  );
  const schemaPath = join(schemaDirectory, "answer.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(options.schema)}\n`, { mode: 0o600 });
    const args = buildAntigravityRunArguments(schemaPath, options.model, options.conversationId);
    const accumulator = new AntigravityEventAccumulator({ workspaceDirectory: options.cwd });
    let eventCount = 0;
    await runBoundedChildProcess({
      args,
      cwd: options.cwd,
      homeDir: options.paths.homeDir,
      prompt: options.prompt,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
      onLine: (line) => {
        const event = parseNdjsonLine(line);
        if (!event) return;
        eventCount += 1;
        if (eventCount > MAX_STREAM_EVENTS) {
          throw new StreamLimitError("Antigravity returned too many stream events.");
        }
        options.onActivity?.(safeActivityLabel(event));
        accumulator.consume(event);
      },
      onProcessStart: options.onProcessStart,
    });
    return accumulator.finish();
  } catch (error) {
    if (error instanceof AntigravityProcessError) throw error;
    // biome-ignore lint/style/useErrorCause: the custom process error preserves the protocol cause.
    throw new AntigravityProcessError("Antigravity returned an invalid stream.", "protocol", {
      cause: error,
    });
  } finally {
    await rm(schemaDirectory, { recursive: true, force: true });
  }
}

/** Run one bounded agy command and retain only bounded text for its caller. */
export async function runAntigravityProbe(options: {
  paths: IsolatedAntigravityPaths;
  cwd: string;
  args: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  onProcessStart?: () => void;
}): Promise<AntigravityProbeResult> {
  await prepareIsolatedAntigravityHome(options.paths);
  const lines: string[] = [];
  const result = await runBoundedChildProcess({
    args: options.args,
    cwd: options.cwd,
    homeDir: options.paths.homeDir,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    maxStdoutBytes: options.maxStdoutBytes,
    allowNonZero: true,
    onLine: (line) => lines.push(line),
    onProcessStart: options.onProcessStart,
  });
  return { ...result, stdout: lines.join("\n") };
}

function safeActivityLabel(event: Record<string, unknown>): string {
  const name = toolName(event);
  if (name) return `activity: ${name}`;
  const type = eventType(event);
  return type ? `activity: ${type}` : "activity: processing";
}
