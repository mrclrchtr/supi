import * as path from "node:path";
import type { StructuralProvider as StructuralSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import { collectCallSitesInFile } from "./analysis/relations/call-sites.ts";
import type { CodeQueryParams as ActionParams } from "./query-params.ts";
import { runRipgrep } from "./search-helpers.ts";

/** Ripgrep text-match file cap — backstop for degenerate queries that match thousands of files. */
const RG_PREFILTER_FILE_CAP = 5000;
const STRUCTURED_PATTERN_TIMEOUT_MS = 10_000;

export type StructuredPatternKind = "definition" | "export" | "import" | "call" | "type" | "test";

export interface StructuredMatch {
  file: string;
  name: string;
  kind: string;
  line: number;
}

export interface StructuredPatternResult {
  matches: StructuredMatch[];
  omittedCount: number;
  partialReason: "file-cap" | "timeout" | null;
}

export function isStructuredPatternKind(kind: string | undefined): kind is StructuredPatternKind {
  return (
    kind === "definition" ||
    kind === "export" ||
    kind === "import" ||
    kind === "call" ||
    kind === "type" ||
    kind === "test"
  );
}

// biome-ignore lint/complexity/useMaxParams: substrate injection keeps related inputs explicit for readability
export async function getStructuredPatternMatches(
  params: ActionParams & { pattern: string; kind: StructuredPatternKind },
  scopePath: string,
  cwd: string,
  relScope: string,
  structural: StructuralSubstrate,
): Promise<StructuredPatternResult | string | null> {
  const deadline = Date.now() + STRUCTURED_PATTERN_TIMEOUT_MS;

  // Ripgrep pre-filter: find candidate files by text match, then tree-sitter only those.
  // This avoids a filesystem walk + cap that silently truncates on repos with >200 source files.
  const literal = !(params.regex ?? false);
  const rgMatches = runRipgrep(params.pattern, scopePath, cwd, {
    literal,
    filterLowSignal: true,
  });

  // Deduplicate files and sort for stable processing order.
  const candidateFiles = [...new Set(rgMatches.map((m) => m.file))].sort((a, b) =>
    a.localeCompare(b),
  );

  if (candidateFiles.length === 0) {
    return {
      matches: [],
      omittedCount: 0,
      partialReason: null,
    };
  }

  let omittedCount = 0;
  const capped = candidateFiles.slice(0, RG_PREFILTER_FILE_CAP);
  if (candidateFiles.length > RG_PREFILTER_FILE_CAP) {
    omittedCount = candidateFiles.length - RG_PREFILTER_FILE_CAP;
  }

  const matcher = createStructuredMatcher(params.pattern, params.regex ?? false);
  if (typeof matcher === "string") {
    return matcher;
  }

  try {
    const matches: StructuredMatch[] = [];
    let timedOut = false;

    for (const [index, file] of capped.entries()) {
      if (Date.now() > deadline) {
        omittedCount += capped.length - index;
        timedOut = true;
        break;
      }
      const absFile = path.resolve(cwd, file);
      const relFile = path.relative(cwd, absFile);
      await collectMatchesForFile(matches, structural, absFile, relFile, params.kind, matcher);
    }

    return {
      matches,
      omittedCount: timedOut ? Math.max(1, omittedCount) : omittedCount,
      partialReason: timedOut ? "timeout" : omittedCount > 0 ? "file-cap" : null,
    };
  } catch {
    return `No structured ${params.kind} search data available in \`${relScope}\`. Try omitting \`kind\` for plain text search.`;
  }
}

// biome-ignore lint/complexity/useMaxParams: helper takes explicit collection inputs to avoid intermediate objects in the hot path
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: kind-specific tree-sitter matching is clearest as one helper
async function collectMatchesForFile(
  matches: StructuredMatch[],
  structural: StructuralSubstrate,
  absFile: string,
  relFile: string,
  kind: StructuredPatternKind,
  matcher: (value: string) => boolean,
): Promise<void> {
  if (kind === "definition") {
    const outline = await structural.outline(relFile);
    if (outline.kind !== "success") return;
    for (const item of outline.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "export") {
    const exportsResult = await structural.exports(relFile);
    if (exportsResult.kind !== "success") return;
    for (const item of exportsResult.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "import") {
    const importsResult = await structural.imports(relFile);
    if (importsResult.kind !== "success") return;
    for (const item of importsResult.data) {
      if (!matcher(item.moduleSpecifier)) continue;
      matches.push({
        file: relFile,
        name: item.moduleSpecifier,
        kind: "import",
        line: item.startLine,
      });
    }
    return;
  }

  // ── call — ripgrep-based call-site matching ────────────────────────

  if (kind === "call") {
    const callSites = collectCallSitesInFile(absFile, matcher);
    for (const cs of callSites) {
      matches.push({ file: relFile, name: cs.name, kind: "call", line: cs.line });
    }
    return;
  }

  // ── type / test — use outline with kind-specific filters ────────────

  if (kind === "type" || kind === "test") {
    const outline = await structural.outline(relFile);
    if (outline.kind !== "success") return;
    for (const item of outline.data) {
      if (kind === "type" && !isTypeLikeKind(item.kind)) continue;
      if (kind === "test") {
        // Match by name: test functions, describe/it blocks, or files with test/spec in name
        const isTestName =
          /^(test|it|describe|spec)\b/.test(item.name) ||
          /\b(test|spec|Test|Spec)\b/.test(item.name);
        if (!isTestName && !matcher(item.name)) continue;
      }
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
  }
}

/** Outline kind values that represent type declarations (as normalized by the outline extractor). */
const TYPE_LIKE_KINDS = new Set(["class", "interface", "type", "enum"]);

function isTypeLikeKind(kind: string): boolean {
  return TYPE_LIKE_KINDS.has(kind);
}

function createStructuredMatcher(
  pattern: string,
  regex: boolean,
): ((value: string) => boolean) | string {
  const ignoreCase = !/[A-Z]/.test(pattern);

  if (regex) {
    try {
      const compiled = new RegExp(pattern, ignoreCase ? "i" : undefined);
      return (value: string) => compiled.test(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid regex";
      return `**Error:** Invalid regex pattern \`${pattern}\`: ${message}`;
    }
  }

  const needle = ignoreCase ? pattern.toLowerCase() : pattern;
  return (value: string) => {
    const haystack = ignoreCase ? value.toLowerCase() : value;
    return haystack.includes(needle);
  };
}
