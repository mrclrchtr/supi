import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewOutputEvent, ReviewResult, ReviewTarget } from "./types.ts";

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)));
const REVIEW_PROMPT = readFileSync(join(__dirname, "review-prompt.md"), "utf-8");

export interface TempPaths {
  toolPath: string;
  outputPath: string;
  paneLogPath: string;
  runnerPath: string;
  exitPath: string;
}

export interface RunnerExitStatus {
  code: number | null;
  signal: string | null;
  error?: string;
}

export function generateReviewId(): string {
  return randomBytes(4).toString("hex");
}

export function getTempPaths(id: string): TempPaths {
  const base = join(tmpdir(), `supi-review-${id}`);
  return {
    toolPath: `${base}-tool.ts`,
    outputPath: `${base}.json`,
    paneLogPath: `${base}-pane.log`,
    runnerPath: `${base}-runner.mjs`,
    exitPath: `${base}-exit.json`,
  };
}

export function writeSubmitReviewTool(toolPath: string, outputPath: string): void {
  const content = `import { Type } from "typebox";

export default function (pi) {
  pi.registerTool({
    name: "submit_review",
    label: "Submit Review",
    description: [
      "Submit the final structured review result.",
      "Call this tool when you have completed your review and are ready to submit the findings.",
    ].join(" "),
    parameters: Type.Object({
      findings: Type.Array(
        Type.Object({
          title: Type.String(),
          body: Type.String(),
          confidence_score: Type.Number(),
          priority: Type.Number(),
          code_location: Type.Object({
            absolute_file_path: Type.String(),
            line_range: Type.Object({
              start: Type.Number(),
              end: Type.Number(),
            }),
          }),
        })
      ),
      overall_correctness: Type.String(),
      overall_explanation: Type.String(),
      overall_confidence_score: Type.Number(),
    }),
    execute: async (_toolCallId, args) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(${JSON.stringify(outputPath)}, JSON.stringify(args, null, 2));
      return {
        content: [{ type: "text", text: "Review submitted successfully." }],
        details: args,
        terminate: true,
      };
    },
  });
}`;
  writeFileSync(toolPath, content, "utf-8");
}

export function writeTmuxRunnerScript(options: {
  runnerPath: string;
  command: string;
  args: string[];
  paneLogPath: string;
  exitPath: string;
}): void {
  const { runnerPath, command, args, paneLogPath, exitPath } = options;
  const content = `import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";

const command = ${JSON.stringify(command)};
const args = ${JSON.stringify(args)};
const paneLogPath = ${JSON.stringify(paneLogPath)};
const exitPath = ${JSON.stringify(exitPath)};
const log = createWriteStream(paneLogPath, { flags: "a" });
let finished = false;

function writeExit(status) {
  try {
    writeFileSync(exitPath, JSON.stringify(status));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
  }
}

function finish(status, processCode) {
  if (finished) process.exit(processCode);
  finished = true;
  writeExit(status);
  log.end(() => process.exit(processCode));
}

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout?.on("data", (chunk) => {
  process.stdout.write(chunk);
  log.write(chunk);
});

child.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});

child.on("error", (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  log.write(message + "\\n");
  finish({ code: null, signal: null, error: message }, 127);
});

child.on("exit", (code, signal) => {
  finish({ code, signal }, typeof code === "number" ? code : 1);
});
`;
  writeFileSync(runnerPath, content, "utf-8");
}

export function getPiInvocation(): { command: string; args: string[] } {
  const argv1 = process.argv[1];
  if (argv1 && (argv1.endsWith(".ts") || argv1.endsWith(".js") || argv1.endsWith(".mjs"))) {
    return { command: process.execPath, args: [argv1] };
  }
  return { command: "pi", args: [] };
}

export function buildPiArgs(options: {
  model: string | undefined;
  toolPath: string;
  prompt: string;
}): string[] {
  const { model, toolPath, prompt } = options;
  const args = [
    "--print",
    "--no-session",
    "-e",
    toolPath,
    "--no-extensions",
    "--no-themes",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--tools",
    "read,grep,find,ls,submit_review",
    "--append-system-prompt",
    REVIEW_PROMPT,
  ];
  if (model) {
    args.push("--model", model);
  }
  args.push(prompt);
  return args;
}

export function readStructuredOutput(outputPath: string): ReviewOutputEvent | undefined {
  if (!existsSync(outputPath)) return undefined;
  try {
    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (isReviewOutputEventLike(parsed)) {
      return parsed as ReviewOutputEvent;
    }
  } catch {
    // ignore malformed output
  }
  return undefined;
}

export function readRunnerExitStatus(exitPath: string): RunnerExitStatus | undefined {
  if (!existsSync(exitPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(exitPath, "utf-8")) as Partial<RunnerExitStatus>;
    return {
      code: typeof parsed.code === "number" ? parsed.code : null,
      signal: typeof parsed.signal === "string" ? parsed.signal : null,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return undefined;
  }
}

export function makeFailedResult(
  reason: string,
  target: ReviewTarget,
  warning?: string,
): ReviewResult {
  return { kind: "failed", reason, target, warning };
}

function isReviewOutputEventLike(value: unknown): value is ReviewOutputEvent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.findings) &&
    typeof obj.overall_correctness === "string" &&
    typeof obj.overall_explanation === "string" &&
    typeof obj.overall_confidence_score === "number"
  );
}
