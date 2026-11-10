/**
 * Deterministic tool-output benchmark: native PI tools vs. code_* tools on a
 * frozen corpus. No model calls. See ../../docs/bench.md.
 *
 *   pnpm bench:code-intelligence            # compare with baseline.json
 *   pnpm bench:code-intelligence --update   # rewrite baseline.json
 *   pnpm bench:code-intelligence --dump     # also write raw outputs to bench/out/
 */
/* biome-ignore-all lint/suspicious/noConsole: CLI report output */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createGrepTool, createLsTool, createReadTool } from "@earendil-works/pi-coding-agent";
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
  /** Tokens per correct location or path; lower is better. Absent without hits. */
  tokensPerHit?: number;
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
  const nativeTools = {
    grep: createGrepTool(cwd),
    ls: createLsTool(cwd),
    read: createReadTool(cwd),
  };

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
  const foundPaths = new Set<string>();
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
    const base = call.tool === "grep" ? grepBase(cwd, String(call.args.path ?? ".")) : cwd;
    for (const location of locations(output, base, cwd)) found.add(location);
    for (const path of namedPaths(call, output, scenario.truthPaths ?? [], cwd))
      foundPaths.add(path);
  }
  const ms = Math.round(performance.now() - started);
  return { metrics: score(scenario, { calls, tokens }, found, foundPaths), outputs, ms };
}

/** Add accuracy and cost-per-hit metrics against the scenario's ground truth. */
function score(
  scenario: BenchScenario,
  base: ArmMetrics,
  found: ReadonlySet<string>,
  foundPaths: ReadonlySet<string>,
): ArmMetrics {
  const metrics = { ...base };
  const perHit = (hits: number) =>
    hits ? { tokensPerHit: Math.round(metrics.tokens / hits) } : {};
  if (scenario.truth) {
    const expected = new Set(scenario.truth);
    const hits = [...found].filter((location) => expected.has(location)).length;
    metrics.precision = round(found.size ? hits / found.size : 0);
    metrics.recall = round(hits / expected.size);
    Object.assign(metrics, perHit(hits));
  }
  if (scenario.truthPaths) {
    metrics.recall = round(foundPaths.size / scenario.truthPaths.length);
    Object.assign(metrics, perHit(foundPaths.size));
  }
  return metrics;
}

/**
 * Extract answer locations as `path:line`. Handles grep (`path:12:`) and
 * code_* (`` `path`: L12:3, L40 `` / `` `path:12:3` `` / file outline rows
 * `` — L12:3 `` under `` # File outline of `path` `` / code_find rows
 * `` - `name` (kind) L12:3–L12:9 `` under `` ### path ``). "Read Next" hints are
 * navigation suggestions, not answers, and are excluded.
 */
function locations(text: string, base: string, cwd: string): Set<string> {
  const out = new Set<string>();
  const answer = text.split("## Read Next")[0] ?? "";
  const outlineFile = /^# File outline of `([^`]+)`/m.exec(answer)?.[1];
  if (outlineFile) {
    for (const m of answer.matchAll(/ — L(\d+):\d+/g)) out.add(`${outlineFile}:${m[1]}`);
  }
  for (const location of findRowLocations(answer, cwd)) out.add(location);
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

/** code_find rows (`` - `name` (kind) L12:3 ``) under their `### path` file heading. */
function findRowLocations(answer: string, cwd: string): string[] {
  const out: string[] = [];
  let heading: string | undefined;
  for (const line of answer.split("\n")) {
    const file = /^### ([\w./@-]+\.\w+)$/.exec(line)?.[1];
    if (file) heading = file;
    else if (/^#{1,3} /.test(line)) heading = undefined;
    const row = /^- .*\) L(\d+):\d+/.exec(line)?.[1];
    if (heading && row) out.push(`${relative(cwd, resolve(cwd, heading))}:${row}`);
  }
  return out;
}

/**
 * Expected files a navigation answer names. A path counts when the output
 * mentions it relative to the workspace or to the call's directory/focus
 * (ls and directory inventories print focus-relative names), or when the
 * call itself reads it.
 */
function namedPaths(
  call: BenchCall,
  output: string,
  expected: readonly string[],
  cwd: string,
): string[] {
  const args = call.args as { path?: unknown; focus?: { path?: unknown } };
  const callPath = String(args.focus?.path ?? args.path ?? ".");
  const bases = [cwd, resolve(cwd, callPath)];
  return expected.filter((path) => {
    if (call.tool === "read" && resolve(cwd, callPath) === resolve(cwd, path)) return true;
    return bases.some((base) => {
      const name = relative(base, resolve(cwd, path));
      if (name.startsWith("..")) return false;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Manifest values keep their written `./` prefix; it names the same file.
      return new RegExp(`(^|[^\\w./-])(\\./)?${escaped}($|[^\\w./-])`, "m").test(output);
    });
  });
}

/** grep prints paths relative to a searched directory, or the bare name for a searched file. */
function grepBase(cwd: string, path: string): string {
  const target = resolve(cwd, path);
  return statSync(target).isFile() ? dirname(target) : target;
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
        "tok/hit n/c": `${native.tokensPerHit ?? "–"}/${code.tokensPerHit ?? "–"}${diff(code.tokensPerHit, before?.tokensPerHit)}`,
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
