/**
 * Benchmark scenarios: one navigation question answered once with native PI
 * tools and once with code_* tools. Call sequences model a competent agent;
 * a function step receives earlier outputs (e.g. to pick a candidate handle).
 *
 * Ground truth (`truth`) is `path:line` against the pinned corpus commit and
 * must be re-derived whenever `CORPUS_COMMIT` changes.
 */

/** Pinned SuPi commit used as the frozen corpus. */
// biome-ignore lint/security/noSecrets: git commit SHA
export const CORPUS_COMMIT = "b0c23833bb5b1da0c8f4a1619ca7ffdb47fd5f20";

export interface BenchCall {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

/** A function step may return `null` to skip itself (e.g. no disambiguation needed). */
export type BenchStep = BenchCall | ((previousOutputs: readonly string[]) => BenchCall | null);

export interface BenchScenario {
  readonly id: string;
  readonly question: string;
  readonly native: readonly BenchStep[];
  readonly code: readonly BenchStep[];
  /** Expected answer locations as corpus-relative `path:line`. */
  readonly truth?: readonly string[];
}

const CI = "packages/supi-code-intelligence";

const grep = (pattern: string, path = "packages"): BenchCall => ({
  tool: "grep",
  args: { pattern, path },
});
const read = (path: string, offset: number, limit: number): BenchCall => ({
  tool: "read",
  args: { path, offset, limit },
});
/** First candidate handle when the previous output asked for disambiguation. */
const candidateHandle = (outputs: readonly string[]): string | null => {
  const last = outputs.at(-1) ?? "";
  return last.includes("Target is ambiguous") ? (/`(tg-[0-9a-f]+)`/.exec(last)?.[1] ?? null) : null;
};

const WORKFLOW_CONTROL_SITES = [
  ...[
    ["code_orientation", 8, 22],
    ["code_graph", 6, 22],
    ["code_refactor_plan", 9, 24],
    ["code_health", 5, 19],
    ["code_inspect", 6, 18],
    ["code_refactor_apply", 4, 15],
    ["code_find", 5, 21],
    ["code_resolve", 5, 17],
  ].flatMap(([tool, importLine, callLine]) => [
    `${CI}/src/tool/${tool}/execute.ts:${importLine}`,
    `${CI}/src/tool/${tool}/execute.ts:${callLine}`,
  ]),
  ...[11, 57, 102, 116, 187].map(
    (line) => `${CI}/__tests__/unit/tool/infra/operation-correlation.test.ts:${line}`,
  ),
];
const workflowControl = { symbol: { query: "toWorkflowControl" } };

// biome-ignore lint/security/noSecrets: regex pattern
const SESSION_DECLARATIONS = "^(export )?(async )?(function|class|interface|type|const|enum) ";
/** The class and two module functions; re-export statements forward other modules' names. */
const SESSION_TOP_LEVEL = [140, 484, 492].map((line) => `${CI}/src/session/session.ts:${line}`);

export const scenarios: readonly BenchScenario[] = [
  {
    id: "refs-unique-default",
    question: "Where is toWorkflowControl used? (default output bounds)",
    native: [grep("\\btoWorkflowControl\\b")],
    code: [{ tool: "code_graph", args: { target: workflowControl } }],
    truth: WORKFLOW_CONTROL_SITES,
  },
  {
    id: "refs-unique-all",
    question: "Where is toWorkflowControl used? (all sites requested)",
    native: [grep("\\btoWorkflowControl\\b")],
    code: [{ tool: "code_graph", args: { target: workflowControl, maxResults: 50 } }],
    truth: WORKFLOW_CONTROL_SITES,
  },
  {
    id: "refs-ambiguous",
    question: "Who uses the exported resultData() from orientation/context-sections.ts?",
    native: [grep("\\bresultData\\b")],
    code: [
      {
        tool: "code_graph",
        args: {
          target: {
            symbol: {
              query: "resultData",
              scope: `${CI}/src/session/orientation/context-sections.ts`,
            },
          },
        },
      },
    ],
    truth: [26, 56, 69, 84, 99, 128].map(
      (line) => `${CI}/src/session/orientation/context-facts.ts:${line}`,
    ),
  },
  {
    id: "definition-signature",
    question: "Where is createSessionCache defined and what does it return?",
    native: [grep("function createSessionCache"), read(`${CI}/src/app/app.ts`, 50, 30)],
    code: [
      { tool: "code_resolve", args: { target: { symbol: { query: "createSessionCache" } } } },
      {
        tool: "code_inspect",
        args: { point: { file: `${CI}/src/app/app.ts`, line: 57, character: 17 } },
      },
    ],
    truth: [`${CI}/src/app/app.ts:57`],
  },
  {
    id: "file-outline-default",
    question: "Which top-level declarations does session.ts contain? (default output bounds)",
    native: [grep(SESSION_DECLARATIONS, `${CI}/src/session/session.ts`)],
    code: [{ tool: "code_resolve", args: { target: { file: `${CI}/src/session/session.ts` } } }],
    truth: SESSION_TOP_LEVEL,
  },
  {
    id: "file-outline",
    question: "Which top-level declarations does session.ts contain?",
    native: [grep(SESSION_DECLARATIONS, `${CI}/src/session/session.ts`)],
    code: [
      {
        tool: "code_resolve",
        args: { target: { file: `${CI}/src/session/session.ts` }, maxResults: 50 },
      },
    ],
    truth: SESSION_TOP_LEVEL,
  },
  {
    id: "callees",
    question: "What does registerCodeIntelligenceTools call?",
    native: [
      grep("function registerCodeIntelligenceTools"),
      read(`${CI}/src/tool/register.ts`, 84, 77),
    ],
    code: [
      {
        tool: "code_graph",
        args: {
          target: { symbol: { query: "registerCodeIntelligenceTools" } },
          relations: ["callees"],
        },
      },
    ],
  },
  {
    id: "implementations",
    question: "Which objects implement SettingsModule?",
    // biome-ignore lint/security/noSecrets: regex pattern
    native: [grep(":\\s*SettingsModule\\b")],
    code: [
      {
        tool: "code_graph",
        args: {
          target: { symbol: { query: "SettingsModule", symbolKind: "interface" } },
          relations: ["implements"],
        },
      },
      (outputs) => {
        const handle = candidateHandle(outputs);
        return handle
          ? { tool: "code_graph", args: { target: { handle }, relations: ["implements"] } }
          : null;
      },
    ],
  },
];
