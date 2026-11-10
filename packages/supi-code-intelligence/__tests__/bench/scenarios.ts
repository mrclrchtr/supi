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
  /**
   * Corpus-relative files a navigation answer should name (orientation
   * questions). Scored as path recall; precision is not meaningful for maps.
   */
  readonly truthPaths?: readonly string[];
}

const CI = "packages/supi-code-intelligence";

const grep = (pattern: string, path = "packages"): BenchCall => ({
  tool: "grep",
  args: { pattern, path },
});
const read = (path: string, offset?: number, limit?: number): BenchCall => ({
  tool: "read",
  args: { path, ...(offset ? { offset } : {}), ...(limit ? { limit } : {}) },
});
const ls = (path: string): BenchCall => ({ tool: "ls", args: { path } });
/**
 * Candidate handle when the previous output asked for disambiguation: the
 * first one, or the first on a line naming `pathHint` (as an agent would pick).
 */
const candidateHandle = (outputs: readonly string[], pathHint?: string): string | null => {
  const last = outputs.at(-1) ?? "";
  if (!last.includes("Target is ambiguous")) return null;
  const line = pathHint ? last.split("\n").find((row) => row.includes(pathHint)) : last;
  return /`(tg-[0-9a-f]+)`/.exec(line ?? "")?.[1] ?? null;
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

/** Entry points and central modules an agent needs to start working in the package. */
const PACKAGE_ENTRY_PATHS = [
  "package.json",
  "CLAUDE.md",
  "src/extension.ts",
  "src/headless.ts",
  "src/api.ts",
  "src/tool/register.ts",
  "src/session/session.ts",
].map((path) => `${CI}/${path}`);
/** Workflow modules of the session layer, one per public tool family. */
const SESSION_WORKFLOW_PATHS = [
  "session.ts",
  "target-workflow.ts",
  "graph-workflow.ts",
  "find-workflow.ts",
  "inspect-workflow.ts",
  "health-workflow.ts",
  "orientation-workflow.ts",
  "refactor-workflow.ts",
].map((path) => `${CI}/src/session/${path}`);

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
    id: "refs-ambiguous-unscoped",
    question: "Who uses resultData() from context-sections.ts? (no scope; disambiguate by path)",
    native: [grep("\\bresultData\\b")],
    code: [
      { tool: "code_graph", args: { target: { symbol: { query: "resultData" } } } },
      (outputs) => {
        const handle = candidateHandle(outputs, "context-sections.ts");
        return handle ? { tool: "code_graph", args: { target: { handle } } } : null;
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
    id: "find-calls",
    question: "Where is selectDirectoryNavigation called?",
    // biome-ignore lint/security/noSecrets: regex pattern
    native: [grep("selectDirectoryNavigation\\(", `${CI}/src`)],
    code: [
      {
        tool: "code_find",
        args: {
          mode: "ast",
          kind: "call",
          query: "selectDirectoryNavigation",
          scope: [`${CI}/src`],
        },
      },
    ],
    truth: [47, 50, 56].map(
      (line) => `${CI}/src/tool/code_orientation/workspace-output.ts:${line}`,
    ),
  },
  {
    id: "find-imports",
    question: "Which source files import the Tree-sitter package?",
    native: [grep('from "@mrclrchtr/supi-tree-sitter', `${CI}/src`)],
    code: [
      {
        tool: "code_find",
        args: {
          mode: "ast",
          kind: "import",
          query: "@mrclrchtr/supi-tree-sitter",
          scope: [`${CI}/src`],
        },
      },
    ],
    // Files, not lines: grep reports the `from` line of a multi-line import,
    // the AST the statement start.
    truthPaths: [
      `${CI}/src/analysis/search/ast-scan-timing.ts`,
      `${CI}/src/analysis/search/ast-scan.ts`,
      `${CI}/src/analysis/search/pattern.ts`,
      `${CI}/src/substrate/workspace-provider-host.ts`,
    ],
  },
  {
    id: "orient-package",
    question: "Where are the entry points and central modules of supi-code-intelligence?",
    native: [ls(CI), ls(`${CI}/src`), read(`${CI}/package.json`)],
    code: [{ tool: "code_orientation", args: { focus: { path: CI } } }],
    truthPaths: PACKAGE_ENTRY_PATHS,
  },
  {
    id: "orient-directory",
    question: "Which workflow modules make up src/session?",
    native: [ls(`${CI}/src/session`)],
    code: [{ tool: "code_orientation", args: { focus: { path: `${CI}/src/session` } } }],
    truthPaths: SESSION_WORKFLOW_PATHS,
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
