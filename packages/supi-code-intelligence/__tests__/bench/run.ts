/**
 * Deterministic tool-output benchmark: native PI tools vs. code_* tools on a
 * frozen corpus. No model calls. See ../../docs/bench.md.
 *
 *   pnpm bench:code-intelligence            # compare with baseline.json
 *   pnpm bench:code-intelligence --update   # rewrite baseline.json
 *   pnpm bench:code-intelligence --dump     # also write raw outputs to bench/out/
 */
/* biome-ignore-all lint/suspicious/noConsole: CLI report output */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createGrepTool, createReadTool } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import { createRealLanguageWorkspace } from "../helpers/real-substrate-workspace.ts";
import { extractCorpus, linkCorpusDependencies } from "./corpus.ts";
import {
  type BenchCall,
  type BenchScenario,
  type BenchStep,
  CORPUS_COMMIT,
  scenarios,
} from "./scenarios.ts";

/** Deterministic metrics only; latency is reported but never compared. */
interface ArmMetrics {
  calls: number;
  tokens: number;
  precision?: number;
  recall?: number;
}
interface ScenarioMetrics {
  native: ArmMetrics;
  code: ArmMetrics;
}
interface Baseline {
  corpusCommit: string;
  tokenEstimate: "chars/4";
  codeToolSurfaceTokens: number;
  scenarios: Record<string, ScenarioMetrics>;
}

const BASELINE = join(import.meta.dirname, "baseline.json");
const OUT = join(import.meta.dirname, "out");
const update = process.argv.includes("--update");
const dump = process.argv.includes("--dump");

/** Same heuristic PI uses for context estimation. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const corpus = extractCorpus(CORPUS_COMMIT);
const workspace = await createRealLanguageWorkspace({
  fixturePath: corpus.dir,
  sourceFile: "packages/supi-code-intelligence/src/tool/register.ts",
  language: "typescript",
  prepare: linkCorpusDependencies,
  // The compiler SuPi selects by default; tsserver 6 answers implementations
  // from a single project, which would understate cross-package results.
  typescriptInstallation: "@typescript/native",
});
corpus.dispose();
const cwd = workspace.cwd;

try {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => workspace.session);
  const ctx = makeCtx({ cwd });
  const nativeTools = { grep: createGrepTool(cwd), read: createReadTool(cwd) };

  const execute = async (call: BenchCall): Promise<string> => {
    const native = nativeTools[call.tool as keyof typeof nativeTools];
    const result = (
      native
        ? await native.execute("bench", call.args as never)
        : await getTool(pi, call.tool).execute("bench", call.args, undefined, undefined, ctx)
    ) as { content: { text?: string }[] };
    return result.content.map((item) => item.text ?? "").join("\n");
  };

  // Measure a defined warm state: tsserver loads tsconfig projects lazily, so
  // cold first calls can omit cross-project results nondeterministically.
  for (const scenario of scenarios) await runArm(execute, scenario.code, scenario, cwd);

  const results: Record<string, ScenarioMetrics> = {};
  const latency: Record<string, string> = {};
  if (dump) mkdirSync(OUT, { recursive: true });
  for (const scenario of scenarios) {
    const native = await runArm(execute, scenario.native, scenario, cwd);
    const code = await runArm(execute, scenario.code, scenario, cwd);
    results[scenario.id] = { native: native.metrics, code: code.metrics };
    latency[scenario.id] = `${native.ms}/${code.ms}`;
    if (dump) {
      writeFileSync(join(OUT, `${scenario.id}.native.txt`), native.outputs.join("\n\n=====\n\n"));
      writeFileSync(join(OUT, `${scenario.id}.code.txt`), code.outputs.join("\n\n=====\n\n"));
    }
  }

  const current: Baseline = {
    corpusCommit: CORPUS_COMMIT,
    tokenEstimate: "chars/4",
    codeToolSurfaceTokens: surfaceTokens(pi.tools),
    scenarios: results,
  };
  const previous = readBaseline();
  printReport(current, previous, latency);
  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Baseline written: ${relative(process.cwd(), BASELINE)}`);
  }
} finally {
  await workspace.dispose();
}
process.exit(0);

async function runArm(
  execute: (call: BenchCall) => Promise<string>,
  steps: readonly BenchStep[],
  scenario: BenchScenario,
  cwd: string,
): Promise<{ metrics: ArmMetrics; outputs: string[]; ms: number }> {
  const outputs: string[] = [];
  const found = new Set<string>();
  let tokens = 0;
  const started = performance.now();
  let calls = 0;
  for (const step of steps) {
    const call = typeof step === "function" ? step(outputs) : step;
    if (!call) continue;
    calls++;
    const output = await execute(call);
    outputs.push(output);
    tokens += estimateTokens(call.tool + JSON.stringify(call.args)) + estimateTokens(output);
    const base = call.tool === "grep" ? resolve(cwd, String(call.args.path ?? ".")) : cwd;
    for (const location of locations(output, base, cwd)) found.add(location);
  }
  const ms = Math.round(performance.now() - started);
  const metrics: ArmMetrics = { calls, tokens };
  if (scenario.truth) {
    const expected = new Set(scenario.truth);
    const hits = [...found].filter((location) => expected.has(location)).length;
    metrics.precision = round(found.size ? hits / found.size : 0);
    metrics.recall = round(hits / expected.size);
  }
  return { metrics, outputs, ms };
}

/**
 * Extract answer locations as `path:line`. Handles grep (`path:12:`) and
 * code_* (`` `path`: L12:3, L40 `` / `` `path:12:3` ``). "Read Next" hints are
 * navigation suggestions, not answers, and are excluded.
 */
function locations(text: string, base: string, cwd: string): Set<string> {
  const out = new Set<string>();
  const answer = text.split("## Read Next")[0] ?? "";
  const norm = (path: string) => relative(cwd, resolve(base, path));
  for (const m of answer.matchAll(/^([\w./@-]+\.\w+):(\d+):/gm)) {
    out.add(`${norm(m[1] as string)}:${m[2]}`);
  }
  for (const m of answer.matchAll(/`([\w./@-]+\.\w+)`:?\s*((?:L\d+(?::\d+)?,?\s*)+)/g)) {
    for (const line of (m[2] as string).matchAll(/L(\d+)/g)) {
      out.add(`${relative(cwd, resolve(cwd, m[1] as string))}:${line[1]}`);
    }
  }
  for (const m of answer.matchAll(/`([\w./@-]+\.\w+):(\d+)(?::\d+)?`/g)) {
    out.add(`${relative(cwd, resolve(cwd, m[1] as string))}:${m[2]}`);
  }
  return out;
}

/** Per-request prompt cost of the registered code_* tool definitions. */
function surfaceTokens(tools: readonly unknown[]): number {
  return tools.reduce<number>((sum, tool) => {
    const t = tool as Record<string, unknown>;
    const surface = {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      promptSnippet: t.promptSnippet,
      promptGuidelines: t.promptGuidelines,
    };
    return sum + estimateTokens(JSON.stringify(surface));
  }, 0);
}

function readBaseline(): Baseline | undefined {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  } catch {
    return undefined;
  }
}

function printReport(
  current: Baseline,
  previous: Baseline | undefined,
  latency: Record<string, string>,
): void {
  const comparable = previous?.corpusCommit === current.corpusCommit;
  if (previous && !comparable) console.log("Baseline uses another corpus commit; no diff shown.");
  const pct = (value?: number) => (value === undefined ? "–" : `${Math.round(value * 100)}%`);
  const diff = (now?: number, before?: number) =>
    !comparable || now === undefined || before === undefined || now === before
      ? ""
      : ` (${now > before ? "+" : ""}${Number.isInteger(now - before) ? now - before : `${Math.round((now - before) * 100)}pp`})`;

  console.table(
    Object.entries(current.scenarios).map(([id, { native, code }]) => {
      const before = previous?.scenarios[id]?.code;
      return {
        scenario: id,
        "native tok": native.tokens,
        "code tok": `${code.tokens}${diff(code.tokens, before?.tokens)}`,
        Δ: `${Math.round((code.tokens / native.tokens - 1) * 100)}%`,
        "calls n/c": `${native.calls}/${code.calls}${diff(code.calls, before?.calls)}`,
        "precision n/c": `${pct(native.precision)}/${pct(code.precision)}${diff(code.precision, before?.precision)}`,
        "recall n/c": `${pct(native.recall)}/${pct(code.recall)}${diff(code.recall, before?.recall)}`,
        "ms n/c": latency[id],
      };
    }),
  );
  console.log(
    `code_* tool surface: ~${current.codeToolSurfaceTokens} tokens per request` +
      diff(current.codeToolSurfaceTokens, previous?.codeToolSurfaceTokens),
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
