import * as fs from "node:fs";
import * as path from "node:path";

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "tmp",
  ".pnpm",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".rb",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
]);

/** Simple recursive text search in project source files. */
export function fallbackGrep(projectRoot: string, query: string): GrepMatch[] {
  const results: GrepMatch[] = [];
  walk(projectRoot, projectRoot, query, results);
  return results;
}

function walk(dir: string, projectRoot: string, query: string, results: GrepMatch[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), projectRoot, query, results);
      }
      continue;
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    const filePath = path.join(dir, entry.name);
    searchFile(filePath, projectRoot, query, results);
    if (results.length >= 20) return;
  }
}

function searchFile(
  filePath: string,
  projectRoot: string,
  query: string,
  results: GrepMatch[],
): void {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(query)) {
      results.push({
        file: path.relative(projectRoot, filePath),
        line: i + 1,
        text: lines[i].trim(),
      });
      if (results.length >= 20) return;
    }
  }
}
