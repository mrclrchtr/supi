/**
 * Deterministic tool-output benchmark: native PI tools vs. code_* tools on a
 * frozen corpus. No model calls. See ../../docs/bench.md.
 *
 *   pnpm bench:code-intelligence            # compare with baseline.json
 *   pnpm bench:code-intelligence --update   # rewrite baseline.json
 *   pnpm bench:code-intelligence --dump     # also write raw outputs to bench/out/
 *   pnpm bench:code-intelligence --check    # exit 1 when metrics differ from baseline.json
 */
/* biome-ignore-all lint/suspicious/noConsole: CLI report output */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const check = process.argv.includes("--check");

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
let exitCode = 0;

try {
  validateTruth(scenarios, cwd);
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
  if (check) exitCode = checkBaseline(current, previous);
  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Baseline written: ${relative(process.cwd(), BASELINE)}`);
  }
} finally {
  await workspace.dispose();
}
process.exit(exitCode);

/**
 * What an arm surfaced. `found` are reported answer locations (wrong ones
 * lower precision); `seen` are lines of read windows, which count only when
 * they hit the truth, because unrelated window lines are already paid for in
 * tokens; `paths` are named expected files.
 */
interface Evidence {
  found: Set<string>;
  seen: Set<string>;
  paths: Set<string>;
}

async function runArm(
  execute: (call: BenchCall) => Promise<string>,
  steps: readonly BenchStep[],
  scenario: BenchScenario,
  cwd: string,
): Promise<{ metrics: ArmMetrics; outputs: string[]; ms: number }> {
  const outputs: string[] = [];
  const evidence: Evidence = { found: new Set(), seen: new Set(), paths: new Set() };
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
    collectEvidence(evidence, { call, output }, scenario, cwd);
  }
  const ms = Math.round(performance.now() - started);
  const metrics = score(scenario, { calls, tokens }, evidence);
  if (metrics.recall === 0) {
    // Every scenario has a non-empty answer: zero hits means the extractors no
    // longer understand the output format, not that the tool got worse.
    throw new Error(`${scenario.id}: no expected location or path recognized; update extractors`);
  }
  return { metrics, outputs, ms };
}

function collectEvidence(
  evidence: Evidence,
  { call, output }: { call: BenchCall; output: string },
  scenario: BenchScenario,
  cwd: string,
): void {
  if (call.tool === "read") {
    for (const line of readWindow(call, output, cwd)) evidence.seen.add(line);
  } else if (!call.locate) {
    const base = call.tool === "grep" ? grepBase(cwd, String(call.args.path ?? ".")) : cwd;
    for (const location of locations(output, base, cwd)) evidence.found.add(location);
  }
  for (const path of namedPaths(call, output, scenario.truthPaths ?? [], cwd)) {
    evidence.paths.add(path);
  }
}

/** Add accuracy and cost-per-hit metrics against the scenario's ground truth. */
function score(scenario: BenchScenario, base: ArmMetrics, evidence: Evidence): ArmMetrics {
  const metrics = { ...base };
  const perHit = (hits: number) =>
    hits ? { tokensPerHit: Math.round(metrics.tokens / hits) } : {};
  if (scenario.truth) {
    const { precision, hits } = scoreLocations(scenario.truth.map(parseSpan), evidence);
    metrics.precision = precision;
    metrics.recall = round(hits / scenario.truth.length);
    Object.assign(metrics, perHit(hits));
  }
  if (scenario.truthPaths) {
    metrics.recall = round(evidence.paths.size / scenario.truthPaths.length);
    Object.assign(metrics, perHit(evidence.paths.size));
  }
  return metrics;
}

/** Precision over reported plus truth-hitting read lines; hits are distinct truth spans covered. */
function scoreLocations(
  spans: readonly Span[],
  { found, seen }: Evidence,
): { precision: number; hits: number } {
  const matches = (location: string) => spans.filter((span) => inSpan(span, location));
  const reported = [...found];
  const correct = reported.filter((location) => matches(location).length > 0).length;
  const seenOnly = [...seen].filter((line) => !found.has(line) && matches(line).length > 0).length;
  const answered = reported.length + seenOnly;
  const hits = new Set([...reported, ...seen].flatMap(matches)).size;
  return { precision: round(answered ? (correct + seenOnly) / answered : 0), hits };
}

/**
 * Extract answer locations as `path:line`. Handles grep (`path:12:`) and
 * code_* (`` `path`: L12:3, L40 `` / `` `path:12:3` `` / file outline rows
 * `` — L12:3 `` under `` # File outline of `path` `` / code_graph callee rows
 * `` - `name` — L12:3 `` under `` Target: … — `path` `` / code_find rows
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
  // code_graph callee rows (`` - `callee` — L12:3 ``) belong to the target's file.
  const targetFile = /^Target: `[^`]+` — `([^`]+)`/m.exec(answer)?.[1];
  if (targetFile) {
    for (const m of answer.matchAll(/^- `[^`]+` — L(\d+):\d+/gm)) out.add(`${targetFile}:${m[1]}`);
  }
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

interface Span {
  path: string;
  start: number;
  end: number;
}

/** Parse a truth entry `path:line` or `path:start-end`. */
function parseSpan(entry: string): Span {
  const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(entry);
  if (!m) throw new Error(`Invalid truth entry: ${entry}`);
  const start = Number(m[2]);
  return { path: m[1] as string, start, end: Number(m[3] ?? start) };
}

function inSpan(span: Span, location: string): boolean {
  const cut = location.lastIndexOf(":");
  const line = Number(location.slice(cut + 1));
  return location.slice(0, cut) === span.path && line >= span.start && line <= span.end;
}

/**
 * Fail fast on stale ground truth: every span must exist in the corpus and
 * contain the scenario's `truthText` (line numbers drift between commits).
 */
function validateTruth(all: readonly BenchScenario[], root: string): void {
  const problems = all.flatMap((scenario) => [
    ...(scenario.truth ?? []).flatMap((entry) => spanProblem(scenario, entry, root)),
    ...(scenario.truthPaths ?? [])
      .filter((path) => !existsSync(join(root, path)))
      .map((path) => `${scenario.id}: missing path ${path}`),
  ]);
  if (problems.length) throw new Error(`Stale ground truth:\n${problems.join("\n")}`);
}

function spanProblem(scenario: BenchScenario, entry: string, root: string): string[] {
  const span = parseSpan(entry);
  const file = join(root, span.path);
  if (!existsSync(file)) return [`${scenario.id}: missing file ${span.path}`];
  const lines = readFileSync(file, "utf8").split("\n");
  const text = lines.slice(span.start - 1, span.end).join("\n");
  const pattern = scenario.truthText ?? /\S/;
  return span.end <= lines.length && pattern.test(text)
    ? []
    : [`${scenario.id}: ${entry} does not match ${pattern}`];
}

/**
 * Corpus lines a read call displayed. PI's read output has no line numbers;
 * a trailing continuation notice (`[N more lines …]`) is not file content.
 */
function readWindow(call: BenchCall, output: string, cwd: string): string[] {
  const args = call.args as { path: string; offset?: number };
  const path = relative(cwd, resolve(cwd, args.path));
  const body = output.replace(/\n*\[\d+ more lines in file\.[^\]]*\]\s*$/, "");
  const start = args.offset ?? 1;
  return body.split("\n").map((_, index) => `${path}:${start + index}`);
}

/** Compare deterministic metrics with the baseline; returns the process exit code. */
function checkBaseline(current: Baseline, previous: Baseline | undefined): number {
  if (!previous || previous.corpusCommit !== current.corpusCommit) {
    console.error("--check: no baseline for this corpus commit; run with --update first.");
    return 1;
  }
  const { scenarios: now, ...nowMeta } = current;
  const { scenarios: before, ...beforeMeta } = previous;
  const changed = [...new Set([...Object.keys(now), ...Object.keys(before)])].filter(
    (id) => JSON.stringify(now[id]) !== JSON.stringify(before[id]),
  );
  if (JSON.stringify(nowMeta) !== JSON.stringify(beforeMeta)) changed.push("(tool surface)");
  if (!changed.length) return 0;
  console.error(`--check: metrics differ from baseline: ${changed.join(", ")}`);
  console.error("Review the diff; if intended, run with --update and commit baseline.json.");
  return 1;
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
