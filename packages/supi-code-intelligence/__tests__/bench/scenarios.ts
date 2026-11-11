/**
 * Benchmark scenarios: one navigation question answered once with native PI
 * tools and once with code_* tools. Call sequences model a competent agent;
 * a function step receives earlier outputs (e.g. to pick a candidate handle).
 *
 * Ground truth (`truth`) is `path:line` or `path:start-end` against the pinned
 * corpus commit and must be re-derived whenever `CORPUS_COMMIT` changes; the
 * runner rejects entries whose lines do not match `truthText`.
 */

/** Pinned SuPi commit used as the frozen corpus. */
// biome-ignore lint/security/noSecrets: git commit SHA
export const CORPUS_COMMIT = "b0c23833bb5b1da0c8f4a1619ca7ffdb47fd5f20";

/**
 * Completed `code_*` calls per usage category in persisted Pi sessions across
 * all local projects, 60 days up to 2026-11-11 (classified like
 * `scripts/code-tool-usage.mjs`). The usage-weighted balance weights each
 * scenario category by its share; categories without scenarios are reported
 * as uncovered. A snapshot of one user's sessions, not a general workload.
 */
export const USAGE_WEIGHTS = {
  "orientation-path": 1291,
  "find-definition": 302,
  health: 240,
  "orientation-workspace": 224,
  "graph-references": 129,
  "find-call": 94,
  inspect: 84,
  "find-semantic": 61,
  "resolve-file": 50,
  "find-import": 46,
  "resolve-symbol": 44,
  refactor: 42,
  "graph-callees": 28,
  "resolve-anchor": 26,
  "find-other-kind": 23,
  "orientation-target": 23,
  "graph-combined": 15,
  "graph-implements": 4,
} as const;

export type UsageCategory = keyof typeof USAGE_WEIGHTS;

export interface BenchCall {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /**
   * The output only locates where to look next (e.g. grep for a declaration
   * before reading its body); its locations are not scored as answers.
   */
  readonly locate?: boolean;
}

/** A function step may return `null` to skip itself (e.g. no disambiguation needed). */
export type BenchStep = BenchCall | ((previousOutputs: readonly string[]) => BenchCall | null);

export interface BenchScenario {
  readonly id: string;
  readonly question: string;
  /** Observed usage category the code arm represents; see `USAGE_WEIGHTS`. */
  readonly category: UsageCategory;
  readonly native: readonly BenchStep[];
  readonly code: readonly BenchStep[];
  /**
   * Expected answer locations as corpus-relative `path:line`, or
   * `path:start-end` when tools legitimately report different lines of one
   * construct (e.g. a return-type signature vs. the object literal it returns).
   * An empty list means the correct answer is "none" (e.g. a symbol that does
   * not exist); any reported location then counts against precision.
   */
  readonly truth?: readonly string[];
  /** Pattern every `truth` span must contain in the corpus; guards stale line numbers. */
  readonly truthText?: RegExp;
  /**
   * Corpus-relative files a navigation answer should name (orientation
   * questions). Scored as path recall; precision is not meaningful for maps.
   */
  readonly truthPaths?: readonly string[];
  /**
   * The question needs the code at each reported location (e.g. how a symbol
   * is used), not just positions: also measure the cost of reading every
   * reported location whose source text the arm has not shown.
   */
  readonly viewSource?: boolean;
}

const CI = "packages/supi-code-intelligence";

const grep = (pattern: string, path = "packages", locate = false): BenchCall => ({
  tool: "grep",
  args: { pattern, path },
  ...(locate ? { locate } : {}),
});
const read = (path: string, offset?: number, limit?: number): BenchCall => ({
  tool: "read",
  args: { path, ...(offset ? { offset } : {}), ...(limit ? { limit } : {}) },
});
const ls = (path: string): BenchCall => ({ tool: "ls", args: { path } });
/**
 * Read `limit` lines from the first grep hit in the previous output, as an
 * agent would after locating a declaration. Grep paths are relative to `base`.
 */
const readFromGrepHit =
  (base: string, limit: number) =>
  (outputs: readonly string[]): BenchCall | null => {
    const hit = /^([\w./@-]+\.\w+):(\d+):/m.exec(outputs.at(-1) ?? "");
    return hit ? read(`${base}/${hit[1]}`, Number(hit[2]), limit) : null;
  };
/**
 * Read the Pi extension entry the previous output names (`./src/….ts` from a
 * manifest or a declared-paths table), as an agent would after orienting.
 */
const readEntryPoint =
  (pkg: string) =>
  (outputs: readonly string[]): BenchCall | null => {
    const entry = /\.\/(src\/[\w/-]*extension\.ts)/.exec(outputs.at(-1) ?? "")?.[1];
    return entry ? read(`${pkg}/${entry}`) : null;
  };
/** Inspect the first `path:line:character` a code_resolve answer reports. */
const inspectResolved = (outputs: readonly string[]): BenchCall | null => {
  const hit = /`([\w./@-]+\.\w+):(\d+):(\d+)`/.exec(outputs.at(-1) ?? "");
  return hit
    ? {
        tool: "code_inspect",
        args: { point: { file: hit[1], line: Number(hit[2]), character: Number(hit[3]) } },
      }
    : null;
};
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

const SETTINGS_MODULE_IMPLEMENTATIONS = [
  "supi-agent/src/profile-settings.ts:88-89",
  "supi-code-intelligence/src/config.ts:138",
  "supi-code-intelligence/src/gradle/consent.ts:204",
  "supi-consulting/src/settings.ts:39",
  "supi-core/src/settings/settings-schema.ts:421-422",
  "supi-skills/src/skill-settings.ts:32-33",
  "supi-web/src/settings-registration.ts:43",
  "supi-core/__tests__/unit/settings/settings-registry.test.ts:9-10",
  "supi-settings/__tests__/unit/scoped-settings-list.test.ts:30-31",
  "supi-settings/__tests__/unit/scoped-settings-list.test.ts:151",
  "supi-settings/__tests__/unit/settings-ui.test.ts:36-37",
].map((site) => `packages/${site}`);

/** Callers of the session method `resolve`; `path.resolve` and promise `resolve` share the name. */
const SESSION_RESOLVE_CALLS = [
  "src/tool/code_resolve/execute.ts:17",
  "__tests__/integration/refactor-rename-enrollment.test.ts:35",
  ...[143, 149, 156].map(
    (line) =>
      `__tests__/integration/substrate/lsp/latex-target-public-tool.integration.test.ts:${line}`,
  ),
  ...[381, 403, 408, 411, 530, 558].map(
    (line) => `__tests__/integration/workspace-session-contract.test.ts:${line}`,
  ),
  "__tests__/unit/session/structural-workflow-control.test.ts:110",
].map((site) => `${CI}/${site}`);

/** Calls across packages; mocks, README snippets, and the declaration are not calls. */
const REGISTER_SETTINGS_CALLS = [
  "supi-agent/src/config.ts:53",
  "supi-bash-timeout/src/settings-registration.ts:6",
  "supi-cache/src/settings-registration.ts:12",
  "supi-code-intelligence/src/config.ts:138",
  "supi-code-intelligence/src/gradle/consent.ts:204",
  "supi-code-intelligence/src/substrate/lsp/settings.ts:217",
  "supi-consulting/src/settings.ts:39",
  "supi-context/src/settings-registration.ts:9",
  "supi-core/__tests__/unit/settings/settings-schema.test.ts:280",
  "supi-core/__tests__/unit/settings/settings-schema.test.ts:307",
  "supi-core/__tests__/unit/settings/settings-schema.test.ts:343",
  "supi-debug/src/debug.ts:27",
  "supi-insights/src/insights.ts:80",
  "supi-prompt-improver/src/config.ts:28",
  "supi-prompt-suggestions/src/config/settings.ts:23",
  "supi-review/src/config.ts:124",
  "supi-skills/src/skill-settings.ts:59",
  "supi-web/src/settings-registration.ts:84",
].map((site) => `packages/${site}`);

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
/**
 * Root manifest and workspace package directories at `CORPUS_COMMIT`. The
 * corpus holds no README or workspace file, so these are the entry facts.
 */
const WORKSPACE_PATHS = [
  "package.json",
  ...[
    "agent-runtime",
    "agent",
    "ask-user",
    "bash-timeout",
    "cache",
    "claude-md",
    "code-intelligence",
    "code-runtime",
    "consulting",
    "context",
    "core",
    "debug",
    "extras",
    "insights",
    "installer",
    "lsp",
    "prompt-improver",
    "prompt-suggestions",
    "review",
    "settings",
    "skill-patches",
    "skills",
    "test-utils",
    "tree-sitter",
    "web",
  ].map((name) => `packages/supi-${name}`),
];
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
    category: "graph-references",
    question: "Where is toWorkflowControl used? (default output bounds)",
    native: [grep("\\btoWorkflowControl\\b")],
    code: [{ tool: "code_graph", args: { target: workflowControl } }],
    truth: WORKFLOW_CONTROL_SITES,
    truthText: /toWorkflowControl/,
  },
  {
    id: "refs-unique-all",
    category: "graph-references",
    viewSource: true,
    question: "Where is toWorkflowControl used? (all sites requested)",
    native: [grep("\\btoWorkflowControl\\b")],
    code: [{ tool: "code_graph", args: { target: workflowControl, maxResults: 50 } }],
    truth: WORKFLOW_CONTROL_SITES,
    truthText: /toWorkflowControl/,
  },
  {
    id: "refs-ambiguous",
    category: "graph-references",
    viewSource: true,
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
    truthText: /resultData/,
  },
  {
    id: "refs-ambiguous-unscoped",
    category: "graph-references",
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
    truthText: /resultData/,
  },
  {
    id: "definition-signature",
    category: "resolve-symbol",
    question: "Where is createSessionCache defined and what does it return?",
    native: [grep("function createSessionCache"), readFromGrepHit("packages", 15)],
    code: [
      { tool: "code_resolve", args: { target: { symbol: { query: "createSessionCache" } } } },
      inspectResolved,
    ],
    truth: [`${CI}/src/app/app.ts:57`],
    truthText: /createSessionCache/,
  },
  {
    id: "file-outline-default",
    category: "resolve-file",
    question: "Which top-level declarations does session.ts contain? (default output bounds)",
    native: [grep(SESSION_DECLARATIONS, `${CI}/src/session/session.ts`)],
    code: [{ tool: "code_resolve", args: { target: { file: `${CI}/src/session/session.ts` } } }],
    truth: SESSION_TOP_LEVEL,
    truthText: /^(export )?(class|function) /m,
  },
  {
    id: "file-outline",
    category: "resolve-file",
    question: "Which top-level declarations does session.ts contain?",
    native: [grep(SESSION_DECLARATIONS, `${CI}/src/session/session.ts`)],
    code: [
      {
        tool: "code_resolve",
        args: { target: { file: `${CI}/src/session/session.ts` }, maxResults: 50 },
      },
    ],
    truth: SESSION_TOP_LEVEL,
    truthText: /^(export )?(class|function) /m,
  },
  {
    id: "find-calls",
    category: "find-call",
    viewSource: true,
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
    truthText: /selectDirectoryNavigation\(/,
  },
  {
    id: "find-imports",
    category: "find-import",
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
    category: "orientation-path",
    question: "Where are the entry points and central modules of supi-code-intelligence?",
    native: [ls(CI), ls(`${CI}/src`), read(`${CI}/package.json`)],
    code: [{ tool: "code_orientation", args: { focus: { path: CI } } }],
    truthPaths: PACKAGE_ENTRY_PATHS,
  },
  {
    // Measures the explicit call, as counted in `USAGE_WEIGHTS`; the
    // first-turn Workspace Overview is part of the session context instead.
    id: "orient-workspace",
    category: "orientation-workspace",
    question: "What does this workspace contain and where are its packages?",
    native: [ls("."), ls("packages")],
    code: [{ tool: "code_orientation", args: {} }],
    truthPaths: WORKSPACE_PATHS,
  },
  {
    id: "orient-directory",
    category: "orientation-path",
    question: "Which workflow modules make up src/session?",
    native: [ls(`${CI}/src/session`)],
    code: [{ tool: "code_orientation", args: { focus: { path: `${CI}/src/session` } } }],
    truthPaths: SESSION_WORKFLOW_PATHS,
  },
  {
    id: "callees",
    category: "graph-callees",
    question: "What does registerCodeIntelligenceTools call?",
    // The agent does not know where the function ends; 80 lines is a typical window.
    native: [
      grep("function registerCodeIntelligenceTools", "packages", true),
      readFromGrepHit("packages", 80),
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
    // Direct calls; the nested `execute` callback runs later, not during registration.
    truth: [95, 96, 97, 101].map((line) => `${CI}/src/tool/register.ts:${line}`),
    truthText: /\w\(/,
  },
  {
    id: "implementations",
    category: "graph-implements",
    viewSource: true,
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
    // Object literals typed as SettingsModule, spanning a declared return type
    // to the literal it returns. Contextually typed arguments to
    // registerSettings() count too; typed empty arrays and Partial<> do not.
    truth: SETTINGS_MODULE_IMPLEMENTATIONS,
    truthText: /SettingsModule|registerSettings\(pi, \{/,
  },
  {
    id: "method-callers",
    category: "graph-references",
    viewSource: true,
    question: "Who calls WorkspaceCodeIntelligenceSession.resolve()?",
    // A competent agent greps the receiver naming convention, not bare `.resolve(`.
    native: [grep("session\\.resolve\\(", CI)],
    code: [
      {
        tool: "code_graph",
        args: {
          target: { symbol: { query: "resolve", scope: `${CI}/src/session/session.ts` } },
        },
      },
      (outputs) => {
        const handle = candidateHandle(outputs, "(`Method`)");
        return handle ? { tool: "code_graph", args: { target: { handle } } } : null;
      },
    ],
    truth: SESSION_RESOLVE_CALLS,
    truthText: /\.resolve\(/,
  },
  {
    id: "constant-with-docs",
    category: "graph-references",
    viewSource: true,
    // Expected loss for code_*: semantic references cover code, not Markdown.
    question: "Where is DEFAULT_WORKFLOW_DEADLINE_MS used or documented?",
    native: [grep("\\bDEFAULT_WORKFLOW_DEADLINE_MS\\b", CI)],
    code: [
      {
        tool: "code_graph",
        args: { target: { symbol: { query: "DEFAULT_WORKFLOW_DEADLINE_MS" } } },
      },
    ],
    truth: [
      `${CI}/CLAUDE.md:27`,
      `${CI}/src/tool/infra/workflow-control.ts:16`,
      `${CI}/src/ui/status-command.ts:9`,
      `${CI}/src/ui/status-command.ts:114`,
    ],
    truthText: /DEFAULT_WORKFLOW_DEADLINE_MS/,
  },
  {
    id: "calls-across-packages",
    category: "find-call",
    viewSource: true,
    question: "Where is registerSettings called across packages?",
    native: [grep("\\bregisterSettings\\(")],
    code: [
      {
        tool: "code_find",
        args: { mode: "ast", kind: "call", query: "registerSettings", scope: ["packages"] },
      },
    ],
    truth: REGISTER_SETTINGS_CALLS,
    truthText: /registerSettings\(/,
  },
  {
    id: "find-definition",
    category: "find-definition",
    question: "Where is runGraphWorkflow defined?",
    // biome-ignore lint/security/noSecrets: regex pattern
    native: [grep("(function|class|interface|type|const|let) runGraphWorkflow\\b", `${CI}/src`)],
    code: [
      {
        tool: "code_find",
        args: { mode: "ast", kind: "definition", query: "runGraphWorkflow", scope: [`${CI}/src`] },
      },
    ],
    truth: [`${CI}/src/session/graph-workflow.ts:29`],
    truthText: /function runGraphWorkflow/,
  },
  {
    id: "find-definition-substring",
    category: "find-definition",
    // Name fragments are common in observed queries; grep also matches imports and uses.
    question: "Which *WorkflowDeps declarations exist in src/session?",
    // biome-ignore lint/security/noSecrets: regex pattern
    native: [grep("\\w*WorkflowDeps\\b", `${CI}/src/session`)],
    code: [
      {
        tool: "code_find",
        args: {
          mode: "ast",
          kind: "definition",
          query: "WorkflowDeps",
          scope: [`${CI}/src/session`],
        },
      },
    ],
    truth: [
      "find-workflow.ts:16",
      "graph-workflow.ts:24",
      "health-workflow.ts:46",
      "inspect-workflow.ts:19",
      "orientation-workflow.ts:30",
      "refactor-workflow.ts:48",
      "target-workflow.ts:84",
      "session.ts:389",
      "session.ts:398",
    ].map((site) => `${CI}/src/session/${site}`),
    truthText: /(interface \w*WorkflowDeps|WorkflowDeps\(\) \{)/,
  },
  {
    id: "find-definition-missing",
    category: "find-definition",
    // About a third of observed definition searches return no match; confirming
    // absence has a cost too.
    question: "Where is emitDebug defined? (it does not exist)",
    native: [
      // biome-ignore lint/security/noSecrets: regex pattern
      grep("(function|class|interface|type|const|let) emitDebug\\b", "packages/supi-core/src"),
    ],
    code: [
      {
        tool: "code_find",
        args: {
          mode: "ast",
          kind: "definition",
          query: "emitDebug",
          scope: ["packages/supi-core/src"],
        },
      },
    ],
    truth: [],
  },
  {
    id: "orient-then-read",
    category: "orientation-path",
    // Observed: directory orientation is usually followed by reading a file.
    question: "What does the supi-web extension entry point register?",
    native: [
      ls("packages/supi-web"),
      read("packages/supi-web/package.json"),
      readEntryPoint("packages/supi-web"),
    ],
    code: [
      { tool: "code_orientation", args: { focus: { path: "packages/supi-web" } } },
      readEntryPoint("packages/supi-web"),
    ],
    truth: ["packages/supi-web/src/extension.ts:8"],
    truthText: /registerChildWebToolProvider\(pi\)/,
  },
];
