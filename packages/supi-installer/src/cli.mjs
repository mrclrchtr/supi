import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { executePlan } from "./execution.mjs";
import { cleanLine, formatInventory, formatReport } from "./format.mjs";
import { createContext, readInventory } from "./inventory.mjs";
import { createMatrix } from "./matrix.mjs";
import { createPiRunner, requirePi } from "./process.mjs";
import { skillsHint } from "./skills.mjs";
import { runTerminal } from "./ui/terminal.mjs";

const HELP = `Usage: supi-installer [--project <path>] [--dry-run]

Select direct SuPi package declarations in Project and Global scopes.

  --project <path>  Use this exact directory; do not infer a Git root
  --dry-run         Print current declarations; do not change packages
  --help, -h        Show help
  --version, -v     Show the installer version

Requires Pi on PATH and saved Pi trust for the project, even for global work.
Open Pi in that directory and use /trust before starting the installer.

Arrows: select row/scope. Space: toggle. r/a/c: Recommended/All/Clear column.
Enter: review. y: confirm in review. Escape: cancel.
No unattended package changes are supported.

${skillsHint().join("\n")}
`;

/** CLI boundary shared by the executable and terminal tests. @param {string[]} args @param {{input?: NodeJS.ReadStream, output?: NodeJS.WriteStream, error?: NodeJS.WriteStream, runner?: import('./types.ts').Runner, signal?: AbortSignal}} [options] */
export async function runCli(args, options = {}) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.error ?? process.stderr;
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        project: { type: "string" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
    if (values.help) {
      output.write(HELP);
      return 0;
    }
    if (values.version) {
      output.write(
        `${JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version}\n`,
      );
      return 0;
    }
    if (!values["dry-run"] && (!input.isTTY || !output.isTTY))
      throw new Error(
        "An interactive terminal is required. Use --dry-run to print current declarations.",
      );
    const context = createContext({ project: values.project });
    const inventory = readInventory(context);
    const runner =
      options.runner ??
      createPiRunner({ env: { ...process.env, PI_CODING_AGENT_DIR: context.agentDir } });
    await requirePi(runner, context.project, options.signal);
    if (values["dry-run"]) {
      output.write(`${[...formatInventory(inventory), "", ...skillsHint()].join("\n")}\n`);
      return 0;
    }
    return await runInteractive(inventory, { input, output, runner, signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted) {
      errorOutput.write("Cancelled. No more commands will start.\n");
      return 130;
    }
    errorOutput.write(
      `Error: ${cleanLine(error instanceof Error ? error.message : String(error))}\n`,
    );
    return 1;
  }
}

/** @param {import('./types.ts').Inventory} inventory @param {{input: NodeJS.ReadStream, output: NodeJS.WriteStream, runner: import('./types.ts').Runner, signal?: AbortSignal}} options */
async function runInteractive(inventory, options) {
  const { input, output, runner } = options;
  const plan = await runTerminal(createMatrix(inventory), {
    input,
    output,
    signal: options.signal,
  });
  if (plan === null) {
    output.write("Cancelled. No package commands ran.\n");
    return options.signal?.aborted ? 130 : 0;
  }
  if (plan.length === 0) {
    output.write(`No changes. No package commands ran.\n\n${skillsHint().join("\n")}\n`);
    return 0;
  }
  const report = await executePlan(inventory, plan, {
    runner,
    signal: options.signal,
    onProgress: (operation) => {
      output.write(
        `${cleanLine(`${operation.action.toUpperCase()} ${operation.scope}: ${operation.source}`)}\n`,
      );
    },
  });
  output.write(`${formatReport(report)}\n`);
  return report.cancelled ? 130 : report.ok ? 0 : 1;
}
