// Pattern orchestration use-case — bounded, scope-aware text search.
// Coordinates ripgrep literal/regex search and structured tree-sitter search,
// returning fully rendered content + details metadata.

import type { CodeProvider } from "../analysis/context/request-context.ts";
import {
  getStructuredPatternMatches,
  isStructuredPatternKind,
  type StructuredPatternKind,
} from "../pattern-structured.ts";
import {
  renderPatternResults,
  renderPatternSummary,
  renderRegexError,
  renderStructuredEmptyState,
  renderStructuredMatches,
} from "../presentation/markdown/pattern.ts";
import type { CodeQueryParams } from "../query-params.ts";
import type { RgMatch } from "../search-helpers.ts";
import { normalizePath, runRipgrep, runRipgrepDetailed, toDisplayPath } from "../search-helpers.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

export interface PatternInput {
  pattern: string;
  path?: string;
  regex?: boolean;
  kind?: string;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}

export interface PatternDeps {
  cwd: string;
  provider: CodeProvider | null;
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

  const maxResults = input.maxResults ?? 8;
  const contextLines = input.contextLines ?? 1;
  const scopePath = input.path ? normalizePath(input.path, deps.cwd) : deps.cwd;
  const relScope = input.path ?? ".";

  if (isStructuredPatternKind(input.kind)) {
    return executeStructuredSearch(
      input,
      input.kind,
      scopePath,
      deps.cwd,
      relScope,
      maxResults,
      deps.provider,
    );
  }

  const matches = input.regex
    ? getRegexMatches({
        pattern: input.pattern,
        scopePath,
        cwd: deps.cwd,
        maxResults,
        contextLines,
        summary: input.summary,
      })
    : runRipgrep(input.pattern, scopePath, deps.cwd, {
        maxMatches: input.summary ? undefined : maxResults * 3,
        contextLines,
        literal: true,
        filterLowSignal: true,
      });

  if (typeof matches === "string") {
    const errorDetails: SearchDetails = {
      confidence: "unavailable",
      scope: input.path ?? null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: ["Fix the regex pattern and retry"],
    };
    return { content: matches, details: { type: "search", data: errorDetails } };
  }

  if (matches.length === 0) {
    return formatEmptyResult(input, relScope);
  }

  const displayMatches = matches.map((m) => ({
    ...m,
    file: toDisplayPath(deps.cwd, m.file),
  }));

  const content = input.summary
    ? renderPatternSummary(input.pattern, relScope, displayMatches, maxResults)
    : renderPatternResults(input.pattern, relScope, displayMatches, maxResults);

  const details: SearchDetails = {
    confidence: "heuristic",
    scope: input.path ?? null,
    candidateCount: matches.length,
    omittedCount: 0,
    nextQueries: input.regex
      ? ["Set `regex: false` for literal matching"]
      : ["Set `regex: true` for regex matching"],
  };
  return { content, details: { type: "search" as const, data: details } };
}

// ── Structured search ────────────────────────────────────────────────

// biome-ignore lint/complexity/useMaxParams: structured-search parameters are clearer as positional when linking input, scope, and substrate
async function executeStructuredSearch(
  input: PatternInput,
  kind: StructuredPatternKind,
  scopePath: string,
  cwd: string,
  relScope: string,
  _maxResults: number,
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
    scopePath,
    cwd,
    relScope,
    provider,
  );

  if (typeof structured === "string") {
    const errorDetails: SearchDetails = {
      confidence: "unavailable",
      scope: input.path ?? null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: ["Fix the regex pattern and retry"],
    };
    return { content: structured, details: { type: "search", data: errorDetails } };
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
        data: {
          confidence: "structural",
          scope: input.path ?? null,
          candidateCount: 0,
          omittedCount: structured?.omittedCount ?? 0,
          nextQueries: [
            "Try a broader `pattern`, or omit `kind` for plain text search",
            "Narrow `path` if the structured scan was partial",
          ],
        },
      },
    };
  }

  return {
    content: renderStructuredMatches(input.pattern, kind, relScope, structured),
    details: {
      type: "search",
      data: {
        confidence: "structural",
        scope: input.path ?? null,
        candidateCount: structured.matches.length,
        omittedCount: structured.omittedCount,
        nextQueries: [
          "Omit `kind` for plain text matches",
          "Use `summary: true` for broader textual distribution",
        ],
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

const REGEX_HINT_CHARS = /[|.*+?^${}()[\]\\]/;

function hasRegexChars(pattern: string): boolean {
  return REGEX_HINT_CHARS.test(pattern);
}

function formatEmptyResult(input: PatternInput, relScope: string): CodeIntelResult {
  const emptyDetails: SearchDetails = {
    confidence: "heuristic",
    scope: input.path ?? null,
    candidateCount: 0,
    omittedCount: 0,
    nextQueries: input.regex
      ? ["Set `regex: false` for literal matching"]
      : ["Set `regex: true` for regex matching"],
  };
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

function getRegexMatches(options: {
  pattern: string;
  scopePath: string;
  cwd: string;
  maxResults: number;
  contextLines: number;
  summary?: boolean;
}): RgMatch[] | string {
  const result = runRipgrepDetailed(options.pattern, options.scopePath, options.cwd, {
    maxMatches: options.summary ? undefined : options.maxResults * 3,
    contextLines: options.contextLines,
    filterLowSignal: true,
  });

  if (result.error) {
    return renderRegexError(options.pattern, result.error);
  }

  return result.matches;
}

// ── Backward-compatible wrapper for test migrations ────────────────

/**
 * Backward-compatible wrapper for tests that call the old (params, cwd) signature.
 * Prefer {@link executePattern} with the typed PatternInput/PatternDeps interface.
 */
export async function executePatternAction(
  params: CodeQueryParams,
  cwd: string,
  provider?: CodeProvider | null,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: params.pattern ?? "",
      path: params.path,
      regex: params.regex,
      kind: params.kind,
      maxResults: params.maxResults,
      contextLines: params.contextLines,
      summary: params.summary,
    },
    { cwd, provider: provider ?? null },
  );
}
