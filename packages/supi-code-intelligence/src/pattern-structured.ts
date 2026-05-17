import * as fs from "node:fs";
import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import type { ActionParams } from "./tool-actions.ts";

export const STRUCTURED_PATTERN_FILE_CAP = 200;
const STRUCTURED_PATTERN_TIMEOUT_MS = 10_000;

export type StructuredPatternKind = "definition" | "export" | "import";

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
  return kind === "definition" || kind === "export" || kind === "import";
}

export async function getStructuredPatternMatches(
  params: ActionParams & { pattern: string; kind: StructuredPatternKind },
  scopePath: string,
  cwd: string,
  relScope: string,
): Promise<StructuredPatternResult | string | null> {
  const deadline = Date.now() + STRUCTURED_PATTERN_TIMEOUT_MS;
  const collected = collectStructuredFiles(scopePath, deadline);
  if (collected.files.length === 0) {
    return null;
  }

  const matcher = createStructuredMatcher(params.pattern, params.regex ?? false);
  if (typeof matcher === "string") {
    return matcher;
  }

  let tsSession: ReturnType<typeof createTreeSitterSession> | null = null;
  try {
    tsSession = createTreeSitterSession(cwd);
    const matches: StructuredMatch[] = [];
    let timedOut = collected.timedOut;

    for (const [index, file] of collected.files.entries()) {
      if (Date.now() > deadline) {
        collected.omittedCount += collected.files.length - index;
        timedOut = true;
        break;
      }
      const relFile = path.relative(cwd, file);
      await collectMatchesForFile(matches, tsSession, relFile, params.kind, matcher);
    }

    return {
      matches,
      omittedCount: timedOut ? Math.max(1, collected.omittedCount) : collected.omittedCount,
      partialReason: timedOut ? "timeout" : collected.omittedCount > 0 ? "file-cap" : null,
    };
  } catch {
    return `No structured ${params.kind} search data available in \`${relScope}\`. Try omitting \`kind\` for plain text search.`;
  } finally {
    tsSession?.dispose();
  }
}

// biome-ignore lint/complexity/useMaxParams: helper takes explicit collection inputs to avoid intermediate objects in the hot path
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: kind-specific tree-sitter matching is clearest as one helper
async function collectMatchesForFile(
  matches: StructuredMatch[],
  tsSession: ReturnType<typeof createTreeSitterSession>,
  relFile: string,
  kind: StructuredPatternKind,
  matcher: (value: string) => boolean,
): Promise<void> {
  if (kind === "definition") {
    const outline = await tsSession.outline(relFile);
    if (outline.kind !== "success") return;
    for (const item of outline.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.range.startLine });
    }
    return;
  }

  if (kind === "export") {
    const exportsResult = await tsSession.exports(relFile);
    if (exportsResult.kind !== "success") return;
    for (const item of exportsResult.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.range.startLine });
    }
    return;
  }

  const importsResult = await tsSession.imports(relFile);
  if (importsResult.kind !== "success") return;
  for (const item of importsResult.data) {
    if (!matcher(item.moduleSpecifier)) continue;
    matches.push({
      file: relFile,
      name: item.moduleSpecifier,
      kind: "import",
      line: item.range.startLine,
    });
  }
}

function collectStructuredFiles(
  scopePath: string,
  deadline: number,
): { files: string[]; omittedCount: number; timedOut: boolean } {
  const files: string[] = [];
  let omittedCount = 0;
  let timedOut = false;
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: timeout, file, and directory branches stay adjacent for predictable short-circuiting
  function walk(currentPath: string) {
    if (timedOut) return;
    if (Date.now() > deadline) {
      timedOut = true;
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(currentPath);
    } catch {
      return;
    }

    if (stat.isFile()) {
      if (isStructuredFile(currentPath)) {
        if (files.length < STRUCTURED_PATTERN_FILE_CAP) {
          files.push(currentPath);
        } else {
          omittedCount++;
        }
      }
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      walk(path.join(currentPath, entry.name));
      if (timedOut) return;
    }
  }

  walk(scopePath);
  return { files: files.sort((a, b) => a.localeCompare(b)), omittedCount, timedOut };
}

function isStructuredFile(file: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].includes(
    path.extname(file),
  );
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
