// Pattern orchestration use-case — bounded, scope-aware text search.
// Coordinates ripgrep literal/regex search and structured tree-sitter search,
// returning fully rendered content + details metadata.

import type { CodeProvider } from "../../analysis/provider.ts";
import {
  getStructuredPatternMatches,
  isStructuredPatternKind,
  type StructuredPatternKind,
} from "../../analysis/search/pattern.ts";
import type { RgMatch } from "../../analysis/search/ripgrep.ts";
import { runRipgrep, runRipgrepDetailed, toDisplayPath } from "../../analysis/search/ripgrep.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import type { CodeQueryParams } from "../params.ts";
import { assembleFindResult } from "../result/find.ts";
import {
  renderPatternResults,
  renderPatternSummary,
  renderRegexError,
  renderStructuredEmptyState,
  renderStructuredMatches,
} from "./markdown.ts";
import { executeSemanticSearch } from "./semantic-search.ts";

export interface PatternInput {
  pattern: string;
  /** One or more resolved search roots. */
  paths?: string[];
  /** Human-readable requested scope label for markdown/details. */
  scopeLabel?: string | null;
  regex?: boolean;
  kind?: string;
  mode?: "text" | "regex" | "ast" | "semantic";
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}

export interface PatternDeps {
  cwd: string;
  provider: CodeProvider | null;
  /** Abort signal forwarded to ripgrep for text/regex modes. */
  signal?: AbortSignal;
}

/** Execute the pattern search use-case. */
export async function executePattern(
  input: PatternInput,
  deps: PatternDeps,
): Promise<CodeIntelResult> {
  if (!input.pattern) {
    return {
      content: "**Error:** `pattern` action requires a `pattern` parameter.",
      details: undefined,
    };
  }

  // Semantic mode — LSP workspace symbol search
  if (input.mode === "semantic") {
    return executeSemanticSearch(input, deps.provider, deps.cwd);
  }

  const maxResults = input.maxResults ?? 8;
  const contextLines = input.contextLines ?? 1;
  const scope = getPatternScope(input, deps.cwd);

  if (isStructuredPatternKind(input.kind)) {
    return executeStructuredSearch(
      input,
      input.kind,
      scope.paths,
      deps.cwd,
      scope.label,
      maxResults,
      deps.provider,
    );
  }

  const matches = input.regex
    ? await getRegexMatches({
        pattern: input.pattern,
        scopePath: scope.paths,
        cwd: deps.cwd,
        maxResults,
        contextLines,
        summary: input.summary,
        signal: deps.signal,
      })
    : await runRipgrep(input.pattern, scope.paths, deps.cwd, {
        contextLines,
        literal: true,
        filterLowSignal: true,
        signal: deps.signal,
      });

  if (typeof matches === "string") {
    return {
      content: matches,
      details: {
        type: "search",
        data: assembleFindResult({
          confidence: "unavailable",
          scope: getDetailScope(input),
          candidateCount: 0,
          nextQueries: ["Fix the regex pattern and retry"],
        }),
      },
    };
  }

  if (matches.length === 0) {
    return formatEmptyResult(input, scope.label);
  }

  const displayMatches = matches.map((m) => ({
    ...m,
    file: toDisplayPath(deps.cwd, m.file),
  }));

  const rendered = input.summary
    ? {
        content: renderPatternSummary(input.pattern, scope.label, displayMatches, maxResults),
        evidenceList: undefined,
      }
    : renderPatternResults(input.pattern, scope.label, displayMatches, maxResults);

  const details = assembleFindResult({
    confidence: "heuristic",
    scope: getDetailScope(input),
    candidateCount: matches.length,
    omittedCount: rendered.evidenceList?.omittedCount ?? 0,
    evidenceLists: rendered.evidenceList ? [rendered.evidenceList] : [],
    nextQueries: input.regex
      ? ["Set `regex: false` for literal matching"]
      : ["Set `regex: true` for regex matching"],
  });
  return { content: rendered.content, details: { type: "search" as const, data: details } };
}

// ── Structured search ────────────────────────────────────────────────

// biome-ignore lint/complexity/useMaxParams: structured-search parameters are clearer as positional when linking input, scope, and substrate
async function executeStructuredSearch(
  input: PatternInput,
  kind: StructuredPatternKind,
  scopePaths: readonly string[],
  cwd: string,
  relScope: string,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<CodeIntelResult> {
  if (!provider) {
    return {
      content: `**Error:** Structured ${kind} search requires tree-sitter, which is not available.`,
      details: undefined,
    };
  }

  const structured = await getStructuredPatternMatches(
    { ...input, pattern: input.pattern, kind },
    scopePaths,
    cwd,
    relScope,
    provider,
  );

  if (typeof structured === "string") {
    return {
      content: structured,
      details: {
        type: "search",
        data: assembleFindResult({
          confidence: "unavailable",
          scope: getDetailScope(input),
          candidateCount: 0,
          nextQueries: ["Fix the regex pattern and retry"],
        }),
      },
    };
  }

  if (!structured || structured.matches.length === 0) {
    const content = renderStructuredEmptyState(
      input.pattern,
      kind,
      relScope,
      provider,
      structured ?? undefined,
    );
    return {
      content,
      details: {
        type: "search",
        data: assembleFindResult({
          confidence: "structural",
          scope: getDetailScope(input),
          candidateCount: 0,
          omittedCount: structured?.omittedCount ?? 0,
          nextQueries: [
            "Try a broader `pattern`, or omit `kind` for plain text search",
            "Narrow `path` if the structured scan was partial",
          ],
        }),
      },
    };
  }

  const rendered = renderStructuredMatches(input.pattern, kind, relScope, structured, maxResults);

  return {
    content: rendered.content,
    details: {
      type: "search",
      data: assembleFindResult({
        confidence: "structural",
        scope: getDetailScope(input),
        candidateCount: structured.matches.length,
        omittedCount: structured.omittedCount + (rendered.evidenceList.omittedCount ?? 0),
        evidenceLists: [rendered.evidenceList],
        nextQueries:
          kind === "call"
            ? [
                "Omit `kind` for plain text matches",
                'Use `code_graph` with `relations: ["references"]` on a resolved target for identity-aware callers',
              ]
            : [
                "Omit `kind` for plain text matches",
                "Widen `scope` or raise `maxResults` for broader coverage",
              ],
      }),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function getPatternScope(input: PatternInput, cwd: string): { paths: string[]; label: string } {
  if (input.paths && input.paths.length > 0) {
    return { paths: input.paths, label: input.scopeLabel ?? input.paths.join(", ") };
  }
  return { paths: [cwd], label: "." };
}

function getDetailScope(input: PatternInput): string | null {
  return input.scopeLabel ?? null;
}

const REGEX_HINT_CHARS = /[|.*+?^${}()[\]\\]/;

function hasRegexChars(pattern: string): boolean {
  return REGEX_HINT_CHARS.test(pattern);
}

function formatEmptyResult(input: PatternInput, relScope: string): CodeIntelResult {
  const emptyDetails = assembleFindResult({
    confidence: "heuristic",
    scope: getDetailScope(input),
    candidateCount: 0,
    nextQueries: input.regex
      ? ["Set `regex: false` for literal matching"]
      : ["Set `regex: true` for regex matching"],
  });
  const hint = input.regex
    ? ""
    : hasRegexChars(input.pattern)
      ? " — pattern contains regex-like characters; set `regex: true` for regex matching"
      : " — set `regex: true` for regex matching";
  return {
    content: `No matches found for \`${input.pattern}\` in \`${relScope}\`${hint}.`,
    details: { type: "search", data: emptyDetails },
  };
}

async function getRegexMatches(options: {
  pattern: string;
  scopePath: string | readonly string[];
  cwd: string;
  maxResults: number;
  contextLines: number;
  summary?: boolean;
  signal?: AbortSignal;
}): Promise<RgMatch[] | string> {
  const result = await runRipgrepDetailed(options.pattern, options.scopePath, options.cwd, {
    contextLines: options.contextLines,
    filterLowSignal: true,
    signal: options.signal,
  });

  if (result.error) {
    return renderRegexError(options.pattern, result.error);
  }

  return result.matches;
}

// ── Test helper wrapper ─────────────────────────────────────────────

/** Prefer {@link executePattern} with the typed PatternInput/PatternDeps interface. */
export async function executePatternAction(
  params: CodeQueryParams,
  cwd: string,
  provider?: CodeProvider | null,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: params.pattern ?? "",
      paths: params.path ? [params.path] : undefined,
      scopeLabel: params.path ?? null,
      regex: params.regex,
      kind: params.kind,
      maxResults: params.maxResults,
      contextLines: params.contextLines,
      summary: params.summary,
    },
    { cwd, provider: provider ?? null },
  );
}
